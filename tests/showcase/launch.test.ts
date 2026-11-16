import test from 'node:test'
import assert from 'node:assert/strict'
import { hostLaunchFromSearch } from '../../src/presentation/host-launch'
test('the showcase host link selects the frozen deck rather than the default bank', () => {
  assert.deepEqual(hostLaunchFromSearch('?deck=influenza&mode=full&venue=teams'), {
    type:'SELECT_MODE', deckId:'influenza', modeId:'full', venue:'teams'
  })
})
