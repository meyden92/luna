# The E2E stack's fake fal service (docker-compose.e2e.yml). The `corpus` build
# context is tests/e2e/fixtures/files, which holds the media results point at.
FROM oven/bun:1-alpine
WORKDIR /fake
COPY catalog.ts server.ts ./
COPY --from=corpus icon-small.png clip.mp4 tone.mp3 ./media/
USER bun
CMD ["bun", "server.ts"]
