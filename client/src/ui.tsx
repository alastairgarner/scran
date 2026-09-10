import { useEffect, useRef } from 'react';

export function Button({
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`rounded-pill bg-accent text-accent-ink inline-flex min-h-11 items-center justify-center px-4 font-semibold disabled:opacity-50 ${className}`}
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
      <span className="type-label mb-1 block font-semibold">{label}</span>
      <input
        {...props}
        ref={ref}
        className="rounded-ui border-line bg-background focus:border-accent min-h-12 w-full border-2 px-3 outline-none"
      />
      {error && (
        <span className="type-label text-danger mt-1 block">{error}</span>
      )}
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
      className={`rounded-ui border-line bg-panel shadow-card border p-4 ${className}`}
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
      className="rounded-t-sheet border-line bg-panel text-ink shadow-card backdrop:bg-ink/40 md:rounded-ui mt-auto mb-0 max-h-[85dvh] w-[min(42rem,100%)] border p-0 md:m-auto"
    >
      {children}
    </dialog>
  );
}
