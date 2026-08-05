import type { FFmpeg } from '@ffmpeg/ffmpeg';

const FFMPEG_CORE_BASE_URL = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd';

type FFmpegLoader = {
  getFFmpeg: () => Promise<FFmpeg>;
  terminateFFmpeg: () => void;
};

type FFmpegLoaderOptions = {
  cancelledErrorMessage?: string;
};

export async function loadFFmpegCore(instance: FFmpeg): Promise<void> {
  const [coreResponse, wasmResponse] = await Promise.all([
    fetch(`${FFMPEG_CORE_BASE_URL}/ffmpeg-core.js`),
    fetch(`${FFMPEG_CORE_BASE_URL}/ffmpeg-core.wasm`),
  ]);
  const [coreBlob, wasmBlob] = await Promise.all([coreResponse.blob(), wasmResponse.blob()]);

  const coreURL = URL.createObjectURL(coreBlob);
  const wasmURL = URL.createObjectURL(wasmBlob);

  try {
    await instance.load({ coreURL, wasmURL });
  } finally {
    URL.revokeObjectURL(coreURL);
    URL.revokeObjectURL(wasmURL);
  }
}

export function createFFmpegLoader(options: FFmpegLoaderOptions = {}): FFmpegLoader {
  let ffmpeg: FFmpeg | null = null;
  let ffmpegLoading: Promise<FFmpeg> | null = null;
  let ffmpegGeneration = 0;
  const cancelledErrorMessage = options.cancelledErrorMessage ?? 'FFmpeg job was cancelled.';

  const getFFmpeg = async (): Promise<FFmpeg> => {
    if (ffmpeg?.loaded) return ffmpeg;
    if (ffmpegLoading) return ffmpegLoading;

    const generation = ffmpegGeneration;

    ffmpegLoading = (async () => {
      const { FFmpeg } = await import('@ffmpeg/ffmpeg');
      const instance = new FFmpeg();
      ffmpeg = instance;

      try {
        await loadFFmpegCore(instance);
        if (generation !== ffmpegGeneration || ffmpeg !== instance) {
          instance.terminate();
          throw new Error(cancelledErrorMessage);
        }

        ffmpegLoading = null;
        return instance;
      } catch (error) {
        if (generation === ffmpegGeneration && ffmpeg === instance) {
          ffmpeg = null;
          ffmpegLoading = null;
        }
        throw error;
      }
    })();

    return ffmpegLoading;
  };

  const terminateFFmpeg = () => {
    ffmpegGeneration += 1;
    const instance = ffmpeg;
    ffmpeg = null;
    ffmpegLoading = null;
    instance?.terminate();
  };

  return { getFFmpeg, terminateFFmpeg };
}

export function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

export async function readFileAsBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
