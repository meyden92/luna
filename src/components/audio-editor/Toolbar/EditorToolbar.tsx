import { DownloadIcon, PauseIcon, PlayIcon, PlusIcon, SquareIcon, ZoomInIcon, ZoomOutIcon } from 'lucide-react';
import { useState } from 'react';
import { useAudioEditor } from '@/components/audio-editor/AudioEditorProvider';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { getTotalAudioDuration, useAudioEditorStore } from '@/hooks/stores/audio-editor-store';
import { formatTime } from '@/libs/audio-editor/audio-utils';
import { ExportDialog } from '../Export/ExportDialog';
import styles from './EditorToolbar.module.css';

function TimeDisplay({ duration }: { duration: number }) {
  const currentTime = useAudioEditorStore((state) => state.currentTime);

  return (
    <div className={styles.time}>
      {formatTime(currentTime)}
      <span className={styles.timeSeparator}>/</span>
      {formatTime(duration)}
    </div>
  );
}

export function EditorToolbar() {
  const isPlaying = useAudioEditorStore((state) => state.isPlaying);
  const pixelsPerSecond = useAudioEditorStore((state) => state.pixelsPerSecond);
  const setPixelsPerSecond = useAudioEditorStore((state) => state.setPixelsPerSecond);
  const setCurrentTime = useAudioEditorStore((state) => state.setCurrentTime);
  const addTrack = useAudioEditorStore((state) => state.addTrack);
  const duration = useAudioEditorStore((state) => getTotalAudioDuration(state.clips));
  const { playTimeline, stopPlayback } = useAudioEditor();
  const [isExportOpen, setIsExportOpen] = useState(false);

  const handlePlayPause = () => {
    if (isPlaying) {
      stopPlayback();
    } else {
      playTimeline();
    }
  };

  const handleStop = () => {
    stopPlayback();
    setCurrentTime(0);
  };

  const handleZoomIn = () => {
    setPixelsPerSecond(Math.min(200, pixelsPerSecond * 1.5));
  };

  const handleZoomOut = () => {
    setPixelsPerSecond(Math.max(10, pixelsPerSecond / 1.5));
  };

  const handleZoomChange = (values: number | readonly number[]) => {
    const value = Array.isArray(values) ? values[0] : values;
    if (typeof value === 'number') {
      setPixelsPerSecond(value);
    }
  };

  return (
    <>
      <div className={styles.bar}>
        {/* Playback controls */}
        <div className={styles.transport}>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handlePlayPause}
                >
                  {isPlaying ? <PauseIcon className={styles.icon} /> : <PlayIcon className={styles.icon} />}
                </Button>
              }
            />
            <TooltipContent>{isPlaying ? 'Pause' : 'Play'}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleStop}
                >
                  <SquareIcon className={styles.icon} />
                </Button>
              }
            />
            <TooltipContent>Stop</TooltipContent>
          </Tooltip>
        </div>

        {/* Time display */}
        <TimeDisplay duration={duration} />

        <Separator
          orientation="vertical"
          className={styles.divider}
        />

        {/* Zoom controls */}
        <div className={styles.zoom}>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleZoomOut}
                >
                  <ZoomOutIcon className={styles.icon} />
                </Button>
              }
            />
            <TooltipContent>Zoom Out</TooltipContent>
          </Tooltip>

          <Slider
            value={[pixelsPerSecond]}
            onValueChange={handleZoomChange}
            min={10}
            max={200}
            step={5}
            className={styles.zoomSlider}
          />

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleZoomIn}
                >
                  <ZoomInIcon className={styles.icon} />
                </Button>
              }
            />
            <TooltipContent>Zoom In</TooltipContent>
          </Tooltip>
        </div>

        <Separator
          orientation="vertical"
          className={styles.divider}
        />

        {/* Add track */}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                onClick={() => addTrack()}
              >
                <PlusIcon className={styles.iconLead} />
                Add Track
              </Button>
            }
          />
          <TooltipContent>Add new track</TooltipContent>
        </Tooltip>

        {/* Spacer */}
        <div className={styles.spacer} />

        {/* Export */}
        <Button
          variant="default"
          size="sm"
          onClick={() => setIsExportOpen(true)}
          disabled={duration === 0}
        >
          <DownloadIcon className={styles.iconLead} />
          Export
        </Button>
      </div>

      <ExportDialog
        open={isExportOpen}
        onOpenChange={setIsExportOpen}
      />
    </>
  );
}
