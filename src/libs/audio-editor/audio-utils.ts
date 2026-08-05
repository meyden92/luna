/**
 * Format time in seconds to MM:SS.ms format
 */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);

  return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

/**
 * Format time in seconds to MM:SS format (no milliseconds)
 */
export function formatTimeShort(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);

  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Parse time string (MM:SS or MM:SS.ms) to seconds
 */
export function parseTime(timeString: string): number {
  const parts = timeString.split(':');
  if (parts.length !== 2) return 0;

  const minPart = parts[0] ?? '0';
  const secPart = parts[1] ?? '0';

  const mins = Number.parseInt(minPart, 10) || 0;
  const secParts = secPart.split('.');
  const secs = Number.parseInt(secParts[0] ?? '0', 10) || 0;
  const ms = secParts[1] ? Number.parseInt(secParts[1].padEnd(2, '0').slice(0, 2), 10) / 100 : 0;

  return mins * 60 + secs + ms;
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Convert pixels to seconds based on zoom level
 */
export function pixelsToSeconds(pixels: number, pixelsPerSecond: number): number {
  return pixels / pixelsPerSecond;
}

/**
 * Convert seconds to pixels based on zoom level
 */
export function secondsToPixels(seconds: number, pixelsPerSecond: number): number {
  return seconds * pixelsPerSecond;
}

/**
 * Snap time to grid (e.g., nearest 0.1 seconds)
 */
export function snapToGrid(time: number, gridSize = 0.1): number {
  return Math.round(time / gridSize) * gridSize;
}

/**
 * Generate time markers for the ruler based on zoom level
 */
export function generateTimeMarkers(
  duration: number,
  pixelsPerSecond: number,
  viewportWidth: number,
): { time: number; label: string; isMajor: boolean }[] {
  const markers: { time: number; label: string; isMajor: boolean }[] = [];

  // Determine interval based on zoom level
  let majorInterval: number;
  let minorInterval: number;

  if (pixelsPerSecond >= 100) {
    majorInterval = 5; // Every 5 seconds
    minorInterval = 1; // Every second
  } else if (pixelsPerSecond >= 50) {
    majorInterval = 10; // Every 10 seconds
    minorInterval = 2; // Every 2 seconds
  } else if (pixelsPerSecond >= 25) {
    majorInterval = 30; // Every 30 seconds
    minorInterval = 5; // Every 5 seconds
  } else {
    majorInterval = 60; // Every minute
    minorInterval = 10; // Every 10 seconds
  }

  // Calculate visible duration plus some buffer
  const visibleDuration = Math.max(duration, viewportWidth / pixelsPerSecond) + majorInterval;

  for (let time = 0; time <= visibleDuration; time += minorInterval) {
    const isMajor = time % majorInterval === 0;
    markers.push({
      time,
      label: formatTimeShort(time),
      isMajor,
    });
  }

  return markers;
}
