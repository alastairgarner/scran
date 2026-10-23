import type { PhotoRotation } from '@scran/shared';
import sharp from 'sharp';

import {
  MAX_MODEL_PHOTO_BYTES,
  MODEL_IMAGE_EDGE,
  withPhotoPreparation,
} from '../resource-limits';

/** Normalize pixels for the model; never overwrite the permanent source. */
export async function preparePhoto(photo: Blob, rotation: PhotoRotation) {
  return withPhotoPreparation(async () => {
    const pipeline = await orientedPhoto(photo, rotation);
    const bytes = await pipeline
      .resize({
        width: MODEL_IMAGE_EDGE,
        height: MODEL_IMAGE_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();
    if (bytes.byteLength <= MAX_MODEL_PHOTO_BYTES) {
      return new Blob([bytes], { type: 'image/png' });
    }
    // Noisy/scanned PNGs otherwise retain tens of MiB across a ten-page
    // batch, plus base64 and JSON copies. Keep lossless output for small text
    // pages and cap every model image's encoded size as well as its pixels.
    let compressed = await sharp(bytes).jpeg({ quality: 80 }).toBuffer();
    if (compressed.byteLength > MAX_MODEL_PHOTO_BYTES) {
      compressed = await sharp(bytes)
        .resize({ width: 1024, height: 1024, fit: 'inside' })
        .jpeg({ quality: 75 })
        .toBuffer();
    }
    if (compressed.byteLength > MAX_MODEL_PHOTO_BYTES) {
      throw new Error('The model image is too large.');
    }
    return new Blob([compressed], { type: 'image/jpeg' });
  });
}

/** Preview the same oriented pixels, reduced for display and never persisted. */
export async function previewPhoto(photo: Blob) {
  return withPhotoPreparation(async () => {
    const pipeline = await orientedPhoto(photo, 0);
    const bytes = await pipeline
      .resize({
        width: 1200,
        height: 1200,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();
    return new Blob([bytes], { type: 'image/png' });
  });
}

async function orientedPhoto(photo: Blob, rotation: PhotoRotation) {
  return sharp(Buffer.from(await photo.arrayBuffer()), {
    limitInputPixels: 50_000_000,
  })
    .autoOrient()
    .rotate(rotation);
}
