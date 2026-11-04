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

## Presentation

**Appearance**:
The User's choice between the light and dark rendering of the app, or to follow
the operating system. The only kind of "theme" LunaShare has.
_Avoid_: Theme, colour theme, skin

**Design token**:
One named value on the shared visual scale (a colour role, a spacing step, a
type size, a radius) that every part of the UI reads from instead of choosing
its own. Unrelated to a Token, which is an upload credential.
_Avoid_: Token, variable, CSS variable

## Workspace

**Files**:
The screen where a User finds their own files and copies one. Named for what it
holds rather than for being the landing page; its route is still `/dashboard`.
_Avoid_: Dashboard, gallery, home

**Scope**:
Which files Files is showing: all of them, the ones in no folder, or one folder's.
"No folder" is an answer, not the absence of one, which is why it is not simply a
nullable folder.
_Avoid_: Filter, view, folder selection

**Preview**:
The full-screen view of one file, with the image on a stage and its details
beside it. The thumbnail grows into it and back.
_Avoid_: Lightbox, modal, viewer

**Snippet**:
A piece of text or code a User saves and shares by link. The code calls the table
and its routes `bin`, which is history, not vocabulary.
_Avoid_: Bin, paste, gist

**Automation**:
A rule that runs on a User's files by itself — sorting, tagging or hiding them
when something happens. Read as a sentence, stored as a chain of steps.
_Avoid_: Flow, workflow, rule engine

## Downloads

**Download**:
A short-lived job, belonging to one User, that turns a link to a post on a Source
into the one or more videos in that post, which the User saves to their device.
A Download never includes a post's photos. It is never stored as one of
their files and expires an hour after it is ready. Saving one of a User's own files
is "downloading a file", a verb, never "a Download".
_Avoid_: Grab, fetch, import, rip

**Source**:
A third-party website LunaShare can make a Download from, such as Instagram.
_Avoid_: Provider, platform, host, site

**Source session**:
The signed-in session with one Source that LunaShare uses for every Download from
it, set by an admin. Optional: without one, Downloads from that Source run
logged out and some posts fail.
_Avoid_: Cookies, login, credentials

## Studio

**Studio**:
The screen where a User makes images, video, audio or 3D models with AI, and
the admin setup behind it. An instance without a fal key has no Studio at all.
_Avoid_: AI, Generate, AI generator

**Category**:
One thing a User can set out to do in the Studio, such as "Create video",
defined by an admin. It groups Models and Templates, and each of them sits in
exactly one. Unrelated to the background tasks admins schedule.
_Avoid_: Task, Tool, tab

**Model**:
One AI model as an admin offers it to Users: the fal endpoint it calls and how
its Fields are set up. One endpoint can back several Models with different
settings, so a Model is a curated configuration, not what fal runs.
_Avoid_: Endpoint, Engine

**Field**:
One input a Model accepts, as the admin set it up: shown to the User, fixed to
a value, or left to fal's default. Distinct from a Variable, which only a
Template has.
_Avoid_: Parameter, input, option, setting

**Template**:
A Model with its Fields fixed and its prompt written by an admin, so the User
only answers a few Variables. Sits in a Category beside the Models.
_Avoid_: Recipe, Preset

**Variable**:
A blank in a Template's fixed text that the User fills in, such as a style
choice or a photo. Written inline in that text, never managed on its own.
Unrelated to a Design token.
_Avoid_: Placeholder, global variable, parameter

**Generation**:
One run of a Model or Template for one User: what they entered, what it cost
and how it ended. It keeps running when the browser closes, and its history
entry outlives its Outputs.
_Avoid_: Job, Prediction, Run, request

**Output**:
One file a Generation produced: an image, a video, an audio clip or a 3D model.
It expires after seven days unless the User saves it to Files, where it becomes
one of their files.
_Avoid_: Result, Asset

**Budget**:
The most a User may spend on Generations in one calendar month, in US dollars.
An admin sets a default for everyone and exceptions per User, unlimited
included. Unrelated to the storage quota.
_Avoid_: Credits, quota, allowance, limit
