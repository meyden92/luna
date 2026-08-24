#!/bin/sh
# Applies pending migrations, then hands off to the container's command.
#
# The schema has to be in step with the code before the first request arrives,
# and nothing else in this deployment applies migrations. Failing here stops the
# container rather than serving queries against a schema that cannot answer
# them; to start without migrating, override the entrypoint.
set -e

echo "[entrypoint] applying migrations"
bun run db:migrate

exec "$@"
