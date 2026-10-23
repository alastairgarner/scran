import {
  disableAccount,
  enableAccount,
  listAccounts,
  migrateAuth,
  resetPassword,
} from '../auth';
import { db, migrate } from '../db';
/**
 * Operator controls for accounts. Shell access to the server is the authority;
 * there is no admin role to grant or lose.
 *
 *   bun run accounts list                    every account, disabled marked
 *   bun run accounts disable <email>         lock out and sign out everywhere
 *   bun run accounts enable <email>          allow signing in again
 *   bun run accounts reset-password <email>  print a temporary password and
 *                                            sign out everywhere
 *
 * Disabling keeps the account, so what they wrote stays attributed to them.
 */
import { ClientError } from '../errors';

migrate(db);
await migrateAuth();

const [command, email] = process.argv.slice(2);

try {
  if (command === 'list') {
    for (const account of listAccounts()) {
      const state = account.disabledAt
        ? `disabled ${account.disabledAt}`
        : 'active';
      process.stdout.write(`${account.email}\t${account.name}\t${state}\n`);
    }
  } else if (command === 'disable' && email) {
    await disableAccount(email);
    process.stdout.write(`Disabled ${email} and signed out every device.\n`);
  } else if (command === 'enable' && email) {
    enableAccount(email);
    process.stdout.write(`Enabled ${email}.\n`);
  } else if (command === 'reset-password' && email) {
    const password = await resetPassword(email);
    process.stdout.write(
      `Temporary password for ${email}: ${password}\nEvery device is signed out. Ask them to change it under Account.\n`,
    );
  } else {
    process.stderr.write(
      'Usage: bun run accounts list | disable <email> | enable <email> | reset-password <email>\n',
    );
    process.exit(1);
  }
} catch (cause) {
  if (!(cause instanceof ClientError)) {
    throw cause;
  }
  process.stderr.write(`${cause.message}\n`);
  process.exit(1);
}
