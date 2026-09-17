const express = require('express');
const crypto = require('crypto');
const WebSocket = require('ws');

const router = express.Router();

const APP_ID = process.env.VOLC_ASR_APP_ID;
const ACCESS_TOKEN = process.env.VOLC_ASR_ACCESS_TOKEN;
const RESOURCE_ID = process.env.VOLC_ASR_RESOURCE_ID || 'volc.bigasr.sauc';
const CLUSTER = process.env.VOLC_ASR_CLUSTER || 'volc_auc_common';
const WS_URL = process.env.VOLC_ASR_ENDPOINT || 'wss://openspeech.bytedance.com/api/v2/asr';

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

function extractText(json) {
  const r = json && json.result;
  if (!r) return '';
  if (typeof r === 'string') return r;
  if (Array.isArray(r)) {
    return r.map((x) => (typeof x === 'string' ? x : (x && x.text) || '')).join('');
  }
  if (typeof r === 'object') return r.text || '';
  return '';
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
        app: { appid: APP_ID, token: ACCESS_TOKEN, cluster: CLUSTER },
        user: { uid: 'innotrans' },
        audio: { format: 'raw', rate: 16000, bits: 16, channel: 1, codec: 'raw' },
        request: {
          reqid,
          sequence: -1,
          nbest: 1,
          workflow: 'audio_in,resample,partition,vad,fe,decode,itn,nlu_punctuate',
        },
      });
      ws.send(frame([0x11, 0x10, 0x10, 0x00], Buffer.from(cfg, 'utf8')));

      // 分块发送 PCM（每块约 100ms = 3200 字节）
      const CHUNK = 3200;
      for (let i = 0; i < pcm.length; i += CHUNK) {
        ws.send(frame([0x11, 0x20, 0x00, 0x00], pcm.subarray(i, i + CHUNK)));
      }
      // 结束空帧
      ws.send(frame([0x11, 0x22, 0x00, 0x00], Buffer.alloc(0)));
    });

    ws.on('message', (data) => {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      if (buf.length < 12) return;
      const msgType = (buf[1] >> 4) & 0x0f;
      const raw = buf.subarray(12);
      const s = raw.indexOf(0x7b); // '{'
      if (s === -1) return;
      let json;
      try { json = JSON.parse(raw.subarray(s).toString('utf8')); } catch (e) { return; }

      // 错误帧 / 业务错误
      if (msgType === 0b1111 || json.code === 400) {
        return finish(new Error(json.message || '语音识别失败'));
      }

      // 识别结果帧
      if (msgType === 0b1001) {
        sawResult = true;
        const text = extractText(json);
        if (text) finalText = text;
        const result = json.result;
        const definite =
          json.type === 'final' ||
          (Array.isArray(result) && result[0] && result[0].definite) ||
          (result && !Array.isArray(result) && result.definite);
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
