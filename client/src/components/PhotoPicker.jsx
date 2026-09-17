import { useRef, useState, useEffect, useCallback } from 'react';

// 本地图片压缩到指定尺寸并转为 JPEG dataURL
function compressFile(file, maxDim = 1600, quality = 0.85) {
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

// 获取摄像头流：优先后置（手机拍客户），失败则回退到任意摄像头（桌面只有前置）
async function getCameraStream() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
  const attempts = [
    { video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } },
    { video: { width: { ideal: 1280 }, height: { ideal: 720 } } },
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
  const [active, setActive] = useState(false);
  const [error, setError] = useState('');

  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setActive(false);
  }, []);

  useEffect(() => stop, [stop]);

  // active 变 true、<video> 已挂载后，再把流接上并播放
  useEffect(() => {
    if (active && streamRef.current && videoRef.current) {
      const v = videoRef.current;
      // React 的 muted 属性有坑，这里用 DOM 属性强制静音 + 内联播放，确保手机端能自动播放
      v.muted = true;
      v.playsInline = true;
      v.srcObject = streamRef.current;
      v.play().catch(() => {});
    }
  }, [active]);

  const start = useCallback(async () => {
    setError('');
    try {
      const stream = await getCameraStream();
      streamRef.current = stream;
      setActive(true);
    } catch (e) {
      setError('无法访问摄像头：请允许浏览器摄像头权限，并确认通过 HTTPS 或 localhost 访问。');
    }
  }, []);

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    onCapture(canvas.toDataURL('image/jpeg', 0.85));
    stop();
  };

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
    start();
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
            <button type="button" className="btn btn-primary" onClick={start}>
              打开摄像头
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => fileRef.current?.click()}
            >
              从图库选择
            </button>
          </div>
          {error && <p className="camera-error">{error}</p>}
        </div>
      )}

      {active && !photo && (
        <div className="camera-live">
          <video ref={videoRef} autoPlay playsInline muted className="camera-video" />
          <div className="camera-actions">
            <button type="button" className="btn btn-primary" onClick={capture}>
              拍照
            </button>
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
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => fileRef.current?.click()}
            >
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
