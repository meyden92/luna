import { Link } from '@tanstack/react-router';
import { AudioLines, Music } from 'lucide-react';
import type React from 'react';
import { useCallback, useRef, useState } from 'react';
import { cn } from '@/libs/utils';
import { buttonVariants } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import AudioPlayerControls, { type AudioData } from './AudioPlayerControls';
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
      <div className="flex h-full w-full flex-col items-center justify-center gap-5 px-6 text-center">
        <div className="rounded-full border border-border bg-muted/30 p-5">
          <Music
            className="h-10 w-10 text-muted-foreground"
            aria-hidden="true"
          />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold">No audio yet</h2>
          <p className="max-w-sm text-sm text-muted-foreground">Upload an audio file from your dashboard to start listening.</p>
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
    <div className="flex flex-col h-full w-full">
      <div className="grow flex overflow-hidden">
        <ScrollArea className="w-1/6 h-full p-4">
          <h2 className="text-xl font-bold mb-4">Tracks</h2>
          <ul className="space-y-1">
            {files.map((file, index) => {
              const isCurrentTrack = currentTrackIndex === index;
              const isNowPlaying = isCurrentTrack && isPlaying;

              return (
                <li key={file.id}>
                  <button
                    type="button"
                    className={cn(
                      'flex w-full items-center justify-between gap-2 rounded-md p-2 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      isCurrentTrack && 'bg-primary/50',
                    )}
                    onClick={() => handleTrackSelect(index)}
                    aria-current={isCurrentTrack ? 'true' : undefined}
                  >
                    <span className="min-w-0 truncate">{file.title}</span>
                    {isNowPlaying && (
                      <AudioLines
                        aria-label="Now playing"
                        className="h-4 w-4 shrink-0 animate-pulse"
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </ScrollArea>

        {/* Middle - Enhanced Animation */}
        <div className="w-full flex items-center justify-center relative overflow-hidden">
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
