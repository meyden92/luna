import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { type AudioClip, getTotalAudioDuration, type Track, useAudioEditorStore } from '@/hooks/stores/audio-editor-store';

interface ClipGainRef {
  gainNode: GainNode;
  clipId: string;
  trackId: string;
}

interface AudioEditorContextValue {
  audioContext: AudioContext | null;
  masterGain: GainNode | null;
  loadAudioFile: (file: File) => Promise<{ audioBuffer: AudioBuffer; fileUrl: string }>;
  playTimeline: () => void;
  stopPlayback: () => void;
  renderOffline: (onProgress?: (progress: number) => void) => Promise<AudioBuffer>;
}

const AudioEditorContext = createContext<AudioEditorContextValue | null>(null);

export function useAudioEditor() {
  const context = useContext(AudioEditorContext);
  if (!context) {
    throw new Error('useAudioEditor must be used within AudioEditorProvider');
  }
  return context;
}

interface AudioEditorProviderProps {
  children: ReactNode;
}

export function AudioEditorProvider({ children }: AudioEditorProviderProps) {
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [masterGain, setMasterGain] = useState<GainNode | null>(null);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const clipGainsRef = useRef<ClipGainRef[]>([]);
  const playbackStartTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number | null>(null);

  const tracks = useAudioEditorStore((state) => state.tracks);
  const clips = useAudioEditorStore((state) => state.clips);
  const setCurrentTime = useAudioEditorStore((state) => state.setCurrentTime);
  const setIsPlaying = useAudioEditorStore((state) => state.setIsPlaying);
  const isPlaying = useAudioEditorStore((state) => state.isPlaying);
  const totalDuration = useAudioEditorStore((state) => getTotalAudioDuration(state.clips));

  const initAudioContext = useCallback(() => {
    if (audioContext) return audioContext;

    const ctx = new AudioContext();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);

    setAudioContext(ctx);
    setMasterGain(gain);

    return ctx;
  }, [audioContext]);

  const loadAudioFile = useCallback(
    async (file: File): Promise<{ audioBuffer: AudioBuffer; fileUrl: string }> => {
      const ctx = initAudioContext();

      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      const fileUrl = URL.createObjectURL(file);

      return { audioBuffer, fileUrl };
    },
    [initAudioContext],
  );

  const getEffectiveVolume = useCallback(
    (track: Track, clip: AudioClip): number => {
      const hasSoloedTrack = tracks.some((t) => t.isSolo);

      if (hasSoloedTrack && !track.isSolo) {
        return 0;
      }

      if (track.isMuted) {
        return 0;
      }

      return clip.volume * track.volume;
    },
    [tracks],
  );

  const stopPlayback = useCallback(() => {
    // Stop all active sources
    for (const source of activeSourcesRef.current) {
      try {
        source.stop();
        source.disconnect();
      } catch {
        // Source may have already stopped
      }
    }
    activeSourcesRef.current = [];
    clipGainsRef.current = [];

    // Cancel animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    setIsPlaying(false);
  }, [setIsPlaying]);

  // Plays the timeline from `currentTime` (seconds) using the AudioContext clock.
  // All scheduling is in seconds on `ctx.currentTime`, a monotonic audio clock.
  //
  // playbackStartTimeRef = now - startOffset anchors the timeline origin (t=0) on
  // that clock, so `ctx.currentTime - playbackStartTimeRef` recovers the current
  // timeline position for the playhead, even though playback began mid-timeline.
  //
  // Per clip: whenToStart = max(0, clipStart - startOffset) is the delay (added to
  // `now`) before the clip should sound. offsetInClip is how many seconds into the
  // clip's buffer to begin: when a clip straddles the playhead (clipStart < startOffset)
  // we skip into it by clipOffset + (startOffset - clipStart); otherwise we start at
  // its trim point clipOffset. durationToPlay is the remaining clip length after that
  // skip, passed as source.start(when, offset, duration).
  const playTimeline = useCallback(() => {
    if (!audioContext || !masterGain) {
      initAudioContext();
      return;
    }

    // Stop any existing playback
    stopPlayback();

    const ctx = audioContext;
    const now = ctx.currentTime;
    const startOffset = useAudioEditorStore.getState().currentTime;
    playbackStartTimeRef.current = now - startOffset;

    if (totalDuration === 0) return;

    // Schedule all clips
    for (const track of tracks) {
      const effectiveTrack = track;

      for (const clipId of track.clipIds) {
        const clip = clips[clipId];
        if (!clip?.audioBuffer) continue;

        const clipStart = clip.startTime;
        const clipOffset = clip.offset;
        const clipEnd = clip.trimEnd;
        const clipDuration = clipEnd - clipOffset;

        // Skip clips that end before current time
        if (clipStart + clipDuration <= startOffset) continue;

        const source = ctx.createBufferSource();
        source.buffer = clip.audioBuffer;

        const gainNode = ctx.createGain();
        const effectiveVolume = getEffectiveVolume(effectiveTrack, clip);

        // Calculate when to start this clip
        const whenToStart = Math.max(0, clipStart - startOffset);
        const offsetInClip = clipStart < startOffset ? clipOffset + (startOffset - clipStart) : clipOffset;
        const durationToPlay = clipDuration - (offsetInClip - clipOffset);

        if (durationToPlay <= 0) continue;

        // Apply base volume
        gainNode.gain.setValueAtTime(effectiveVolume, now + whenToStart);

        // Apply fade in
        if (clip.fadeIn > 0 && offsetInClip === clipOffset) {
          gainNode.gain.setValueAtTime(0, now + whenToStart);
          gainNode.gain.linearRampToValueAtTime(effectiveVolume, now + whenToStart + clip.fadeIn);
        }

        // Apply fade out
        if (clip.fadeOut > 0) {
          const fadeOutStart = whenToStart + durationToPlay - clip.fadeOut;
          if (fadeOutStart > whenToStart) {
            gainNode.gain.setValueAtTime(effectiveVolume, now + fadeOutStart);
            gainNode.gain.linearRampToValueAtTime(0, now + whenToStart + durationToPlay);
          }
        }

        source.connect(gainNode).connect(masterGain);
        source.start(now + whenToStart, offsetInClip, durationToPlay);

        activeSourcesRef.current.push(source);
        clipGainsRef.current.push({ gainNode, clipId: clip.id, trackId: track.id });
      }
    }

    setIsPlaying(true);

    // Update playhead position
    const updatePlayhead = () => {
      if (!audioContext) return;

      const elapsed = audioContext.currentTime - playbackStartTimeRef.current;
      setCurrentTime(elapsed);

      if (elapsed < totalDuration) {
        animationFrameRef.current = requestAnimationFrame(updatePlayhead);
      } else {
        stopPlayback();
        setCurrentTime(0);
      }
    };

    animationFrameRef.current = requestAnimationFrame(updatePlayhead);
  }, [
    audioContext,
    masterGain,
    tracks,
    clips,
    totalDuration,
    getEffectiveVolume,
    initAudioContext,
    setCurrentTime,
    setIsPlaying,
    stopPlayback,
  ]);

  // Render to offline context for export
  const renderOffline = useCallback(
    async (onProgress?: (progress: number) => void): Promise<AudioBuffer> => {
      if (totalDuration === 0) {
        throw new Error('No audio to render');
      }

      const sampleRate = 44100;
      const offlineCtx = new OfflineAudioContext(
        2, // stereo
        Math.ceil(sampleRate * totalDuration),
        sampleRate,
      );

      const offlineMasterGain = offlineCtx.createGain();
      offlineMasterGain.connect(offlineCtx.destination);

      // Schedule all clips
      for (const track of tracks) {
        for (const clipId of track.clipIds) {
          const clip = clips[clipId];
          if (!clip?.audioBuffer) continue;

          const source = offlineCtx.createBufferSource();
          source.buffer = clip.audioBuffer;

          const gainNode = offlineCtx.createGain();
          const effectiveVolume = getEffectiveVolume(track, clip);

          const clipStart = clip.startTime;
          const clipOffset = clip.offset;
          const clipEnd = clip.trimEnd;
          const clipDuration = clipEnd - clipOffset;

          // Apply base volume
          gainNode.gain.setValueAtTime(effectiveVolume, clipStart);

          // Apply fade in
          if (clip.fadeIn > 0) {
            gainNode.gain.setValueAtTime(0, clipStart);
            gainNode.gain.linearRampToValueAtTime(effectiveVolume, clipStart + clip.fadeIn);
          }

          // Apply fade out
          if (clip.fadeOut > 0) {
            const fadeOutStart = clipStart + clipDuration - clip.fadeOut;
            gainNode.gain.setValueAtTime(effectiveVolume, fadeOutStart);
            gainNode.gain.linearRampToValueAtTime(0, clipStart + clipDuration);
          }

          source.connect(gainNode).connect(offlineMasterGain);
          source.start(clipStart, clipOffset, clipDuration);
        }
      }

      // Report progress periodically
      if (onProgress) {
        const progressInterval = setInterval(() => {
          // OfflineAudioContext doesn't have real progress, simulate it
          onProgress(50);
        }, 100);

        try {
          const renderedBuffer = await offlineCtx.startRendering();
          clearInterval(progressInterval);
          onProgress(100);
          return renderedBuffer;
        } catch (error) {
          clearInterval(progressInterval);
          throw error;
        }
      }

      return offlineCtx.startRendering();
    },
    [tracks, clips, totalDuration, getEffectiveVolume],
  );

  // Update gain values in real-time when tracks/clips change during playback
  useEffect(() => {
    if (!isPlaying || !audioContext) return;

    // Update all active gain nodes based on current track/clip state
    for (const gainRef of clipGainsRef.current) {
      const track = tracks.find((t) => t.id === gainRef.trackId);
      const clip = clips[gainRef.clipId];

      if (!track || !clip) continue;

      const effectiveVolume = getEffectiveVolume(track, clip);
      // Use setTargetAtTime for smooth transitions
      gainRef.gainNode.gain.setTargetAtTime(effectiveVolume, audioContext.currentTime, 0.02);
    }
  }, [tracks, clips, isPlaying, audioContext, getEffectiveVolume]);

  // Cleanup on unmount - using refs to avoid dependency issues
  const audioContextRef = useRef(audioContext);
  audioContextRef.current = audioContext;

  const stopPlaybackRef = useRef(stopPlayback);
  stopPlaybackRef.current = stopPlayback;

  useEffect(() => {
    return () => {
      stopPlaybackRef.current();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const value: AudioEditorContextValue = {
    audioContext,
    masterGain,
    loadAudioFile,
    playTimeline,
    stopPlayback,
    renderOffline,
  };

  return <AudioEditorContext.Provider value={value}>{children}</AudioEditorContext.Provider>;
}
