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
            <ScissorsIcon className="size-4" />
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
        <div className="h-10 border-b border-border px-4 flex items-center gap-4 bg-muted/20">
          <span className="text-sm text-muted-foreground">{selectedClips.length} clips selected</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearSelection}
          >
            Clear Selection
          </Button>
          <div className="flex-1" />
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
                  <Trash2Icon className="size-4 mr-1" />
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
    <div className="h-10 border-b border-border px-4 flex items-center gap-4 bg-muted/20">
      <span className="text-sm font-medium truncate max-w-32">{clip.name}</span>

      <Separator
        orientation="vertical"
        className="h-5"
      />

      {/* Trim controls */}
      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground">Trim</Label>
        <Input
          type="text"
          value={formatTimeShort(clip.offset)}
          className="w-16 h-7 text-xs font-mono"
          readOnly
          title="Trim start"
        />
        <span className="text-muted-foreground">-</span>
        <Input
          type="text"
          value={formatTimeShort(clip.trimEnd)}
          className="w-16 h-7 text-xs font-mono"
          readOnly
          title="Trim end"
        />
        <span className="text-xs text-muted-foreground">({formatTimeShort(playDuration)})</span>
      </div>

      <Separator
        orientation="vertical"
        className="h-5"
      />

      {/* Volume */}
      <div className="flex items-center gap-2">
        <Volume2Icon className="size-4 text-muted-foreground" />
        <Slider
          value={[clip.volume * 100]}
          onValueChange={handleVolumeChange}
          min={0}
          max={100}
          step={1}
          className="w-20"
        />
        <span className="text-xs text-muted-foreground w-8">{Math.round(clip.volume * 100)}%</span>
      </div>

      <Separator
        orientation="vertical"
        className="h-5"
      />

      {/* Fades */}
      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground">Fade In</Label>
        <Slider
          value={[clip.fadeIn]}
          onValueChange={handleFadeInChange}
          min={0}
          max={Math.min(5, playDuration / 2)}
          step={0.1}
          className="w-16"
        />
        <span className="text-xs text-muted-foreground w-8">{clip.fadeIn.toFixed(1)}s</span>
      </div>

      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground">Out</Label>
        <Slider
          value={[clip.fadeOut]}
          onValueChange={handleFadeOutChange}
          min={0}
          max={Math.min(5, playDuration / 2)}
          step={0.1}
          className="w-16"
        />
        <span className="text-xs text-muted-foreground w-8">{clip.fadeOut.toFixed(1)}s</span>
      </div>

      <div className="flex-1" />

      {/* Actions */}
      <div className="flex items-center gap-1">
        <SplitClipButton clip={clip} />

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => removeClip(clip.id)}
              >
                <Trash2Icon className="size-4" />
              </Button>
            }
          />
          <TooltipContent>Delete Clip (Del)</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
