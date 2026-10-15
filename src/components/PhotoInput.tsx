import { useRef, useState } from 'react';
import { Camera, ImagePlus, X } from 'lucide-react';
import { useT } from '../lib/hooks';
import { cx } from '../lib/cx';
import { toast } from '../lib/ui';

/** Reads an image file and returns a small JPEG data URL so records stay light. */
export function fileToPhoto(file: File, max = 880, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('canvas'));
        return;
      }
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image'));
    };
    img.src = url;
  });
}

export function PhotoInput({ value, onChange, size = 112, label }: { value?: string; onChange: (v: string | undefined) => void; size?: number; label?: string }) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);

  const take = async (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error(t('photo.notImage'));
      return;
    }
    setBusy(true);
    try {
      onChange(await fileToPhoto(file));
    } catch {
      toast.error(t('photo.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="photo-input" style={{ width: size, height: size }}>
      <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void take(e.target.files?.[0]); e.target.value = ''; }} />
      {value ? (
        <>
          <img src={value} alt={label ?? t('common.photo')} />
          <button type="button" className="photo-input__x" onClick={() => onChange(undefined)} aria-label={t('common.remove')}>
            <X size={14} />
          </button>
          <button type="button" className="photo-input__swap" onClick={() => input.current?.click()} aria-label={t('common.change')}>
            <Camera size={14} />
          </button>
        </>
      ) : (
        <button
          type="button"
          className={cx('photo-input__empty', drag && 'is-drag', busy && 'is-busy')}
          onClick={() => input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); void take(e.dataTransfer.files?.[0]); }}
        >
          <ImagePlus size={22} />
          <span>{busy ? t('common.loading') : t('photo.add')}</span>
        </button>
      )}
    </div>
  );
}
