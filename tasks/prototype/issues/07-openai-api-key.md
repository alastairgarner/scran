# Get an OpenAI API key

Type: task
Status: resolved

## Question

Nothing to decide — ticket 01 picked OpenAI `gpt-5`. This is the manual step that unblocks the
extraction pipeline.

A ChatGPT subscription is **not** an API key. The API is a separate signup with separate,
prepaid billing.

- Sign up at platform.openai.com with the existing OpenAI account
- Add a payment method and a small amount of credit — extraction is cents per recipe, so the
  minimum top-up covers the whole prototype several times over
- Create an API key, store it in `.env` as `OPENAI_API_KEY`, confirm `.env` is gitignored
- Set a low monthly spend limit while the prompt is being tuned; a retry loop against a vision
  model is the classic way to be surprised by a bill

HITL — I can't do this one.

Done when `.env` holds a working key and a trivial API call succeeds. Record the actual
per-extraction cost here once the first real photo goes through: that number decides whether
stepping down to a cheaper model is worth it.

## Answer

Key created and in `.env` as `OPENAI_API_KEY`. `.env` added to `.gitignore` and confirmed ignored;
`.env.template` records the required vars. Bun loads `.env` natively — no `dotenv` dependency.

Confirmed along the way: a ChatGPT/Codex subscription does **not** grant API access. Separate
signup at platform.openai.com, separate prepaid balance, billed per token; Codex credits don't
spend against it.

**Per-extraction cost, measured in ticket 05: ~$0.01** (`gpt-4.1`, ~2,000 prompt + ~400–800
completion tokens, 3–7s). No reason to step down to a cheaper model — and `gpt-4o-mini` wasn't
cheaper anyway: it billed 48,740 prompt tokens for a photo `gpt-4.1` billed 2,016 for. Compare
image tokenisation, not headline per-token price.

Two things the ticket didn't anticipate:

- **Project model limits are separate from the key.** A key belongs to one project; allowing a
  model on a *different* project does nothing. `/v1/models` lists org-level availability, so a
  model can list and still 403 on inference. The error names the project id — match it to the
  project whose Limits page you're editing.
- **`gpt-5` needs org ID verification**, which is not done. It 403s on inference. `OPENAI_MODEL`
  in `.env` overrides the model; the code still defaults to `gpt-5`.
