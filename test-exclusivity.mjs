import { chromium } from 'playwright-core'

const PORT = process.argv[2] || '5173'
const url = `http://localhost:${PORT}/`

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
page.on('pageerror', (err) => console.log('[pageerror]', err.message))

await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => typeof window.__debugClickPen === 'function', { timeout: 60000 })

// All waiting happens inside the browser via setInterval polling, so there's
// only one slow CDP round-trip per stage instead of many.
async function waitFor(predicateSrc, timeoutMs = 60000) {
  return page.evaluate(
    ({ predicateSrc, timeoutMs }) => new Promise((resolve, reject) => {
      const predicate = new Function('s', `return (${predicateSrc})(s)`)
      const start = Date.now()
      const tick = () => {
        const s = window.__debugPenState()
        if (predicate(s)) return resolve(s)
        if (Date.now() - start > timeoutMs) return reject(new Error('timeout, last state: ' + JSON.stringify(s)))
        setTimeout(tick, 100)
      }
      tick()
    }),
    { predicateSrc, timeoutMs },
  )
}

console.log('initial:', JSON.stringify(await page.evaluate(() => window.__debugPenState())))

await page.evaluate(() => window.__debugClickPen(0))
console.log('after pen0 up:', JSON.stringify(await waitFor('s => s.pens[0].isOut && !s.pens[0].isAnimating')))

await page.evaluate(() => window.__debugClickPen(1))
console.log('after switching to pen1:', JSON.stringify(await waitFor(
  's => s.pens[1].isOut && !s.pens[1].isAnimating && !s.pens[0].isOut && !s.pens[0].isAnimating && s.active === 1'
)))

await page.evaluate(() => window.__debugClickPen(1))
console.log('after putting pen1 down:', JSON.stringify(await waitFor('s => !s.pens[1].isOut && !s.pens[1].isAnimating && s.active === null')))

// Rapid-switch: click pen2, then pen3 while pen2 is still mid-rise.
await page.evaluate(() => window.__debugClickPen(2))
await new Promise((r) => setTimeout(r, 150))
console.log('pen2 mid-rise:', JSON.stringify(await page.evaluate(() => window.__debugPenState())))
await page.evaluate(() => window.__debugClickPen(3))
console.log('after rapid switch pen2->pen3:', JSON.stringify(await waitFor(
  's => s.pens[3].isOut && !s.pens[3].isAnimating && !s.pens[2].isOut && !s.pens[2].isAnimating && s.active === 3'
)))

await browser.close()
console.log('PASS: all exclusivity checks succeeded')
