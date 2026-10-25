import { expect, it } from 'bun:test';

import {
  catalogueBottomInset,
  needsViewportFallback,
} from './catalogue-viewport';

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

it('positions controls at the visual viewport bottom, accounting for panning', () => {
  const viewport = {
    layoutHeight: 844,
    visualHeight: 460,
    visualOffsetTop: 0,
    scale: 1,
    searchFocused: true,
  };
  expect(catalogueBottomInset(viewport)).toBe(384);
  expect(catalogueBottomInset({ ...viewport, visualOffsetTop: 50 })).toBe(334);
  expect(catalogueBottomInset({ ...viewport, visualOffsetTop: 400 })).toBe(0);
  expect(catalogueBottomInset({ ...viewport, layoutHeight: 460 })).toBe(0);
  expect(catalogueBottomInset({ ...viewport, searchFocused: false })).toBe(0);
  expect(catalogueBottomInset({ ...viewport, scale: 2 })).toBe(0);
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
