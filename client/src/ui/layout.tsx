import { useId } from 'react';

export function PageHeader({
  title,
  back,
  actions,
  description,
  sticky = false,
}: {
  title: string;
  back?: React.ReactNode;
  actions?: React.ReactNode;
  description?: React.ReactNode;
  sticky?: boolean;
}) {
  return (
    <header
      className={`py-4 ${sticky ? 'bg-background sticky top-0 z-10' : ''}`}
    >
      {back && <div className="mb-2">{back}</div>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="type-title min-w-0 font-bold">{title}</h1>
        {actions && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
      </div>
      {description && (
        <div className="type-label text-ink-muted mt-2">{description}</div>
      )}
    </header>
  );
}

export function Section({
  title,
  children,
  description,
  actions,
  reading = false,
}: {
  title: string;
  children: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  reading?: boolean;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={reading ? 'mt-12' : 'space-y-4'}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2
          id={id}
          className={
            reading
              ? 'type-label text-ink-muted font-semibold'
              : 'type-heading font-semibold'
          }
        >
          {title}
        </h2>
        {actions}
      </div>
      {description && (
        <p className="type-label text-ink-muted mb-3">{description}</p>
      )}
      {children}
    </section>
  );
}

export function Card({
  className = '',
  ...props
}: React.ComponentPropsWithRef<'div'>) {
  return (
    <div
      {...props}
      className={`rounded-ui border-line bg-panel border p-6 ${className}`}
    />
  );
}
