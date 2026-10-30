import http from 'node:http';
import { attachRoomRelay } from './room-relay.mjs';

const host = process.env.VOF_RELAY_HOST || '127.0.0.1';
const port = Number(process.env.VOF_RELAY_PORT || 8787);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('VOF_RELAY_PORT must be an integer from 1 to 65535');

const server = http.createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  response.end('Vax or Fiction room relay\n');
});
const relay = attachRoomRelay(server);

server.listen(port, host, () => {
  console.log(`[vof-relay] listening on http://${host}:${port}`);
});

let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await relay.close();
  await new Promise((resolve) => server.close(resolve));
}
process.once('SIGINT', () => { void close(); });
process.once('SIGTERM', () => { void close(); });
