import { z } from 'zod';

/** Capture limits, shared by upload UI and server validation. */
export const MAX_CAPTURE_PHOTOS = 10;
export const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
export const MAX_CAPTURE_BYTES = 50 * 1024 * 1024;

/** Clockwise rotation after applying the camera's EXIF orientation. */
export const photoRotationSchema = z.union([
  z.literal(0),
  z.literal(90),
  z.literal(180),
  z.literal(270),
]);

export type PhotoRotation = z.infer<typeof photoRotationSchema>;
