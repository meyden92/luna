# Credential writes go through Better-Auth's server context, not its admin endpoints

Better-Auth's admin plugin exposes `/admin/create-user` and
`/admin/set-user-password` over HTTP, and those are the obvious way to create a
User or reset a password. We deliberately do not use them: they authorise
against Better-Auth's own `user.role` column, while LunaShare's authority is
RBAC — `isSuperAdmin`, or membership of the admin group. Calling them would put
a second, disagreeing definition of "admin" into the system, one that both
refuses real admins and admits anyone holding a `role` value nothing else reads.

Creating a User and setting a password therefore go through Better-Auth's server
context, and authorisation stays where every other privileged operation already
has it: the `admin` middleware on the server function. Password hashing comes
from that same context, so the scheme cannot drift from what sign-in verifies
against.

## Consequences

There is no HTTP surface for either operation, so nothing can be driven from a
browser without passing the RBAC check first. The cost is that Better-Auth's
admin endpoints stay mounted and unused; if one is ever wanted, its authorisation
has to be reconciled with RBAC first rather than adopted as-is.

_Decided 2026-08-24 · deme_
