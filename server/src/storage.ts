import { mkdirSync, readdirSync, statSync, statfsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { HTTPException } from 'hono/http-exception';

import { config } from './config';
import { MIN_FREE_SOURCE_BYTES } from './resource-limits';

/**
 * The only module that knows where bytes live. A source's path is never
 * constructed anywhere else, so moving artifacts to object storage later is
 * this file rather than a grep.
 */
const SOURCE_DIR = join(config.dataDir, 'sources');

/** Includes orphaned/failed/soft-deleted sources, not just live database rows. */
export class SourceStorage {
  private readonly reservations = new Map<string, number>();

  constructor(
    private readonly options: {
      directory: string;
      maxBytes: number;
      minFreeBytes?: number;
    },
  ) {}

  async save(key: string, data: Blob): Promise<string> {
    key = basename(key);
    const {
      directory,
      maxBytes,
      minFreeBytes = MIN_FREE_SOURCE_BYTES,
    } = this.options;
    mkdirSync(directory, { recursive: true });
    // Synchronous scan + reservation prevents interleaving admission. Skip
    // in-flight files: their complete size is already reserved, even if only
    // part of the file has reached disk. Scan each time to include old orphans.
    let used = 0;
    for (const file of readdirSync(directory)) {
      if (!this.reservations.has(file)) {
        used += statSync(join(directory, file)).size;
      }
    }
    const reserved = [...this.reservations.values()].reduce(
      (sum, size) => sum + size,
      0,
    );
    const disk = statfsSync(directory);
    if (
      this.reservations.has(key) ||
      used + reserved + data.size > maxBytes ||
      disk.bavail * disk.bsize - reserved - data.size < minFreeBytes
    ) {
      throw new HTTPException(507, {
        message: 'Source storage is full. Contact the household administrator.',
      });
    }
    this.reservations.set(key, data.size);
    try {
      await Bun.write(join(directory, key), data);
      return key;
    } catch (cause) {
      await rm(join(directory, key), { force: true });
      throw cause;
    } finally {
      this.reservations.delete(key);
    }
  }
}

const sources = new SourceStorage({
  directory: SOURCE_DIR,
  maxBytes: config.maxStoredSourceBytes,
});

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
  return sources.save(key, data);
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
