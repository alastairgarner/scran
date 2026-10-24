import { queryOptions } from '@tanstack/react-query';
import type { InferResponseType } from 'hono/client';

import { api, errorMessage } from './client';

export const accountOptions = (userId: string) =>
  queryOptions({
    queryKey: ['account', userId],
    queryFn: async () => {
      const response = await api.api.account.$get();
      if (!response.ok) {
        throw new Error(await errorMessage(response));
      }
      return response.json();
    },
    retry: false,
  });

export const adminKeys = (userId: string) => ['administration', userId];

export const accountsOptions = (userId: string) =>
  queryOptions({
    queryKey: [...adminKeys(userId), 'accounts'],
    queryFn: async () => {
      const response = await api.api.admin.accounts.$get();
      if (!response.ok) {
        throw new Error(await errorMessage(response));
      }
      return response.json();
    },
    retry: false,
  });

export const invitesOptions = (userId: string) =>
  queryOptions({
    queryKey: [...adminKeys(userId), 'invites'],
    queryFn: async () => {
      const response = await api.api.admin.invites.$get();
      if (!response.ok) {
        throw new Error(await errorMessage(response));
      }
      return response.json();
    },
    retry: false,
  });

export async function createInvite(email: string) {
  const response = await api.api.admin.invites.$post({ json: { email } });
  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }
  return response.json();
}

export type AccountAction = 'disable' | 'enable' | 'revoke-sessions';

export async function manageAccount(id: string, action: AccountAction) {
  await mutate(`/api/admin/accounts/${encodeURIComponent(id)}/${action}`);
}

export async function revokeInvite(id: number) {
  await mutate(`/api/admin/invites/${id}/revoke`);
}

async function mutate(path: string) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }
}

export type ManagedAccount = InferResponseType<
  typeof api.api.admin.accounts.$get
>[number];
