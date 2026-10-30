import assert from 'node:assert/strict';
import test from 'node:test';
import { useGameStore } from '../../src/store/game-store';
import { projectGameState } from '../../src/network/game-projection';
import { validateClientEnvelope } from '../../src/network/guards';

for (const mode of [
  { label: 'online polling', interactionMode: 'polling', offlineMode: false, accepted: true },
  { label: 'Phone Voting off', interactionMode: 'facilitator', offlineMode: false, accepted: false },
  { label: 'Offline facilitator', interactionMode: 'facilitator', offlineMode: true, accepted: false },
  { label: 'Offline with persisted polling', interactionMode: 'polling', offlineMode: true, accepted: false },
] as const) {
  test(`${mode.label}: wire, reducer and phone projection agree on attendee input`, () => {
    useGameStore.setState(useGameStore.getInitialState(), true);
    useGameStore.setState({
      interactionMode: mode.interactionMode, offlineMode: mode.offlineMode,
      sessionId: 'synthetic-run', phase: 'entering', votesLocked: false, slideIndex: 0,
      run: [{ id: 'synthetic', type: 'question', kind: 'binary', statement: 'Synthetic', answer: true }],
      pollVotes: {}, pollVoters: {},
    });
    const state = useGameStore.getState();
    const projection = projectGameState(state, 'TEST', 1);
    const message = { version: 1, type: 'VOTE', roomId: 'TEST', sessionId: state.sessionId,
      deviceId: 'synthetic-device', messageId: 'synthetic-message',
      questionInstanceId: projection.roomState.questionData!.questionInstanceId, choice: 'true' };
    const result = validateClientEnvelope(message, {
      roomId: 'TEST', sessionId: state.sessionId, deviceId: 'synthetic-device',
      phase: state.phase, votesLocked: false, ...mode,
      question: projection.roomState.questionData, decodeChoice: projection.questionProjection!.decodeChoice,
    });
    assert.equal(result.ok, mode.accepted, 'wire acceptance');
    state.dispatch({ type: 'RECORD_VOTE', deviceId: 'synthetic-device', choice: 'true' });
    assert.equal(Boolean(useGameStore.getState().pollVoters.synthetic?.['synthetic-device']), mode.accepted, 'reducer acceptance');
    assert.equal(projection.roomState.votesLocked, !mode.accepted, 'phone voting state');
    if (!mode.accepted) {
      assert.deepEqual(useGameStore.getState().pollVotes, {});
      assert.deepEqual(useGameStore.getState().pollVoters, {});
    }
  });
}
