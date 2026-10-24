import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import {
  accountOptions,
  type AccountAction,
  accountsOptions,
  adminKeys,
  createInvite,
  invitesOptions,
  type ManagedAccount,
  manageAccount,
  revokeInvite,
} from '../api/admin';
import { authClient } from '../auth';
import {
  Button,
  ButtonLink,
  Dialog,
  EmptyState,
  Feedback,
  Field,
  PageHeader,
  Section,
} from '../ui';

export function Administration() {
  const session = authClient.useSession();
  const userId = session.data?.user.id ?? '';
  const account = useQuery(accountOptions(userId));

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 pb-8">
      <PageHeader
        title="Administration"
        back={
          <ButtonLink to="/account" variant="quiet" size="compact">
            ← Account
          </ButtonLink>
        }
        description="Manage who can access your shared cookbook."
      />
      {account.isPending ? (
        <Feedback>Checking access…</Feedback>
      ) : account.isError ? (
        <LoadError error={account.error} retry={() => void account.refetch()} />
      ) : account.data.role === 'admin' ? (
        <>
          <InvitesSection userId={userId} />
          <AccountsSection userId={userId} />
        </>
      ) : (
        <EmptyState title="Admin access only">
          Your account can use the cookbook, but cannot manage access.
        </EmptyState>
      )}
    </main>
  );
}

function LoadError({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <div className="space-y-2">
      <Feedback tone="error">{error.message}</Feedback>
      <Button variant="secondary" size="compact" onClick={retry}>
        Try again
      </Button>
    </div>
  );
}

function InvitesSection({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const invites = useQuery(invitesOptions(userId));
  const [email, setEmail] = useState('');
  const [created, setCreated] = useState<{ email: string; url: string } | null>(
    null,
  );
  const [copyStatus, setCopyStatus] = useState('');
  const [selected, setSelected] = useState<{
    id: number;
    email: string | null;
  } | null>(null);
  const [notice, setNotice] = useState('');

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: adminKeys(userId) });
  const create = useMutation({
    // Return no secret into TanStack's mutation cache.
    mutationFn: async (address: string) => {
      const data = await createInvite(address);
      setCreated({ email: address, url: data.url });
    },
    gcTime: 0,
    onSuccess: () => {
      setCopyStatus('');
      setEmail('');
      void refresh();
    },
  });
  const revoke = useMutation({
    mutationFn: revokeInvite,
    onSuccess: (_, id) => {
      if (
        created &&
        selected?.id === id &&
        selected.email?.toLowerCase() === created.email.toLowerCase()
      ) {
        setCreated(null);
      }
      setSelected(null);
      setNotice('Invite revoked. That link can no longer create an account.');
      void refresh();
    },
  });

  const copy = async () => {
    if (!created) {
      return;
    }
    try {
      await navigator.clipboard.writeText(created.url);
      setCopyStatus('Link copied. Send it privately to the person invited.');
    } catch {
      setCopyStatus(
        'Could not copy automatically. Select and copy the link below.',
      );
    }
  };

  return (
    <Section
      title="Invites"
      description="Single-use links expire after seven days. New accounts are members."
    >
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={event => {
          event.preventDefault();
          setNotice('');
          create.mutate(email.trim());
        }}
      >
        <Field
          label="Email to invite"
          type="email"
          required
          maxLength={254}
          autoComplete="off"
          value={email}
          onChange={event => setEmail(event.target.value)}
          className="min-w-0 flex-1 basis-64"
        />
        <Button type="submit" loading={create.isPending}>
          {create.isPending ? 'Creating…' : 'Create invite'}
        </Button>
      </form>
      {create.isError && (
        <Feedback tone="error">
          {create.error.message} If the connection failed, check pending invites
          before creating another.
        </Feedback>
      )}
      {created && (
        <div className="space-y-3">
          <Feedback>
            Invite created for{' '}
            <span className="break-all">{created.email}</span>. Save the link
            now—it cannot be retrieved later. Anyone holding it can create this
            account.
          </Feedback>
          <Field
            label="New invite link"
            value={created.url}
            readOnly
            autoComplete="off"
            onFocus={event => event.target.select()}
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void copy()}>
              Copy link
            </Button>
            <Button
              variant="quiet"
              onClick={() => {
                setCreated(null);
                create.reset();
                setCopyStatus('');
              }}
            >
              Dismiss link
            </Button>
          </div>
          {copyStatus && <Feedback>{copyStatus}</Feedback>}
        </div>
      )}
      {notice && <Feedback>{notice}</Feedback>}
      <h3 className="type-label text-ink-muted font-semibold">
        Pending invites
      </h3>
      {invites.isPending ? (
        <Feedback>Loading invites…</Feedback>
      ) : invites.isError ? (
        <LoadError error={invites.error} retry={() => void invites.refetch()} />
      ) : invites.data.length === 0 ? (
        <p className="type-control text-ink-muted">No pending invites.</p>
      ) : (
        <ul className="divide-line divide-y">
          {invites.data.map(invite => (
            <li
              key={invite.id}
              className="flex flex-wrap items-center justify-between gap-3 py-4"
            >
              <div className="min-w-0 flex-1 basis-48">
                <p className="type-control break-all">
                  {invite.email ?? 'Any email address (operator invite)'}
                </p>
                <p className="type-label text-ink-muted">
                  Expires {date(invite.expiresAt)}
                </p>
              </div>
              <Button
                variant="quiet"
                size="compact"
                onClick={() => {
                  revoke.reset();
                  setSelected(invite);
                }}
                aria-label={`Revoke invite for ${invite.email ?? 'any email address'}`}
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={selected !== null}
        title="Revoke invite?"
        onClose={() => setSelected(null)}
        busy={revoke.isPending}
        footer={
          <Button
            variant="destructive"
            loading={revoke.isPending}
            onClick={() => selected && revoke.mutate(selected.id)}
          >
            {revoke.isPending ? 'Revoking…' : 'Revoke invite'}
          </Button>
        }
      >
        <p className="break-words">
          The link for {selected?.email ?? 'any email address'} will stop
          working. You can create a new invite later.
        </p>
        {revoke.isError && (
          <Feedback tone="error">{revoke.error.message}</Feedback>
        )}
      </Dialog>
    </Section>
  );
}

type SelectedAction = { account: ManagedAccount; action: AccountAction };

const actionLabels = {
  disable: 'Disable account',
  enable: 'Re-enable account',
  'revoke-sessions': 'Sign out all devices',
} satisfies Record<AccountAction, string>;

function AccountsSection({ userId }: { userId: string }) {
  const accounts = useQuery(accountsOptions(userId));
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<SelectedAction | null>(null);
  const [notice, setNotice] = useState('');
  const mutation = useMutation({
    mutationFn: ({ account, action }: SelectedAction) =>
      manageAccount(account.id, action),
    onSuccess: (_, { account, action }) => {
      setSelected(null);
      setNotice(
        action === 'disable'
          ? `${account.name} is disabled and signed out. Their recipes and attribution are kept.`
          : action === 'enable'
            ? `${account.name} can sign in again. Previous sessions stay signed out.`
            : `All devices for ${account.name} are signed out. They can sign in again with their password.`,
      );
      void queryClient.invalidateQueries({ queryKey: adminKeys(userId) });
    },
  });
  const choose = (account: ManagedAccount, action: AccountAction) => {
    mutation.reset();
    setSelected({ account, action });
  };

  return (
    <Section
      title="Accounts"
      description="Disabling removes access, not recipes, comments or attribution."
    >
      {notice && <Feedback>{notice}</Feedback>}
      {accounts.isPending ? (
        <Feedback>Loading accounts…</Feedback>
      ) : accounts.isError ? (
        <LoadError
          error={accounts.error}
          retry={() => void accounts.refetch()}
        />
      ) : (
        <ul className="divide-line divide-y">
          {accounts.data.map(account => (
            <li key={account.id} className="space-y-3 py-4">
              <div>
                <p className="type-control font-semibold break-words">
                  {account.name}
                  {account.id === userId ? ' (you)' : ''}
                </p>
                <p className="type-label text-ink-muted break-all">
                  {account.email}
                </p>
                <p className="type-label text-ink-muted mt-1">
                  {account.role === 'admin' ? 'Admin' : 'Member'} ·{' '}
                  {account.disabledAt ? 'Disabled' : 'Active'} · Joined{' '}
                  {date(account.createdAt)}
                </p>
              </div>
              {account.role === 'admin' ? (
                <p className="type-label text-ink-muted">
                  Your admin account is protected. Manage your own devices from
                  Account.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="compact"
                    onClick={() =>
                      choose(account, account.disabledAt ? 'enable' : 'disable')
                    }
                  >
                    {account.disabledAt
                      ? 'Re-enable account'
                      : 'Disable account'}
                  </Button>
                  {!account.disabledAt && (
                    <Button
                      variant="quiet"
                      size="compact"
                      onClick={() => choose(account, 'revoke-sessions')}
                    >
                      Sign out all devices
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={selected !== null}
        title={
          selected ? `${actionLabels[selected.action]}?` : 'Manage account'
        }
        busy={mutation.isPending}
        onClose={() => setSelected(null)}
        footer={
          <Button
            variant={selected?.action === 'enable' ? 'primary' : 'destructive'}
            loading={mutation.isPending}
            onClick={() => selected && mutation.mutate(selected)}
          >
            {mutation.isPending
              ? 'Saving…'
              : selected
                ? actionLabels[selected.action]
                : 'Confirm'}
          </Button>
        }
      >
        <p className="break-words">
          {selected?.account.name} · {selected?.account.email}
        </p>
        <p>
          {selected?.action === 'disable'
            ? 'This person will be signed out everywhere and cannot sign back in until you re-enable their account. Their content stays in the cookbook.'
            : selected?.action === 'enable'
              ? 'This person can sign in again using their existing password.'
              : 'This signs out every device, but does not change their password or stop them signing in again.'}
        </p>
        {mutation.isError && (
          <Feedback tone="error">{mutation.error.message}</Feedback>
        )}
      </Dialog>
    </Section>
  );
}

function date(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
