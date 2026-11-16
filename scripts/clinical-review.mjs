// Workflow ported from private PR #64 at 38a4fa2. No private data or approvals imported.
import { readFileSync, writeFileSync } from 'node:fs'
import { influenzaDeck } from '../src/data/decks/topics/influenza.ts'
import { snapshot, audit, reviewComplete, importReviews } from './showcase.mjs'
const data = snapshot(influenzaDeck)
const [command, file] = process.argv.slice(2)
if (command === 'apply' && file) {
  if (audit(data).length) throw Error('Evidence audit failed')
  const decisions = importReviews(data, JSON.parse(readFileSync(file, 'utf8')))
  writeFileSync('content/showcase/review.json', JSON.stringify({ snapshotHash: data.snapshotHash, decisions }, null, 2) + '\n')
  console.log(`Applied ${Object.keys(decisions).length} decisions for the public eight-question round only`)
} else if (command === 'signoff') {
  const saved = JSON.parse(readFileSync('content/showcase/review.json', 'utf8'))
  if (saved.snapshotHash !== data.snapshotHash || audit(data).length || !reviewComplete(data, saved.decisions)) throw Error('Signoff requires every current public surface to be approved by Kevin')
  console.log('Current eight-question snapshot is complete. This is not a bank-wide or independent second review.')
} else throw Error('Usage: node --import tsx scripts/clinical-review.mjs apply <review.json> | signoff')
