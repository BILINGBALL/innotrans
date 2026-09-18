const express = require('express');
const crypto = require('crypto');
const WebSocket = require('ws');

const router = express.Router();

const APP_ID = process.env.VOLC_ASR_APP_ID;
const ACCESS_TOKEN = process.env.VOLC_ASR_ACCESS_TOKEN;
const RESOURCE_ID = process.env.VOLC_ASR_RESOURCE_ID || 'volc.seedasr.sauc.duration';
// 豆包流式语音识别模型 2.0：双向流式优化版
const WS_URL = process.env.VOLC_ASR_ENDPOINT || 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async';

// WAV → 原始 PCM（剥离 WAV 头，定位 data chunk）—— 仅供旧 /recognize HTTP 入口使用
function wavToPcm(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF') return buf;
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === 'data') return buf.subarray(off + 8, off + 8 + size);
    off += 8 + size + (size % 2);
  }
  return buf.subarray(44);
}

// 二进制分帧：header(4B) + size(4B 大端) + payload
function frame(header, payload) {
  const size = Buffer.alloc(4);
  size.writeUInt32BE(payload.length, 0);
  return Buffer.concat([Buffer.from(header), size, payload]);
}

// 从识别结果 JSON 中提取文本（result.text 优先，其次 utterances）
function extractText(json) {
  const r = json && json.result;
  if (!r) return '';
  if (typeof r === 'string') return r;
  if (typeof r.text === 'string') return r.text;
  const us = r.utterances;
  if (Array.isArray(us)) return us.map((u) => (u && u.text) || '').join('');
  return '';
}

// 判断是否包含已固化的分句（utterances 中存在 definite=true）
function hasDefiniteUtterance(json) {
  const us = json && json.result && json.result.utterances;
  return Array.isArray(us) && us.some((u) => u && u.definite);
}

// 成功码：0 / 1000 / 3000，其余为业务错误
function isSuccessCode(code) {
  return code === 0 || code === 1000 || code === 3000;
}

// 解析火山返回的二进制消息帧，提取 JSON；解析失败返回 null
function parseAsrMessage(data) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  if (buf.length < 12) return null;
  const msgType = (buf[1] >> 4) & 0x0f;
  const flags = buf[1] & 0x0f;
  const raw = buf.subarray(12);
  const s = raw.indexOf(0x7b); // '{'
  if (s === -1) return { msgType, flags, json: null };
  let json;
  try {
    json = JSON.parse(raw.subarray(s).toString('utf8'));
  } catch (e) {
    return { msgType, flags, json: null };
  }
  return { msgType, flags, json };
}

// 建连火山 ASR，返回控制器对象
// onReady() 火山连接已建立并已发送开始帧，可开始发 PCM
// onResult(text, isFinal) 识别结果回调
// onClose() 火山连接关闭回调
// onError(message) 错误回调
function connectAsr({ onReady, onResult, onClose, onError } = {}) {
  const reqid = crypto.randomUUID();
  const connectId = crypto.randomUUID();
  let closed = false;
  let ready = false; // 火山 ws 是否已 open 并发完开始帧
  const pendingQueue = []; // open 前缓存的帧

  const ws = new WebSocket(WS_URL, {
    perMessageDeflate: false,
    headers: {
      'X-Api-App-Key': APP_ID,
      'X-Api-Access-Key': ACCESS_TOKEN,
      'X-Api-Resource-Id': RESOURCE_ID,
      'X-Api-Request-Id': reqid,
      'X-Api-Connect-Id': connectId,
      'X-Api-Sequence': '-1',
    },
  });

  const safeClose = () => {
    if (closed) return;
    closed = true;
    pendingQueue.length = 0;
    try { ws.close(); } catch (e) {}
  };

  ws.on('open', () => {
    const cfg = JSON.stringify({
      user: { uid: 'innotrans' },
      audio: { format: 'pcm', rate: 16000, channel: 1, bits: 16 },
      request: {
        model_name: 'bigmodel',
        reqid,
        enable_nonstream: true, // 开启二遍识别，分句结束时返回 definite=true
        show_utterances: true,
        result_type: 'full',
      },
    });
    // 开始帧（Full Client JSON）
    ws.send(frame([0x11, 0x10, 0x10, 0x00], Buffer.from(cfg, 'utf8')));
    ready = true;
    // 冲出 open 前缓存的帧
    while (pendingQueue.length > 0 && ws.readyState === WebSocket.OPEN) {
      ws.send(pendingQueue.shift());
    }
    if (onReady) onReady();
  });

  ws.on('message', (data) => {
    const msg = parseAsrMessage(data);
    if (!msg) return;
    const { msgType, flags, json } = msg;
    if (!json) return;

    // 错误帧
    if (msgType === 0b1111) {
      if (onError) onError(json.message || '语音识别失败');
      return;
    }
    // 业务错误码
    if (json.code != null && !isSuccessCode(json.code)) {
      if (onError) onError(json.message || '语音识别失败');
      return;
    }

    // 识别结果帧（FullServer）
    if (msgType === 0b1001) {
      const text = extractText(json);
      if (!text) return;
      const isFinal = hasDefiniteUtterance(json);
      if (onResult) onResult(text, isFinal);
    }
  });

  ws.on('error', (e) => {
    console.error('[ASR] 火山连接错误:', e && e.message ? e.message : e);
    if (onError) onError(e && e.message ? e.message : '语音识别连接错误');
  });

  ws.on('close', (code, reason) => {
    console.error(`[ASR] 火山连接关闭 code=${code} reason=${reason ? reason.toString() : ''}`);
    if (onClose) onClose();
  });

  // 发送一块 PCM（自动按 3200 字节切块；未 open 时入队列，open 后冲队列）
  function sendPcm(pcmBuf) {
    if (closed) return;
    const CHUNK = 3200;
    for (let i = 0; i < pcmBuf.length; i += CHUNK) {
      const f = frame([0x11, 0x20, 0x00, 0x00], pcmBuf.subarray(i, i + CHUNK));
      if (ready && ws.readyState === WebSocket.OPEN) {
        ws.send(f);
      } else {
        pendingQueue.push(f);
      }
    }
  }

  // 发送结束帧（空 payload + flags=0b0010 表示最后一负包）
  function sendEnd() {
    if (closed) return;
    const f = frame([0x11, 0x22, 0x00, 0x00], Buffer.alloc(0));
    if (ready && ws.readyState === WebSocket.OPEN) {
      ws.send(f);
    } else {
      pendingQueue.push(f);
    }
  }

  return { sendPcm, sendEnd, close: safeClose };
}

// ============ 旧 HTTP 入口（保留向后兼容） ============
function recognizePcm(pcm) {
  return new Promise((resolve, reject) => {
    let finalText = '';
    let sawResult = false;
    let settled = false;

    const ctrl = connectAsr({
      onReady: () => {
        // 连接建立并已发开始帧，立即一次性发完整 PCM + 结束帧
        ctrl.sendPcm(pcm);
        ctrl.sendEnd();
      },
      onResult: (text, isFinal) => {
        finalText = text;
        sawResult = true;
        if (isFinal) {
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            ctrl.close();
            resolve(finalText);
          }
        }
      },
      onError: (msg) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(new Error(msg));
        }
      },
      onClose: () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          if (sawResult) resolve(finalText);
          else reject(new Error('语音识别失败，请重试'));
        }
      },
    });

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      ctrl.close();
      reject(new Error('语音识别超时，请重试'));
    }, 20000);
  });
}

router.post('/recognize', async (req, res) => {
  try {
    const { audio } = req.body || {};
    if (!audio || typeof audio !== 'string') {
      return res.status(400).json({ error: '缺少音频数据' });
    }
    const pcm = wavToPcm(Buffer.from(audio, 'base64'));
    const text = await recognizePcm(pcm);
    res.json({ text });
  } catch (err) {
    console.error('语音识别失败:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============ 新：WebSocket 中继（边说边出字） ============
function attachSpeechWebSocket(wss) {
  wss.on('connection', (clientWs) => {
    let asr = null; // 火山 ASR 控制器
    let clientClosed = false;

    const safeSend = (obj) => {
      if (clientClosed || clientWs.readyState !== clientWs.OPEN) return;
      clientWs.send(JSON.stringify(obj));
    };

    clientWs.on('message', (data, isBinary) => {
      // 二进制帧 = PCM chunk
      if (isBinary) {
        if (asr) {
          try { asr.sendPcm(Buffer.from(data)); } catch (e) {}
        }
        return;
      }
      // 文本帧 = 控制消息
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch (e) {
        return;
      }
      if (msg.type === 'start') {
        if (asr) {
          try { asr.close(); } catch (e) {}
          asr = null;
        }
        asr = connectAsr({
          onReady: () => safeSend({ type: 'ready' }),
          onResult: (text, isFinal) => safeSend({ type: 'text', text, isFinal }),
          onClose: () => safeSend({ type: 'done' }),
          onError: (message) => safeSend({ type: 'error', message }),
        });
      } else if (msg.type === 'stop') {
        if (asr) asr.sendEnd();
      }
    });

    clientWs.on('close', () => {
      clientClosed = true;
      if (asr) {
        try { asr.close(); } catch (e) {}
        asr = null;
      }
    });

    clientWs.on('error', () => {
      clientClosed = true;
      if (asr) {
        try { asr.close(); } catch (e) {}
        asr = null;
      }
    });
  });
}

router.attachSpeechWebSocket = attachSpeechWebSocket;

module.exports = router;
