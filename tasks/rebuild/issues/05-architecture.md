# What shape does the rewritten codebase take?

Type: grilling
Status: open
Blocked by: 01, 04

## Question

The prototype is 513 lines: one Hono file, one `extract.ts`, one 154-line `main.tsx` with no
router and no data layer. Auth, editing, versioning, search and URL import all land on top of it.
Decide the shape *before* any of them get built, or they'll each invent their own.

- **Server modules.** What are the seams — extraction, sources/storage, recipes, auth, HTTP? What
  does each expose, and what does the HTTP layer do beyond parse-validate-delegate? Consult
  `/mp-codebase-design`: the test is whether a module is deep enough to hide a decision.
- **Two ingestion paths, one pipeline.** Photo and URL differ at the front (upload vs fetch) and
  at the prompt, and are identical after. Where exactly does the seam go?
- **Validation at the boundary.** The prototype had none. What validates a request body, and what
  validates the *model's* response against the schema before it's trusted?
- **Client structure.** Router and routes; a data-fetching layer with caching; where forms and
  their validation live; how components are organised against ticket 03's tokens.
- **Shared types.** Server and client are separate workspaces. Does a shared package appear, or do
  types get inferred across the boundary?
- **Config.** `.env` on a laptop becomes env vars in a container. What's read where, and what
  fails loudly at boot when missing (the prototype silently ran without `OPENAI_API_KEY` loaded
  for two tickets).
- **What the test suite looks like** against this shape — where the recorded-response fixture
  plugs in.

Done when the module boundaries and the client structure are written down well enough that the
build tickets that follow have no room to disagree.
