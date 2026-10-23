export function CaptureIcon({
  name,
}: {
  name:
    | 'camera'
    | 'library'
    | 'rotate-left'
    | 'rotate-right'
    | 'replace'
    | 'delete'
    | 'plus';
}) {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {name === 'camera' && (
        <>
          <path d="M8 6l2-3h4l2 3h4v14H4V6z" />
          <circle cx="12" cy="12" r="4" />
        </>
      )}
      {name === 'library' && (
        <>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8" cy="8" r="1" />
          <path d="m3 17 5-5 4 4 4-6 5 7" />
        </>
      )}
      {(name === 'rotate-left' || name === 'rotate-right') && (
        <g
          transform={
            name === 'rotate-right' ? 'translate(24 0) scale(-1 1)' : undefined
          }
        >
          <path d="M3 3v5h5M3.5 8A9 9 0 1 1 3 15" />
          <rect x="9" y="9" width="6" height="8" rx="1" />
        </g>
      )}
      {name === 'replace' && (
        <>
          <path d="M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4" />
        </>
      )}
      {name === 'delete' && (
        <>
          <path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7" />
        </>
      )}
      {name === 'plus' && <path d="M12 5v14M5 12h14" />}
    </svg>
  );
}
