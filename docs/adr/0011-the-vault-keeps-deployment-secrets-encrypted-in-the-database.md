# The Vault keeps deployment secrets encrypted in the database

The S3 connection, the CDN URL, the fal keys, the signing secrets and the proxy
settings live in the Vault: a database table an admin fills under
**Settings → Vault**. Each value is encrypted with AES-256-GCM under a key
derived by HKDF from `FORM_FIELD_ENCRYPTION_KEY`, with the entry's name as
additional data, so a ciphertext copied onto another entry does not decrypt. The
environment shrinks to what the app needs before it reaches the database:
`DATABASE_URL`, `FORM_FIELD_ENCRYPTION_KEY`, `BETTER_AUTH_SECRET`,
`BETTER_AUTH_URL` and `PUBLIC_BASE_URL`.

What it protects: a leaked database dump or backup, an admin account that is
taken over (no endpoint ever returns a secret, and every write asks for the
admin's password), and secrets showing in the hosting panel or `docker inspect`.
What it does not protect: whoever holds both the environment and the database,
or runs code in the server process. The server has to read the values without a
human present, so its key has to be somewhere it can reach.

A value set in the environment under the same name wins over the Vault. That is
the way out when a wrong Vault value locks the instance out, and lets the E2E
stack keep configuring itself through env.

Values are served from an in-memory snapshot that every entry point loads
before anything reads it, and that a write replaces, so a change applies
immediately and reads stay synchronous. Consumers fetch the S3 and fal clients
per operation instead of keeping one. Better Auth is configured once at startup,
which is why its secret and URLs stay in the environment.

Losing `FORM_FIELD_ENCRYPTION_KEY` loses the Vault: every entry has to be set
again.

## Considered options

Unsealing at startup with a passphrase that exists only in memory would also
protect against a stolen environment, but every restart, deploy or crash would
leave the instance without storage until an admin unlocks it. An external secret
manager needs its own access token in the environment, which lands in the same
place as a key in env, on someone else's infrastructure. Applying changes on
restart instead of immediately would have kept the code unchanged and let Better
Auth's secret move too, at the cost of a restart per change.

_Decided 2026-11-27 · deme_
