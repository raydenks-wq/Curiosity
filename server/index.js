import bcrypt from 'bcryptjs'
import cors from 'cors'
import express from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import jwt from 'jsonwebtoken'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DB_DIR = path.join(__dirname, 'data')
const isTestEnv = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST)
const defaultDbName = isTestEnv ? `db.test.${process.pid}.json` : 'db.json'
const DB_PATH = process.env.DB_PATH || path.join(DB_DIR, defaultDbName)

const PORT = Number(process.env.PORT || 3000)
const JWT_SECRET = process.env.JWT_SECRET || 'curiosity-dev-secret'
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '12h'
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*'
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 10)

const allowedOrigins = CORS_ORIGIN === '*' ? '*' : CORS_ORIGIN.split(',').map((v) => v.trim()).filter(Boolean)

const accessLevels = {
  admin: 'Admin',
  instructor: 'Instructor',
  student: 'Student',
}

const roles = ['admin', 'instructor', 'student']
const statuses = ['active', 'suspended', 'pending']

const defaultUsers = [
  {
    id: 'u-001',
    name: 'Indra Permana',
    email: 'indra@curiosity.app',
    role: 'admin',
    status: 'active',
    lastLogin: '2026-03-09 08:20',
  },
  {
    id: 'u-002',
    name: 'Ayu Pratama',
    email: 'ayu@curiosity.app',
    role: 'instructor',
    status: 'active',
    lastLogin: '2026-03-08 21:17',
  },
  {
    id: 'u-003',
    name: 'Raka Wijaya',
    email: 'raka@curiosity.app',
    role: 'student',
    status: 'active',
    lastLogin: '2026-03-08 19:44',
  },
  {
    id: 'u-004',
    name: 'Nadia Putri',
    email: 'nadia@curiosity.app',
    role: 'student',
    status: 'suspended',
    lastLogin: '2026-03-03 11:08',
  },
]

const defaultCredentialsPlain = {
  'indra@curiosity.app': 'admin123',
  'ayu@curiosity.app': 'instructor123',
  'raka@curiosity.app': 'student123',
}

const defaultPermissionMatrix = {
  admin: {
    viewDashboard: true,
    manageCourse: true,
    manageQuiz: true,
    manageUsers: true,
  },
  instructor: {
    viewDashboard: true,
    manageCourse: true,
    manageQuiz: true,
    manageUsers: false,
  },
  student: {
    viewDashboard: true,
    manageCourse: false,
    manageQuiz: false,
    manageUsers: false,
  },
}

const defaultCourseCatalog = [
  {
    id: 'ui-101',
    title: 'UI Design Fundamentals',
    description: 'Dasar komposisi, warna, tipografi, dan hierarchy.',
    tag: 'Design',
    gradient: 'linear-gradient(120deg, #0081a7, #00afb9)',
    instructor: 'Ayu Pratama',
    modules: [
      {
        id: 'ui-101-m1',
        title: 'Foundations',
        lessons: [
          {
            id: 'ui-101-l1',
            title: 'Intro to Visual Hierarchy',
            duration: '12m',
            type: 'video',
            summary: 'Memahami prinsip hierarchy untuk layout yang mudah dipahami.',
            resources: ['Hierarchy Checklist.pdf', 'Reference Board.fig'],
          },
          {
            id: 'ui-101-l2',
            title: 'Typography Pairing',
            duration: '16m',
            type: 'video',
            summary: 'Kombinasi font headline-body untuk readability.',
            resources: ['Type Scale Guide.pdf'],
          },
          {
            id: 'ui-101-l3',
            title: 'Color Contrast in UI',
            duration: '14m',
            type: 'video',
            summary: 'Praktik kontras warna agar aksesibel dan konsisten brand.',
            resources: ['WCAG Contrast Card.pdf'],
          },
          {
            id: 'ui-101-l4',
            title: 'Grid and Spacing System',
            duration: '18m',
            type: 'workshop',
            summary: 'Membuat 8pt grid untuk desain yang rapi dan scalable.',
            resources: ['8pt Grid Template.fig'],
          },
        ],
      },
    ],
  },
  {
    id: 'fe-101',
    title: 'Frontend for Designer',
    description: 'HTML, CSS, dan Vue komponen untuk prototyping.',
    tag: 'Code',
    gradient: 'linear-gradient(120deg, #fb8500, #ffb703)',
    instructor: 'Rafi Nugraha',
    modules: [
      {
        id: 'fe-101-m1',
        title: 'HTML/CSS Core',
        lessons: [
          {
            id: 'fe-101-l1',
            title: 'Semantic HTML Basics',
            duration: '10m',
            type: 'video',
            summary: 'Struktur HTML yang benar untuk SEO dan aksesibilitas.',
            resources: ['Semantic Tag Cheat Sheet.pdf'],
          },
          {
            id: 'fe-101-l2',
            title: 'Responsive Layout with CSS Grid',
            duration: '20m',
            type: 'video',
            summary: 'Membangun layout adaptif untuk desktop dan mobile.',
            resources: ['Grid Playground.zip'],
          },
        ],
      },
    ],
  },
  {
    id: 'pm-101',
    title: 'Product Thinking',
    description: 'Menyusun roadmap fitur berbasis kebutuhan user.',
    tag: 'Product',
    gradient: 'linear-gradient(120deg, #8338ec, #3a86ff)',
    instructor: 'Nadia Putri',
    modules: [
      {
        id: 'pm-101-m1',
        title: 'Discovery',
        lessons: [
          {
            id: 'pm-101-l1',
            title: 'Problem Framing',
            duration: '11m',
            type: 'video',
            summary: 'Teknik menyusun problem statement berbasis user impact.',
            resources: ['Problem Framing Canvas.pdf'],
          },
          {
            id: 'pm-101-l2',
            title: 'Prioritization Matrix',
            duration: '15m',
            type: 'workshop',
            summary: 'Skoring impact vs effort untuk memilih prioritas fitur.',
            resources: ['Prioritization Matrix.xlsx'],
          },
        ],
      },
    ],
  },
]

const defaultQuizCatalog = [
  {
    id: 'ui-101',
    courseId: 'ui-101',
    moduleId: 'ui-101-m1',
    title: 'Quiz UI Design Fundamentals',
    description: 'Evaluasi pemahaman konsep visual hierarchy, typography, dan layout dasar.',
    passingScore: 70,
    maxAttempts: 3,
    timeLimitSec: 8 * 60,
    questions: [
      {
        id: 'q1',
        title: 'Apa fungsi utama visual hierarchy pada halaman dashboard?',
        options: [
          'Membuat elemen tampak penuh warna',
          'Mengatur prioritas informasi agar mudah dipindai',
          'Memastikan semua teks berukuran sama',
          'Menghapus kebutuhan navigation',
        ],
        correctIndex: 1,
        explanation: 'Hierarchy membantu user menemukan informasi paling penting lebih cepat.',
      },
      {
        id: 'q2',
        title: 'Komponen mana yang paling tepat untuk menampilkan progres belajar?',
        options: ['Modal dialog', 'Progress bar', 'Tooltip', 'Dropdown'],
        correctIndex: 1,
        explanation: 'Progress bar memberikan konteks visual yang jelas terhadap progres.',
      },
      {
        id: 'q3',
        title: 'Tujuan utama penggunaan grid system adalah...',
        options: ['Dekorasi layout', 'Konsistensi alignment dan spacing', 'Mengurangi warna', 'Memperbesar teks'],
        correctIndex: 1,
        explanation: 'Grid memastikan komponen tersusun rapi dan konsisten antar layar.',
      },
    ],
  },
  {
    id: 'ui-101-m1',
    courseId: 'ui-101',
    moduleId: 'ui-101-m1',
    title: 'Module Quiz: Foundations',
    description: 'Kuis cepat setelah modul Foundations selesai.',
    passingScore: 70,
    maxAttempts: 3,
    timeLimitSec: 6 * 60,
    questions: [
      {
        id: 'm1-q1',
        title: 'Prinsip hierarchy yang paling penting untuk halaman kursus adalah...',
        options: ['Kontras ukuran', 'Semua elemen setara', 'Random alignment', 'Warna neon'],
        correctIndex: 0,
        explanation: 'Kontras ukuran dan visual weight membantu prioritas konten.',
      },
      {
        id: 'm1-q2',
        title: 'Tujuan typography pairing adalah...',
        options: ['Agar font terlihat unik', 'Meningkatkan readability', 'Menghemat warna', 'Menaikkan SEO'],
        correctIndex: 1,
        explanation: 'Typography pairing yang tepat memudahkan membaca konten.',
      },
    ],
  },
  {
    id: 'fe-101-m1',
    courseId: 'fe-101',
    moduleId: 'fe-101-m1',
    title: 'Module Quiz: HTML/CSS Core',
    description: 'Validasi dasar semantic HTML dan responsive layout.',
    passingScore: 70,
    maxAttempts: 3,
    timeLimitSec: 6 * 60,
    questions: [
      {
        id: 'fe-q1',
        title: 'Tag semantic yang tepat untuk area navigasi adalah...',
        options: ['<div>', '<nav>', '<span>', '<article>'],
        correctIndex: 1,
        explanation: 'Tag <nav> digunakan untuk kumpulan link navigasi utama.',
      },
      {
        id: 'fe-q2',
        title: 'CSS Grid berguna untuk...',
        options: ['Menyimpan data', 'Menyusun layout 2D', 'Memanggil API', 'Membuat state global'],
        correctIndex: 1,
        explanation: 'Grid cocok untuk layout baris-kolom yang kompleks.',
      },
    ],
  },
  {
    id: 'pm-101-m1',
    courseId: 'pm-101',
    moduleId: 'pm-101-m1',
    title: 'Module Quiz: Discovery',
    description: 'Uji pemahaman problem framing dan prioritization matrix.',
    passingScore: 70,
    maxAttempts: 3,
    timeLimitSec: 6 * 60,
    questions: [
      {
        id: 'pm-q1',
        title: 'Problem statement sebaiknya berfokus pada...',
        options: ['Fitur internal', 'Outcome pengguna', 'Pilihan warna produk', 'Brand slogan'],
        correctIndex: 1,
        explanation: 'Problem statement yang baik menekankan impact bagi user.',
      },
      {
        id: 'pm-q2',
        title: 'Prioritization matrix mengevaluasi...',
        options: ['Mood tim', 'Impact vs effort', 'Jumlah slide presentasi', 'Durasi meeting'],
        correctIndex: 1,
        explanation: 'Framework ini dipakai untuk menentukan prioritas implementasi fitur.',
      },
    ],
  },
]

const loginSchema = z
  .object({
    email: z.string().email().max(160),
    password: z.string().min(6).max(128),
  })
  .strict()

const profileAccountPatchSchema = z
  .object({
    name: z.string().min(1).max(90).optional(),
    email: z.string().email().max(160).optional(),
    role: z.string().min(1).max(90).optional(),
    accessRole: z.enum(roles).optional(),
    timezone: z.string().min(1).max(80).optional(),
    avatarDataUrl: z.string().max(2_200_000).optional(),
    bio: z.string().max(400).optional(),
  })
  .strict()

const profilePreferencesPatchSchema = z
  .object({
    deadlineNotif: z.boolean().optional(),
    discussionNotif: z.boolean().optional(),
    productUpdateNotif: z.boolean().optional(),
    language: z.string().min(2).max(10).optional(),
    themeId: z.string().min(1).max(30).optional(),
  })
  .strict()

const profileStateSchema = z
  .object({
    profile: z.object({
      name: z.string().min(1).max(90),
      email: z.string().email().max(160),
      role: z.string().min(1).max(90),
      accessRole: z.enum(roles),
      timezone: z.string().min(1).max(80),
      avatarDataUrl: z.string().max(2_200_000),
      bio: z.string().max(400),
    }),
    preferences: z.object({
      deadlineNotif: z.boolean(),
      discussionNotif: z.boolean(),
      productUpdateNotif: z.boolean(),
      language: z.string().min(2).max(10),
      themeId: z.string().min(1).max(30),
    }),
    stats: z.object({
      streakDays: z.number().min(0).max(9999),
      coursesCompleted: z.number().min(0).max(9999),
      learningHours: z.number().min(0).max(999999),
    }),
    certificates: z.array(z.object({ title: z.string().max(120), issuedAt: z.string().max(40) })),
    badges: z.array(z.string().max(60)),
    progressMetrics: z.array(z.object({ label: z.string().max(80), value: z.number().min(0).max(100) })),
  })
  .strict()

const permissionMatrixSchema = z
  .object({
    admin: z.object({
      viewDashboard: z.boolean(),
      manageCourse: z.boolean(),
      manageQuiz: z.boolean(),
      manageUsers: z.boolean(),
    }),
    instructor: z.object({
      viewDashboard: z.boolean(),
      manageCourse: z.boolean(),
      manageQuiz: z.boolean(),
      manageUsers: z.boolean(),
    }),
    student: z.object({
      viewDashboard: z.boolean(),
      manageCourse: z.boolean(),
      manageQuiz: z.boolean(),
      manageUsers: z.boolean(),
    }),
  })
  .strict()

const userSaveSchema = z
  .object({
    id: z.string().min(1).max(40).optional(),
    name: z.string().min(1).max(90),
    email: z.string().email().max(160),
    role: z.enum(roles),
    status: z.enum(statuses),
  })
  .strict()

const userInviteSchema = z
  .object({
    name: z.string().min(1).max(90),
    email: z.string().email().max(160),
    role: z.enum(roles),
  })
  .strict()

const idsSchema = z
  .object({
    ids: z.array(z.string().min(1)).max(300),
  })
  .strict()

const bulkStatusSchema = z
  .object({
    ids: z.array(z.string().min(1)).max(300),
    status: z.enum(statuses),
  })
  .strict()

const passwordUpdateSchema = z
  .object({
    currentPassword: z.string().min(6).max(128),
    newPassword: z.string().min(8).max(128),
  })
  .strict()

const discussionCreateSchema = z
  .object({
    message: z.string().min(2).max(600),
    parentId: z.string().min(1).max(80).nullable().optional(),
  })
  .strict()

const discussionUpdateSchema = z
  .object({
    message: z.string().min(2).max(600),
  })
  .strict()

const quizSessionStartSchema = z
  .object({
    retake: z.boolean().optional(),
  })
  .strict()

const quizSubmitSchema = z
  .object({
    sessionId: z.string().min(1).max(100),
    answers: z.record(z.string(), z.string()).optional(),
    forced: z.boolean().optional(),
  })
  .strict()

const quizQuestionSchema = z
  .object({
    id: z.string().min(1).max(80),
    title: z.string().min(6).max(400),
    options: z.array(z.string().min(1).max(220)).min(2).max(6),
    correctIndex: z.number().int().min(0).max(5),
    explanation: z.string().max(400).optional(),
  })
  .strict()

const quizSaveSchema = z
  .object({
    id: z.string().min(1).max(80).optional(),
    courseId: z.string().min(1).max(80),
    moduleId: z.string().min(1).max(80),
    title: z.string().min(3).max(180),
    description: z.string().min(3).max(500),
    passingScore: z.number().int().min(0).max(100),
    maxAttempts: z.number().int().min(1).max(20),
    timeLimitSec: z.number().int().min(60).max(60 * 60 * 4),
    status: z.enum(['draft', 'published']).optional(),
    questions: z.array(quizQuestionSchema).min(1).max(60),
  })
  .strict()

const quizStatusSchema = z
  .object({
    status: z.enum(['draft', 'published']),
  })
  .strict()

const quizBulkStatusSchema = z
  .object({
    ids: z.array(z.string().min(1)).max(300),
    status: z.enum(['draft', 'published']),
  })
  .strict()

const createDefaultProfileState = (user) => ({
  profile: {
    name: user.name,
    email: user.email,
    role: accessLevels[user.role] || user.role,
    accessRole: user.role,
    timezone: 'Asia/Jakarta',
    avatarDataUrl: '',
    bio: 'Belajar design systems dan frontend untuk membangun pengalaman belajar yang menarik.',
  },
  preferences: {
    deadlineNotif: true,
    discussionNotif: true,
    productUpdateNotif: false,
    language: 'id',
    themeId: 'aurora',
  },
  stats: {
    streakDays: 12,
    coursesCompleted: 7,
    learningHours: 146,
  },
  certificates: [
    { title: 'UI Design Fundamentals', issuedAt: '12 Feb 2026' },
    { title: 'UX Research Essentials', issuedAt: '18 Jan 2026' },
  ],
  badges: ['Streak 12 Days', 'Quiz Master', 'Mentor Choice'],
  progressMetrics: [
    { label: 'Design Track', value: 78 },
    { label: 'Frontend Track', value: 62 },
    { label: 'Product Track', value: 83 },
  ],
})

const deepClone = (value) => JSON.parse(JSON.stringify(value))
const normalizeEmail = (value) => String(value || '').trim().toLowerCase()
const isBcryptHash = (value) => typeof value === 'string' && value.startsWith('$2')
const hashPassword = (value) => bcrypt.hash(value, BCRYPT_ROUNDS)
const shuffle = (list) => {
  const next = [...list]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = next[i]
    next[i] = next[j]
    next[j] = temp
  }
  return next
}

const nowStamp = () => {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
}

const createDefaultDb = () => {
  const profiles = Object.fromEntries(defaultUsers.map((user) => [user.id, createDefaultProfileState(user)]))
  const credentials = Object.fromEntries(
    Object.entries(defaultCredentialsPlain).map(([email, password]) => [normalizeEmail(email), bcrypt.hashSync(password, BCRYPT_ROUNDS)]),
  )

  return {
    users: deepClone(defaultUsers),
    credentials,
    permissionMatrix: deepClone(defaultPermissionMatrix),
    courses: deepClone(defaultCourseCatalog),
    quizzes: deepClone(defaultQuizCatalog),
    quizAttempts: {},
    quizSessions: {},
    courseProgress: {},
    discussions: {},
    profiles,
    revokedTokens: [],
    auditLogs: [
      {
        id: `audit-${Math.random().toString(36).slice(2, 9)}`,
        actor: 'system',
        action: 'seed_data',
        target: 'bootstrap',
        detail: 'Initial database seeded.',
        timestamp: nowStamp(),
      },
    ],
  }
}

const resetDb = async () => {
  await writeDb(createDefaultDb())
}

const hydrateDb = (db) => {
  const next = { ...db }
  next.users = Array.isArray(next.users) ? next.users : deepClone(defaultUsers)
  next.permissionMatrix = next.permissionMatrix || deepClone(defaultPermissionMatrix)
  next.courses = Array.isArray(next.courses) ? next.courses : deepClone(defaultCourseCatalog)
  next.quizzes = (Array.isArray(next.quizzes) ? next.quizzes : deepClone(defaultQuizCatalog)).map((quiz) => ({
    ...quiz,
    status: quiz.status || 'published',
  }))
  next.quizAttempts = next.quizAttempts || {}
  next.quizSessions = next.quizSessions || {}
  next.courseProgress = next.courseProgress || {}
  next.discussions = next.discussions || {}
  next.profiles = next.profiles || {}
  next.revokedTokens = Array.isArray(next.revokedTokens) ? next.revokedTokens : []
  next.auditLogs = Array.isArray(next.auditLogs) ? next.auditLogs : []
  next.credentials = next.credentials || {}

  for (const [email, value] of Object.entries(next.credentials)) {
    if (!isBcryptHash(value) && typeof value === 'string') {
      next.credentials[normalizeEmail(email)] = bcrypt.hashSync(value, BCRYPT_ROUNDS)
      if (normalizeEmail(email) !== email) {
        delete next.credentials[email]
      }
    }
  }

  return next
}

const ensureDb = async () => {
  await mkdir(DB_DIR, { recursive: true })
  try {
    const raw = await readFile(DB_PATH, 'utf-8')
    const parsed = hydrateDb(JSON.parse(raw))
    if (!parsed || typeof parsed !== 'object') throw new Error('invalid db')
    await writeFile(DB_PATH, JSON.stringify(parsed, null, 2), 'utf-8')
  } catch {
    await writeFile(DB_PATH, JSON.stringify(createDefaultDb(), null, 2), 'utf-8')
  }
}

const readDb = async () => {
  const raw = await readFile(DB_PATH, 'utf-8')
  return hydrateDb(JSON.parse(raw))
}

const writeDb = async (db) => {
  await writeFile(DB_PATH, JSON.stringify(db, null, 2), 'utf-8')
}

const toSafeUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  roleLabel: accessLevels[user.role] || user.role,
})

const addAuditLog = (db, { actor, action, target, detail }) => {
  db.auditLogs = [
    {
      id: `audit-${Math.random().toString(36).slice(2, 9)}`,
      actor,
      action,
      target,
      detail,
      timestamp: nowStamp(),
    },
    ...(db.auditLogs || []),
  ].slice(0, 400)
}

const checkPasswordAndUpgrade = async (db, email, plainPassword) => {
  const key = normalizeEmail(email)
  const expected = db.credentials[key]
  if (!expected) return false

  if (isBcryptHash(expected)) {
    return bcrypt.compare(plainPassword, expected)
  }

  const match = plainPassword === expected
  if (match) {
    db.credentials[key] = await hashPassword(plainPassword)
  }
  return match
}

const flattenLessons = (course) =>
  course.modules.flatMap((module) => module.lessons.map((lesson) => ({ ...lesson, moduleId: module.id, moduleTitle: module.title })))

const getQuizById = (db, quizId) => (db.quizzes || []).find((item) => item.id === quizId) || null
const canManageQuizRole = (db, user) =>
  user?.role === 'admin' || Boolean(db?.permissionMatrix?.[user?.role || '']?.manageQuiz)
const isQuizPublished = (quiz) => String(quiz?.status || 'published') === 'published'

const buildQuizMeta = (quiz) => ({
  id: quiz.id,
  courseId: quiz.courseId,
  moduleId: quiz.moduleId,
  title: quiz.title,
  description: quiz.description,
  passingScore: quiz.passingScore,
  maxAttempts: quiz.maxAttempts,
  timeLimitSec: quiz.timeLimitSec,
  status: quiz.status || 'published',
  questionCount: Array.isArray(quiz.questions) ? quiz.questions.length : 0,
})

const getQuizHistory = (db, userId, quizId) => {
  const scopedByUser = db.quizAttempts?.[userId] || {}
  return Array.isArray(scopedByUser[quizId]) ? scopedByUser[quizId] : []
}

const setQuizHistory = (db, userId, quizId, history) => {
  db.quizAttempts = db.quizAttempts || {}
  const scopedByUser = db.quizAttempts[userId] || {}
  db.quizAttempts[userId] = {
    ...scopedByUser,
    [quizId]: history,
  }
}

const buildQuizSession = (quiz, userId, attemptNo) => {
  const startedAt = Date.now()
  const questionBank = shuffle(Array.isArray(quiz.questions) ? quiz.questions : []).map((question, qIdx) => {
    const optionPairs = (question.options || []).map((label, index) => ({ label, index }))
    const optionShuffled = shuffle(optionPairs)
    const options = optionShuffled.map((item, oIdx) => ({
      id: `${question.id}-opt-${oIdx}`,
      label: item.label,
      sourceIndex: item.index,
    }))
    const correctOption = options.find((item) => item.sourceIndex === question.correctIndex)
    return {
      id: question.id || `q-${qIdx + 1}`,
      title: question.title || `Question ${qIdx + 1}`,
      explanation: question.explanation || '',
      options: options.map((item) => ({ id: item.id, label: item.label })),
      correctOptionId: correctOption?.id || '',
    }
  })

  return {
    sessionId: `quizsess-${Math.random().toString(36).slice(2, 12)}`,
    quizId: quiz.id,
    userId,
    title: quiz.title,
    description: quiz.description,
    passingScore: quiz.passingScore,
    maxAttempts: quiz.maxAttempts,
    timeLimitSec: quiz.timeLimitSec,
    attemptNo,
    startedAt,
    expiresAt: startedAt + quiz.timeLimitSec * 1000,
    questions: questionBank,
  }
}

const toPublicQuizSession = (session) => ({
  sessionId: session.sessionId,
  quizId: session.quizId,
  title: session.title,
  description: session.description,
  passingScore: session.passingScore,
  maxAttempts: session.maxAttempts,
  timeLimitSec: session.timeLimitSec,
  attemptNo: session.attemptNo,
  startedAt: session.startedAt,
  expiresAt: session.expiresAt,
  questions: session.questions.map((question) => ({
    id: question.id,
    title: question.title,
    options: question.options,
  })),
})

const removeQuizArtifacts = (db, quizId) => {
  if (db.quizAttempts && typeof db.quizAttempts === 'object') {
    Object.keys(db.quizAttempts).forEach((userId) => {
      const scoped = db.quizAttempts[userId] || {}
      if (Object.prototype.hasOwnProperty.call(scoped, quizId)) {
        delete scoped[quizId]
      }
      db.quizAttempts[userId] = scoped
    })
  }

  if (db.quizSessions && typeof db.quizSessions === 'object') {
    Object.keys(db.quizSessions).forEach((sessionId) => {
      if (db.quizSessions[sessionId]?.quizId === quizId) {
        delete db.quizSessions[sessionId]
      }
    })
  }
}

const ensureCourseState = (db, userId, course) => {
  const userScope = db.courseProgress[userId] || {}
  const courseState = userScope[course.id] || {}
  const firstLessonId = flattenLessons(course)[0]?.id || ''
  const state = {
    completedLessonIds: Array.isArray(courseState.completedLessonIds) ? courseState.completedLessonIds : [],
    activeLessonId: courseState.activeLessonId || firstLessonId,
  }
  db.courseProgress[userId] = {
    ...userScope,
    [course.id]: state,
  }
  return state
}

const buildCourseView = (course, state) => {
  const allLessons = flattenLessons(course)
  const lessonIds = allLessons.map((lesson) => lesson.id)
  const completedSet = new Set(state.completedLessonIds)

  const lessonMetaById = Object.fromEntries(
    lessonIds.map((lessonId, index) => {
      const prevLessonId = lessonIds[index - 1]
      const isLocked = index > 0 && !completedSet.has(prevLessonId)
      return [lessonId, { index, isLocked }]
    }),
  )

  const activeLessonId = lessonMetaById[state.activeLessonId]?.isLocked ? lessonIds[0] : state.activeLessonId

  const modules = course.modules.map((module) => ({
    ...module,
    lessons: module.lessons.map((lesson) => {
      const meta = lessonMetaById[lesson.id]
      return {
        ...lesson,
        isCompleted: completedSet.has(lesson.id),
        isLocked: Boolean(meta?.isLocked),
        isActive: lesson.id === activeLessonId,
      }
    }),
  }))

  const completedLessons = allLessons.filter((lesson) => completedSet.has(lesson.id)).length
  const totalLessons = allLessons.length
  const progress = totalLessons ? Math.round((completedLessons / totalLessons) * 100) : 0
  const activeLesson = allLessons.find((lesson) => lesson.id === activeLessonId) || allLessons[0] || null
  const activeIndex = activeLesson ? lessonIds.indexOf(activeLesson.id) : -1
  const previousLesson = activeIndex > 0 ? allLessons[activeIndex - 1] : null
  const nextLesson = activeIndex >= 0 && activeIndex < allLessons.length - 1 ? allLessons[activeIndex + 1] : null

  return {
    id: course.id,
    title: course.title,
    description: course.description,
    tag: course.tag,
    gradient: course.gradient,
    instructor: course.instructor,
    modules,
    activeLesson,
    previousLesson,
    nextLesson,
    progress,
    completedLessons,
    totalLessons,
  }
}

const toCourseCard = (courseView) => ({
  id: courseView.id,
  title: courseView.title,
  description: courseView.description,
  progress: courseView.progress,
  tag: courseView.tag,
  gradient: courseView.gradient,
  activeLessonId: courseView.activeLesson?.id || '',
  activeLessonTitle: courseView.activeLesson?.title || '',
  totalLessons: courseView.totalLessons,
  completedLessons: courseView.completedLessons,
})

const findCourseAndLesson = (db, courseId, lessonId) => {
  const course = (db.courses || []).find((item) => item.id === courseId)
  if (!course) return { course: null, lesson: null }
  const lessons = flattenLessons(course)
  const lesson = lessons.find((item) => item.id === lessonId) || null
  return { course, lesson }
}

const findLessonTitle = (course, lessonId) => {
  const lesson = flattenLessons(course).find((item) => item.id === lessonId)
  return lesson?.title || 'Lesson'
}

const canModerateDiscussion = (user, discussionItem) =>
  user?.role === 'admin' || discussionItem?.authorId === user?.id

const extractMentionTokens = (text) => {
  const matches = String(text || '').match(/@([a-zA-Z0-9._-]{2,40})/g) || []
  return [
    ...new Set(
      matches
        .map((raw) => raw.slice(1).toLowerCase().replace(/[.,!?;:]+$/g, ''))
        .filter(Boolean),
    ),
  ]
}

const resolveMentionUserIds = (users, text) => {
  const tokens = extractMentionTokens(text)
  if (!tokens.length) return []
  return (users || [])
    .filter((user) => {
      const emailLocal = String(user.email || '')
        .split('@')[0]
        .toLowerCase()
      const nameNoSpace = String(user.name || '')
        .replace(/\s+/g, '')
        .toLowerCase()
      const nameTokens = String(user.name || '')
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
      return tokens.some((token) => token === emailLocal || token === nameNoSpace || nameTokens.includes(token))
    })
    .map((user) => user.id)
}

const validateBody = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body)
  if (!result.success) {
    const issue = result.error.issues[0]
    return res.status(400).json({ message: issue?.message || 'Invalid request payload.' })
  }
  req.body = result.data
  return next()
}

const createCorsOriginValidator = (origins) => (origin, callback) => {
  if (!origin) return callback(null, true)
  if (origins === '*') return callback(null, true)
  if (origins.includes(origin)) return callback(null, true)
  return callback(new Error('CORS origin denied'))
}

const handleAppError = (error, _req, res, _next) => {
  if (error instanceof Error && error.message.includes('CORS')) {
    return res.status(403).json({ message: 'CORS origin denied.' })
  }
  return res.status(500).json({ message: 'Internal server error.' })
}

const app = express()
app.set('trust proxy', 1)
app.use(
  helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: false,
  }),
)
app.use(
  cors({
    origin: createCorsOriginValidator(allowedOrigins),
    credentials: true,
  }),
)
app.use(express.json({ limit: '3mb' }))

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Terlalu banyak percobaan login. Coba lagi nanti.' },
})

const requireAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    if (!token) return res.status(401).json({ message: 'Missing authorization token.' })

    const db = await readDb()
    if (db.revokedTokens.includes(token)) {
      return res.status(401).json({ message: 'Token has been revoked.' })
    }

    const payload = jwt.verify(token, JWT_SECRET)
    const user = db.users.find((item) => item.id === payload.sub)
    if (!user || user.status !== 'active') {
      return res.status(401).json({ message: 'Invalid session user.' })
    }

    req.token = token
    req.auth = payload
    req.user = user
    req.db = db
    return next()
  } catch {
    return res.status(401).json({ message: 'Unauthorized.' })
  }
}

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required.' })
  }
  return next()
}

const requireQuizManager = (req, res, next) => {
  if (!canManageQuizRole(req.db, req.user)) {
    return res.status(403).json({ message: 'Quiz manager access required.' })
  }
  return next()
}

app.post('/api/auth/login', loginLimiter, validateBody(loginSchema), async (req, res) => {
  const email = normalizeEmail(req.body.email)
  const password = req.body.password
  const db = await readDb()
  const user = db.users.find((item) => normalizeEmail(item.email) === email)

  if (!user) return res.status(401).json({ message: 'Email tidak ditemukan.' })
  if (user.status !== 'active') return res.status(403).json({ message: 'Akun belum aktif atau suspended.' })

  const isPasswordMatch = await checkPasswordAndUpgrade(db, email, password)
  if (!isPasswordMatch) {
    return res.status(401).json({ message: 'Password tidak sesuai.' })
  }

  user.lastLogin = nowStamp()
  addAuditLog(db, {
    actor: user.email,
    action: 'auth_login',
    target: user.id,
    detail: 'User logged in successfully.',
  })
  await writeDb(db)

  const issuedAt = Date.now()
  const token = jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN },
  )
  const decoded = jwt.decode(token)
  const expiresAt = decoded?.exp ? decoded.exp * 1000 : issuedAt + 1000 * 60 * 60 * 12

  return res.json({
    token,
    user: toSafeUser(user),
    issuedAt,
    expiresAt,
  })
})

app.get('/api/auth/session', requireAuth, async (req, res) => {
  const decoded = jwt.decode(req.token)
  return res.json({
    user: toSafeUser(req.user),
    expiresAt: decoded?.exp ? decoded.exp * 1000 : Date.now() + 1000 * 60 * 60,
  })
})

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  req.db.revokedTokens = [...req.db.revokedTokens, req.token].slice(-400)
  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'auth_logout',
    target: req.user.id,
    detail: 'User logged out.',
  })
  await writeDb(req.db)
  return res.status(204).send()
})

app.get('/api/profile', requireAuth, async (req, res) => {
  const state = req.db.profiles[req.user.id] || createDefaultProfileState(req.user)
  req.db.profiles[req.user.id] = state
  await writeDb(req.db)
  return res.json(state)
})

app.patch('/api/profile/account', requireAuth, validateBody(profileAccountPatchSchema), async (req, res) => {
  const current = req.db.profiles[req.user.id] || createDefaultProfileState(req.user)
  const next = {
    ...current,
    profile: { ...current.profile, ...(req.body || {}) },
  }
  req.db.profiles[req.user.id] = next
  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'profile_account_update',
    target: req.user.id,
    detail: 'Profile account fields updated.',
  })
  await writeDb(req.db)
  return res.json(next)
})

app.patch('/api/profile/preferences', requireAuth, validateBody(profilePreferencesPatchSchema), async (req, res) => {
  const current = req.db.profiles[req.user.id] || createDefaultProfileState(req.user)
  const next = {
    ...current,
    preferences: { ...current.preferences, ...(req.body || {}) },
  }
  req.db.profiles[req.user.id] = next
  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'profile_preferences_update',
    target: req.user.id,
    detail: 'Profile preferences updated.',
  })
  await writeDb(req.db)
  return res.json(next)
})

app.post('/api/profile/password', requireAuth, validateBody(passwordUpdateSchema), async (req, res) => {
  const email = normalizeEmail(req.user.email)
  const currentHash = req.db.credentials[email]
  if (!currentHash || !(await bcrypt.compare(req.body.currentPassword, currentHash))) {
    return res.status(400).json({ message: 'Current password tidak sesuai.' })
  }

  if (req.body.currentPassword === req.body.newPassword) {
    return res.status(400).json({ message: 'Password baru harus berbeda dari password lama.' })
  }

  req.db.credentials[email] = await hashPassword(req.body.newPassword)
  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'profile_password_update',
    target: req.user.id,
    detail: 'Password updated.',
  })
  await writeDb(req.db)
  return res.json({ ok: true })
})

app.post('/api/profile/reset', requireAuth, async (req, res) => {
  const next = createDefaultProfileState(req.user)
  req.db.profiles[req.user.id] = next
  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'profile_reset',
    target: req.user.id,
    detail: 'Profile reset to defaults.',
  })
  await writeDb(req.db)
  return res.json(next)
})

app.put('/api/profile', requireAuth, validateBody(profileStateSchema), async (req, res) => {
  req.db.profiles[req.user.id] = req.body
  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'profile_replace',
    target: req.user.id,
    detail: 'Profile full state replaced.',
  })
  await writeDb(req.db)
  return res.json(req.body)
})

app.get('/api/users', requireAuth, requireAdmin, async (req, res) => {
  return res.json(req.db.users)
})

app.get('/api/users/permissions', requireAuth, requireAdmin, async (req, res) => {
  return res.json(req.db.permissionMatrix)
})

app.put('/api/users/permissions', requireAuth, requireAdmin, validateBody(permissionMatrixSchema), async (req, res) => {
  req.db.permissionMatrix = req.body
  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'users_permissions_update',
    target: 'permission_matrix',
    detail: 'Permission matrix updated.',
  })
  await writeDb(req.db)
  return res.json(req.db.permissionMatrix)
})

app.post('/api/users', requireAuth, requireAdmin, validateBody(userSaveSchema), async (req, res) => {
  const payload = req.body
  const normalizedEmail = normalizeEmail(payload.email)

  if (payload.id) {
    const existing = req.db.users.find((user) => user.id === payload.id)
    if (!existing) return res.status(404).json({ message: 'User not found.' })

    const duplicate = req.db.users.find((user) => user.id !== payload.id && normalizeEmail(user.email) === normalizedEmail)
    if (duplicate) return res.status(409).json({ message: 'Email sudah digunakan user lain.' })

    const oldEmail = normalizeEmail(existing.email)
    req.db.users = req.db.users.map((user) => (user.id === payload.id ? { ...user, ...payload } : user))

    if (oldEmail !== normalizedEmail) {
      const oldCredential = req.db.credentials[oldEmail]
      if (oldCredential) {
        req.db.credentials[normalizedEmail] = oldCredential
        delete req.db.credentials[oldEmail]
      }
    }

    if (req.db.profiles[payload.id]) {
      req.db.profiles[payload.id].profile = {
        ...req.db.profiles[payload.id].profile,
        name: payload.name,
        email: payload.email,
        accessRole: payload.role,
        role: accessLevels[payload.role] || payload.role,
      }
    }

    addAuditLog(req.db, {
      actor: req.user.email,
      action: 'users_update',
      target: payload.id,
      detail: `${payload.email} updated (${payload.role}/${payload.status}).`,
    })
    await writeDb(req.db)
    return res.json(req.db.users)
  }

  const duplicate = req.db.users.find((user) => normalizeEmail(user.email) === normalizedEmail)
  if (duplicate) return res.status(409).json({ message: 'Email sudah terdaftar.' })

  const created = {
    id: `u-${Math.random().toString(36).slice(2, 8)}`,
    name: payload.name,
    email: payload.email,
    role: payload.role,
    status: payload.status,
    lastLogin: '-',
  }

  req.db.users = [created, ...req.db.users]
  req.db.credentials[normalizedEmail] = await hashPassword('changeme123')
  req.db.profiles[created.id] = createDefaultProfileState(created)
  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'users_create',
    target: created.id,
    detail: `${created.email} created (${created.role}/${created.status}).`,
  })
  await writeDb(req.db)
  return res.json(req.db.users)
})

app.post('/api/users/invite', requireAuth, requireAdmin, validateBody(userInviteSchema), async (req, res) => {
  const payload = req.body
  const normalizedEmail = normalizeEmail(payload.email)
  const duplicate = req.db.users.find((user) => normalizeEmail(user.email) === normalizedEmail)
  if (duplicate) return res.status(409).json({ message: 'Email sudah terdaftar.' })

  const created = {
    id: `u-${Math.random().toString(36).slice(2, 8)}`,
    name: payload.name,
    email: payload.email,
    role: payload.role,
    status: 'pending',
    lastLogin: '-',
  }

  req.db.users = [created, ...req.db.users]
  req.db.credentials[normalizedEmail] = await hashPassword('changeme123')
  req.db.profiles[created.id] = createDefaultProfileState(created)
  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'users_invite',
    target: created.id,
    detail: `${created.email} invited as ${created.role}.`,
  })
  await writeDb(req.db)
  return res.json(req.db.users)
})

app.delete('/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params
  const target = req.db.users.find((user) => user.id === id)
  if (!target) return res.status(404).json({ message: 'User not found.' })

  req.db.users = req.db.users.filter((user) => user.id !== id)
  delete req.db.profiles[id]
  delete req.db.credentials[normalizeEmail(target.email)]
  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'users_delete',
    target: id,
    detail: `${target.email} deleted.`,
  })
  await writeDb(req.db)
  return res.json(req.db.users)
})

app.post('/api/users/bulk-delete', requireAuth, requireAdmin, validateBody(idsSchema), async (req, res) => {
  const ids = req.body.ids
  const idSet = new Set(ids)

  const removedUsers = req.db.users.filter((user) => idSet.has(user.id))
  req.db.users = req.db.users.filter((user) => !idSet.has(user.id))

  removedUsers.forEach((user) => {
    delete req.db.profiles[user.id]
    delete req.db.credentials[normalizeEmail(user.email)]
  })

  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'users_bulk_delete',
    target: 'bulk',
    detail: `${removedUsers.length} users deleted.`,
  })
  await writeDb(req.db)
  return res.json(req.db.users)
})

app.post('/api/users/bulk-status', requireAuth, requireAdmin, validateBody(bulkStatusSchema), async (req, res) => {
  const { ids, status } = req.body
  const idSet = new Set(ids)
  req.db.users = req.db.users.map((user) => (idSet.has(user.id) ? { ...user, status } : user))
  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'users_bulk_status',
    target: 'bulk',
    detail: `${ids.length} users changed to ${status}.`,
  })
  await writeDb(req.db)
  return res.json(req.db.users)
})

app.post('/api/users/:id/toggle-status', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params
  const target = req.db.users.find((user) => user.id === id)
  if (!target) return res.status(404).json({ message: 'User not found.' })

  req.db.users = req.db.users.map((user) => {
    if (user.id !== id) return user
    return {
      ...user,
      status: user.status === 'active' ? 'suspended' : 'active',
    }
  })
  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'users_toggle_status',
    target: id,
    detail: `${target.email} status toggled.`,
  })
  await writeDb(req.db)
  return res.json(req.db.users)
})

app.post('/api/users/:id/reset-password', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params
  const target = req.db.users.find((user) => user.id === id)
  if (!target) return res.status(404).json({ message: 'User not found.' })

  req.db.users = req.db.users.map((user) => (user.id === id ? { ...user, lastLogin: nowStamp() } : user))
  req.db.credentials[normalizeEmail(target.email)] = await hashPassword('changeme123')
  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'users_reset_password',
    target: id,
    detail: `${target.email} password reset to temporary value.`,
  })
  await writeDb(req.db)
  return res.json(req.db.users)
})

app.get('/api/courses', requireAuth, async (req, res) => {
  const courses = req.db.courses || []
  const userId = req.user.id
  const cards = courses.map((course) => {
    const state = ensureCourseState(req.db, userId, course)
    return toCourseCard(buildCourseView(course, state))
  })
  await writeDb(req.db)
  return res.json(cards)
})

app.get('/api/courses/:id', requireAuth, async (req, res) => {
  const course = (req.db.courses || []).find((item) => item.id === req.params.id)
  if (!course) return res.status(404).json({ message: 'Course not found.' })
  const state = ensureCourseState(req.db, req.user.id, course)
  const view = buildCourseView(course, state)
  await writeDb(req.db)
  return res.json(view)
})

app.post('/api/courses/:id/lessons/:lessonId/select', requireAuth, async (req, res) => {
  const course = (req.db.courses || []).find((item) => item.id === req.params.id)
  if (!course) return res.status(404).json({ message: 'Course not found.' })

  const userId = req.user.id
  const state = ensureCourseState(req.db, userId, course)
  const view = buildCourseView(course, state)
  const lessons = view.modules.flatMap((module) => module.lessons)
  const lesson = lessons.find((item) => item.id === req.params.lessonId)
  if (!lesson) return res.status(404).json({ message: 'Lesson not found.' })
  if (lesson.isLocked) return res.status(403).json({ message: 'Lesson is still locked.' })

  req.db.courseProgress[userId][course.id].activeLessonId = lesson.id
  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'course_select_lesson',
    target: `${course.id}:${lesson.id}`,
    detail: `Selected lesson ${lesson.title}.`,
  })
  await writeDb(req.db)
  return res.json(buildCourseView(course, req.db.courseProgress[userId][course.id]))
})

app.post('/api/courses/:id/lessons/:lessonId/complete', requireAuth, async (req, res) => {
  const course = (req.db.courses || []).find((item) => item.id === req.params.id)
  if (!course) return res.status(404).json({ message: 'Course not found.' })

  const userId = req.user.id
  const state = ensureCourseState(req.db, userId, course)
  const view = buildCourseView(course, state)
  const lessons = view.modules.flatMap((module) => module.lessons)
  const lesson = lessons.find((item) => item.id === req.params.lessonId)
  if (!lesson) return res.status(404).json({ message: 'Lesson not found.' })
  if (lesson.isLocked) return res.status(403).json({ message: 'Lesson is still locked.' })

  const completedSet = new Set(req.db.courseProgress[userId][course.id].completedLessonIds)
  completedSet.add(lesson.id)
  req.db.courseProgress[userId][course.id].completedLessonIds = Array.from(completedSet)

  const currentIndex = lessons.findIndex((item) => item.id === lesson.id)
  const nextLesson = currentIndex >= 0 ? lessons[currentIndex + 1] : null
  req.db.courseProgress[userId][course.id].activeLessonId = nextLesson?.id || lesson.id

  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'course_complete_lesson',
    target: `${course.id}:${lesson.id}`,
    detail: `Completed lesson ${lesson.title}.`,
  })
  await writeDb(req.db)
  return res.json(buildCourseView(course, req.db.courseProgress[userId][course.id]))
})

app.get('/api/courses/:id/lessons/:lessonId/discussions', requireAuth, async (req, res) => {
  const { course, lesson } = findCourseAndLesson(req.db, req.params.id, req.params.lessonId)
  if (!course) return res.status(404).json({ message: 'Course not found.' })
  if (!lesson) return res.status(404).json({ message: 'Lesson not found.' })

  const key = `${course.id}:${lesson.id}`
  const items = Array.isArray(req.db.discussions[key]) ? req.db.discussions[key] : []
  return res.json(items)
})

app.post('/api/courses/:id/lessons/:lessonId/discussions', requireAuth, validateBody(discussionCreateSchema), async (req, res) => {
  const { course, lesson } = findCourseAndLesson(req.db, req.params.id, req.params.lessonId)
  if (!course) return res.status(404).json({ message: 'Course not found.' })
  if (!lesson) return res.status(404).json({ message: 'Lesson not found.' })

  const key = `${course.id}:${lesson.id}`
  const items = Array.isArray(req.db.discussions[key]) ? req.db.discussions[key] : []
  if (req.body.parentId && !items.some((item) => item.id === req.body.parentId)) {
    return res.status(404).json({ message: 'Parent discussion not found.' })
  }
  req.db.discussions[key] = [
    {
      id: `disc-${Math.random().toString(36).slice(2, 10)}`,
      courseId: course.id,
      lessonId: lesson.id,
      parentId: req.body.parentId || null,
      message: req.body.message.trim(),
      mentionUserIds: resolveMentionUserIds(req.db.users, req.body.message),
      authorId: req.user.id,
      authorName: req.user.name,
      createdAt: new Date().toISOString(),
    },
    ...items,
  ].slice(0, 300)

  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'course_discussion_add',
    target: `${course.id}:${lesson.id}`,
    detail: `Added discussion on ${lesson.title}.`,
  })
  await writeDb(req.db)
  return res.status(201).json(req.db.discussions[key])
})

app.patch(
  '/api/courses/:id/lessons/:lessonId/discussions/:discussionId',
  requireAuth,
  validateBody(discussionUpdateSchema),
  async (req, res) => {
    const { course, lesson } = findCourseAndLesson(req.db, req.params.id, req.params.lessonId)
    if (!course) return res.status(404).json({ message: 'Course not found.' })
    if (!lesson) return res.status(404).json({ message: 'Lesson not found.' })

    const key = `${course.id}:${lesson.id}`
    const items = Array.isArray(req.db.discussions[key]) ? req.db.discussions[key] : []
    const target = items.find((item) => item.id === req.params.discussionId)
    if (!target) return res.status(404).json({ message: 'Discussion not found.' })
    if (!canModerateDiscussion(req.user, target)) {
      return res.status(403).json({ message: 'Not allowed to edit this discussion.' })
    }

    req.db.discussions[key] = items.map((item) =>
      item.id === req.params.discussionId
        ? {
            ...item,
            message: req.body.message.trim(),
            mentionUserIds: resolveMentionUserIds(req.db.users, req.body.message),
            updatedAt: new Date().toISOString(),
          }
        : item,
    )
    addAuditLog(req.db, {
      actor: req.user.email,
      action: 'course_discussion_edit',
      target: `${course.id}:${lesson.id}:${req.params.discussionId}`,
      detail: `Edited discussion on ${lesson.title}.`,
    })
    await writeDb(req.db)
    return res.json(req.db.discussions[key])
  },
)

app.delete('/api/courses/:id/lessons/:lessonId/discussions/:discussionId', requireAuth, async (req, res) => {
  const { course, lesson } = findCourseAndLesson(req.db, req.params.id, req.params.lessonId)
  if (!course) return res.status(404).json({ message: 'Course not found.' })
  if (!lesson) return res.status(404).json({ message: 'Lesson not found.' })

  const key = `${course.id}:${lesson.id}`
  const items = Array.isArray(req.db.discussions[key]) ? req.db.discussions[key] : []
  const target = items.find((item) => item.id === req.params.discussionId)
  if (!target) return res.status(404).json({ message: 'Discussion not found.' })
  if (!canModerateDiscussion(req.user, target)) {
    return res.status(403).json({ message: 'Not allowed to delete this discussion.' })
  }

  req.db.discussions[key] = items.filter((item) => item.id !== target.id && item.parentId !== target.id)
  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'course_discussion_delete',
    target: `${course.id}:${lesson.id}:${req.params.discussionId}`,
    detail: `Deleted discussion on ${lesson.title}.`,
  })
  await writeDb(req.db)
  return res.json(req.db.discussions[key])
})

app.get('/api/quizzes/:id', requireAuth, async (req, res) => {
  const quiz = getQuizById(req.db, req.params.id)
  if (!quiz) return res.status(404).json({ message: 'Quiz not found.' })
  if (!isQuizPublished(quiz) && !canManageQuizRole(req.db, req.user)) {
    return res.status(403).json({ message: 'Quiz ini belum dipublish.' })
  }
  return res.json(buildQuizMeta(quiz))
})

app.get('/api/quizzes/:id/editor', requireAuth, requireQuizManager, async (req, res) => {
  const quiz = getQuizById(req.db, req.params.id)
  if (!quiz) return res.status(404).json({ message: 'Quiz not found.' })
  return res.json(quiz)
})

app.get('/api/quizzes', requireAuth, requireQuizManager, async (req, res) => {
  const quizzes = Array.isArray(req.db.quizzes) ? req.db.quizzes : []
  return res.json(quizzes.map((quiz) => ({ ...buildQuizMeta(quiz), updatedAt: quiz.updatedAt || quiz.createdAt || null })))
})

app.post('/api/quizzes/bulk-status', requireAuth, requireQuizManager, validateBody(quizBulkStatusSchema), async (req, res) => {
  const idSet = new Set(req.body.ids)
  req.db.quizzes = (req.db.quizzes || []).map((quiz) =>
    idSet.has(quiz.id)
      ? {
          ...quiz,
          status: req.body.status,
          updatedAt: new Date().toISOString(),
        }
      : quiz,
  )

  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'quiz_bulk_status',
    target: 'bulk',
    detail: `${req.body.ids.length} quizzes updated to ${req.body.status}.`,
  })
  await writeDb(req.db)

  return res.json((req.db.quizzes || []).filter((quiz) => idSet.has(quiz.id)).map((quiz) => buildQuizMeta(quiz)))
})

app.post('/api/quizzes/bulk-delete', requireAuth, requireQuizManager, validateBody(idsSchema), async (req, res) => {
  const idSet = new Set(req.body.ids)
  const deleted = (req.db.quizzes || []).filter((quiz) => idSet.has(quiz.id))

  req.db.quizzes = (req.db.quizzes || []).filter((quiz) => !idSet.has(quiz.id))
  deleted.forEach((quiz) => removeQuizArtifacts(req.db, quiz.id))

  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'quiz_bulk_delete',
    target: 'bulk',
    detail: `${deleted.length} quizzes deleted.`,
  })
  await writeDb(req.db)

  return res.json(req.db.quizzes.map((quiz) => ({ ...buildQuizMeta(quiz), updatedAt: quiz.updatedAt || quiz.createdAt || null })))
})

app.post('/api/quizzes', requireAuth, requireQuizManager, validateBody(quizSaveSchema), async (req, res) => {
  const payload = req.body
  if (payload.questions.some((question) => question.correctIndex >= question.options.length)) {
    return res.status(400).json({ message: 'Invalid question: correctIndex must point to existing option.' })
  }
  const normalizedQuestions = payload.questions.map((question, idx) => {
    const cleanOptions = question.options.map((option) => String(option || '').trim())
    return {
      ...question,
      id: question.id || `q-${idx + 1}`,
      title: String(question.title || '').trim(),
      options: cleanOptions,
      explanation: String(question.explanation || '').trim(),
    }
  })

  const quizzes = Array.isArray(req.db.quizzes) ? req.db.quizzes : []
  const quizId = payload.id || `${payload.courseId}-${payload.moduleId}-${Math.random().toString(36).slice(2, 6)}`
  const nowIso = new Date().toISOString()
  const existingQuiz = quizzes.find((item) => item.id === quizId) || null

  const nextQuiz = {
    id: quizId,
    courseId: payload.courseId,
    moduleId: payload.moduleId,
    title: payload.title.trim(),
    description: payload.description.trim(),
    passingScore: payload.passingScore,
    maxAttempts: payload.maxAttempts,
    timeLimitSec: payload.timeLimitSec,
    status: payload.status || existingQuiz?.status || 'draft',
    questions: normalizedQuestions,
    updatedAt: nowIso,
    createdAt: existingQuiz?.createdAt || nowIso,
  }

  req.db.quizzes = quizzes.some((item) => item.id === quizId)
    ? quizzes.map((item) => (item.id === quizId ? nextQuiz : item))
    : [nextQuiz, ...quizzes]

  addAuditLog(req.db, {
    actor: req.user.email,
    action: payload.id ? 'quiz_update' : 'quiz_create',
    target: quizId,
    detail: `${payload.id ? 'Updated' : 'Created'} quiz ${nextQuiz.title}.`,
  })
  await writeDb(req.db)
  return res.json(nextQuiz)
})

app.patch('/api/quizzes/:id/status', requireAuth, requireQuizManager, validateBody(quizStatusSchema), async (req, res) => {
  const target = getQuizById(req.db, req.params.id)
  if (!target) return res.status(404).json({ message: 'Quiz not found.' })

  req.db.quizzes = (req.db.quizzes || []).map((quiz) =>
    quiz.id === target.id
      ? {
          ...quiz,
          status: req.body.status,
          updatedAt: new Date().toISOString(),
        }
      : quiz,
  )

  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'quiz_status_update',
    target: target.id,
    detail: `Quiz ${target.title} status changed to ${req.body.status}.`,
  })
  await writeDb(req.db)

  return res.json(buildQuizMeta(req.db.quizzes.find((quiz) => quiz.id === target.id)))
})

app.delete('/api/quizzes/:id', requireAuth, requireQuizManager, async (req, res) => {
  const target = getQuizById(req.db, req.params.id)
  if (!target) return res.status(404).json({ message: 'Quiz not found.' })

  req.db.quizzes = (req.db.quizzes || []).filter((item) => item.id !== target.id)
  removeQuizArtifacts(req.db, target.id)

  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'quiz_delete',
    target: target.id,
    detail: `Deleted quiz ${target.title}.`,
  })
  await writeDb(req.db)
  return res.status(204).send()
})

app.get('/api/quizzes/:id/history', requireAuth, async (req, res) => {
  const quiz = getQuizById(req.db, req.params.id)
  if (!quiz) return res.status(404).json({ message: 'Quiz not found.' })
  if (!isQuizPublished(quiz) && !canManageQuizRole(req.db, req.user)) {
    return res.status(403).json({ message: 'Quiz ini belum dipublish.' })
  }
  return res.json(getQuizHistory(req.db, req.user.id, quiz.id))
})

app.post('/api/quizzes/:id/session', requireAuth, validateBody(quizSessionStartSchema), async (req, res) => {
  const quiz = getQuizById(req.db, req.params.id)
  if (!quiz) return res.status(404).json({ message: 'Quiz not found.' })
  if (!isQuizPublished(quiz) && !canManageQuizRole(req.db, req.user)) {
    return res.status(403).json({ message: 'Quiz ini belum dipublish.' })
  }

  const history = getQuizHistory(req.db, req.user.id, quiz.id)
  if (req.body.retake && history.length >= quiz.maxAttempts) {
    return res.status(409).json({ message: 'Batas retake sudah tercapai.' })
  }

  const session = buildQuizSession(quiz, req.user.id, history.length + 1)
  req.db.quizSessions = req.db.quizSessions || {}
  req.db.quizSessions[session.sessionId] = session
  await writeDb(req.db)
  return res.status(201).json(toPublicQuizSession(session))
})

app.post('/api/quizzes/:id/submit', requireAuth, validateBody(quizSubmitSchema), async (req, res) => {
  const quiz = getQuizById(req.db, req.params.id)
  if (!quiz) return res.status(404).json({ message: 'Quiz not found.' })
  if (!isQuizPublished(quiz) && !canManageQuizRole(req.db, req.user)) {
    return res.status(403).json({ message: 'Quiz ini belum dipublish.' })
  }

  const answers = req.body.answers || {}
  const session = req.db.quizSessions?.[req.body.sessionId]
  if (!session || session.userId !== req.user.id || session.quizId !== quiz.id) {
    return res.status(404).json({ message: 'Quiz session not found.' })
  }

  const timedOut = Date.now() > session.expiresAt || Boolean(req.body.forced)
  const details = session.questions.map((question) => {
    const selectedOptionId = answers[question.id] || ''
    const selected = question.options.find((item) => item.id === selectedOptionId) || null
    const correct = question.options.find((item) => item.id === question.correctOptionId) || null
    const isCorrect = selected ? selected.id === question.correctOptionId : false

    return {
      questionId: question.id,
      title: question.title,
      selectedOptionId,
      selectedLabel: selected?.label || '',
      correctLabel: correct?.label || '',
      isCorrect,
      explanation: question.explanation,
    }
  })

  const correctCount = details.filter((item) => item.isCorrect).length
  const total = details.length
  const score = total > 0 ? Math.round((correctCount / total) * 100) : 0
  const passed = !timedOut && score >= session.passingScore

  const nextAttempt = {
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

  const nextHistory = [nextAttempt, ...getQuizHistory(req.db, req.user.id, quiz.id)].slice(0, 20)
  setQuizHistory(req.db, req.user.id, quiz.id, nextHistory)
  delete req.db.quizSessions[session.sessionId]

  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'quiz_submit',
    target: `${quiz.id}:${session.sessionId}`,
    detail: `Submitted quiz ${quiz.title} with score ${score}%.`,
  })
  await writeDb(req.db)

  return res.json({
    ...nextAttempt,
    passingScore: session.passingScore,
    remainingAttempts: Math.max(session.maxAttempts - nextHistory.length, 0),
    canRetake: nextHistory.length < session.maxAttempts,
  })
})

app.get('/api/notifications', requireAuth, async (req, res) => {
  const rawLimit = Number(req.query.limit || 30)
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 30

  const courses = Array.isArray(req.db.courses) ? req.db.courses : []
  const courseMap = Object.fromEntries(courses.map((course) => [course.id, course]))
  const activities = Object.values(req.db.discussions || {})
    .flatMap((items) => (Array.isArray(items) ? items : []))
    .filter((item) => item.authorId !== req.user.id)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, limit)
    .map((item) => {
      const course = courseMap[item.courseId]
      return {
        id: item.id,
        courseId: item.courseId,
        lessonId: item.lessonId,
        authorName: item.authorName,
        message: item.message,
        isMention: Array.isArray(item.mentionUserIds) ? item.mentionUserIds.includes(req.user.id) : false,
        createdAt: item.createdAt,
        courseTitle: course?.title || 'Course',
        lessonTitle: course ? findLessonTitle(course, item.lessonId) : 'Lesson',
      }
    })

  return res.json(activities)
})

app.get('/api/audit-logs', requireAuth, requireAdmin, async (req, res) => {
  const rawLimit = Number(req.query.limit || 100)
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 300) : 100
  return res.json((req.db.auditLogs || []).slice(0, limit))
})

app.use('/api/*splat', (_req, res) => {
  res.status(404).json({ message: 'Endpoint not found.' })
})

app.use(handleAppError)

const start = async () => {
  await ensureDb()
  return app.listen(PORT, () => {
    console.log(`Curiosity API listening on http://localhost:${PORT}/api`)
  })
}

/* c8 ignore start */
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  start().catch((error) => {
    console.error('Failed to start API:', error)
    process.exit(1)
  })
}
/* c8 ignore stop */

export { app, ensureDb, readDb, writeDb, resetDb, start, createCorsOriginValidator, handleAppError, checkPasswordAndUpgrade }
