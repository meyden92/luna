# LunaShare

A self-hosted file sharing and upload service. This glossary fixes the vocabulary
the codebase and its issues use; it deliberately contains no implementation detail.

## Identity

**User**:
The durable identity that owns everything in LunaShare — files, folders, tokens,
group memberships and quota. Survives any change to how its owner proves who they are.
_Avoid_: Account, profile

**Account**:
A single way one User can prove they are that User. A User may hold several at
once (an OAuth link, a password) and losing one changes nothing a User owns.
_Avoid_: Login, identity, credential record

**Username**:
The public handle a User signs in with, unique and matched case-insensitively.
Distinct from the User's display name, which is free text and need not be unique.
_Avoid_: Handle, login, nick

**Token**:
A long-lived secret key that authenticates an upload client (ShareX and similar)
as a User without a session. Never a way for a human to sign in.
_Avoid_: API key, access token

**Display name**:
The free-text name shown to other people for a User. Need not be unique and
carries no authentication meaning.
_Avoid_: Name, nickname, title

**Avatar**:
The image shown for a User, chosen by that User. Not one of their shares: it is
invisible to the file manager and costs nothing against their storage quota.
_Avoid_: Profile picture, image, pfp
