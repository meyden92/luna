import { useEffect, useRef } from 'react';
import WaveSurfer from 'wavesurfer.js';

interface WaveformDisplayProps {
  fileUrl: string;
  width: number;
  height?: number;
  waveColor?: string;
  progressColor?: string;
}

export function WaveformDisplay({
  fileUrl,
  width,
  height = 60,
  waveColor = 'hsl(var(--primary) / 0.5)',
  progressColor = 'hsl(var(--primary))',
}: WaveformDisplayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const loadedUrlRef = useRef<string | null>(null);

  // Initialize and load waveform only when fileUrl changes
  useEffect(() => {
    if (!containerRef.current || !fileUrl) return;

    // Skip if already loaded this URL
    if (loadedUrlRef.current === fileUrl && wavesurferRef.current) {
      return;
    }

    // Destroy previous instance safely
    if (wavesurferRef.current) {
      try {
        wavesurferRef.current.destroy();
      } catch {
        // Ignore errors during destroy
      }
      wavesurferRef.current = null;
    }

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor,
      progressColor,
      height,
      width,
      normalize: true,
      interact: false,
      cursorWidth: 0,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
    });

    wavesurferRef.current = ws;
    loadedUrlRef.current = fileUrl;

    // Load with error handling
    ws.load(fileUrl).catch((err) => {
      // Ignore abort errors
      if (err?.name !== 'AbortError') {
        console.error('Failed to load waveform:', err);
      }
    });

    return () => {
      if (wavesurferRef.current) {
        try {
          wavesurferRef.current.destroy();
        } catch {
          // Ignore errors during cleanup
        }
        wavesurferRef.current = null;
        loadedUrlRef.current = null;
      }
    };
  }, [fileUrl, waveColor, progressColor, height, width]);

  // Update width/height without reloading audio
  useEffect(() => {
    if (wavesurferRef.current) {
      try {
        wavesurferRef.current.setOptions({ width, height });
      } catch {
        // Ignore resize errors
      }
    }
  }, [width, height]);

  return (
    <div
      ref={containerRef}
      className="overflow-hidden"
      style={{ width, height }}
    />
  );
}
