// Ticket 19s closed tag vocabulary. Zod-free on purpose: the extraction
// schema imports TAG_IDS, so this file must not import that one.

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
