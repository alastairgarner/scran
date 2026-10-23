import { useId } from 'react';

type FieldOptions = {
  label: string;
  hideLabel?: boolean;
  hint?: string;
  error?: string;
  className?: string;
};

function FieldFrame({
  id,
  label,
  hideLabel,
  hint,
  error,
  className = '',
  children,
}: FieldOptions & { id: string; children: React.ReactNode }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <label
        htmlFor={id}
        className={
          hideLabel ? 'sr-only' : 'type-label mb-2 block font-semibold'
        }
      >
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="type-label text-ink-muted mt-2">
          {hint}
        </p>
      )}
      {error && (
        <p
          id={`${id}-error`}
          className="type-label text-danger mt-2"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}

const controlClass =
  'type-control rounded-ui border-line bg-background placeholder:text-ink-muted/70 min-h-12 w-full border px-3 py-3 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger';

function description(
  id: string,
  hint?: string,
  error?: string,
  existing?: string,
) {
  return (
    [existing, hint && `${id}-hint`, error && `${id}-error`]
      .filter(Boolean)
      .join(' ') || undefined
  );
}

export function Field({
  label,
  hideLabel,
  hint,
  error,
  className,
  id,
  ...props
}: Omit<React.ComponentPropsWithRef<'input'>, 'className'> & FieldOptions) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    <FieldFrame {...{ label, hideLabel, hint, error, className }} id={fieldId}>
      <input
        {...props}
        id={fieldId}
        aria-invalid={error ? true : props['aria-invalid']}
        aria-describedby={description(
          fieldId,
          hint,
          error,
          props['aria-describedby'],
        )}
        className={controlClass}
      />
    </FieldFrame>
  );
}

export function Textarea({
  label,
  hideLabel,
  hint,
  error,
  className,
  id,
  rows = 3,
  ...props
}: Omit<React.ComponentPropsWithRef<'textarea'>, 'className'> & FieldOptions) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    <FieldFrame {...{ label, hideLabel, hint, error, className }} id={fieldId}>
      <textarea
        {...props}
        rows={rows}
        id={fieldId}
        aria-invalid={error ? true : props['aria-invalid']}
        aria-describedby={description(
          fieldId,
          hint,
          error,
          props['aria-describedby'],
        )}
        className={controlClass}
      />
    </FieldFrame>
  );
}

export function Checkbox({
  label,
  className = '',
  ...props
}: Omit<React.ComponentPropsWithRef<'input'>, 'type'> & { label: string }) {
  return (
    <label
      className={`type-control flex min-h-11 cursor-pointer items-center gap-3 ${className}`}
    >
      <input
        {...props}
        type="checkbox"
        className="accent-accent h-5 w-5 shrink-0"
      />
      <span>{label}</span>
    </label>
  );
}
