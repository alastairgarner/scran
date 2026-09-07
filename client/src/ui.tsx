import { useEffect, useRef } from 'react';

export function Button({
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`min-h-11 rounded-pill bg-accent px-4 py-2 font-semibold text-accent-ink disabled:opacity-50 ${className}`}
    />
  );
}

type FieldProps = React.ComponentPropsWithRef<'input'> & {
  label: string;
  error?: string;
};

export function Field({ label, error, ref, ...props }: FieldProps) {
  return (
    <label className="block">
      <span className="mb-1 block font-semibold text-sm">{label}</span>
      <input
        {...props}
        ref={ref}
        className="min-h-12 w-full rounded-ui border-2 border-line bg-surface px-3 outline-none focus:border-accent"
      />
      {error && <span className="mt-1 block text-sm text-veto">{error}</span>}
    </label>
  );
}

export function Card({
  className = '',
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={`rounded-ui border border-line bg-raised p-4 shadow-card ${className}`}
    />
  );
}

export function Modal({
  open,
  label,
  onClose,
  children,
}: {
  open: boolean;
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

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
      aria-label={label}
      onClose={onClose}
      onCancel={onClose}
      className="mt-auto mb-0 max-h-[85dvh] w-[min(42rem,100%)] rounded-t-[1.5rem] border border-line bg-raised p-0 text-ink shadow-card backdrop:bg-ink/40 md:m-auto md:rounded-ui"
    >
      {children}
    </dialog>
  );
}
