import {
  MAX_CAPTURE_BYTES,
  MAX_CAPTURE_PHOTOS,
  MAX_PHOTO_BYTES,
  type PhotoRotation,
} from '@scran/shared';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';

import { capturePhotos, captureUrl, previewPhoto } from '../api/recipes';
import { CaptureIcon } from '../capture-icons';
import { CapturePhotoStrip, type CapturePhoto } from '../capture-photo-strip';
import { PhotoReview } from '../photo-review';
import {
  Button,
  ButtonLink,
  Feedback,
  Field,
  PageHeader,
  Section,
  Dialog,
} from '../ui';

type UrlForm = { url: string };
const nextRotation: Record<PhotoRotation, PhotoRotation> = {
  0: 90,
  90: 180,
  180: 270,
  270: 0,
};

export function Capture() {
  const navigate = useNavigate();
  const form = useForm<UrlForm>();
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [photos, setPhotos] = useState<CapturePhoto[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [chooser, setChooser] = useState<
    { kind: 'add' } | { kind: 'replace'; id: string } | null
  >(null);
  const [ordering, setOrdering] = useState(false);
  const [position, setPosition] = useState(1);
  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);
  const replacement = useRef<string | null>(null);
  const validation = useRef<AbortController | null>(null);
  const busy = saving || checking;
  const selected = photos.find(photo => photo.id === selectedId) ?? photos[0];
  const selectedIndex = photos.findIndex(photo => photo.id === selected?.id);

  useEffect(() => () => validation.current?.abort(), []);

  const run = async (capture: Promise<{ id: number }>) => {
    setSaving(true);
    setError('');
    try {
      const recipe = await capture;
      void navigate(`/recipes/${recipe.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Capture failed.');
    } finally {
      setSaving(false);
    }
  };

  const choose = (
    input: HTMLInputElement | null,
    replace: string | null = null,
  ) => {
    replacement.current = replace;
    if (input === libraryInput.current && input) {
      input.multiple = !replace;
    }
    setChooser(null);
    input?.click();
  };

  const addFiles = async (files: File[]) => {
    if (!files.length) {
      return;
    }
    const replacingId = replacement.current;
    replacement.current = null;
    const incoming = replacingId ? files.slice(0, 1) : files;
    const retained = photos.filter(photo => photo.id !== replacingId);
    setError('');
    if (retained.length + incoming.length > MAX_CAPTURE_PHOTOS) {
      setError(
        `Choose up to ${MAX_CAPTURE_PHOTOS} photos for one recipe. Your current photos are unchanged.`,
      );
      return;
    }
    for (const file of incoming) {
      if (
        !file.type.startsWith('image/') ||
        file.size === 0 ||
        file.size > MAX_PHOTO_BYTES
      ) {
        setError(
          `“${file.name}” must be an image under 20 MB. Your current photos are unchanged.`,
        );
        return;
      }
    }
    if (
      retained.reduce((sum, photo) => sum + photo.file.size, 0) +
        incoming.reduce((sum, file) => sum + file.size, 0) >
      MAX_CAPTURE_BYTES
    ) {
      setError(
        'Choose photos totalling no more than 50 MB. Your current photos are unchanged.',
      );
      return;
    }
    const controller = new AbortController();
    validation.current = controller;
    setChecking(true);
    try {
      const additions: CapturePhoto[] = [];
      // Validate each image before changing the set, including replacements.
      for (const file of incoming) {
        try {
          const preview = await previewPhoto(file, controller.signal);
          additions.push({
            id: crypto.randomUUID(),
            file,
            preview,
            rotation: 0,
          });
        } catch (cause) {
          throw new Error(
            `“${file.name}”: ${cause instanceof Error ? cause.message : 'Could not read this photo.'} Your current photos are unchanged.`,
          );
        }
      }
      if (controller.signal.aborted) {
        return;
      }
      setPhotos(
        replacingId
          ? photos.flatMap(photo =>
              photo.id === replacingId ? additions : [photo],
            )
          : [...photos, ...additions],
      );
      setSelectedId(additions[0]?.id ?? '');
      setAnnouncement(
        replacingId
          ? 'Photo replaced.'
          : `${additions.length} photo${additions.length === 1 ? '' : 's'} added.`,
      );
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(
          cause instanceof Error ? cause.message : 'Could not read the photos.',
        );
      }
    } finally {
      if (!controller.signal.aborted) {
        setChecking(false);
      }
    }
  };

  const reorderTo = (target: number) => {
    if (!selected) {
      return;
    }
    const reordered = photos.filter(photo => photo.id !== selected.id);
    reordered.splice(target, 0, selected);
    setPhotos(reordered);
    setAnnouncement(
      `Photo moved to position ${target + 1} of ${photos.length}.`,
    );
  };

  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 pb-4">
      <PageHeader
        title="Add a recipe"
        back={
          <ButtonLink to="/" variant="quiet" size="compact">
            ← All recipes
          </ButtonLink>
        }
        description={
          photos.length
            ? undefined
            : 'Save a cookbook page or a recipe from the web.'
        }
      />
      <input
        ref={cameraInput}
        type="file"
        aria-label="Take a recipe photo"
        accept="image/*"
        capture="environment"
        hidden
        disabled={busy}
        onChange={event => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          void addFiles(files);
        }}
      />
      <input
        ref={libraryInput}
        type="file"
        aria-label="Choose recipe photos"
        accept="image/*"
        multiple
        hidden
        disabled={busy}
        onChange={event => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          void addFiles(files);
        }}
      />
      {selected ? (
        <section aria-label="Review recipe photos" className="space-y-2">
          <PhotoReview
            key={selected.id}
            photo={selected.preview}
            rotation={selected.rotation}
          />
          <div className="flex items-center justify-between gap-2">
            <p className="type-label text-ink-muted">
              Photo {selectedIndex + 1} of {photos.length}
            </p>
            <div role="group" aria-label="Photo tools" className="flex">
              <Button
                variant="quiet"
                size="compact"
                aria-label="Rotate photo 90°"
                title="Rotate photo 90°"
                disabled={busy}
                onClick={() => {
                  const rotation = nextRotation[selected.rotation];
                  setPhotos(current =>
                    current.map(photo =>
                      photo.id === selected.id ? { ...photo, rotation } : photo,
                    ),
                  );
                  setAnnouncement(
                    `Photo rotated ${rotation} degrees clockwise.`,
                  );
                }}
              >
                <CaptureIcon name="rotate" />
              </Button>
              <Button
                variant="quiet"
                size="compact"
                aria-label="Replace photo"
                title="Replace photo"
                disabled={busy}
                onClick={() => setChooser({ kind: 'replace', id: selected.id })}
              >
                <CaptureIcon name="replace" />
              </Button>
              <Button
                variant="quiet"
                size="compact"
                aria-label="Delete photo"
                title="Delete photo"
                disabled={busy}
                onClick={() => {
                  setPhotos(photos.filter(photo => photo.id !== selected.id));
                  setSelectedId(
                    photos[selectedIndex + 1]?.id ??
                      photos[selectedIndex - 1]?.id ??
                      '',
                  );
                  setAnnouncement('Photo removed.');
                }}
              >
                <CaptureIcon name="delete" />
              </Button>
              {photos.length > 1 && (
                <Button
                  variant="quiet"
                  size="compact"
                  aria-label="Change photo order"
                  title="Change photo order"
                  disabled={busy}
                  onClick={() => {
                    setPosition(selectedIndex + 1);
                    setOrdering(true);
                  }}
                >
                  <CaptureIcon name="order" />
                </Button>
              )}
            </div>
          </div>
          <CapturePhotoStrip
            photos={photos}
            selectedId={selected.id}
            busy={busy}
            onSelect={setSelectedId}
            onReorder={setPhotos}
            onAdd={() => setChooser({ kind: 'add' })}
          />
          <p className="type-label text-ink-muted">
            Keep text upright and pages in reading order. Hold a thumbnail, then
            drag to reorder.
          </p>
        </section>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => choose(cameraInput.current)}
            >
              <CaptureIcon name="camera" />
              Take a photo
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => choose(libraryInput.current)}
            >
              <CaptureIcon name="library" />
              Choose photos
            </Button>
          </div>
          <div className="type-label text-ink-muted flex items-center gap-3 py-3">
            <span className="bg-line h-px flex-1" />
            or
            <span className="bg-line h-px flex-1" />
          </div>
          <Section title="From the web">
            <form
              className="space-y-4"
              onSubmit={event =>
                void form.handleSubmit(values => run(captureUrl(values.url)))(
                  event,
                )
              }
            >
              <Field
                label="Recipe URL"
                type="url"
                placeholder="https://…"
                disabled={busy}
                error={form.formState.errors.url?.message}
                {...form.register('url', { required: 'Paste a recipe URL.' })}
              />
              <Button
                type="submit"
                variant="secondary"
                className="w-full"
                loading={saving}
                disabled={checking}
              >
                {saving ? 'Importing…' : 'Import webpage'}
              </Button>
            </form>
          </Section>
        </>
      )}
      {checking && (
        <Feedback>
          Checking photos… Your current photos are kept until these are ready.
        </Feedback>
      )}
      {error && (
        <Feedback tone="error">
          <span className="wrap-anywhere">{error}</span>
        </Feedback>
      )}
      <p role="status" className="sr-only">
        {announcement}
      </p>
      {photos.length > 0 && (
        <footer className="bottom-safe border-line bg-background sticky bottom-0 z-20 flex items-center gap-4 border-t pt-3">
          <p className="type-label text-ink-muted shrink-0">
            {photos.length} {photos.length === 1 ? 'photo' : 'photos'}
          </p>
          <Button
            disabled={checking}
            loading={saving}
            className="min-w-0 flex-1"
            onClick={() => void run(capturePhotos(photos))}
          >
            {saving ? 'Extracting…' : 'Extract recipe'}
          </Button>
        </footer>
      )}
      <Dialog
        open={chooser !== null}
        title={chooser?.kind === 'replace' ? 'Replace photo' : 'Add photos'}
        onClose={() => setChooser(null)}
      >
        <div className="grid gap-3">
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              choose(
                cameraInput.current,
                chooser?.kind === 'replace' ? chooser.id : null,
              )
            }
          >
            <CaptureIcon name="camera" />
            Take a photo
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              choose(
                libraryInput.current,
                chooser?.kind === 'replace' ? chooser.id : null,
              )
            }
          >
            <CaptureIcon name="library" />
            {chooser?.kind === 'replace'
              ? 'Choose replacement'
              : 'Choose photos'}
          </Button>
        </div>
      </Dialog>
      <Dialog
        open={ordering}
        title="Change photo order"
        onClose={() => setOrdering(false)}
        footer={
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              reorderTo(position - 1);
              setOrdering(false);
            }}
          >
            Move photo
          </Button>
        }
      >
        <label
          htmlFor="photo-position"
          className="type-label block font-semibold"
        >
          Position for photo {selectedIndex + 1}
        </label>
        <select
          id="photo-position"
          value={position}
          onChange={event => setPosition(Number(event.target.value))}
          className="type-control rounded-ui border-line bg-background min-h-12 w-full border px-3"
        >
          {photos.map((photo, index) => (
            <option key={photo.id} value={index + 1}>
              {index + 1} of {photos.length}
            </option>
          ))}
        </select>
      </Dialog>
    </main>
  );
}
