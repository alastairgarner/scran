import type { AppType } from '@scran/server';
import { hc } from 'hono/client';

export const api = hc<AppType>('/');

export async function errorMessage(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  if (
    typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    typeof body.error === 'string'
  ) {
    return body.error;
  }
  return `Request failed (${response.status}).`;
}
