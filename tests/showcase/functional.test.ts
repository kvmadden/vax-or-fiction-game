import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { influenzaDeck } from '../../src/data/decks/topics/influenza'
import { replay } from '../../scripts/showcase-replay.mjs'
import { evalAnswer } from '../../src/engine/scoring'
import { projectPublicQuestion } from '../../src/network/projection'
const fixture = JSON.parse(readFileSync(new URL('./replay.json', import.meta.url), 'utf8'))
test('all-correct and zero-correct controls expose a wrong key', () => {
  const result = replay(influenzaDeck, fixture)
  assert.equal(result.correct.total, 950)
  assert.equal(result.wrong.total, 0)
  assert.equal(result.correct.right, 8)
  assert.equal(result.wrong.right, 0)
  const changed = structuredClone(influenzaDeck)
  changed.questions[0].answer = !changed.questions[0].answer
  assert.notEqual(replay(changed, fixture).correct.total, 950)
})
test('option positions and metadata IDs do not change semantic results', () => {
  for (const [i, q] of influenzaDeck.questions.entries()) {
    const original = projectPublicQuestion(q, `original-${i}`, i+1, 8)
    const changed = { ...q, id: `opaque-${7-i}`, index: 100-i, authoringId: 'unrelated', topicCue: 'unrelated' }
    const projection = projectPublicQuestion(changed, `other-${i}`, i+1, 8)
    for (const option of [...projection.question.options].reverse()) {
      const canonical = projection.decodeChoice(option.token)
      assert.equal(evalAnswer(changed, canonical!), evalAnswer(q, original.decodeChoice(option.token)!))
    }
  }
})
test('selected participant pre-reveal payloads omit every key, explanation, source and presenter cue', () => {
  const privateKeys = ['answer','bestIndex','mythIndex','reveal','takeaway','presenterNote','sourceIds','citations','fingerprint','quotes','claimIds']
  for (const q of influenzaDeck.questions) {
    const wire = projectPublicQuestion(q, 'frozen-instance', 1, 8).question
    const visit = value => {
      if (!value || typeof value !== 'object') return
      for (const [key, child] of Object.entries(value)) { assert.ok(!privateKeys.includes(key), `Leaked ${key}`); visit(child) }
    }
    visit(wire)
  }
})
