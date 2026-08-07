# Settle the error and logging pattern

Type: grilling
Status: resolved

## Question

The prototype returns raw stacks to the client on purpose. Five family members and a container on
a home server make that wrong. The requirement is a *pattern*, not a product — no Sentry, no
persisted error log.

- **Error classes.** Something like `AppError` (expected, has a user-facing message and a status)
  versus everything else (a bug, 500, log the stack, tell the user nothing useful). Is two enough?
  What about the third case — the LLM call that fails or returns unparseable JSON, which is
  neither a bug nor the user's fault and is the most likely failure in the app?
- **The boundary.** One Hono `onError` that maps class to response, or handling at each route?
- **Logger.** Pino, Bun's console, or something else — structured JSON to stdout either way.
  What gets logged per request, and how does a log line get correlated to a failed extraction?
- **What the user sees.** "Extraction failed, your photo is saved, try again" is a different
  product than a 500 page. Which failures are recoverable, and does the UI offer the retry?
- **Secrets in logs.** The API key, and the fact that photos and prompts are not logged.

Done when the pattern is written down and there is one worked example of each error class.

## Answer

Lift the `AppError` / `ClientError` split from `~/forte/sn-web` (`shared/errors/src/`, and its
`apps/api/src/errors/choosing-an-error.md`), minus Sentry. It is already the right shape and it
comes with a decision procedure worth copying wholesale.

**Two classes, split by fault — never by status.** One question at the throw site: *could the
caller have avoided this by sending a different request?*

- Yes → `ClientError`. 4xx, not logged as a problem. Factories: `unauthorised` 401,
  `forbidden` 403, `notFound` 404, `conflict` 409, `validation` 400.
- No → `AppError`. 5xx, logged. Factories: `dependency` 503 retryable, `invariant` 500 fatal,
  `internal` 500.

Factories own `status`, `type`, `severity` and `retryable`; the constructor is protected so a
throw site cannot fat-finger a status. Errors carry a structured `context` object and a `cause`.

**Three adaptations for scran:**

1. **`severity` maps to log level, not Sentry loudness.** `ignored` → not logged, `error` → the
   logger's `error`, `fatal` → `fatal` and it wants looking at. Keep the field; it's the whole
   reason the classification is worth having.
2. **A failed extraction is `AppError.dependency`** — 503, retryable, upstream's fault. So is the
   model returning unparseable or schema-invalid JSON: the request was fine, the upstream wasn't.
   `retryable` is worth keeping despite there being no worker, because retrying an extraction from
   the photo already on disk is the cheap operation this whole design is built around.
3. **Skip the per-domain error modules** (`paymentErrors.ts`, `cacheErrors.ts`, …). Two classes and
   their factories are the whole surface at this size.

**The failure this pattern does not catch, and neither does anything else here:** the model
returning fluent, plausible, *wrong* JSON. That is not an error, it throws nothing, and it is
scran's most likely defect. It belongs to the hand-edit path and to the eval harness in the fog.

**Boundary.** One Hono `onError` maps class → response. `ClientError` returns its own message.
`AppError` returns a **generic** message plus a short random **error id**, never the message or
the stack — the id is logged alongside the full error, so "it broke, it said `a3f9c1`" is
greppable. This replaces the prototype's deliberate raw-stack behaviour.

**Partial failure.** The photo is written to disk before the LLM call (deliberately — it is the
irreplaceable artifact). A failed extraction must therefore not orphan it: the recipe row is
created **up front in a `pending` state** and moved to `failed`, with retry offered in the UI
re-running extraction from the photo already on disk. No re-upload. This puts a status on the
recipe row — **an input to ticket 04's data model.**

**Logging.** `pino`, structured JSON to stdout (`docker logs` is the aggregator), `pino-pretty` in
dev. A request id per request via `hono/request-id`, on every line, so a failed extraction's log
lines join up — and the same id is what the error id derives from. Per request: method, path,
status, duration, user id once auth exists. Never logged: the OpenAI key or any env dump, photo
bytes, prompt text, or the model's full response (log its size and the failure, not its content).

**Deliberate debt**: none of this is persisted or shipped anywhere. `docker logs` on a box you can
SSH into is sufficient at five users on a LAN. The condition that flips it is the public deploy —
at which point "I can't see what broke" becomes real and Sentry or a log store gets revisited.
