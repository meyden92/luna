# Username and password replace Discord OAuth outright

LunaShare authenticated humans solely through Discord OAuth, which made a
third party the gatekeeper of a self-hosted service and tied sign-in to an
account the operator does not control. We replaced it with better-auth's
username plugin and deleted the Discord provider in one step rather than
running the two side by side.

Existing Users are preserved, not migrated: files, tokens, groups and quota all
hang off `user.id`, never off the Discord identifier, which lived only in
`account.accountId` and was read by no application code. Converting a User is
therefore just deleting its Discord Account and attaching a password Account to
the same row.

## Considered Options

Keeping Discord alive as a transitional provider, so each User converts on their
next sign-in, was the obvious path and was rejected: with three known Users it
buys a grace period nobody needs, at the cost of shipping and then removing a
login flow. Cutting over immediately means the first password cannot be set
through the app — hence `scripts/auth/set-credentials.ts`, which is also the
permanent account-recovery path, since LunaShare sends no email and so can offer
no reset link.

_Decided 2026-08-24 · deme_
