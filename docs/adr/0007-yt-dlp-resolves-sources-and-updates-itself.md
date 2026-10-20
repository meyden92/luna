# yt-dlp resolves Sources and updates itself on a schedule

Downloads resolve a Source's post with the standalone yt-dlp binary baked into the
image, not with a cobalt sidecar, a paid API or a scraper of our own. yt-dlp covers
far more Sources than any alternative, so adding the next Source is mostly an
allowlist entry, and it needs no extra container.

Sources like Instagram break yt-dlp every few weeks and deploys are manual, so a
pinned binary would stay broken until someone noticed and redeployed. The image
therefore pins only a known-good baseline; a scheduled task runs `yt-dlp -U` daily
and at boot, and the admin Tasks screen can run it on demand after a breakage. The
binary lives where the server's user can overwrite it, and a recreated container
falls back to the baseline until the next run. This trades reproducibility of the
running binary for fixes that land without a deploy.

## Considered options

A version pinned in the Dockerfile is reproducible but ties every Source breakage to
a manual deploy. Updating only from the entrypoint is as fresh as the last restart.
cobalt updates by image pull but supports far fewer Sources and adds a service.

_Decided 2026-10-20 · deme_
