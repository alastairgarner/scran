/**
 * The deep one. Every rule about recipes lives here and nowhere else:
 * `versionNo = max + 1`, current-is-highest, `deletedAt` filtered on every
 * read, anyone-edits / creator-only-deletes, and which status transitions are
 * legal. All of those are re-derivable at a call site, and exactly one call
 * site would get one wrong.
 *
 * No route below this file contains SQL or a permission `if`.
 */

import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';

import type {
  Ingredient,
  PhotoRotation,
  RecipeContent,
  Section,
  TagId,
} from '@scran/shared';
import { normaliseTags, TAGS } from '@scran/shared';

import { db } from './db';
import { AppError, ClientError } from './errors';
import { extract } from './extraction';
import type { Complete } from './extraction/openai';
import { preparePhoto } from './extraction/photo';
import { logger } from './logger';
import { readSource, saveSource } from './storage';

/** A capture is `pending` until the model answers, then `ready` or `failed`. */
export type RecipeStatus = 'pending' | 'ready' | 'failed';

type CaptureSource =
  | { kind: 'photo'; data: Blob; rotation?: PhotoRotation }
  | { kind: 'html'; data: Blob; url: string };

/** Long enough that a slow model finishes; short enough to unstick a restart. */
const STALE_PENDING_MS = 10 * 60 * 1000;

/** Plenty for recipe pages; bounded so an upstream cannot fill memory. */
const MAX_HTML_BYTES = 2 * 1024 * 1024;

const MAX_REDIRECTS = 5;

const NON_PUBLIC_IPS = new BlockList();
for (const [network, prefix, family] of [
  ['0.0.0.0', 8, 'ipv4'],
  ['10.0.0.0', 8, 'ipv4'],
  ['100.64.0.0', 10, 'ipv4'],
  ['127.0.0.0', 8, 'ipv4'],
  ['169.254.0.0', 16, 'ipv4'],
  ['172.16.0.0', 12, 'ipv4'],
  ['192.0.0.0', 24, 'ipv4'],
  ['192.0.2.0', 24, 'ipv4'],
  ['192.168.0.0', 16, 'ipv4'],
  ['198.18.0.0', 15, 'ipv4'],
  ['198.51.100.0', 24, 'ipv4'],
  ['203.0.113.0', 24, 'ipv4'],
  ['224.0.0.0', 4, 'ipv4'],
  ['240.0.0.0', 4, 'ipv4'],
  ['::', 128, 'ipv6'],
  ['::1', 128, 'ipv6'],
  ['64:ff9b:1::', 48, 'ipv6'],
  ['100::', 64, 'ipv6'],
  ['2001:db8::', 32, 'ipv6'],
  ['fc00::', 7, 'ipv6'],
  ['fe80::', 10, 'ipv6'],
  ['ff00::', 8, 'ipv6'],
] as const) {
  NON_PUBLIC_IPS.addSubnet(network, prefix, family);
}

type UrlDependencies = {
  request: (
    url: URL,
    address: { address: string; family: number },
  ) => Promise<Response>;
  lookup: (
    hostname: string,
    options: { all: true; verbatim: true },
  ) => Promise<{ address: string; family: number }[]>;
};

const now = () => new Date().toISOString();

type VersionRow = {
  id: number;
  versionNo: number;
  createdByUserId: string;
  name: string;
  description: string | null;
  recipeYield: string | null;
  yieldQuantity: number | null;
  yieldUnit: string | null;
  totalTime: string | null;
  prepTime: string | null;
  performTime: string | null;
  totalMinutes: number | null;
  timeEstimated: number | null;
  ingredients: string;
  instructions: string;
  notes: string;
  model: string | null;
  promptVersion: string | null;
  createdAt: string;
};

/** SQLite has no boolean; a nullable one is 0, 1 or NULL on the way out. */
const asBoolean = (value: number | null) =>
  value === null ? null : value === 1;

/** The three JSON columns and SQLite's integer boolean, turned back into data. */
const hydrate = (row: VersionRow) => ({
  ...row,
  timeEstimated: asBoolean(row.timeEstimated),
  ingredients: JSON.parse(row.ingredients) as Ingredient[],
  instructions: JSON.parse(row.instructions) as Section[],
  notes: JSON.parse(row.notes) as Section[],
});

/**
 * Rewrites the SQL-side projection of `shared`'s TAGS constant. Called at boot;
 * idempotent, ten rows, and the reason the search triggers can index *veggie*
 * without a vocabulary table anyone maintains by hand.
 */
export function syncTagSearch(): void {
  db.transaction(() => {
    for (const tag of TAGS) {
      db.run(
        `INSERT INTO tagSearch (tag, search) VALUES (?, ?)
         ON CONFLICT (tag) DO UPDATE SET search = excluded.search`,
        [tag.id, tag.search],
      );
    }
  })();
}

/**
 * Turns what someone typed into an FTS5 MATCH expression. Every token is
 * quoted, so `aubergine AND` or a stray `"` is a search for those words rather
 * than a syntax error thrown at the user, and the last one gets a `*` because
 * a catalogue search is really a search-as-you-type.
 *
 * @returns {string} The MATCH expression, or `''` when there is nothing to
 *   search for — callers treat that as "no query".
 */
export function ftsQuery(query: string): string {
  const tokens = query
    .replace(/["*^:()-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return tokens
    .map((token, i) => (i === tokens.length - 1 ? `"${token}"*` : `"${token}"`))
    .join(' ');
}

/**
 * Starts a capture: the recipe row and its source exist, `pending`, before the
 * model is called — so a failure anywhere after this is retryable from the
 * source on disk rather than lost.
 *
 * @returns {Promise<{ id: number; sourceId: number }>} The new recipe.
 */
export async function capture(
  userId: string,
  source: CaptureSource,
): Promise<{
  id: number;
  sourceId: number;
}> {
  const at = now();
  const { id, sourceId } = db.transaction(() => {
    const recipe = db
      .query(
        `INSERT INTO recipe (status, createdByUserId, createdAt, updatedAt)
         VALUES ('pending', ?, ?, ?) RETURNING id`,
      )
      .get(userId, at, at) as { id: number };
    const sourceRow = db
      .query(
        `INSERT INTO source (recipeId, kind, url, rotation, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
      )
      .get(
        recipe.id,
        source.kind,
        source.kind === 'html' ? source.url : null,
        source.kind === 'photo' ? (source.rotation ?? 0) : 0,
        at,
        at,
      ) as { id: number };
    return { id: recipe.id, sourceId: sourceRow.id };
  })();

  // The bytes land after the rows, so the key `storage` returns is written
  // back rather than guessed at — `storage` keeps its monopoly on paths. A
  // disk that refuses them fails the recipe on the spot rather than leaving it
  // pending for the boot sweep to find in ten minutes' time.
  try {
    const key = await saveSource(sourceId, source.data);
    db.run('UPDATE source SET path = ?, updatedAt = ? WHERE id = ?', [
      key,
      now(),
      sourceId,
    ]);
  } catch (cause) {
    setStatus(id, 'failed');
    throw AppError.internal('Could not save that source.', { id }, cause);
  }
  return { id, sourceId };
}

/** Fetches and permanently stores a webpage before extraction starts. */
export async function captureUrl(
  userId: string,
  url: string,
  deps: UrlDependencies = { request: requestPinned, lookup },
): Promise<{ id: number; sourceId: number }> {
  const { response, finalUrl } = await fetchWebpage(url, deps);

  if (!response.ok) {
    await response.body?.cancel();
    throw AppError.dependency('Could not fetch that webpage.', {
      url,
      status: response.status,
    });
  }

  const contentType = response.headers.get('content-type')?.split(';')[0];
  if (contentType?.trim().toLowerCase() !== 'text/html') {
    await response.body?.cancel();
    throw AppError.dependency('That URL did not return HTML.', {
      url,
      contentType,
    });
  }

  return capture(userId, {
    kind: 'html',
    data: await readHtml(response, url),
    url: finalUrl,
  });
}

async function fetchWebpage(
  input: string,
  deps: UrlDependencies,
): Promise<{ response: Response; finalUrl: string }> {
  let url = input;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    let target: Awaited<ReturnType<typeof requirePublicUrl>>;
    try {
      target = await requirePublicUrl(url, deps.lookup);
    } catch (cause) {
      if (redirects > 0 && cause instanceof ClientError) {
        throw AppError.dependency(
          'That webpage redirected to a private address.',
          { url },
          cause,
        );
      }
      throw cause;
    }

    let response: Response;
    try {
      response = await deps.request(target.url, target.address);
    } catch (cause) {
      throw AppError.dependency(
        'Could not fetch that webpage.',
        { url: target.url.href },
        cause,
      );
    }

    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return { response, finalUrl: target.url.href };
    }

    await response.body?.cancel();
    const location = response.headers.get('location');
    if (!location) {
      throw AppError.dependency('That webpage redirected nowhere.', {
        url: target.url.href,
      });
    }
    try {
      url = new URL(location, target.url).href;
    } catch (cause) {
      throw AppError.dependency(
        'That webpage returned a broken redirect.',
        { url: target.url.href, location },
        cause,
      );
    }
  }

  throw AppError.dependency('That webpage redirected too many times.', {
    url: input,
  });
}

async function requirePublicUrl(
  input: string,
  resolve: UrlDependencies['lookup'],
): Promise<{ url: URL; address: { address: string; family: number } }> {
  const url = new URL(input);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username !== '' ||
    url.password !== ''
  ) {
    throw ClientError.validation('Send a public HTTP URL.');
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const literalFamily = isIP(hostname);
  let addresses: { address: string; family: number }[];
  try {
    addresses = literalFamily
      ? [{ address: hostname, family: literalFamily }]
      : await resolve(hostname, { all: true, verbatim: true });
  } catch (cause) {
    throw AppError.dependency(
      'Could not resolve that webpage.',
      { hostname },
      cause,
    );
  }

  if (
    addresses.length === 0 ||
    addresses.some(({ address, family }) =>
      NON_PUBLIC_IPS.check(address, family === 4 ? 'ipv4' : 'ipv6'),
    )
  ) {
    throw ClientError.validation('Send a public HTTP URL.');
  }
  return { url, address: addresses[0] };
}

function requestPinned(
  url: URL,
  address: { address: string; family: number },
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const pinnedLookup: LookupFunction = (_hostname, options, callback) => {
      callback(null, options.all ? [address] : address.address, address.family);
    };
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
      url,
      {
        headers: { accept: 'text/html' },
        lookup: pinnedLookup,
        signal: AbortSignal.timeout(15_000),
      },
      incoming => {
        const status = incoming.statusCode;
        if (!status || status < 200 || status > 599) {
          incoming.destroy();
          reject(new Error(`Unsupported HTTP status: ${status}`));
          return;
        }
        const headers = new Headers();
        for (let index = 0; index < incoming.rawHeaders.length; index += 2) {
          headers.append(
            incoming.rawHeaders[index],
            incoming.rawHeaders[index + 1],
          );
        }
        if ([204, 205, 304].includes(status)) {
          incoming.resume();
          resolve(new Response(null, { status, headers }));
          return;
        }
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            incoming.on('data', (chunk: Uint8Array) =>
              controller.enqueue(chunk),
            );
            incoming.on('end', () => controller.close());
            incoming.on('error', error => controller.error(error));
          },
          cancel() {
            incoming.destroy();
          },
        });
        resolve(new Response(body, { status, headers }));
      },
    );
    request.on('error', reject);
    request.end();
  });
}

async function readHtml(response: Response, url: string): Promise<Blob> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw AppError.dependency('That webpage had no content.', { url });
  }

  const bytes = new Uint8Array(MAX_HTML_BYTES);
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (size + value.byteLength > MAX_HTML_BYTES) {
        await reader.cancel();
        throw AppError.dependency('That webpage is too large.', { url });
      }
      bytes.set(value, size);
      size += value.byteLength;
    }
  } catch (cause) {
    if (cause instanceof AppError) {
      throw cause;
    }
    throw AppError.dependency('Could not read that webpage.', { url }, cause);
  }

  return new Blob([bytes.slice(0, size)], { type: 'text/html' });
}

/**
 * Reads the recipe off its source and writes version 1. Called as a floating
 * promise, so it swallows what it throws — the failure lives on the row, which
 * is what the client is polling anyway.
 */
export async function runExtraction(
  recipeId: number,
  deps?: { complete: Complete },
): Promise<void> {
  try {
    const source = db
      .query(
        `SELECT id, kind, path, rotation FROM source
         WHERE recipeId = ? ORDER BY id LIMIT 1`,
      )
      .get(recipeId) as
      | {
          id: number;
          kind: 'photo' | 'html';
          path: string | null;
          rotation: PhotoRotation;
        }
      | undefined;
    if (!source?.path) {
      throw AppError.invariant('A pending recipe has no source.', { recipeId });
    }

    const file = readSource(source.path);
    const extracted = await extract(
      source.kind === 'photo'
        ? { kind: 'photo', photo: await preparePhoto(file, source.rotation) }
        : { kind: 'html', html: await file.text() },
      deps,
    );
    db.transaction(() => {
      addVersion(recipeId, {
        userId: currentCreator(recipeId),
        content: extracted.content,
        model: extracted.model,
        promptVersion: extracted.promptVersion,
        tokensIn: extracted.tokensIn,
        tokensOut: extracted.tokensOut,
      });
      setTags(recipeId, extracted.tags);
      setStatus(recipeId, 'ready');
    })();
  } catch (error) {
    setStatus(recipeId, 'failed');
    logger.error({ recipeId, err: error }, 'Extraction failed');
  }
}

/** @returns {string} Who captured the recipe — the author of a model version. */
function currentCreator(recipeId: number): string {
  const row = db
    .query('SELECT createdByUserId FROM recipe WHERE id = ?')
    .get(recipeId) as { createdByUserId: string } | undefined;
  if (!row) {
    throw AppError.invariant('Recipe vanished mid-extraction.', { recipeId });
  }
  return row.createdByUserId;
}

function setStatus(recipeId: number, status: RecipeStatus): void {
  db.run('UPDATE recipe SET status = ?, updatedAt = ? WHERE id = ?', [
    status,
    now(),
    recipeId,
  ]);
}

/**
 * Appends a version. `versionNo` is `max + 1` and the current version is
 * simply the highest — there is no pointer that can disagree with the rows it
 * points at. A `model` of NULL means a person wrote this one.
 *
 * @returns {number} The new version number.
 */
export function addVersion(
  recipeId: number,
  version: {
    userId: string;
    content: RecipeContent;
    model?: string;
    promptVersion?: string;
    tokensIn?: number;
    tokensOut?: number;
  },
): number {
  const { content } = version;
  const at = now();
  const next =
    ((
      db
        .query(
          'SELECT max(versionNo) AS n FROM recipeVersion WHERE recipeId = ?',
        )
        .get(recipeId) as { n: number | null }
    ).n ?? 0) + 1;

  db.run(
    `INSERT INTO recipeVersion (
       recipeId, versionNo, createdByUserId, name, description, recipeYield,
       yieldQuantity, yieldUnit, totalTime, prepTime, performTime, totalMinutes,
       timeEstimated, ingredients, instructions, notes, model, promptVersion,
       tokensIn, tokensOut, createdAt, updatedAt
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      recipeId,
      next,
      version.userId,
      content.name,
      content.description,
      content.recipeYield,
      content.yieldQuantity,
      content.yieldUnit,
      content.totalTime,
      content.prepTime,
      content.performTime,
      content.totalMinutes,
      content.timeEstimated === null ? null : Number(content.timeEstimated),
      JSON.stringify(content.ingredients),
      JSON.stringify(content.instructions),
      JSON.stringify(content.notes),
      version.model ?? null,
      version.promptVersion ?? null,
      version.tokensIn ?? null,
      version.tokensOut ?? null,
      at,
      at,
    ],
  );
  db.run('UPDATE recipe SET updatedAt = ? WHERE id = ?', [at, recipeId]);
  return next;
}

/**
 * Replaces a recipe's tags wholesale. Not versioned — a tag labels the dish,
 * not the page — and normalised on the way in, so `vegan` always brings
 * `vegetarian` with it.
 */
export function setTags(recipeId: number, tags: readonly string[]): void {
  db.transaction(() => {
    db.run('DELETE FROM recipeTag WHERE recipeId = ?', [recipeId]);
    for (const tag of normaliseTags(tags)) {
      db.run('INSERT INTO recipeTag (recipeId, tag) VALUES (?, ?)', [
        recipeId,
        tag,
      ]);
    }
  })();
}

/**
 * An edit. Anyone may make one; it appends rather than overwriting.
 *
 * @returns {number} The new version number.
 */
export function edit(
  recipeId: number,
  userId: string,
  content: RecipeContent,
): number {
  requireAlive(recipeId);
  return addVersion(recipeId, { userId, content });
}

/**
 * Re-runs a capture that never produced anything. Valid only where no version
 * exists: once a recipe has content, corrections are edits, and there is no
 * such thing as re-extraction.
 *
 * @throws {ClientError} 409 when the recipe already has a version, or when a
 *   run is still in flight — a second one would append a second version and
 *   write the tags twice.
 */
export function retry(recipeId: number, deps?: { complete: Complete }): void {
  requireAlive(recipeId);
  const existing = db
    .query('SELECT 1 AS ok FROM recipeVersion WHERE recipeId = ? LIMIT 1')
    .get(recipeId);
  if (existing) {
    throw ClientError.conflict(
      'This recipe already has content — edit it instead.',
      { recipeId },
    );
  }
  if (statusOf(recipeId) === 'pending') {
    throw ClientError.conflict('This one is still being read.', { recipeId });
  }
  setStatus(recipeId, 'pending');
  void runExtraction(recipeId, deps);
}

/** @returns {RecipeStatus} Where the capture has got to. */
function statusOf(recipeId: number): RecipeStatus {
  return (
    db.query('SELECT status FROM recipe WHERE id = ?').get(recipeId) as {
      status: RecipeStatus;
    }
  ).status;
}

/** @throws {ClientError} 404 unless the recipe exists and is not deleted. */
function requireAlive(recipeId: number): { createdByUserId: string } {
  const row = db
    .query(
      'SELECT createdByUserId FROM recipe WHERE id = ? AND deletedAt IS NULL',
    )
    .get(recipeId) as { createdByUserId: string } | undefined;
  if (!row) {
    throw ClientError.notFound('No such recipe.', { recipeId });
  }
  return row;
}

/**
 * The recipe page's whole payload: the recipe, its current version, its
 * sources, everyone's ratings and the comments. Ratings come back per person
 * rather than averaged — the client scopes them, and a mean would erase a veto.
 *
 * @returns {object} The recipe, its current version (null while pending), its
 *   tags, sources, ratings and comments.
 * @throws {ClientError} 404 when it does not exist, or was deleted.
 */
export function get(recipeId: number) {
  const recipe = db
    .query(
      `SELECT id, status, createdByUserId, createdAt, updatedAt
       FROM recipe WHERE id = ? AND deletedAt IS NULL`,
    )
    .get(recipeId) as
    | {
        id: number;
        status: RecipeStatus;
        createdByUserId: string;
        createdAt: string;
        updatedAt: string;
      }
    | undefined;
  if (!recipe) {
    throw ClientError.notFound('No such recipe.', { recipeId });
  }

  const version = db
    .query(
      `SELECT * FROM recipeVersion WHERE recipeId = ?
       ORDER BY versionNo DESC LIMIT 1`,
    )
    .get(recipeId) as VersionRow | undefined;

  return {
    ...recipe,
    version: version ? hydrate(version) : null,
    tags: db
      .query('SELECT tag FROM recipeTag WHERE recipeId = ? ORDER BY tag')
      .all(recipeId)
      .map(row => (row as { tag: string }).tag),
    sources: db
      .query(
        `SELECT id, kind, url, createdAt FROM source
         WHERE recipeId = ? ORDER BY id`,
      )
      .all(recipeId) as {
      id: number;
      kind: 'photo' | 'html';
      url: string | null;
      createdAt: string;
    }[],
    ratings: db
      .query('SELECT userId, score FROM rating WHERE recipeId = ?')
      .all(recipeId) as { userId: string; score: number }[],
    comments: db
      .query(
        `SELECT c.id, c.userId, u.name AS userName, c.body, c.createdAt
         FROM comment c JOIN "user" u ON u.id = c.userId
         WHERE c.recipeId = ? AND c.deletedAt IS NULL
         ORDER BY c.createdAt`,
      )
      .all(recipeId) as {
      id: number;
      userId: string;
      userName: string;
      body: string;
      createdAt: string;
    }[],
  };
}

type ListRow = {
  id: number;
  status: RecipeStatus;
  createdAt: string;
  name: string | null;
  totalMinutes: number | null;
  timeEstimated: number | null;
  tags: string;
  ratings: string;
};

/**
 * The catalogue. Name-first, with the numbers the list needs to sort and
 * filter on and nothing else; `q` searches the FTS index, which covers the
 * name, the ingredients, the method and the tags' synonyms.
 *
 * Pending and failed captures are included deliberately — a photo you just
 * took is on this list before the model has answered.
 *
 * @returns {object[]} One row per live recipe, newest first.
 */
export function list(query?: string) {
  const match = query ? ftsQuery(query) : '';
  const rows = db
    .query(
      `${match ? 'WITH hit AS (SELECT rowid AS id, rank FROM recipeSearch WHERE recipeSearch MATCH ?)' : ''}
       SELECT r.id, r.status, r.createdAt, v.name, v.totalMinutes, v.timeEstimated,
              (SELECT json_group_array(tag) FROM recipeTag WHERE recipeId = r.id) AS tags,
              (SELECT json_group_array(json_object('userId', userId, 'score', score))
               FROM rating WHERE recipeId = r.id) AS ratings
       FROM recipe r
       LEFT JOIN recipeVersion v
         ON v.recipeId = r.id
        AND v.versionNo = (
          SELECT max(versionNo) FROM recipeVersion WHERE recipeId = r.id
        )
       ${match ? 'JOIN hit ON hit.id = r.id' : ''}
       WHERE r.deletedAt IS NULL
       -- bm25 where there is a query, newest-first where there is not: a
       -- search wants the best match, a catalogue wants what you just added.
       ORDER BY ${match ? 'hit.rank' : 'r.createdAt DESC'}`,
    )
    .all(...(match ? [match] : [])) as ListRow[];

  return rows.map(row => ({
    ...row,
    timeEstimated: asBoolean(row.timeEstimated),
    tags: JSON.parse(row.tags) as TagId[],
    ratings: JSON.parse(row.ratings) as { userId: string; score: number }[],
  }));
}

/**
 * Every version, newest first. There is no history UI yet; this is the data.
 *
 * @returns {object[]} The recipe's versions, current one first.
 */
export function versions(recipeId: number) {
  requireAlive(recipeId);
  return (
    db
      .query(
        `SELECT * FROM recipeVersion WHERE recipeId = ? ORDER BY versionNo DESC`,
      )
      .all(recipeId) as VersionRow[]
  ).map(hydrate);
}

/**
 * Deletes a recipe, softly — nothing here is ever hard-deleted, and the search
 * index drops it by trigger.
 *
 * @throws {ClientError} 403 unless you captured it. Anyone may edit; only the
 *   person who added a recipe may remove it.
 */
export function softDelete(recipeId: number, userId: string): void {
  const recipe = requireAlive(recipeId);
  if (recipe.createdByUserId !== userId) {
    throw ClientError.forbidden(
      'Only whoever added this recipe can delete it.',
      { recipeId },
    );
  }
  db.run('UPDATE recipe SET deletedAt = ?, updatedAt = ? WHERE id = ?', [
    now(),
    now(),
    recipeId,
  ]);
}

/** Upserts your own mark on the household's cross / tick / double tick scale. */
export function rate(recipeId: number, userId: string, score: number): void {
  requireAlive(recipeId);
  const at = now();
  db.run(
    `INSERT INTO rating (recipeId, userId, score, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (recipeId, userId)
     DO UPDATE SET score = excluded.score, updatedAt = excluded.updatedAt`,
    [recipeId, userId, score, at, at],
  );
}

/** @returns {number} The new comment's id. */
export function addComment(
  recipeId: number,
  userId: string,
  body: string,
): number {
  requireAlive(recipeId);
  const at = now();
  const row = db
    .query(
      `INSERT INTO comment (recipeId, userId, body, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?) RETURNING id`,
    )
    .get(recipeId, userId, body, at, at) as { id: number };
  return row.id;
}

/**
 * @throws {ClientError} 404 when it does not exist or is already gone, 403
 *   when it is someone else's. Comments are authored, so only the author may
 *   remove one.
 */
export function deleteComment(commentId: number, userId: string): void {
  const comment = db
    .query('SELECT userId FROM comment WHERE id = ? AND deletedAt IS NULL')
    .get(commentId) as { userId: string } | undefined;
  if (!comment) {
    throw ClientError.notFound('No such comment.', { commentId });
  }
  if (comment.userId !== userId) {
    throw ClientError.forbidden('That comment is not yours.', { commentId });
  }
  db.run('UPDATE comment SET deletedAt = ?, updatedAt = ? WHERE id = ?', [
    now(),
    now(),
    commentId,
  ]);
}

/**
 * A restart mid-extraction strands a row at `pending` forever, because the
 * promise that would have finished it died with the process. Run at boot:
 * anything stuck becomes `failed`, which is retryable from the source on disk.
 *
 * @returns {number} How many rows were unstuck.
 */
export function sweepStalePending(): number {
  const cutoff = new Date(Date.now() - STALE_PENDING_MS).toISOString();
  const stuck = db
    .query(
      // updatedAt, not createdAt: `retry` moves a long-dead recipe back to
      // pending, and it must then get its own ten minutes.
      `UPDATE recipe SET status = 'failed', updatedAt = ?
       WHERE status = 'pending' AND updatedAt < ? RETURNING id`,
    )
    .all(now(), cutoff) as { id: number }[];
  return stuck.length;
}

/**
 * @returns {Bun.BunFile} The photographed page, addressed by source id so no
 *   path ever appears in a URL.
 * @throws {ClientError} 404 when there is no such source, or its recipe is gone.
 */
export function photo(sourceId: number): Bun.BunFile {
  const source = db
    .query(
      `SELECT s.path FROM source s JOIN recipe r ON r.id = s.recipeId
       WHERE s.id = ? AND s.kind = 'photo' AND r.deletedAt IS NULL`,
    )
    .get(sourceId) as { path: string | null } | undefined;
  if (!source?.path) {
    throw ClientError.notFound('No such photo.', { sourceId });
  }
  return readSource(source.path);
}
