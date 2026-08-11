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

/**
 * The closed tag vocabulary — ticket 19. A constant and not a table: one
 * deployer, six users, and a vocabulary anyone can extend through a UI is
 * free-form tags with extra ceremony. Adding one is a one-line change.
 *
 * `search` is what goes into the FTS index for the tag, never the id, so
 * searching *veggie* finds a recipe tagged `vegetarian` whose page never says
 * the word. An id that later leaves this list is ignored on read.
 */
export const TAGS = [
  // Diet — the model picks exactly one of the first three. `vegan` rides on
  // top of `vegetarian` rather than replacing it.
  {
    id: 'vegetarian',
    label: 'Vegetarian',
    search: 'vegetarian veggie veg meat-free meatless',
  },
  {
    id: 'pescatarian',
    label: 'Pescatarian',
    search: 'pescatarian fish seafood',
  },
  { id: 'meat', label: 'Meat', search: 'meat chicken beef pork lamb' },
  { id: 'vegan', label: 'Vegan', search: 'vegan plant-based dairy-free' },
  // Course — zero or more. Panzanella is main and side; muffins are baking
  // and breakfast.
  { id: 'breakfast', label: 'Breakfast', search: 'breakfast brunch morning' },
  { id: 'main', label: 'Main', search: 'main dinner lunch supper mains' },
  { id: 'side', label: 'Side', search: 'side sides salad accompaniment' },
  { id: 'pudding', label: 'Pudding', search: 'pudding dessert sweet afters' },
  { id: 'baking', label: 'Baking', search: 'baking bake cake bread biscuits' },
  { id: 'snack', label: 'Snack', search: 'snack nibbles small' },
] as const;

export type TagId = (typeof TAGS)[number]['id'];

export const TAG_IDS = TAGS.map(t => t.id) as readonly TagId[];

/**
 * `vegan` implies `vegetarian`. Stated in the prompt and enforced here too — a
 * model that forgets the implication once costs a wrong filter result forever.
 */
export const normaliseTags = (tags: readonly string[]): TagId[] => {
  const known = tags.filter((t): t is TagId => TAG_IDS.includes(t as TagId));
  const withImplied =
    known.includes('vegan') && !known.includes('vegetarian')
      ? [...known, 'vegetarian' as const]
      : known;
  return [...new Set(withImplied)];
};
