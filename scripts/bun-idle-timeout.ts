/**
 * Raises Bun's request idle timeout for the production server.
 *
 * `Bun.serve` defaults `idleTimeout` to 10 seconds and drops any request whose
 * socket has been quiet for that long, logging "request timed out after 10
 * seconds". That is short enough to kill ordinary work: it is what severed the
 * template generation streams in issue #59, and it applies to every response,
 * not just the streaming ones. `bun run dev` is Vite's Node server and has no
 * such timeout, so nothing of the sort reproduces locally.
 *
 * Nitro's bun preset hardcodes the options it hands to srvx — `{ port,
 * hostname, tls, fetch, bun: { websocket }, plugins }` — and srvx spreads
 * `options.bun` into `Bun.serve`. So the passthrough exists but the preset
 * never exposes it, and there is no environment variable for it either.
 * Wrapping `Bun.serve` before the preset's bootstrap runs is the only seam.
 *
 * Loaded via `bun --preload` from the image's CMD; see the Dockerfile.
 */

/** Long enough that no handler here should ever reach it, short enough to still reap dead sockets. */
const IDLE_TIMEOUT_SECONDS = 120;

const nativeServe = Bun.serve;

// Only a default: an explicit `idleTimeout` from a caller still wins.
Bun.serve = ((options: Parameters<typeof nativeServe>[0], ...rest: unknown[]) =>
  // @ts-expect-error -- forwarding the runtime's own overloaded signature
  nativeServe({ idleTimeout: IDLE_TIMEOUT_SECONDS, ...options }, ...rest)) as typeof nativeServe;
