import { spawn } from 'node:child_process'
import process from 'node:process'
import { chromium } from 'playwright'

const HOST = '127.0.0.1'
const PORT = 4174
const BASE_URL = `http://${HOST}:${PORT}`

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const waitForServer = async (url, timeoutMs = 30_000) => {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      // retry
    }
    await sleep(300)
  }
  throw new Error(`Timed out waiting for server: ${url}`)
}

const startDevServer = () =>
  spawn('npm', ['run', 'dev', '--', '--host', HOST, '--port', String(PORT), '--strictPort'], {
    stdio: 'pipe',
    env: {
      ...process.env,
      FORCE_COLOR: '0',
    },
  })

const loginAsAdmin = async (page) => {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' })
  await page.fill('input[type="email"]', 'indra@curiosity.app')
  await page.fill('input[type="password"]', 'admin123')
  await page.getByRole('button', { name: /Sign In/i }).click()
  await page.waitForURL((url) => url.pathname === '/')
}

const run = async () => {
  const server = startDevServer()
  let serverOutput = ''
  server.stdout.on('data', (chunk) => {
    serverOutput += chunk.toString()
  })
  server.stderr.on('data', (chunk) => {
    serverOutput += chunk.toString()
  })

  try {
    await waitForServer(`${BASE_URL}/login`)
    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext()
    const page = await context.newPage()

    await loginAsAdmin(page)
    await page.goto(`${BASE_URL}/management/courses`, { waitUntil: 'networkidle' })
    await page.getByRole('heading', { name: /Course Management/i }).first().waitFor({ state: 'visible' })
    const advancedToggle = page.getByLabel('Advanced Mode')
    await advancedToggle.waitFor({ state: 'visible' })

    await page.getByRole('button', { name: 'New Course' }).click()
    if (await advancedToggle.isChecked()) {
      await advancedToggle.click()
    }

    const assetsSectionHidden = page.locator('.quiz-editor-section').filter({ hasText: '3. Content & Assets' }).first()
    await assetsSectionHidden.waitFor({ state: 'hidden' })

    await page.reload({ waitUntil: 'networkidle' })
    await advancedToggle.waitFor({ state: 'visible' })
    if (await advancedToggle.isChecked()) {
      throw new Error('Expected Advanced toggle state to persist as unchecked after reload.')
    }
    await assetsSectionHidden.waitFor({ state: 'hidden' })

    await advancedToggle.click()
    if (!(await advancedToggle.isChecked())) {
      throw new Error('Expected Advanced toggle to be checked after user toggles it on.')
    }

    const infoSection = page.locator('.quiz-editor-section').filter({ hasText: '1. Course Info' }).first()
    await infoSection.getByLabel('Slug').fill(`cm-e2e-${Date.now()}`)
    await infoSection.getByLabel('Title').fill('Course E2E Management')
    await infoSection.getByLabel('Description').fill('Course untuk validasi end-to-end management dashboard automation dengan data yang cukup panjang.')
    await infoSection.getByLabel('Thumbnail URL').fill('https://images.example.com/thumb-e2e.jpg')
    await page.getByRole('button', { name: /Save Course/i }).click()
    await page.waitForTimeout(300)

    await infoSection.getByLabel('Title').fill('Course E2E Management V2')
    await page.getByRole('button', { name: '+ Add Module' }).click()
    await page.getByRole('button', { name: /Save Course/i }).click()
    await page.waitForTimeout(300)

    const revisionSection = page.locator('.quiz-editor-section').filter({ hasText: 'Revision History' }).first()
    await revisionSection.getByRole('button', { name: /Refresh/i }).click()
    await page.waitForTimeout(300)

    const diffSection = page.locator('.quiz-editor-section').filter({ hasText: 'Revision Diff Viewer' }).first()
    await diffSection.waitFor({ state: 'visible' })
    const targetSelect = diffSection.getByLabel('Target Revision')
    const options = await targetSelect.locator('option').count()
    if (options < 2) {
      throw new Error('Expected revision diff target to contain at least one revision snapshot.')
    }
    await targetSelect.selectOption({ index: 1 })
    await page.waitForTimeout(120)

    const changedPill = diffSection.locator('.cm-diff-kpi .pill').first()
    const changedText = (await changedPill.innerText()).trim()
    const changedMatch = changedText.match(/(\d+)/)
    const changedCount = changedMatch ? Number(changedMatch[1]) : 0
    if (!Number.isFinite(changedCount) || changedCount < 1) {
      throw new Error('Expected revision diff to report at least one changed field.')
    }

    const observabilitySection = page.locator('.quiz-editor-section').filter({ hasText: 'Observability Dashboard' }).first()
    await observabilitySection.waitFor({ state: 'visible' })
    await observabilitySection.getByRole('button', { name: /Refresh/i }).click()
    await page.waitForTimeout(300)

    const totalPill = observabilitySection.locator('.cm-observability-kpi .pill').first()
    const totalText = (await totalPill.innerText()).trim()
    const totalMatch = totalText.match(/(\d+)/)
    const totalCount = totalMatch ? Number(totalMatch[1]) : 0
    if (!Number.isFinite(totalCount) || totalCount < 1) {
      throw new Error('Expected observability dashboard total events to be greater than 0.')
    }

    const integritySection = page.locator('.assignment-policy-card').filter({ hasText: 'Content Integrity Automation' }).first()
    await integritySection.getByRole('button', { name: /Run Integrity Scan/i }).click()
    await page.waitForTimeout(180)
    const integrityText = await integritySection.innerText()
    if (!/Broken links:/i.test(integrityText) || !/Duplicate lesson IDs:/i.test(integrityText)) {
      throw new Error('Expected content integrity summary to be rendered.')
    }

    const analyticsSection = page.locator('.quiz-editor-section').filter({ hasText: 'Author Analytics' }).first()
    await analyticsSection.waitFor({ state: 'visible' })
    const analyticsText = await analyticsSection.innerText()
    if (!/Draft Count:/i.test(analyticsText) || !/Checklist Failure Rate:/i.test(analyticsText)) {
      throw new Error('Expected author analytics KPI to be visible.')
    }

    await context.close()
    await browser.close()
    console.log('E2E passed: course management observability and revision diff viewer.')
  } catch (error) {
    console.error('E2E failed:', error instanceof Error ? error.message : String(error))
    if (serverOutput.trim()) {
      console.error('Server output:')
      console.error(serverOutput)
    }
    throw error
  } finally {
    server.kill('SIGTERM')
  }
}

run().catch(() => {
  process.exitCode = 1
})
