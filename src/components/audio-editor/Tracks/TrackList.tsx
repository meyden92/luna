import { PlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAudioEditorStore } from '@/hooks/stores/audio-editor-store';
import { TrackHeader } from './TrackHeader';
import styles from './TrackList.module.css';

export function TrackList() {
  const tracks = useAudioEditorStore((state) => state.tracks);
  const addTrack = useAudioEditorStore((state) => state.addTrack);

  return (
    <div className={styles.root}>
      {/* Header */}
      <div className={styles.header}>
        <span className={styles.headerLabel}>Tracks</span>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => addTrack()}
        >
          <PlusIcon className={styles.icon} />
        </Button>
      </div>

      {/* Track headers */}
      <ScrollArea className={styles.scroll}>
        {tracks.map((track) => (
          <TrackHeader
            key={track.id}
            track={track}
          />
        ))}

        {/* Empty state / Add track button */}
        {tracks.length === 0 && (
          <div className={styles.empty}>
            <span className={styles.emptyText}>No tracks</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => addTrack()}
            >
              <PlusIcon className={styles.iconLead} />
              Add Track
            </Button>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
