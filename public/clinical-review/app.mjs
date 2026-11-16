import { STORAGE_KEY, exportReview, importReview } from './model.mjs'
const $ = id => document.getElementById(id)
const message = text => { $('message').textContent = text }
let questions = []
let snapshotHash = ''
let decisions = {}
function element(tag, text, parent) {
  const node = document.createElement(tag)
  node.textContent = text
  parent.append(node)
  return node
}
function save() {
  try { localStorage.setItem(STORAGE_KEY, exportReview(decisions, snapshotHash))
message('Saved on this browser') }
  catch { message('Browser storage unavailable. Export JSON now to save your decisions.') }
}
function updateProgress() {
  const approved = questions.filter(q => decisions[q.id]?.status === 'approved').length
  const flagged = questions.filter(q => decisions[q.id]?.status === 'flagged').length
  const skipped = questions.filter(q => decisions[q.id]?.status === 'skipped').length
  $('counts').textContent = `${approved} / ${questions.length} approved · ${flagged} flagged · ${skipped} skipped`
  $('progress').max = questions.length
  $('progress').value = approved
}
function render() {
  updateProgress()
  $('questions').replaceChildren()
  const groups = new Map()
  for (const q of questions) {
    const status = decisions[q.id]?.status ?? 'unseen'
    const filter = $('filter').value
    if ($('topic').value !== 'all' && q.topic !== $('topic').value) continue
    if (filter === 'pending' ? status === 'approved' : filter !== 'all' && status !== filter) continue
    if (!groups.has(q.topic)) {
      const group = element('section', '', $('questions'))
      element('h2', q.topic.replaceAll('-', ' '), group)
      groups.set(q.topic, group)
    }
    const card = element('article', '', groups.get(q.topic))
    card.dataset.status = status
    element('p', `${q.id} · ${q.kind}`, card).className = 'identity'
    element('h3', q.claim, card)
    if (q.scenario && q.scenario !== q.claim) element('p', q.scenario, card)
    if (q.options.length) {
      const list = element('ol', '', card)
      q.options.forEach(option => element('li', option, list))
    }
    element('strong', `Game answer: ${q.answer}`, card)
    element('p', q.reveal, card)
    element('h4', 'Every exposed surface', card)
    for (const surface of q.surfaces) {
      element('p', `${surface.id}: ${surface.text}`, card)
      element('small', surface.claimIds.length ? `Supporting claims: ${surface.claimIds.join(', ')}` : surface.nonfactual, card)
    }
    element('h4', 'Cited sources', card)
    if (!q.sources.length) element('p', 'No linked citation saved for this question. Verify before approving.', card)
    for (const source of q.sources) {
      const p = element('p', '', card)
      if (source.url && /^https?:\/\//.test(source.url)) {
        const a = element('a', source.label, p)
        a.href = source.url
        a.target = '_blank'
        a.rel = 'noopener noreferrer'
      } else element('span', source.label, p)
    }
    element('h4', 'Saved source quotations', card)
    if (!q.quotes.length) element('p', 'No verbatim source quote saved. The explanation above is game copy.', card)
    for (const quote of q.quotes) {
      element('blockquote', quote.text, card)
      element('small', `${quote.id} · exact span ${quote.start} to ${quote.end} · SHA-256 ${quote.sha256}`, card)
      if (/^https?:\/\//.test(quote.url)) {
        const a = element('a', `Quoted source · retrieved ${quote.retrievedOn}`, card)
        a.href = quote.url
        a.target = '_blank'
        a.rel = 'noopener noreferrer'
      }
    }
    const label = element('label', 'Review note (required to flag)', card)
    const note = element('textarea', '', label)
    note.value = decisions[q.id]?.note ?? ''
    note.addEventListener('input', () => {
      const priorStatus = decisions[q.id]?.status ?? 'skipped'
      const nextStatus = priorStatus === 'flagged' && !note.value.trim() ? 'skipped' : priorStatus
      decisions[q.id] = { fingerprint: q.fingerprint, status: nextStatus, note: note.value, date: new Date().toISOString().slice(0, 10) }
      card.dataset.status = decisions[q.id].status
      current.textContent = `Decision: ${nextStatus}`
      for (const b of actions.children) b.setAttribute('aria-pressed', String(b.dataset.status === nextStatus))
      updateProgress()
      save()
    })
    const current = element('p', `Decision: ${status}`, card)
    current.className = 'decision'
    const actions = element('div', '', card)
    actions.className = 'tools'
    for (const [name, value] of [['Approve', 'approved'], ['Flag', 'flagged'], ['Skip', 'skipped']]) {
      const button = element('button', name, actions)
      button.dataset.status = value
      button.setAttribute('aria-pressed', String(status === value))
      button.onclick = () => {
        if (value === 'flagged' && !note.value.trim()) { message('Add a note before flagging this question')
note.focus()
return }
        decisions[q.id] = { fingerprint: q.fingerprint, status: value, note: note.value, date: new Date().toISOString().slice(0, 10) }
        save()
        // Keep the selected button and keyboard focus in place during a session.
        card.dataset.status = value
        current.textContent = `Decision: ${value}`
        for (const b of actions.children) b.setAttribute('aria-pressed', String(b === button))
        updateProgress()
      }
    }
  }
}
$('export').onclick = () => {
  const url = URL.createObjectURL(new Blob([exportReview(decisions, snapshotHash)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `vax-clinical-review-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
$('import').onchange = async event => {
  try {
    const file = event.target.files[0]
    if (!file) return
    decisions = importReview(await file.text(), questions, snapshotHash)
    save()
    render()
    message('Imported review snapshot. Existing decisions replaced.')
  } catch (error) { message(`Import failed: ${error.message}`) }
  event.target.value = ''
}
$('topic').onchange = render
$('filter').onchange = render
$('theme').onchange = () => {
  document.documentElement.dataset.theme = $('theme').value
  try { localStorage.setItem('vof-clinical-theme', $('theme').value) } catch { /* decisions still export */ }
}
try {
  $('theme').value = localStorage.getItem('vof-clinical-theme') ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
} catch { /* light default */ }
document.documentElement.dataset.theme = $('theme').value
try {
  const response = await fetch('../showcase/evidence.json')
  if (!response.ok) throw Error('Could not load live questions')
  const snapshot = await response.json()
  questions = snapshot.reviewRows
  snapshotHash = snapshot.snapshotHash
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) decisions = importReview(raw, questions, snapshotHash)
  } catch { message('Saved review could not load or questions changed. Import a current export or start a new review. Exported backups are unchanged.') }
  for (const topic of [...new Set(questions.map(q => q.topic))].sort()) {
    const option = element('option', topic.replaceAll('-', ' '), $('topic'))
    option.value = topic
  }
  render()
} catch (error) { message(error.message) }
