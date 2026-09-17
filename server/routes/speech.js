const express = require('express');
const crypto = require('crypto');

const router = express.Router();

const APP_ID = process.env.VOLC_ASR_APP_ID;
const ACCESS_TOKEN = process.env.VOLC_ASR_ACCESS_TOKEN;
const RESOURCE_ID = process.env.VOLC_ASR_RESOURCE_ID || 'volc.bigasr.auc';
const CLUSTER = process.env.VOLC_ASR_CLUSTER || 'volc_auc_common';
const ENDPOINT = process.env.VOLC_ASR_ENDPOINT || 'https://openspeech.bytedance.com/api/v1/auc';

// 语音识别（一句话识别）：接收 base64 WAV，返回识别文本
router.post('/recognize', async (req, res) => {
  try {
    const { audio } = req.body || {};
    if (!audio || typeof audio !== 'string') {
      return res.status(400).json({ error: '缺少音频数据' });
    }

    const reqid = crypto.randomUUID();
    const resp = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-App-Key': APP_ID,
        'X-Api-Access-Key': ACCESS_TOKEN,
        'X-Api-Resource-Id': RESOURCE_ID,
        'X-Api-Request-Id': reqid,
        'X-Api-Sequence': '-1',
      },
      body: JSON.stringify({
        app: { appid: APP_ID, token: ACCESS_TOKEN, cluster: CLUSTER },
        user: { uid: 'innotrans' },
        audio: { format: 'wav', data: audio, rate: 16000, bits: 16, channel: 1, codec: 'raw' },
        request: { reqid, sequence: -1, nbest: 1 },
      }),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || (data.code !== undefined && data.code !== 1000)) {
      throw new Error(data.message || `火山识别失败 (HTTP ${resp.status})`);
    }

    const text = data.result && data.result[0] && data.result[0].text ? data.result[0].text : '';
    res.json({ text });
  } catch (err) {
    console.error('语音识别失败:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
