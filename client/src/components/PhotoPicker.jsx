import { useRef, useState } from 'react';

// 压缩/统一转 JPEG：限制最长边 2560px（2K 高清），质量 0.95
// 同时把 HEIC 等格式统一转成 JPEG，避免后端/邮件预览不兼容
function compressFile(file, maxDim = 2560, quality = 0.95) {
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

export default function PhotoPicker({ photo, onCapture, onClear }) {
  const fileRef = useRef(null);
  const [error, setError] = useState('');

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

  return (
    <div className="camera">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={pickFile}
      />

      {!photo && (
        <div className="camera-placeholder">
          <div className="camera-icon">📷</div>
          <p>拍照或选择客户 / 名片照片</p>
          <div className="camera-actions">
            <button type="button" className="btn btn-primary" onClick={() => fileRef.current?.click()}>
              拍照 / 上传图片
            </button>
          </div>
          {error && <p className="camera-error">{error}</p>}
        </div>
      )}

      {photo && (
        <div className="camera-result">
          <img src={photo} alt="客户照片" className="camera-photo" />
          <div className="camera-actions">
            <button type="button" className="btn btn-outline" onClick={() => fileRef.current?.click()}>
              换一张
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
