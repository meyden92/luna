# Generations run server-side and survive the browser

A Generation lives in the database, not in a browser request. Submitting puts
it on fal's queue and stores it as queued; the browser can close right after.
Two paths bring the result back, and both end in the same idempotent finish
step, which copies every Output into our bucket at once, because fal deletes its
media after a while.

With a webhook, fal calls `POST /api/studio/fal-webhook` when the request is
done, and the app verifies fal's ED25519 signature against its published keys.
Webhooks are only switched on when the instance's public base URL
(`PUBLIC_BASE_URL`, else `BETTER_AUTH_URL`) is `https` on a host fal can reach:
not loopback, not a private address, not a single-label name.

The poller is a loop in the server process, started at boot, that asks fal for
the status of open Generations: all of them every 3 seconds when webhooks are
off, and only those older than two minutes every 60 seconds when they are on.
It reads open Generations from the database, so it picks up where it left off
after a restart.

The webhook is the fast path for a public instance. The poller is the safety net
for a webhook that never arrives, and the only path in development, in the E2E
stack and behind NAT. Open tabs learn about finished Generations through one
event stream per User, which drives the history, a toast and the badge on the
Studio nav entry.

## Considered options

The old feature streamed each generation inside the HTTP request that started
it, for up to four minutes. Closing the tab cancelled it, a proxy or Bun's idle
timeout could drop it (#59), and only one of its three paths was reconciled
after a crash. That is what this replaces, and video jobs make it worse.
Webhooks alone would leave every Generation stuck on an instance fal cannot
reach, and after any lost delivery. Polling alone works everywhere, but makes a
public instance ask fal about long video jobs every few seconds for minutes. A
separate worker or queue service was not needed: the server process and its
task runner already run scheduled work.

## Consequences

E2E only exercises the poller, so the webhook path is checked by hand on a
public instance. Work fal has already been paid for is never thrown away: an
Output is stored even when it puts the User over their storage quota, a
Generation cancelled too late to stop keeps its result, and if the User deletes
such a Generation before fal is done, it still finishes, without Outputs, so its
cost is counted.

_Decided 2026-11-03 · deme_
