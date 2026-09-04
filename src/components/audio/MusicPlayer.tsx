import { Link } from '@tanstack/react-router';
import { AudioLines, Music } from 'lucide-react';
import type React from 'react';
import { useCallback, useRef, useState } from 'react';
import { buttonVariants } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import AudioPlayerControls, { type AudioData } from './AudioPlayerControls';
import styles from './MusicPlayer.module.css';
import MusicVisualizer from './MusicVisualizer';

interface File {
  id: string;
  title: string | null;
  url: string;
}

interface MusicPlayerProps {
  files: File[];
}

const MusicPlayer: React.FC<MusicPlayerProps> = ({ files }) => {
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(0);
  const [shouldAutoPlayAfterSrcChange, setShouldAutoPlayAfterSrcChange] = useState(false);
  const audioDataRef = useRef<AudioData>({
    bassLevel: 0,
    midLevel: 0,
    highLevel: 0,
    overallLevel: 0,
    frequencyData: new Uint8Array(0),
  });
  const [isPlaying, setIsPlaying] = useState(false);

  const handleTrackSelect = useCallback((index: number) => {
    setShouldAutoPlayAfterSrcChange(false);
    setCurrentTrackIndex(index);
  }, []);

  const handleTrackChange = useCallback((index: number, options?: { shouldAutoPlay: boolean }) => {
    setShouldAutoPlayAfterSrcChange(options?.shouldAutoPlay ?? false);
    setCurrentTrackIndex(index);
  }, []);

  const handleAudioDataChange = useCallback((newAudioData: AudioData) => {
    audioDataRef.current = newAudioData;
  }, []);

  const handlePlayingChange = useCallback((playing: boolean) => {
    setIsPlaying(playing);
  }, []);

  if (files.length === 0) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyIcon}>
          <Music aria-hidden="true" />
        </div>
        <div className="stack space-2">
          <h2 className="type-2xl weight-semibold">No audio yet</h2>
          <p className={styles.emptyText}>Upload an audio file from your dashboard to start listening.</p>
        </div>
        <Link
          to="/dashboard"
          className={buttonVariants()}
        >
          Go to uploads
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.body}>
        <ScrollArea className={styles.playlist}>
          <h2 className="type-xl weight-bold margin-bottom-4">Tracks</h2>
          <ul className="stack space-1">
            {files.map((file, index) => {
              const isCurrentTrack = currentTrackIndex === index;
              const isNowPlaying = isCurrentTrack && isPlaying;

              return (
                <li key={file.id}>
                  <button
                    type="button"
                    className={styles.trackButton}
                    data-active={isCurrentTrack}
                    onClick={() => handleTrackSelect(index)}
                    aria-current={isCurrentTrack ? 'true' : undefined}
                  >
                    <span className={styles.trackTitle}>{file.title}</span>
                    {isNowPlaying && (
                      <AudioLines
                        aria-label="Now playing"
                        className={styles.nowPlayingIcon}
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </ScrollArea>

        {/* Middle - Enhanced Animation */}
        <div className={styles.stage}>
          <MusicVisualizer
            audioDataRef={audioDataRef}
            isPlaying={isPlaying}
          />
        </div>
      </div>

      {/* Bottom - Audio Player Controls */}
      <AudioPlayerControls
        files={files}
        currentTrackIndex={currentTrackIndex}
        shouldAutoPlayAfterSrcChange={shouldAutoPlayAfterSrcChange}
        onTrackChange={handleTrackChange}
        onAudioDataChange={handleAudioDataChange}
        onPlayingChange={handlePlayingChange}
      />
    </div>
  );
};

export default MusicPlayer;
