# Build the client

Type: task
Status: open
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
