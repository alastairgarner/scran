import type { PhotoRotation } from '@scran/shared';
import sharp from 'sharp';

/** Normalize pixels for the model; never overwrite the permanent source. */
export async function preparePhoto(photo: Blob, rotation: PhotoRotation) {
  const pipeline = await orientedPhoto(photo, rotation);
  const bytes = await pipeline.png().toBuffer();

  return new Blob([bytes], { type: 'image/png' });
}

/** Preview the same oriented pixels, reduced for display and never persisted. */
export async function previewPhoto(photo: Blob) {
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
}

async function orientedPhoto(photo: Blob, rotation: PhotoRotation) {
  return sharp(Buffer.from(await photo.arrayBuffer()), {
    limitInputPixels: 50_000_000,
  })
    .autoOrient()
    .rotate(rotation);
}
