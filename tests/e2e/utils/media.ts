import type { Page } from '@playwright/test';

/**
 * Plays bytes in the page the way a user's player would and returns what it decoded: the duration, and for video the
 * frame size. Rejects when the browser cannot decode them, so "the output is playable" is one call. Needs a page
 * on the stack's origin only for `blob:` URLs, so any loaded page works.
 */
export async function decodeMedia(
  page: Page,
  bytes: Buffer,
  mimeType: string,
): Promise<{ duration: number; width: number; height: number }> {
  return page.evaluate(
    ({ base64, type }) =>
      new Promise<{ duration: number; width: number; height: number }>((resolve, reject) => {
        const raw = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([raw], { type }));
        const element = document.createElement(type.startsWith('video/') ? 'video' : 'audio');
        element.preload = 'metadata';
        element.onerror = () => reject(new Error(`The browser cannot decode this ${type} (error ${element.error?.code})`));
        element.onloadedmetadata = () => {
          // A streamed container reports Infinity until the end is reached; seeking there makes it real.
          if (element.duration === Number.POSITIVE_INFINITY) {
            element.ontimeupdate = () => resolve({ duration: element.duration, width: 0, height: 0 });
            element.currentTime = 1e9;
            return;
          }
          resolve({
            duration: element.duration,
            width: (element as HTMLVideoElement).videoWidth ?? 0,
            height: (element as HTMLVideoElement).videoHeight ?? 0,
          });
        };
        element.src = url;
      }),
    { base64: bytes.toString('base64'), type: mimeType },
  );
}

/**
 * Records a short MP4 with a video track and an audio track (a tone) in the browser, for specs that need a video
 * the corpus does not have: `clip.mp4` has no audio. Chromium's MediaRecorder writes the MP4 (fragmented).
 */
export async function recordClipWithSound(page: Page, seconds: number): Promise<Buffer> {
  const base64 = await page.evaluate(async (length) => {
    const type = 'video/mp4;codecs=avc1.42E01E,mp4a.40.2';
    if (!MediaRecorder.isTypeSupported(type)) throw new Error('This Chromium cannot record MP4');
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const context = canvas.getContext('2d')!;
    const audio = new AudioContext();
    const sink = audio.createMediaStreamDestination();
    const tone = audio.createOscillator();
    tone.connect(sink);
    tone.start();
    const stream = new MediaStream([...canvas.captureStream(25).getVideoTracks(), ...sink.stream.getAudioTracks()]);
    const recorder = new MediaRecorder(stream, { mimeType: type });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => chunks.push(event.data);
    const stopped = new Promise((done) => {
      recorder.onstop = done;
    });
    recorder.start();
    const startedAt = performance.now();
    // Repaint so the video track keeps producing frames until the length is up.
    while (performance.now() - startedAt < length * 1000) {
      context.fillStyle = `hsl(${(performance.now() / 10) % 360} 80% 50%)`;
      context.fillRect(0, 0, 320, 240);
      await new Promise((next) => requestAnimationFrame(next));
    }
    recorder.stop();
    await stopped;
    tone.stop();
    await audio.close();
    const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  }, seconds);
  return Buffer.from(base64, 'base64');
}
