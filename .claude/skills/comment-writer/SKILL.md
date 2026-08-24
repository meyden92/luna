---
name: comment-writer
description: >-
  Doctrine for every comment written into code — doc comments,
  docstrings/JSDoc, and inline comments. Invoke automatically before writing
  or editing code that contains or should contain comments, which is
  essentially any coding task: implementing features, fixing bugs,
  refactoring, adding functions, classes, or modules — even when the user
  never mentions comments. Also use when asked to comment, document, annotate,
  or clean up comments in code. Not for prose documentation (README, markdown
  docs) or commit messages.
---

# Comment writing

Applies to every comment that lands in code: doc comments (docstrings, JSDoc, `///`, javadoc), block comments, and inline comments — every language, every file.

## Default: no comment

Well-named code speaks for itself. A function whose name says what it does, a logically named variable or constant, a type whose fields are self-describing — these get nothing. When code seems to need a comment, try a better name first.

## When a comment earns its place

A comment exists to answer one real question the next reader will have that the code cannot answer: a hidden unit, a side effect, a gotcha, an invariant, the why behind a surprising choice.

- One sentence is the norm. A second sentence must answer a second, distinct question.
- Doc comments follow the language's native convention, and one line is the usual size. Skip param-by-param listings that restate names and types.
- Match the surrounding file's comment density and idiom.

## What belongs elsewhere

Comments describe the code as it stands, in timeless present tense, for the future reader of the file. This content has other homes and never appears in comments:

| Content | Home |
| :-- | :-- |
| Issue, ticket, or PR numbers | commit message and PR |
| History and change narration ("was…", "now uses…", "migrated from…") | commit message |
| Design rationale, comparisons to other modules, architectural story | `docs/adr/`, `CONTEXT.md` |
| Future plans and speculation | a GitHub issue |

## Keeping comments in sync

When editing code, re-read every comment adjacent to the change and update any the edit made stale — in the same pass, not as a follow-up.

## Before finishing any code change

- [ ] Every comment answers a question the code cannot; each sentence beyond the first was re-justified on its own
- [ ] Zero issue numbers, history, rationale essays, or plans in any comment
- [ ] Every comment adjacent to the changed code is still true
