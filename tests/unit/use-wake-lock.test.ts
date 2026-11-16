import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useWakeLock, type UseWakeLockOptions, type UseWakeLockResult } from '../../src/phone/useWakeLock';

function readHook(options: UseWakeLockOptions = {}): UseWakeLockResult {
  let result: UseWakeLockResult | undefined;

  function Probe() {
    result = useWakeLock(options);
    return null;
  }

  renderToStaticMarkup(React.createElement(Probe));
  assert.ok(result, 'the hook should render');
  return result;
}

async function withNavigator<T>(navigatorValue: object, run: () => Promise<T>): Promise<T> {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: navigatorValue,
  });

  try {
    return await run();
  } finally {
    if (original) {
      Object.defineProperty(globalThis, 'navigator', original);
    } else {
      Reflect.deleteProperty(globalThis, 'navigator');
    }
  }
}

function makeSentinel() {
  const releaseListeners: Array<() => void> = [];
  const sentinel = {
    released: false,
    addEventListener(event: string, callback: () => void) {
      if (event === 'release') releaseListeners.push(callback);
    },
    async release() {
      sentinel.released = true;
      for (const listener of releaseListeners) listener();
    },
  };
  return sentinel;
}

test('wake lock reports unsupported browsers and refuses a request safely', async () => {
  await withNavigator({}, async () => {
    const wakeLock = readHook();
    assert.equal(wakeLock.isSupported, false);
    assert.equal(wakeLock.isActive, false);
    assert.equal(wakeLock.error, null);
    assert.equal(await wakeLock.request(), false);
    await wakeLock.release();
  });
});

test('request uses a screen sentinel only once until it is released', async () => {
  const requestedTypes: string[] = [];
  const sentinel = makeSentinel();
  let successes = 0;

  await withNavigator({
    wakeLock: {
      async request(type: string) {
        requestedTypes.push(type);
        return sentinel;
      },
    },
  }, async () => {
    const wakeLock = readHook({ onRequestSuccess: () => { successes += 1; } });
    assert.equal(wakeLock.isSupported, true);
    assert.equal(await wakeLock.request(), true);
    assert.equal(await wakeLock.request(), true, 'an active sentinel should be reused');
    assert.deepEqual(requestedTypes, ['screen']);
    assert.equal(successes, 1);

    await wakeLock.release();
    assert.equal(sentinel.released, true);
  });
});

test('a denied wake lock request returns false and reports the actual error', async () => {
  const denial = new Error('Wake lock denied');
  let reported: Error | undefined;

  await withNavigator({
    wakeLock: { async request() { throw denial; } },
  }, async () => {
    const wakeLock = readHook({ onRequestError: (error) => { reported = error; } });
    assert.equal(await wakeLock.request(), false);
    assert.equal(reported, denial);
  });
});

test('a browser release notifies the caller and allows a fresh screen request', async () => {
  const first = makeSentinel();
  const second = makeSentinel();
  const sentinels = [first, second];
  let calls = 0;
  let released = 0;

  await withNavigator({
    wakeLock: {
      async request(type: string) {
        assert.equal(type, 'screen');
        const sentinel = sentinels[calls];
        calls += 1;
        assert.ok(sentinel, 'no unexpected third request');
        return sentinel;
      },
    },
  }, async () => {
    const wakeLock = readHook({ onRelease: () => { released += 1; } });
    assert.equal(await wakeLock.request(), true);
    await first.release();
    assert.equal(released, 1);

    assert.equal(await wakeLock.request(), true);
    assert.equal(calls, 2);
    await wakeLock.release();
    assert.equal(second.released, true);
    assert.equal(released, 2);
  });
});
