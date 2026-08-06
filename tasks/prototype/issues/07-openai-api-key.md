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

Still outstanding: record the actual per-extraction cost here after the first real photo goes
through ticket 05. That number decides whether stepping down to a cheaper model is worth it.
