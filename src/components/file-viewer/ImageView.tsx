import { Eye, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import styles from './ImageView.module.css';

interface ImageViewProps {
  src: string;
  /** Known natural dimensions from file metadata. Prevents layout shift. */
  width?: number;
  height?: number;
  onError?: () => void;
}

function ImageView({ src, width, height, onError }: ImageViewProps) {
  const [measured, setMeasured] = useState<{ width: number; height: number } | null>(width && height ? { width, height } : null);
  const [fullSize, setFullSize] = useState(false);

  useEffect(() => {
    if (!fullSize) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullSize(false);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [fullSize]);

  const open = useCallback(() => setFullSize(true), []);
  const close = useCallback(() => setFullSize(false), []);

  return (
    <>
      <img
        src={src}
        alt="Shared image"
        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 85vw, 75vw"
        className={styles.image}
        onClick={open}
        onLoad={(event) => {
          if (measured) return;
          const target = event.currentTarget;
          if (target.naturalWidth && target.naturalHeight) {
            setMeasured({ width: target.naturalWidth, height: target.naturalHeight });
          }
        }}
        onError={onError}
      />

      <button
        type="button"
        aria-label="View full size"
        className={styles.zoomButton}
        onClick={open}
      >
        <Eye size={13} /> View full size
      </button>

      {fullSize && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Full size image"
          className={styles.overlay}
          onClick={close}
          onKeyDown={(e) => {
            if (e.key === 'Escape') close();
          }}
        >
          <button
            type="button"
            aria-label="Close"
            className={styles.close}
            onClick={(e) => {
              e.stopPropagation();
              close();
            }}
          >
            <X size={18} />
          </button>
          <div className={styles.overlayBody}>
            <img
              src={src}
              alt="Shared image at full size"
              className={styles.fullImage}
              onError={onError}
              onClick={(e) => {
                e.stopPropagation();
                close();
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}

export default ImageView;
