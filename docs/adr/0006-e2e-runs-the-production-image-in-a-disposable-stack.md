# End-to-end tests run the production image in a disposable stack

`bun run test:e2e` builds the `Dockerfile` from the working tree and runs it in a
Docker Compose stack of its own: a fresh Postgres, a fresh RustFS bucket, and the
app container, whose entrypoint applies the migrations exactly as a deployment
does. The stack gets a unique project name and random ports, its secrets are
generated per run, and it is torn down with its volumes when the run ends,
whether the suite passed, failed or was interrupted. The suite never reads `.env`
and never touches the dev database, the dev server or the remote dev storage.

The previous suite ran against the shared dev Postgres and a reused `vite dev`
server, so its results depended on whatever that database held and on dev-mode
behaviour. Running the shipped image is what makes a green run mean something:
production-only behaviour (secure cookies, the enabled rate limiter, the Bun
server's idle timeout, the entrypoint's migrate-then-serve) is exercised rather
than skipped. The price is an image build on every run, which Docker's layer
cache keeps tolerable, so the image and its cache are the one thing the teardown
keeps.

## Considered options

Running `vite dev`, or the production build directly on the host, would start
faster but tests something other than what is deployed, and would still need the
migrations applied by hand. Testcontainers was rejected in favour of a compose
file beside `docker-compose.dev.yml`, which adds no dependency. MinIO and an S3
mock were rejected for RustFS, the storage dev already runs, so the suite meets
the same quirks dev does.

## Consequences

Three things follow from running production mode. The sign-in rate limiter is on,
so each browser context presents its own `cf-connecting-ip` and gets its own
bucket. Signed storage URLs embed `AWS_ENDPOINT`, so the app container and the
browser must resolve the same storage host: the app reaches RustFS as
`host.docker.internal`, and the test browser maps that name to `127.0.0.1`. And
anything that costs money, such as Replicate, stays unconfigured; it is tested by
hand.

_Decided 2026-09-25 · deme_
