# scran

A self-hosted family recipe catalogue. Photograph a cookbook page or paste a URL, a model turns it
into a structured recipe, and the household reads, corrects and rates it from one shared list.

## Language

### Recipes and how they change

**Recipe**:
One dish in the catalogue. An identity and a status — it holds no recipe *content* itself; the
content lives in its versions.
_Avoid_: Dish, entry, card

**Version**:
One immutable snapshot of a recipe's content — name, times, yield, ingredients, instructions,
notes. Versions are append-only and numbered; the **current** version is simply the highest.
_Avoid_: Revision, draft

**Extraction**:
The act of a model reading a source and producing the first version of a recipe. Happens once per
recipe. A version produced this way carries the model and token usage that made it.
_Avoid_: Parse, import, scan

**Edit**:
A person changing a recipe, which always means appending a new version rather than altering one.
A version with no extraction metadata was written by a person.

**Retry**:
Running extraction again for a recipe that never got a version — one that failed, or never
finished. Distinct from re-extraction, which would re-run the model over a recipe that already has
content and is deliberately not supported: once a recipe has a version, corrections are edits.

### Where recipes come from

**Source**:
A permanent artifact a recipe was extracted from — the photographed page, or the fetched HTML.
Kept forever and never regenerated, so any future re-reading of it stays possible. A recipe may
have several sources (a spread across two pages) or none (someone typed it in).
_Avoid_: Artifact, upload, attachment, original

**Ingredient line**:
One line of a recipe's ingredients, as it appeared on the page. Its verbatim `text` is the truth;
any parsed `quantity`, `unit` and `food` are a **best-effort overlay** on top of it. Where the
parse is absent the line still reads correctly — it just can't be scaled.
_Avoid_: Ingredient (unqualified — it invites treating the line as an entity it isn't)

**Section**:
An optional heading grouping consecutive ingredient lines or instructions ("For the sauce"),
carried as a `title` on the first line of the group rather than as a container.
_Avoid_: Group, subgroup, part

**Note**:
A tip or variation printed **on the page**, extracted as part of the recipe's content. Not
something a person in the household wrote — that is a comment.

### People and judgement

**Comment**:
A remark a household member wrote about a recipe, attributed to them. Flat, never threaded, and
attached to the recipe rather than to any one version.
_Avoid_: Note (means the page's own notes), review, annotation

**Rating**:
One person's verdict on a recipe, on the household's three-point scale. One per person per recipe,
changeable. The catalogue surfaces the **spread** of ratings, never the mean — averaging a cross
away is the one thing the scale exists to prevent.

**Cross**:
The lowest rating. Don't make this again.

**Tick**:
The middle rating. Make this again.

**Double tick**:
The highest rating. Good enough to cook for other people.

**Invite**:
A single-use link that permits exactly one person to create an account. The set of unredeemed
invites *is* the list of people allowed in; there is no other way to sign up.
_Avoid_: Invitation code, signup link
