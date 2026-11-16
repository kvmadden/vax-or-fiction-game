import test from 'node:test'
import assert from 'node:assert/strict'
import { influenzaDeck } from '../../src/data/decks/topics/influenza'
import { buildClosingRecap } from '../../src/engine/closing-recap'
import { snapshot } from '../../scripts/showcase.mjs'
test('every possible dynamic closing headline and takeaway reuses a frozen supported surface', () => {
  const data = snapshot(influenzaDeck)
  const run = influenzaDeck.questions.map(q=>({...q,type:'question' as const}))
  for (const missed of run) {
    const questions = Object.fromEntries(run.map(q=>[q.id, {correctPct:q.id===missed.id?0:100,choices:{true:1,false:1}}]))
    const recap = buildClosingRecap(run,{votesTotal:16,accuracy:50,questions},{limit:8})
    assert.equal(recap.split?.headline, missed.statement)
    assert.equal(recap.takeaways.length,8)
    for (const item of recap.takeaways) {
      const frozen = data.questions.find(q=>q.question.id===item.questionId)
      const surface = frozen.surfaces.find(s=>s.field==='takeaway')
      assert.equal(item.text,surface.text)
      assert.equal(surface.claimIds.length,1)
      assert.ok(data.claims.some(c=>c.id===surface.claimIds[0]))
    }
  }
})
