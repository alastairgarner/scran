/**
 * How every test file gets a signed-in person: through the real invite-and-
 * signup route, not a hand-forged session row. Exercising the flow that guards
 * the whole app on the way into each test costs nothing and means a break in
 * it fails loudly everywhere rather than quietly nowhere.
 */
import { createInvite } from './auth';
import { app } from './index';

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
