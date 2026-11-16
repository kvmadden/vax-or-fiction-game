import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { withViteAndBrowser } from '../integration/render-harness.mjs'
const media = process.env.VOF_SHOWCASE_MEDIA
if (media) mkdirSync(media, { recursive: true })
const sizes = [[1440,900],[430,932],[390,844]]
test('evidence and review work with keyboard, focus return, reduced motion and all phone sizes', { timeout: 120000 }, async () => {
  await withViteAndBrowser({ headless: process.env.VOF_VISIBLE !== '1' }, async ({ browser, url }) => {
    for (const [width,height] of sizes) for (const theme of ['light','dark']) {
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' })
      try {
        const page = await context.newPage()
        await page.goto(`${url}/showcase/index.html`)
        await page.getByText('8 unique claims', { exact: false }).waitFor()
        await page.getByLabel('Theme', { exact: true }).selectOption(theme)
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth), true)
        assert.match(await page.locator('#panels').innerText(), /0 \/ 8 claims reviewed/)
        assert.match(await page.locator('#panels').innerText(), /Pilot pending/)
        const trigger = page.getByRole('button', { name:'Reveal answer and source' }).first()
        await trigger.focus()
        await page.keyboard.press('Enter')
        const dialog = page.locator('dialog[open]')
        await dialog.waitFor()
        assert.match(await dialog.innerText(), /True/)
        const source = dialog.getByRole('link', { name:/CDC source/ })
        await source.focus()
        assert.equal(await source.evaluate(node=>node===document.activeElement), true)
        assert.match(await source.getAttribute('href'), /^https:\/\/www.cdc.gov\//)
        await page.keyboard.press('Escape')
        await page.waitForFunction(()=>!document.querySelector('dialog[open]'))
        assert.equal(await trigger.evaluate(node=>node===document.activeElement), true)
        const motion = await trigger.evaluate(node=>getComputedStyle(node).animationName)
        assert.equal(motion, 'none')
        assert.equal(await trigger.evaluate(node=>node.getBoundingClientRect().height >= 44), true)
        await page.evaluate(()=>scrollTo(0,0))
        if (media) await page.screenshot({ path:`${media}/evidence-${width}x${height}-${theme}.png` })
        await page.goto(`${url}/clinical-review/index.html`)
        await page.getByRole('button', { name:'Approve', exact:true }).first().waitFor()
        await page.getByLabel('Theme', { exact:true }).selectOption(theme)
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth), true)
        assert.match(await page.locator('main').innerText(), /Clinical review by Kevin Madden, PharmD is pending/)
        if (media) await page.screenshot({ path:`${media}/review-${width}x${height}-${theme}.png` })
        await page.getByRole('button', { name:'Approve', exact:true }).first().focus()
        await page.keyboard.press('Enter')
        assert.match(await page.locator('#counts').innerText(), /1 \/ 9 approved/)
        const downloadWait = page.waitForEvent('download')
        await page.getByRole('button', { name:'Export JSON' }).click()
        const download = await downloadWait
        const stream = await download.createReadStream()
        const chunks = []
        for await (const chunk of stream) chunks.push(chunk)
        const exported = JSON.parse(Buffer.concat(chunks).toString())
        assert.equal(exported.repo, 'kvmadden/vax-or-fiction-game')
        assert.equal(exported.snapshotHash.length, 64)
        await page.reload()
        await page.getByRole('button', { name:'Approve', exact:true }).first().waitFor()
        assert.match(await page.locator('#counts').innerText(), /1 \/ 9 approved/)
        // Import the actual downloaded export, then reject a source/hash change.
        await page.locator('#import').setInputFiles({ name:'roundtrip.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(exported)) })
        await page.getByText('Imported review snapshot. Existing decisions replaced.').waitFor()
        exported.snapshotHash = 'stale-source-hash'
        await page.locator('#import').setInputFiles({ name:'stale.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(exported)) })
        await page.getByText(/Import failed:/).waitFor()
      } finally { await context.close() }
    }
  })
})
