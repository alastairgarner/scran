import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';

import { capturePhoto, captureUrl } from '../api/recipes';
import { PhotoReview } from '../photo-review';
import {
  Button,
  ButtonLink,
  Feedback,
  Field,
  PageHeader,
  Section,
} from '../ui';

type UrlForm = { url: string };

export function Capture() {
  const navigate = useNavigate();
  const form = useForm<UrlForm>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);

  const run = async (capture: Promise<{ id: number }>) => {
    setBusy(true);
    setError('');
    try {
      const recipe = await capture;
      void navigate(`/recipes/${recipe.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Capture failed.');
    } finally {
      setBusy(false);
    }
  };

  const submitUrl = form.handleSubmit(values => run(captureUrl(values.url)));

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4 pb-8">
      <PageHeader
        title="Add a recipe"
        back={
          <ButtonLink to="/" variant="quiet" size="compact">
            ← All recipes
          </ButtonLink>
        }
        description="Save a cookbook page or a recipe from the web."
      />
      <input
        ref={photoInput}
        type="file"
        aria-label="Photograph the page"
        accept="image/*"
        capture="environment"
        hidden
        disabled={busy}
        onChange={event => {
          const selected = event.target.files?.[0];
          if (selected) {
            setPhoto(selected);
            setError('');
          }
          event.target.value = '';
        }}
      />
      {photo ? (
        <PhotoReview
          photo={photo}
          busy={busy}
          onExtract={rotation => void run(capturePhoto(photo, rotation))}
          onRetake={() => {
            setPhoto(null);
            setError('');
            photoInput.current?.click();
          }}
        />
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => photoInput.current?.click()}
          className="rounded-ui border-line bg-panel hover:border-selection-line flex min-h-48 w-full cursor-pointer flex-col items-center justify-center gap-3 border border-dashed p-6 disabled:opacity-50"
        >
          <svg
            aria-hidden="true"
            className="text-ink-muted h-8 w-8"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M8 6l2-3h4l2 3h4v14H4V6z" />
            <circle cx="12" cy="12" r="4" />
          </svg>
          <span className="type-heading font-semibold">
            {busy ? 'Saving…' : 'Photograph the page'}
          </span>
        </button>
      )}
      {!photo && (
        <>
          <div className="type-label text-ink-muted flex items-center gap-3">
            <span className="bg-line h-px flex-1" /> or{' '}
            <span className="bg-line h-px flex-1" />
          </div>
          <Section title="From the web">
            <form
              className="space-y-4"
              onSubmit={event => void submitUrl(event)}
            >
              <Field
                label="Recipe URL"
                type="url"
                placeholder="https://…"
                disabled={busy}
                error={form.formState.errors.url?.message}
                {...form.register('url', { required: 'Paste a recipe URL.' })}
              />
              <Button type="submit" className="w-full" loading={busy}>
                Import webpage
              </Button>
            </form>
          </Section>
        </>
      )}
      {error && <Feedback tone="error">{error}</Feedback>}
    </main>
  );
}
