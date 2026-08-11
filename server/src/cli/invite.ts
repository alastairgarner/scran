/**
 * `bun run invite [email]` — mints an invite and prints the signup link, which
 * you paste into whatever chat app the person actually reads.
 *
 * The only way to create an account, and deliberately a terminal command: it
 * is why `invite.createdByUserId` is nullable, since the first one is issued
 * before anybody exists to have issued it. An `/invites` page is additive.
 */
import { createInvite } from '../auth';
import { db, migrate } from '../db';

migrate(db);

const email = process.argv[2];
process.stdout.write(`${createInvite(email)}\n`);
