const HTTP_CLEANUP_MARKER_KEY = 'curiosity:lms:http-cleanup:v1'

const LEGACY_LOCAL_KEYS = [
  'curiosity:lms:quiz-bank:v1',
  'curiosity:lms:course-management:v1',
  'curiosity:lms:course-management:permissions:v1',
  'curiosity:lms:course-management:jobs:v1',
  'curiosity:lms:course-management:dlq:v1',
  'curiosity:lms:telemetry:v1',
  'curiosity:lms:notification-channels:v1',
  'curiosity:lms:notification-delivery-logs:v1',
  'curiosity:lms:certificates:v2',
  'curiosity:lms:certificate-templates:v1',
  'curiosity:lms:certificate-issuance:v1',
]

export const runStartupMaintenance = (adapterMode = 'local') => {
  if (adapterMode !== 'http' || typeof localStorage === 'undefined') return
  if (localStorage.getItem(HTTP_CLEANUP_MARKER_KEY) === 'done') return

  LEGACY_LOCAL_KEYS.forEach((key) => {
    localStorage.removeItem(key)
  })
  localStorage.setItem(HTTP_CLEANUP_MARKER_KEY, 'done')
}

