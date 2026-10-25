import { useLayoutEffect, useRef } from 'react';

export function needsViewportFallback({
  layoutHeight,
  visualHeight,
  scale,
  searchFocused,
}: {
  layoutHeight: number;
  visualHeight: number;
  scale: number;
  searchFocused: boolean;
}): boolean {
  // Native resizes-content keeps both viewports equal (allow pixel rounding).
  // Don't mistake pinch zoom for an overlay keyboard.
  return searchFocused && scale === 1 && layoutHeight - visualHeight > 1;
}

export function catalogueBottomInset({
  layoutHeight,
  visualHeight,
  visualOffsetTop,
  scale,
  searchFocused,
}: {
  layoutHeight: number;
  visualHeight: number;
  visualOffsetTop: number;
  scale: number;
  searchFocused: boolean;
}): number {
  return needsViewportFallback({
    layoutHeight,
    visualHeight,
    scale,
    searchFocused,
  })
    ? Math.max(0, layoutHeight - visualHeight - visualOffsetTop)
    : 0;
}

export function useCatalogueViewport() {
  const ref = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const viewport = window.visualViewport;
    const element = ref.current;
    if (!viewport || !element) {
      return;
    }
    const sync = () => {
      // Prefer native CSS sizing. Safari ignores interactive-widget, so only
      // compensate when a focused search has a smaller, unzoomed visual viewport.
      const bottom = catalogueBottomInset({
        layoutHeight: window.innerHeight,
        visualHeight: viewport.height,
        visualOffsetTop: viewport.offsetTop,
        scale: viewport.scale,
        searchFocused: Boolean(element.querySelector('input:focus')),
      });
      element.style.setProperty('--catalogue-bottom', `${bottom}px`);
    };
    sync();
    viewport.addEventListener('resize', sync);
    viewport.addEventListener('scroll', sync);
    window.addEventListener('resize', sync);
    element.addEventListener('focusin', sync);
    element.addEventListener('focusout', sync);
    return () => {
      viewport.removeEventListener('resize', sync);
      viewport.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
      element.removeEventListener('focusin', sync);
      element.removeEventListener('focusout', sync);
    };
  }, []);

  return ref;
}
