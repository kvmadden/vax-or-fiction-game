import assert from 'node:assert/strict';
import test from 'node:test';
import { phoneAudienceWait } from '../../src/phone/phone-wait';

test('audience phones watch the projector on title and instructions, and wait for a question otherwise', () => {
  assert.deepEqual(phoneAudienceWait({ question: 'title' }), {
    kicker: "You're in",
    message: 'Watch the big screen.',
    detail: 'The show is starting.',
  });
  assert.deepEqual(phoneAudienceWait({ question: 'instructions' }), {
    kicker: "You're in",
    message: 'Watch the big screen.',
    detail: 'Then this phone is your clicker.',
  });
  assert.deepEqual(phoneAudienceWait({ question: 'q4' }), {
    kicker: "You're in",
    message: 'Waiting for the next question.',
  });
  assert.deepEqual(phoneAudienceWait(null), {
    kicker: "You're in",
    message: 'Waiting for the next question.',
  });
});
