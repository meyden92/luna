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

**<release title>**

<intro>

### ✨ New
### 🔧 Improved
### 🐛 Fixed
### 🧪 Under the hood
### ⬆️ Upgrade

Implemented in #…
```

Leave out sections with nothing in them, except **Upgrade**, which is always there.

The voice is a Discord changelog: written by a friend who is having fun, not by a release manager.

- **Release title:** a bold one-liner that names the release like an episode ("The One Where Discord Stops Framing Our Images"). Puns, pop culture and mild self-roast are all welcome.
- **Intro:** two or three sentences talking to the reader as "you", with "we" for the team, saying what this release is about and why anyone should care.
- **Items** are short paragraphs, not dry bullets: an emoji, a bold headline with a joke or a pun in it, then one to three sentences in plain speech. Lead with what the user can now do or no longer suffers from, and leave how it was built to Under the hood.
- **Every item still carries its facts:** what changed, where it lives (path, menu, button name) and any limit a user will hit. A joke that hides the fact has failed. Specific beats generic: "Esc means never mind" beats "improved keyboard handling".
- **Under the hood** is the one place for tests, CI, refactors and dependencies, a line each, still allowed a wink.

**Upgrade is deadpan.** Someone deploys from it, so it is plain instructions: each migration by folder name with what it does and `bun run db:migrate`, each env variable to add, rename or remove, or "No migrations and no new environment variables." End it with the standing line: "The vX.Y.Z tag triggers the GHCR image build and publishes the versioned and latest tags. Deployment is still manual."

The closing line credits the PRs and the issues they closed, as the older entries do: "Implemented in #200 (for #58) and #213 (for #123, #192)." Reference only this repo's numbers.

Example of the voice (one release, trimmed):

```markdown
## v4.6.0 (2026-10-31)

**The One Where Discord Stops Framing Our Images**

You paste a picture into Discord, Discord shows you the picture. Revolutionary, we know. Also, files can be renamed again, so `IMG_4821.png` can finally become something with dignity.

### ✨ New

🖼️ **Pictures, not postcards.** Share links for public JPG, PNG, GIF and WebP files now end in their extension (`/view/<id>.jpg`), so Discord shows just the image instead of a link-preview card wrapped around it. Browsers still get the normal share page and old links keep working. Discord remembers every URL it has seen, so paste a fresh link to see the difference.

✏️ **Name it, tag it, move on.** The Preview has Name and Tags fields above Folder. Enter saves, Esc means never mind, and tags save the moment you add or remove them. The ⋯ menu on a card got a **Rename** item that drops you right into the name field.

### 🐛 Fixed

🔌 **No more talking to a hung-up phone.** The server now sends `Keep-Alive: timeout=5`, so clients close idle connections before we do instead of sending requests into the void.

### 🧪 Under the hood

Parallel e2e runs stopped tearing down each other's stacks, and three flaky specs got their nerves fixed.

### ⬆️ Upgrade

No migrations and no new environment variables.

The v4.6.0 tag triggers the GHCR image build and publishes the versioned and latest tags. Deployment is still manual.

Implemented in #200 (for #58), #196 (for #101) and #213 (for #123, #192).
```

Run the `unslop` skill over the draft before showing it.

**Done when** every change from step 2 appears in exactly one item and the Upgrade section lists every migration and env change you found.

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
