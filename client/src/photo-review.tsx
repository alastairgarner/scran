import type { PhotoRotation } from '@scran/shared';
import { useEffect, useRef, useState } from 'react';

import { previewPhoto } from './api/recipes';
import { Button } from './ui';

type Preview =
  | { kind: 'loading' }
  | { kind: 'ready'; image: HTMLImageElement }
  | { kind: 'error'; message: string };

const nextRotation: Record<PhotoRotation, PhotoRotation> = {
  0: 90,
  90: 180,
  180: 270,
  270: 0,
};

export function PhotoReview({
  photo,
  busy,
  onExtract,
  onRetake,
}: {
  photo: File;
  busy: boolean;
  onExtract: (rotation: PhotoRotation) => void;
  onRetake: () => void;
}) {
  const [rotation, setRotation] = useState<PhotoRotation>(0);
  const [preview, setPreview] = useState<Preview>({ kind: 'loading' });
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    let url: string | undefined;
    const image = new Image();
    image.onload = () => setPreview({ kind: 'ready', image });
    image.onerror = () =>
      setPreview({
        kind: 'error',
        message: 'This photo could not be displayed. Try another photo.',
      });
    // The server normalizes EXIF before previewing: browsers disagree about
    // some orientation tags, so the model and preview must use the same pixels.
    void previewPhoto(photo, controller.signal)
      .then(blob => {
        if (!controller.signal.aborted) {
          url = URL.createObjectURL(blob);
          image.src = url;
        }
      })
      .catch(cause => {
        if (!controller.signal.aborted) {
          setPreview({
            kind: 'error',
            message:
              cause instanceof Error
                ? cause.message
                : 'Could not load the photo.',
          });
        }
      });
    return () => {
      controller.abort();
      image.onload = null;
      image.onerror = null;
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [photo]);

  useEffect(() => {
    const element = canvas.current;
    if (!element || preview.kind !== 'ready') {
      return;
    }
    const { image } = preview;
    const scale = Math.min(
      1,
      1200 / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const width = Math.round(image.naturalWidth * scale);
    const height = Math.round(image.naturalHeight * scale);
    const sideways = rotation === 90 || rotation === 270;
    element.width = sideways ? height : width;
    element.height = sideways ? width : height;
    const context = element.getContext('2d');
    if (!context) {
      setPreview({
        kind: 'error',
        message: 'This photo could not be displayed. Try another photo.',
      });
      return;
    }
    context.translate(element.width / 2, element.height / 2);
    context.rotate((rotation * Math.PI) / 180);
    context.drawImage(image, -width / 2, -height / 2, width, height);
  }, [preview, rotation]);

  return (
    <section className="space-y-4" aria-labelledby="photo-review-title">
      <div className="space-y-2">
        <h2 id="photo-review-title" className="type-title font-bold">
          Check your photo
        </h2>
        <p id="photo-orientation-help" className="type-body">
          Make sure the text is upright. Sideways pages can lead to missing
          ingredients or incorrect quantities.
        </p>
      </div>
      <div className="rounded-ui border-line bg-panel flex min-h-48 items-center justify-center overflow-hidden border p-2">
        {preview.kind === 'ready' ? (
          <canvas
            ref={canvas}
            role="img"
            aria-label="Recipe photo in the orientation used for extraction"
            aria-describedby="photo-orientation-help"
            className="max-h-[55dvh] w-full object-contain"
          />
        ) : (
          <p className="type-label text-ink-muted p-4" role="status">
            {preview.kind === 'loading'
              ? 'Loading your photo…'
              : preview.message}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          className="flex-1"
          disabled={busy || preview.kind !== 'ready'}
          onClick={() => setRotation(nextRotation[rotation])}
        >
          ↻ Rotate 90°
        </Button>
        <Button
          type="button"
          className="flex-1"
          disabled={busy}
          onClick={onRetake}
        >
          Retake photo
        </Button>
      </div>
      <p className="sr-only" role="status">
        {rotation === 0
          ? 'Original orientation'
          : `Rotated ${rotation} degrees clockwise`}
      </p>
      <Button
        type="button"
        className="w-full"
        disabled={busy || preview.kind !== 'ready'}
        onClick={() => onExtract(rotation)}
      >
        {busy ? 'Saving…' : 'Extract recipe'}
      </Button>
    </section>
  );
}
