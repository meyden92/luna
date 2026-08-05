let videoEl: HTMLVideoElement | null = null;

export function registerVideoEl(el: HTMLVideoElement | null) {
  videoEl = el;
}

export function seekTo(time: number) {
  if (videoEl && Number.isFinite(time)) videoEl.currentTime = time;
}

export function getVideoEl() {
  return videoEl;
}
