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

const seedPlaybackQueue = async (page, items) => {
  await page.evaluate((queueItems) => {
    localStorage.setItem('curiosity:lms:playback-sync-queue:v1', JSON.stringify(queueItems))
  }, items)
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

    // Scenario 3: prerequisite editor validates invalid self-reference and can save valid rule
    {
      const context = await browser.newContext()
      const page = await context.newPage()
      await loginAsAdmin(page)
      await page.goto(`${BASE_URL}/courses/ui-101?tab=material`, { waitUntil: 'networkidle' })
      const editor = page.locator('.prerequisite-editor-card').first()
      await editor.waitFor({ state: 'visible' })
      const targetModuleSelect = editor.locator('select.assignment-select').first()
      const targetModuleId = await targetModuleSelect.inputValue()
      const saveBtn = editor.getByRole('button', { name: /Save Prerequisite/i })
      await editor.getByRole('button', { name: /Default Sequence/i }).click()
      const firstRuleTargetSelect = editor.locator('.prerequisite-rule-item select.assignment-select').nth(1)
      await firstRuleTargetSelect.selectOption(targetModuleId)
      const disabledInvalid = await saveBtn.isDisabled()
      if (!disabledInvalid) {
        throw new Error('Expected Save Prerequisite to be disabled when rule references the same target module.')
      }
      const options = await firstRuleTargetSelect.locator('option').all()
      let fallbackValue = ''
      for (const option of options) {
        const value = await option.getAttribute('value')
        if (value && value !== targetModuleId) {
          fallbackValue = value
          break
        }
      }
      if (!fallbackValue) {
        throw new Error('Could not find fallback module option for prerequisite validation scenario.')
      }
      await firstRuleTargetSelect.selectOption(fallbackValue)
      await editor.getByRole('button', { name: /Fast Track/i }).click()
      const disabledValid = await saveBtn.isDisabled()
      if (disabledValid) {
        throw new Error('Expected Save Prerequisite to be enabled for valid prerequisite rule.')
      }
      await saveBtn.click()
      await context.close()
    }

    // Scenario 4: queued playback sync is flushed after online event
    {
      const context = await browser.newContext()
      const page = await context.newPage()
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
      await page.fill('input[type="email"]', 'indra@curiosity.app')
      await page.fill('input[type="password"]', 'admin123')
      await page.getByRole('button', { name: /Sign In/i }).click()
      await page.waitForURL((url) => url.pathname === '/')
      await seedPlaybackQueue(page, [
        {
          id: 'pbq-e2e-1',
          courseId: 'ui-101',
          lessonId: 'ui-101-l1',
          userScopeId: 'u-001',
          payload: {
            positionSec: 32,
            durationSec: 120,
            markCompleted: false,
          },
          queuedAt: new Date().toISOString(),
          attempts: 0,
          nextRetryAt: new Date(Date.now() + 1200).toISOString(),
        },
      ])
      await page.goto(`${BASE_URL}/courses/ui-101?lesson=ui-101-l1&tab=material`, { waitUntil: 'networkidle' })
      const beforeCount = await page.evaluate(() => {
        try {
          const raw = localStorage.getItem('curiosity:lms:playback-sync-queue:v1')
          const parsed = raw ? JSON.parse(raw) : []
          return Array.isArray(parsed) ? parsed.length : 0
        } catch {
          return 0
        }
      })
      if (beforeCount < 1) {
        throw new Error('Expected playback sync queue to contain pending item before online flush.')
      }
      await page.waitForTimeout(1400)
      await page.evaluate(() => window.dispatchEvent(new Event('online')))
      await page.waitForTimeout(800)
      const afterCount = await page.evaluate(() => {
        try {
          const raw = localStorage.getItem('curiosity:lms:playback-sync-queue:v1')
          const parsed = raw ? JSON.parse(raw) : []
          return Array.isArray(parsed) ? parsed.length : 0
        } catch {
          return 0
        }
      })
      if (afterCount !== 0) {
        throw new Error('Expected playback sync queue to be empty after online flush succeeds.')
      }
      await context.close()
    }

    await browser.close()
    console.log('E2E passed: course player gating, prerequisite editor, and sync queue behavior.')
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
