import { describe, expect, it } from 'bun:test';

import type { RecipeContent } from '@scran/shared';
import sharp from 'sharp';

import { db } from './db';
import {
  addComment,
  addVersion,
  capture,
  captureUrl,
  edit,
  ftsQuery,
  get,
  list,
  photo as photoSource,
  rate,
  retry,
  reread,
  runExtraction,
  setTags,
  softDelete,
  sweepStalePending,
  versions,
} from './recipes';
import { readSource, saveSource } from './storage';
import {
  recordedComplete,
  signUpThroughInvite,
  TEST_PHOTO_BYTES,
} from './testing';

/** @returns {Promise<string>} A real user id, made the way the app makes them. */
async function person(): Promise<string> {
  const { email } = await signUpThroughInvite();
  return (
    db.query('SELECT id FROM "user" WHERE email = ?').get(email) as {
      id: string;
    }
  ).id;
}

const photo = () => new Blob([TEST_PHOTO_BYTES], { type: 'image/png' });

const content = (name: string): RecipeContent => ({
  name,
  description: null,
  recipeYield: null,
  yieldQuantity: null,
  yieldUnit: null,
  totalTime: null,
  prepTime: null,
  performTime: null,
  totalMinutes: null,
  timeEstimated: null,
  ingredients: [
    {
      title: null,
      text: '2 aubergines',
      quantity: 2,
      unit: null,
      food: 'aubergines',
      note: null,
    },
  ],
  instructions: [{ title: null, text: 'Roast them.' }],
  notes: [],
});

describe('multiple-photo captures', () => {
  const waitForReading = async (id: number) => {
    for (let i = 0; i < 100 && get(id).status === 'pending'; i++) {
      await Bun.sleep(10);
    }
    expect(get(id).status).not.toBe('pending');
  };

  it('reads every rotated page together in order on failure, retry and reread, preserving originals', async () => {
    const userId = await person();
    const secondBytes = await sharp(TEST_PHOTO_BYTES).flop().png().toBuffer();
    const { id } = await capture(userId, {
      kind: 'photos',
      photos: [
        { data: photo(), rotation: 90 },
        { data: new Blob([secondBytes], { type: 'image/png' }), rotation: 180 },
      ],
    });
    const sources = get(id).sources;
    expect(sources).toHaveLength(2);
    expect(sources[0].id).toBeLessThan(sources[1].id);
    for (const [index, source] of sources.entries()) {
      expect(Buffer.from(await photoSource(source.id).arrayBuffer())).toEqual(
        index === 0 ? TEST_PHOTO_BYTES : secondBytes,
      );
    }
    const expected = await Promise.all([
      sharp(TEST_PHOTO_BYTES).rotate(90).raw().toBuffer(),
      sharp(secondBytes).rotate(180).raw().toBuffer(),
    ]);
    let calls = 0;
    let fail = true;
    const recorded = recordedComplete();
    const complete: typeof recorded = async request => {
      calls++;
      expect(request.source.kind).toBe('photos');
      if (request.source.kind !== 'photos') {
        throw new Error('Expected the complete ordered photo batch');
      }
      expect(request.source.photos).toHaveLength(2);
      const actual = await Promise.all(
        request.source.photos.map(async page =>
          sharp(Buffer.from(await page.arrayBuffer()))
            .raw()
            .toBuffer(),
        ),
      );
      expect(actual).toEqual(expected);
      if (fail) {
        throw new Error('Temporary upstream failure');
      }
      return recorded(request);
    };
    await runExtraction(id, { complete });
    expect(get(id).status).toBe('failed');
    expect(versions(id)).toHaveLength(0);
    fail = false;
    retry(id, { complete });
    await waitForReading(id);
    expect(versions(id)).toHaveLength(1);
    setTags(id, ['main']);
    fail = true;
    reread(id, userId, { complete });
    await waitForReading(id);
    expect(versions(id)).toHaveLength(1);
    expect(get(id).version?.versionNo).toBe(1);
    fail = false;
    reread(id, userId, { complete });
    await waitForReading(id);
    expect(versions(id)).toHaveLength(2);
    expect(get(id).tags).toEqual(['main']);
    expect(calls).toBe(4);
    expect(get(id).sources).toEqual(sources);
    for (const [index, source] of sources.entries()) {
      expect(Buffer.from(await photoSource(source.id).arrayBuffer())).toEqual(
        index === 0 ? TEST_PHOTO_BYTES : secondBytes,
      );
    }
  });

  it('removes all saved bytes and rows when saving a later page fails', async () => {
    const userId = await person();
    const before = db.query('SELECT id FROM recipe ORDER BY id').all();
    const beforeSources = db.query('SELECT id FROM source ORDER BY id').all();
    let savedKey: string | undefined;
    let calls = 0;
    expect(
      capture(
        userId,
        {
          kind: 'photos',
          photos: [
            { data: photo(), rotation: 0 },
            { data: photo(), rotation: 90 },
          ],
        },
        {
          saveSource: async (id, data) => {
            if (++calls === 2) {
              throw new Error('Disk full');
            }
            savedKey = await saveSource(id, data);
            return savedKey;
          },
        },
      ),
    ).rejects.toThrow('Could not save those sources');
    expect(db.query('SELECT id FROM recipe ORDER BY id').all()).toEqual(before);
    expect(db.query('SELECT id FROM source ORDER BY id').all()).toEqual(
      beforeSources,
    );
    expect(savedKey).toBeDefined();
    if (savedKey) {
      expect(await readSource(savedKey).exists()).toBe(false);
    }
  });

  it('rolls back a failed batch even when dependants are added while saving', async () => {
    const userId = await person();
    const before = db.query('SELECT id FROM recipe ORDER BY id').all();
    const beforeSources = db.query('SELECT id FROM source ORDER BY id').all();
    let savedKey: string | undefined;
    let recipeId: number | undefined;
    let calls = 0;
    const result = await capture(
      userId,
      {
        kind: 'photos',
        photos: [
          { data: photo(), rotation: 0 },
          { data: photo(), rotation: 90 },
        ],
      },
      {
        saveSource: async (sourceId, data) => {
          if (++calls === 2) {
            const sourceRow = db
              .query('SELECT recipeId FROM source WHERE id = ?')
              .get(sourceId) as { recipeId: number };
            recipeId = sourceRow.recipeId;
            // Requests can reach the pending recipe before capture resolves.
            rate(recipeId, userId, 2);
            addComment(recipeId, userId, 'Looking forward to this');
            // Cover all dependent tables, including internal writes.
            addVersion(recipeId, {
              userId,
              content: content('Incomplete batch'),
            });
            setTags(recipeId, ['main']);
            throw new Error('Disk full');
          }
          savedKey = await saveSource(sourceId, data);
          return savedKey;
        },
      },
    ).catch(cause => cause);
    expect(result).toHaveProperty('message', 'Could not save those sources.');
    expect(recipeId).toBeDefined();
    expect(db.query('SELECT id FROM recipe ORDER BY id').all()).toEqual(before);
    expect(db.query('SELECT id FROM source ORDER BY id').all()).toEqual(
      beforeSources,
    );
    for (const table of ['rating', 'comment', 'recipeVersion', 'recipeTag']) {
      expect(
        db
          .query(`SELECT * FROM ${table} WHERE recipeId = ?`)
          .all(recipeId ?? -1),
      ).toEqual([]);
    }
    expect(
      db
        .query('SELECT rowid FROM recipeSearch WHERE rowid = ?')
        .all(recipeId ?? -1),
    ).toEqual([]);
    expect(savedKey).toBeDefined();
    if (savedKey) {
      expect(await readSource(savedKey).exists()).toBe(false);
    }
  });

  it('rejects an empty direct batch before creating rows', async () => {
    const userId = await person();
    const before = db.query('SELECT id FROM recipe ORDER BY id').all();
    expect(capture(userId, { kind: 'photos', photos: [] })).rejects.toThrow();
    expect(db.query('SELECT id FROM recipe ORDER BY id').all()).toEqual(before);
  });
});

describe('ftsQuery', () => {
  it('quotes every token and prefixes the last, so typing never errors', () => {
    expect(ftsQuery('warming lentil')).toBe('"warming" "lentil"*');
  });

  it('survives what FTS5 would otherwise choke on', () => {
    // `AND` is a keyword, `"` and `*` are syntax; all three are just words here.
    expect(ftsQuery('slow-cooked "beef" AND*')).toBe(
      '"slow" "cooked" "beef" "AND"*',
    );
    expect(ftsQuery('   ')).toBe('');
  });
});

describe('versions', () => {
  it('numbers from one and makes the highest current', async () => {
    // Arrange
    const userId = await person();
    const { id } = await capture(userId, { kind: 'photo', data: photo() });

    // Act
    const first = addVersion(id, {
      userId,
      content: content('Ragu'),
      model: 'gpt-4.1',
    });
    const second = edit(id, userId, content('Ragù'));

    // Assert
    expect([first, second]).toEqual([1, 2]);
    const recipe = get(id);
    expect(recipe.version?.versionNo).toBe(2);
    expect(recipe.version?.name).toBe('Ragù');
    // A person wrote the edit, so it carries no model — that is the whole
    // signal ticket 04 chose over a separate column.
    expect(recipe.version?.model).toBeNull();
  });
});

describe('deleting', () => {
  it('is the creator’s alone, and takes the recipe out of every read', async () => {
    // Arrange
    const owner = await person();
    const someoneElse = await person();
    const { id } = await capture(owner, { kind: 'photo', data: photo() });
    addVersion(id, { userId: owner, content: content('Panzanella') });

    // Act + Assert — anyone edits, only the creator deletes.
    expect(() => softDelete(id, someoneElse)).toThrow(
      'Only whoever added this recipe can delete it.',
    );
    expect(() => edit(id, someoneElse, content('Panzanella!'))).not.toThrow();

    softDelete(id, owner);
    expect(() => get(id)).toThrow('No such recipe.');
    expect(list().some(row => row.id === id)).toBe(false);
    // The trigger drops it from the index too, so search cannot resurrect it.
    expect(list('Panzanella').some(row => row.id === id)).toBe(false);
  });
});

describe('search', () => {
  it('finds a recipe by its ingredients, and by a tag it never says', async () => {
    // Arrange
    const userId = await person();
    const { id } = await capture(userId, { kind: 'photo', data: photo() });
    addVersion(id, { userId, content: content('Roast aubergine') });
    setTags(id, ['vegan']);

    // Assert — the page says "aubergines"; it never says "veggie".
    expect(list('aubergine').map(r => r.id)).toContain(id);
    expect(list('veggie').map(r => r.id)).toContain(id);
    // vegan implies vegetarian, enforced on write as well as in the prompt.
    expect(get(id).tags).toEqual(['vegan', 'vegetarian']);
  });

  it('keeps the tags in the index when a later version rebuilds the row', async () => {
    // Arrange
    const userId = await person();
    const { id } = await capture(userId, { kind: 'photo', data: photo() });
    addVersion(id, { userId, content: content('Dal') });
    setTags(id, ['vegetarian']);

    // Act — an edit rebuilds the index row; the tags must survive it.
    edit(id, userId, content('Tarka dal'));

    // Assert
    expect(list('veggie').map(r => r.id)).toContain(id);
  });
});

describe('capture', () => {
  it('stores raw HTML and extracts it through the shared path', async () => {
    // Arrange
    const userId = await person();
    const url = 'https://1.1.1.1/recipe';
    const html = '<html><body>Chocolate chip muffins</body></html>';

    // Act
    const { id, sourceId } = await captureUrl(userId, url, {
      request: async () =>
        new Response(html, { headers: { 'content-type': 'text/html' } }),
      lookup: async () => [],
    });
    await runExtraction(id, { complete: recordedComplete() });

    // Assert
    expect(get(id).status).toBe('ready');
    const source = db
      .query('SELECT kind, path, url FROM source WHERE id = ?')
      .get(sourceId) as { kind: string; path: string; url: string };
    expect(source).toMatchObject({ kind: 'html', url });
    expect(await readSource(source.path).text()).toBe(html);
  });

  it('classifies webpage fetch failures as retryable dependencies', async () => {
    // Arrange
    const userId = await person();
    const url = 'https://1.1.1.1/not-html';
    const lookup = async () => [{ address: '1.1.1.1', family: 4 }];
    let cancelled = 0;
    const body = () =>
      new ReadableStream({
        cancel() {
          cancelled++;
        },
      });

    // Act
    const nonHtml = await captureUrl(userId, url, {
      request: async () =>
        new Response(body(), {
          headers: { 'content-type': 'text/plain' },
        }),
      lookup,
    }).catch(error => error);
    const unavailable = await captureUrl(userId, url, {
      request: async () => new Response(body(), { status: 503 }),
      lookup,
    }).catch(error => error);

    // Assert
    expect(nonHtml).toMatchObject({ type: 'dependency', retryable: true });
    expect(unavailable).toMatchObject({ type: 'dependency', retryable: true });
    expect(cancelled).toBe(2);
  });

  it('refuses private targets, including after a redirect', async () => {
    // Arrange
    const userId = await person();
    const requestPage = async () =>
      new Response('', {
        status: 302,
        headers: { location: 'http://127.0.0.1/admin' },
      });

    // Act
    const direct = await captureUrl(userId, 'http://127.0.0.1/admin', {
      request: requestPage,
      lookup: async () => [],
    }).catch(error => error);
    const redirected = await captureUrl(userId, 'https://1.1.1.1/recipe', {
      request: requestPage,
      lookup: async () => [],
    }).catch(error => error);

    // Assert
    expect(direct).toMatchObject({ type: 'validation', status: 400 });
    expect(redirected).toMatchObject({ type: 'dependency', status: 503 });
  });

  it('classifies a broken webpage stream as a dependency', async () => {
    // Arrange
    const userId = await person();
    const body = new ReadableStream({
      pull(controller) {
        controller.error(new Error('connection dropped'));
      },
    });

    // Act
    const error = await captureUrl(userId, 'https://1.1.1.1/recipe', {
      request: async () =>
        new Response(body, { headers: { 'content-type': 'text/html' } }),
      lookup: async () => [],
    }).catch(cause => cause);

    // Assert
    expect(error).toMatchObject({ type: 'dependency', retryable: true });
  });

  it('keeps a non-recipe source without creating recipe content, and can retry', async () => {
    const userId = await person();
    const { id, sourceId } = await capture(userId, {
      kind: 'photo',
      data: photo(),
    });
    await runExtraction(id, {
      complete: async () => ({
        model: 'test',
        json: 'null',
        tokensIn: 1,
        tokensOut: 1,
      }),
    });

    expect(get(id)).toMatchObject({
      status: 'failed',
      failureReason: 'no_recipe',
      version: null,
      tags: [],
    });
    expect(list().find(recipe => recipe.id === id)?.failureReason).toBe(
      'no_recipe',
    );
    expect(await photoSource(sourceId).arrayBuffer()).toEqual(
      await photo().arrayBuffer(),
    );

    retry(id, { complete: recordedComplete() });
    expect(get(id).failureReason).toBeNull();
    for (let i = 0; i < 50 && get(id).status === 'pending'; i++) {
      await Bun.sleep(10);
    }
    expect(get(id)).toMatchObject({ status: 'ready', failureReason: null });
  });

  it('runs the model behind the request and lands a ready recipe', async () => {
    // Arrange
    const userId = await person();
    const { id } = await capture(userId, { kind: 'photo', data: photo() });
    expect(get(id).status).toBe('pending');

    // Act
    await runExtraction(id, { complete: recordedComplete() });

    // Assert
    const recipe = get(id);
    expect(recipe.status).toBe('ready');
    expect(recipe.version?.name).toBe('Chocolate Chip Muffins');
    expect(recipe.tags).toContain('baking');
  });

  it('keeps the original photo and reuses its selected rotation after failure', async () => {
    const userId = await person();
    const { id, sourceId } = await capture(userId, {
      kind: 'photo',
      data: photo(),
      rotation: 90,
    });
    expect(
      db.query('SELECT rotation FROM source WHERE id = ?').get(sourceId),
    ).toMatchObject({ rotation: 90 });

    let attempts = 0;
    const recorded = recordedComplete();
    const complete: typeof recorded = async request => {
      expect(request.source.kind).toBe('photo');
      if (request.source.kind !== 'photo') {
        throw new Error('Expected a photo');
      }
      const metadata = await sharp(
        Buffer.from(await request.source.photo.arrayBuffer()),
      ).metadata();
      expect(metadata.width).toBe(3);
      expect(metadata.height).toBe(2);
      if (++attempts === 1) {
        throw new Error('Temporary upstream failure');
      }
      return recorded(request);
    };
    await runExtraction(id, { complete });
    expect(get(id).status).toBe('failed');
    await runExtraction(id, { complete });
    expect(get(id).status).toBe('ready');
    expect(attempts).toBe(2);
    const source = db
      .query('SELECT path FROM source WHERE id = ?')
      .get(sourceId);
    if (
      typeof source !== 'object' ||
      source === null ||
      !('path' in source) ||
      typeof source.path !== 'string'
    ) {
      throw new Error('Missing source');
    }
    expect(Buffer.from(await readSource(source.path).arrayBuffer())).toEqual(
      TEST_PHOTO_BYTES,
    );
  });

  it('leaves a failure retryable, and refuses to re-extract once there is content', async () => {
    // Arrange
    const userId = await person();
    const { id } = await capture(userId, { kind: 'photo', data: photo() });

    // Act — the upstream falls over.
    await runExtraction(id, {
      complete: async () => {
        throw new Error('OpenAI is having a day');
      },
    });

    // Assert
    expect(get(id).status).toBe('failed');
    expect(get(id).version).toBeNull();

    // Act — retry, this time with a model that answers.
    await runExtraction(id, { complete: recordedComplete() });
    expect(get(id).status).toBe('ready');

    // Assert — and now there is content, so re-extraction is refused.
    expect(() => retry(id)).toThrow('already has content');
  });
});

describe('read source again', () => {
  const waitForReading = async (id: number) => {
    for (let i = 0; i < 50 && get(id).status === 'pending'; i++) {
      await Bun.sleep(10);
    }
    expect(get(id).status).not.toBe('pending');
  };

  it('appends a version attributed to the requester while preserving earlier content and tags', async () => {
    const owner = await person();
    const reader = await person();
    const { id } = await capture(owner, { kind: 'photo', data: photo() });
    addVersion(id, {
      userId: owner,
      content: content('Hand-corrected recipe'),
    });
    setTags(id, ['main']);
    const recorded = recordedComplete();
    let release = () => {};
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    reread(id, reader, {
      complete: async request => {
        await gate;
        return recorded(request);
      },
    });

    expect(get(id)).toMatchObject({
      status: 'pending',
      version: { name: 'Hand-corrected recipe' },
    });
    expect(() => reread(id, reader)).toThrow('still being read');
    expect(() => edit(id, owner, content('Conflicting edit'))).toThrow(
      'finished being read',
    );
    release();
    await waitForReading(id);

    expect(get(id)).toMatchObject({
      status: 'ready',
      tags: ['main'],
      version: {
        versionNo: 2,
        name: 'Chocolate Chip Muffins',
        createdByUserId: reader,
      },
    });
    expect(versions(id).map(version => version.name)).toEqual([
      'Chocolate Chip Muffins',
      'Hand-corrected recipe',
    ]);
  });

  it('keeps the prior version when the reader finds no recipe or fails, and permits correction afterwards', async () => {
    for (const json of ['null', 'not json']) {
      const owner = await person();
      const { id } = await capture(owner, { kind: 'photo', data: photo() });
      addVersion(id, { userId: owner, content: content('Saved recipe') });
      reread(id, owner, {
        complete: async () => ({
          model: 'test',
          json,
          tokensIn: 1,
          tokensOut: 1,
        }),
      });
      await waitForReading(id);
      expect(get(id)).toMatchObject({
        status: 'failed',
        version: { name: 'Saved recipe', versionNo: 1 },
      });
      expect(versions(id)).toHaveLength(1);
      edit(id, owner, content('Corrected recipe'));
      expect(get(id)).toMatchObject({
        status: 'ready',
        failureReason: null,
        version: { name: 'Corrected recipe', versionNo: 2 },
      });
    }
  });

  it('refuses rereading a recipe without a source, or one that was deleted', async () => {
    const owner = await person();
    const { id } = await capture(owner, { kind: 'photo', data: photo() });
    db.run("UPDATE recipe SET status = 'failed' WHERE id = ?", [id]);
    expect(() => reread(id, owner)).toThrow('no saved recipe yet');
    addVersion(id, { userId: owner, content: content('Saved recipe') });
    db.run('DELETE FROM source WHERE recipeId = ?', [id]);
    expect(() => reread(id, owner)).toThrow('no saved source');
    softDelete(id, owner);
    expect(() => reread(id, owner)).toThrow('No such recipe');
  });
});

describe('sweepStalePending', () => {
  it('fails only the rows a restart could have stranded', async () => {
    // Arrange
    const userId = await person();
    const stuck = await capture(userId, { kind: 'photo', data: photo() });
    const justStarted = await capture(userId, {
      kind: 'photo',
      data: photo(),
    });
    // Aged by updatedAt, which is what "pending since" means — a retry moves
    // it, so a long-dead recipe gets its own ten minutes.
    db.run('UPDATE recipe SET updatedAt = ? WHERE id = ?', [
      new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      stuck.id,
    ]);

    // Act
    sweepStalePending();

    // Assert
    expect(get(stuck.id).status).toBe('failed');
    expect(get(justStarted.id).status).toBe('pending');

    // Act — retrying the swept one puts it back, and it is not stale again.
    retry(stuck.id, { complete: recordedComplete() });
    sweepStalePending();

    // Assert
    expect(get(stuck.id).status).not.toBe('failed');
  });

  it('refuses a retry while one is already in flight', async () => {
    // Arrange
    const userId = await person();
    const { id } = await capture(userId, { kind: 'photo', data: photo() });

    // Act + Assert — a second run would append a second version.
    expect(() => retry(id)).toThrow('still being read');
  });
});
