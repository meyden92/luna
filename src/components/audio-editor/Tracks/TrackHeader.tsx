import { AlignLeftIcon, Trash2Icon, Volume2Icon, VolumeXIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { type Track, useAudioEditorStore } from '@/hooks/stores/audio-editor-store';
import styles from './TrackHeader.module.css';

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
      className={styles.root}
      data-muted={track.isMuted}
      data-dimmed={hasSoloedTrack && !track.isSolo}
    >
      {/* Top row: Track name + delete */}
      <div className={styles.row}>
        <Input
          value={track.name}
          onChange={(e) => updateTrack(track.id, { name: e.target.value })}
          className={styles.nameInput}
        />
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => removeTrack(track.id)}
              >
                <Trash2Icon className={styles.icon} />
              </Button>
            }
          />
          <TooltipContent>Delete Track</TooltipContent>
        </Tooltip>
      </div>

      {/* Bottom row: M S buttons + volume */}
      <div className={styles.controls}>
        {/* Mute */}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant={track.isMuted ? 'destructive' : 'ghost'}
                size="icon-xs"
                onClick={() => updateTrack(track.id, { isMuted: !track.isMuted })}
              >
                {track.isMuted ? <VolumeXIcon className={styles.icon} /> : <span className={styles.toggleLetter}>M</span>}
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
                <span className={styles.toggleLetter}>S</span>
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
                <AlignLeftIcon className={styles.icon} />
              </Button>
            }
          />
          <TooltipContent>Auto-align clips</TooltipContent>
        </Tooltip>

        {/* Volume icon */}
        <Volume2Icon className={styles.volumeIcon} />

        {/* Volume slider */}
        <Slider
          value={[volumePercent]}
          onValueChange={handleVolumeChange}
          min={0}
          max={100}
          step={1}
          className={styles.volumeSlider}
        />

        {/* Volume percentage */}
        <span className={styles.volumeValue}>{volumePercent}%</span>
      </div>
    </div>
  );
}
