import { Eye, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

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
        className="mx-auto block h-auto max-h-[82vh] w-auto max-w-full cursor-zoom-in object-contain"
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
        className="absolute bottom-3.5 right-3.5 z-10 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/55 px-3 py-1.5 text-xs text-white backdrop-blur-md transition-transform hover:-translate-y-px"
        onClick={open}
      >
        <Eye size={13} /> View full size
      </button>

      {fullSize && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Full size image"
          className="fixed inset-0 z-[60] overflow-auto overscroll-contain bg-black/92 backdrop-blur-sm"
          onClick={close}
          onKeyDown={(e) => {
            if (e.key === 'Escape') close();
          }}
        >
          <button
            type="button"
            aria-label="Close"
            className="fixed right-4 top-4 z-[61] inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/60 text-white transition-all hover:bg-black/80"
            onClick={(e) => {
              e.stopPropagation();
              close();
            }}
          >
            <X size={18} />
          </button>
          <div className="flex min-h-full min-w-full items-start justify-center p-4 sm:p-8">
            <img
              src={src}
              alt="Shared image at full size"
              className="h-auto w-auto max-w-none cursor-zoom-out"
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
