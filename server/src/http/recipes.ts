/**
 * Parse, validate, delegate. No SQL, no permission `if`, no rule about
 * versions — all of that is `recipes.ts`, and everything here is the HTTP
 * shape of it.
 *
 * Registered as one chained expression rather than statement by statement,
 * because that chain *is* the type ticket 05's `hc<AppType>` reads on the
 * client: break it and ticket 21 silently gets an RPC client with no endpoints.
 */
import { zValidator } from '@hono/zod-validator';
import {
  commentSchema,
  photoRotationSchema,
  ratingSchema,
  recipeContentSchema,
  TAG_IDS,
} from '@scran/shared';
import { Hono } from 'hono';
import { z } from 'zod';

import type { AppEnv } from '../auth';
import { requireUser } from '../auth';
import { ClientError } from '../errors';
import { previewPhoto } from '../extraction/photo';
import * as recipes from '../recipes';

/** A phone photograph, not a scan. Generous, and still a bound. */
const MAX_PHOTO_BYTES = 25 * 1024 * 1024;

function requirePhoto(value: unknown): File {
  if (!(value instanceof File) || !value.type.startsWith('image/')) {
    throw ClientError.validation('Send a photo.');
  }
  if (value.size > MAX_PHOTO_BYTES) {
    throw ClientError.validation('That photo is too big.');
  }
  return value;
}

const urlCaptureSchema = z.object({
  url: z
    .string()
    .trim()
    .url()
    .refine(value => ['http:', 'https:'].includes(new URL(value).protocol)),
});

const idParam = zValidator(
  'param',
  z.object({ id: z.coerce.number().int().positive() }),
);

export const recipeRoutes = new Hono<AppEnv>()
  // Everything about recipes is behind a session. The client's copy of it is
  // for drawing; this is the only thing that decides access.
  .use('/api/*', requireUser)

  .post('/api/photos/preview', async c => {
    const body = await c.req.parseBody();
    const photo = requirePhoto(body.photo);
    let preview: Blob;
    try {
      preview = await previewPhoto(photo);
    } catch {
      throw ClientError.validation(
        'This photo could not be displayed. Try a JPEG, PNG or WebP photo.',
      );
    }
    return new Response(preview, {
      headers: { 'content-type': 'image/png', 'cache-control': 'no-store' },
    });
  })

  .get(
    '/api/recipes',
    zValidator('query', z.object({ q: z.string().optional() })),
    c => c.json(recipes.list(c.req.valid('query').q)),
  )

  /**
   * Capture. Returns once the source is on disk — extraction runs behind the
   * response and the client polls the status.
   */
  .post('/api/recipes', async c => {
    if (c.req.header('content-type')?.startsWith('application/json')) {
      const body = urlCaptureSchema.safeParse(
        await c.req.json().catch(() => undefined),
      );
      if (!body.success) {
        throw ClientError.validation('Send a valid HTTP URL.');
      }

      const { id } = await recipes.captureUrl(c.get('user').id, body.data.url);
      void recipes.runExtraction(id);
      return c.json({ id, status: 'pending' as const }, 202);
    }

    const body = await c.req.parseBody();
    const photo = requirePhoto(body.photo);
    const rotation = z.coerce
      .number()
      .pipe(photoRotationSchema)
      .safeParse(body.rotation ?? 0);
    if (!rotation.success) {
      throw ClientError.validation(
        'Choose a rotation of 0, 90, 180 or 270 degrees.',
      );
    }

    const { id } = await recipes.capture(c.get('user').id, {
      kind: 'photo',
      data: photo,
      rotation: rotation.data,
    });
    // Deliberately floating: the row is the progress bar, and a failure lands
    // on it rather than on a request nobody is waiting for any more.
    void recipes.runExtraction(id);
    return c.json({ id, status: 'pending' as const }, 202);
  })

  .get('/api/recipes/:id', idParam, c =>
    c.json(recipes.get(c.req.valid('param').id)),
  )

  .get('/api/recipes/:id/versions', idParam, c =>
    c.json(recipes.versions(c.req.valid('param').id)),
  )

  /** An edit: appends a version, never overwrites one. Anyone may. */
  .post(
    '/api/recipes/:id/versions',
    idParam,
    zValidator('json', recipeContentSchema),
    c =>
      c.json({
        versionNo: recipes.edit(
          c.req.valid('param').id,
          c.get('user').id,
          c.req.valid('json'),
        ),
      }),
  )

  /** Only for a capture that produced nothing. */
  .post('/api/recipes/:id/retry', idParam, c => {
    const { id } = c.req.valid('param');
    recipes.retry(id);
    return c.json({ id, status: 'pending' as const }, 202);
  })

  .post('/api/recipes/:id/reread', idParam, c => {
    const { id } = c.req.valid('param');
    recipes.reread(id, c.get('user').id);
    return c.json({ id, status: 'pending' as const }, 202);
  })

  .put(
    '/api/recipes/:id/tags',
    idParam,
    zValidator('json', z.object({ tags: z.array(z.enum(TAG_IDS)) })),
    c => {
      recipes.updateTags(c.req.valid('param').id, c.req.valid('json').tags);
      return c.body(null, 204);
    },
  )

  .delete('/api/recipes/:id', idParam, c => {
    recipes.softDelete(c.req.valid('param').id, c.get('user').id);
    return c.body(null, 204);
  })

  .put(
    '/api/recipes/:id/rating',
    idParam,
    zValidator('json', ratingSchema),
    c => {
      recipes.rate(
        c.req.valid('param').id,
        c.get('user').id,
        c.req.valid('json').score,
      );
      return c.body(null, 204);
    },
  )

  .post(
    '/api/recipes/:id/comments',
    idParam,
    zValidator('json', commentSchema),
    c =>
      c.json(
        {
          id: recipes.addComment(
            c.req.valid('param').id,
            c.get('user').id,
            c.req.valid('json').body,
          ),
        },
        201,
      ),
  )

  .delete('/api/comments/:id', idParam, c => {
    recipes.deleteComment(c.req.valid('param').id, c.get('user').id);
    return c.body(null, 204);
  })

  /**
   * The photographed page, addressed by source id. The stored path never
   * appears in a URL, so traversal is not a class of bug that exists here.
   */
  .get('/api/photos/:id', idParam, c => {
    const file = recipes.photo(c.req.valid('param').id);
    return c.body(file.stream(), 200, { 'content-type': file.type });
  });
