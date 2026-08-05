import { AlignLeftIcon, Trash2Icon, Volume2Icon, VolumeXIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { type Track, useAudioEditorStore } from '@/hooks/stores/audio-editor-store';
import { cn } from '@/libs/utils';

interface TrackHeaderProps {
  track: Track;
}

export function TrackHeader({ track }: TrackHeaderProps) {
  const updateTrack = useAudioEditorStore((state) => state.updateTrack);
  const removeTrack = useAudioEditorStore((state) => state.removeTrack);
  const tracks = useAudioEditorStore((state) => state.tracks);
  const autoAlignTrack = useAudioEditorStore((state) => state.autoAlignTrack);

  // Check if any track is soloed
  const hasSoloedTrack = tracks.some((t) => t.isSolo);

  const handleVolumeChange = (values: number | readonly number[]) => {
    const value = Array.isArray(values) ? values[0] : values;
    if (typeof value === 'number') {
      updateTrack(track.id, { volume: value / 100 });
    }
  };

  const volumePercent = Math.round(track.volume * 100);

  return (
    <div
      className={cn(
        'h-20 border-b border-border p-2 flex flex-col gap-1.5',
        track.isMuted && 'opacity-50',
        hasSoloedTrack && !track.isSolo && 'opacity-40',
      )}
    >
      {/* Top row: Track name + delete */}
      <div className="flex items-center gap-1">
        <Input
          value={track.name}
          onChange={(e) => updateTrack(track.id, { name: e.target.value })}
          className="h-5 flex-1 text-xs px-1.5 bg-transparent border-transparent hover:border-border focus:border-border"
        />
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => removeTrack(track.id)}
              >
                <Trash2Icon className="size-3" />
              </Button>
            }
          />
          <TooltipContent>Delete Track</TooltipContent>
        </Tooltip>
      </div>

      {/* Bottom row: M S buttons + volume */}
      <div className="flex items-center gap-1.5">
        {/* Mute */}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant={track.isMuted ? 'destructive' : 'ghost'}
                size="icon-xs"
                onClick={() => updateTrack(track.id, { isMuted: !track.isMuted })}
              >
                {track.isMuted ? <VolumeXIcon className="size-3" /> : <span className="text-[10px] font-bold">M</span>}
              </Button>
            }
          />
          <TooltipContent>Mute</TooltipContent>
        </Tooltip>

        {/* Solo */}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant={track.isSolo ? 'default' : 'ghost'}
                size="icon-xs"
                onClick={() => updateTrack(track.id, { isSolo: !track.isSolo })}
              >
                <span className="text-[10px] font-bold">S</span>
              </Button>
            }
          />
          <TooltipContent>Solo</TooltipContent>
        </Tooltip>

        {/* Auto-align */}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => autoAlignTrack(track.id)}
              >
                <AlignLeftIcon className="size-3" />
              </Button>
            }
          />
          <TooltipContent>Auto-align clips</TooltipContent>
        </Tooltip>

        {/* Volume icon */}
        <Volume2Icon className="size-3 text-muted-foreground shrink-0" />

        {/* Volume slider */}
        <Slider
          value={[volumePercent]}
          onValueChange={handleVolumeChange}
          min={0}
          max={100}
          step={1}
          className="flex-1 min-w-16"
        />

        {/* Volume percentage */}
        <span className="text-[10px] text-muted-foreground w-7 text-right tabular-nums">{volumePercent}%</span>
      </div>
    </div>
  );
}
