import type { PhotoRotation } from '@scran/shared';
import { useEffect, useRef, useState } from 'react';

import { Feedback } from './ui';

type Preview =
  | { kind: 'loading' }
  | { kind: 'ready'; image: HTMLImageElement }
  | { kind: 'error'; message: string };

export function PhotoReview({
  photo,
  rotation,
}: {
  photo: Blob;
  rotation: PhotoRotation;
}) {
  const [preview, setPreview] = useState<Preview>({ kind: 'loading' });
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const url = URL.createObjectURL(photo);
    const image = new Image();
    image.onload = () => setPreview({ kind: 'ready', image });
    image.onerror = () =>
      setPreview({
        kind: 'error',
        message: 'This photo could not be displayed. Try another photo.',
      });
    // The supplied preview has already been EXIF-normalized by the server.
    image.src = url;
    return () => {
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
    <div
      className="rounded-ui bg-panel flex h-[36dvh] max-h-96 min-h-40 items-center justify-center overflow-hidden p-2"
      aria-busy={preview.kind === 'loading'}
    >
      {preview.kind === 'ready' ? (
        <canvas
          ref={canvas}
          role="img"
          aria-label="Recipe photo in the orientation used for extraction"
          className="max-h-full max-w-full object-contain"
        />
      ) : (
        <Feedback tone={preview.kind === 'error' ? 'error' : 'neutral'}>
          {preview.kind === 'loading' ? 'Loading your photo…' : preview.message}
        </Feedback>
      )}
    </div>
  );
}
