# Build the client

Type: task
Status: resolved
Reviewer: agent
Blocked by: 06, 12, 13

## Question

Ticket 05 fixed the client's *structure* — routes, `api/` hooks, `RequireAuth`, three state owners
(Query, the URL, react-hook-form) and no store. Ticket 03 fixed the *tokens*. Ticket 06 fixed the
*design*, screen by screen. Nothing has built it: tickets 11–17 are all server, packaging and data.

Build the real client to ticket 06's answer. It replaces `client/src/main.tsx` wholesale.

- **`theme.css`** as ticket 03 specifies — six sections, `@theme inline`, `--color-*: initial` — and
  set **`css.parser.tailwindDirectives: true`** in `biome.json`. Without it Biome cannot parse
  `@theme` or `@custom-variant` at all, and reports the failure as a pile of spurious
  `noDuplicateCustomProperties` and `noUnknownTypeSelector` errors that look like a rule conflict.
  It is one line, and no rule override is needed. Already done on the prototype branch.
- **Screens**: catalogue (list, no thumbnails, bottom toolbar, filter & sort sheet), recipe (method
  with step rules, ingredients bottom sheet, servings stepper), capture (photo and URL), sign-in.
- **Scaling** is render-time only, over stored data — nothing extra is persisted.
- The prototype is a *prototype*: it has no error handling, no loading states, no tests, and its
  quantity parsing is a stand-in for ticket 10. Rewrite it properly; steal the shapes, not the code.
  It lives on the `prototype/look-and-feel` branch as the primary source.
- **Responsive**: everything thumb-anchored on a phone flips to a conventional top bar at `md:`.

Done when someone who isn't the author can sign in on their own phone, capture a recipe, read it
while cooking, and rate it.

## Amendment from [ticket 12](12-auth-and-invites-build.md)

The screen list says "sign-in" and needs a second one: **`/invite/:token`**, the signup form. The
server deliberately renders no HTML — `GET /api/invites/:token` returns `{ email }` or 404, and
`POST` to the same path redeems and sets the session cookie, so this route is the *only* way an
invited person gets an account. Prefill the email when the invite carries one, resolve
`signUpSchema` from `@scran/shared` (the same schema the route validates), and treat 404 as "ask
whoever sent it for a new one" rather than an error screen.

## Amendment from [ticket 19](19-tags.md)

The filter sheet's tag chips are **read-only here** — the vocabulary is a constant, the tags come
from `recipeTag`, and correcting one belongs to [ticket 18](18-recipe-editor.md). Chips sort by
usage, per ticket 06.

Speed filters are **bands over `totalMinutes`** (under 30 / 30–60 / over an hour), computed in the
client and not stored, so retuning them is one array. An estimated time renders with a `~` —
`timeEstimated` says whether the page stated it or the model judged it, and the two are different
claims. This is also what finally makes **sort by quickest** work; it had no number to sort on.

## Amendment from [ticket 10](10-machine-readable-quantities.md)

**No rounding. Significant figures are the answer, not a placeholder.** Ticket 06 left the client
showing sig figs pending unit-aware rounding here; ticket 10 ruled that out — `1.22 thumbs of
ginger` is the most accurate thing there is, and the unit is a free-form string nothing may
interpret. There is no `scale.ts` to import and no rounding table to key off `unit`.

A line renders scaled **iff `quantity` is non-null**; otherwise show `text` verbatim and mark it
unscalable. There is no `or` heuristic to port from the prototype — the model made that call at
extraction time.

**`note` is prose, and it can contain numbers.** Where a line offers a choice of amount, the model
keeps one in `quantity` and leaves the other in `note` — `1 corn on the cob` with
`note: "or 200g frozen kernels"`. A scaled line renders its *parts* scaled and its `note` verbatim;
never scale, parse or reformat `note`.

That case is the one that slips through "flag anything that isn't scaling", because the line **is**
scaling — only its note isn't. So the marker rule takes a second clause:

> mark a line unscaled when `quantity` is null **or** `note` contains a digit.

`"or 200g frozen kernels"` is flagged; `"finely chopped"` is not. One rule, no new UI concept, and it
closes the hole without a schema change. The proper fix — alternatives that each scale — is deferred
to [the post-launch map](../../enhancements/issues/02-alternative-amounts.md).

## Answer

Built the authenticated client: catalogue search/filter/sort, photo and URL capture with polling,
invite signup and sign-in, cooking-first recipe view, ingredient scaling, ratings and comments.
TanStack Query, React Router 7 and react-hook-form follow ticket 05; the Tailwind token system follows
ticket 03. Invite links now open the client signup route. Agent review completed clean after fixes.

`bun run check`, all 73 tests and the production client build pass.
