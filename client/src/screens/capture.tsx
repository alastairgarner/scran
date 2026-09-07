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
      navigate(`/recipes/${recipe.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Capture failed.');
    } finally {
      setBusy(false);
    }
  };

  const submitUrl = form.handleSubmit(values => run(captureUrl(values.url)));

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-4 p-4">
      <h1 className="font-bold font-display text-3xl tracking-display">
        Add a recipe
      </h1>
      <label className="flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-3 rounded-ui border-4 border-line border-dashed bg-raised">
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
        <span aria-hidden="true" className="text-5xl">
          📷
        </span>
        <span className="font-display font-semibold text-xl tracking-display">
          {busy ? 'Saving…' : 'Photograph the page'}
        </span>
      </label>
      <div className="flex items-center gap-3 text-ink-muted text-sm">
        <span className="h-px flex-1 bg-line" /> or{' '}
        <span className="h-px flex-1 bg-line" />
      </div>
      <form className="space-y-3" onSubmit={submitUrl}>
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
      {error && <p className="text-center text-sm text-veto">{error}</p>}
      <Link to="/" className="min-h-11 py-3 text-center text-ink-muted">
        ← All recipes
      </Link>
    </main>
  );
}
