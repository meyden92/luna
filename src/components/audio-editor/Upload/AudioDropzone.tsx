import { UploadIcon } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { getTotalAudioDuration, useAudioEditorStore } from '@/hooks/stores/audio-editor-store';
import { cn } from '@/libs/utils';
import { useAudioEditor } from '../AudioEditorProvider';
import styles from './AudioDropzone.module.css';

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

interface AudioDropzoneProps {
  trackId?: string;
  className?: string;
  compact?: boolean;
}

export function AudioDropzone({ trackId, className, compact = false }: AudioDropzoneProps) {
  const { loadAudioFile } = useAudioEditor();
  const addTrack = useAudioEditorStore((state) => state.addTrack);
  const addClip = useAudioEditorStore((state) => state.addClip);
  const tracks = useAudioEditorStore((state) => state.tracks);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

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

          // Determine target track
          let targetTrackId = trackId;
          if (!targetTrackId) {
            // If no track specified, create a new one or use first available
            const firstTrack = tracks[0];
            if (!firstTrack) {
              targetTrackId = addTrack();
            } else {
              targetTrackId = firstTrack.id;
            }
          }

          // Add clip to track
          const startTime = trackId ? 0 : getTotalAudioDuration(useAudioEditorStore.getState().clips);

          addClip({
            trackId: targetTrackId,
            name: file.name.replace(/\.[^.]+$/, ''),
            fileUrl,
            audioBuffer,
            duration: audioBuffer.duration,
            startTime,
            offset: 0,
            trimEnd: audioBuffer.duration,
            volume: 1,
            fadeIn: 0,
            fadeOut: 0,
          });
        }
      } catch (error) {
        console.error('Failed to load audio file:', error);
      } finally {
        setIsLoading(false);
      }
    },
    [loadAudioFile, addTrack, addClip, tracks, trackId],
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

  if (compact) {
    return (
      <Button
        variant="outline"
        size="sm"
        className={className}
        disabled={isLoading}
        onClick={() => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'audio/*';
          input.multiple = true;
          input.onchange = (e) => {
            const files = (e.target as HTMLInputElement).files;
            if (files) handleFiles(files);
          };
          input.click();
        }}
      >
        <UploadIcon className={styles.compactIcon} />
        {isLoading ? 'Loading...' : 'Add Audio'}
      </Button>
    );
  }

  return (
    <div
      className={cn(styles.root, className)}
      data-drag-over={isDragOver}
      data-loading={isLoading}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <label className={styles.label}>
        <UploadIcon className={styles.icon} />
        <div className={styles.text}>
          <p className={styles.title}>{isLoading ? 'Loading audio...' : 'Drop audio files here'}</p>
          <p className={styles.hint}>or click to browse (MP3, WAV, OGG, FLAC)</p>
        </div>
        <input
          type="file"
          accept="audio/*"
          multiple
          className="sr-only"
          onChange={handleInputChange}
          disabled={isLoading}
        />
      </label>
    </div>
  );
}
