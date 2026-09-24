# The Utility look replaces the previous token values outright

ADR 0004 left the door open for "a second set of token values under a root
attribute", and the Utility design handoff proposed walking through it:
`<html data-look="utility">` alongside `data-theme`. We are not taking that door.
Utility's values replace the previous ones in `src/styles/tokens.css`, and the
warm-green palette, the generous radii and the serif display face leave the
repository with them.

The distinction ADR 0004 did not draw is between a *variation* and a
*replacement*. A variation is a choice someone makes, so it needs somewhere to
live and a switch to set it. Utility is not offered as a choice: it is what the
app looks like now. Keeping the old values under an attribute nobody sets would
leave a second design in the tree that no screen renders, no reviewer reads and
no test covers — dead code with a plausible excuse. The one real constraint, that
the Appearance keeps working, is satisfied by `light-dark()` either way.

Two consequences fall out of that. `--font-display` stays Instrument Serif
because the marketing site still uses it, and the app reads a new `--font-title`
instead, so "no serif in the app" is enforced by which token a module reaches for
rather than by discipline. And the body radial glow and the paper-grain overlay
are deleted from `base.css` rather than switched off, since nothing turns them
back on.

Motion becomes vocabulary at the same time. `--spring` and `--ease-out-expo` join
the token scale, and `src/styles/motion.css` holds the parts a CSS Module cannot
reach: the registered `--n` integer behind animated counters, and the
view-transition scopes for `page`, `gallery` and `preview` changes. Those rules
are written inside `@media (prefers-reduced-motion: no-preference)` rather than
overridden in a `reduce` block, so honouring the preference never needs
`!important`.

## Considered options

Shipping `data-look="utility"` as the handoff described was rejected for the
reason above, and because the attribute would have to be set somewhere — on the
server-rendered root, next to `data-theme` — which is real plumbing for a
constant.

Adding the Utility values as a new set and deleting the old ones in a follow-up
was rejected because the follow-up is the whole change; doing it later only means
reviewing the diff twice.

## Consequences

There is one look. A future second one would be a new decision, and this ADR is
not evidence that the mechanism exists.

_Decided 2026-09-24 · deme_
