# Admins never see successful Generations

What a User makes in the Studio is private to that User. Admins see what they
need to run it: spend per User and per Model, Budget usage, failure rates per
Model, the Generations running right now, and for failed Generations the input
and fal's error, because a broken Model cannot be fixed without them. The prompt
and Outputs of a successful Generation are shown to its owner only. *Save as
Template* works on an admin's own Generations, not on anyone else's.

For the same reason `Generation` and `GenerationOutput` are not audited. The
audit log stores a snapshot of every write and any admin can read it, so
auditing these rows would hand every prompt to admins through the back door.
Spend stays traceable without it: the cost lives on the Generation row, and a
Generation the User deletes is soft-deleted, its input cleared but its cost
kept.

This is a promise about the app, not about the server. Whoever runs the
database can still read every row.

## Considered options

Showing admins everything would help with moderation, but then every User would
have to assume an admin reads along, and debugging needs only the failures.
Auditing with the prompt fields redacted does not work: the stored input is
free-form JSON keyed by each Model's own input names, so nothing knows which
fields are private. Hiding failed inputs too was rejected: admins would see a
Model's failure rate climb with no way to find out why.

_Decided 2026-11-03 · deme_
