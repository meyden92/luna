---
name: release
description: Cut a LunaShare release. Collects everything merged since the last tag, writes a Discord-style entry at the top of CHANGELOG.md, bumps package.json, lands it through a release PR, then tags and publishes the GitHub release with the same text.
when_to_use: Use before any release, version tag or GitHub release is created, even if the user never mentions the changelog. Phrasings like "let's release", "cut a release", "ship 4.7", "tag a new version", "neues Release", "release erstellen", "taggen wir das", "write the release notes", "what changed since the last release". Never create a v* tag or run gh release create without going through this skill.
argument-hint: "[patch|minor|major|x.y.z]"
allowed-tools: Bash(git fetch *) Bash(git describe *) Bash(git log *) Bash(git diff *) Bash(gh pr view *) Bash(gh issue view *) Bash(gh release view *) Bash(gh release list *)
---

# Release

A release is a `v*` tag on `main`. The tag makes CI build the GHCR image and publish the versioned and `latest` tags, so pushing it is the point of no return. Deployment stays manual.

`CHANGELOG.md` at the repo root holds every release, newest first. The GitHub release body is the same entry without its heading, so the two never drift.

Requested version: `$ARGUMENTS` (empty: you propose one in step 3).

## 1. Find what is unreleased

```bash
git fetch origin --tags
git describe --tags --abbrev=0 origin/main
git log <last-tag>..origin/main --first-parent --format='%h %s'
```

Work against `origin/main`, never the local checkout: this may be a stale worktree. An empty log means there is nothing to release; say so and stop.

**Done when** you hold the last tag and the full first-parent commit list since it.

## 2. Collect the changes

Each `Merge pull request #N` commit is a PR. For each one:

```bash
gh pr view <N> --json number,title,body,closingIssuesReferences
gh issue view <issue> --json number,title,body
```

The PR body and its issues say what changed for the user; commit subjects alone undersell it. Commits pushed to `main` directly count too: read them with `git log -1 <sha>`.

Then check the upgrade facts, which come from the diff, not from PR prose:

```bash
git diff --stat <last-tag>..origin/main -- drizzle/ .env.sample
```

A new `drizzle/<timestamp>_<name>` folder is a migration; read its SQL to say what it does. A changed `.env.sample` means added, renamed or dropped environment variables.

**Done when** every first-parent commit is either in your notes with its user-facing effect or consciously dropped as noise (merge-only, typo, comment reflow), and you know every migration and env change.

## 3. Pick the version

Semver from the notes: a breaking change for self-hosters (a removed env variable they must act on, an incompatible API change) is `major`; any new feature is `minor`; fixes, tests and internals only are `patch`. A requested version in `$ARGUMENTS` wins. Present your pick with the one-line reason.

## 4. Write the entry

Insert it in `CHANGELOG.md` above the newest `## v…` entry:

```markdown
## v4.7.0 (2026-11-02)

<intro>

### ✨ New
### 🔧 Improved
### 🐛 Fixed
### 🧪 Under the hood
### ⬆️ Upgrade

Implemented in #…
```

Leave out sections with nothing in them, except **Upgrade**, which is always there.

The voice is a Discord changelog: a cheeky one- or two-line intro that sums up the release, then bullets with a bold lead-in and a joke where one fits. The humour rides on top of facts: every bullet still says exactly what changed, where it lives in the app (path, menu, button name) and any limit a user will hit. A bullet that is funny but vague has failed. Under the hood is for tests, CI and refactors, kept short.

**Upgrade is deadpan.** Someone deploys from it, so it is plain instructions: each migration by folder name with what it does and `bun run db:migrate`, each env variable to add, rename or remove, or "No migrations and no new environment variables." End it with the standing line: "The vX.Y.Z tag triggers the GHCR image build and publishes the versioned and latest tags. Deployment is still manual."

The closing line credits the PRs and the issues they closed, as the older entries do: "Implemented in #200 (for #58) and #213 (for #123, #192)." Reference only this repo's numbers.

Example of the voice (one release, trimmed):

```markdown
## v4.6.0 (2026-10-31)

Discord finally stopped wrapping our images in a link-preview sandwich. Also: you can rename files again, like a civilised person.

### ✨ New

- **Images go straight into Discord:** share links for public JPG, PNG, GIF and WebP files now end in their extension (`/view/<id>.jpg`), so Discord shows just the picture, no card. Browsers still get the normal share page and old links keep working. Discord caches per URL, so paste a fresh link to see it.
- **Rename and retag from the Preview:** Name and Tags fields now sit above Folder. Enter saves, Esc regrets. The card's ⋯ menu has a **Rename** item that jumps straight there.

### 🐛 Fixed

- **Fewer ghosted connections:** the server sends `Keep-Alive: timeout=5`, so clients hang up before we do instead of talking into a closed socket.

### ⬆️ Upgrade

No migrations and no new environment variables.

The v4.6.0 tag triggers the GHCR image build and publishes the versioned and latest tags. Deployment is still manual.

Implemented in #200 (for #58), #196 (for #101) and #213 (for #123, #192).
```

Run the `unslop` skill over the draft before showing it.

**Done when** every change from step 2 appears in exactly one bullet and the Upgrade section lists every migration and env change you found.

## 5. Get the go-ahead

Show the user the version and the full entry, and wait. They edit tone and content here; apply their changes to `CHANGELOG.md` until they approve.

## 6. Land the release PR

From a fresh branch off `origin/main`:

```bash
git switch -c release/vX.Y.Z origin/main
```

Set `"version"` in `package.json` to `X.Y.Z`, keep the approved `CHANGELOG.md`, commit as `chore(release): vX.Y.Z`, push and open the PR with `gh pr create --title "chore(release): vX.Y.Z" --body-file <file>`, the body being the entry. Ask the user to merge it, or merge it yourself only if they say so.

**Done when** the PR is merged into `main`.

## 7. Tag and publish

Tag the merge commit, not your branch:

```bash
git fetch origin
git tag vX.Y.Z origin/main
git push origin vX.Y.Z
gh release create vX.Y.Z --title vX.Y.Z --notes-file <file>
```

The notes file is the entry from `CHANGELOG.md` without its `## vX.Y.Z (date)` heading. Confirm the tag points at the release commit (`git log -1 vX.Y.Z`) before pushing it.

**Done when** `gh release view vX.Y.Z` shows the release as Latest, and you have told the user that CI is now building the image.
