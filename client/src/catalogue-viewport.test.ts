import { expect, it } from 'bun:test';

import { needsViewportFallback } from './catalogue-viewport';

it('leaves native keyboard resizing to CSS, including fractional pixels', () => {
  expect(
    needsViewportFallback({
      layoutHeight: 434,
      visualHeight: 433.9,
      scale: 1,
      searchFocused: true,
    }),
  ).toBe(false);
});

it('falls back for an overlay keyboard when the layout viewport stays tall', () => {
  expect(
    needsViewportFallback({
      layoutHeight: 780,
      visualHeight: 390,
      scale: 1,
      searchFocused: true,
    }),
  ).toBe(true);
});

it('does not override CSS when search is unfocused or the keyboard is closed', () => {
  expect(
    needsViewportFallback({
      layoutHeight: 780,
      visualHeight: 390,
      scale: 1,
      searchFocused: false,
    }),
  ).toBe(false);
  expect(
    needsViewportFallback({
      layoutHeight: 780,
      visualHeight: 780,
      scale: 1,
      searchFocused: true,
    }),
  ).toBe(false);
});

it('does not treat pinch zoom as an overlay keyboard', () => {
  expect(
    needsViewportFallback({
      layoutHeight: 780,
      visualHeight: 390,
      scale: 2,
      searchFocused: true,
    }),
  ).toBe(false);
});
