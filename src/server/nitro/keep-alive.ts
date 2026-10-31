import { definePlugin } from 'nitro';

// Nitro plugin: advertises how long a client may keep reusing an idle connection.
// Bun.serve closes a keep-alive connection after 10s idle (the bun preset exposes no
// way to change that), and a client that reuses the connection as it closes loses its
// request without a response ("socket hang up", ECONNRESET). Node and undici clients
// honour this hint and retire the connection well before the server closes it: 5s is
// half of Bun's timeout, which leaves room for Bun's coarse (~4s) timeout timer.
// Set in the `response` hook because it sees every response, errors and redirects
// included; route-rule headers skip non-2xx responses.
export default definePlugin((nitroApp) => {
  nitroApp.hooks.hook('response', (response) => {
    response.headers.set('keep-alive', 'timeout=5');
  });
});
