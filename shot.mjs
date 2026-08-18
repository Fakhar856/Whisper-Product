import { chromium } from 'playwright-core'
import fs from 'fs'

const PORT = process.argv[2] || '5173'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' })
await page.evaluate(() => new Promise((resolve, reject) => {
  const start = Date.now()
  const tick = () => {
    const mask = document.querySelector('.sharpie-viewer-mask')
    if (mask && mask.className.includes('sharpie-viewer-mask-hidden') && parseFloat(getComputedStyle(mask).opacity) < 0.05) {
      return resolve()
    }
    if (Date.now() - start > 90000) return reject(new Error('mask never hid'))
    setTimeout(tick, 150)
  }
  tick()
}))
await page.waitForTimeout(500)
fs.writeFileSync('d:/whisper-product/shot.png', await page.screenshot({ timeout: 20000 }))
await browser.close()
console.log('saved')
