# An Analysis writes into the User's own title and tags

When the Assistant analyses an image it replaces the file's title and adds its
keywords to the file's tags, the same fields the User edits, filters by and
tests in Automations. Only the description and the text found in the image stay
apart, as the Analysis beside the file. We chose this so that what the Assistant
finds works everywhere a title or a tag already works, with no second kind of
tag to search, filter and match on.

Three things exist only because of this choice. The file keeps its Original
name, since the title is also the download filename and the public page title,
and a replaced one would otherwise be gone. The Analysis remembers the title and
the keywords it set, so that analysing an image again swaps out exactly those
and leaves alone a title the User has since changed and keywords the User has
since removed. And an image is analysed again only when the User asks, per file
or selection, never across the whole library by itself, because doing so
renames files that are already shared.

## Considered options

Keeping the Analysis fully apart, with title and tags untouched and search
reading both, was the recommendation: it can be thrown away and regenerated
without touching the User's data. Its price was that Assistant keywords stay
out of the tag filter and out of Automations unless each learns a second kind
of tag. Replacing only titles the User never set does not work: a
title is always the uploaded filename, and a file does not record whether its
User edited it.

_Decided 2026-11-28 · deme_
