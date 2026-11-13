import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { influenzaDeck } from '../../src/data/decks/topics/influenza'
import { audit, snapshot, reviewComplete, importReviews } from '../../scripts/showcase.mjs'

const frozen = snapshot(influenzaDeck)
test('eight records and all factual appearances have exact supporting claims', () => {
  assert.equal(frozen.questionCount, 8)
  assert.equal(audit(frozen).length, 0)
  const damaged = structuredClone(frozen)
  damaged.questions[0].surfaces[0].claimIds = []
  assert.ok(audit(damaged).some(e => e.code === 'unsupported'))
})
test('changed text, key or source invalidates approval and incomplete deck cannot claim review', () => {
  const reviews = Object.fromEntries(frozen.reviewRows.map(q => [q.id, { status: 'approved', fingerprint: q.fingerprint, note: '', date: '2026-11-01' }]))
  assert.equal(reviewComplete(frozen, reviews), true)
  for (const field of ['statement', 'answer', 'sourceIds']) {
    const changed = structuredClone(influenzaDeck)
    changed.questions[0][field] = field === 'answer' ? !changed.questions[0].answer : field === 'sourceIds' ? ['missing'] : 'Changed claim'
    assert.equal(reviewComplete(snapshot(changed), reviews), false, field)
  }
  assert.equal(reviewComplete(frozen, {}), false)
})
test('import and export bind public hashes and reject private or changed snapshots', () => {
  const envelope = { version: 2, repo: 'kvmadden/vax-or-fiction-game', snapshotHash: frozen.snapshotHash, decisions: {} }
  assert.deepEqual(importReviews(frozen, JSON.parse(JSON.stringify(envelope))), {})
  assert.throws(() => importReviews(frozen, { ...envelope, snapshotHash: 'private-bank' }))
})
test('draft clinical review and real pilot remain pending', () => {
  assert.equal(frozen.clinicalStatus, 'draft, clinical review by Kevin Madden, PharmD pending')
  assert.equal(frozen.pilot.status, 'pending')
  assert.equal(frozen.pilot.participantsCompleted, 0)
  assert.equal(frozen.pilot.taskAttempts, 0)
})

test('broken citation links, altered source spans and removed sources fail offline', () => {
  const changed = structuredClone(influenzaDeck)
  changed.citations[0].url = 'https://www.cdc.gov/does-not-exist'
  assert.ok(audit(snapshot(changed)).some(e => e.code === 'source'))
  const broken = structuredClone(frozen)
  broken.claims[0].quote = 'Not the source span'
  assert.ok(audit(broken).some(e => e.code === 'span'))
  broken.sources = []
  assert.ok(audit(broken).some(e => e.code === 'source'))
})

test('changed citation and saved source span invalidate all affected approvals', () => {
  const reviews = Object.fromEntries(frozen.reviewRows.map(q => [q.id, { status: 'approved', fingerprint: q.fingerprint, note: '', date: '2026-11-01' }]))
  const deck = structuredClone(influenzaDeck)
  deck.citations[0].url += '#changed'
  assert.equal(reviewComplete(snapshot(deck), reviews), false)
  const evidence = JSON.parse(readFileSync(new URL('../../content/showcase/evidence.json', import.meta.url), 'utf8'))
  evidence.claims[0].quote += ' Changed'
  assert.equal(reviewComplete(snapshot(influenzaDeck, evidence), reviews), false)
})
test('an incomplete selected deck cannot obtain clinical signoff even with fresh row approvals', () => {
  const changed = structuredClone(influenzaDeck)
  changed.questions.pop()
  const incomplete = snapshot(changed)
  const decisions = Object.fromEntries(incomplete.reviewRows.map(q => [q.id, { status: 'approved', fingerprint: q.fingerprint, note: '', date: '2026-11-01' }]))
  assert.equal(reviewComplete(incomplete, decisions), false)
})

test('new factual fields and factual replacement of an exempt cue require supporting claims', () => {
  const changed = structuredClone(influenzaDeck)
  changed.questions[0].clinicalNote = 'The vaccine provides lifelong protection.'
  assert.ok(audit(snapshot(changed)).some(e => e.code === 'unsupported'))
  delete changed.questions[0].clinicalNote
  changed.questions[0].presenterNote = 'The vaccine provides lifelong protection.'
  assert.ok(audit(snapshot(changed)).some(e => e.code === 'unsupported'))
})
test('selected claims reconcile with eight unique public bank records and provisional AI ratings', () => {
  const metadata = JSON.parse(readFileSync(new URL('../../content/bank/metadata/flu.json', import.meta.url), 'utf8'))
  const selected = frozen.questions.map(q => metadata[q.id])
  assert.equal(new Set(selected.map(q => q.bankId)).size, 8)
  for (const [i, record] of selected.entries()) {
    assert.deepEqual(record.evidence.sourceIds, frozen.questions[i].question.sourceIds)
    const claimId = frozen.questions[i].surfaces[0].claimIds[0]
    assert.equal(record.evidence.claims[0].quote, frozen.claims.find(c => c.id === claimId).quote)
    assert.equal(record.difficulty.provisional, true)
  }
})
