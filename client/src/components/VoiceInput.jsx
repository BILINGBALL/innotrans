import { useEffect, useRef, useState } from 'react';
import { getSpeechWsUrl } from '../api';

// 双向流式语音识别组件
// - 录音开始：调用 onStart()
// - 实时识别：调用 onText(text)，text 为本次识别的完整文本（已固化 + 临时）
// - 录音结束：最后一次 onText(finalText) 后调用
// 父组件应记录录音开始时的"基底"文本，每次 onText 时用 (基底 + ' ' + text) 覆盖表单字段
//
// 健壮性设计：
// 1. 录音超时自动停止（MAX_RECORD_MS），防止长时间占用导致服务端断连
// 2. 组件卸载时清理所有资源（AudioContext/Stream/WS）
// 3. 启动中状态防重复点击
// 4. 后端断连/错误时前端能感知并提示
// 5. 所有 WebSocket send 都有 readyState 检查

const MAX_RECORD_MS = 60_000; // 最大录音时长 60 秒

export default function VoiceInput({ onText, onStart }) {
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false); // 启动中（getUserMedia + 建连期间）
  const [error, setError] = useState('');
  // recording 的 ref，避免闭包陷阱（超时回调、ws 事件回调里读到旧值）
  const recordingRef = useRef(false);
  const startingRef = useRef(false);
  const setRecordingBoth = (v) => { recordingRef.current = v; setRecording(v); };
  const setStartingBoth = (v) => { startingRef.current = v; setStarting(v); };

  // refs 持有跨渲染稳定的资源
  const wsRef = useRef(null);
  const audioCtxRef = useRef(null);
  const streamRef = useRef(null);
  const nodeRef = useRef(null);

  // 已固化的分句文本 + 当前未固化的临时文本
  const committedRef = useRef('');
  const pendingRef = useRef('');
  // 后端是否已 ready（火山连接已建立），未 ready 时缓存 PCM
  const asrReadyRef = useRef(false);
  const pcmQueueRef = useRef([]);
  // 录音超时定时器
  const timeoutRef = useRef(null);
  // 防止重复清理
  const cleanedRef = useRef(false);

  const cleanup = () => {
    if (cleanedRef.current) return;
    cleanedRef.current = true;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (nodeRef.current) {
      try { nodeRef.current.port.postMessage({ type: 'stop' }); } catch (e) {}
      try { nodeRef.current.disconnect(); } catch (e) {}
      nodeRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch (e) {}
      audioCtxRef.current = null;
    }
    const ws = wsRef.current;
    if (ws) {
      try {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      } catch (e) {}
      wsRef.current = null;
    }
    asrReadyRef.current = false;
    pcmQueueRef.current = [];
  };

  // 组件卸载时清理所有资源
  useEffect(() => {
    return () => cleanup();
  }, []);

  const flushText = () => {
    const full = (committedRef.current + ' ' + pendingRef.current).trim();
    if (onText && full) onText(full);
  };

  const start = async () => {
    if (recordingRef.current || startingRef.current) return; // 防重复启动

    setStartingBoth(true);
    setError('');
    cleanedRef.current = false;
    committedRef.current = '';
    pendingRef.current = '';
    asrReadyRef.current = false;
    pcmQueueRef.current = [];

    try {
      // 1. 获取麦克风 + 建立 AudioContext
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;

      // 2. 加载 AudioWorklet
      await ctx.audioWorklet.addModule(new URL('../workers/asr-worklet.js', import.meta.url));

      const source = ctx.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(ctx, 'asr-processor');
      nodeRef.current = node;

      // 3. worklet -> 主线程 -> WebSocket
      // 未 ready 时缓存 PCM，ready 后冲队列 + 直发
      node.port.onmessage = (e) => {
        const ws = wsRef.current;
        if (asrReadyRef.current && ws && ws.readyState === WebSocket.OPEN) {
          ws.send(e.data); // ArrayBuffer (PCM)
        } else {
          pcmQueueRef.current.push(e.data);
        }
      };

      source.connect(node);
      node.connect(ctx.destination); // 必须 connect 才会触发 process

      // 4. 建立 WebSocket 连接
      const ws = new WebSocket(getSpeechWsUrl());
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => {
        setStartingBoth(false);
        // 发送 start，等后端 ready 后再视为录音中
        try {
          ws.send(JSON.stringify({ type: 'start' }));
        } catch (e) {
          setError('语音识别连接失败');
          cleanup();
        }
      };

      ws.onmessage = (event) => {
        if (typeof event.data !== 'string') return; // 忽略非文本
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch (e) {
          return;
        }
        if (msg.type === 'ready') {
          // 火山已建连，冲出缓存的 PCM，后续直发
          asrReadyRef.current = true;
          const w = wsRef.current;
          while (pcmQueueRef.current.length > 0 && w && w.readyState === WebSocket.OPEN) {
            w.send(pcmQueueRef.current.shift());
          }
          if (onStart) onStart();
          setRecordingBoth(true);
          // 启动录音超时定时器，避免长时间占用导致服务端断连
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          timeoutRef.current = setTimeout(() => {
            if (!recordingRef.current) return;
            // 超时自动发 stop，走正常结束流程
            const node = nodeRef.current;
            if (node) { try { node.port.postMessage({ type: 'stop' }); } catch (e) {} }
            const w = wsRef.current;
            if (w && w.readyState === WebSocket.OPEN) {
              try { w.send(JSON.stringify({ type: 'stop' })); } catch (e) {}
            }
            setRecordingBoth(false);
          }, MAX_RECORD_MS);
        } else if (msg.type === 'text') {
          // 火山返回识别结果
          if (msg.isFinal) {
            committedRef.current = msg.text;
            pendingRef.current = '';
          } else {
            if (committedRef.current && msg.text.startsWith(committedRef.current)) {
              pendingRef.current = msg.text.slice(committedRef.current.length).trimStart();
            } else {
              pendingRef.current = msg.text;
            }
          }
          const full = (committedRef.current + ' ' + pendingRef.current).trim();
          if (onText) onText(full);
        } else if (msg.type === 'done') {
          // 火山连接结束，发送最后一次结果
          flushText();
          setRecordingBoth(false);
          cleanup();
        } else if (msg.type === 'error') {
          setError(msg.message || '语音识别失败');
          setRecordingBoth(false);
          cleanup();
        }
      };

      ws.onerror = () => {
        setError('语音识别连接失败');
        setStartingBoth(false);
        setRecordingBoth(false);
        cleanup();
      };

      ws.onclose = () => {
        // 意外断连（非用户主动 stop 触发的 done 流程）
        if (recordingRef.current || startingRef.current) {
          setError('语音识别连接断开');
          flushText();
        }
        setStartingBoth(false);
        setRecordingBoth(false);
        cleanup();
      };
    } catch (e) {
      setError('无法访问麦克风，请检查权限（需 HTTPS 或 localhost）');
      setStartingBoth(false);
      cleanup();
    }
  };

  const stop = () => {
    if (!recordingRef.current) return;
    // 通知 worklet 冲出剩余样本
    const node = nodeRef.current;
    if (node) {
      try { node.port.postMessage({ type: 'stop' }); } catch (e) {}
    }
    // 发送 stop 给后端，后端转发结束帧给火山
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify({ type: 'stop' })); } catch (e) {}
    }
    // 按钮立即切回，等待 done 消息后清理
    setRecordingBoth(false);
  };

  const busy = recording || starting;

  return (
    <div className="voice">
      <button
        type="button"
        className={`btn btn-outline btn-sm ${recording ? 'btn-recording' : ''}`}
        onClick={busy ? stop : start}
        disabled={starting}
      >
        {starting ? '⟳ 连接中…' : recording ? '⏹ 停止录音' : '🎤 语音输入'}
      </button>
      {error && <span className="voice-error">{error}</span>}
    </div>
  );
}
