import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { manifestReachableFiles } from '../integration/manifest-reachable-files.mjs'
const read = file => readFileSync(new URL(`../../${file}`,import.meta.url),'utf8')
const manifest = JSON.parse(read('dist/.vite/manifest.json'))
const evidence = JSON.parse(read('public/showcase/evidence.json'))
const phoneFiles = new Set([
  ...manifestReachableFiles(manifest,['index.html']),
  ...manifestReachableFiles(manifest,['src/phone/PhoneSuite.tsx'],{ followDynamic:true,skipKeys:['index.html'] })
])
const needles = [...new Set(evidence.questions.flatMap(q=>[q.question.statement,q.question.reveal,q.question.presenterNote]))]
const texts = [...phoneFiles].map(file=>({file,text:read(`dist/assets/${file}`)}))
function leaks(items) {
  return items.flatMap(({file,text})=>needles.filter(needle=>text.includes(needle)).map(needle=>({file,needle})))
}
test('production participant-reachable import graph contains no frozen question/key library or reviewer asset',()=>{
  assert.ok(phoneFiles.size>=3)
  assert.deepEqual(leaks(texts),[])
  for (const {text} of texts) assert.doesNotMatch(text,/clinical-review\/|showcase\/evidence\.json|showcase\/results\.json/)
  assert.ok(Object.values(manifest).some(entry=>entry.file?.includes('decks')), 'host key library exists separately, so isolation is not vacuous')
})
test('a source or key-library leak in a shared participant chunk is detected',()=>{
  const changed = texts.map((item,i)=>i===0?{...item,text:item.text+needles[0]}:item)
  assert.equal(leaks(changed).length,1)
})
