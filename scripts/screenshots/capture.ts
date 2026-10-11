/**
 * Captures full-page screenshots of the main routes in both Appearances so the
 * owner can compare the app before and after a styling change (epic #64).
 *
 *   bun run screenshots before   # against main
 *   bun run screenshots after    # against the finished branch
 *
 * Runs the Playwright spec `tests/screenshots/capture.spec.ts` on the same
 * disposable stack as `bun run test:e2e` (`scripts/e2e/run.ts`): production
 * image, fresh database, torn down afterwards. Needs Docker and nothing else;
 * no dev server, no dev database, no `.env`. The spec seeds a public file,
 * snippet and form share for the share pages. Output lands in
 * .scratch/screenshots/<label>/, which is gitignored; nothing here is a test,
 * and the normal suite never runs it (`playwright.screenshots.config.ts`).
 */
const label = process.argv[2];
if (!label) {
  console.error('usage: bun run screenshots <label>');
  process.exit(1);
}

const child = Bun.spawn(['bun', '--no-env-file', 'scripts/e2e/run.ts', '-c', 'playwright.screenshots.config.ts'], {
  env: { ...process.env, SCREENSHOT_LABEL: label },
  stdio: ['inherit', 'inherit', 'inherit'],
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => child.kill(signal));
process.exit(await child.exited);
