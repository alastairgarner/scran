// The zod schemas both workspaces share, and the types inferred from them.
// Depends on zod and nothing else, ever — that dependency direction is what
// keeps server code structurally out of the browser bundle.
import { z } from 'zod';

/**
 * What redeeming an invite asks for. The server validates the request body
 * against this; the signup form resolves the same schema, so the rules are
 * written once. The password floor is Better Auth's own minimum.
 */
export const signUpSchema = z.object({
  name: z.string().trim().min(1, 'What should we call you?'),
  email: z.email(),
  password: z.string().min(8, 'At least 8 characters.'),
});

export type SignUp = z.infer<typeof signUpSchema>;

export * from './recipe';
export * from './tags';
