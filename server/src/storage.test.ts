import { describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, statfsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readSource, saveSource, SourceStorage } from './storage';

describe('storage', () => {
  it('includes pre-existing orphan files and concurrent reservations in the byte cap', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'scran-source-limit-'));
    try {
      writeFileSync(join(directory, 'orphan.bin'), '12345');
      const storage = new SourceStorage({
        directory,
        maxBytes: 15,
        minFreeBytes: 0,
      });
      const first = storage.save('first.bin', new Blob(['1234567890']));
      const second = storage.save('second.bin', new Blob(['x']));
      expect(second).rejects.toThrow('storage is full');
      expect(await first).toBe('first.bin');
      const reopened = new SourceStorage({
        directory,
        maxBytes: 15,
        minFreeBytes: 0,
      });
      expect(
        reopened.save('after-restart.bin', new Blob(['x'])),
      ).rejects.toThrow('storage is full');
      expect(await Bun.file(join(directory, 'orphan.bin')).text()).toBe(
        '12345',
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('refuses admission before consuming the free-space reserve', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'scran-source-disk-'));
    try {
      const disk = statfsSync(directory);
      const storage = new SourceStorage({
        directory,
        maxBytes: 100,
        minFreeBytes: disk.blocks * disk.bsize + 1,
      });
      expect(storage.save('photo.png', new Blob(['x']))).rejects.toThrow(
        'storage is full',
      );
      expect(await Bun.file(join(directory, 'photo.png')).exists()).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('releases a failed write reservation', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'scran-source-failure-'));
    try {
      // A filename beyond the filesystem name limit fails the real write.
      const storage = new SourceStorage({
        directory,
        maxBytes: 1,
        minFreeBytes: 0,
      });
      expect(storage.save('x'.repeat(300), new Blob(['x']))).rejects.toThrow();
      expect(await storage.save('valid.bin', new Blob(['x']))).toBe(
        'valid.bin',
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('round-trips an artifact, keeping a content type on the way back', async () => {
    // Arrange
    const photo = new Blob(['not really a jpeg'], { type: 'image/jpeg' });

    // Act
    const key = await saveSource(41, photo);

    // Assert
    expect(key).toBe('41.jpg');
    expect(await readSource(key).text()).toBe('not really a jpeg');
    expect(readSource(key).type).toStartWith('image/jpeg');
  });

  it('stores an unrecognised type rather than refusing it', async () => {
    // Arrange & act: the photo is irreplaceable, so it is written whatever
    // a phone claims it is.
    const key = await saveSource(42, new Blob(['?'], { type: 'image/avif' }));

    // Assert
    expect(key).toBe('42.bin');
  });

  it('cannot be walked out of DATA_DIR by a key from the database', () => {
    // Arrange & act
    const file = readSource('../../../etc/passwd');

    // Assert
    expect(file.name).toEndWith('/sources/passwd');
  });
});
