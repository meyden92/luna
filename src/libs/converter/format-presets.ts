import type { AudioFormat, QualityPreset } from '@/types/converter';

interface PresetConfig {
  args: string[];
  mimeType: string;
  ext: string;
}

type PresetMap = {
  [key in AudioFormat]: {
    [key in QualityPreset]: PresetConfig;
  };
};

export const PRESETS: PresetMap = {
  mp3: {
    high: {
      args: ['-vn', '-acodec', 'libmp3lame', '-b:a', '320k'],
      mimeType: 'audio/mpeg',
      ext: 'mp3',
    },
    balanced: {
      args: ['-vn', '-acodec', 'libmp3lame', '-b:a', '192k'],
      mimeType: 'audio/mpeg',
      ext: 'mp3',
    },
    small: {
      args: ['-vn', '-acodec', 'libmp3lame', '-b:a', '128k'],
      mimeType: 'audio/mpeg',
      ext: 'mp3',
    },
  },
  wav: {
    high: {
      args: ['-vn', '-acodec', 'pcm_s24le'],
      mimeType: 'audio/wav',
      ext: 'wav',
    },
    balanced: {
      args: ['-vn', '-acodec', 'pcm_s16le'],
      mimeType: 'audio/wav',
      ext: 'wav',
    },
    small: {
      args: ['-vn', '-acodec', 'pcm_s16le'],
      mimeType: 'audio/wav',
      ext: 'wav',
    },
  },
  ogg: {
    high: {
      args: ['-vn', '-c:a', 'libvorbis', '-q:a', '8'],
      mimeType: 'audio/ogg',
      ext: 'ogg',
    },
    balanced: {
      args: ['-vn', '-c:a', 'libvorbis', '-q:a', '5'],
      mimeType: 'audio/ogg',
      ext: 'ogg',
    },
    small: {
      args: ['-vn', '-c:a', 'libvorbis', '-q:a', '3'],
      mimeType: 'audio/ogg',
      ext: 'ogg',
    },
  },
  aac: {
    high: {
      args: ['-vn', '-c:a', 'aac', '-b:a', '256k'],
      mimeType: 'audio/mp4',
      ext: 'm4a',
    },
    balanced: {
      args: ['-vn', '-c:a', 'aac', '-b:a', '128k'],
      mimeType: 'audio/mp4',
      ext: 'm4a',
    },
    small: {
      args: ['-vn', '-c:a', 'aac', '-b:a', '96k'],
      mimeType: 'audio/mp4',
      ext: 'm4a',
    },
  },
  flac: {
    high: {
      args: ['-vn', '-c:a', 'flac', '-compression_level', '12'],
      mimeType: 'audio/flac',
      ext: 'flac',
    },
    balanced: {
      args: ['-vn', '-c:a', 'flac', '-compression_level', '8'],
      mimeType: 'audio/flac',
      ext: 'flac',
    },
    small: {
      args: ['-vn', '-c:a', 'flac', '-compression_level', '5'],
      mimeType: 'audio/flac',
      ext: 'flac',
    },
  },
};

export function getMimeType(format: AudioFormat, preset: QualityPreset): string {
  return PRESETS[format][preset].mimeType;
}

export function getExtension(format: AudioFormat, preset: QualityPreset): string {
  return PRESETS[format][preset].ext;
}

export function getFormatArgs(format: AudioFormat, preset: QualityPreset): string[] {
  return PRESETS[format][preset].args;
}
