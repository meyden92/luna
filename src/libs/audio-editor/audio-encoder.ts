import { createFFmpegLoader, downloadBlob, toArrayBuffer } from '../ffmpeg/load-core';

const { getFFmpeg } = createFFmpegLoader();

/**
 * Convert AudioBuffer to WAV file bytes for FFmpeg input
 */
function audioBufferToWavBytes(buffer: AudioBuffer): Uint8Array {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const samples = buffer.length;
  const dataLength = samples * blockAlign;
  const bufferLength = 44 + dataLength;

  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);

  // 44-byte canonical WAV header (RIFF/WAVE + fmt + data chunks), little-endian.
  // Offsets map to the WAV spec fields:
  writeString(view, 0, 'RIFF');
  view.setUint32(4, bufferLength - 8, true); // ChunkSize: total file size minus the 8-byte RIFF tag
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size: 16 for PCM
  view.setUint16(20, 1, true); // AudioFormat: 1 = PCM (uncompressed)
  view.setUint16(22, numChannels, true); // NumChannels
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, sampleRate * blockAlign, true); // ByteRate = SampleRate * BlockAlign
  view.setUint16(32, blockAlign, true); // BlockAlign = NumChannels * BytesPerSample
  view.setUint16(34, bitDepth, true); // BitsPerSample
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true); // Subchunk2Size: byte length of the sample data that follows

  // Write audio data
  const channelsData: Float32Array[] = [];
  for (let i = 0; i < numChannels; i++) {
    channelsData.push(buffer.getChannelData(i));
  }

  let offset = 44;
  for (let i = 0; i < samples; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = channelsData[channel];
      const sampleValue = channelData ? (channelData[i] ?? 0) : 0;
      const sample = Math.max(-1, Math.min(1, sampleValue));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Uint8Array(arrayBuffer);
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

export async function encodeMP3(buffer: AudioBuffer, bitrate = 128): Promise<Blob> {
  const instance = await getFFmpeg();

  // Convert AudioBuffer to WAV bytes
  const wavBytes = audioBufferToWavBytes(buffer);

  // Write input file
  await instance.writeFile('input.wav', wavBytes);

  // Run FFmpeg to convert to MP3
  await instance.exec(['-i', 'input.wav', '-b:a', `${bitrate}k`, '-f', 'mp3', 'output.mp3']);

  // Read output file
  const data = await instance.readFile('output.mp3');

  // Cleanup
  await instance.deleteFile('input.wav');
  await instance.deleteFile('output.mp3');

  return new Blob([toArrayBuffer(data as Uint8Array)], { type: 'audio/mp3' });
}

export function encodeWAV(buffer: AudioBuffer): Blob {
  const wavBytes = audioBufferToWavBytes(buffer);
  return new Blob([toArrayBuffer(wavBytes)], { type: 'audio/wav' });
}

export async function encodeOGG(buffer: AudioBuffer, quality = 5): Promise<Blob> {
  const instance = await getFFmpeg();

  const wavBytes = audioBufferToWavBytes(buffer);
  await instance.writeFile('input.wav', wavBytes);

  await instance.exec(['-i', 'input.wav', '-c:a', 'libvorbis', '-q:a', quality.toString(), 'output.ogg']);

  const data = await instance.readFile('output.ogg');

  await instance.deleteFile('input.wav');
  await instance.deleteFile('output.ogg');

  return new Blob([toArrayBuffer(data as Uint8Array)], { type: 'audio/ogg' });
}

export async function encodeAAC(buffer: AudioBuffer, bitrate = 128): Promise<Blob> {
  const instance = await getFFmpeg();

  const wavBytes = audioBufferToWavBytes(buffer);
  await instance.writeFile('input.wav', wavBytes);

  await instance.exec(['-i', 'input.wav', '-c:a', 'aac', '-b:a', `${bitrate}k`, 'output.m4a']);

  const data = await instance.readFile('output.m4a');

  await instance.deleteFile('input.wav');
  await instance.deleteFile('output.m4a');

  return new Blob([toArrayBuffer(data as Uint8Array)], { type: 'audio/mp4' });
}

/**
 * Encode AudioBuffer to FLAC format using FFmpeg
 */
export async function encodeFLAC(buffer: AudioBuffer): Promise<Blob> {
  const instance = await getFFmpeg();

  const wavBytes = audioBufferToWavBytes(buffer);
  await instance.writeFile('input.wav', wavBytes);

  await instance.exec(['-i', 'input.wav', '-c:a', 'flac', 'output.flac']);

  const data = await instance.readFile('output.flac');

  await instance.deleteFile('input.wav');
  await instance.deleteFile('output.flac');

  return new Blob([toArrayBuffer(data as Uint8Array)], { type: 'audio/flac' });
}

export { downloadBlob };
