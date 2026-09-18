// AudioWorklet 处理器：实时采集麦克风音频 + 降采样到 16kHz 单声道 16bit PCM
// 通过 port.postMessage 把 PCM chunk 传给主线程，由主线程通过 WebSocket 发送给后端
// 不做抗混叠滤波，简单线性降采样，对 ASR 够用

const TARGET_SAMPLE_RATE = 16000;
// 累积到 3200 samples（200ms @ 16kHz 单声道 16bit）发送一次，共 6400 字节
const CHUNK_SAMPLES = 3200;

class AsrProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // 全局 sampleRate 是 AudioWorkletGlobalScope 中的采样率（通常 48000 或 44100）
    this.ratio = sampleRate / TARGET_SAMPLE_RATE;
    // 累积样本计数，用于按 ratio 降采样
    this.sampleCounter = 0;
    // 降采样后的 Int16 样本缓冲
    this.resampleBuffer = [];
    this.stopped = false;

    this.port.onmessage = (e) => {
      // 收到主线程的停止信号
      if (e.data && e.data.type === 'stop') {
        // 把剩余样本冲出
        this._flush();
        this.stopped = true;
      }
    };
  }

  _flush() {
    while (this.resampleBuffer.length >= CHUNK_SAMPLES) {
      const chunk = new Int16Array(CHUNK_SAMPLES);
      for (let i = 0; i < CHUNK_SAMPLES; i++) {
        chunk[i] = this.resampleBuffer[i];
      }
      this.resampleBuffer.splice(0, CHUNK_SAMPLES);
      // 发送 ArrayBuffer 副本给主线程（转移所有权更高效）
      this.port.postMessage(chunk.buffer, [chunk.buffer]);
    }
  }

  process(inputs) {
    if (this.stopped) return false;

    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channel = input[0]; // Float32Array, 128 个样本，范围 [-1, 1]

    // 简单降采样：每 ratio 个样本取 1 个
    for (let i = 0; i < channel.length; i++) {
      this.sampleCounter += 1;
      if (this.sampleCounter >= this.ratio) {
        this.sampleCounter -= this.ratio;
        let s = channel[i];
        if (s > 1) s = 1;
        else if (s < -1) s = -1;
        // 转 Int16
        const int16 = s < 0 ? s * 0x8000 : s * 0x7fff;
        this.resampleBuffer.push(int16);
      }
    }

    // 累积到 CHUNK_SAMPLES 时发送
    this._flush();

    return true;
  }
}

registerProcessor('asr-processor', AsrProcessor);
