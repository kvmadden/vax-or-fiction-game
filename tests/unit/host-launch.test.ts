import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hostLaunchFromLocation,
  hostLaunchFromSearch,
  hostLaunchPrefersAudibleWalkin,
  resolveHostLaunchParameters,
  shouldAutoOpenPresenterPairing,
} from '../../src/presentation/host-launch';
import { ROOM_CURATED15_TIMER_SECONDS } from '../../src/network/presenter-remote';

const CURATED15_ROOM = {
  type: 'APPLY_PRESET',
  presetId: 'curated15',
  venue: 'room',
  timerSeconds: ROOM_CURATED15_TIMER_SECONDS,
} as const;

const CURATED8_ROOM = {
  type: 'APPLY_PRESET',
  presetId: 'curated8',
  venue: 'room',
  timerSeconds: ROOM_CURATED15_TIMER_SECONDS,
} as const;

test('one-click host URLs apply Curated 8 in the room by default', () => {
  assert.deepEqual(hostLaunchFromSearch('?preset=curated8'), CURATED8_ROOM);
  assert.deepEqual(hostLaunchFromSearch('preset=curated8'), CURATED8_ROOM);
  assert.deepEqual(hostLaunchFromSearch('?mode=curated8'), CURATED8_ROOM);
  assert.deepEqual(hostLaunchFromSearch('?preset=curated8-room'), CURATED8_ROOM);
  assert.deepEqual(hostLaunchFromSearch('?preset=curated8&venue=room'), CURATED8_ROOM);
  assert.deepEqual(hostLaunchFromSearch('?preset=curated8&venue=teams'), {
    type: 'APPLY_PRESET',
    presetId: 'curated8',
    venue: 'teams',
  });
  assert.deepEqual(resolveHostLaunchParameters('?preset=curated8'), CURATED8_ROOM);
  assert.deepEqual(resolveHostLaunchParameters('?preset=curated8-room'), CURATED8_ROOM);
  assert.equal(resolveHostLaunchParameters('?preset=curated8')?.presetId, 'curated8');
  assert.equal(resolveHostLaunchParameters('?preset=curated8-room')?.presetId, 'curated8');
});

test('one-click host URLs apply Curated 15 in the room by default', () => {
  assert.deepEqual(hostLaunchFromSearch('?preset=curated15'), CURATED15_ROOM);
  assert.deepEqual(hostLaunchFromSearch('preset=curated15'), CURATED15_ROOM);
  assert.deepEqual(hostLaunchFromSearch('?mode=curated15'), CURATED15_ROOM);
  assert.deepEqual(hostLaunchFromSearch('?preset=curated15-room'), CURATED15_ROOM);
  assert.deepEqual(hostLaunchFromSearch('?preset=curated15&venue=room'), CURATED15_ROOM);
  assert.deepEqual(hostLaunchFromSearch('?preset=curated15&venue=teams'), {
    type: 'APPLY_PRESET',
    presetId: 'curated15',
    venue: 'teams',
  });
  assert.deepEqual(hostLaunchFromSearch('?preset=huddle&mode=demo'), { type: 'APPLY_PRESET', presetId: 'huddle' });
  assert.deepEqual(hostLaunchFromSearch('?mode=demo'), { type: 'SELECT_MODE', modeId: 'demo' });
  assert.equal(hostLaunchFromSearch(''), null);
  assert.equal(hostLaunchFromSearch('?preset=unknown'), null);
});

test('in-room launches prefer audible walk-in, Teams and Offline stay muted', () => {
  assert.equal(hostLaunchPrefersAudibleWalkin('?preset=curated8'), true);
  assert.equal(hostLaunchPrefersAudibleWalkin('?preset=curated8&venue=room'), true);
  assert.equal(hostLaunchPrefersAudibleWalkin('?preset=curated8-room'), true);
  assert.equal(hostLaunchPrefersAudibleWalkin('?preset=curated8&venue=teams'), false);
  assert.equal(hostLaunchPrefersAudibleWalkin('?preset=curated8&venue=offline'), false);
  assert.equal(hostLaunchPrefersAudibleWalkin('?preset=curated15'), true);
  assert.equal(hostLaunchPrefersAudibleWalkin('?preset=curated15&venue=room'), true);
  assert.equal(hostLaunchPrefersAudibleWalkin('?preset=curated15-room'), true);
  assert.equal(hostLaunchPrefersAudibleWalkin('?venue=room'), true);
  assert.equal(hostLaunchPrefersAudibleWalkin('?preset=curated15&venue=teams'), false);
  assert.equal(hostLaunchPrefersAudibleWalkin('?preset=curated15&venue=offline'), false);
  assert.equal(hostLaunchPrefersAudibleWalkin('?preset=huddle'), false);
  assert.equal(hostLaunchPrefersAudibleWalkin(''), false);
});

test('FAC-10: only a launch that lands in the room auto-opens the private pairing QR', () => {
  assert.equal(shouldAutoOpenPresenterPairing(null), false);
  assert.equal(shouldAutoOpenPresenterPairing(hostLaunchFromSearch('?preset=curated15')), true, 'no venue defaults to room');
  assert.equal(shouldAutoOpenPresenterPairing(hostLaunchFromSearch('?preset=curated15&venue=room')), true);
  assert.equal(shouldAutoOpenPresenterPairing(hostLaunchFromSearch('?preset=curated8&venue=room')), true);
  assert.equal(shouldAutoOpenPresenterPairing(hostLaunchFromSearch('?mode=curated15')), true, 'a bare mode= also defaults to room');
  // The defect: a Teams (or Offline) show must never auto-open a QR anyone watching the share could scan.
  assert.equal(shouldAutoOpenPresenterPairing(hostLaunchFromSearch('?preset=curated15&venue=teams')), false);
  assert.equal(shouldAutoOpenPresenterPairing(hostLaunchFromSearch('?preset=curated15&venue=offline')), false);
  assert.equal(shouldAutoOpenPresenterPairing(hostLaunchFromSearch('?mode=curated15&venue=teams')), false);
  assert.equal(shouldAutoOpenPresenterPairing(hostLaunchFromSearch('?preset=curated8&venue=teams')), false);
  assert.equal(shouldAutoOpenPresenterPairing(hostLaunchFromSearch('?mode=demo')), false, 'a plain mode select carries no venue');
  assert.equal(shouldAutoOpenPresenterPairing(hostLaunchFromLocation('?preset=curated15')), true, 'the location launch matches the query launch');
  assert.equal(hostLaunchFromLocation(''), null);
});
