import { expect, it } from 'bun:test';

import { keepScreenAwake, type AwakeStatus } from './screen-awake';

// The OS/browser API is the boundary; use real EventTargets for its events.
class TestLock extends EventTarget {
  released = false;
  releases = 0;
  readonly type = 'screen';
  onrelease = null;
  async release() {
    this.releases++;
    this.released = true;
    this.dispatchEvent(new Event('release'));
  }
}

class TestPage extends EventTarget {
  visibilityState: DocumentVisibilityState = 'visible';
  visibility(value: DocumentVisibilityState) {
    this.visibilityState = value;
    this.dispatchEvent(new Event('visibilitychange'));
  }
}

const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

it('acquires, releases while hidden, reacquires when visible, and cleans up', async () => {
  const page = new TestPage();
  const locks: TestLock[] = [];
  const states: AwakeStatus[] = [];
  const stop = keepScreenAwake({
    page,
    wakeLock: {
      request: async () => {
        const lock = new TestLock();
        locks.push(lock);
        return lock;
      },
    },
    onStatus: state => states.push(state),
  });
  await settle();
  expect(states.at(-1)).toBe('active');
  page.visibility('hidden');
  expect(locks[0].releases).toBe(1);
  expect(states.at(-1)).toBe('released');
  page.visibility('visible');
  await settle();
  expect(locks).toHaveLength(2);
  expect(states.at(-1)).toBe('active');
  stop();
  expect(locks[1].releases).toBe(1);
  page.visibility('visible');
  expect(locks).toHaveLength(2);
});

it('releases a request that completes after disabling or unmounting', async () => {
  const lock = new TestLock();
  let resolve: (lock: WakeLockSentinel) => void = () => {};
  const pending = new Promise<WakeLockSentinel>(done => {
    resolve = done;
  });
  const states: AwakeStatus[] = [];
  const stop = keepScreenAwake({
    page: new TestPage(),
    wakeLock: { request: () => pending },
    onStatus: state => states.push(state),
  });
  stop();
  resolve(lock);
  await settle();
  expect(lock.releases).toBe(1);
  expect(states).toEqual(['requesting']);
});

it('does not let an older pending request replace a newer visible session', async () => {
  const page = new TestPage();
  const old = new TestLock();
  const latest = new TestLock();
  let resolve: (lock: WakeLockSentinel) => void = () => {};
  let calls = 0;
  const pending = new Promise<WakeLockSentinel>(done => {
    resolve = done;
  });
  const states: AwakeStatus[] = [];
  const stop = keepScreenAwake({
    page,
    wakeLock: {
      request: () => (++calls === 1 ? pending : Promise.resolve(latest)),
    },
    onStatus: state => states.push(state),
  });
  page.visibility('hidden');
  page.visibility('visible');
  await settle();
  resolve(old);
  await settle();
  expect(old.releases).toBe(1);
  expect(latest.releases).toBe(0);
  expect(states.at(-1)).toBe('active');
  stop();
});

it('reports refusal and unexpected OS release honestly without retry loops', async () => {
  const page = new TestPage();
  const states: AwakeStatus[] = [];
  const stop = keepScreenAwake({
    page,
    wakeLock: {
      request: async () => {
        throw new Error('NotAllowedError');
      },
    },
    onStatus: state => states.push(state),
  });
  await settle();
  expect(states.at(-1)).toBe('error');
  stop();

  const lock = new TestLock();
  const stopNext = keepScreenAwake({
    page,
    wakeLock: { request: async () => lock },
    onStatus: state => states.push(state),
  });
  await settle();
  await lock.release();
  expect(states.at(-1)).toBe('released');
  stopNext();
});

it('does not request while the page is already hidden', () => {
  const page = new TestPage();
  page.visibilityState = 'hidden';
  let calls = 0;
  const stop = keepScreenAwake({
    page,
    wakeLock: {
      request: async () => {
        calls++;
        return new TestLock();
      },
    },
    onStatus: () => {},
  });
  expect(calls).toBe(0);
  stop();
});
