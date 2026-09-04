# One semantic colour vocabulary, defined with light-dark(); named themes removed

Two colour vocabularies grew side by side: the shadcn semantic tokens
(`--background`, `--primary`, `--muted`, ...) used about 1500 times, and the
bespoke `--luna-*` palette used about 570 times in 27 files. The swappable
colour themes overrode only the semantic set, so switching a theme recoloured
half the app. We decided the semantic tokens are the only public vocabulary;
the luna palette survives solely as the values behind them.

Dark mode moves from a `.dark` class with a duplicated token block to
`color-scheme` plus `light-dark()`: each token is written once with both
values, the root declares `color-scheme: light dark`, and the user's choice is a
`data-theme` attribute that pins the scheme. Following the system preference
then costs nothing, and native form controls, scrollbars and colour-scheme
aware images get the right scheme for free. next-themes stays as the
attribute-setting mechanism so the server-seeded first paint keeps working.

The named theme system (`default`, `claude`, `modern`, `supabase`, `t3`, the
theme loader, the selector on the settings page) is removed outright. It was a
preview feature that never turned out well, it stored its choice only in
localStorage, and every theme file would have needed a rewrite for `light-dark()`
anyway.

## Consequences

"Theme" in the codebase now means only the light or dark appearance. Any future
colour variation is a second set of token values under a root attribute, not a
stylesheet swap.

_Decided 2026-09-04 · deme_
