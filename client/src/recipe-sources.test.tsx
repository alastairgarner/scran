import { expect, it } from 'bun:test';

import { renderToStaticMarkup } from 'react-dom/server';

import { RecipeSources } from './recipe-sources';

const sources = [
  { id: 10, kind: 'photo', url: null },
  { id: 11, kind: 'html', url: 'https://example.com/recipe' },
  { id: 12, kind: 'photo', url: null },
] satisfies Parameters<typeof RecipeSources>[0]['sources'];

it('opens source photos with accessible buttons, numbered independently of webpage links', () => {
  const html = renderToStaticMarkup(<RecipeSources sources={sources} />);
  expect(html).toContain('aria-label="Open source photo 1"');
  expect(html).toContain('aria-label="Open source photo 2"');
  expect(html).not.toContain('Open source photo 3');
  expect(html.match(/aria-haspopup="dialog"/g)).toHaveLength(2);
  expect(html).toContain('src="/api/photos/10"');
  expect(html).toContain('src="/api/photos/12"');
  expect(html).not.toContain('<a href="/api/photos/');
  expect(html).toContain('href="https://example.com/recipe"');
  expect(html).toContain('Original webpage');
  expect(html).not.toContain('role="dialog"');
});

it('uses the same photo viewer for failed extraction without changing recovery links', () => {
  const html = renderToStaticMarkup(<RecipeSources sources={sources} failed />);
  expect(html).toContain('Open source photo 2');
  expect(html).toContain('View original webpage');
  expect(html).toContain('h-40 w-40');
});

it('supports single-photo, webpage-only and empty sources', () => {
  const photo = sources[0];
  if (!photo) {
    throw new Error('Missing photo fixture');
  }
  const html = renderToStaticMarkup(<RecipeSources sources={[photo]} />);
  expect(html).toContain('Open source photo 1');
  expect(html).not.toContain('Open source photo 2');
  expect(renderToStaticMarkup(<RecipeSources sources={[]} />)).not.toContain(
    '<button',
  );
  expect(
    renderToStaticMarkup(
      <RecipeSources
        sources={sources.filter(source => source.kind === 'html')}
      />,
    ),
  ).not.toContain('<button');
});
