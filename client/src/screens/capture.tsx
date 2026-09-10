import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';

import { capturePhoto, captureUrl } from '../api/recipes';
import { Button, Field } from '../ui';

type UrlForm = { url: string };

export function Capture() {
  const navigate = useNavigate();
  const form = useForm<UrlForm>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-4 p-4">
      <h1 className="type-title font-bold">Add a recipe</h1>
      <label className="rounded-ui border-line bg-panel flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-3 border-4 border-dashed">
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          disabled={busy}
          onChange={event => {
            const photo = event.target.files?.[0];
            if (photo) {
              void run(capturePhoto(photo));
            }
          }}
        />
        <span aria-hidden="true" className="type-title">
          📷
        </span>
        <span className="type-body font-semibold">
          {busy ? 'Saving…' : 'Photograph the page'}
        </span>
      </label>
      <div className="type-label text-ink-muted flex items-center gap-3">
        <span className="bg-line h-px flex-1" /> or{' '}
        <span className="bg-line h-px flex-1" />
      </div>
      <form className="space-y-3" onSubmit={event => void submitUrl(event)}>
        <Field
          label="Recipe URL"
          type="url"
          placeholder="https://…"
          error={form.formState.errors.url?.message}
          {...form.register('url', { required: 'Paste a recipe URL.' })}
        />
        <Button className="w-full" disabled={busy}>
          Import webpage
        </Button>
      </form>
      {error && <p className="type-label text-danger text-center">{error}</p>}
      <Link to="/" className="text-ink-muted min-h-11 py-3 text-center">
        ← All recipes
      </Link>
    </main>
  );
}
