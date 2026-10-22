import type { PhotoRotation, RecipeContent, TagId } from '@scran/shared';
import { queryOptions } from '@tanstack/react-query';

import { api, errorMessage } from './client';

export const recipeKeys = {
  all: ['recipes'] as const,
  list: (query: string) => [...recipeKeys.all, 'list', query] as const,
  detail: (id: number) => [...recipeKeys.all, 'detail', id] as const,
};

export async function listRecipes(query: string) {
  const response = await api.api.recipes.$get({
    query: query ? { q: query } : {},
  });
  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }
  return response.json();
}

export async function getRecipe(id: number) {
  const response = await api.api.recipes[':id'].$get({
    param: { id: String(id) },
  });
  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }
  return response.json();
}

export const recipeOptions = (id: number) =>
  queryOptions({
    queryKey: recipeKeys.detail(id),
    queryFn: () => getRecipe(id),
    refetchInterval: query =>
      query.state.data?.status === 'pending' ? 1500 : false,
  });

export async function rateRecipe(id: number, score: 1 | 2 | 3) {
  const response = await api.api.recipes[':id'].rating.$put({
    param: { id: String(id) },
    json: { score },
  });
  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }
}

export async function commentOnRecipe(id: number, body: string) {
  const response = await api.api.recipes[':id'].comments.$post({
    param: { id: String(id) },
    json: { body },
  });
  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }
}

export async function retryRecipe(id: number) {
  const response = await api.api.recipes[':id'].retry.$post({
    param: { id: String(id) },
  });
  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }
}

export async function deleteRecipe(id: number) {
  const response = await api.api.recipes[':id'].$delete({
    param: { id: String(id) },
  });
  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }
}

export async function rereadRecipe(id: number) {
  const response = await api.api.recipes[':id'].reread.$post({
    param: { id: String(id) },
  });
  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }
}

export async function editRecipe(id: number, content: RecipeContent) {
  const response = await api.api.recipes[':id'].versions.$post({
    param: { id: String(id) },
    json: content,
  });
  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }
}

export async function updateRecipeTags(id: number, tags: TagId[]) {
  const response = await api.api.recipes[':id'].tags.$put({
    param: { id: String(id) },
    json: { tags },
  });
  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }
}

export async function capturePhoto(photo: File, rotation: PhotoRotation = 0) {
  const form = new FormData();
  form.append('photo', photo);
  form.append('rotation', String(rotation));
  return capture({ method: 'POST', body: form });
}

export async function previewPhoto(photo: File, signal: AbortSignal) {
  const form = new FormData();
  form.append('photo', photo);
  const response = await fetch('/api/photos/preview', {
    method: 'POST',
    body: form,
    signal,
  });
  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }
  return response.blob();
}

export async function captureUrl(url: string) {
  return capture({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
  });
}

async function capture(init: RequestInit): Promise<{ id: number }> {
  const response = await fetch('/api/recipes', init);
  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }
  const body: unknown = await response.json();
  if (
    typeof body !== 'object' ||
    body === null ||
    !('id' in body) ||
    typeof body.id !== 'number'
  ) {
    throw new Error('The server returned an invalid recipe.');
  }
  return { id: body.id };
}

export type Recipe = Awaited<ReturnType<typeof getRecipe>>;
export type RecipeSummary = Awaited<ReturnType<typeof listRecipes>>[number];
