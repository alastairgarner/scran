type ChipProps = {
  children: React.ReactNode;
  disabled?: boolean;
} & (
  | { kind: 'choice'; selected: boolean; onClick: () => void }
  | { kind: 'removable'; removeLabel: string; onRemove: () => void }
);

export function ChoiceChip(props: ChipProps) {
  const selected = props.kind === 'removable' || props.selected;
  return (
    <button
      type="button"
      disabled={props.disabled}
      aria-pressed={props.kind === 'choice' ? props.selected : undefined}
      aria-label={props.kind === 'removable' ? props.removeLabel : undefined}
      onClick={props.kind === 'removable' ? props.onRemove : props.onClick}
      className={`type-label rounded-pill inline-flex min-h-11 shrink-0 items-center justify-center gap-2 border px-3 py-2 transition-colors disabled:opacity-50 ${selected ? 'border-selection-line bg-selection text-ink' : 'border-line text-ink-muted hover:bg-panel'}`}
    >
      {props.children}
      {props.kind === 'removable' && <span aria-hidden="true">×</span>}
    </button>
  );
}
