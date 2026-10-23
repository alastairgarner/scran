import { useEffect, useId, useRef } from 'react';

import { Button } from './actions';

export function Dialog({
  open,
  title,
  onClose,
  children,
  actions,
  footer,
  busy = false,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-busy={busy || undefined}
      onClose={onClose}
      onCancel={event => {
        event.preventDefault();
        if (!busy) {
          onClose();
        }
      }}
      className="rounded-t-sheet border-line bg-background text-ink backdrop:bg-ink/40 md:rounded-ui fixed inset-x-0 top-auto bottom-0 m-0 max-h-[85dvh] w-full max-w-none overflow-hidden border p-0 md:inset-0 md:m-auto md:max-w-xl"
    >
      <div className="modal-safe flex max-h-[calc(85dvh-2px)] flex-col">
        <header className="border-line flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-6 py-4">
          <h2 id={titleId} className="type-heading font-semibold">
            {title}
          </h2>
          <div className="ml-auto flex items-center gap-2">
            {actions}
            <Button
              variant="quiet"
              size="compact"
              aria-label="Close dialog"
              disabled={busy}
              onClick={onClose}
            >
              Close
            </Button>
          </div>
        </header>
        <div className="type-control min-h-0 space-y-4 overflow-y-auto overscroll-contain p-6">
          {children}
        </div>
        {footer && (
          <footer className="border-line flex shrink-0 flex-wrap justify-end gap-3 border-t px-6 py-4">
            {footer}
          </footer>
        )}
      </div>
    </dialog>
  );
}
