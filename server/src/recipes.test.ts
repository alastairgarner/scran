import { describe, expect, it } from 'bun:test';
import type { RecipeContent } from '@scran/shared';
import { db } from './db';
import {
  addVersion,
  capture,
  edit,
  ftsQuery,
  get,
  list,
  retry,
  runExtraction,
  setTags,
  softDelete,
  sweepStalePending,
} from './recipes';
import { recordedComplete, signUpThroughInvite } from './testing';

/** @returns {Promise<string>} A real user id, made the way the app makes them. */
async function person(): Promise<string> {
  const { email } = await signUpThroughInvite();
  return (
    db.query('SELECT id FROM "user" WHERE email = ?').get(email) as {
      id: string;
    }
  ).id;
}

const photo = () =>
  new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' });

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
    const { id } = await capture(userId, photo());

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
    const { id } = await capture(owner, photo());
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
    const { id } = await capture(userId, photo());
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
    const { id } = await capture(userId, photo());
    addVersion(id, { userId, content: content('Dal') });
    setTags(id, ['vegetarian']);

    // Act — an edit rebuilds the index row; the tags must survive it.
    edit(id, userId, content('Tarka dal'));

    // Assert
    expect(list('veggie').map(r => r.id)).toContain(id);
  });
});

describe('capture', () => {
  it('runs the model behind the request and lands a ready recipe', async () => {
    // Arrange
    const userId = await person();
    const { id } = await capture(userId, photo());
    expect(get(id).status).toBe('pending');

    // Act
    await runExtraction(id, { complete: recordedComplete() });

    // Assert
    const recipe = get(id);
    expect(recipe.status).toBe('ready');
    expect(recipe.version?.name).toBe('Chocolate Chip Muffins');
    expect(recipe.tags).toContain('baking');
  });

  it('leaves a failure retryable, and refuses to re-extract once there is content', async () => {
    // Arrange
    const userId = await person();
    const { id } = await capture(userId, photo());

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

describe('sweepStalePending', () => {
  it('fails only the rows a restart could have stranded', async () => {
    // Arrange
    const userId = await person();
    const stuck = await capture(userId, photo());
    const justStarted = await capture(userId, photo());
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
    const { id } = await capture(userId, photo());

    // Act + Assert — a second run would append a second version.
    expect(() => retry(id)).toThrow('still being read');
  });
});
