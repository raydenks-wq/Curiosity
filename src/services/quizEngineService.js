import { quizCatalogService } from './quizCatalogService'

const QUIZ_ATTEMPT_KEY = 'curiosity:lms:quiz-attempts:v1'

const readJson = (key, fallback) => {
  if (typeof localStorage === 'undefined') return fallback
  const raw = localStorage.getItem(key)
  if (!raw) return fallback
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

const writeJson = (key, value) => {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(key, JSON.stringify(value))
}

const shuffle = (list) => {
  const next = [...list]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = next[i]
    next[i] = next[j]
    next[j] = tmp
  }
  return next
}

const getUserKey = (userId) => String(userId || 'guest')

const readAttempts = () => readJson(QUIZ_ATTEMPT_KEY, {})

const getHistory = (quizId, userId) => {
  const all = readAttempts()
  const userKey = getUserKey(userId)
  const scoped = all[userKey] || {}
  return Array.isArray(scoped[quizId]) ? scoped[quizId] : []
}

const writeHistory = (quizId, userId, history) => {
  const all = readAttempts()
  const userKey = getUserKey(userId)
  const scoped = all[userKey] || {}
  all[userKey] = {
    ...scoped,
    [quizId]: history,
  }
  writeJson(QUIZ_ATTEMPT_KEY, all)
}

const createSession = (quiz, attemptNo) => {
  const now = Date.now()
  const questions = shuffle(quiz.questions).map((question) => {
    const optionPairs = question.options.map((label, index) => ({ label, index }))
    const shuffledOptions = shuffle(optionPairs)
    return {
      id: question.id,
      title: question.title,
      explanation: question.explanation,
      options: shuffledOptions.map((item, optionIndex) => ({
        id: `${question.id}-opt-${optionIndex}`,
        label: item.label,
        sourceIndex: item.index,
      })),
      correctIndex: question.correctIndex,
    }
  })

  return {
    quizId: quiz.id,
    title: quiz.title,
    description: quiz.description,
    passingScore: quiz.passingScore,
    maxAttempts: quiz.maxAttempts,
    attemptNo,
    sessionId: `quizsess-${Math.random().toString(36).slice(2, 12)}`,
    startedAt: now,
    expiresAt: now + quiz.timeLimitSec * 1000,
    questions,
  }
}

export const quizEngineService = {
  getQuizMeta(quizId) {
    return quizCatalogService.getQuizById(quizId) || quizCatalogService.getFallbackQuiz()
  },

  getHistory(quizId, userId) {
    return getHistory(quizId, userId)
  },

  start(quizId, userId, { retake = false } = {}) {
    const quiz = quizCatalogService.getQuizById(quizId) || quizCatalogService.getFallbackQuiz()
    const history = getHistory(quiz.id, userId)
    const attemptsUsed = history.length
    if (retake && attemptsUsed >= quiz.maxAttempts) {
      const error = new Error('Batas retake sudah tercapai.')
      error.code = 'MAX_ATTEMPT'
      throw error
    }
    const attemptNo = attemptsUsed + 1
    return createSession(quiz, attemptNo)
  },

  submit({ session, answers, userId, forced = false }) {
    const now = Date.now()
    const expired = now > session.expiresAt
    const timedOut = expired || forced

    const details = session.questions.map((question) => {
      const selectedOptionId = answers[question.id] || ''
      const selectedOption = question.options.find((option) => option.id === selectedOptionId) || null
      const isCorrect = selectedOption ? selectedOption.sourceIndex === question.correctIndex : false
      const correctOption = question.options.find((option) => option.sourceIndex === question.correctIndex) || null

      return {
        questionId: question.id,
        title: question.title,
        selectedOptionId,
        selectedLabel: selectedOption?.label || '',
        correctLabel: correctOption?.label || '',
        isCorrect,
        explanation: question.explanation,
      }
    })

    const correctCount = details.filter((item) => item.isCorrect).length
    const total = details.length
    const score = total ? Math.round((correctCount / total) * 100) : 0
    const passed = !timedOut && score >= session.passingScore

    const history = getHistory(session.quizId, userId)
    const attempt = {
      id: `attempt-${Math.random().toString(36).slice(2, 10)}`,
      attemptNo: session.attemptNo,
      score,
      passed,
      timedOut,
      correctCount,
      total,
      submittedAt: new Date().toISOString(),
      details,
    }
    const nextHistory = [attempt, ...history].slice(0, 20)
    writeHistory(session.quizId, userId, nextHistory)

    return {
      ...attempt,
      passingScore: session.passingScore,
      remainingAttempts: Math.max(session.maxAttempts - nextHistory.length, 0),
      canRetake: nextHistory.length < session.maxAttempts,
    }
  },
}
