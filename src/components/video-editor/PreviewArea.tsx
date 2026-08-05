import { useEffect, useRef } from 'react';
import { useVideoEditorStore } from '@/hooks/stores/video-editor-store';
import { CropOverlay } from './CropOverlay';
import { registerVideoEl } from './video-ref';

const ASPECT_MAP: Record<string, number | null> = {
  original: null,
  '1:1': 1,
  '16:9': 16 / 9,
  '4:3': 4 / 3,
  '3:4': 3 / 4,
  custom: null,
};

export function PreviewArea() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const objectUrl = useVideoEditorStore((s) => s.objectUrl);
  const mode = useVideoEditorStore((s) => s.mode);
  const videoWidth = useVideoEditorStore((s) => s.videoWidth);
  const videoHeight = useVideoEditorStore((s) => s.videoHeight);
  const crop = useVideoEditorStore((s) => s.crop);
  const cropAspect = useVideoEditorStore((s) => s.cropAspect);
  const setCrop = useVideoEditorStore((s) => s.setCrop);
  const isPlaying = useVideoEditorStore((s) => s.isPlaying);
  const setCurrentTime = useVideoEditorStore((s) => s.setCurrentTime);
  const setIsPlaying = useVideoEditorStore((s) => s.setIsPlaying);
  const trimStart = useVideoEditorStore((s) => s.trimStart);
  const trimEnd = useVideoEditorStore((s) => s.trimEnd);
  const cuts = useVideoEditorStore((s) => s.cuts);

  useEffect(() => {
    registerVideoEl(videoRef.current);
    return () => registerVideoEl(null);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) video.play().catch(() => setIsPlaying(false));
    else video.pause();
  }, [isPlaying, setIsPlaying]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => {
      const t = video.currentTime;
      if (t >= trimEnd - 0.05) {
        video.pause();
        video.currentTime = trimStart;
        setIsPlaying(false);
        setCurrentTime(trimStart);
        return;
      }
      if (t < trimStart) {
        video.currentTime = trimStart;
        return;
      }
      for (const cut of cuts) {
        if (t >= cut.start && t < cut.end) {
          video.currentTime = cut.end;
          return;
        }
      }
      setCurrentTime(t);
    };

    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(trimStart);
      video.currentTime = trimStart;
    };

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('ended', onEnded);
    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('ended', onEnded);
    };
  }, [trimStart, trimEnd, cuts, setCurrentTime, setIsPlaying]);

  const videoAspect = videoWidth && videoHeight ? videoWidth / videoHeight : 16 / 9;
  const cropAspectRatio = ASPECT_MAP[cropAspect] ?? null;
  const normalizedAspect = cropAspectRatio ? cropAspectRatio / videoAspect : null;

  return (
    <div className="flex-1 min-h-0 flex items-center justify-center px-4 py-2 overflow-hidden">
      <div
        className="relative inline-block max-h-full max-w-full"
        style={{ aspectRatio: `${videoWidth || 16} / ${videoHeight || 9}`, height: '100%' }}
      >
        {objectUrl && (
          <video
            ref={videoRef}
            src={objectUrl}
            className="block h-full w-full bg-black rounded-sm shadow-lg"
            controls={false}
            playsInline
            preload="metadata"
          >
            <track kind="captions" />
          </video>
        )}
        {mode === 'crop' && (
          <CropOverlay
            crop={crop}
            aspectRatio={normalizedAspect}
            onChange={setCrop}
          />
        )}
      </div>
    </div>
  );
}
