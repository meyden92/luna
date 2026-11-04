import { describe, expect, test } from 'bun:test';
import { extractOutputs, outputExtension } from './outputs';

describe('extractOutputs', () => {
  test('collects every image of a text-to-image result in order, with dimensions', () => {
    const result = {
      images: [
        { url: 'https://v3.fal.media/a.png', content_type: 'image/png', width: 1024, height: 768 },
        { url: 'https://v3.fal.media/b.jpeg', content_type: 'image/jpeg', width: 512, height: 512 },
      ],
      seed: 42,
      prompt: 'a cat',
      has_nsfw_concepts: [false, false],
    };
    expect(extractOutputs(result)).toEqual([
      { url: 'https://v3.fal.media/a.png', contentType: 'image/png', mediaKind: 'image', width: 1024, height: 768, durationSeconds: null },
      { url: 'https://v3.fal.media/b.jpeg', contentType: 'image/jpeg', mediaKind: 'image', width: 512, height: 512, durationSeconds: null },
    ]);
  });

  test('finds a nested video, audio and 3D file and derives the media kind from the content type', () => {
    const result = {
      video: { url: 'https://v3.fal.media/v.mp4', content_type: 'video/mp4', file_size: 1000, duration: 5.04 },
      extra: { audio_file: { url: 'https://v3.fal.media/s.mp3', content_type: 'audio/mpeg' } },
      model_mesh: { url: 'https://v3.fal.media/m.glb', content_type: 'model/gltf-binary' },
    };
    expect(extractOutputs(result).map((output) => [output.mediaKind, output.contentType, output.durationSeconds])).toEqual([
      ['video', 'video/mp4', 5.04],
      ['audio', 'audio/mpeg', null],
      ['model3d', 'model/gltf-binary', null],
    ]);
  });

  test('falls back to the file extension when fal sends a generic content type', () => {
    const result = { model_glb: { url: 'https://v3.fal.media/files/mesh.glb?x=1', content_type: 'application/octet-stream' } };
    expect(extractOutputs(result)).toMatchObject([{ mediaKind: 'model3d', contentType: 'model/gltf-binary' }]);
  });

  test('ignores objects that are not media: plain urls, text files and unknown types', () => {
    const result = {
      thumbnail_url: 'https://v3.fal.media/t.png',
      captions: { url: 'https://v3.fal.media/c.txt', content_type: 'text/plain' },
      data: { url: 'https://v3.fal.media/d.bin', content_type: 'application/octet-stream' },
      timings: { inference: 1.2 },
    };
    expect(extractOutputs(result)).toEqual([]);
  });

  test('returns nothing for a result without files', () => {
    expect(extractOutputs(null)).toEqual([]);
    expect(extractOutputs({ text: 'hello' })).toEqual([]);
  });
});

describe('outputExtension', () => {
  test('maps content types to the extension stored in the S3 key', () => {
    expect(outputExtension('image/png', 'https://x/a')).toBe('png');
    expect(outputExtension('image/jpeg', 'https://x/a')).toBe('jpg');
    expect(outputExtension('video/mp4', 'https://x/a')).toBe('mp4');
    expect(outputExtension('audio/mpeg', 'https://x/a')).toBe('mp3');
    expect(outputExtension('model/gltf-binary', 'https://x/a')).toBe('glb');
    expect(outputExtension('audio/x-unknown', 'https://x/file.flac')).toBe('flac');
    expect(outputExtension('audio/x-unknown', 'https://x/file')).toBe('bin');
  });
});
