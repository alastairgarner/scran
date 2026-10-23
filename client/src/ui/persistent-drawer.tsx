import { useId, useRef } from 'react';

export function PersistentDrawer({
  title,
  summary,
  open,
  onOpenChange,
  children,
}: {
  title: string;
  summary?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const contentId = useId();
  const titleId = useId();
  const toggle = useRef<HTMLButtonElement>(null);

  return (
    <section
      className="persistent-drawer"
      data-open={open}
      aria-labelledby={titleId}
      onKeyDown={event => {
        // This drawer is deliberately non-modal; never trap focus or lock the page.
        if (
          event.key === 'Escape' &&
          open &&
          window.matchMedia('(width < 64rem)').matches
        ) {
          event.stopPropagation();
          onOpenChange(false);
          toggle.current?.focus();
        }
      }}
    >
      <button
        ref={toggle}
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => onOpenChange(!open)}
        className="drawer-toggle w-full px-6 py-3 text-left lg:hidden"
      >
        <span
          aria-hidden="true"
          className="rounded-pill bg-line mx-auto mb-2 block h-1 w-10"
        />
        <span className="flex items-center gap-3">
          <span className="type-heading font-semibold">{title}</span>
          {summary && (
            <span className="type-label text-ink-muted">{summary}</span>
          )}
          <span aria-hidden="true" className="text-ink-muted ml-auto">
            {open ? '⌄' : '⌃'}
          </span>
        </span>
      </button>
      <div id={contentId} className="drawer-content">
        <h2
          id={titleId}
          className="type-heading mb-6 hidden font-semibold lg:block"
        >
          {title}
        </h2>
        {children}
      </div>
    </section>
  );
}
