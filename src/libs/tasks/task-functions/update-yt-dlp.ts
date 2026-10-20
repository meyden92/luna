import { throwIfAborted } from '@/libs/ai-generation-utils';
import { stderrTail } from '@/libs/downloads/errors';
import { runYtDlp, ytDlpVersion } from '@/libs/downloads/yt-dlp';
import type { TaskFunction } from '@/types/tasks';

/**
 * Updates the yt-dlp binary in place with `yt-dlp -U` (ADR 0007).
 *
 * Seeded as a daily task and also run once at boot by the `init-tasks` plugin.
 * yt-dlp only swaps the binary after a complete download, so a failed run
 * leaves the current one working.
 */
export const updateYtDlpExecutor: TaskFunction = async (...args) => {
  const { signal } = args[args.length - 1];
  throwIfAborted(signal);

  const before = await ytDlpVersion(signal);
  const output = await runYtDlp(['-U'], signal);
  const after = await ytDlpVersion(signal);

  return {
    summary: before === after ? `yt-dlp ${after} already current` : `yt-dlp ${before} → ${after}`,
    details: stderrTail(output),
  };
};
