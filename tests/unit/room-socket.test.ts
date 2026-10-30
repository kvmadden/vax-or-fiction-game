import assert from 'node:assert/strict';
import test from 'node:test';
import { connectRoom } from '../../src/network/room-socket';

class FakeWebSocket {
  static OPEN = 1;
  static instances: FakeWebSocket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  sent: string[] = [];
  constructor(readonly url: string) { FakeWebSocket.instances.push(this); }
  send(data: string) { this.sent.push(data); }
  close() { this.readyState = 3; this.onclose?.({ code: 1000 }); }
  open() { this.readyState = 1; this.onopen?.(); }
  receive(message: unknown) { this.onmessage?.({ data: JSON.stringify(message) }); }
}

test('room socket binds exact role/room/device identity and reports READY truthfully', () => {
  FakeWebSocket.instances = [];
  const statuses: string[] = [];
  const messages: unknown[] = [];
  const connection = connectRoom({
    roomId: 'Exact_Room-9',
    role: 'attendee',
    credential: 'credential_123456789012345678901234',
    deviceId: 'device_9',
    url: 'ws://127.0.0.1:9999',
    WebSocketClass: FakeWebSocket as unknown as typeof WebSocket,
    onMessage: (message) => messages.push(message),
    onStatus: (status) => statuses.push(status),
    onError: () => {},
  });
  const socket = FakeWebSocket.instances[0]!;
  assert.equal(socket.url, 'ws://127.0.0.1:9999/api/rooms/Exact_Room-9/ws');
  socket.open();
  assert.deepEqual(JSON.parse(socket.sent[0]!), {
    kind: 'CONNECT', version: 1, role: 'attendee', roomId: 'Exact_Room-9',
    credential: 'credential_123456789012345678901234', deviceId: 'device_9',
  });
  socket.receive({ kind: 'READY', role: 'attendee' });
  assert.deepEqual(statuses, ['connecting', 'connected']);
  assert.deepEqual(messages, [{ kind: 'READY', role: 'attendee' }]);
  connection.close();
});

test('unconfigured non-dev room socket is visibly offline and never invents same-origin live service', () => {
  const statuses: string[] = [];
  const errors: string[] = [];
  const connection = connectRoom({
    roomId: 'Room_A', role: 'host', credential: 'credential_123456789012345678901234',
    onMessage: () => {}, onStatus: (status) => statuses.push(status), onError: (error) => errors.push(error),
  });
  assert.deepEqual(statuses, ['offline']);
  assert.match(errors[0] ?? '', /relay.*configured/i);
  assert.equal(connection.send({ kind: 'ROOM_STATE' }), false);
  connection.close();
});
