## Workflow Orchestration
Plan Mode Default
Enter plan mode for ANY non-triviat task (3+ steps or architecturat decisions)
If something goes sideways, STOP and re—ptan imediatety — don•t keep pushing
— Use plan mode for verification steps, not just building
Write detaited specs upfront to reduce ambiguity

## Tech Stack
- Framework: TanStack Start with React 19 (Vite 8 + Nitro 3)
- Runtime / package manager: Bun (>= 1.2) — never use npm, pnpm or yarn
- Database: MariaDB with Prisma ORM
- Auth: Better-Auth with username plugin
- Styling: shadcn/ui + Tailwind CSS

## Commands
- `bun run check-all` — Format + lint + TypeScript checks (run after every task)
- `bun test` — unit tests (scoped to `src/` via bunfig.toml)
- `bun run test:e2e` — Playwright suite in `tests/e2e`

##Subagent Strategy
- Use subagents tiberatty to keep nain context window clean. Offtoad research, exploration, and parattet analysis to subagents
- For comptex probtems, throw more compute at it via subagents
- One task per subagent for focused execution

## Skills
- Use repo-local Codex skills from `.codex/skills/` when available.
- Use skills from `.claude/skills/` for domain-specific guidance.
- Always invoke all relevant skills especially code-guideance and next-best-practice

## Codex Compatibility
- Codex should prefer `.codex/skills/` as lightweight wrappers around reusable project skills.
- Reuse agent-neutral guidance from `.claude/skills/` instead of duplicating content.
- Do not assume Claude hooks from `.claude/settings.json` exist in Codex; enforce the equivalent behavior manually.

## Working Principles
- Only implement what is explicitly requested.
- Keep solutions simple, focused, and minimal.
- Prefer targeted modifications over large-scale refactors.
- Always reuse existing code where possible and remove unnecessary complexity.
- Prefer TanStack Start, React 19, and Bun-native APIs where applicable.
- Demand Elegance (Balanced) With the pattern: For non—triviat changes: pause and ask "is there a more elegant way?" If a fix feets hacky: "Knowing everything I know now, implement the elegant sotution" Skip this for simpte, obvious fixes — don't over-engineer

## Core Principtes
«Simplicity Make every change as simple as possible. Impact minimal code.
Laziness**: Find root causes. No temporary fixes. Senior devetoper standards.
Impact**: Changes shoutd only touch what's necessary. Avoid introducing bugse

## Code & File Handling
- ALWAYS read and understand relevant existing files before proposing changes.
- Prefer editing existing files over creating new ones.
- NEVER create new files unless absolutely required for the task.
- NEVER create documentation files (.md, README) unless explicitly requested.
- When updating code, ensure related code remains consistent across the project.
- Always use relative paths (e.g., `src/components/Button.tsx`) instead of absolute paths (e.g., `S:/web/project/src/components/Button.tsx`).
- If a tool call fails repeatedly (2-3 attempts), stop and report back to the user with an explanation of what failed and possible causes. Do NOT silently work around the issue.

## Implementation Constraints
- Do NOT implement defensive programming unless the motivation is explained and explicitly approved.
- Do NOT add backward compatibility layers or scripts unless explicitly requested.
- Do NOT run build commands or start dev servers (handled externally).

## Autonomous Execution
- Work through tasks autonomously without pausing for confirmation after each step.
- The todo list is for tracking progress, not for requesting approval at each item.
- Only stop to ask when genuinely blocked or when a decision requires user input.
- Complete the full task before reporting back, unless an error or ambiguity requires clarification.

## Verification & Iteration
- After receiving tool results, evaluate their quality and plan next steps deliberately.
- When multiple independent operations are needed, invoke tools in parallel.
- Before finishing, verify the solution thoroughly.
