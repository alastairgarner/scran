# Ingredient lines that offer a choice of amount

Type: grilling
Status: open
Blocked by: none — but see "Not before launch" below

## Question

[Ticket 10](../../rebuild/issues/10-machine-readable-quantities.md) split every ingredient line into
`{quantity, unit, food, note}` so it could be scaled. It handles a choice of **ingredient** at one
amount correctly — `400g spaghetti or linguine` is 400 g of a food called *spaghetti or linguine*,
and doubling it doubles once. Eight of the ten `or` lines in the real data are that shape.

It does **not** handle a choice of **amount**, and the failure is silent:

```
"the kernels from 1 corn on the cob or 200g frozen kernels"
  → quantity 1, unit "corn on the cob", note "or 200g frozen kernels"
```

The model picks one option, and the other is stranded in `note` as prose. `note` is never scaled, so
doubling the recipe renders *"2 corn on the cob, or 200g frozen kernels"* — half the line silently
wrong. That is exactly the class of error ticket 10's "never show a quantity the model invented" rule
exists to prevent, arriving through a side door. A related loss: `3 tsp. baking powder (or 1 packet)`
came back with the alternative dropped entirely.

**Should an ingredient carry alternative amounts that each scale on their own?**

### The settled part

The **scope is decided** and does not need relitigating: split out an alternative only when it
carries its **own quantity or unit**. `spaghetti or linguine` stays one food string, because it
already scales correctly and splitting it restructures eight working lines to fix one broken one.

The shape sketched at the time, which keeps the common case byte-identical to today:

```
{ title, text, quantity, unit, food, note, alternatives: [] }

quantity: 1, unit: "corn on the cob", food: "corn kernels",
alternatives: [ { quantity: 200, unit: "g", food: "frozen corn kernels" } ]
```

### What is actually open

- **Is `alternatives` the right shape**, or is every line a list of options with length usually one?
  The second is more uniform — the renderer gets one rule instead of a primary-plus-extras branch —
  but it makes the model emit nesting on every line to serve 2% of them.
- **What the recipe screen does with it.** Two amounts joined by *or* is the honest render, but
  ticket 06 gave ingredients a bottom sheet read with wet hands, and a line that says two things is
  a line you have to parse while cooking. Does the user pick one and have it stick? That is a
  per-user preference on a shared catalogue, which is a bigger idea than it looks.
- **Does the editor let you add one?** [Ticket 18](../../rebuild/issues/18-recipe-editor.md) will
  have settled what editing a line feels like. Alternatives are the awkward case for whatever it
  chose, and this ticket should adopt that answer rather than invent a second surface.
- **How the prompt distinguishes the two `or`s.** Ticket 10 already got the model reliably telling
  alternative *ingredients* from alternative *amounts* — that distinction is why the corn line kept
  a quantity while `1 1/2 c. flour OR 1 1/4 c. + 1/4 c. cocoa` correctly went null. Populating
  `alternatives` is the same judgement pointed at a field instead of at null.

### Not before launch

Deliberately non-blocking, and deferred out of the rebuild by the human's call. The reasoning, and
one argument that was **withdrawn**:

- It was argued that this must land before the rebuild ships, because ticket 04 bans re-extraction,
  so recipes captured under the old shape could never gain the field. **That argument is wrong.**
  Hand-editing is a legal backfill path — correcting a line appends a version, which is what
  [ticket 18](../../rebuild/issues/18-recipe-editor.md) exists for. Re-extraction is banned;
  correction is not.
- At roughly **1 line in 50**, backfilling by hand is about one line per fifty recipes. The cost of
  waiting is therefore close to nothing, and the cost of building it now is a nested schema, a
  renderer branch and an editor case, all designed against zero real usage.
- Launch also answers the open question above that matters most: whether anyone reading a recipe
  while cooking actually wants both amounts shown, or would rather the model just picked.
