import type { ConversionOptions } from '@/types/converter';
import { createFFmpegLoader, downloadBlob, readFileAsBytes, toArrayBuffer } from '../ffmpeg/load-core';
import { getExtension, getFormatArgs, getMimeType } from './format-presets';

const { getFFmpeg, terminateFFmpeg } = createFFmpegLoader({ cancelledErrorMessage: 'Conversion was cancelled.' });

export function terminateVideoConverter() {
  terminateFFmpeg();
}

/**
 * Convert video file to audio format
 */
export async function convertVideoToAudio({ inputFile, outputFormat, preset, onProgress }: ConversionOptions): Promise<Blob> {
  const instance = await getFFmpeg();
  const jobId = crypto.randomUUID();
  const inputName = `input_video_${jobId}`;
  const ext = getExtension(outputFormat, preset);
  const outputName = `output_audio_${jobId}.${ext}`;
  const formatArgs = getFormatArgs(outputFormat, preset);
  const mimeType = getMimeType(outputFormat, preset);

  // Capture FFmpeg log messages for debugging
  const logMessages: string[] = [];
  const onLog = ({ type, message }: { type: string; message: string }) => {
    logMessages.push(`[${type}] ${message}`);
    if (type === 'fferror') {
      console.error('FFmpeg error:', message);
    }
  };
  const onProgressEvent = ({ progress }: { progress: number }) => {
    onProgress?.(Math.round(progress * 100));
  };

  instance.on('log', onLog);
  instance.on('progress', onProgressEvent);

  try {
    // Read video file bytes
    const fileBytes = await readFileAsBytes(inputFile);

    // Write input file
    await instance.writeFile(inputName, fileBytes);

    // Build FFmpeg command
    const ffmpegArgs = ['-i', inputName, ...formatArgs, outputName];

    // Run FFmpeg
    await instance.exec(ffmpegArgs);

    // Read output file (wrapped in try-catch to detect conversion failures)
    let outputData: Uint8Array;
    try {
      outputData = (await instance.readFile(outputName)) as Uint8Array;
    } catch {
      // Output file wasn't created - extract useful error info from logs
      const relevantLogs = logMessages
        .filter((msg) => msg.includes('error') || msg.includes('Audio') || msg.includes('unknown'))
        .join('\n');

      console.error('FFmpeg logs:', logMessages);

      if (relevantLogs.includes('Audio') || relevantLogs.includes('audio')) {
        throw new Error('This video has no audio track.');
      }

      throw new Error(`Conversion failed: ${relevantLogs || 'Unknown error. Check browser console for details.'}`);
    }

    // Create and return blob
    return new Blob([toArrayBuffer(outputData as Uint8Array)], { type: mimeType });
  } catch (error) {
    // Log all messages for debugging
    console.error('FFmpeg conversion failed. All logs:', logMessages);

    // Enhance error message for common issues
    const errorMsg = error instanceof Error ? error.message : String(error);

    if (errorMsg.includes('audio')) {
      throw new Error('This video has no audio track.');
    }

    // Return the caught error with more context
    if (error instanceof Error) {
      throw error;
    }

    throw new Error('Conversion failed. Check browser console for details.');
  } finally {
    try {
      await instance.deleteFile(inputName);
    } catch {
      // ignore
    }
    try {
      await instance.deleteFile(outputName);
    } catch {
      // ignore
    }
    instance.off('log', onLog);
    instance.off('progress', onProgressEvent);
  }
}

export { downloadBlob };
