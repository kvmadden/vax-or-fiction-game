// The production relay's own SQL in a throwaway local Postgres 17, served over HTTP the way the site's Supabase serves
// public.vof_relay_exchange, so the real relay clients (src/network/production-room.ts) can run against it with the
// production order of events: one exchange at a time per room, inbox messages delivered on the host's next exchange.
// It never touches a remote database. Needs initdb, pg_ctl and psql from POSTGRES_BIN (default Homebrew postgresql@17).
import { execFile, execFileSync } from 'node:child_process';
import http from 'node:http';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, '../..');
const postgresBin = process.env.POSTGRES_BIN || '/opt/homebrew/opt/postgresql@17/bin';
const FIXTURE_PREFIX = path.join(repoRoot, 'work/relay-postgres-');

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

export async function startRelayPostgres() {
  const command = (name, args) => execFileAsync(path.join(postgresBin, name), args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, LC_ALL: 'C', LANG: 'C' },
  });
  const migrationDirectory = path.join(repoRoot, 'supabase/migrations');
  const migrations = (await readdir(migrationDirectory))
    .filter((name) => /^\d+_vax_or_fiction_production_relay(?:_[a-z0-9_]+)?\.sql$/.test(name))
    .sort();
  if (migrations.length === 0) throw new Error('No production relay migrations found');
  const fixtureRoot = await mkdtemp(FIXTURE_PREFIX);
  const dataDir = path.join(fixtureRoot, 'data');
  const port = await freePort();
  const psqlArgs = ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-d', 'postgres'];
  let started = false;
  // A test process that dies before its after() hook still stops the server it started.
  const stopOnExit = () => {
    if (!started) return;
    try { execFileSync(path.join(postgresBin, 'pg_ctl'), ['-D', dataDir, 'stop', '-m', 'immediate'], { stdio: 'ignore' }); } catch { /* already gone */ }
  };
  process.once('exit', stopOnExit);
  const stop = async () => {
    if (started) await command('pg_ctl', ['-D', dataDir, 'stop', '-m', 'fast', '-w']).catch(() => {});
    started = false;
    process.removeListener('exit', stopOnExit);
    if (fixtureRoot.startsWith(FIXTURE_PREFIX)) await rm(fixtureRoot, { recursive: true, force: true });
  };
  try {
    await command('initdb', ['-D', dataDir, '--no-locale', '--encoding=UTF8', '--auth=trust']);
    await command('pg_ctl', ['-D', dataDir, '-l', path.join(fixtureRoot, 'postgres.log'), '-o', `-F -p ${port} -h 127.0.0.1`, 'start', '-w']);
    started = true;
    await command('psql', [...psqlArgs, '-c', 'create role anon nologin; create role authenticated nologin; create schema extensions; create extension pgcrypto with schema extensions;']);
    for (const name of migrations) await command('psql', [...psqlArgs, '-f', path.join(migrationDirectory, name)]);
  } catch (error) {
    await stop();
    throw error;
  }

  /** One relay exchange as the anonymous role, with the caller's network in request.headers as PostgREST sets it. */
  const exchange = async (request, callerIp = '203.0.113.7') => {
    const encoded = Buffer.from(JSON.stringify(request), 'utf8').toString('base64');
    const headers = JSON.stringify({ 'cf-connecting-ip': callerIp }).replace(/'/g, "''");
    const sql = `set role anon; do $h$ begin perform set_config('request.headers', '${headers}', true); end $h$; `
      + `select public.vof_relay_exchange(convert_from(decode('${encoded}', 'base64'), 'utf8')::jsonb)::text;`;
    const { stdout } = await command('psql', [...psqlArgs, '-c', sql]);
    return JSON.parse(stdout.trim());
  };

  /**
   * Serves exchange() at /rest/v1/rpc/vof_relay_exchange with the same body shape the clients send ({ p_request }).
   * onExchange sees every exchange as { request, response, startedAt, endedAt } once it has its answer, in that order.
   */
  const serve = async ({ onExchange, callerIp } = {}) => {
    const server = http.createServer(async (incoming, outgoing) => {
      outgoing.setHeader('access-control-allow-origin', '*');
      outgoing.setHeader('access-control-allow-headers', 'apikey, authorization, content-type');
      outgoing.setHeader('access-control-allow-methods', 'POST, OPTIONS');
      if (incoming.method === 'OPTIONS') { outgoing.statusCode = 204; outgoing.end(); return; }
      if (incoming.method !== 'POST' || !incoming.url?.startsWith('/rest/v1/rpc/vof_relay_exchange')) {
        outgoing.statusCode = 404;
        outgoing.end();
        return;
      }
      const chunks = [];
      for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
      const startedAt = Date.now();
      try {
        const { p_request: request } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const response = await exchange(request, callerIp);
        onExchange?.({ request, response, startedAt, endedAt: Date.now() });
        outgoing.setHeader('content-type', 'application/json');
        outgoing.end(JSON.stringify(response));
      } catch (error) {
        outgoing.statusCode = 500;
        outgoing.end(String(error?.message ?? error));
      }
    });
    await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject));
    const { port: httpPort } = server.address();
    return {
      url: `http://127.0.0.1:${httpPort}`,
      close: () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(() => resolve()); }),
    };
  };

  return { exchange, serve, stop };
}
