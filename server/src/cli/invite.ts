/**
 * The only way to create an account, and deliberately a terminal command: it
 * is why `invite.createdByUserId` is nullable, since the first one is issued
 * before anybody exists to have issued it. An `/invites` page is additive.
 *
 *   bun run invite <email>       mint an invite bound to that address
 *   bun run invite list          show invites that could still be redeemed
 *   bun run invite revoke <id>   kill an unused invite
 *
 * Paste the printed link into whatever chat app the person actually reads.
 */
import { z } from 'zod';

import { createInvite, listInvites, revokeInvite } from '../auth';
import { db, migrate } from '../db';

migrate(db);

const [command, argument] = process.argv.slice(2);

if (command === 'list') {
  for (const invite of listInvites()) {
    process.stdout.write(
      `${invite.id}\t${invite.email ?? '(any address)'}\texpires ${invite.expiresAt}\n`,
    );
  }
} else if (command === 'revoke') {
  const id = Number(argument);
  if (!Number.isInteger(id) || !revokeInvite(id)) {
    process.stderr.write(`No unused invite with id ${argument}.\n`);
    process.exit(1);
  }
  process.stdout.write(`Revoked invite ${id}.\n`);
} else {
  // Binding fixes the account address; the private link remains the authority.
  // It does not verify mailbox ownership or make forwarding safe.
  const email = z.email().safeParse(command);
  if (!email.success) {
    process.stderr.write(
      'Usage: bun run invite <email> | list | revoke <id>\n',
    );
    process.exit(1);
  }
  process.stdout.write(`${createInvite(email.data)}\n`);
}
