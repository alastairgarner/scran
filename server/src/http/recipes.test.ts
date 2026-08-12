/**
 * The whole app through `app.request()` — no port, no server, no supertest —
 * against `:memory:` SQLite running the real migrations, with a signed-in
 * person obtained the way ticket 01 says people arrive.
 */
import { describe, expect, it } from 'bun:test';
import { config } from '../config';
import { app } from '../index';
import { signUpThroughInvite, withoutOpenAI } from '../testing';

const photo = () => {
  const form = new FormData();
  form.set(
    'photo',
    new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'page.jpg', {
      type: 'image/jpeg',
    }),
  );
  return form;
};

const asPerson = async () => {
  const { cookie } = await signUpThroughInvite();
  return (path: string, init: RequestInit = {}) =>
    app.request(path, {
      ...init,
      headers: {
        cookie,
        // A multipart capture is a form-shaped request, so `hono/csrf` wants
        // an origin — the browser sends one on every same-origin fetch.
        origin: config.baseUrl,
        ...(init.body && typeof init.body === 'string'
          ? { 'content-type': 'application/json' }
          : {}),
        ...init.headers,
      },
    });
};

const json = (body: unknown) => ({
  method: 'POST',
  body: JSON.stringify(body),
});

/** Captures a photo and waits for the model — stubbed — to have answered. */
async function captureRecipe(request: Awaited<ReturnType<typeof asPerson>>) {
  return withoutOpenAI(async () => {
    const response = await request('/api/recipes', {
      method: 'POST',
      body: photo(),
    });
    expect(response.status).toBe(202);
    const { id, status } = (await response.json()) as {
      id: number;
      status: string;
    };
    expect(status).toBe('pending');

    // The client polls exactly like this while the row is pending.
    for (let attempt = 0; attempt < 50; attempt++) {
      const recipe = (await (await request(`/api/recipes/${id}`)).json()) as {
        status: string;
      };
      if (recipe.status !== 'pending') {
        return { id, status: recipe.status };
      }
      await Bun.sleep(10);
    }
    throw new Error('Extraction never finished');
  });
}

describe('the recipe API', () => {
  it('turns a posted photo into a ready recipe with a version', async () => {
    // Arrange
    const request = await asPerson();

    // Act
    const { id, status } = await captureRecipe(request);

    // Assert
    expect(status).toBe('ready');
    const recipe = (await (await request(`/api/recipes/${id}`)).json()) as {
      version: { versionNo: number; name: string; model: string | null };
      tags: string[];
      sources: { id: number }[];
    };
    expect(recipe.version.versionNo).toBe(1);
    expect(recipe.version.name).toBe('Chocolate Chip Muffins');
    expect(recipe.version.model).not.toBeNull();
    expect(recipe.tags).toContain('baking');

    // The photo is on disk and served by source id, never by path.
    const served = await request(`/api/photos/${recipe.sources[0].id}`);
    expect(served.status).toBe(200);
    expect((await served.arrayBuffer()).byteLength).toBe(4);
  });

  it('refuses anything that is not a photo, before anything is created', async () => {
    // Arrange
    const request = await asPerson();
    const form = new FormData();
    form.set('photo', new File(['nope'], 'notes.txt', { type: 'text/plain' }));

    // Act
    const response = await request('/api/recipes', {
      method: 'POST',
      body: form,
    });

    // Assert
    expect(response.status).toBe(400);
  });

  it('is closed to anyone without a session', async () => {
    // Act + Assert — every route, not just the interesting ones.
    expect((await app.request('/api/recipes')).status).toBe(401);
    expect(
      (
        await app.request('/api/recipes', {
          method: 'POST',
          body: photo(),
          headers: { origin: config.baseUrl },
        })
      ).status,
    ).toBe(401);
    expect((await app.request('/api/recipes/1')).status).toBe(401);
    expect((await app.request('/api/photos/1')).status).toBe(401);
  });

  it('lists, searches and scopes what it finds', async () => {
    // Arrange
    const request = await asPerson();
    const { id } = await captureRecipe(request);

    // Act
    const all = (await (await request('/api/recipes')).json()) as {
      id: number;
      name: string;
      tags: string[];
    }[];
    const hit = (await (await request('/api/recipes?q=chocolate')).json()) as {
      id: number;
    }[];
    const miss = (await (await request('/api/recipes?q=lasagne')).json()) as {
      id: number;
    }[];

    // Assert
    expect(all.find(row => row.id === id)?.name).toBe('Chocolate Chip Muffins');
    expect(hit.map(row => row.id)).toContain(id);
    expect(miss.map(row => row.id)).not.toContain(id);
  });

  it('appends an edit, rates, comments, and enforces whose is whose', async () => {
    // Arrange
    const owner = await asPerson();
    const other = await asPerson();
    const { id } = await captureRecipe(owner);
    const before = (await (await owner(`/api/recipes/${id}`)).json()) as {
      version: Record<string, unknown>;
    };

    // Act — anyone may edit.
    const edited = await other(
      `/api/recipes/${id}/versions`,
      json({ ...before.version, name: 'Muffins, corrected' }),
    );
    await other(`/api/recipes/${id}/rating`, {
      ...json({ score: 3 }),
      method: 'PUT',
    });
    await owner(`/api/recipes/${id}/rating`, {
      ...json({ score: 1 }),
      method: 'PUT',
    });
    const comment = await other(
      `/api/recipes/${id}/comments`,
      json({ body: 'Needs more chocolate.' }),
    );

    // Assert
    expect(edited.status).toBe(200);
    expect((await edited.json()) as { versionNo: number }).toEqual({
      versionNo: 2,
    });
    const recipe = (await (await owner(`/api/recipes/${id}`)).json()) as {
      version: { name: string; model: string | null };
      ratings: { score: number }[];
      comments: { id: number; body: string; userName: string }[];
    };
    expect(recipe.version.name).toBe('Muffins, corrected');
    // A person wrote it, so no model — and both marks survive, unaveraged: a
    // cross beside a double tick is the point of the scale.
    expect(recipe.version.model).toBeNull();
    expect(recipe.ratings.map(r => r.score).sort()).toEqual([1, 3]);
    expect(recipe.comments[0].body).toBe('Needs more chocolate.');

    // Act + Assert — a comment is its author's.
    const { id: commentId } = (await comment.json()) as { id: number };
    expect(
      (await owner(`/api/comments/${commentId}`, { method: 'DELETE' })).status,
    ).toBe(403);
    expect(
      (await other(`/api/comments/${commentId}`, { method: 'DELETE' })).status,
    ).toBe(204);

    // Act + Assert — deleting the recipe is the creator's alone.
    expect(
      (await other(`/api/recipes/${id}`, { method: 'DELETE' })).status,
    ).toBe(403);
    expect(
      (await owner(`/api/recipes/${id}`, { method: 'DELETE' })).status,
    ).toBe(204);
    expect((await owner(`/api/recipes/${id}`)).status).toBe(404);
  });

  it('rejects a retry once the recipe has content', async () => {
    // Arrange
    const request = await asPerson();
    const { id } = await captureRecipe(request);

    // Act
    const response = await request(`/api/recipes/${id}/retry`, {
      method: 'POST',
    });

    // Assert — corrections are edits; there is no re-extraction.
    expect(response.status).toBe(409);
  });

  it('validates the body of an edit', async () => {
    // Arrange
    const request = await asPerson();
    const { id } = await captureRecipe(request);

    // Act
    const response = await request(
      `/api/recipes/${id}/versions`,
      json({ name: '' }),
    );

    // Assert
    expect(response.status).toBe(400);
  });
});
