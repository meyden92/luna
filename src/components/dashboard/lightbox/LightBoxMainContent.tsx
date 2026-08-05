import { File, FileText, FolderArchive, Loader2, Music, Video } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import AudioPlayer from 'react-h5-audio-player';
import 'react-h5-audio-player/lib/styles.css';
import type H5AudioPlayer from 'react-h5-audio-player';
import { useGalleryStore } from '@/hooks/stores/gallery-store';
import { getCDNImage, isPreviewableFile } from '@/libs/utils';
import type { GalleryFile } from '@/types/project';
import { FileContextMenu } from '../FileContextMenu';

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
        <div className="absolute inset-8 flex items-center justify-center">
          {!isLoaded && !hasError && (
            <div className="absolute inset-0 z-10 flex items-center justify-center">
              <Loader2 className="h-12 w-12 animate-spin text-white/40" />
            </div>
          )}
          {hasError ? (
            <div className="flex flex-col items-center justify-center gap-2 text-white/60">
              <File className="h-16 w-16" />
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
              className={`max-h-full max-w-full rounded-lg transition-opacity duration-200 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
              style={{ objectFit: 'contain' }}
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
        <div className="flex w-full max-w-4xl items-center justify-center px-8">
          <AudioPlayer
            ref={audioRef}
            className="w-full rounded-lg"
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
        <div className="flex flex-col items-center justify-center gap-4 text-white/60">
          <FileIcon className="h-24 w-24" />
          <p className="text-lg">Preview not available</p>
          <p className="text-sm">{contentType}</p>
        </div>
      );
    }

    // Image content
    return (
      /*
        Container takes full space of parent (which is the grid cell).
        Using absolute positioning with inset to guarantee dimensions.
        Padding creates space for the image to breathe.
      */
      <div
        ref={containerRef}
        className="absolute inset-0 flex items-center justify-center p-8"
      >
        {/* Loading spinner */}
        {!isLoaded && !hasError && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <Loader2 className="h-12 w-12 animate-spin text-white/40" />
          </div>
        )}

        {/* Error state */}
        {hasError && (
          <div className="flex flex-col items-center justify-center gap-2 text-white/60">
            <File className="h-16 w-16" />
            <p>Failed to load image</p>
          </div>
        )}

        {/* Image */}
        {!hasError && (
          <img
            key={file.id}
            src={cdnUrl}
            alt={title || 'Image preview'}
            sizes="(max-width: 768px) 100vw, calc(100vw - 200px)"
            className={`
              max-h-full max-w-full object-contain transition-opacity duration-200
              ${isLoaded ? 'opacity-100' : 'opacity-0'}
            `}
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
      triggerClassName="flex size-full items-center justify-center"
    >
      {renderMediaContent()}
    </FileContextMenu>
  );
}
