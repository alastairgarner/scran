import { describe, expect, it } from 'bun:test';
import { randomFillSync } from 'node:crypto';

import type { PhotoRotation } from '@scran/shared';
import sharp from 'sharp';

import { MAX_MODEL_PHOTO_BYTES } from '../resource-limits';
import { preparePhoto, previewPhoto } from './photo';

// Six distinct pixels, arranged as rows [1,2], [3,4], [5,6]. No text/OCR
// heuristic can mask a wrong rotation, mirror or double-applied EXIF tag here.
const pixels = Buffer.from(
  [1, 2, 3, 4, 5, 6].flatMap(n => [n * 30, n * 30, n * 30]),
);
const image = () =>
  sharp(pixels, { raw: { width: 2, height: 3, channels: 3 } });
const cases: { rotation: PhotoRotation; width: number; order: number[] }[] = [
  { rotation: 0, width: 2, order: [1, 2, 3, 4, 5, 6] },
  { rotation: 90, width: 3, order: [5, 3, 1, 6, 4, 2] },
  { rotation: 180, width: 2, order: [6, 5, 4, 3, 2, 1] },
  { rotation: 270, width: 3, order: [2, 4, 6, 1, 3, 5] },
];

async function decoded(photo: Blob) {
  const { data, info } = await sharp(Buffer.from(await photo.arrayBuffer()))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    width: info.width,
    order: [...data].filter((_, i) => i % info.channels === 0).map(n => n / 30),
  };
}

describe('photo orientation', () => {
  for (const { rotation, width, order } of cases) {
    it(`applies ${rotation}° clockwise without altering pixels`, async () => {
      const original = await image().png().toBuffer();
      const result = await preparePhoto(new Blob([original]), rotation);
      expect(result.type).toBe('image/png');
      expect(await decoded(result)).toEqual({ width, order });
    });
  }

  it('applies EXIF first and does not apply it again to the output', async () => {
    const original = await image()
      .withMetadata({ orientation: 6 })
      .png()
      .toBuffer();
    expect((await sharp(original).metadata()).orientation).toBe(6);
    const result = await preparePhoto(new Blob([original]), 270);
    expect(await decoded(result)).toEqual({
      width: 2,
      order: [1, 2, 3, 4, 5, 6],
    });
    const metadata = await sharp(
      Buffer.from(await result.arrayBuffer()),
    ).metadata();
    expect(metadata.orientation).toBeUndefined();
  });

  it('honours mirrored EXIF orientation', async () => {
    const original = await image()
      .withMetadata({ orientation: 2 })
      .png()
      .toBuffer();
    const result = await preparePhoto(new Blob([original]), 0);
    expect(await decoded(result)).toEqual({
      width: 2,
      order: [2, 1, 4, 3, 6, 5],
    });
  });

  it('uses the same EXIF-normalized pixels in previews and extraction', async () => {
    const original = new Blob([
      await image().withMetadata({ orientation: 6 }).png().toBuffer(),
    ]);
    expect(await decoded(await previewPhoto(original))).toEqual(
      await decoded(await preparePhoto(original, 0)),
    );
  });

  it('bounds previews and model images while retaining the original', async () => {
    const original = new Blob([
      await sharp({
        create: {
          width: 2400,
          height: 1600,
          channels: 3,
          background: '#ffffff',
        },
      })
        .png()
        .toBuffer(),
    ]);
    const preview = await sharp(
      Buffer.from(await (await previewPhoto(original)).arrayBuffer()),
    ).metadata();
    const extraction = await sharp(
      Buffer.from(await (await preparePhoto(original, 0)).arrayBuffer()),
    ).metadata();
    expect([preview.width, preview.height]).toEqual([1200, 800]);
    expect([extraction.width, extraction.height]).toEqual([2048, 1365]);
    const retained = await sharp(
      Buffer.from(await original.arrayBuffer()),
    ).metadata();
    expect([retained.width, retained.height]).toEqual([2400, 1600]);
  });

  it('refuses an undecodable image before it can reach the model', async () => {
    const error = await preparePhoto(new Blob(['not a photo']), 0).catch(
      cause => cause,
    );
    expect(error).toBeInstanceOf(Error);
  });

  it('caps the encoded size of noisy model images', async () => {
    const original = await sharp(
      randomFillSync(Buffer.alloc(2048 * 2048 * 3)),
      {
        raw: { width: 2048, height: 2048, channels: 3 },
      },
    )
      .png()
      .toBuffer();
    expect(original.byteLength).toBeGreaterThan(MAX_MODEL_PHOTO_BYTES);
    const prepared = await preparePhoto(new Blob([original]), 0);
    expect(prepared.type).toBe('image/jpeg');
    expect(prepared.size).toBeLessThanOrEqual(MAX_MODEL_PHOTO_BYTES);
  });

  it('strips EXIF, GPS and other metadata from served previews', async () => {
    const original = await image()
      .withMetadata({ orientation: 6 })
      .withExif({
        IFD0: { Artist: 'private photographer' },
        IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '51/1 30/1 0/1' },
      })
      .png()
      .toBuffer();
    expect((await sharp(original).metadata()).exif).toBeDefined();
    const preview = await previewPhoto(new Blob([original]));
    const metadata = await sharp(
      Buffer.from(await preview.arrayBuffer()),
    ).metadata();
    expect(metadata.exif).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
    expect(metadata.iptc).toBeUndefined();
    expect(metadata.orientation).toBeUndefined();
    expect((await sharp(original).metadata()).exif).toBeDefined();
  });
});
