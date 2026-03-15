const toBool = (value, fallback) => {
  if (value == null || value === '') return fallback
  const normalized = String(value).trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return fallback
}

export const isSimplifiedMode = toBool(import.meta.env.VITE_SIMPLIFIED_MODE, true)

export const featureFlags = {
  // Certificate tetap aktif di mode simple, kecuali di-disable eksplisit via env.
  certificateManagement: toBool(import.meta.env.VITE_FEATURE_CERTIFICATES, true),
  userAdvancedAdmin: toBool(import.meta.env.VITE_FEATURE_USER_ADVANCED_ADMIN, !isSimplifiedMode),
  quizBulkManagement: toBool(import.meta.env.VITE_FEATURE_QUIZ_BULK, !isSimplifiedMode),
  courseEnterprisePanels: toBool(import.meta.env.VITE_FEATURE_COURSE_ENTERPRISE, !isSimplifiedMode),
  certificateAdvancedFlow: toBool(import.meta.env.VITE_FEATURE_CERTIFICATE_ADVANCED, !isSimplifiedMode),
}
