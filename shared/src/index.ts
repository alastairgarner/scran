// The zod schemas both workspaces share, and the types inferred from them.
// Depends on zod and nothing else, ever — that dependency direction is what
// keeps server code structurally out of the browser bundle.
import { z } from 'zod';

/**
 * The floor for every new password: signup, change and operator reset. Better
 * Auth is configured with the same number. Signing in checks no length, so
 * passwords set under the old floor of 8 keep working.
 */
export const PASSWORD_MIN_LENGTH = 12;

const newPassword = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `At least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(128, 'Use at most 128 characters.');

/**
 * What redeeming an invite asks for. The server validates the request body
 * against this; the signup form resolves the same schema, so the rules are
 * written once.
 */
export const signUpSchema = z.object({
  name: z.string().trim().min(1, 'What should we call you?').max(100),
  email: z.email(),
  password: newPassword,
});

export type SignUp = z.infer<typeof signUpSchema>;

/** Admin invite creation always creates a member; no role field is accepted. */
export const createInviteSchema = z.object({ email: z.email() }).strict();
export type CreateInvite = z.infer<typeof createInviteSchema>;

/** The account screen's password change, sent to Better Auth. */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.'),
    newPassword,
    confirmPassword: z.string(),
  })
  .refine(values => values.newPassword === values.confirmPassword, {
    message: 'The passwords do not match.',
    path: ['confirmPassword'],
  });

export type ChangePassword = z.infer<typeof changePasswordSchema>;

export * from './recipe';
export * from './photo';
export * from './tags';
