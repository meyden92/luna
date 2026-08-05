export type AudioFormat = 'mp3' | 'wav' | 'ogg' | 'aac' | 'flac';
export type QualityPreset = 'high' | 'balanced' | 'small';

export type ConversionPhase = 'idle' | 'file-selected' | 'converting' | 'cancelling' | 'complete' | 'error';

export interface ConversionOptions {
  inputFile: File;
  outputFormat: AudioFormat;
  preset: QualityPreset;
  onProgress?: (percentage: number) => void;
}

export interface ConversionStats {
  originalSize: number;
  convertedSize: number;
  originalFormat: string;
  convertedFormat: AudioFormat;
}

export const SUPPORTED_VIDEO_FORMATS = ['mp4', 'webm', 'mkv', 'avi', 'mov', 'flv', 'm4v', 'wmv'];
export const SUPPORTED_AUDIO_FORMATS: AudioFormat[] = ['mp3', 'wav', 'ogg', 'aac', 'flac'];
