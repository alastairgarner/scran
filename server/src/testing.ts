/**
 * How every test file gets a signed-in person: through the real invite-and-
 * signup route, not a hand-forged session row. Exercising the flow that guards
 * the whole app on the way into each test costs nothing and means a break in
 * it fails loudly everywhere rather than quietly nowhere.
 */
import { createInvite } from './auth';
import recorded from './extraction/fixtures/extractions.json';
import type { Complete } from './extraction/openai';
import { app } from './index';

/** The four real replies, keyed by the photo that produced each. */
type Recorded = Record<
  string,
  {
    model: string;
    usage: { prompt_tokens: number; completion_tokens: number };
    recipe: unknown;
  }
>;

export const RECORDED_PHOTOS = Object.keys(recorded as Recorded);

/**
 * The recorded-response seam ticket 05 put on `extract`'s defaulted parameter.
 * Two real adapters, no mocking framework, and no live call in the suite.
 *
 * @param photo Which recorded reply to return; defaults to the first.
 * @returns {Complete} A chat client that answers instantly and for free.
 */
export function recordedComplete(photo = RECORDED_PHOTOS[0]): Complete {
  const entry = (recorded as Recorded)[photo];
  if (!entry) {
    throw new Error(`No recorded response for ${photo}`);
  }
  return async () => ({
    model: entry.model,
    json: JSON.stringify(entry.recipe),
    tokensIn: entry.usage.prompt_tokens,
    tokensOut: entry.usage.completion_tokens,
  });
}

/**
 * The capture route fires extraction as a floating promise, so a test driving
 * it through HTTP cannot hand `extract` a recorded reply — there is no
 * parameter to pass. The stub therefore goes at the process boundary instead:
 * `fetch` itself, replaced for the duration, answering with the same recorded
 * body OpenAI returned. Nothing leaves the machine, and the suite runs offline.
 *
 * @returns {Promise<T>} Whatever `run` returned, with `fetch` restored.
 */
export async function withoutOpenAI<T>(
  run: () => Promise<T>,
  photo = RECORDED_PHOTOS[0],
): Promise<T> {
  const entry = (recorded as Recorded)[photo];
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes('openai')) {
      return Response.json({
        choices: [{ message: { content: JSON.stringify(entry.recipe) } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      });
    }
    throw new Error(`Unexpected fetch to ${url} in a test`);
  }) as typeof fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = real;
  }
}

let count = 0;

/**
 * @returns {Promise<{ cookie: string; email: string }>} A `Cookie` header
 *   carrying a live session, ready to hand to `app.request`.
 */
export async function signUpThroughInvite(
  email = `person-${++count}@scran.test`,
): Promise<{ cookie: string; email: string }> {
  const token = createInvite(email).split('/').pop() as string;
  const response = await app.request(`/api/invites/${token}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Test Person',
      email,
      password: 'hunter2222',
    }),
  });
  if (!response.ok) {
    throw new Error(
      `Sign-up failed: ${response.status} ${await response.text()}`,
    );
  }
  const cookie = response.headers
    .getSetCookie()
    .map(header => header.split(';')[0])
    .join('; ');
  return { cookie, email };
}
