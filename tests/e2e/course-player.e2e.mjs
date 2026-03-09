import { spawn } from 'node:child_process'
import process from 'node:process'
import { chromium } from 'playwright'

const HOST = '127.0.0.1'
const PORT = 4173
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

const findCompleteButton = async (page) => {
  const direct = page.getByRole('button', { name: /Complete & Next|Mark as Complete/i })
  if ((await direct.count()) > 0) return direct.first()
  return page.locator('button.primary-btn').filter({ hasText: /Complete & Next|Mark as Complete/i }).first()
}

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

    // Scenario 1: first lesson video is gated (complete button disabled before enough watch progress)
    {
      const context = await browser.newContext()
      const page = await context.newPage()
      await loginAsAdmin(page)
      await page.goto(`${BASE_URL}/courses/ui-101?lesson=ui-101-l1&tab=material`, { waitUntil: 'networkidle' })
      const completeBtn = await findCompleteButton(page)
      const disabled = await completeBtn.isDisabled()
      if (!disabled) {
        throw new Error('Expected complete button to be disabled on first load for video lesson gating.')
      }
      await context.close()
    }

    // Scenario 2: with seeded playback >= 90%, complete button becomes enabled after login
    {
      const context = await browser.newContext()
      const page = await context.newPage()
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
      await page.evaluate(() => {
        localStorage.setItem(
          'curiosity:lms:course-progress:v1',
          JSON.stringify({
            'u-001': {
              'ui-101': {
                completedLessonIds: [],
                activeLessonId: 'ui-101-l1',
                lessonPlayback: {
                  'ui-101-l1': {
                    positionSec: 108,
                    durationSec: 120,
                    watchedSec: 108,
                    watchedRanges: [{ start: 0, end: 108 }],
                    progressPercent: 90,
                  },
                },
                studyEvents: [],
              },
            },
          }),
        )
      })
      await page.fill('input[type="email"]', 'indra@curiosity.app')
      await page.fill('input[type="password"]', 'admin123')
      await page.getByRole('button', { name: /Sign In/i }).click()
      await page.waitForURL((url) => url.pathname === '/')
      await page.goto(`${BASE_URL}/courses/ui-101?lesson=ui-101-l1&tab=material`, { waitUntil: 'networkidle' })
      const completeBtn = await findCompleteButton(page)
      const disabled = await completeBtn.isDisabled()
      if (disabled) {
        throw new Error('Expected complete button to be enabled when playback progress is seeded to >= 90%.')
      }
      await context.close()
    }

    await browser.close()
    console.log('E2E passed: course player gating and resume behavior.')
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
