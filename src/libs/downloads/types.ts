// The Download shape shared by the registry, the runner, the server fns and the
// Downloader UI. Everything here is serialisable and carries no file paths.

export type DownloadStatus = 'queued' | 'preparing' | 'ready' | 'failed' | 'expired';
export type VideoStatus = 'pending' | 'preparing' | 'ready' | 'failed';
export type ErrorCategory = 'needs_login' | 'not_found' | 'no_videos' | 'too_large' | 'rate_limited' | 'unrecognised';

export interface DownloadError {
  category: ErrorCategory;
  message: string;
  /** The last ~20 lines of yt-dlp's stderr. */
  detail: string;
}

export interface Video {
  /** 1-based position among the post's videos. */
  index: number;
  status: VideoStatus;
  /** 0–100. */
  progress: number;
  /** `<account>_<shortcode>.mp4`, or `<account>_<shortcode>_<n>.mp4` when the post has several videos: the name Save hands the browser. */
  filename: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
  error?: DownloadError;
}

export interface Download {
  id: string;
  userId: string;
  sourceKey: string;
  canonicalUrl: string;
  shortcode: string;
  account?: string;
  /** A short snippet of the post's caption. */
  caption?: string;
  status: DownloadStatus;
  videos: Video[];
  /** The `index` of the video being prepared, for the "video n of m" label. */
  currentIndex?: number;
  /** Set when the post could not be resolved as a whole, or when every video failed for the same reason. */
  error?: DownloadError;
  createdAt: Date;
  readyAt?: Date;
  expiresAt?: Date;
}

/** A post link a Source accepted, rebuilt from its shortcode. */
export interface ParsedPost {
  sourceKey: string;
  canonicalUrl: string;
  shortcode: string;
}

/** Statuses a Download no longer leaves on its own, so the UI can stop polling. */
export function isTerminal(status: DownloadStatus): boolean {
  return status !== 'queued' && status !== 'preparing';
}
