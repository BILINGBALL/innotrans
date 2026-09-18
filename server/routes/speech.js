const express = require('express');
const crypto = require('crypto');
const WebSocket = require('ws');

const router = express.Router();

const APP_ID = process.env.VOLC_ASR_APP_ID;
const ACCESS_TOKEN = process.env.VOLC_ASR_ACCESS_TOKEN;
const RESOURCE_ID = process.env.VOLC_ASR_RESOURCE_ID || 'volc.seedasr.sauc.duration';
// 豆包流式语音识别模型 2.0：非流式（录完再识别）
const WS_URL = process.env.VOLC_ASR_ENDPOINT || 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_nostream';

// WAV → 原始 PCM（剥离 WAV 头，定位 data chunk）
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

// 成功码：0 / 1000 / 3000，其余为业务错误
function isSuccessCode(code) {
  return code === 0 || code === 1000 || code === 3000;
}

function recognizePcm(pcm) {
  return new Promise((resolve, reject) => {
    const reqid = crypto.randomUUID();
    const connectId = crypto.randomUUID();
    let finalText = '';
    let sawResult = false;
    let settled = false;

    const ws = new WebSocket(WS_URL, {
      perMessageDeflate: false,
      headers: {
        'X-Api-App-Key': APP_ID,
        'X-Api-Access-Key': ACCESS_TOKEN,
        'X-Api-Resource-Id': RESOURCE_ID,
        'X-Api-Request-Id': reqid,
        'X-Api-Connect-Id': connectId,
      },
    });

    const finish = (err, text) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try { ws.close(); } catch (e) {}
      if (err) reject(err);
      else resolve(text || '');
    };

    const timeout = setTimeout(() => finish(new Error('语音识别超时，请重试')), 20000);

    ws.on('open', () => {
      const cfg = JSON.stringify({
        user: { uid: 'innotrans' },
        audio: { format: 'pcm', sample_rate: 16000, channel: 1, bits: 16 },
        request: {
          reqid,
          sequence: 1,
          show_utterances: true,
          result_type: 'full',
        },
      });
      // 开始帧（Full Client JSON）
      ws.send(frame([0x11, 0x10, 0x10, 0x00], Buffer.from(cfg, 'utf8')));

      // 分块发送 PCM（每块约 100ms = 3200 字节）
      const CHUNK = 3200;
      for (let i = 0; i < pcm.length; i += CHUNK) {
        ws.send(frame([0x11, 0x20, 0x00, 0x00], pcm.subarray(i, i + CHUNK)));
      }
      // 最后一帧（flags=2 表示音频结束）
      ws.send(frame([0x11, 0x22, 0x00, 0x00], Buffer.alloc(0)));
    });

    ws.on('message', (data) => {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      if (buf.length < 12) return;
      const msgType = (buf[1] >> 4) & 0x0f;
      const flags = buf[1] & 0x0f;
      const raw = buf.subarray(12);
      const s = raw.indexOf(0x7b); // '{'
      if (s === -1) return;
      let json;
      try { json = JSON.parse(raw.subarray(s).toString('utf8')); } catch (e) { return; }

      // 错误帧（message type 0xF）
      if (msgType === 0b1111) {
        return finish(new Error(json.message || '语音识别失败'));
      }
      // 业务错误（code 非成功码）
      if (json.code != null && !isSuccessCode(json.code)) {
        return finish(new Error(json.message || '语音识别失败'));
      }

      // 识别结果帧（FullServer）
      if (msgType === 0b1001) {
        const text = extractText(json);
        if (text) {
          finalText = text;
          sawResult = true;
        }
        const definite =
          flags === 0x2 ||
          flags === 0x3 ||
          (Array.isArray(json.result && json.result.utterances) &&
            json.result.utterances.some((u) => u && u.definite));
        if (definite) finish(null, finalText);
      }
    });

    ws.on('error', (e) => finish(e));
    ws.on('close', () => {
      if (sawResult) finish(null, finalText);
      else finish(new Error('语音识别失败，请重试'));
    });
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

module.exports = router;
