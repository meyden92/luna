# What the Assistant never gets to see

Every image the Assistant looks at leaves the server for a third party, so
three things keep an image from being sent by itself: the User has switched
analysis off, the Token it was uploaded with excludes it, or it was private at
the moment of upload. All three are known when the upload arrives, which is why
a folder cannot be a fourth: a file reaches its folder after the Assistant
would already have looked. The User's own request to analyse a file overrides
all three, for that file.

A Question is bound by the same three. Otherwise an Automation would be the way
around the User's switch. A Question that may not be put to an image fails the
Run instead of counting as a no, and an Automation with a Question applies to
images only, since the Assistant can look at nothing else.

Nothing catches up by itself. Images uploaded before the Assistant existed,
images skipped during an outage and images held back by the Spending cap stay
without an Analysis until the User selects and analyses them. Files can be
narrowed to exactly those. A background pass over the library was rejected
because it would rename, on its own schedule, files that have been shared under
their name for years (ADR 0012).

The consequence is deliberate: an image that was private at upload cannot be
found by its content until its User asks for an Analysis.

_Decided 2026-11-28 · deme_
