// Recap privacy lockdown (2026-09-27): listArchivedGames used to fetch straight off the
// vrc_recaps table with the anon key and never touched the admin's signed-in session at all,
// which is exactly the list-all-recaps read supabase/migrations/20260927160000_vof_recap_privacy_
// lockdown.sql closes. It now calls the security-definer public.vrc_list_recaps RPC and must pass
// the admin's real accessToken as the Authorization bearer, since the RPC checks that token's JWT
// email server-side. This is that client-side half, tested against a fake REST endpoint.
import assert from 'node:assert/strict';
import http from 'node:http';
import { afterEach, test } from 'node:test';
import { ArchiveAccessError, listArchivedGames } from '../../src/network/game-archive';

const originalUrl = process.env.VITE_SUPABASE_URL;
const originalKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

afterEach(() => {
  if (originalUrl === undefined) delete process.env.VITE_SUPABASE_URL;
  else process.env.VITE_SUPABASE_URL = originalUrl;
  if (originalKey === undefined) delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  else process.env.VITE_SUPABASE_PUBLISHABLE_KEY = originalKey;
});

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => resolve((server.address() as { port: number }).port));
    server.once('error', reject);
  });
}

async function readBody(request: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

test('listArchivedGames calls the vrc_list_recaps RPC (not the raw table) with the accessToken as the bearer', async () => {
  const requests: Array<{ method?: string; url?: string; headers: http.IncomingHttpHeaders; body: string }> = [];
  const server = http.createServer(async (request, response) => {
    const body = await readBody(request);
    requests.push({ method: request.method, url: request.url, headers: request.headers, body });
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify([
      { room: 'aaaaaa', deck_id: 'vax-or-fiction', recap: { room: 'aaaaaa', deckId: 'vax-or-fiction', standings: [], outcomes: [] }, created_at: new Date(Date.now() - 864e5).toISOString(), expires_at: new Date(Date.now() + 30 * 864e5).toISOString() },
    ]));
  });
  const port = await listen(server);
  process.env.VITE_SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'test-anon-key';

  try {
    const rows = await listArchivedGames('test-admin-access-token', 40);

    assert.equal(requests.length, 1);
    const [seen] = requests;
    assert.equal(seen.method, 'POST');
    assert.equal(seen.url, '/rest/v1/rpc/vrc_list_recaps');
    assert.equal(seen.headers.apikey, 'test-anon-key', 'apikey stays the publishable key, per Supabase convention');
    assert.equal(seen.headers.authorization, 'Bearer test-admin-access-token', 'the admin session token rides as the bearer, not the anon key');
    assert.deepEqual(JSON.parse(seen.body), { p_deck_id: 'vax-or-fiction', p_limit: 40 });

    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.room, 'aaaaaa');
  } finally {
    server.close();
  }
});

// A non-OK response used to fall through to a plain `return []`, which meant a real refusal
// looked exactly like "no games saved" and a mutant that swallowed the throw stayed GREEN
//. listArchivedGames must throw, and the shape of what it
// throws must let the caller tell an expired session apart from a real refusal and a server error.
async function nonOkCase(status: number) {
  const server = http.createServer((_request, response) => {
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ message: 'refused' }));
  });
  const port = await listen(server);
  process.env.VITE_SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'test-anon-key';
  try {
    await assert.rejects(() => listArchivedGames('test-admin-access-token', 40), (error: unknown) => {
      assert.ok(error instanceof ArchiveAccessError, `expected an ArchiveAccessError, got ${String(error)}`);
      assert.equal((error as ArchiveAccessError).status, status);
      return true;
    });
  } finally {
    server.close();
  }
}

test('listArchivedGames throws on a 401 (expired or unverifiable token), not a silent empty list', async () => {
  await nonOkCase(401);
});

test('listArchivedGames throws on a 403 (a real refusal from vrc_list_recaps), not a silent empty list', async () => {
  await nonOkCase(403);
});

test('listArchivedGames throws on a 500 (server error), not a silent empty list', async () => {
  await nonOkCase(500);
});

test('listArchivedGames never calls the network without a real accessToken', async () => {
  const requests: unknown[] = [];
  const server = http.createServer((_request, response) => {
    requests.push(1);
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end('[]');
  });
  const port = await listen(server);
  process.env.VITE_SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'test-anon-key';

  try {
    const rows = await listArchivedGames('', 40);
    assert.deepEqual(rows, []);
    assert.equal(requests.length, 0, 'no request is made with an empty accessToken, so an anon caller with no session gets nothing, not even a rejected request');
  } finally {
    server.close();
  }
});
