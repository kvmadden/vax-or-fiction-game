import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

// RELAY6: the two anonymous room-creation budget rejections are written out separately in the SQL
// migration (supabase/migrations/20260926140000_..._anonymous_room_budget.sql) and in the client
// adapter (src/network/production-room.ts, NETWORK_ROOM_CAP_REASON and
// GLOBAL_CREATION_RATE_REASON). production-relay-client.test.ts proves the CLIENT behaves
// correctly given one of these exact strings from a fake relay, but nothing proved the two source
// texts stay identical. If they ever drift apart, the client's own known-reason match in
// production-room.ts silently fails and the host sees the generic "Relay did not complete
// registration" message instead of the relay's real, actionable reason. This test extracts both
// texts from their real source files (never a hand-copied literal) and asserts they are exactly
// equal, so a future edit to either side that is not mirrored in the other fails here.
const migrationPath = new URL(
  '../../supabase/migrations/20260926140000_vax_or_fiction_production_relay_anonymous_room_budget.sql',
  import.meta.url,
);
const clientPath = new URL('../../src/network/production-room.ts', import.meta.url);

const migrationSource = fs.readFileSync(migrationPath, 'utf8');
const clientSource = fs.readFileSync(clientPath, 'utf8');

function sqlErrorResponse(source: string, marker: string): string {
  const matches = [...source.matchAll(/error_response\('([^']*)'\)/g)].map((match) => match[1]);
  const found = matches.filter((text) => text.includes(marker));
  assert.equal(found.length, 1, `expected exactly one error_response(...) text containing "${marker}" in the migration file, found ${found.length}`);
  return found[0];
}

function clientConstant(source: string, name: string): string {
  const match = source.match(new RegExp(`const ${name} = '([^']*)';`));
  assert.ok(match, `expected to find "const ${name} = '...'" in ${clientPath.pathname}`);
  return match![1];
}

test('the per-network open-room cap message is identical in the migration SQL and the client adapter', () => {
  const sqlText = sqlErrorResponse(migrationSource, 'already has 20 open games');
  const clientText = clientConstant(clientSource, 'NETWORK_ROOM_CAP_REASON');
  assert.equal(clientText, sqlText, 'NETWORK_ROOM_CAP_REASON in production-room.ts must be byte-identical to the SQL migration\'s own text');
});

test('the global creation-rate budget message is identical in the migration SQL and the client adapter', () => {
  const sqlText = sqlErrorResponse(migrationSource, 'creating rooms too quickly');
  const clientText = clientConstant(clientSource, 'GLOBAL_CREATION_RATE_REASON');
  assert.equal(clientText, sqlText, 'GLOBAL_CREATION_RATE_REASON in production-room.ts must be byte-identical to the SQL migration\'s own text');
});
