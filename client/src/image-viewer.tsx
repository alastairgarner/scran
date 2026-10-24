import Lightbox, { type SlideImage } from 'yet-another-react-lightbox';
import Counter from 'yet-another-react-lightbox/plugins/counter';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';

import 'yet-another-react-lightbox/styles.css';
import 'yet-another-react-lightbox/plugins/counter.css';
import './image-viewer.css';

/** Gesture handling, focus trapping/restoration and scroll locking belong to the viewer. */
export function ImageViewer({
  images,
  index,
  onClose,
}: {
  images: SlideImage[];
  index: number | null;
  onClose: () => void;
}) {
  return (
    <Lightbox
      className="image-viewer"
      open={index !== null}
      index={index ?? 0}
      close={onClose}
      slides={images}
      plugins={images.length > 1 ? [Zoom, Counter] : [Zoom]}
      carousel={{ finite: true }}
      controller={{ closeOnBackdropClick: true }}
      labels={{ Lightbox: 'Source photos', 'Photo gallery': 'Source photos' }}
      counter={{ separator: 'of' }}
      render={{
        buttonPrev: images.length < 2 ? () => null : undefined,
        buttonNext: images.length < 2 ? () => null : undefined,
        iconError: () => (
          <p role="alert" className="type-control">
            Couldn’t load this photo. Close and try opening it again.
          </p>
        ),
      }}
    />
  );
}
