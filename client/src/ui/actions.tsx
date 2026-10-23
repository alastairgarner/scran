import { Link, type LinkProps } from 'react-router';

type ActionStyle = {
  variant?: 'primary' | 'secondary' | 'quiet' | 'destructive';
  size?: 'regular' | 'compact';
};

const variants = {
  primary: 'bg-accent text-accent-ink border-transparent hover:bg-accent/90',
  secondary: 'border-line bg-background text-ink hover:bg-panel',
  quiet: 'border-transparent text-ink-muted hover:bg-panel hover:text-ink',
  destructive: 'border-danger/30 bg-background text-danger hover:bg-danger/10',
};

function actionClass({ variant = 'primary', size = 'regular' }: ActionStyle) {
  return `type-control rounded-ui inline-flex shrink-0 items-center justify-center gap-2 border font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${size === 'compact' ? 'min-h-11 px-3' : 'min-h-12 px-4'}`;
}

export function Button({
  variant,
  size,
  loading = false,
  type = 'button',
  className = '',
  disabled,
  ...props
}: React.ComponentPropsWithRef<'button'> &
  ActionStyle & { loading?: boolean }) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${actionClass({ variant, size })} ${className}`}
    />
  );
}

export function ButtonLink({
  variant,
  size,
  className = '',
  ...props
}: Omit<LinkProps, 'className'> & ActionStyle & { className?: string }) {
  return (
    <Link
      {...props}
      className={`${actionClass({ variant, size })} ${className}`}
    />
  );
}
