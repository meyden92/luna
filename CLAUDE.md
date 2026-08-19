# Agent Guidelines

## Coding preferences - general

- Keep things simple. Channel "yagni" energy unless told otherwise
- Typesafety is useful, take advantage of it.
- Don't be scared to propose bold ideas if they can meaningfully benefit our work.
- Be careful with destructive actions that are not explicitly requested by the user.
- Tests are good! Endless smoke tests, "regression tests" for feature deletions, etc, much less good. Tests should be focused, not slop.
- Comments are a great way to clarify functionality and how code is used. Don't comment every line, but feel free to describe (concisely) how functions are used above function definitions, classes, etc.
- Keep comments up to date! When making changes, it's important to keep things in sync.
- Prefer the smallest correct change that solves the actual problem.
- Prefer reusing existing code, utilities, patterns, and conventions before introducing anything new.
- Reuse or extend existing UI components before creating something new.
- Try to avoid supporting backward compatibility or migrations, unless told to.

## Done means done

Not half done. Not done except for the part you decided to skip. And not a report about how it will be done.

Five things asked means five things delivered, no matter how long they'll take. If the fifth is genuinely blocked, finish the other four and name the blocker in one sentence. The specific blocker. Not "this needs more investigation."

## A question is a question

When I ask a question, answer it. Do not implement it.

"Should we use X?" is not "migrate everything to X." "What would it take to add Y?" is not "add Y."

When in doubt, assume it's a question. Answer first. Act when I say go.

## Speed (Opus 5 only)

When running as Opus 5: optimize for wall-clock speed. Finish tasks quickly.

- Parallelize aggressively. Independent tasks run at the same time, never one after another — batch tool calls, spawn subagents concurrently.
- Delegate by complexity: Sonnet 5 subagents for routine work (search, bulk edits, boilerplate, verification), Opus 5 subagents for hard reasoning that can run independently.
- Keep working in the main thread while subagents run — don't sit idle waiting on them.
- Don't over-deliberate. Enough info to act = act. No long option surveys for decisions with an obvious default.
- Speed never trades away quality: same rigor, same verification, same "done means done". If parallelizing risks a worse result, slow down.
- No conflicts from parallelism: never let two subagents touch the same files or overlapping scope. Split work by non-overlapping boundaries; merge and reconcile results in the main thread.

## Root cause analysis

The following should be applied to requests for bugs, failures, regressions, broken behavior, unexpected output, or failing commands.

- Gather evidence first: error messages, logs, reproduction steps, relevant files, and exact file:line references where possible.
- Form hypotheses and validate them against the evidence. Do not guess.
- Keep asking why until the underlying cause is identified, not only the visible symptom.
- State the root cause explicitly before proposing or implementing the fix.
- The fix must address the root cause directly.
- Workarounds, symptom patches, broad try/catch wrappers, silent fallbacks, retries, and temporary fixes are forbidden unless explicitly approved.
- If the root cause is outside the task scope, stop and report instead of patching around it.

## Blast radius

- Never touch production, live databases, or daily-driver build/preview channels unless explicitly told to. When a task is adjacent to any of them, name what you are about to touch before touching it.

## Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## Toolchain

- Assume the dev server is already running, no need to start it yourself.

## Workflow

### General Rules

When working on something, no matter what, we need to always reference a github issue. So everything that has been done remains traceable

### Working on issues

When working on a implementation for an issue - Read the full epic on github, change the label to "Doing" and work on it on a separate branch.
When done: Create a Pull Request and change the label to "testing" and instruct the user on how to test out the changes.

### Bug reports

When the user reports a bug that is not relevant to the current implementation task, you should create a issue on github for it and not start on a fix.

### Writing Issues or PRs, general Github rules

NEVER reference Issues/PRs or whatever from other repositories, this creates a backlink on the referenced issue or PR. Never ever reference stuff outside of the repository we are working in!

## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context — `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
