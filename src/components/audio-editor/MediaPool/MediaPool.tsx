import { useDraggable } from '@dnd-kit/core';
import { MusicIcon, Trash2Icon, UploadIcon } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { type MediaFile, useAudioEditorStore } from '@/hooks/stores/audio-editor-store';
import { formatTimeShort } from '@/libs/audio-editor/audio-utils';
import { useAudioEditor } from '../AudioEditorProvider';
import styles from './MediaPool.module.css';

const ACCEPTED_AUDIO_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/ogg',
  'audio/flac',
  'audio/aac',
  'audio/webm',
];

function MediaPoolItem({ media }: { media: MediaFile }) {
  const removeFromMediaPool = useAudioEditorStore((state) => state.removeFromMediaPool);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `media-${media.id}`,
    data: { type: 'media', media },
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: isDragging ? 100 : undefined,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      className={styles.item}
      data-dragging={isDragging}
      style={style}
      {...attributes}
      {...listeners}
    >
      <MusicIcon className={styles.itemIcon} />
      <div className={styles.itemBody}>
        <p className={styles.itemName}>{media.name}</p>
        <p className={styles.itemDuration}>{formatTimeShort(media.duration)}</p>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        className={styles.remove}
        onClick={(e) => {
          e.stopPropagation();
          removeFromMediaPool(media.id);
        }}
      >
        <Trash2Icon className={styles.removeIcon} />
      </Button>
    </div>
  );
}

export function MediaPool() {
  const { loadAudioFile } = useAudioEditor();
  const mediaPool = useAudioEditorStore((state) => state.mediaPool);
  const addToMediaPool = useAudioEditorStore((state) => state.addToMediaPool);
  const addTrack = useAudioEditorStore((state) => state.addTrack);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const mediaFiles = Object.values(mediaPool);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      const audioFiles = fileArray.filter(
        (file) => ACCEPTED_AUDIO_TYPES.includes(file.type) || file.name.match(/\.(mp3|wav|ogg|flac|aac|webm)$/i),
      );

      if (audioFiles.length === 0) return;

      setIsLoading(true);

      try {
        for (const file of audioFiles) {
          const { audioBuffer, fileUrl } = await loadAudioFile(file);

          if (useAudioEditorStore.getState().tracks.length === 0) {
            addTrack();
          }

          addToMediaPool({
            name: file.name.replace(/\.[^.]+$/, ''),
            fileUrl,
            audioBuffer,
            duration: audioBuffer.duration,
          });
        }
      } catch (error) {
        console.error('Failed to load audio file:', error);
      } finally {
        setIsLoading(false);
      }
    },
    [loadAudioFile, addToMediaPool, addTrack],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFiles(e.target.files);
      }
    },
    [handleFiles],
  );

  const handleAddClick = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.multiple = true;
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files) handleFiles(files);
    };
    input.click();
  }, [handleFiles]);

  return (
    <div
      className={styles.root}
      data-drag-over={isDragOver}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className={styles.header}>
        <h3 className={styles.title}>Media Pool</h3>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleAddClick}
          disabled={isLoading}
        >
          <UploadIcon className={styles.uploadIcon} />
        </Button>
      </div>

      <div className={styles.list}>
        {mediaFiles.length === 0 ? (
          <label
            className={styles.empty}
            data-drag-over={isDragOver}
          >
            <UploadIcon className={styles.emptyIcon} />
            <p className={styles.emptyText}>{isLoading ? 'Loading...' : 'Drop audio files here'}</p>
            <p className={styles.emptyHint}>or click to browse</p>
            <input
              type="file"
              accept="audio/*"
              multiple
              className="sr-only"
              onChange={handleInputChange}
              disabled={isLoading}
            />
          </label>
        ) : (
          <>
            {mediaFiles.map((media) => (
              <MediaPoolItem
                key={media.id}
                media={media}
              />
            ))}
            {isLoading && <p className={styles.loading}>Loading...</p>}
          </>
        )}
      </div>
    </div>
  );
}
