import assert from 'node:assert/strict';
import test from 'node:test';
import { configuredRoomMode } from '../../src/network/configured-room';

test('durable relay requires an explicit production flag and both public configuration values', () => {
  assert.equal(configuredRoomMode({
    VITE_SUPABASE_URL: 'https://example.supabase.co',
    VITE_SUPABASE_PUBLISHABLE_KEY: 'public-key',
  }), 'local');
  assert.equal(configuredRoomMode({ VITE_PRODUCTION_RELAY: 'true' }), 'invalid-production');
  assert.equal(configuredRoomMode({
    VITE_PRODUCTION_RELAY: 'true',
    VITE_SUPABASE_URL: 'https://example.supabase.co',
    VITE_SUPABASE_PUBLISHABLE_KEY: 'public-key',
  }), 'production');
});
