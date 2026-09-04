# CSS Modules and cascade layers replace Tailwind

Almost all UI code is now written by AI, and Tailwind's strength — composing a
look inline while a human types — turned into a weakness: 4300 class strings,
960 one-off arbitrary values, and a design that drifted because nothing forced
a shared scale. We are removing Tailwind, tw-animate-css and tailwind-merge
entirely rather than keeping them inside the shadcn/ui components, since those
are exactly the files AI edits most.

Every component owns a co-located CSS Module written in plain CSS. Modules are
chosen over global stylesheets or `@scope` because collisions across three
hundred AI-authored files must be impossible by construction, not discouraged
by naming discipline. Modules ship a generated, committed `.d.ts` so a
misspelled class fails typecheck for Codex runners, not just in an editor.

Variants are data attributes (`data-variant`, `data-size`) styled with
attribute selectors, matching how Base UI already exposes its own state, so
`cva()` disappears and `cn()` reduces to `clsx`.

Global stylesheets are limited to a reset, the token scale, base element styles
and a bounded utility set: layout primitives, spacing and typography steps read
from the tokens, `container` and `sr-only`. No colour or border utilities exist,
because a colour utility on a component is the local override that breaks a
uniform design. Cascade order is fixed as `@layer reset, base, components,
utilities`; every module wraps its rules in `@layer components`, so a utility on
a component root wins without `!important`, as it did under Tailwind.

The browser baseline is the current release of the major evergreen browsers.
Anything in Baseline Newly Available is fair game — nesting, container queries,
`:has()`, `@starting-style`, `transition-behavior: allow-discrete`, `color-mix()`,
relative colour syntax, subgrid, `text-wrap: balance`, view transitions. Anchor
positioning is not needed since Base UI positions popups in JavaScript.

## Considered options

Keeping Tailwind only inside `src/components/ui/` was rejected because two
styling systems would coexist forever and the twMerge-based `cn()` would
survive. Global stylesheets with `@scope` were rejected because `@scope` still
needs a unique root selector and so does not remove the naming problem.
Tailwind-compatible utility names were rejected because they invite AI to write
`px-3.5` and expect it to exist.

## Consequences

The shadcn CLI can no longer add or update components; new primitives are
written by hand on Base UI. The migration is a single big-bang branch and is
not a pixel-for-pixel port: arbitrary values snap to the nearest token, and a
one-off value survives only where a token would visibly break the layout.

_Decided 2026-09-04 · deme_
