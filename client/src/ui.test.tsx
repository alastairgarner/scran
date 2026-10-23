import { expect, it } from 'bun:test';

import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';

import {
  Button,
  ButtonLink,
  Checkbox,
  ChoiceChip,
  Dialog,
  Field,
  PersistentDrawer,
  Textarea,
} from './ui';

it('defaults actions to non-submit and disables loading actions', () => {
  const html = renderToStaticMarkup(<Button loading>Saving…</Button>);
  expect(html).toContain('type="button"');
  expect(html).toContain('disabled=""');
  expect(html).toContain('aria-busy="true"');
  expect(renderToStaticMarkup(<Button type="submit">Save</Button>)).toContain(
    'type="submit"',
  );
});

it('renders navigation as a real link', () => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <ButtonLink to="/capture">Add recipe</ButtonLink>
    </MemoryRouter>,
  );
  expect(html).toContain('href="/capture"');
  expect(html).not.toContain('<button');
});

it('connects labels, hints and errors without losing caller descriptions', () => {
  const html = renderToStaticMarkup(
    <Field
      id="email"
      label="Email"
      hint="Your household address"
      error="Enter an email"
      aria-describedby="external"
    />,
  );
  expect(html).toContain('for="email"');
  expect(html).toContain('id="email"');
  expect(html).toContain('aria-invalid="true"');
  expect(html).toContain('aria-describedby="external email-hint email-error"');
  expect(html).toContain('id="email-error"');
  expect(html).toContain('role="alert"');
});

it('gives hidden labels and textareas the same accessible field structure', () => {
  const html = renderToStaticMarkup(
    <Textarea id="comment" label="Comment" hideLabel error="Write a comment" />,
  );
  expect(html).toContain(
    '<label for="comment" class="sr-only">Comment</label>',
  );
  expect(html).toContain('<textarea');
  expect(html).toContain('aria-describedby="comment-error"');
});

it('keeps checkbox semantics native', () => {
  const html = renderToStaticMarkup(
    <Checkbox label="Vegetarian" defaultChecked disabled />,
  );
  expect(html).toContain('type="checkbox"');
  expect(html).toContain('checked=""');
  expect(html).toContain('disabled=""');
  expect(html).toContain('Vegetarian');
});

it('distinguishes selectable chips from removal actions', () => {
  const choice = renderToStaticMarkup(
    <ChoiceChip kind="choice" selected onClick={() => {}}>
      Quick
    </ChoiceChip>,
  );
  expect(choice).toContain('aria-pressed="true"');
  const removal = renderToStaticMarkup(
    <ChoiceChip
      kind="removable"
      removeLabel="Remove quick filter"
      onRemove={() => {}}
    >
      Quick
    </ChoiceChip>,
  );
  expect(removal).toContain('aria-label="Remove quick filter"');
  expect(removal).not.toContain('aria-pressed');
});

it('uses a native labelled dialog, not a modal-looking div', () => {
  const html = renderToStaticMarkup(
    <Dialog open={false} title="Delete recipe?" onClose={() => {}}>
      Previous versions will be removed.
    </Dialog>,
  );
  expect(html).toContain('<dialog');
  expect(html).toContain('aria-labelledby=');
  expect(html).toContain('Delete recipe?');
});

it('connects the non-modal drawer toggle and body without modal semantics', () => {
  const html = renderToStaticMarkup(
    <PersistentDrawer title="Ingredients" open={false} onOpenChange={() => {}}>
      <Button>Inside drawer</Button>
    </PersistentDrawer>,
  );
  expect(html).toContain('data-open="false"');
  expect(html).toContain('aria-expanded="false"');
  expect(html).toContain('aria-controls=');
  expect(html).not.toContain('aria-modal');
  expect(html).not.toContain('<dialog');
});
