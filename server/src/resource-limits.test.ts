import { Database } from 'bun:sqlite';
import { describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { migrate } from './db';
import {
  chargeDailyUsage,
  WorkLimiter,
  withPhotoPreparation,
} from './resource-limits';

describe('resource admission', () => {
  it('rejects immediately across users, and releases idempotently on completion', () => {
    const limiter = new WorkLimiter(2);
    const first = limiter.acquire();
    const second = limiter.acquire();
    expect(() => limiter.acquire()).toThrow('busy');
    first();
    first();
    const third = limiter.acquire();
    expect(() => limiter.acquire()).toThrow('busy');
    second();
    third();
    limiter.acquire()();
  });

  it('persists failed attempts and enforces atomic user/global caps across reopen and UTC days', () => {
    const directory = mkdtempSync(join(tmpdir(), 'scran-usage-'));
    const path = join(directory, 'usage.db');
    const limits = { kind: 'extraction', user: 2, global: 3 };
    let database = new Database(path);
    try {
      migrate(database);
      chargeDailyUsage(database, 'alice', limits, '2026-10-23');
      chargeDailyUsage(database, 'alice', limits, '2026-10-23');
      expect(() =>
        chargeDailyUsage(database, 'alice', limits, '2026-10-23'),
      ).toThrow('daily limit');
      database.close();
      database = new Database(path);
      expect(() =>
        chargeDailyUsage(database, 'alice', limits, '2026-10-23'),
      ).toThrow('daily limit');
      chargeDailyUsage(database, 'bob', limits, '2026-10-23');
      expect(() =>
        chargeDailyUsage(database, 'carol', limits, '2026-10-23'),
      ).toThrow('daily limit');
      expect(
        database
          .query('SELECT count FROM resourceUsage WHERE day = ? AND scope = ?')
          .get('2026-10-23', 'global'),
      ).toEqual({ count: 3 });
      expect(
        database
          .query('SELECT count FROM resourceUsage WHERE scope = ?')
          .get('user:carol'),
      ).toBeNull();
      chargeDailyUsage(database, 'alice', limits, '2026-10-24');
      chargeDailyUsage(
        database,
        'alice',
        { ...limits, kind: 'edit' },
        '2026-10-23',
      );
    } finally {
      database.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('serializes image work with bounded waiting and releases after failure', async () => {
    let started = 0;
    let unblock: (() => void) | undefined;
    const barrier = new Promise<void>(resolve => {
      unblock = resolve;
    });
    const first = withPhotoPreparation(async () => {
      started++;
      await barrier;
      throw new Error('decode failed');
    }).catch(error => error);
    const second = withPhotoPreparation(async () => {
      started++;
      return 'second';
    });
    const third = withPhotoPreparation(async () => {
      started++;
      return 'third';
    });
    expect(started).toBe(1);
    expect(withPhotoPreparation(async () => 'overflow')).rejects.toThrow(
      'busy',
    );
    unblock?.();
    expect(await first).toBeInstanceOf(Error);
    expect(await second).toBe('second');
    expect(await third).toBe('third');
    expect(started).toBe(3);
    expect(await withPhotoPreparation(async () => 'released')).toBe('released');
  });
});
