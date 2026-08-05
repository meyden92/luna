import { create } from 'zustand';

export interface AudioClip {
  id: string;
  trackId: string;
  name: string;
  fileUrl: string; // Object URL for waveform
  audioBuffer: AudioBuffer | null;
  duration: number; // Total duration in seconds
  startTime: number; // Position on timeline
  offset: number; // Trim start (seconds into clip)
  trimEnd: number; // Trim end (seconds from clip start)
  volume: number; // 0-1
  fadeIn: number; // Fade duration in seconds
  fadeOut: number;
}

export interface Track {
  id: string;
  name: string;
  order: number;
  isMuted: boolean;
  isSolo: boolean;
  volume: number;
  clipIds: string[];
}

export interface MediaFile {
  id: string;
  name: string;
  fileUrl: string;
  audioBuffer: AudioBuffer;
  duration: number;
}

interface AudioEditorState {
  // State
  tracks: Track[];
  clips: Record<string, AudioClip>;
  mediaPool: Record<string, MediaFile>;
  isPlaying: boolean;
  currentTime: number;
  pixelsPerSecond: number; // Zoom level
  selectedClipIds: Set<string>;
  isExporting: boolean;
  exportProgress: number;

  // Track actions
  addTrack: (name?: string) => string;
  removeTrack: (trackId: string) => void;
  updateTrack: (trackId: string, updates: Partial<Omit<Track, 'id' | 'clipIds'>>) => void;
  reorderTracks: (fromIndex: number, toIndex: number) => void;

  // Clip actions
  addClip: (clip: Omit<AudioClip, 'id'>) => string;
  removeClip: (clipId: string) => void;
  updateClip: (clipId: string, updates: Partial<Omit<AudioClip, 'id'>>) => void;
  moveClip: (clipId: string, targetTrackId: string, newStartTime: number) => void;
  splitClip: (clipId: string, splitTime: number) => void;
  autoAlignTrack: (trackId: string) => void;

  // Selection actions
  selectClip: (clipId: string, addToSelection?: boolean) => void;
  deselectClip: (clipId: string) => void;
  clearSelection: () => void;
  selectAllClipsInTrack: (trackId: string) => void;

  // Playback actions
  setIsPlaying: (isPlaying: boolean) => void;
  setCurrentTime: (time: number) => void;

  // Zoom actions
  setPixelsPerSecond: (pps: number) => void;

  // Export actions
  setIsExporting: (isExporting: boolean) => void;
  setExportProgress: (progress: number) => void;

  // Media pool actions
  addToMediaPool: (file: Omit<MediaFile, 'id'>) => string;
  removeFromMediaPool: (mediaId: string) => void;
  createClipFromMedia: (mediaId: string, trackId: string, startTime: number) => string | null;

  reset: () => void;
}

let trackCounter = 0;
let clipCounter = 0;
let mediaCounter = 0;

const generateTrackId = () => `track-${++trackCounter}`;
const generateClipId = () => `clip-${++clipCounter}`;
const generateMediaId = () => `media-${++mediaCounter}`;

// Whether any remaining clip or media-pool entry still points at fileUrl, so we
// don't revoke a URL shared by a split clip's surviving half.
const isFileUrlReferenced = (
  fileUrl: string,
  clips: Record<string, AudioClip>,
  mediaPool: Record<string, MediaFile>,
  ignoreClipIds?: Set<string>,
): boolean =>
  Object.values(clips).some((c) => c.fileUrl === fileUrl && !ignoreClipIds?.has(c.id)) ||
  Object.values(mediaPool).some((m) => m.fileUrl === fileUrl);

export function getTotalAudioDuration(clips: Record<string, AudioClip>): number {
  const clipValues = Object.values(clips);
  if (clipValues.length === 0) return 0;

  return Math.max(...clipValues.map((clip) => clip.startTime + (clip.trimEnd - clip.offset)));
}

export function getAudioClipsForTrack(track: Track, clips: Record<string, AudioClip>): AudioClip[] {
  return track.clipIds.map((id) => clips[id]).filter((clip): clip is AudioClip => clip !== undefined);
}

const createInitialState = () => ({
  tracks: [] as Track[],
  clips: {} as Record<string, AudioClip>,
  mediaPool: {} as Record<string, MediaFile>,
  isPlaying: false,
  currentTime: 0,
  pixelsPerSecond: 50,
  selectedClipIds: new Set<string>(),
  isExporting: false,
  exportProgress: 0,
});

export function hasPendingAudioEdits(state: AudioEditorState): boolean {
  return Object.keys(state.clips).length > 0 || Object.keys(state.mediaPool).length > 0;
}

export const useAudioEditorStore = create<AudioEditorState>((set, get) => ({
  ...createInitialState(),

  // Track actions
  addTrack: (name) => {
    const id = generateTrackId();
    const trackName = name || `Track ${get().tracks.length + 1}`;
    const newTrack: Track = {
      id,
      name: trackName,
      order: get().tracks.length,
      isMuted: false,
      isSolo: false,
      volume: 1,
      clipIds: [],
    };
    set((state) => ({
      tracks: [...state.tracks, newTrack],
    }));
    return id;
  },

  removeTrack: (trackId) => {
    set((state) => {
      const track = state.tracks.find((t) => t.id === trackId);
      if (!track) return state;

      // Remove all clips in this track
      const newClips = { ...state.clips };
      const removedIds = new Set(track.clipIds);
      for (const clipId of track.clipIds) {
        const fileUrl = newClips[clipId]?.fileUrl;
        delete newClips[clipId];
        // splitClip shares one object URL between halves; only revoke when no
        // surviving clip or media-pool entry still references it.
        if (fileUrl && !isFileUrlReferenced(fileUrl, newClips, state.mediaPool, removedIds)) {
          URL.revokeObjectURL(fileUrl);
        }
      }

      // Remove from selection
      const newSelection = new Set(state.selectedClipIds);
      for (const clipId of track.clipIds) {
        newSelection.delete(clipId);
      }

      return {
        tracks: state.tracks.filter((t) => t.id !== trackId).map((t, index) => ({ ...t, order: index })),
        clips: newClips,
        selectedClipIds: newSelection,
      };
    });
  },

  updateTrack: (trackId, updates) => {
    set((state) => ({
      tracks: state.tracks.map((t) => (t.id === trackId ? { ...t, ...updates } : t)),
    }));
  },

  reorderTracks: (fromIndex, toIndex) => {
    set((state) => {
      const newTracks = [...state.tracks];
      const [removed] = newTracks.splice(fromIndex, 1);
      if (removed) {
        newTracks.splice(toIndex, 0, removed);
      }
      return {
        tracks: newTracks.map((t, index) => ({ ...t, order: index })),
      };
    });
  },

  // Clip actions
  addClip: (clipData) => {
    const id = generateClipId();
    const newClip: AudioClip = { ...clipData, id };

    set((state) => {
      const track = state.tracks.find((t) => t.id === clipData.trackId);
      if (!track) return state;

      return {
        clips: { ...state.clips, [id]: newClip },
        tracks: state.tracks.map((t) => (t.id === clipData.trackId ? { ...t, clipIds: [...t.clipIds, id] } : t)),
      };
    });
    return id;
  },

  removeClip: (clipId) => {
    set((state) => {
      const clip = state.clips[clipId];
      if (!clip) return state;

      const newClips = { ...state.clips };
      delete newClips[clipId];

      // splitClip shares one object URL between halves; only revoke when no
      // surviving clip or media-pool entry still references it.
      if (clip.fileUrl && !isFileUrlReferenced(clip.fileUrl, newClips, state.mediaPool)) {
        URL.revokeObjectURL(clip.fileUrl);
      }

      const newSelection = new Set(state.selectedClipIds);
      newSelection.delete(clipId);

      return {
        clips: newClips,
        tracks: state.tracks.map((t) => (t.id === clip.trackId ? { ...t, clipIds: t.clipIds.filter((id) => id !== clipId) } : t)),
        selectedClipIds: newSelection,
      };
    });
  },

  updateClip: (clipId, updates) => {
    set((state) => {
      const existingClip = state.clips[clipId];
      if (!existingClip) return state;
      return {
        clips: {
          ...state.clips,
          [clipId]: { ...existingClip, ...updates },
        },
      };
    });
  },

  moveClip: (clipId, targetTrackId, newStartTime) => {
    set((state) => {
      const clip = state.clips[clipId];
      if (!clip) return state;

      const sourceTrackId = clip.trackId;

      // Update clip
      const updatedClip = {
        ...clip,
        trackId: targetTrackId,
        startTime: Math.max(0, newStartTime),
      };

      // Update tracks
      let newTracks = state.tracks;
      if (sourceTrackId !== targetTrackId) {
        newTracks = state.tracks.map((t) => {
          if (t.id === sourceTrackId) {
            return { ...t, clipIds: t.clipIds.filter((id) => id !== clipId) };
          }
          if (t.id === targetTrackId) {
            return { ...t, clipIds: [...t.clipIds, clipId] };
          }
          return t;
        });
      }

      return {
        clips: { ...state.clips, [clipId]: updatedClip },
        tracks: newTracks,
      };
    });
  },

  splitClip: (clipId, splitTime) => {
    const state = get();
    const clip = state.clips[clipId];
    if (!clip) return;

    // splitTime is relative to the clip's position on timeline
    const clipPlayStart = clip.offset;
    const clipPlayEnd = clip.trimEnd;

    // Convert splitTime (relative to timeline) to position within clip
    const splitWithinClip = splitTime - clip.startTime + clip.offset;

    // Validate split position
    if (splitWithinClip <= clipPlayStart || splitWithinClip >= clipPlayEnd) {
      return;
    }

    // First clip: from original start to split point
    get().updateClip(clipId, {
      trimEnd: splitWithinClip,
    });

    // Second clip: from split point to original end
    const secondClipStartTime = clip.startTime + (splitWithinClip - clip.offset);
    get().addClip({
      trackId: clip.trackId,
      name: `${clip.name} (2)`,
      fileUrl: clip.fileUrl, // Share the same audio data
      audioBuffer: clip.audioBuffer,
      duration: clip.duration,
      startTime: secondClipStartTime,
      offset: splitWithinClip,
      trimEnd: clipPlayEnd,
      volume: clip.volume,
      fadeIn: 0,
      fadeOut: clip.fadeOut,
    });

    // Update first clip's fadeOut
    get().updateClip(clipId, { fadeOut: 0 });
  },

  autoAlignTrack: (trackId) => {
    const state = get();
    const track = state.tracks.find((t) => t.id === trackId);
    if (!track || track.clipIds.length === 0) return;

    // Get all clips for this track and sort by start time
    const clips = track.clipIds.map((id) => state.clips[id]).filter((clip): clip is AudioClip => clip !== undefined);
    clips.sort((a, b) => a.startTime - b.startTime);

    // Reposition clips sequentially without gaps
    let currentTime = 0;
    for (const clip of clips) {
      const clipDuration = clip.trimEnd - clip.offset;
      get().updateClip(clip.id, { startTime: currentTime });
      currentTime += clipDuration;
    }
  },

  // Selection actions
  selectClip: (clipId, addToSelection = false) => {
    set((state) => {
      if (addToSelection) {
        const newSelection = new Set(state.selectedClipIds);
        newSelection.add(clipId);
        return { selectedClipIds: newSelection };
      }
      return { selectedClipIds: new Set([clipId]) };
    });
  },

  deselectClip: (clipId) => {
    set((state) => {
      const newSelection = new Set(state.selectedClipIds);
      newSelection.delete(clipId);
      return { selectedClipIds: newSelection };
    });
  },

  clearSelection: () => {
    set({ selectedClipIds: new Set() });
  },

  selectAllClipsInTrack: (trackId) => {
    const track = get().tracks.find((t) => t.id === trackId);
    if (!track) return;
    set({ selectedClipIds: new Set(track.clipIds) });
  },

  // Playback actions
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setCurrentTime: (time) => set({ currentTime: Math.max(0, time) }),

  // Zoom actions
  setPixelsPerSecond: (pps) => set({ pixelsPerSecond: Math.max(10, Math.min(200, pps)) }),

  // Export actions
  setIsExporting: (isExporting) => set({ isExporting }),
  setExportProgress: (progress) => set({ exportProgress: Math.max(0, Math.min(100, progress)) }),

  // Media pool actions
  addToMediaPool: (file) => {
    const id = generateMediaId();
    const newMedia: MediaFile = { ...file, id };
    set((state) => ({
      mediaPool: { ...state.mediaPool, [id]: newMedia },
    }));
    return id;
  },

  removeFromMediaPool: (mediaId) => {
    set((state) => {
      const media = state.mediaPool[mediaId];
      if (media?.fileUrl) {
        URL.revokeObjectURL(media.fileUrl);
      }
      const newPool = { ...state.mediaPool };
      delete newPool[mediaId];
      return { mediaPool: newPool };
    });
  },

  createClipFromMedia: (mediaId, trackId, startTime) => {
    const state = get();
    const media = state.mediaPool[mediaId];
    const track = state.tracks.find((t) => t.id === trackId);

    if (!media || !track) return null;

    const clipId = get().addClip({
      trackId,
      name: media.name,
      fileUrl: media.fileUrl,
      audioBuffer: media.audioBuffer,
      duration: media.duration,
      startTime,
      offset: 0,
      trimEnd: media.duration,
      volume: 1,
      fadeIn: 0,
      fadeOut: 0,
    });

    return clipId;
  },

  reset: () => {
    // Revoke all object URLs from clips
    const clips = Object.values(get().clips);
    for (const clip of clips) {
      if (clip.fileUrl) {
        URL.revokeObjectURL(clip.fileUrl);
      }
    }
    // Revoke all object URLs from media pool
    const mediaFiles = Object.values(get().mediaPool);
    for (const media of mediaFiles) {
      if (media.fileUrl) {
        URL.revokeObjectURL(media.fileUrl);
      }
    }
    trackCounter = 0;
    clipCounter = 0;
    mediaCounter = 0;
    set(createInitialState());
  },
}));
