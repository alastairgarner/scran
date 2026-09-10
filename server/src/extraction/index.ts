/**
 * Reading a recipe off a source, and the only place the model's reply is
 * trusted — after zod says so, and never before.
 *
 * Ticket 05's seam: photo and URL differ only in acquiring the artifact and in
 * which prompt they use, and everything after `extract` — version row, index,
 * response — is one path that never learns which kind it was.
 */
import type { RecipeContent, TagId } from '@scran/shared';
import {
  extractionSchema,
  normaliseTags,
  toRecipeContent,
} from '@scran/shared';

import { AppError } from '../errors';
import type { Complete, CompleteRequest } from './openai';
import { complete, prompts } from './openai';

/** What there is to read a recipe off. */
export type ExtractionSource = CompleteRequest['source'];

/** A recipe as read from a page: the version's content, its tags, its cost. */
export type Extracted = {
  content: RecipeContent;
  tags: TagId[];
  model: string;
  promptVersion: string;
  tokensIn: number;
  tokensOut: number;
};

const JSON_LD =
  /<script\b[^>]*\btype\s*=\s*(["'])application\/ld\+json\1[^>]*>([\s\S]*?)<\/script>/gi;

const MAX_WEBPAGE_TEXT_CHARS = 100_000;

function selectedHtml(html: string, selector: string): string | undefined {
  const startMarker = '<!--scran:start-->';
  const endMarker = '<!--scran:end-->';
  const marked = new HTMLRewriter()
    .on(selector, {
      element: element => {
        element.before(startMarker, { html: true });
        element.onEndTag(tag => {
          tag.after(endMarker, { html: true });
        });
      },
    })
    .transform(html);
  const start = marked.indexOf(startMarker);
  const end = marked.indexOf(endMarker, start + startMarker.length);
  return start < 0 || end < 0
    ? undefined
    : marked.slice(start + startMarker.length, end);
}

function recipeJsonLd(html: string): string | undefined {
  const recipes = [...html.matchAll(JSON_LD)].flatMap(match => {
    try {
      const parsed = JSON.parse(match[2]) as unknown;
      return findRecipes(parsed);
    } catch {
      return [];
    }
  });
  return recipes.length > 0 ? JSON.stringify(recipes) : undefined;
}

function findRecipes(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value.flatMap(findRecipes);
  }
  if (value === null || typeof value !== 'object') {
    return [];
  }
  const entries = Object.entries(value as Record<string, unknown>);
  const type = entries.find(([key]) => key === '@type')?.[1];
  if (type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'))) {
    return [value];
  }
  return entries.flatMap(([, child]) => findRecipes(child));
}

/** Keeps the permanent source raw; sends the smallest useful representation. */
function htmlForModel(html: string): string {
  const recipeCard = selectedHtml(html, '.wprm-recipe-container');
  if (recipeCard) {
    return recipeCard.slice(0, MAX_WEBPAGE_TEXT_CHARS);
  }

  const jsonLd = recipeJsonLd(html);
  if (jsonLd) {
    return jsonLd.slice(0, MAX_WEBPAGE_TEXT_CHARS);
  }

  let cleaned = html;
  const rewriter = new HTMLRewriter();
  for (const selector of [
    'script',
    'style',
    'nav',
    'aside',
    'form',
    'iframe',
    'svg',
    'template',
    'noscript',
    'header',
    'footer',
  ]) {
    rewriter.on(selector, {
      element: element => {
        element.remove();
      },
    });
  }
  cleaned = rewriter.transform(cleaned);

  for (const selector of [
    '[itemtype$="/Recipe"]',
    '[itemtype$="#Recipe"]',
    '[typeof$="Recipe"]',
    'article',
    'main',
    'body',
  ]) {
    let text = '';
    new HTMLRewriter()
      .on(selector, {
        text: chunk => {
          text += ` ${chunk.text}`;
        },
      })
      .transform(cleaned);
    text = text.replace(/\s+/g, ' ').trim();
    if (text !== '') {
      return text.slice(0, MAX_WEBPAGE_TEXT_CHARS);
    }
  }

  throw AppError.dependency('The webpage had no readable recipe content.');
}

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
  const prompt = prompts[source.kind];
  const completion = await deps.complete({
    prompt,
    source:
      source.kind === 'html'
        ? { kind: 'html', html: htmlForModel(source.html) }
        : source,
  });

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
    promptVersion: Bun.hash(prompt).toString(16).slice(0, 8),
    tokensIn: completion.tokensIn,
    tokensOut: completion.tokensOut,
  };
}
