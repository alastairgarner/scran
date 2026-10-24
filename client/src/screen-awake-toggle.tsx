import { useEffect, useId, useState } from 'react';

import { keepScreenAwake, type AwakeStatus } from './screen-awake';
import { Button } from './ui';

const preferenceKey = 'scran.keep-screen-awake';

function savedPreference() {
  try {
    return localStorage.getItem(preferenceKey) === 'true';
  } catch {
    return false;
  }
}

export function ScreenAwakeToggle() {
  const [enabled, setEnabled] = useState(savedPreference);
  const [showUnsupported, setShowUnsupported] = useState(false);
  const [status, setStatus] = useState<AwakeStatus>('requesting');
  const descriptionId = useId();
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  const active = enabled && supported && status === 'active';

  useEffect(() => {
    if (!enabled || !supported) {
      return;
    }
    return keepScreenAwake({
      wakeLock: navigator.wakeLock,
      page: document,
      onStatus: setStatus,
    });
  }, [enabled, supported]);

  let message = 'Keep screen awake';
  if (!supported) {
    message = 'Keeping the screen awake is not supported in this browser.';
  } else if (enabled) {
    if (status === 'active') {
      message = 'Screen staying awake. Allow screen to sleep';
    } else if (status === 'requesting') {
      message = 'Keeping screen awake…';
    } else {
      message = 'Screen may sleep. Turn off and on to try again.';
    }
  }
  const unavailable =
    !supported || (enabled && (status === 'error' || status === 'released'));

  return (
    <div className="relative">
      <Button
        variant="quiet"
        size="compact"
        className={active ? 'bg-selection text-ink w-11' : 'w-11'}
        aria-label="Keep screen awake"
        aria-pressed={enabled && supported}
        aria-disabled={!supported}
        aria-describedby={descriptionId}
        title={message}
        onClick={() => {
          if (!supported) {
            setShowUnsupported(value => !value);
            return;
          }
          const next = !enabled;
          setStatus('requesting');
          setEnabled(next);
          try {
            localStorage.setItem(preferenceKey, String(next));
          } catch {
            // Storage can be blocked; the current session still works.
          }
        }}
      >
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
          {active ? (
            <>
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
              <circle cx="12" cy="12" r="3" />
            </>
          ) : (
            <path d="M3 9c2 3 5 5 9 5s7-2 9-5M5 12l-2 3m5-1-1 3m5-3v4m4-4 1 3m2-5 2 3" />
          )}
        </svg>
        {unavailable && (
          <span
            aria-hidden="true"
            className="bg-background text-ink-muted type-label absolute top-0 right-0 rounded-full px-1"
          >
            !
          </span>
        )}
      </Button>
      <span
        id={descriptionId}
        role="status"
        className={
          unavailable && (supported || showUnsupported)
            ? 'type-label text-ink-muted bg-panel border-line rounded-ui absolute right-0 z-20 mt-1 w-56 border p-3'
            : 'sr-only'
        }
      >
        {message}
      </span>
    </div>
  );
}
