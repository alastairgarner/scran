export function Feedback({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'error';
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`type-label rounded-ui p-4 ${tone === 'error' ? 'bg-danger/10 text-danger' : 'bg-panel text-ink-muted'}`}
    >
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  actions,
  tone = 'neutral',
}: {
  title: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  tone?: 'neutral' | 'error';
}) {
  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-12 text-center">
      <h2
        className={`type-heading font-semibold ${tone === 'error' ? 'text-danger' : 'text-ink'}`}
      >
        {title}
      </h2>
      {children && (
        <div className="type-control text-ink-muted space-y-4">{children}</div>
      )}
      {actions && (
        <div className="flex flex-wrap justify-center gap-2">{actions}</div>
      )}
    </div>
  );
}
