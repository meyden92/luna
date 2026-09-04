import { ScissorsIcon, Trash2Icon, Volume2Icon } from 'lucide-react';
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { type AudioClip, useAudioEditorStore } from '@/hooks/stores/audio-editor-store';
import { formatTimeShort } from '@/libs/audio-editor/audio-utils';
import styles from './ClipTools.module.css';

function SplitClipButton({ clip }: { clip: AudioClip }) {
  const currentTime = useAudioEditorStore((state) => state.currentTime);
  const splitClip = useAudioEditorStore((state) => state.splitClip);
  const playDuration = clip.trimEnd - clip.offset;
  const canSplit = currentTime > clip.startTime && currentTime < clip.startTime + playDuration;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => splitClip(clip.id, currentTime)}
            disabled={!canSplit}
          >
            <ScissorsIcon className={styles.icon} />
          </Button>
        }
      />
      <TooltipContent>Split at Playhead (C)</TooltipContent>
    </Tooltip>
  );
}

export function ClipTools() {
  const clips = useAudioEditorStore((state) => state.clips);
  const selectedClipIds = useAudioEditorStore((state) => state.selectedClipIds);
  const updateClip = useAudioEditorStore((state) => state.updateClip);
  const removeClip = useAudioEditorStore((state) => state.removeClip);
  const clearSelection = useAudioEditorStore((state) => state.clearSelection);

  const selectedClips = useMemo(
    () =>
      Array.from(selectedClipIds)
        .map((id) => clips[id])
        .filter((clip): clip is AudioClip => clip !== undefined),
    [selectedClipIds, clips],
  );

  // Only show if exactly one clip is selected
  if (selectedClips.length !== 1) {
    if (selectedClips.length > 1) {
      return (
        <div className={styles.bar}>
          <span className={styles.selectionCount}>{selectedClips.length} clips selected</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearSelection}
          >
            Clear Selection
          </Button>
          <div className={styles.spacer} />
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    for (const clip of selectedClips) {
                      removeClip(clip.id);
                    }
                  }}
                >
                  <Trash2Icon className={styles.iconLead} />
                  Delete All
                </Button>
              }
            />
            <TooltipContent>Delete selected clips (Del)</TooltipContent>
          </Tooltip>
        </div>
      );
    }
    return null;
  }

  const clip = selectedClips[0]!; // We know length is 1
  const playDuration = clip.trimEnd - clip.offset;

  const handleVolumeChange = (values: number | readonly number[]) => {
    const value = Array.isArray(values) ? values[0] : values;
    if (typeof value === 'number') {
      updateClip(clip.id, { volume: value / 100 });
    }
  };

  const handleFadeInChange = (values: number | readonly number[]) => {
    const value = Array.isArray(values) ? values[0] : values;
    if (typeof value === 'number') {
      updateClip(clip.id, { fadeIn: value });
    }
  };

  const handleFadeOutChange = (values: number | readonly number[]) => {
    const value = Array.isArray(values) ? values[0] : values;
    if (typeof value === 'number') {
      updateClip(clip.id, { fadeOut: value });
    }
  };

  return (
    <div className={styles.bar}>
      <span className={styles.clipName}>{clip.name}</span>

      <Separator
        orientation="vertical"
        className={styles.divider}
      />

      {/* Trim controls */}
      <div className={styles.group}>
        <Label className={styles.label}>Trim</Label>
        <Input
          type="text"
          value={formatTimeShort(clip.offset)}
          className={styles.timeInput}
          readOnly
          title="Trim start"
        />
        <span className={styles.dash}>-</span>
        <Input
          type="text"
          value={formatTimeShort(clip.trimEnd)}
          className={styles.timeInput}
          readOnly
          title="Trim end"
        />
        <span className={styles.value}>({formatTimeShort(playDuration)})</span>
      </div>

      <Separator
        orientation="vertical"
        className={styles.divider}
      />

      {/* Volume */}
      <div className={styles.group}>
        <Volume2Icon className={styles.mutedIcon} />
        <Slider
          value={[clip.volume * 100]}
          onValueChange={handleVolumeChange}
          min={0}
          max={100}
          step={1}
          className={styles.volumeSlider}
        />
        <span className={styles.valueFixed}>{Math.round(clip.volume * 100)}%</span>
      </div>

      <Separator
        orientation="vertical"
        className={styles.divider}
      />

      {/* Fades */}
      <div className={styles.group}>
        <Label className={styles.label}>Fade In</Label>
        <Slider
          value={[clip.fadeIn]}
          onValueChange={handleFadeInChange}
          min={0}
          max={Math.min(5, playDuration / 2)}
          step={0.1}
          className={styles.fadeSlider}
        />
        <span className={styles.valueFixed}>{clip.fadeIn.toFixed(1)}s</span>
      </div>

      <div className={styles.group}>
        <Label className={styles.label}>Out</Label>
        <Slider
          value={[clip.fadeOut]}
          onValueChange={handleFadeOutChange}
          min={0}
          max={Math.min(5, playDuration / 2)}
          step={0.1}
          className={styles.fadeSlider}
        />
        <span className={styles.valueFixed}>{clip.fadeOut.toFixed(1)}s</span>
      </div>

      <div className={styles.spacer} />

      {/* Actions */}
      <div className={styles.actions}>
        <SplitClipButton clip={clip} />

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => removeClip(clip.id)}
              >
                <Trash2Icon className={styles.icon} />
              </Button>
            }
          />
          <TooltipContent>Delete Clip (Del)</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
