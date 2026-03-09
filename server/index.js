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

export { app, ensureDb, readDb, writeDb, resetDb, start, createCorsOriginValidator, handleAppError }
