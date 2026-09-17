import { useRef, useState } from 'react';
import { recognizeSpeech } from '../api';

function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

// 把 AudioBuffer 编码为 16bit 单声道 PCM WAV
function encodeWav(audioBuffer) {
  const numCh = 1;
  const rate = audioBuffer.sampleRate;
  const samples = audioBuffer.getChannelData(0);
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buf);
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * numCh * 2, true);
  view.setUint16(32, numCh * 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return buf;
}

function bufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export default function VoiceInput({ onText }) {
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  const start = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream);
      const chunks = [];
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size) chunks.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        try {
          setProcessing(true);
          const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
          const ab = await blob.arrayBuffer();
          const Ctx = window.AudioContext || window.webkitAudioContext;
          const ctx = new Ctx();
          const decoded = await ctx.decodeAudioData(ab);
          // 重采样到 16kHz
          const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
          const src = off.createBufferSource();
          src.buffer = decoded;
          src.connect(off.destination);
          src.start();
          const resampled = await off.startRendering();
          const base64 = bufferToBase64(encodeWav(resampled));
          const { text } = await recognizeSpeech(base64);
          if (text) onText(text);
        } catch (e) {
          setError('语音识别失败，请重试');
        } finally {
          setProcessing(false);
        }
      };
      recorderRef.current = mr;
      mr.start();
      setRecording(true);
    } catch (e) {
      setError('无法访问麦克风，请检查权限（需 HTTPS 或 localhost）');
    }
  };

  const stop = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    setRecording(false);
  };

  return (
    <div className="voice">
      <button
        type="button"
        className={`btn btn-outline btn-sm ${recording ? 'btn-recording' : ''}`}
        onClick={recording ? stop : start}
        disabled={processing}
      >
        {processing ? '识别中…' : recording ? '⏹ 停止录音' : '🎤 语音输入'}
      </button>
      {error && <span className="voice-error">{error}</span>}
    </div>
  );
}
