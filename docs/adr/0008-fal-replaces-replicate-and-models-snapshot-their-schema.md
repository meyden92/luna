# fal replaces Replicate, and Models snapshot their schema

The Studio runs on fal.ai only. Replicate, its SDK and `REPLICATE_API_TOKEN` are
gone, together with the old AI tables, with no migration: old templates, models,
presets and history were dropped, and only the files old generations saved stay
in Files. fal's catalog is much larger, carries video, audio and 3D next to
images, and gets new models sooner. The app talks to fal through a thin `fetch`
client over its queue, storage and Platform APIs rather than `@fal-ai/client`.
It needs only a handful of calls, and every host comes from one config, which is
what lets the E2E stack point it at a fake (ADR 0006).

fal has no version pinning: an endpoint's input schema can change under the same
id at any time. So a Model stores a snapshot of the schema it was added with,
and its form, validation and cost estimate read that snapshot, never fal's
live schema. A daily task (`check-studio-schemas`) compares every snapshot with
fal's current schema. A difference marks the Model with a badge and a diff that
names the Templates it breaks. Nothing changes until an admin presses *Apply*,
which reconciles the Model's and its Templates' Fields with the new schema.
Models fal marks deprecated are flagged and keep working.

The price is a window, up to a day, in which fal may reject requests built from
an old snapshot, and an admin who has to apply each change. What it buys is
that a Model's form only changes when an admin says so, and that the labels,
narrowed ranges and fixed values admins chose cannot break silently.

## Considered options

Reading the schema live for every form would always match fal, but a fal outage
or a slow catalog call would take the Studio down with it, and a changed schema
would invalidate the admin's Field setup without anyone noticing. Applying
detected drift automatically fails the same way, just once a day. Typing fields
by hand, as the old setup did, is what this replaces. Keeping Replicate next to
fal would have meant two pipelines for one feature.

_Decided 2026-11-03 · deme_
