import { throwIfAborted } from '@/libs/ai-generation-utils';
import { stderrTail } from './errors';

/**
 * Runs `yt-dlp <args>` to completion and returns its stdout. A non-zero exit
 * throws with the output's tail; `signal` kills the process and then throws an
 * AbortError. For short calls like `--version` and `-U`; the runner streams its own.
 */
export async function runYtDlp(args: string[], signal?: AbortSignal): Promise<string> {
  const proc = Bun.spawn(['yt-dlp', ...args], { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', signal });
  const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  throwIfAborted(signal);
  if (exitCode !== 0) {
    throw new Error(`yt-dlp ${args.join(' ')} exited with ${exitCode}: ${stderrTail(stderr) || stderrTail(stdout)}`);
  }
  return stdout;
}

/** The installed yt-dlp's version. Throws when yt-dlp can't be run. */
export async function ytDlpVersion(signal?: AbortSignal): Promise<string> {
  return (await runYtDlp(['--version'], signal)).trim();
}
