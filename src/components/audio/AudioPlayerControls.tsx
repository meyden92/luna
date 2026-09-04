import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import AudioPlayer from 'react-h5-audio-player';
import 'react-h5-audio-player/lib/styles.css';
import { HardDrive, Loader2, Pause, Play, SkipBack, SkipForward, Volume2, Wifi } from 'lucide-react';
import { Button } from '../ui/button';
import { Slider } from '../ui/slider';
import styles from './AudioPlayerControls.module.css';

interface File {
  id: string;
  title: string | null;
  url: string;
}

export interface AudioData {
  bassLevel: number;
  midLevel: number;
  highLevel: number;
  overallLevel: number;
  frequencyData: Uint8Array;
}

interface AudioPlayerControlsProps {
  // For single file mode
  file?: File;
  // For multi-file mode (playlist)
  files?: File[];
  currentTrackIndex?: number;
  shouldAutoPlayAfterSrcChange?: boolean;
  onTrackChange?: (index: number, options?: { shouldAutoPlay: boolean }) => void;
  // Optional callbacks
  onAudioDataChange?: (audioData: AudioData) => void;
  onPlayingChange?: (isPlaying: boolean) => void;
}

const AudioPlayerControls: React.FC<AudioPlayerControlsProps> = ({
  file,
  files,
  currentTrackIndex = 0,
  shouldAutoPlayAfterSrcChange = false,
  onTrackChange,
  onAudioDataChange,
  onPlayingChange,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRandomMode, _setIsRandomMode] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedProgress, setBufferedProgress] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);
  const [loadSource, setLoadSource] = useState<'cache' | 'remote' | 'loading'>('loading');
  const [hasAudioContext, setHasAudioContext] = useState(false);

  // Determine mode and get current track
  const isSingleFileMode = Boolean(file && !files);
  const isMultiFileMode = Boolean(files && files.length > 0);
  const currentTrack = isSingleFileMode ? file : isMultiFileMode ? files![currentTrackIndex] : null;

  // Refs for audio analysis without triggering re-renders
  const currentAudioDataRef = useRef<AudioData>({
    bassLevel: 0,
    midLevel: 0,
    highLevel: 0,
    overallLevel: 0,
    frequencyData: new Uint8Array(0),
  });

  const audioPlayerRef = useRef<AudioPlayer>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const lastUpdateTimeRef = useRef<number>(0);
  const isPlayingRef = useRef<boolean>(false);
  const loadStartTimeRef = useRef<number>(0);

  // Throttled update frequency (30fps instead of 60fps)
  const UPDATE_INTERVAL = 1000 / 30;

  const initializeAudioContext = useCallback(() => {
    const audioElement = audioPlayerRef.current?.audio?.current;
    if (!audioContextRef.current && audioElement) {
      try {
        // Set crossOrigin before creating audio context
        audioElement.crossOrigin = 'anonymous';

        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 256;
        analyserRef.current.smoothingTimeConstant = 0.8; // Smoother transitions

        if (!sourceRef.current) {
          sourceRef.current = audioContextRef.current.createMediaElementSource(audioElement);
          sourceRef.current.connect(analyserRef.current);
          // Connect to destination so audio still plays
          sourceRef.current.connect(audioContextRef.current.destination);
        }

        setHasAudioContext(true);
      } catch (error) {
        console.warn('Could not initialize audio context:', error);
        setHasAudioContext(false);
      }
    }
  }, []);

  const analyzeAudio = useCallback(() => {
    const now = performance.now();

    // Throttle updates to reduce CPU usage and re-renders
    if (now - lastUpdateTimeRef.current < UPDATE_INTERVAL) {
      if (isPlayingRef.current) {
        animationFrameRef.current = requestAnimationFrame(analyzeAudio);
      }
      return;
    }

    lastUpdateTimeRef.current = now;

    let newAudioData: AudioData;

    if (!analyserRef.current || !hasAudioContext) {
      // Fallback: generate fake audio data based on time for basic animation
      const time = now * 0.001;
      const fakeLevel = isPlayingRef.current ? (Math.sin(time) + 1) * 0.5 * 0.3 : 0;
      newAudioData = {
        bassLevel: fakeLevel,
        midLevel: fakeLevel * 0.8,
        highLevel: fakeLevel * 0.6,
        overallLevel: fakeLevel,
        frequencyData: new Uint8Array(128).fill(fakeLevel * 255),
      };
    } else {
      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyserRef.current.getByteFrequencyData(dataArray);

      // Calculate frequency ranges
      const bassEnd = Math.floor(bufferLength * 0.1);
      const midEnd = Math.floor(bufferLength * 0.5);

      const bassLevel = dataArray.slice(0, bassEnd).reduce((a, b) => a + b, 0) / bassEnd / 255;
      const midLevel = dataArray.slice(bassEnd, midEnd).reduce((a, b) => a + b, 0) / (midEnd - bassEnd) / 255;
      const highLevel = dataArray.slice(midEnd).reduce((a, b) => a + b, 0) / (bufferLength - midEnd) / 255;
      const overallLevel = dataArray.reduce((a, b) => a + b, 0) / bufferLength / 255;

      newAudioData = {
        bassLevel,
        midLevel,
        highLevel,
        overallLevel,
        frequencyData: dataArray,
      };
    }

    // Update ref immediately for visualizer
    currentAudioDataRef.current = newAudioData;

    // Notify parent if callback is provided
    onAudioDataChange?.(newAudioData);

    if (isPlayingRef.current) {
      animationFrameRef.current = requestAnimationFrame(analyzeAudio);
    }
  }, [hasAudioContext, onAudioDataChange]);

  // Reset visible loading/progress state when the selected source changes.
  useEffect(() => {
    if (currentTrack) {
      setCurrentTime(0);
      setBufferedProgress(0);
      setLoadSource('loading');
    }
  }, [currentTrack]);

  // Notify parent of playing state changes
  useEffect(() => {
    onPlayingChange?.(isPlaying);
  }, [isPlaying, onPlayingChange]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = undefined;
      }
      sourceRef.current?.disconnect();
      analyserRef.current?.disconnect();
      void audioContextRef.current?.close().catch(() => {});
      sourceRef.current = null;
      analyserRef.current = null;
      audioContextRef.current = null;
    };
  }, []);

  // Set initial volume when audio element is ready
  useEffect(() => {
    const audioElement = audioPlayerRef.current?.audio?.current;
    if (audioElement) {
      audioElement.volume = volume;
    }
  }, [volume]);

  // Add audio event listeners for progress tracking
  useEffect(() => {
    const audioElement = audioPlayerRef.current?.audio?.current;
    if (!audioElement) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audioElement.currentTime);
    };

    const handleDurationChange = () => {
      setDuration(audioElement.duration);
    };

    const handleLoadedMetadata = () => {
      setDuration(audioElement.duration);
      setCurrentTime(0);
    };

    const handleLoadStart = () => {
      loadStartTimeRef.current = performance.now();
      setLoadSource('loading');
      setIsBuffering(true);
      setBufferedProgress(0);
    };

    const handleProgress = () => {
      if (audioElement.duration > 0) {
        const buffered = audioElement.buffered;
        if (buffered.length > 0) {
          const bufferedEnd = buffered.end(buffered.length - 1);
          const bufferedPercent = (bufferedEnd / audioElement.duration) * 100;
          setBufferedProgress(bufferedPercent);
        }
      }
    };

    const handleCanPlay = () => {
      const loadTime = performance.now() - loadStartTimeRef.current;
      // If load time is very fast (< 100ms), likely from cache
      setLoadSource(loadTime < 100 ? 'cache' : 'remote');
      setIsBuffering(false);
    };

    const handleCanPlayThrough = () => {
      setIsBuffering(false);
    };

    const handleWaiting = () => {
      setIsBuffering(true);
    };

    const handleStalled = () => {
      setIsBuffering(true);
    };

    const handleSuspend = () => {
      setIsBuffering(false);
    };

    const handlePlay = () => {
      isPlayingRef.current = true;
      setIsPlaying(true);
    };

    const handlePause = () => {
      isPlayingRef.current = false;
      setIsPlaying(false);
    };

    audioElement.addEventListener('timeupdate', handleTimeUpdate);
    audioElement.addEventListener('durationchange', handleDurationChange);
    audioElement.addEventListener('loadedmetadata', handleLoadedMetadata);
    audioElement.addEventListener('loadstart', handleLoadStart);
    audioElement.addEventListener('progress', handleProgress);
    audioElement.addEventListener('canplay', handleCanPlay);
    audioElement.addEventListener('canplaythrough', handleCanPlayThrough);
    audioElement.addEventListener('waiting', handleWaiting);
    audioElement.addEventListener('stalled', handleStalled);
    audioElement.addEventListener('suspend', handleSuspend);
    audioElement.addEventListener('play', handlePlay);
    audioElement.addEventListener('pause', handlePause);

    return () => {
      audioElement.removeEventListener('timeupdate', handleTimeUpdate);
      audioElement.removeEventListener('durationchange', handleDurationChange);
      audioElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audioElement.removeEventListener('loadstart', handleLoadStart);
      audioElement.removeEventListener('progress', handleProgress);
      audioElement.removeEventListener('canplay', handleCanPlay);
      audioElement.removeEventListener('canplaythrough', handleCanPlayThrough);
      audioElement.removeEventListener('waiting', handleWaiting);
      audioElement.removeEventListener('stalled', handleStalled);
      audioElement.removeEventListener('suspend', handleSuspend);
      audioElement.removeEventListener('play', handlePlay);
      audioElement.removeEventListener('pause', handlePause);
    };
  }, []);

  useEffect(() => {
    if (isPlaying) {
      // Try to initialize audio context, but don't block if it fails
      if (!hasAudioContext) {
        initializeAudioContext();
      }
      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume();
      }
      // Start audio analysis loop
      analyzeAudio();
    } else {
      // Stop the animation loop
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = undefined;
      }
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = undefined;
      }
    };
  }, [isPlaying, analyzeAudio, initializeAudioContext, hasAudioContext]);

  const handleClickPrevious = useCallback(() => {
    if (!isMultiFileMode || !files || !onTrackChange) return;

    const newIndex = currentTrackIndex === 0 ? files.length - 1 : currentTrackIndex - 1;
    onTrackChange(newIndex, { shouldAutoPlay: true });
    setCurrentTime(0);
    setBufferedProgress(0);
    setLoadSource('loading');
  }, [currentTrackIndex, files, isMultiFileMode, onTrackChange]);

  const handleClickNext = useCallback(() => {
    if (!isMultiFileMode || !files || !onTrackChange) return;

    const newIndex = currentTrackIndex < files.length - 1 ? currentTrackIndex + 1 : 0;
    onTrackChange(newIndex, { shouldAutoPlay: true });
    setCurrentTime(0);
    setBufferedProgress(0);
    setLoadSource('loading');
  }, [currentTrackIndex, files, isMultiFileMode, onTrackChange]);

  const handlePlay = useCallback(() => {
    // Immediately update both state and ref for instant synchronization
    isPlayingRef.current = true;
    setIsPlaying(true);

    // Directly control the audio element
    const audioElement = audioPlayerRef.current?.audio?.current;
    if (audioElement) {
      audioElement.play();
    }
  }, []);

  const handlePause = useCallback(() => {
    // Immediately update both state and ref for instant synchronization
    isPlayingRef.current = false;
    setIsPlaying(false);

    // Directly control the audio element
    const audioElement = audioPlayerRef.current?.audio?.current;
    if (audioElement) {
      audioElement.pause();
    }

    // Immediately stop animation loop to ensure pause is respected
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = undefined;
    }
  }, []);

  const handleVolumeChange = useCallback((newVolume: number | readonly number[]) => {
    const volumeArray = Array.isArray(newVolume) ? newVolume : [newVolume];
    const volumeValue = volumeArray[0];
    if (volumeValue !== undefined) {
      setVolume(volumeValue);

      // Directly control the audio element volume
      const audioElement = audioPlayerRef.current?.audio?.current;
      if (audioElement) {
        audioElement.volume = volumeValue;
      }
    }
  }, []);

  const handleSeek = useCallback((newTime: number[]) => {
    const timeValue = newTime[0];
    if (timeValue !== undefined) {
      const audioElement = audioPlayerRef.current?.audio?.current;
      if (audioElement) {
        audioElement.currentTime = timeValue;
        setCurrentTime(timeValue);
      }
    }
  }, []);

  const formatTime = useCallback((time: number) => {
    if (Number.isNaN(time)) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, []);

  const togglePlayPause = useCallback(() => {
    if (isPlaying) {
      handlePause();
    } else {
      handlePlay();
    }
  }, [isPlaying, handlePlay, handlePause]);

  const handleEnded = useCallback(() => {
    if (!isMultiFileMode || !files || !onTrackChange) return;

    if (isRandomMode) {
      const nextIndex = Math.floor(Math.random() * files.length);
      onTrackChange(nextIndex, { shouldAutoPlay: true });
    } else {
      handleClickNext();
    }
  }, [isRandomMode, files, isMultiFileMode, handleClickNext, onTrackChange]);

  // Hide navigation buttons in single file mode
  const showNavigation = isMultiFileMode && files && files.length > 1;

  return (
    <div className={styles.root}>
      {/* Progress Bar */}
      <div className={styles.progress}>
        <span className={styles.time}>{formatTime(currentTime)}</span>
        <div className={styles.scrubber}>
          {/* Track background */}
          <div className={styles.track}>
            {/* Buffered progress */}
            <div
              className={styles.buffered}
              style={{ width: `${Math.min(bufferedProgress, 100)}%` }}
            />
            {/* Current progress */}
            <div
              className={styles.played}
              style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
            />
          </div>

          {/* Thumb */}
          <div
            className={styles.thumb}
            style={{ left: `calc(${duration > 0 ? (currentTime / duration) * 100 : 0}% - 8px)` }}
          />

          {/* Invisible range input for interaction */}
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={(e) => handleSeek([Number.parseFloat(e.target.value)])}
            className={styles.seek}
            step={1}
          />
        </div>
        <span className={styles.time}>{formatTime(duration)}</span>
      </div>

      {/* Status indicators */}
      <div className={styles.status}>
        <div className="cluster space-2">
          {isBuffering && (
            <div
              className={styles.statusItem}
              data-tone="primary"
            >
              <Loader2 className={styles.spinner} />
              <span>Buffering...</span>
            </div>
          )}

          {!isBuffering && loadSource !== 'loading' && (
            <div className={styles.statusItem}>
              {loadSource === 'cache' ? (
                <>
                  <HardDrive />
                  <span>Cached</span>
                </>
              ) : (
                <>
                  <Wifi />
                  <span>Streaming</span>
                </>
              )}
            </div>
          )}
        </div>

        {bufferedProgress > 0 && bufferedProgress < 100 && <div className={styles.statusItem}>{Math.round(bufferedProgress)}% loaded</div>}
      </div>

      {/* Control Buttons */}
      <div className={styles.controls}>
        {showNavigation && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClickPrevious}
            className={styles.navButton}
          >
            <SkipBack />
          </Button>
        )}

        <Button
          variant="default"
          size="icon"
          onClick={togglePlayPause}
          disabled={!currentTrack}
          className={styles.playButton}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause /> : <Play className={styles.playIcon} />}
        </Button>

        {showNavigation && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClickNext}
            className={styles.navButton}
          >
            <SkipForward />
          </Button>
        )}

        <div className={styles.volume}>
          <Volume2 className={styles.volumeIcon} />
          <Slider
            value={[volume]}
            onValueChange={handleVolumeChange}
            max={1}
            min={0}
            step={0.01}
            className={styles.volumeSlider}
          />
        </div>
      </div>

      {/* Hidden AudioPlayer */}
      <div className={styles.hiddenPlayer}>
        <AudioPlayer
          ref={audioPlayerRef}
          src={currentTrack?.url}
          onEnded={handleEnded}
          autoPlayAfterSrcChange={shouldAutoPlayAfterSrcChange}
          crossOrigin="anonymous"
        />
      </div>
    </div>
  );
};

export default AudioPlayerControls;
