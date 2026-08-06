# Agent Instructions

Guidance for Claude Code (and other agents) working in this repository.

# What this project is

LunaShare — a self-hostable file sharing and media platform: upload, store, share
and view files (images, video, audio, documents, code snippets), plus media
editing, AI image generation, share links/forms, analytics and an admin area.

Stack: TanStack Start (React 19, Vite 8, Nitro 3) · Prisma 7 + MariaDB ·
Better-Auth · S3-compatible storage · Tailwind CSS 4 + shadcn/ui · Biome · Bun.
Bun is the only supported package manager and script runner.

## Architecture

Single repository, one full-stack TanStack Start app — no workspaces, no separate
frontend/backend packages. Broad layout:

- `src/routes/` — file-based routes; layout segments (`_dashboard`, `_admin`,
  `_privacy`) plus public pages (`view.$id`, `embed.$id`, `bin.$snippet`,
  `form.$id`) and raw HTTP handlers under `src/routes/api/` (auth, upload,
  download, streaming generation, health).
- `src/server/` — server-side only: `fns/` server functions (the main data layer,
  called from routes/components), `middleware/` (auth, rate limit, logging,
  pagination, error mapping) and `nitro/` startup hooks.
- `src/components/` — UI grouped by feature domain (uploader, file-viewer, admin,
  dashboard, ai, audio/video editors, charting, …) over shadcn/ui in
  `components/ui/`.
- `src/libs/` — shared non-UI logic: Prisma client, S3, auth, RBAC, encryption,
  analytics/egress, moderation, flows, tasks, env validation, runtime config.
- `src/schemas/` — zod schemas shared by server functions and forms.
- `prisma/` — schema and migrations. `tests/e2e/` — Playwright. Docker files and
  `.github/workflows/` at the root build and publish the GHCR image.

Deeper, area-specific guidance lives in nested `CLAUDE.md` files (e.g.
`src/components/charting/CLAUDE.md`); read those when working in that area.

## Operating Principles

- If asked to do too much work at once, stop and state that clearly.
- If computer use is helpful for completing or verifying work, shell out to a gpt model (luna, terra, sol) with '/codex-computer-use' for it.
- Implement only what the user explicitly requested.
- Prefer the smallest correct change that solves the actual problem.
- Keep changes localized and targeted.
- Prefer reusing existing code, utilities, patterns, and conventions before introducing anything new.
- Preserve existing architecture, naming, style, and project structure unless the task explicitly requires changing them.
- Do not perform "while I'm here" cleanups, opportunistic refactors, or unrelated modernization unless it was requested.
- Do not add unnecessary abstractions, indirection, configuration, dependencies, or files.

## Planning and Autonomy

- Read and understand the relevant existing files before proposing or making changes.
- For simple, obvious, localized fixes, proceed directly.
- For non-trivial work, inspect the relevant code first, then produce a concise implementation plan.
- Get explicit approval before implementing when the task:
  - affects multiple unrelated areas,
  - changes architecture,
  - changes public behavior,
  - modifies dependencies,
  - requires a product decision,
  - or involves meaningful ambiguity.
- Once a plan is approved, execute it autonomously without per-step confirmation.
- If implementation materially diverges from the approved plan, stop and report before continuing.
- Only pause when genuinely blocked or when a decision requires user input.
- When blocked, ask the smallest set of necessary questions and batch related questions into one message.

## Root Cause Analysis

Required for bugs, failures, regressions, broken behavior, unexpected output, or failing commands.

- Gather evidence first: error messages, logs, reproduction steps, relevant files, and exact file:line references where possible.
- Form hypotheses and validate them against the evidence. Do not guess.
- Keep asking why until the underlying cause is identified, not only the visible symptom.
- State the root cause explicitly before proposing or implementing the fix.
- The fix must address the root cause directly.
- Workarounds, symptom patches, broad try/catch wrappers, silent fallbacks, retries, and temporary fixes are forbidden unless explicitly approved.
- If the root cause is outside the task scope, stop and report instead of patching around it.

## Quality Bar

- Prefer targeted edits over refactors.
- Touch the minimum code necessary.
- Remove unnecessary complexity instead of adding to it.
- Implement clean, maintainable, and extendable code within the requested scope.
- In case we refactor, look for dead code and remove it.
- Use current stable, project-approved language and framework patterns.
- Avoid deprecated APIs and outdated patterns in code you touch.
- Do not modernize unrelated code, upgrade frameworks, or replace libraries unless explicitly requested.
- Before finalizing a non-trivial change, reassess whether the implementation is the simplest clean solution.
- If there is a clearly better approach within the approved scope, use it.
- Do not expand scope or refactor unrelated code in the name of elegance.

## Code and File Handling

- Always strive for concise, simple solutions.
- If a problem can be solved in a simpler way, propose it.
- Prefer editing existing files over creating new files.
- Create new files only when the requested change cannot be implemented cleanly in existing files.
- Never create documentation files, README files, CHANGELOG entries, migration notes, or implementation summaries unless explicitly requested.
- Keep related code consistent across the project.
- Do not add backward compatibility layers, migration shims, adapters, feature flags, or legacy fallbacks unless explicitly requested.
- Do not add defensive programming unless the motivation is explained and approved.

### Typescript:
- Do not suppress errors to make failures disappear.
- Make use of the latest ES2025/2026 features and prefer Typescript 6.
- Never use 'any' unless 100% necessary or specifically instructed.


## Command and Execution Policy

The agent may run diagnostic commands when needed for investigation or verification, including:

- Type checks, such as `tsc --noEmit`, or equivalent project type-check commands.
- Linters in check-only mode.
- Linter in formatting mode.
- Read-only inspection commands, such as listing files, reading files, searching the codebase, checking git status, and inspecting diffs.

- Don't run dev server commands (e.g, `npm run dev`) - assume it's already running.
- Don't run build commands unless specifically told to.
- Focus on checking commands like typecheck or lint.

## Tool Failure Handling

- If the same tool or command fails 2-3 times, stop and report:
  - what failed,
  - what was attempted,
  - the observed error,
  - the likely cause,
  - what input or decision is needed next.
- Do not silently work around failed tools.
- Do not switch to a different implementation strategy just to bypass a tool failure.

## Execution Efficiency

- When multiple independent inspections are needed, perform them in parallel where the tool environment supports it.
- Use subagents with the sonnet model on medium or low effort for non-trivial research, broad codebase exploration, independent review, or large file-reading tasks.
- Do not use subagents for simple localized edits.
- Subagents should usually investigate or review; the main agent remains responsible for final implementation decisions.

## Picking the right models for workflows and subagents

Rankings, higher = better. Cost reflects what I actually pay (OpenAI is near-free due to subscription), not list price. Intelligence is how hard a problem you can hand the model unsupervised. Taste covers UI/UX, code quality, API design, and copy.

| model    | cost | intelligence | taste |
|----------|------|--------------|-------|
| gpt-5.5  | 9    | 8            | 5     |
| sonnet-5 | 5    | 5            | 7     |
| opus-4.8 | 4    | 7            | 8     |
| fable-5  | 2    | 9            | 9     |

How to apply:
- These are the defaults, not limits. You have standing permission to override them: if a cheaper model's output doesnt meet the bar, rerun or redo the work with a smarter model without asking. Judge the output, not the price tag. Escalating costs less than shipping mediocre work
- Cost is a tie-breaker only; when axes conflict for anything that ships, intelligence > taste > cost.
- Bulk/mechanical work (clear-spec implementation, data analysis, migrations): gpt-5.5 or sonnet-5 - it's effectifly free.
- Anything user-facing (UI, copy, API design) needs taste >= 7.
- Review of plans/implementation: fable-5 or opus-4.8, optionally gpt-5.5 as an extra independant perspective.
- Never use Haiku
- Mechanics: gpt-5.5 is only reachable through the Codex CLI - `codex exec` /`codex review` (my ~/.codex/config.toml defaults to gpt-5.5).
Use the codex skills; for work they don't cover (investigation, data analysis), run `codex exec -s read-only` directly with a self-contained prompt.
- Claude models (sonnet-5, opus-4.8, fable-5) run via the Agent/Workflow model parameter.

Using gpt-5.5 inside workflows and subagents (the model parameter only takes Claude models, so use a wrapper):
- Spawn a thin Claude wrapper agent with `model: 'sonnet', effort: 'low'` whose prompt instructs it to write a self-contained codex prompt, run 'codex exec' via Bash, and return the report (use 'schema' on the wrapper to get structured output back).
- Always label these agents with a 'gpt-5.5' prefix, eg: `{label: 'gpt-5.5:review-auth'}` - the workflow UI shows the wrapper's Claude model, so the label is the only indication the real worker is gpt-5.5.
- Codex runs can exceeds Bash's 10-minute timeout: pass an explicit timeout, or run in the background and poll for the report file.
- Parrallel gpt-5.5 implementation agentns must use `isolation: 'worktree'` so codex edits don't collide in the shared checkout.
- Workflow token budgets only count Claude tokens; codex work is free and invisible to `budget.spent()`.