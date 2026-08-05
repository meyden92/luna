import { create } from 'zustand';
import { revokeThumbnailUrls } from '@/libs/video-editor/ffmpeg-video';

export type EditorMode = 'trim' | 'cut' | 'crop';
export type CropAspect = 'original' | '1:1' | '16:9' | '4:3' | '3:4' | 'custom';
export type Phase = 'idle' | 'loading' | 'ready' | 'exporting' | 'error';

export interface CutSegment {
  id: string;
  start: number;
  end: number;
}

export interface CropBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface VideoEditorState {
  file: File | null;
  objectUrl: string | null;
  duration: number;
  videoWidth: number;
  videoHeight: number;

  mode: EditorMode;
  phase: Phase;
  loadError: string | null;
  exportProgress: number;

  currentTime: number;
  isPlaying: boolean;

  trimStart: number;
  trimEnd: number;

  cuts: CutSegment[];

  crop: CropBox;
  cropAspect: CropAspect;

  pendingCutStart: number | null;

  thumbnails: string[];

  setFile: (file: File, objectUrl: string, duration: number, width: number, height: number) => void;
  setPhase: (phase: Phase, error?: string | null) => void;
  setExportProgress: (progress: number) => void;
  setMode: (mode: EditorMode) => void;
  setCurrentTime: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setTrim: (start: number, end: number) => void;
  addCut: (start: number, end: number) => void;
  removeCut: (id: string) => void;
  toggleCutAtCurrentTime: () => void;
  setCrop: (crop: CropBox) => void;
  setCropAspect: (aspect: CropAspect) => void;
  setThumbnails: (thumbs: string[]) => void;
  resetEdits: () => void;
  reset: () => void;
}

let cutCounter = 0;
const nextCutId = () => `cut-${++cutCounter}`;

const initialEditState = {
  mode: 'trim' as EditorMode,
  currentTime: 0,
  isPlaying: false,
  trimStart: 0,
  trimEnd: 0,
  cuts: [] as CutSegment[],
  crop: { x: 0, y: 0, w: 1, h: 1 } as CropBox,
  cropAspect: 'original' as CropAspect,
  pendingCutStart: null as number | null,
};

export function hasPendingVideoEdits(state: VideoEditorState): boolean {
  if (!state.file || state.phase !== 'ready') return false;

  const hasTrim = state.duration > 0 && (state.trimStart > 0.001 || Math.abs(state.trimEnd - state.duration) > 0.001);
  const hasCrop = state.cropAspect !== 'original' || state.crop.x !== 0 || state.crop.y !== 0 || state.crop.w !== 1 || state.crop.h !== 1;

  return hasTrim || state.cuts.length > 0 || hasCrop || state.pendingCutStart !== null;
}

export const useVideoEditorStore = create<VideoEditorState>((set, get) => ({
  file: null,
  objectUrl: null,
  duration: 0,
  videoWidth: 0,
  videoHeight: 0,

  phase: 'idle',
  loadError: null,
  exportProgress: 0,

  thumbnails: [],

  ...initialEditState,

  setFile: (file, objectUrl, duration, width, height) =>
    set({
      file,
      objectUrl,
      duration,
      videoWidth: width,
      videoHeight: height,
      trimStart: 0,
      trimEnd: duration,
      crop: { x: 0, y: 0, w: 1, h: 1 },
      cropAspect: 'original',
      cuts: [],
      currentTime: 0,
      isPlaying: false,
      phase: 'ready',
      loadError: null,
      exportProgress: 0,
    }),

  setPhase: (phase, error = null) => set({ phase, loadError: error }),
  setExportProgress: (exportProgress) => set({ exportProgress }),

  setMode: (mode) => set({ mode }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),

  setTrim: (start, end) => {
    const { duration } = get();
    const s = Math.max(0, Math.min(start, duration));
    const e = Math.max(s + 0.05, Math.min(end, duration));
    set({ trimStart: s, trimEnd: e });
  },

  addCut: (start, end) => {
    const { duration, cuts } = get();
    const s = Math.max(0, Math.min(start, duration));
    const e = Math.max(s + 0.05, Math.min(end, duration));
    set({ cuts: [...cuts, { id: nextCutId(), start: s, end: e }] });
  },

  removeCut: (id) => set({ cuts: get().cuts.filter((c) => c.id !== id) }),

  toggleCutAtCurrentTime: () => {
    const { pendingCutStart, currentTime } = get();
    if (pendingCutStart === null) {
      set({ pendingCutStart: currentTime });
      return;
    }
    const start = Math.min(pendingCutStart, currentTime);
    const end = Math.max(pendingCutStart, currentTime);
    set({ pendingCutStart: null });
    if (end - start >= 0.1) get().addCut(start, end);
  },

  setCrop: (crop) =>
    set({
      crop: {
        x: Math.max(0, Math.min(crop.x, 1)),
        y: Math.max(0, Math.min(crop.y, 1)),
        w: Math.max(0.05, Math.min(crop.w, 1 - Math.max(0, Math.min(crop.x, 1)))),
        h: Math.max(0.05, Math.min(crop.h, 1 - Math.max(0, Math.min(crop.y, 1)))),
      },
    }),

  setCropAspect: (cropAspect) => set({ cropAspect }),

  setThumbnails: (thumbnails) => {
    revokeThumbnailUrls(get().thumbnails);
    set({ thumbnails });
  },

  resetEdits: () => {
    const { duration } = get();
    set({
      trimStart: 0,
      trimEnd: duration,
      cuts: [],
      crop: { x: 0, y: 0, w: 1, h: 1 },
      cropAspect: 'original',
      currentTime: 0,
      isPlaying: false,
      exportProgress: 0,
      mode: 'trim',
      pendingCutStart: null,
    });
  },

  reset: () => {
    const { objectUrl, thumbnails } = get();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    revokeThumbnailUrls(thumbnails);
    cutCounter = 0;
    set({
      file: null,
      objectUrl: null,
      duration: 0,
      videoWidth: 0,
      videoHeight: 0,
      phase: 'idle',
      loadError: null,
      exportProgress: 0,
      thumbnails: [],
      ...initialEditState,
    });
  },
}));
