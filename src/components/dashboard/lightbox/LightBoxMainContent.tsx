import { File, FileText, FolderArchive, Loader2, Music, Video } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import AudioPlayer from 'react-h5-audio-player';
import 'react-h5-audio-player/lib/styles.css';
import type H5AudioPlayer from 'react-h5-audio-player';
import { useGalleryStore } from '@/hooks/stores/gallery-store';
import { getCDNImage, isPreviewableFile } from '@/libs/utils';
import type { GalleryFile } from '@/types/project';
import { FileContextMenu } from '../FileContextMenu';
import styles from './LightBoxMainContent.module.css';

interface MainContentProps {
  file: GalleryFile;
  userId: string;
  handleDeleteAction: (fileId: string) => void;
}

function getFileIcon(contentType: string) {
  if (contentType.startsWith('audio/')) return Music;
  if (contentType.startsWith('video/')) return Video;
  if (contentType.includes('pdf')) return FileText;
  if (contentType.includes('zip') || contentType.includes('archive')) return FolderArchive;
  return File;
}

function buildCdnUrl(userId: string, url: string) {
  return getCDNImage(`/${userId}/${url}`);
}

export default function MainContent({ file, userId, handleDeleteAction }: MainContentProps) {
  const audioRef = useRef<H5AudioPlayer>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const setAudioRef = useGalleryStore((state) => state.setAudioRef);
  const setIsPlaying = useGalleryStore((state) => state.setIsPlaying);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  const { url, title, contentType } = file;
  const cdnUrl = buildCdnUrl(userId, url);
  const canPreview = isPreviewableFile(contentType);

  // Reset loading state when file changes and check for cached images
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally trigger on file change
  useEffect(() => {
    setIsLoaded(false);
    setHasError(false);

    // Check if image is already loaded from cache
    // Next.js Image onLoad doesn't fire reliably for cached images
    const timer = setTimeout(() => {
      const imgElement = containerRef.current?.querySelector('img');
      if (imgElement?.complete && imgElement.naturalWidth > 0) {
        setIsLoaded(true);
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [file.id]);

  // Audio ref handling
  useEffect(() => {
    if (contentType === 'audio/mpeg' && audioRef.current) {
      setAudioRef(audioRef.current);
    }
    return () => {
      if (audioRef.current?.audio.current) {
        audioRef.current.audio.current.pause();
      }
    };
  }, [contentType, setAudioRef]);

  const renderMediaContent = () => {
    // Video content
    if (contentType.startsWith('video/')) {
      return (
        <div className={styles.videoStage}>
          {!isLoaded && !hasError && (
            <div className={styles.spinnerLayer}>
              <Loader2 className={styles.spinner} />
            </div>
          )}
          {hasError ? (
            <div className={styles.fallback}>
              <File className={styles.fallbackIcon} />
              <p>Failed to load video</p>
            </div>
          ) : (
            <video
              key={file.id}
              src={cdnUrl}
              aria-label={title || 'Video preview'}
              autoPlay
              muted
              controls
              loop
              className={styles.video}
              data-loaded={isLoaded || undefined}
              onLoadedData={() => setIsLoaded(true)}
              onError={() => setHasError(true)}
            />
          )}
        </div>
      );
    }

    // Audio content
    if (contentType.startsWith('audio/')) {
      return (
        <div className={styles.audioStage}>
          <AudioPlayer
            ref={audioRef}
            className={styles.audioPlayer}
            src={cdnUrl}
            autoPlay={false}
            showJumpControls
            volume={0.3}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
            autoPlayAfterSrcChange={false}
            progressUpdateInterval={100}
          />
        </div>
      );
    }

    // Non-previewable file
    if (!canPreview) {
      const FileIcon = getFileIcon(contentType);
      return (
        <div className={styles.unsupported}>
          <FileIcon className={styles.unsupportedIcon} />
          <p className={styles.unsupportedTitle}>Preview not available</p>
          <p className={styles.unsupportedType}>{contentType}</p>
        </div>
      );
    }

    // Image content: the stage fills the grid cell and pads the image so it breathes.
    return (
      <div
        ref={containerRef}
        className={styles.imageStage}
      >
        {!isLoaded && !hasError && (
          <div className={styles.spinnerLayer}>
            <Loader2 className={styles.spinner} />
          </div>
        )}

        {hasError && (
          <div className={styles.fallback}>
            <File className={styles.fallbackIcon} />
            <p>Failed to load image</p>
          </div>
        )}

        {!hasError && (
          <img
            key={file.id}
            src={cdnUrl}
            alt={title || 'Image preview'}
            sizes="(max-width: 768px) 100vw, calc(100vw - 200px)"
            className={styles.image}
            data-loaded={isLoaded || undefined}
            onLoad={() => setIsLoaded(true)}
            onError={() => setHasError(true)}
          />
        )}
      </div>
    );
  };

  return (
    <FileContextMenu
      file={file}
      userId={userId}
      handleDeleteAction={handleDeleteAction}
      triggerClassName={styles.trigger}
    >
      {renderMediaContent()}
    </FileContextMenu>
  );
}
