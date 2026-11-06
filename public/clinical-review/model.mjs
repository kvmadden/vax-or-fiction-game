export const STORAGE_KEY = 'vof-public-influenza-review:v2'
export function exportReview(decisions, snapshotHash) {
  return JSON.stringify({ version: 2, repo: 'kvmadden/vax-or-fiction-game', snapshotHash, decisions }, null, 2)
}
export function importReview(raw, questions, snapshotHash) {
  const file = JSON.parse(raw)
  if (file.version !== 2 || file.repo !== 'kvmadden/vax-or-fiction-game' || file.snapshotHash !== snapshotHash || !file.decisions || typeof file.decisions !== 'object' || Array.isArray(file.decisions)) throw Error('Unsupported review file')
  const known = new Map(questions.map(q => [q.id, q]))
  const result = {}
  for (const [id, decision] of Object.entries(file.decisions)) {
    if (!known.has(id) || decision.fingerprint !== known.get(id).fingerprint) throw Error(`Question changed or stale review: ${id}`)
    if (!['approved', 'flagged', 'skipped'].includes(decision.status) || typeof decision.note !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(decision.date)) throw Error(`Invalid decision: ${id}`)
    if (decision.status === 'flagged' && !decision.note.trim()) throw Error(`Flag needs a note: ${id}`)
    result[id] = { fingerprint: decision.fingerprint, status: decision.status, note: decision.note, date: decision.date }
  }
  return result
}

export function canSignoff(questions, decisions) {
  return questions.length > 0 && questions.every(q => decisions[q.id]?.status === 'approved' && decisions[q.id]?.fingerprint === q.fingerprint && /^\d{4}-\d{2}-\d{2}$/.test(decisions[q.id]?.date ?? ''))
}
