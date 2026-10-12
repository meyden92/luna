---
name: playwright-tests
description: Run the Playwright end-to-end suite before handing over a bug fix or feature, and decide whether the change earns a new or extended spec in tests/e2e. Use when implementation work on an issue is finished and a PR or "testing" handover is next, when the user asks to run e2e or Playwright tests, or when an e2e run has failed and needs diagnosing.
when_to_use: Fires at the end of any code change that alters what a user can see or do (a fixed bug, a new screen, a changed flow), even if the user never mentions tests. Also for "run the e2e suite", "do the playwright tests pass", "add a test for this", "why is this spec failing". Skip for changes that cannot affect the running app (docs, issue/PR text, Claude config, CI-only files).
---

# Playwright tests

The suite in `tests/e2e/` is the regression net. Every finished fix or feature passes it before the PR opens, and a change that adds user-visible behaviour leaves a spec behind when the spec would catch a real regression.

`tests/e2e/README.md` is the manual: fixtures, users, the gallery dataset, helpers in `tests/e2e/utils/`. Read it before writing or changing any spec.

## 1. Decide whether the change earns a spec

A spec costs build time on every future run, so it has to guard behaviour that could plausibly break again. Write or extend one when the change is:

- a new user-facing feature or flow (a screen, a dialog, an upload path, an admin action), covering its main path and the one failure a user is most likely to hit;
- a bug fix where the bug was visible through the browser or HTTP, and the broken behaviour has a clear assertion. The spec reproduces the bug: it fails on the old code and passes on the fix;
- a changed contract at an app boundary (`/view`, `/cdn`, `/api/*`, sign-in, permissions).

The change gets no spec when it is styling, copy, a refactor with unchanged behaviour, internal logic a `bun test` unit test covers more cheaply, or a removed feature. When a spec already covers the area, extend that file rather than adding a sibling.

Say the verdict in one line to the user ("Adding a spec to `pastes/pastes.spec.ts` for the expiry fix" or "No spec: CSS-only change"), so they can overrule it.

**Done when** the verdict is stated, and any spec it calls for is written in the matching `tests/e2e/<area>/` folder following the README's "Writing a spec" rules.

## 2. Run

Docker must be running. If `docker info` fails, stop and tell the user; the suite cannot run without it.

Each run builds the production image and seeds a fresh stack, so it takes minutes. Start it with the Bash tool's `run_in_background` and keep working (or wait for the notification). Pass `--reporter=line,html`: the config's only reporter is `html`, which prints no failure details to the terminal.

- New or changed spec: run that file alone first until it is green.

  ```bash
  bun run test:e2e -- tests/e2e/<area>/<file>.spec.ts --reporter=line,html 2>&1 | tail -n 150
  ```

- Then, always, the whole suite once:

  ```bash
  bun run test:e2e -- --reporter=line,html 2>&1 | tail -n 150
  ```

The wrapper tears the stack down itself, also on failure. Leave `docker compose` alone.

**Done when** the full-suite run exits 0, or every failure has a verdict from step 3.

## 3. Diagnose failures

Treat each failure as a bug until the evidence says otherwise. Read the error, then the failed test's folder in `test-results/`: `error-context.md` holds the page snapshot at the moment of failure, and the screenshot sits beside it. Find out why it failed before changing anything.

- **The change broke it.** Fix the app code. Change the spec only when the behaviour it asserts was deliberately changed by this issue, and say so in the PR.
- **The new spec is wrong** (bad selector, missing hydration wait, data shared with a parallel spec). Fix the spec using the README's helpers (`clickUntil`, `untilHydrated`, unique titles on the worker user).
- **Unrelated to the change.** Confirm by running that one spec on `main` (`git stash` or a worktree). If it also fails there, open a GitHub issue for it per the repo's bug-report rule, and name it in the handover. It does not block this PR.

Fix every failure at its cause. Retries, longer timeouts, `test.skip` and `test.fixme` hide the bug instead of fixing it, so they need the user's explicit approval.

**Done when** every failure is fixed and the full suite has passed since the last code change, or each remaining failure is shown to fail on `main` too and has an issue.

## 4. Report

In the handover (and the PR body under testing notes), state:

- the full-suite result: passed / failed count, and the exact command;
- which spec was added or extended, and what it asserts, or why no spec was added;
- any pre-existing failure, with its issue link.
