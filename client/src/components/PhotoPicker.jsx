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

export default function PhotoPicker({ photos = [], onChange, max = 6 }) {
  const fileRef = useRef(null);
  const [error, setError] = useState('');

  const addFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    setError('');
    const remaining = max - photos.length;
    if (remaining <= 0) return;
    try {
      const dataUrls = [];
      for (const f of files.slice(0, remaining)) {
        dataUrls.push(await compressFile(f));
      }
      onChange([...photos, ...dataUrls]);
    } catch (err) {
      setError('图片读取失败，请换一张试试');
    }
  };

  const remove = (idx) => onChange(photos.filter((_, i) => i !== idx));
  const setCover = (idx) => {
    const next = [...photos];
    const [p] = next.splice(idx, 1);
    next.unshift(p);
    onChange(next);
  };

  return (
    <div className="camera">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={addFiles}
      />

      {photos.length === 0 && (
        <div className="camera-placeholder">
          <div className="camera-icon">📷</div>
          <p>拍照或选择客户 / 名片照片（可多张）</p>
          <div className="camera-actions">
            <button type="button" className="btn btn-primary" onClick={() => fileRef.current?.click()}>
              拍照 / 上传图片
            </button>
          </div>
        </div>
      )}

      {photos.length > 0 && (
        <div className="photo-grid">
          {photos.map((p, i) => (
            <div className="photo-cell" key={i}>
              <img src={p} alt="客户照片" className="photo-img" />
              {i === 0 && <span className="photo-cover">封面</span>}
              <div className="photo-cell-actions">
                {i !== 0 && (
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setCover(i)}>
                    设为封面
                  </button>
                )}
                <button type="button" className="btn btn-outline btn-sm" onClick={() => remove(i)}>
                  移除
                </button>
              </div>
            </div>
          ))}
          {photos.length < max && (
            <button
              type="button"
              className="btn btn-outline photo-add"
              onClick={() => fileRef.current?.click()}
            >
              ＋ 添加（{photos.length}/{max}）
            </button>
          )}
        </div>
      )}

      {error && <p className="camera-error">{error}</p>}
    </div>
  );
}
