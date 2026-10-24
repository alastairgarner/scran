import { useRef, useState } from 'react';

import { ImageViewer } from './image-viewer';

export function RecipeSources({
  sources,
  failed = false,
}: {
  sources: { id: number; kind: 'photo' | 'html'; url: string | null }[];
  failed?: boolean;
}) {
  const [index, setIndex] = useState<number | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const photos = sources.filter(source => source.kind === 'photo');
  const images = photos.map((photo, photoIndex) => ({
    src: `/api/photos/${photo.id}`,
    alt: `Source photo ${photoIndex + 1}`,
  }));

  return (
    <div className={`flex flex-wrap gap-3 ${failed ? 'justify-center' : ''}`}>
      {sources.map(source => {
        if (source.kind !== 'photo') {
          return (
            <a
              key={source.id}
              href={source.url ?? '#'}
              className="text-accent underline"
            >
              {failed ? 'View original webpage' : 'Original webpage'}
            </a>
          );
        }
        const photoIndex = photos.findIndex(photo => photo.id === source.id);
        return (
          <button
            key={source.id}
            type="button"
            aria-label={`Open source photo ${photoIndex + 1}`}
            aria-haspopup="dialog"
            className="rounded-ui border-line cursor-zoom-in overflow-hidden border"
            onClick={event => {
              trigger.current = event.currentTarget;
              setIndex(photoIndex);
            }}
          >
            <img
              src={`/api/photos/${source.id}`}
              alt={`Source photo ${photoIndex + 1}`}
              className={
                failed ? 'h-40 w-40 object-contain' : 'h-28 w-24 object-contain'
              }
            />
          </button>
        );
      })}
      <ImageViewer
        images={images}
        index={index}
        onClose={() => {
          setIndex(null);
          // Safari does not focus buttons on tap, so restore explicitly too.
          trigger.current?.focus({ preventScroll: true });
        }}
      />
    </div>
  );
}
