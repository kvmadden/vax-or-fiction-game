import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

// src/network/transport.ts, live-link.ts and phone-link.ts formed an orphaned cluster with zero
// shipped importers: only each other, tests/unit/phone-network-transport.test.ts (which existed
// only to test them and is deleted alongside them), and two of the three tests in
// tests/security_robustness/test_broadcast_validation.ts (trimmed to keep its one live test of
// configuredRoomMode). The real host relay path is host-live-link.ts / configured-room.ts, and the
// real phone path is usePhoneLink.ts / configured-room.ts (QA-NET-01, QA-NET-03).
const DEAD_CLUSTER_PATHS = [
  'src/network/transport.ts',
  'src/network/live-link.ts',
  'src/network/phone-link.ts',
];

test('the orphaned network transport cluster stays deleted (QA-NET-01, QA-NET-03)', () => {
  for (const relativePath of DEAD_CLUSTER_PATHS) {
    const absolute = path.resolve(process.cwd(), relativePath);
    assert.equal(fs.existsSync(absolute), false, `${relativePath} must not come back`);
  }
});

test('control: the same existence check can see a file that is genuinely still there', () => {
  const stillLive = path.resolve(process.cwd(), 'src/network/host-live-link.ts');
  assert.equal(fs.existsSync(stillLive), true, 'the real host relay module must exist so this check is not vacuous');
});
