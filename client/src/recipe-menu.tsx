import { useEffect, useRef } from 'react';

import { Button } from './ui';

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
        <Button
          variant="quiet"
          className="w-full justify-start"
          disabled={disabled}
          onClick={() => run(onEdit)}
        >
          Edit
        </Button>
        <Button
          variant="quiet"
          className="w-full justify-start"
          disabled={disabled || !canRead}
          title={canRead ? undefined : 'This recipe has no saved source'}
          onClick={() => run(onRead)}
        >
          Read source again
        </Button>
        {onDelete && (
          <Button
            variant="destructive"
            disabled={disabled}
            onClick={() => run(onDelete)}
            className="mt-1 w-full justify-start"
          >
            Delete
          </Button>
        )}
      </div>
    </details>
  );
}
