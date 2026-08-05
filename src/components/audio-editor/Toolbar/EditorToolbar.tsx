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

function TimeDisplay({ duration }: { duration: number }) {
  const currentTime = useAudioEditorStore((state) => state.currentTime);

  return (
    <div className="px-2 py-1 bg-background rounded-md border border-border font-mono text-sm min-w-24 text-center">
      {formatTime(currentTime)}
      <span className="text-muted-foreground mx-1">/</span>
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
      <div className="h-12 border-b border-border px-4 flex items-center gap-2 bg-muted/30">
        {/* Playback controls */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handlePlayPause}
                >
                  {isPlaying ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4" />}
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
                  <SquareIcon className="size-4" />
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
          className="h-6"
        />

        {/* Zoom controls */}
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleZoomOut}
                >
                  <ZoomOutIcon className="size-4" />
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
            className="w-24"
          />

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleZoomIn}
                >
                  <ZoomInIcon className="size-4" />
                </Button>
              }
            />
            <TooltipContent>Zoom In</TooltipContent>
          </Tooltip>
        </div>

        <Separator
          orientation="vertical"
          className="h-6"
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
                <PlusIcon className="size-4 mr-1" />
                Add Track
              </Button>
            }
          />
          <TooltipContent>Add new track</TooltipContent>
        </Tooltip>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Export */}
        <Button
          variant="default"
          size="sm"
          onClick={() => setIsExportOpen(true)}
          disabled={duration === 0}
        >
          <DownloadIcon className="size-4 mr-1" />
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
