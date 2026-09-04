import { PauseIcon, PlayIcon, PlusIcon } from 'lucide-react';
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { type CropAspect, useVideoEditorStore } from '@/hooks/stores/video-editor-store';
import { formatTime } from '@/libs/video-editor/ffmpeg-video';
import styles from './BottomBar.module.css';

interface BottomBarProps {
  onSave: () => void;
}

export function BottomBar({ onSave }: BottomBarProps) {
  const mode = useVideoEditorStore((s) => s.mode);
  const isPlaying = useVideoEditorStore((s) => s.isPlaying);
  const setIsPlaying = useVideoEditorStore((s) => s.setIsPlaying);
  const phase = useVideoEditorStore((s) => s.phase);

  const canSave = phase === 'ready';

  return (
    <div className={styles.root}>
      <Button
        variant="outline"
        size="icon"
        onClick={() => setIsPlaying(!isPlaying)}
        aria-label={isPlaying ? 'Pause' : 'Play'}
        title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
      >
        {isPlaying ? <PauseIcon /> : <PlayIcon />}
      </Button>

      <div className={styles.controls}>
        {mode === 'trim' && <TrimControls />}
        {mode === 'cut' && <CutControls />}
        {mode === 'crop' && <CropControls />}
      </div>

      <Button
        size="default"
        onClick={onSave}
        disabled={!canSave}
        title="Save / Export (Ctrl + S)"
      >
        Save
      </Button>
    </div>
  );
}

function TrimControls() {
  const trimStart = useVideoEditorStore((s) => s.trimStart);
  const trimEnd = useVideoEditorStore((s) => s.trimEnd);
  const setTrim = useVideoEditorStore((s) => s.setTrim);
  const duration = useVideoEditorStore((s) => s.duration);

  return (
    <>
      <TimeStepper
        label="Start"
        value={trimStart}
        onChange={(v) => setTrim(v, trimEnd)}
        min={0}
        max={trimEnd - 0.1}
      />
      <TimeStepper
        label="End"
        value={trimEnd}
        onChange={(v) => setTrim(trimStart, v)}
        min={trimStart + 0.1}
        max={duration}
      />
      <span className={styles.readout}>Duration: {formatTime(trimEnd - trimStart)}</span>
    </>
  );
}

function CutControls() {
  const pendingStart = useVideoEditorStore((s) => s.pendingCutStart);
  const toggleCut = useVideoEditorStore((s) => s.toggleCutAtCurrentTime);
  const duration = useVideoEditorStore((s) => s.duration);
  const cuts = useVideoEditorStore((s) => s.cuts);

  return (
    <>
      <Button
        size="sm"
        variant={pendingStart !== null ? 'default' : 'outline'}
        onClick={toggleCut}
      >
        <PlusIcon />
        {pendingStart === null ? 'Mark cut start (C)' : `Mark cut end — start ${formatTime(pendingStart)}`}
      </Button>
      <span className={styles.readout}>
        {cuts.length} cut{cuts.length === 1 ? '' : 's'} · total removed {formatTime(cuts.reduce((a, c) => a + (c.end - c.start), 0))} /{' '}
        {formatTime(duration)}
      </span>
    </>
  );
}

const ASPECTS: { id: CropAspect; label: string }[] = [
  { id: 'original', label: 'Original' },
  { id: '1:1', label: '1:1' },
  { id: '16:9', label: '16:9' },
  { id: '4:3', label: '4:3' },
  { id: '3:4', label: '3:4' },
  { id: 'custom', label: 'Custom' },
];

function CropControls() {
  const cropAspect = useVideoEditorStore((s) => s.cropAspect);
  const setCropAspect = useVideoEditorStore((s) => s.setCropAspect);
  const setCrop = useVideoEditorStore((s) => s.setCrop);
  const videoWidth = useVideoEditorStore((s) => s.videoWidth);
  const videoHeight = useVideoEditorStore((s) => s.videoHeight);
  const crop = useVideoEditorStore((s) => s.crop);

  const aspectLabel = useMemo(() => {
    if (!videoWidth || !videoHeight) return '';
    const g = gcd(videoWidth, videoHeight);
    return `${videoWidth / g}:${videoHeight / g}`;
  }, [videoWidth, videoHeight]);

  const applyAspect = (id: CropAspect) => {
    setCropAspect(id);
    if (id === 'original') setCrop({ x: 0, y: 0, w: 1, h: 1 });
    else if (id !== 'custom') {
      const target = parseAspect(id);
      if (target && videoWidth && videoHeight) {
        const current = videoWidth / videoHeight;
        let w = 1;
        let h = 1;
        if (target > current) {
          w = 1;
          h = current / target;
        } else {
          h = 1;
          w = target / current;
        }
        setCrop({ x: (1 - w) / 2, y: (1 - h) / 2, w, h });
      }
    }
  };

  const cropW = Math.round(crop.w * videoWidth);
  const cropH = Math.round(crop.h * videoHeight);

  return (
    <>
      {ASPECTS.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => applyAspect(a.id)}
          className={styles.aspect}
          data-active={cropAspect === a.id}
        >
          {a.id === 'original' && aspectLabel ? `Original (${aspectLabel})` : a.label}
        </button>
      ))}
      <span className={`${styles.readout} ${styles.cropReadout}`}>
        {cropW} px × {cropH} px
      </span>
    </>
  );
}

function TimeStepper({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
}) {
  const STEP = 0.1;
  const dec = () => onChange(Math.max(min, value - STEP));
  const inc = () => onChange(Math.min(max, value + STEP));

  return (
    <div className={styles.stepper}>
      <span className={styles.stepperLabel}>{label}</span>
      <div className={styles.stepperField}>
        <span className={styles.stepperValue}>{formatTime(value)}</span>
        <div className={styles.stepperArrows}>
          <button
            type="button"
            onClick={inc}
            className={styles.stepperArrow}
            aria-label="Increase"
          >
            ▲
          </button>
          <button
            type="button"
            onClick={dec}
            className={styles.stepperArrow}
            aria-label="Decrease"
          >
            ▼
          </button>
        </div>
      </div>
    </div>
  );
}

function parseAspect(id: CropAspect): number | null {
  if (id === '1:1') return 1;
  if (id === '16:9') return 16 / 9;
  if (id === '4:3') return 4 / 3;
  if (id === '3:4') return 3 / 4;
  return null;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}
