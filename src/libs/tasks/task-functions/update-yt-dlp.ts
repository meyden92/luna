import { throwIfAborted } from '@/libs/ai-generation-utils';
import type { TaskFunction } from '@/types/tasks';

const OUTPUT_TAIL_LINES = 20;

function tail(text: string): string {
  return text.trim().split('\n').slice(-OUTPUT_TAIL_LINES).join('\n');
}

// Runs `yt-dlp <args>` and returns its stdout. A non-zero exit throws with the
// stderr tail. The abort signal kills the process when the task times out.
async function runYtDlp(args: string[], signal: AbortSignal): Promise<string> {
  const proc = Bun.spawn(['yt-dlp', ...args], { stdout: 'pipe', stderr: 'pipe', signal });
  const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  throwIfAborted(signal);
  if (exitCode !== 0) {
    throw new Error(`yt-dlp ${args.join(' ')} exited with ${exitCode}: ${tail(stderr) || tail(stdout)}`);
  }
  return stdout;
}

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

  const before = (await runYtDlp(['--version'], signal)).trim();
  const output = await runYtDlp(['-U'], signal);
  const after = (await runYtDlp(['--version'], signal)).trim();

  return {
    summary: before === after ? `yt-dlp ${after} already current` : `yt-dlp ${before} → ${after}`,
    details: tail(output),
  };
};
