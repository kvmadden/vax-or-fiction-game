import assert from 'node:assert/strict';
import test from 'node:test';
import { configuredRoomMode } from '../../src/network/configured-room';

// The two rehearsal-transport tests that used to live here (BroadcastChannel-backed createLiveLink
// and createPhoneLink) exercised src/network/transport.ts, live-link.ts and phone-link.ts, an
// orphaned cluster with zero shipped importers. Real production relay denial is asserted in
// tests/integration/room-relay.test.mjs and production-relay-db.test.mjs (QA-NET-01, QA-NET-03).

test('production selection requires the explicit durable-relay flag and both public values', () => {
  assert.equal(configuredRoomMode({}), 'local');
  assert.equal(configuredRoomMode({ VITE_PRODUCTION_RELAY: 'true' }), 'invalid-production');
  assert.equal(configuredRoomMode({
    VITE_PRODUCTION_RELAY: 'true',
    VITE_SUPABASE_URL: 'https://example.supabase.co',
    VITE_SUPABASE_PUBLISHABLE_KEY: 'publishable-test-key',
  }), 'production');
  console.log('coverage: 3 explicit relay-selection states; production never silently selects BroadcastChannel');
});
