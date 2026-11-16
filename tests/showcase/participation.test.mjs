import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync } from 'node:fs'
import { withViteAndBrowser } from '../integration/render-harness.mjs'
const fixture = JSON.parse(readFileSync(new URL('./replay.json', import.meta.url),'utf8'))
const media = process.env.VOF_SHOWCASE_MEDIA
if (media) mkdirSync(media, { recursive:true })
test('frozen round uses actual relay, changed votes, reconnect, source access and idempotent scoring on phones', { timeout:120000 }, async () => {
  await withViteAndBrowser({ headless:process.env.VOF_VISIBLE !== '1' }, async ({ browser, url }) => {
    const hostContext = await browser.newContext({ viewport:{width:1440,height:900}, reducedMotion:'reduce' })
    const phoneContext = await browser.newContext({ viewport:{width:390,height:844}, reducedMotion:'reduce' })
    try {
      for (const context of [hostContext,phoneContext]) await context.addInitScript(()=>{
        localStorage.setItem('vrc_audio_muted','true')
        Object.defineProperty(globalThis,'BroadcastChannel',{ value:undefined })
      })
      const host = await hostContext.newPage()
      const phone = await phoneContext.newPage()
      const room = 'VAX8'
      const capture = async name => { if (media) await phone.screenshot({ path:`${media}/${name}.png` }) }
      await host.goto(`${url}/?room=${room}&host=1&deck=influenza&mode=full&venue=teams`)
      await host.getByRole('heading',{name:'Your game is ready'}).waitFor()
      await phone.goto(`${url}/?vote=1&room=${room}`)
      await phone.locator('[data-role="phone-connection-status"]').filter({hasText:'connected'}).waitFor()
      await capture('flow-01-join')
      await phone.locator('[data-role="nickname-input"]').fill('Player One')
      await phone.locator('[data-role="join-submit-btn"]').click()
      await phone.locator('[data-role="phone-join"]').waitFor({state:'detached'})
      await capture('flow-02-lobby')
      await host.evaluate(async ()=>{
        const { useGameStore } = await import('/src/store/game-store.ts')
        if (useGameStore.getState().selectedDeckId !== 'influenza') throw Error('Showcase launch did not select influenza')
        if (useGameStore.getState().timer.enabled) throw Error('Showcase launch must be untimed')
        const state = useGameStore.getState()
        const questions = state.run.filter(q=>q.kind)
        useGameStore.setState({run:questions,slideIndex:0,phase:'entering',offlineMode:false,interactionMode:'polling',votesLocked:false,leaderboardEnabled:false,
          timer:{...state.timer,running:false,enabled:false,visible:false}})
      })
      const dispatch = type => host.evaluate(async type=>{
        const { useGameStore } = await import('/src/store/game-store.ts')
        useGameStore.getState().dispatch({type})
      },type)
      for (let i=0;i<8;i++) {
        await phone.locator('[data-role="question-stem"]').waitFor()
        if (i===0) {
          await capture('flow-03-question')
          await phone.locator(`[data-choice="${fixture.wrong[i]}"]`).click()
          await phone.locator('[data-role="vote-confirmation-badge"][data-state="in"]').waitFor()
          await phone.getByRole('button', {name:'Change answer',exact:true}).click()
        }
        await phone.locator(`[data-choice="${fixture.correct[i]}"]`).click()
        await phone.locator('[data-role="vote-confirmation-badge"][data-state="in"]').waitFor()
        if (i===0) {
          await capture('flow-04-voted')
          await phone.reload()
          await phone.locator('[data-role="vote-confirmation-badge"][data-state="in"]').waitFor()
          await phone.getByRole('button', {name:'Change answer',exact:true}).click()
          await phone.locator(`[data-choice="${fixture.correct[i]}"]`).click()
        }
        await host.waitForFunction(async ({index,choice})=>{
          const { useGameStore } = await import('/src/store/game-store.ts')
          const s = useGameStore.getState()
          const entries = Object.values(s.pollVoters[s.run[index].id] ?? {})
          return entries.length===1 && entries[0].choice===choice
        },{index:i,choice:fixture.correct[i]})
        await dispatch('LOCK_VOTES')
        if (i===0) await host.keyboard.press('Enter')
        else await dispatch('REVEAL')
        await phone.locator('[data-role="outcome-banner"]').waitFor()
        assert.ok((await phone.locator('[data-role="canonical-verdict"]').innerText()).trim().length > 0, 'The result has a written verdict')
        assert.ok((await phone.locator('[data-role="phone-reveal-outcome"]').innerText()).trim().length > 0, 'Correctness is communicated in words without color or sound')
        assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
        if (i===0) await capture('flow-05-result')
        await dispatch('ADVANCE')
        await phone.locator('[data-role="takeaway-card"]').waitFor()
        const source = phone.locator('[data-role="reveal-citations"] a').first()
        await source.waitFor()
        assert.match(await source.innerText(), /Public domain prose/)
        await source.focus()
        assert.equal(await source.evaluate(node=>node===document.activeElement),true)
        assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
        if (i===0) {
          const trigger = host.getByRole('button', {name:'Details & sources',exact:true})
          let reached = false
          for (let index=0;index<12 && !reached;index++) {
            await host.keyboard.press('Tab')
            reached = await trigger.evaluate(node=>node===document.activeElement)
          }
          assert.equal(reached,true,'Host source control is keyboard reachable')
          await host.keyboard.press('Enter')
          const dialog = host.getByRole('dialog',{name:'Details & sources',exact:true})
          await dialog.waitFor()
          const hostSource = dialog.getByRole('link').first()
          await hostSource.focus()
          assert.equal(await hostSource.evaluate(node=>node===document.activeElement),true)
          await host.keyboard.press('Escape')
          await dialog.waitFor({state:'hidden'})
          assert.equal(await trigger.evaluate(node=>node===document.activeElement),true)
          await capture('flow-06-evidence')
          if (media) await host.screenshot({path:`${media}/host-1440x900-dark.png`})
          for (const width of [430,390]) {
            await phone.setViewportSize({width,height:width===430?932:844})
            assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
            if (media) await phone.screenshot({path:`${media}/phone-${width}-evidence-dark.png`})
          }
        }
        if (i<7) await dispatch('ADVANCE')
      }
      const score = await host.evaluate(async ()=>{
        const { useGameStore } = await import('/src/store/game-store.ts')
        return Object.values(useGameStore.getState().seenDevices)[0].score
      })
      assert.equal(score,950)
      await dispatch('BACK')
      await dispatch('ADVANCE')
      const repeatScore = await host.evaluate(async ()=>{
        const { useGameStore } = await import('/src/store/game-store.ts')
        return Object.values(useGameStore.getState().seenDevices)[0].score
      })
      assert.equal(repeatScore,950)
    } finally { await phoneContext.close(); await hostContext.close() }
  })
})
