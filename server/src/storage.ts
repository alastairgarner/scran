import { rm } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { config } from './config';

/**
 * The only module that knows where bytes live. A source's path is never
 * constructed anywhere else, so moving artifacts to object storage later is
 * this file rather than a grep.
 */
const SOURCE_DIR = join(config.dataDir, 'sources');

// Enough to keep `Bun.file()` returning a usable content type. Anything else
// is stored as-is and served as a download.
const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/webp': 'webp',
  'text/html': 'html',
};

/**
 * Writes a source artifact — a photographed page, or fetched HTML.
 *
 * @returns {Promise<string>} The key to store on `source.path`. Opaque
 *   everywhere else; only `readSource` may turn it back into a path.
 */
export async function saveSource(
  sourceId: number,
  data: Blob,
): Promise<string> {
  const key = `${sourceId}.${EXTENSION_BY_MIME_TYPE[data.type] ?? 'bin'}`;
  try {
    await Bun.write(join(SOURCE_DIR, key), data);
    return key;
  } catch (cause) {
    await removeSource(key);
    throw cause;
  }
}

/** Removes a source after an unsuccessful capture; never used for saved recipes. */
export async function removeSource(key: string): Promise<void> {
  await rm(join(SOURCE_DIR, basename(key)), { force: true });
}

/**
 * @returns {Bun.BunFile} The artifact, streamable straight into a response.
 *   `basename` keeps a key that somehow contains a path from escaping
 *   `DATA_DIR` — traversal stops being a class of bug that exists here.
 */
export function readSource(key: string): Bun.BunFile {
  return Bun.file(join(SOURCE_DIR, basename(key)));
}
