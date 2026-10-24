export type AwakeStatus = 'requesting' | 'active' | 'released' | 'error';

// One session per mounted, enabled recipe control. Late requests must never
// leave a lock alive after navigation, disabling, or a visibility change.
export function keepScreenAwake({
  wakeLock,
  page,
  onStatus,
}: {
  wakeLock: Pick<WakeLock, 'request'>;
  page: Pick<
    Document,
    'visibilityState' | 'addEventListener' | 'removeEventListener'
  >;
  onStatus: (status: AwakeStatus) => void;
}) {
  let stopped = false;
  let generation = 0;
  let current: WakeLockSentinel | null = null;

  const release = (lock: WakeLockSentinel) => {
    void lock.release().catch(() => {
      if (!stopped) {
        onStatus('error');
      }
    });
  };

  const update = async () => {
    const requestGeneration = ++generation;
    if (current) {
      const previous = current;
      current = null;
      release(previous);
    }
    if (page.visibilityState !== 'visible') {
      onStatus('released');
      return;
    }
    onStatus('requesting');
    try {
      const lock = await wakeLock.request('screen');
      if (
        stopped ||
        requestGeneration !== generation ||
        page.visibilityState !== 'visible'
      ) {
        release(lock);
        return;
      }
      current = lock;
      lock.addEventListener(
        'release',
        () => {
          if (current !== lock) {
            return;
          }
          current = null;
          onStatus('released');
        },
        { once: true },
      );
      onStatus(lock.released ? 'released' : 'active');
    } catch {
      if (!stopped && requestGeneration === generation) {
        onStatus('error');
      }
    }
  };

  const visibilityChanged = () => {
    void update();
  };
  page.addEventListener('visibilitychange', visibilityChanged);
  void update();
  return () => {
    stopped = true;
    ++generation;
    page.removeEventListener('visibilitychange', visibilityChanged);
    if (current) {
      const previous = current;
      current = null;
      release(previous);
    }
  };
}
