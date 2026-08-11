# Meal photos, cover images, and whether AI should touch them

Type: grilling
Status: open
Blocked by: none — but see "Not before launch" below

## Question

The rebuild leaves scran holding exactly one kind of image: the **source** — a photo of a page of
text, stored permanently so re-extraction stays cheap.
[What does scran look like?](../../rebuild/issues/06-look-and-feel.md) looked at those photos and
concluded the catalogue should have **no images at all**: "every source photo is a photo of *text*,
so a grid of them reads as a pile of documents; they're also actively misleading as recipe
imagery." That conclusion is about *source* photos specifically. It says nothing about a photo of
the finished dish, which is the one image that would not be misleading.

So: **should a recipe be able to carry a picture of the meal, and where does it come from?**

### The upload arm

- **Is a meal photo a source?**
  [The data model](../../rebuild/issues/04-data-model.md) defines `source` as
  `kind ∈ (photo|html)` — the permanent artifact extraction read. A meal photo is read by nobody;
  it is output, not input. Widening `kind` to `photo|html|meal` puts a non-source in the source
  table and quietly breaks "sources are what extraction came from". A separate table, or a column
  on `recipe`, are the alternatives. Note it hangs off the **recipe**, not the version — the dish
  doesn't change when someone fixes a typo.
- **One photo or many?** "I made this on Tuesday and it looked like this" is a *log*, and a log
  wants many, dated, attributed — which is a different feature from "the cover image". One of
  these is small; the other is a feed. Pick one, deliberately.
- **Who chooses the cover** if there are several, and does an unrated, unloved photo of someone
  else's attempt get to be the face of the recipe?
- **Capture path.** [Capture orientation](../../rebuild/issues/15-capture-orientation.md) already
  had to deal with camera orientation and downscaling; a second upload path either reuses that or
  duplicates it.
- **Storage and size.** [The architecture](../../rebuild/issues/05-architecture.md) gave
  `storage.ts` a monopoly on photo paths, so the mechanism exists. What doesn't exist is any notion
  of a *derivative* — a thumbnail or a resized cover. Serving a 4MB phone photo as a 200px list
  thumbnail is the obvious wrong answer, and resizing means either a dependency or Bun's own image
  handling. Also lands on [the Docker ticket](../../rebuild/issues/16-docker.md)'s backup story:
  `DATA_DIR` gets bigger.

### The AI arm

Two genuinely different propositions, and they should not be judged together:

- **Generate an image from the recipe text.** Cheap to trigger, works for every recipe including
  the ones that already exist and will never be photographed. But it is a picture of a dish nobody
  cooked — it will look like stock food photography, and the thing that makes a family recipe
  catalogue worth having is that it's *yours*. Does a plausible fake beat an honest blank?
- **Enhance a real photo** — the user's own snap, pushed toward recipe-book grade. Keeps the photo
  honest in provenance, but "enhanced" on food photography means the model inventing garnish,
  changing the plate, altering what the food actually looks like. Where's the line between
  relighting and lying? And is the original kept, always, so the enhancement is a view rather than
  a destructive edit?

Facts this arm needs before the taste question can be answered — likely a **spawned research
ticket**, not something to hand-wave in the conversation: which image models are reachable from the
same provider the extraction already uses, what an image costs relative to an extraction, whether
image-to-image editing is good enough at food to be worth it, and what the latency is (extraction
is already async — is generation a third state, or a background job that lands later?).

### Not before launch

This map's whole premise is that launch is the input. Two specific things this ticket should not
guess at:

- **Whether anyone wants it.** Nobody has used the rebuilt app yet. "Every recipe should have a
  picture" is an aesthetic instinct, and the cheap test is whether anyone actually photographs a
  meal once the app is in their hand — which costs nothing to find out and settles most of this.
- **What the catalogue feels like with images in it.** The no-thumbnails finding was judged against
  five recipes and against *source* photos. Both premises need re-checking against a real
  catalogue before overturning it.

Done when it's clear (a) whether a meal photo can be uploaded at all and what table it lives in,
(b) whether it appears in the catalogue — which means saying whether the no-thumbnails finding
survives, and (c) what, if anything, AI is allowed to do to an image.
