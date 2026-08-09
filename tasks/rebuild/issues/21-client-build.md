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
  **disable Biome's `noDuplicateCustomProperties` for that file**: it is a false positive by
  construction there, and it will fire on every build otherwise.
- **Screens**: catalogue (list, no thumbnails, bottom toolbar, filter & sort sheet), recipe (method
  with step rules, ingredients bottom sheet, servings stepper), capture (photo and URL), sign-in.
- **Scaling** is render-time only, over stored data — nothing extra is persisted.
- The prototype is a *prototype*: it has no error handling, no loading states, no tests, and its
  quantity parsing is a stand-in for ticket 10. Rewrite it properly; steal the shapes, not the code.
  It lives on the `prototype/look-and-feel` branch as the primary source.
- **Responsive**: everything thumb-anchored on a phone flips to a conventional top bar at `md:`.

Done when someone who isn't the author can sign in on their own phone, capture a recipe, read it
while cooking, and rate it.
