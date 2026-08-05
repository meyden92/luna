import { PlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAudioEditorStore } from '@/hooks/stores/audio-editor-store';
import { TrackHeader } from './TrackHeader';

export function TrackList() {
  const tracks = useAudioEditorStore((state) => state.tracks);
  const addTrack = useAudioEditorStore((state) => state.addTrack);

  return (
    <div className="w-52 border-r border-border flex flex-col bg-muted/30 shrink-0">
      {/* Header */}
      <div className="h-6 border-b border-border px-2 flex items-center justify-between bg-muted/50">
        <span className="text-xs font-medium text-muted-foreground">Tracks</span>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => addTrack()}
        >
          <PlusIcon className="size-3" />
        </Button>
      </div>

      {/* Track headers */}
      <ScrollArea className="flex-1">
        {tracks.map((track) => (
          <TrackHeader
            key={track.id}
            track={track}
          />
        ))}

        {/* Empty state / Add track button */}
        {tracks.length === 0 && (
          <div className="h-20 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <span className="text-xs">No tracks</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => addTrack()}
            >
              <PlusIcon className="size-3 mr-1" />
              Add Track
            </Button>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
