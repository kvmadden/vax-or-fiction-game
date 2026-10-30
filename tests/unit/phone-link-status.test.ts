import assert from 'node:assert/strict';
import test from 'node:test';
import { errorAfterHostStatus, holdsAnswerDock, HOST_DISCONNECTED_MESSAGE, NOT_TAKEN, refusalNotice } from '../../src/network/usePhoneLink';
import { VOTING_CLOSED } from '../../src/network/guards';

test('a refused reaction shows nothing, a refused vote shows the show\'s own line, never the relay\'s words', () => {
  // The production relay refuses every reaction today ("Invalid attendee message"), and that text must never reach a player.
  for (const reason of ['Invalid attendee message', 'Message rate exceeded', undefined]) assert.equal(refusalNotice('REACTION', reason), null);
  for (const reason of ['Invalid attendee message', 'Message rate exceeded', 'Relay inbox is full', 'Stale question', undefined]) {
    assert.equal(refusalNotice('VOTE', reason), NOT_TAKEN, String(reason));
  }
  assert.equal(refusalNotice('VOTE', VOTING_CLOSED), null, 'once voting has closed, the dock says so itself');
  assert.equal(refusalNotice('HELLO', 'Nickname must use 1–40 characters'), 'Nickname must use 1–40 characters', 'a join keeps the host\'s reason');
  assert.equal(refusalNotice('HELLO', undefined), NOT_TAKEN);
  assert.doesNotMatch(NOT_TAKEN, /[;\u2014]/);
});

test('only a vote on its way holds the answer dock, never a join, a reaction or a prediction', () => {
  assert.equal(holdsAnswerDock(['VOTE']), true);
  assert.equal(holdsAnswerDock(['REACTION', 'VOTE']), true, 'a vote with a reaction beside it still holds it');
  for (const type of ['HELLO', 'REACTION', 'PREDICT_WINNER'] as const) assert.equal(holdsAnswerDock([type]), false, type);
  assert.equal(holdsAnswerDock(['REACTION', 'PREDICT_WINNER']), false);
  assert.equal(holdsAnswerDock([]), false);
  assert.equal(holdsAnswerDock(new Map([['m1', 'VOTE' as const]]).values()), true, 'read straight from the pending map');
});

test('host reconnect clears only the stale host-disconnected error', () => {
  assert.equal(errorAfterHostStatus(null, false), HOST_DISCONNECTED_MESSAGE);
  assert.equal(errorAfterHostStatus(HOST_DISCONNECTED_MESSAGE, true), null);
  assert.equal(errorAfterHostStatus('The host rejected this update.', true), 'The host rejected this update.');
});

test('a room snapshot from a reconnected host clears the stale alert but keeps other errors (VOF-T04 / CH-01)', () => {
  const snapshot = (hostConnected: boolean) => ({ revision: 7, hostConnected });
  assert.equal(errorAfterHostStatus(HOST_DISCONNECTED_MESSAGE, snapshot(true).hostConnected), null);
  assert.equal(errorAfterHostStatus(HOST_DISCONNECTED_MESSAGE, snapshot(false).hostConnected), HOST_DISCONNECTED_MESSAGE);
  assert.equal(errorAfterHostStatus('The host did not acknowledge this update. Retry when the room is connected.', snapshot(true).hostConnected),
    'The host did not acknowledge this update. Retry when the room is connected.');
  assert.equal(errorAfterHostStatus(null, snapshot(true).hostConnected), null);
});
