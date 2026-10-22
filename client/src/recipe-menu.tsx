import { useEffect, useRef } from 'react';

export function RecipeMenu({
  disabled,
  canRead,
  onEdit,
  onRead,
  onDelete,
}: {
  disabled: boolean;
  canRead: boolean;
  onEdit: () => void;
  onRead: () => void;
  onDelete: (() => void) | null;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  const close = () => {
    if (menu.current) {
      menu.current.open = false;
    }
  };

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !menu.current?.contains(event.target)
      ) {
        close();
      }
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, []);

  const run = (action: () => void) => {
    close();
    action();
  };

  return (
    <details
      ref={menu}
      className="relative"
      onKeyDown={event => {
        if (event.key === 'Escape') {
          close();
          menu.current?.querySelector('summary')?.focus();
        }
      }}
    >
      <summary
        aria-label="Recipe options"
        className="text-ink-muted rounded-pill flex h-11 w-11 cursor-pointer list-none items-center justify-center [&::-webkit-details-marker]:hidden"
      >
        <span aria-hidden="true" className="type-title">
          ⋯
        </span>
      </summary>
      <div className="rounded-ui border-line bg-panel shadow-card absolute right-0 z-30 mt-1 w-56 border p-1">
        <button
          type="button"
          disabled={disabled}
          onClick={() => run(onEdit)}
          className="hover:bg-background block min-h-11 w-full px-4 text-left disabled:opacity-50"
        >
          Edit
        </button>
        <button
          type="button"
          disabled={disabled || !canRead}
          title={canRead ? undefined : 'This recipe has no saved source'}
          onClick={() => run(onRead)}
          className="hover:bg-background block min-h-11 w-full px-4 text-left disabled:opacity-50"
        >
          Read source again
        </button>
        {onDelete && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => run(onDelete)}
            className="text-danger border-line hover:bg-background mt-1 block min-h-11 w-full border-t px-4 text-left disabled:opacity-50"
          >
            Delete
          </button>
        )}
      </div>
    </details>
  );
}
