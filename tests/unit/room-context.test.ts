import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RoomContext, useRoom } from '../../src/presentation/RoomContext';

type RoomValue = React.ContextType<typeof RoomContext>;

function readRoom(wrap: (probe: React.ReactElement) => React.ReactElement = (probe) => probe): RoomValue {
  let observed: RoomValue | undefined;
  function Probe() {
    observed = useRoom();
    return null;
  }

  renderToStaticMarkup(wrap(React.createElement(Probe)));
  assert.ok(observed, 'the room consumer should render');
  return observed;
}

test('a room consumer outside a provider uses the offline defaults', () => {
  assert.deepEqual(readRoom(), { roomId: '', connectionStatus: 'offline', error: null });
});

test('a room provider shares its current room and connected status', () => {
  const room: RoomValue = { roomId: 'ABCD', connectionStatus: 'connected', error: null };
  assert.deepEqual(
    readRoom((probe) => React.createElement(RoomContext.Provider, { value: room }, probe)),
    room,
  );
});

test('a provider preserves a reconnecting status and connection error', () => {
  const room: RoomValue = { roomId: 'W7K2', connectionStatus: 'reconnecting', error: 'Connection interrupted' };
  assert.deepEqual(
    readRoom((probe) => React.createElement(RoomContext.Provider, { value: room }, probe)),
    room,
  );
});

test('a nested room provider takes precedence over the outer room', () => {
  const outer: RoomValue = { roomId: 'OUTER', connectionStatus: 'connected', error: null };
  const inner: RoomValue = { roomId: 'INNER', connectionStatus: 'local rehearsal', error: null };
  assert.deepEqual(
    readRoom((probe) =>
      React.createElement(RoomContext.Provider, { value: outer },
        React.createElement(RoomContext.Provider, { value: inner }, probe),
      ),
    ),
    inner,
  );
});
