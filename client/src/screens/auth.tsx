import { zodResolver } from '@hookform/resolvers/zod';
import { type SignUp, signUpSchema } from '@scran/shared';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useNavigate, useParams } from 'react-router';
import { errorMessage } from '../api/client';
import { authClient } from '../auth';
import { Button, Card, Field } from '../ui';

type SignInValues = { email: string; password: string };

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const session = authClient.useSession();

  if (session.isPending) {
    return <PageMessage>Opening the kitchen…</PageMessage>;
  }
  if (!session.data) {
    return <Navigate to="/signin" replace />;
  }
  return children;
}

export function SignIn() {
  const navigate = useNavigate();
  const session = authClient.useSession();
  const [error, setError] = useState('');
  const form = useForm<SignInValues>();

  if (session.data) {
    return <Navigate to="/" replace />;
  }

  const submit = form.handleSubmit(async values => {
    setError('');
    const result = await authClient.signIn.email(values);
    if (result.error) {
      setError(result.error.message ?? 'Could not sign in.');
      return;
    }
    await session.refetch();
    navigate('/');
  });

  return (
    <AuthShell title="Welcome back">
      <form className="space-y-4" onSubmit={submit}>
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          error={form.formState.errors.email?.message}
          {...form.register('email', { required: 'Enter your email.' })}
        />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          error={form.formState.errors.password?.message}
          {...form.register('password', { required: 'Enter your password.' })}
        />
        {error && <p className="text-sm text-veto">{error}</p>}
        <Button className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthShell>
  );
}

export function Invite() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const session = authClient.useSession();
  const [loading, setLoading] = useState(true);
  const [dead, setDead] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const form = useForm<SignUp>({ resolver: zodResolver(signUpSchema) });

  useEffect(() => {
    fetch(`/api/invites/${encodeURIComponent(token)}`)
      .then(async response => {
        if (response.status === 404) {
          setDead(true);
          return;
        }
        if (!response.ok) {
          throw new Error(await errorMessage(response));
        }
        const body: unknown = await response.json();
        if (
          typeof body === 'object' &&
          body !== null &&
          'email' in body &&
          typeof body.email === 'string'
        ) {
          form.setValue('email', body.email);
        }
      })
      .catch(cause =>
        setLoadError(
          cause instanceof Error
            ? cause.message
            : 'Could not check this invite.',
        ),
      )
      .finally(() => setLoading(false));
  }, [form, token]);

  const submit = form.handleSubmit(async values => {
    setError('');
    try {
      const response = await fetch(
        `/api/invites/${encodeURIComponent(token)}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(values),
        },
      );
      if (!response.ok) {
        setError(await errorMessage(response));
        return;
      }
      await session.refetch();
      navigate('/');
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not join scran.',
      );
    }
  });

  if (loading) {
    return <PageMessage>Checking your invite…</PageMessage>;
  }
  if (dead) {
    return (
      <PageMessage>
        This invite has been used or expired. Ask whoever sent it for a new one.
      </PageMessage>
    );
  }
  if (loadError) {
    return <PageMessage>{loadError} Refresh to try again.</PageMessage>;
  }

  return (
    <AuthShell title="Join scran">
      <form className="space-y-4" onSubmit={submit}>
        <Field
          label="Name"
          autoComplete="name"
          error={form.formState.errors.name?.message}
          {...form.register('name')}
        />
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          error={form.formState.errors.email?.message}
          {...form.register('email')}
        />
        <Field
          label="Password"
          type="password"
          autoComplete="new-password"
          error={form.formState.errors.password?.message}
          {...form.register('password')}
        />
        {error && <p className="text-sm text-veto">{error}</p>}
        <Button className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Joining…' : 'Create account'}
        </Button>
      </form>
    </AuthShell>
  );
}

function AuthShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md items-center p-4">
      <Card className="w-full p-6">
        <p className="font-bold font-display text-accent text-sm uppercase tracking-widest">
          scran
        </p>
        <h1 className="mt-2 mb-6 font-bold font-display text-3xl tracking-display">
          {title}
        </h1>
        {children}
      </Card>
    </main>
  );
}

function PageMessage({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center text-ink-muted">
      <p>{children}</p>
    </main>
  );
}
