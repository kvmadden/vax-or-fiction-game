import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { replay } from './showcase-replay.mjs'
import { importReview, canSignoff } from '../public/clinical-review/model.mjs'

const root = new URL('../', import.meta.url)
const read = file => readFileSync(new URL(file, root), 'utf8')
export const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')
const evidence = JSON.parse(read('content/showcase/evidence.json'))
const bankRecords = JSON.parse(read('content/bank/metadata/flu.json'))
const nonfactual = new Set(JSON.parse(read('content/showcase/nonfactual.json')))
const structuralKeys = new Set(['id','kind','authoringId','layoutFamily','imageRequirementId','teachingRole','sourceIds','emphasis','revealEmphasis','takeawayEmphasis'])
const claimIds = ['annual', 'older', 'egg', 'biology', 'timing', 'cardiac', 'minor', 'treatment']
const factualKeys = new Set(['statement', 'scenario', 'choices', 'statements', 'steps', 'reveal', 'takeaway', 'patientConversation', 'mythQuote'])
const cueKeys = new Set(['discussionPrompt', 'presenterNote', 'topicCue'])
const strings = value => Array.isArray(value) ? value.flatMap(strings) : typeof value === 'string' ? [value] : []

// Surfaces are enumerated independently of claim evidence. New factual fields need an explicit mapping.
export function snapshot(deck, sources = evidence) {
  const questions = deck.questions.map((q, index) => {
    const surfaces = Object.entries(q).flatMap(([field, value]) => factualKeys.has(field)
      ? strings(value).map((text, i) => ({ id: `${deck.id}:${q.id}:${field}:${i}`, field, text, claimIds: [claimIds[index]] }))
      : cueKeys.has(field) ? strings(value).map((text, i) => ({ id: `${deck.id}:${q.id}:${field}:${i}`, field, text, claimIds: [], ...(nonfactual.has(text) ? { nonfactual: field === 'topicCue' ? 'Topic label' : 'Facilitation instruction only' } : {}) })) : !structuralKeys.has(field) ? strings(value).map((text,i) => ({ id: `${deck.id}:${q.id}:${field}:${i}`, field, text, claimIds: [] })) : [])
    const bankRecord = bankRecords[`${deck.id}:${q.id}`]
    const contentHash = hash({ q, citations: deck.citations, sources, bankEvidence: bankRecord?.evidence, bankTextHash: bankRecord?.textHash })
    return { id: `${deck.id}:${q.id}`, bankRecordId: bankRecord?.bankId ?? null, contentHash, surfaces, question: q }
  })
  const staticSurfaces = deck.staticSlides.flatMap(slide => Object.entries(slide).flatMap(([field, value]) => {
    if (!['title', 'body', 'presenterNote', 'pearl', 'summaryPoints'].includes(field)) return []
    return strings(value).map((text, i) => ({ id: `${deck.id}:${slide.id}:${field}:${i}`, field, text,
      claimIds: field === 'pearl' ? ['annual'] : field === 'summaryPoints' ? [['annual', 'older', 'egg'][i]] : [],
      ...(['pearl', 'summaryPoints'].includes(field) ? {} : nonfactual.has(text) ? { nonfactual: 'Facilitation instruction or heading only' } : {}) }))
  }))
  staticSurfaces.push(...['title','description'].map(field => ({ id: `${deck.id}:${field}`, field, text: deck[field], claimIds: [], ...(nonfactual.has(deck[field]) ? { nonfactual: 'Deck heading or facilitation instruction' } : {}) })))
  const data = { repo: 'kvmadden/vax-or-fiction-game', deckId: deck.id, deckHash: hash(deck), citations: deck.citations, questionCount: questions.length,
    questions, staticSurfaces, sources: sources.sources, claims: sources.claims,
    clinicalStatus: 'draft, clinical review by Kevin Madden, PharmD pending', secondReviewer: 'Not performed', difficulty: 'AI estimates are provisional. No human difficulty calibration.',
    pilot: { status: 'pending', facilitatorsCompleted: 0, participantsCompleted: 0, taskAttempts: 0, taskCompletions: 0 } }
  data.snapshotHash = hash(data)
  const row = (id, surfaces, contentHash, question) => ({ id, topic: 'influenza', kind: question?.kind ?? 'closing and presenter surfaces', claim: question?.statement ?? 'Closing, opening and presenter surfaces',
    scenario: question?.scenario ?? '', options: [], answer: question ? (question.answer ? 'True' : 'False') : 'No scored answer', reveal: question?.reveal ?? 'Review all listed surfaces.',
    surfaces, sources: sources.sources.filter(s => surfaces.some(surface => surface.claimIds.some(id => sources.claims.find(c => c.id === id)?.sourceId === s.id))).map(s => ({ ...s, label: `CDC · ${s.id} · Public domain prose · retrieved ${s.retrievedOn}` })),
    quotes: sources.claims.filter(c => surfaces.some(s => s.claimIds.includes(c.id))).map(c => ({ ...c, text: c.quote, url: sources.sources.find(s => s.id === c.sourceId)?.url, retrievedOn: sources.sources.find(s => s.id === c.sourceId)?.retrievedOn })), contentHash, fingerprint: contentHash })
  data.reviewRows = [...questions.map(q => row(q.id, q.surfaces, q.contentHash, q.question)), row('influenza:static', staticSurfaces, hash({ staticSlides: deck.staticSlides, citations: deck.citations, sources }))]
  return data
}

export function audit(data) {
  const errors = []
  const add = (code, id, message) => errors.push({ code, id, message })
  if (data.questionCount !== 8 || new Set(data.questions.map(q=>q.id)).size !== 8 || data.questions.some(q=>q.bankRecordId !== q.id) || data.claims.length !== 8) add('incomplete', data.deckId, 'Selected round requires eight distinct question records and eight supporting claims')
  for (const source of data.sources) {
    const text = read(source.file)
    if (hash(text) !== source.sha256) add('source', source.id, 'Source snapshot hash changed')
    if (source.status !== 200 || source.resolvedUrl !== source.url || !/^https:\/\/www.cdc.gov\//.test(source.url)) add('source', source.id, 'Source retrieval or canonical URL failed')
  }
  for (const q of data.questions) {
    if (!q.question.sourceIds?.length) add('source', q.id, 'Question has no cited source')
    for (const id of q.question.sourceIds ?? []) {
      const citation = data.citations.find(c => c.id === id)
      if (!citation || !data.sources.some(s => s.url === citation.url && s.status === 200)) add('source', q.id, `Citation ${id} has no successful committed public retrieval`)
    }
  }
  for (const claim of data.claims) {
    const source = data.sources.find(s => s.id === claim.sourceId)
    if (!source) { add('source', claim.id, 'Missing source'); continue }
    const text = read(source.file)
    if (text.slice(claim.start, claim.end) !== claim.quote || hash(claim.quote) !== claim.sha256) add('span', claim.id, 'Supporting span is not exact')
  }
  for (const surface of [...data.questions.flatMap(q => q.surfaces), ...data.staticSurfaces]) {
    if (!surface.claimIds.length && !surface.nonfactual) add('unsupported', surface.id, 'Factual surface has no supporting claim')
    for (const id of surface.claimIds) if (!data.claims.some(c => c.id === id)) add('unsupported', surface.id, `Unknown claim ${id}`)
  }
  const priority = { unsupported:0, span:0, source:0, incomplete:0, 'wrong-key':0, 'leaked-answer':1, 'blocked-participation':2 }
  return errors.sort((a,b) => (priority[a.code] ?? 3) - (priority[b.code] ?? 3) || a.id.localeCompare(b.id))
}
export function reviewComplete(data, decisions) { return data.questionCount === 8 && data.reviewRows.length === 9 && audit(data).length === 0 && canSignoff(data.reviewRows, decisions) }
export function importReviews(data, envelope) { return importReview(JSON.stringify(envelope), data.reviewRows, data.snapshotHash) }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { influenzaDeck } = await import('../src/data/decks/topics/influenza.ts')
  const data = snapshot(influenzaDeck)
  const errors = audit(data)
  const expected = JSON.parse(read('tests/showcase/replay.json'))
  const result = replay(influenzaDeck, expected)
  if (result.correct.total !== expected.correctTotal) errors.push({ code: 'wrong-key', id: 'bot-all', message: 'All-correct replay total differs' })
  if (result.wrong.total !== expected.wrongTotal) errors.push({ code: 'wrong-key', id: 'bot-none', message: 'Zero-correct replay total differs' })
  const results = { benchmark: 'Fixed public binary round, not a blind test', snapshotHash: data.snapshotHash, command: 'node --import tsx --test tests/showcase/functional.test.ts', expected, replay: result, errors }
  if (process.argv.includes('--check')) {
    if (read('public/clinical-review/questions.json') !== JSON.stringify(data.reviewRows, null, 2) + '\n' || read('public/showcase/evidence.json') !== JSON.stringify(data, null, 2) + '\n') throw Error('Frozen public content changed. Rebuild and repeat review.')
    if (read('public/showcase/results.json') !== JSON.stringify(results, null, 2) + '\n') throw Error('Committed functional report is stale')
  } else {
    writeFileSync(fileURLToPath(new URL('public/showcase/results.json', root)), JSON.stringify(results, null, 2) + '\n')
    writeFileSync(fileURLToPath(new URL('public/clinical-review/questions.json', root)), JSON.stringify(data.reviewRows, null, 2) + '\n')
    writeFileSync(fileURLToPath(new URL('public/showcase/evidence.json', root)), JSON.stringify(data, null, 2) + '\n')
  }
  if (errors.length) throw Error(JSON.stringify(errors, null, 2))
  console.log(`${data.questionCount} question records, ${data.claims.length} unique claims, ${data.questions.flatMap(q=>q.surfaces).concat(data.staticSurfaces).filter(s=>s.claimIds.length).length} factual appearances. Review and pilot pending.`)
}
