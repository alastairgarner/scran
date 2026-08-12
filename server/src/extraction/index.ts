/**
 * Reading a recipe off a source, and the only place the model's reply is
 * trusted — after zod says so, and never before.
 *
 * Ticket 05's seam: photo and URL differ only in acquiring the artifact and in
 * which prompt they use, and everything after `extract` — version row, index,
 * response — is one path that never learns which kind it was. Only the photo
 * arm exists; ticket 14 adds `html` beside it, and `source.kind` is what it
 * will branch on.
 */
import type { RecipeContent, TagId } from '@scran/shared';
import {
  extractionSchema,
  normaliseTags,
  toRecipeContent,
} from '@scran/shared';
import { AppError } from '../errors';
import type { Complete } from './openai';
import { complete, prompt, promptVersion } from './openai';

/** What there is to read a recipe off. Ticket 14 adds `{ kind: 'html' }`. */
export type ExtractionSource = { kind: 'photo'; photo: Blob };

/** A recipe as read from a page: the version's content, its tags, its cost. */
export type Extracted = {
  content: RecipeContent;
  tags: TagId[];
  model: string;
  promptVersion: string;
  tokensIn: number;
  tokensOut: number;
};

/**
 * @param source The artifact to read.
 * @param deps The chat client. Production passes nothing; tests pass a
 *   function returning a recorded reply, which is the whole of the mocking.
 * @returns {Promise<Extracted>} The recipe, validated.
 * @throws {AppError} `dependency` when the reply is unparseable or fails the
 *   schema: the request was fine, the upstream wasn't, so it stays retryable.
 */
export async function extract(
  source: ExtractionSource,
  deps: { complete: Complete } = { complete },
): Promise<Extracted> {
  const completion = await deps.complete({ prompt, photo: source.photo });

  let parsed: unknown;
  try {
    parsed = JSON.parse(completion.json);
  } catch (cause) {
    throw AppError.dependency(
      'The recipe reader returned something unreadable.',
      { model: completion.model },
      cause,
    );
  }

  const result = extractionSchema.safeParse(parsed);
  if (!result.success) {
    throw AppError.dependency('The recipe reader returned the wrong shape.', {
      model: completion.model,
      issues: result.error.issues.slice(0, 5),
    });
  }

  return {
    content: toRecipeContent(result.data),
    // Enforced twice on purpose — stated in the prompt, applied here. A model
    // that forgets `vegan` implies `vegetarian` once costs a wrong filter
    // result forever.
    tags: normaliseTags(result.data.tags),
    model: completion.model,
    promptVersion,
    tokensIn: completion.tokensIn,
    tokensOut: completion.tokensOut,
  };
}
