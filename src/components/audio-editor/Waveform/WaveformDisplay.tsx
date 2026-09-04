import { useEffect, useRef } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { resolveCssColor } from '@/libs/css-color';
import styles from './WaveformDisplay.module.css';

interface WaveformDisplayProps {
  fileUrl: string;
  width: number;
  height?: number;
  waveColor?: string;
  progressColor?: string;
}

export function WaveformDisplay({ fileUrl, width, height = 60, waveColor, progressColor }: WaveformDisplayProps) {
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

    // wavesurfer paints on a canvas, so the accent has to be resolved to a
    // concrete colour rather than handed the light-dark() token expression.
    const accent = resolveCssColor('--primary', '#10b981');

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: waveColor ?? `color-mix(in oklab, ${accent} 50%, transparent)`,
      progressColor: progressColor ?? accent,
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
      className={styles.root}
      style={{ width, height }}
    />
  );
}
