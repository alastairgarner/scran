import { describe, expect, it } from 'bun:test';

import { readSource, saveSource } from './storage';

describe('storage', () => {
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
