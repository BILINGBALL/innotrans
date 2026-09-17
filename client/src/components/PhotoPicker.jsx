import { useRef, useState, useEffect, useCallback } from 'react';

// 本地图库图片压缩（仅图库上传用）
function compressFile(file, maxDim = 2000, quality = 0.92) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          const s = Math.min(maxDim / w, maxDim / h);
          w = Math.round(w * s);
          h = Math.round(h * s);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('图片无法读取'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}

// 获取摄像头流：优先指定朝向，失败则回退到任意摄像头；请求高清分辨率
async function getCameraStream(facingMode) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
  const attempts = [
    { video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } } },
    { video: { width: { ideal: 1920 }, height: { ideal: 1080 } } },
  ];
  let lastErr;
  for (const c of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia({ video: c.video, audio: false });
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

export default function PhotoPicker({ photo, onCapture, onClear }) {
  const videoRef = useRef(null);
  const fileRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const [active, setActive] = useState(false);
  const [facing, setFacing] = useState('environment');
  const [timer, setTimer] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState('');

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setCountdown(0);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setActive(false);
  }, []);

  useEffect(() => stop, [stop]);

  // active 变 true、<video> 挂载后，把流接上并播放
  useEffect(() => {
    if (active && streamRef.current && videoRef.current) {
      const v = videoRef.current;
      v.muted = true;
      v.playsInline = true;
      v.srcObject = streamRef.current;
      v.play().catch(() => {});
    }
  }, [active]);

  const start = useCallback(async (mode) => {
    setError('');
    try {
      const stream = await getCameraStream(mode);
      streamRef.current = stream;
      setActive(true);
    } catch (e) {
      setError('无法访问摄像头：请允许浏览器摄像头权限，并确认通过 HTTPS 或 localhost 访问。');
    }
  }, []);

  const flip = () => {
    const next = facing === 'environment' ? 'user' : 'environment';
    setFacing(next);
    stop();
    start(next);
  };

  // 原生分辨率 + 无损 PNG 拍摄（宽度上限 1920，防止 4K 超大图）
  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const MAX = 1920;
    let w = video.videoWidth;
    let h = video.videoHeight;
    if (w > MAX) {
      const s = MAX / w;
      w = MAX;
      h = Math.round(h * s);
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(video, 0, 0, w, h);
    onCapture(canvas.toDataURL('image/png'));
    stop();
  }, [onCapture, stop]);

  const startCapture = useCallback(() => {
    if (timer <= 0) {
      capture();
      return;
    }
    let remaining = timer;
    setCountdown(remaining);
    timerRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(timerRef.current);
        timerRef.current = null;
        setCountdown(0);
        capture();
      } else {
        setCountdown(remaining);
      }
    }, 1000);
  }, [timer, capture]);

  const pickFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    try {
      const dataUrl = await compressFile(file);
      onCapture(dataUrl);
    } catch (err) {
      setError('图片读取失败，请换一张试试');
    }
  };

  const retake = () => {
    onClear();
    start(facing);
  };

  return (
    <div className="camera">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={pickFile}
      />

      {!active && !photo && (
        <div className="camera-placeholder">
          <div className="camera-icon">📷</div>
          <p>拍摄或选择客户 / 名片照片</p>
          <div className="camera-actions">
            <button type="button" className="btn btn-primary" onClick={() => start(facing)}>
              打开摄像头
            </button>
            <button type="button" className="btn btn-outline" onClick={() => fileRef.current?.click()}>
              从图库选择
            </button>
          </div>
          {error && <p className="camera-error">{error}</p>}
        </div>
      )}

      {active && !photo && (
        <div className="camera-live">
          <video ref={videoRef} autoPlay playsInline muted className="camera-video" />
          {countdown > 0 && <div className="countdown-overlay">{countdown}</div>}
          <div className="camera-actions">
            <button type="button" className="btn btn-primary" onClick={startCapture}>
              拍照
            </button>
            <button type="button" className="btn btn-outline" onClick={flip}>
              🔄 翻转
            </button>
            <select
              className="camera-select"
              value={timer}
              onChange={(e) => setTimer(Number(e.target.value))}
              title="延时拍摄"
            >
              <option value={0}>即时</option>
              <option value={3}>3 秒</option>
              <option value={5}>5 秒</option>
              <option value={10}>10 秒</option>
            </select>
            <button type="button" className="btn btn-outline" onClick={stop}>
              关闭
            </button>
          </div>
        </div>
      )}

      {photo && (
        <div className="camera-result">
          <img src={photo} alt="客户照片" className="camera-photo" />
          <div className="camera-actions">
            <button type="button" className="btn btn-outline" onClick={retake}>
              重拍
            </button>
            <button type="button" className="btn btn-outline" onClick={() => fileRef.current?.click()}>
              换图库图片
            </button>
            <button type="button" className="btn btn-outline" onClick={onClear}>
              移除
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
