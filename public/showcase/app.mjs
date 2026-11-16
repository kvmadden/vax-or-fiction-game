const $ = id => document.getElementById(id)
function element(tag, text, parent) {
  const node = document.createElement(tag)
  node.textContent = text
  parent.append(node)
  return node
}
$('theme').onchange = () => { document.documentElement.dataset.theme = $('theme').value }
$('theme').value = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
$('theme').onchange()
try {
  const [data, results] = await Promise.all(['evidence.json','results.json'].map(async file => {
    const response = await fetch(`./${file}`)
    if (!response.ok) throw Error(`${file}: HTTP ${response.status}`)
    return response.json()
  }))
  $('message').textContent = `Frozen ${data.deckId} · ${data.questionCount} question records · ${data.claims.length} unique claims · SHA-256 ${data.snapshotHash.slice(0, 12)}`
  const panels = [
    ['A / Content', `0 / ${data.claims.length} claims reviewed`, `${data.claims.length} / ${data.claims.length} unreviewed. ${data.questions.flatMap(q=>q.surfaces).concat(data.staticSurfaces).filter(s=>s.claimIds.length).length} factual appearances. Clinical accuracy: N/A. Clinical review by Kevin Madden, PharmD is pending.`],
    ['B / Functional integrity', `${results.replay.correct.total} / ${results.expected.correctTotal} all-correct points`, `${results.replay.wrong.total} zero-correct points (expected ${results.expected.wrongTotal}). ${Number(results.replay.correct.total === results.expected.correctTotal) + Number(results.replay.wrong.total === results.expected.wrongTotal)} / 2 bot sequences matched totals, eight attempts each. Semantic permutations and payload isolation are separate checks in the test report.`],
    ['C / Usability', 'Pilot pending', '0 facilitators and 0 players completed. 0 task attempts, 0 task completions. Keyboard, screen-reader and phone tasks are prepared. Automated browser checks are not human pilot results.']
  ]
  for (const [title, metric, limit] of panels) {
    const panel = element('article', '', $('panels'))
    element('h2', title, panel)
    element('p', metric, panel).className = 'metric'
    element('p', limit, panel)
  }
  for (const [i, q] of data.questions.entries()) {
    const card = element('article', '', $('claims'))
    element('p', `QUESTION ${i+1} / ${q.id}`, card).className = 'identity'
    element('h3', q.question.statement, card)
    element('span', 'Draft review', card).className = 'chip'
    element('span', 'CDC · Public domain prose', card).className = 'chip'
    const controls = element('div', '', card)
    controls.className = 'claim-controls'
    const trigger = element('button', 'Reveal answer and source', controls)
    const dialog = element('dialog', '', card)
    const heading = element('h2', `Question ${i+1}: ${q.question.answer ? 'True' : 'False'}`, dialog)
    heading.id = `answer-${i}`
    dialog.setAttribute('aria-labelledby', heading.id)
    element('p', q.question.reveal, dialog)
    element('p', 'Clinical review by Kevin Madden, PharmD is pending', dialog)
    for (const id of q.surfaces.flatMap(s=>s.claimIds).filter((id,index,all)=>all.indexOf(id)===index)) {
      const claim = data.claims.find(c=>c.id===id)
      const source = data.sources.find(s=>s.id===claim.sourceId)
      element('blockquote', claim.quote, dialog)
      const link = element('a', `CDC source · ${source.id} · Public domain prose`, dialog)
      link.href = source.url
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      element('small', `Page updated ${source.pageUpdated ?? 'not stated'} · retrieved ${source.retrievedOn} · exact span ${claim.start} to ${claim.end}`, dialog)
      element('small', `SHA-256 ${claim.sha256}`, dialog)
      if (source.versionNote) element('p', source.versionNote, dialog)
    }
    const close = element('button', 'Close evidence', dialog)
    close.onclick = () => dialog.close()
    dialog.onclose = () => trigger.focus()
    trigger.onclick = () => dialog.showModal()
  }
  if (!results.errors.length) element('p', '0 functional errors in the two recorded bot sequences. Clinical review and pilot remain pending.', $('errors'))
  for (const error of results.errors) element('p', `${error.id}: ${error.message}`, $('errors'))
  element('p', 'Pending: Kevin’s content review, an independent second review, and the one-facilitator/four-player pilot.', $('errors'))
} catch (error) { $('message').textContent = `Evidence could not load: ${error.message}` }
