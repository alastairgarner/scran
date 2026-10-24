import { zodResolver } from '@hookform/resolvers/zod';
import {
  type ChangePassword,
  changePasswordSchema,
  PASSWORD_MIN_LENGTH,
} from '@scran/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';

import { accountOptions } from '../api/admin';
import { authClient } from '../auth';
import {
  Button,
  ButtonLink,
  Feedback,
  Field,
  PageHeader,
  Section,
} from '../ui';

type Outcome = { tone: 'neutral' | 'error'; message: string } | null;

/** Better Auth answers `{ error }` rather than throwing; a dead network throws. */
async function attempt(
  run: () => Promise<{ error: { message?: string } | null }>,
  fallback: string,
): Promise<string | null> {
  try {
    const { error } = await run();
    return error ? (error.message ?? fallback) : null;
  } catch {
    return fallback;
  }
}

export function Account() {
  const session = authClient.useSession();
  const user = session.data?.user;
  const account = useQuery(accountOptions(user?.id ?? ''));

  return (
    <main className="mx-auto max-w-2xl space-y-8 px-4 pb-8">
      <PageHeader
        title="Account"
        back={
          <ButtonLink to="/" variant="quiet" size="compact">
            ← All recipes
          </ButtonLink>
        }
        description={
          user && (
            <span className="break-words">
              {user.name} · {user.email}
            </span>
          )
        }
      />
      {account.data?.role === 'admin' && (
        <Section
          title="Administration"
          description="Manage accounts and invites for the shared cookbook."
        >
          <ButtonLink to="/admin" variant="secondary">
            Administration →
          </ButtonLink>
        </Section>
      )}
      {account.isError && (
        <Feedback tone="error">
          Could not check administration access. Refresh to try again.
        </Feedback>
      )}
      <PasswordSection email={user?.email ?? ''} />
      <DevicesSection />
    </main>
  );
}

function PasswordSection({ email }: { email: string }) {
  const [outcome, setOutcome] = useState<Outcome>(null);
  const form = useForm<ChangePassword>({
    resolver: zodResolver(changePasswordSchema),
  });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async values => {
    setOutcome(null);
    const error = await attempt(
      () =>
        authClient.changePassword({
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
          // The server forces this too; asking keeps the client honest.
          revokeOtherSessions: true,
        }),
      'Could not change your password.',
    );
    if (error) {
      setOutcome({ tone: 'error', message: error });
      return;
    }
    form.reset();
    setOutcome({
      tone: 'neutral',
      message: 'Password changed. Every other device has been signed out.',
    });
  });

  return (
    <Section
      title="Change password"
      description="Changing it signs you out everywhere else."
    >
      <form className="space-y-4" onSubmit={event => void submit(event)}>
        {/* Lets a password manager file the new password under the right login. */}
        <input
          type="email"
          autoComplete="username"
          value={email}
          readOnly
          hidden
        />
        <Field
          label="Current password"
          type="password"
          autoComplete="current-password"
          error={errors.currentPassword?.message}
          {...form.register('currentPassword')}
        />
        <Field
          label="New password"
          type="password"
          autoComplete="new-password"
          hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
          error={errors.newPassword?.message}
          {...form.register('newPassword')}
        />
        <Field
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...form.register('confirmPassword')}
        />
        {outcome && <Feedback tone={outcome.tone}>{outcome.message}</Feedback>}
        <Button type="submit" loading={isSubmitting}>
          {isSubmitting ? 'Changing…' : 'Change password'}
        </Button>
      </form>
    </Section>
  );
}

function DevicesSection() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<'others' | 'self' | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);

  const signOutOthers = async () => {
    setBusy('others');
    setOutcome(null);
    const error = await attempt(
      () => authClient.revokeOtherSessions(),
      'Could not sign out your other devices.',
    );
    setBusy(null);
    setOutcome(
      error
        ? { tone: 'error', message: error }
        : { tone: 'neutral', message: 'Every other device is signed out.' },
    );
  };

  const signOut = async () => {
    setBusy('self');
    setOutcome(null);
    const error = await attempt(
      () => authClient.signOut(),
      'Could not sign out.',
    );
    if (error) {
      setBusy(null);
      setOutcome({ tone: 'error', message: error });
      return;
    }
    // Nothing fetched as this person may be shown to whoever signs in next.
    queryClient.clear();
    void navigate('/signin', { replace: true });
  };

  return (
    <Section
      title="Devices"
      description="Lost a phone, or signed in somewhere you shouldn't stay?"
    >
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          loading={busy === 'others'}
          disabled={busy !== null}
          onClick={() => void signOutOthers()}
        >
          {busy === 'others' ? 'Signing out…' : 'Sign out other devices'}
        </Button>
        <Button
          variant="quiet"
          loading={busy === 'self'}
          disabled={busy !== null}
          onClick={() => void signOut()}
        >
          {busy === 'self' ? 'Signing out…' : 'Sign out'}
        </Button>
      </div>
      {outcome && <Feedback tone={outcome.tone}>{outcome.message}</Feedback>}
    </Section>
  );
}
