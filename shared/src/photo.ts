import { z } from 'zod';

/** Clockwise rotation after applying the camera's EXIF orientation. */
export const photoRotationSchema = z.union([
  z.literal(0),
  z.literal(90),
  z.literal(180),
  z.literal(270),
]);

export type PhotoRotation = z.infer<typeof photoRotationSchema>;
