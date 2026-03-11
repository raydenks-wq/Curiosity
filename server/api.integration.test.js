import request from 'supertest'
import jwt from 'jsonwebtoken'
import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { app, ensureDb, readDb, resetDb, writeDb } from './index.js'

const loginAs = async (email, password, headers = {}) => {
  let req = request(app).post('/api/auth/login')
  const mergedHeaders = {
    'X-Forwarded-For': `10.0.0.${Math.floor(Math.random() * 220) + 10}`,
    ...headers,
  }
  Object.entries(mergedHeaders).forEach(([key, value]) => {
    req = req.set(key, value)
  })
  const res = await req.send({ email, password })
  return res
}

const buildManagedCoursePayload = (overrides = {}) => ({
  id: 'cm-ui-advanced',
  title: 'UI Advanced Systems',
  slug: 'ui-advanced-systems',
  description: 'Kursus lanjutan untuk sistem design dengan struktur modul, evaluasi, dan praktik terukur.',
  thumbnail: 'https://cdn.example.com/thumb-ui-advanced.jpg',
  category: 'Design',
  level: 'advanced',
  language: 'id',
  visibility: 'public',
  status: 'draft',
  publishAt: '',
  unpublishAt: '',
  modules: [
    {
      id: 'cm-ui-advanced-m1',
      title: 'System Foundation',
      description: 'Dasar yang wajib untuk scale design system.',
      lessons: [
        {
          id: 'cm-ui-advanced-l1',
          title: 'Token Architecture',
          type: 'video',
          durationMin: 14,
          isPreview: true,
          isLocked: false,
          contentUrl: 'https://cdn.example.com/video-token-architecture.mp4',
        },
      ],
    },
  ],
  assets: [],
  settings: {
    completionMode: 'lesson',
    completionThresholdPercent: 100,
    certificateEnabled: true,
    certificateTemplate: 'default',
    allowRetake: true,
    maxRetake: 3,
    allowProgressReset: false,
    prerequisiteMode: 'all',
    prerequisiteCourseIds: [],
    enrollmentCap: 0,
    estimatedHours: 12,
  },
  ...overrides,
})

describe('Curiosity API integration', () => {
  beforeEach(async () => {
    await ensureDb()
    await resetDb()
  })

  it('authenticates admin and returns token', async () => {
    const res = await loginAs('indra@curiosity.app', 'admin123')

    expect(res.status).toBe(200)
    expect(res.body.token).toBeTypeOf('string')
    expect(res.body.user.email).toBe('indra@curiosity.app')
    expect(res.body.user.role).toBe('admin')
  })

  it('returns active session for authenticated user', async () => {
    const login = await loginAs('indra@curiosity.app', 'admin123')
    expect(login.status).toBe(200)

    const session = await request(app)
      .get('/api/auth/session')
      .set('Authorization', `Bearer ${login.body.token}`)

    expect(session.status).toBe(200)
    expect(session.body.user.email).toBe('indra@curiosity.app')
    expect(typeof session.body.expiresAt).toBe('number')
  })

  it('returns unauthorized for malformed bearer token', async () => {
    const res = await request(app).get('/api/auth/session').set('Authorization', 'Bearer invalid.token.payload')
    expect(res.status).toBe(401)
    expect(res.body.message).toMatch(/Unauthorized/i)
  })

  it('returns invalid session user for valid token with unknown user', async () => {
    const token = jwt.sign(
      {
        sub: 'u-not-exists',
        email: 'ghost@curiosity.app',
        role: 'admin',
        name: 'Ghost',
      },
      'curiosity-dev-secret',
      { expiresIn: '1h' },
    )

    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(401)
    expect(res.body.message).toMatch(/Invalid session user/i)
  })

  it('blocks student from admin users endpoint', async () => {
    const login = await loginAs('raka@curiosity.app', 'student123')
    expect(login.status).toBe(200)

    const users = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${login.body.token}`)

    expect(users.status).toBe(403)
    expect(users.body.message).toMatch(/Admin access required/i)
  })

  it('blocks unauthenticated users from protected endpoint', async () => {
    const users = await request(app).get('/api/users')
    expect(users.status).toBe(401)
  })

  it('revokes token on logout', async () => {
    const login = await loginAs('indra@curiosity.app', 'admin123')
    expect(login.status).toBe(200)

    const logout = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${login.body.token}`)

    expect(logout.status).toBe(204)

    const session = await request(app)
      .get('/api/auth/session')
      .set('Authorization', `Bearer ${login.body.token}`)

    expect(session.status).toBe(401)
  })

  it('updates password and invalidates old password for next login', async () => {
    const login = await loginAs('indra@curiosity.app', 'admin123')
    expect(login.status).toBe(200)

    const update = await request(app)
      .post('/api/profile/password')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({
        currentPassword: 'admin123',
        newPassword: 'admin12345',
      })

    expect(update.status).toBe(200)
    expect(update.body.ok).toBe(true)

    const oldLogin = await loginAs('indra@curiosity.app', 'admin123')
    expect(oldLogin.status).toBe(401)

    const newLogin = await loginAs('indra@curiosity.app', 'admin12345')
    expect(newLogin.status).toBe(200)
  })

  it('writes audit logs for user management actions', async () => {
    const login = await loginAs('indra@curiosity.app', 'admin123')
    expect(login.status).toBe(200)

    const createUser = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({
        name: 'Test User',
        email: 'testuser@curiosity.app',
        role: 'student',
        status: 'active',
      })
    expect(createUser.status).toBe(200)

    const audit = await request(app)
      .get('/api/audit-logs?limit=30')
      .set('Authorization', `Bearer ${login.body.token}`)

    expect(audit.status).toBe(200)
    expect(Array.isArray(audit.body)).toBe(true)
    expect(audit.body.some((item) => item.action === 'users_create')).toBe(true)
  })

  it('supports immutable audit verification and notification delivery channel config', async () => {
    const login = await loginAs('indra@curiosity.app', 'admin123')
    expect(login.status).toBe(200)

    const saveChannels = await request(app)
      .put('/api/notifications/channels')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({
        webhookEnabled: false,
        webhookUrl: '',
        emailEnabled: true,
        emailFrom: 'ops@curiosity.app',
      })
    expect(saveChannels.status).toBe(200)
    expect(saveChannels.body.emailEnabled).toBe(true)

    const testEmail = await request(app)
      .post('/api/notifications/test-delivery')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({
        channel: 'email',
        message: 'Integration test delivery',
      })
    expect(testEmail.status).toBe(200)
    expect(['queued', 'skipped']).toContain(testEmail.body.status)

    const deliveryLogs = await request(app)
      .get('/api/notifications/delivery-logs?limit=5')
      .set('Authorization', `Bearer ${login.body.token}`)
    expect(deliveryLogs.status).toBe(200)
    expect(Array.isArray(deliveryLogs.body)).toBe(true)
    expect(deliveryLogs.body.length).toBeGreaterThan(0)

    const immutableAudit = await request(app)
      .get('/api/audit-logs/immutable?limit=10')
      .set('Authorization', `Bearer ${login.body.token}`)
    expect(immutableAudit.status).toBe(200)
    expect(Array.isArray(immutableAudit.body)).toBe(true)

    const verify = await request(app)
      .get('/api/audit-logs/immutable/verify')
      .set('Authorization', `Bearer ${login.body.token}`)
    expect(verify.status).toBe(200)
    expect(typeof verify.body.ok).toBe('boolean')
  })

  it('supports course management server-side queue lifecycle', async () => {
    const login = await loginAs('indra@curiosity.app', 'admin123')
    expect(login.status).toBe(200)
    const auth = { Authorization: `Bearer ${login.body.token}` }

    const created = await request(app).post('/api/course-management').set(auth).send(
      buildManagedCoursePayload({
        id: 'cm-queue-target',
        slug: 'cm-queue-target',
        title: 'Queue Target',
      }),
    )
    expect(created.status).toBe(200)

    const queued = await request(app)
      .post('/api/course-management/jobs')
      .set(auth)
      .send({
        type: 'bulk-status',
        ids: ['cm-queue-target'],
        statusValue: 'archived',
      })
    expect(queued.status).toBe(201)
    expect(queued.body.status).toBe('pending')

    const processDue = await request(app)
      .post('/api/course-management/jobs/process-due')
      .set(auth)
      .send({})
    expect(processDue.status).toBe(200)
    expect(processDue.body.processedJobs).toBeGreaterThan(0)

    const courses = await request(app).get('/api/course-management').set(auth)
    expect(courses.status).toBe(200)
    const target = courses.body.find((item) => item.id === 'cm-queue-target')
    expect(target?.status).toBe('archived')
  })

  it('moves terminally failed queue jobs to DLQ and supports redrive', async () => {
    const login = await loginAs('indra@curiosity.app', 'admin123')
    expect(login.status).toBe(200)
    const auth = { Authorization: `Bearer ${login.body.token}` }

    const created = await request(app).post('/api/course-management').set(auth).send(
      buildManagedCoursePayload({
        id: 'cm-dlq-target',
        slug: 'cm-dlq-target',
        title: 'DLQ Target',
        thumbnail: '',
      }),
    )
    expect(created.status).toBe(200)

    const queued = await request(app)
      .post('/api/course-management/jobs')
      .set(auth)
      .send({
        type: 'bulk-status',
        ids: ['cm-dlq-target'],
        statusValue: 'published',
      })
    expect(queued.status).toBe(201)

    await request(app).post(`/api/course-management/jobs/${queued.body.id}/run`).set(auth).send({})
    await request(app).post(`/api/course-management/jobs/${queued.body.id}/run`).set(auth).send({})
    await request(app).post(`/api/course-management/jobs/${queued.body.id}/run`).set(auth).send({})

    const dlq = await request(app).get('/api/course-management/jobs/dlq?limit=10').set(auth)
    expect(dlq.status).toBe(200)
    expect(Array.isArray(dlq.body)).toBe(true)
    expect(dlq.body.length).toBeGreaterThan(0)
    expect(dlq.body[0].snapshot?.type).toBe('bulk-status')

    const redrive = await request(app).post(`/api/course-management/jobs/dlq/${dlq.body[0].id}/redrive`).set(auth).send({})
    expect(redrive.status).toBe(201)
    expect(redrive.body.queued?.status).toBe('pending')
  })

  it('returns compliance export bundle for managed course', async () => {
    const login = await loginAs('indra@curiosity.app', 'admin123')
    expect(login.status).toBe(200)
    const auth = { Authorization: `Bearer ${login.body.token}` }

    const created = await request(app).post('/api/course-management').set(auth).send(
      buildManagedCoursePayload({
        id: 'cm-compliance-target',
        slug: 'cm-compliance-target',
        title: 'Compliance Target',
      }),
    )
    expect(created.status).toBe(200)

    const exported = await request(app).get('/api/course-management/cm-compliance-target/compliance-export').set(auth)
    expect(exported.status).toBe(200)
    expect(exported.body.schemaVersion).toBe('1.0')
    expect(exported.body.course?.id).toBe('cm-compliance-target')
    expect(exported.body.audit?.immutableVerify).toBeTypeOf('object')
  })

  it('requires configured secret for inbound webhook ingest', async () => {
    const payload = {
      event: 'curiosity.notification.test',
      message: 'hello',
      courseId: 'ui-101',
    }
    const bodyText = JSON.stringify(payload)
    const timestamp = new Date().toISOString()
    const signature = `v1=${createHmac('sha256', 'fallback-test-secret').update(`${timestamp}.${bodyText}`).digest('hex')}`
    const response = await request(app)
      .post('/api/notifications/webhook/ingest')
      .set('Content-Type', 'application/json')
      .set('X-Curiosity-Timestamp', timestamp)
      .set('X-Curiosity-Nonce', 'nonce-test-1')
      .set('X-Curiosity-Signature', signature)
      .send(payload)
    expect([202, 503, 401]).toContain(response.status)
  })

  it('stores telemetry events and allows admin to list them', async () => {
    const login = await loginAs('indra@curiosity.app', 'admin123')
    expect(login.status).toBe(200)

    const create = await request(app)
      .post('/api/telemetry/events')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({
        domain: 'course-management',
        action: 'save-course',
        severity: 'info',
        message: 'Course saved',
        context: {
          feature: 'manage-course',
          courseId: 'course-ui-101',
          operation: 'Save',
        },
        meta: {
          source: 'integration-test',
        },
      })
    expect(create.status).toBe(202)
    expect(create.body.ok).toBe(true)

    const listed = await request(app)
      .get('/api/telemetry/events?limit=5')
      .set('Authorization', `Bearer ${login.body.token}`)
    expect(listed.status).toBe(200)
    expect(Array.isArray(listed.body)).toBe(true)
    expect(listed.body.length).toBeGreaterThan(0)
    expect(listed.body[0].domain).toBe('course-management')
    expect(listed.body[0].action).toBe('save-course')
  })

  it('blocks non-admin users from reading telemetry events', async () => {
    const login = await loginAs('raka@curiosity.app', 'student123')
    expect(login.status).toBe(200)

    const listed = await request(app)
      .get('/api/telemetry/events?limit=5')
      .set('Authorization', `Bearer ${login.body.token}`)
    expect(listed.status).toBe(403)
    expect(listed.body.message).toMatch(/Admin access required/i)
  })

  it('updates and resets profile successfully', async () => {
    const login = await loginAs('indra@curiosity.app', 'admin123')

    const updateAccount = await request(app)
      .patch('/api/profile/account')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ name: 'Indra Updated' })
    expect(updateAccount.status).toBe(200)
    expect(updateAccount.body.profile.name).toBe('Indra Updated')

    const updatePrefs = await request(app)
      .patch('/api/profile/preferences')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ language: 'en' })
    expect(updatePrefs.status).toBe(200)
    expect(updatePrefs.body.preferences.language).toBe('en')

    const reset = await request(app)
      .post('/api/profile/reset')
      .set('Authorization', `Bearer ${login.body.token}`)
    expect(reset.status).toBe(200)
    expect(reset.body.profile.name).toBe('Indra Permana')
  })

  it('stores credentials as bcrypt hashes', async () => {
    const db = await readDb()
    expect(db.credentials['indra@curiosity.app']).toMatch(/^\$2[aby]\$/)
    expect(db.credentials['ayu@curiosity.app']).toMatch(/^\$2[aby]\$/)
    expect(db.credentials['raka@curiosity.app']).toMatch(/^\$2[aby]\$/)
  })

  it('hydrates plaintext mixed-case credentials into normalized bcrypt key', async () => {
    const db = await readDb()
    db.credentials['MIXED@CURIOSITY.APP'] = 'plain12345'
    await writeDb(db)

    const hydrated = await readDb()
    expect(hydrated.credentials['mixed@curiosity.app']).toMatch(/^\$2[aby]\$/)
    expect(hydrated.credentials['MIXED@CURIOSITY.APP']).toBeUndefined()
  })

  it('upgrades plaintext credentials to bcrypt after successful login', async () => {
    const db = await readDb()
    db.credentials['indra@curiosity.app'] = 'admin123'
    await writeDb(db)

    const login = await loginAs('indra@curiosity.app', 'admin123')
    expect(login.status).toBe(200)

    const upgraded = await readDb()
    expect(upgraded.credentials['indra@curiosity.app']).toMatch(/^\$2[aby]\$/)
  })

  it('returns 400 for invalid user payload role', async () => {
    const login = await loginAs('indra@curiosity.app', 'admin123')
    expect(login.status).toBe(200)

    const createUser = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({
        name: 'Bad Role',
        email: 'badrole@curiosity.app',
        role: 'owner',
        status: 'active',
      })

    expect(createUser.status).toBe(400)
    expect(createUser.body.message).toBeTypeOf('string')
  })

  it('returns 400 for invalid password update payload', async () => {
    const login = await loginAs('indra@curiosity.app', 'admin123')
    expect(login.status).toBe(200)

    const update = await request(app)
      .post('/api/profile/password')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({
        currentPassword: 'admin123',
        newPassword: 'short',
      })

    expect(update.status).toBe(400)
    expect(update.body.message).toBeTypeOf('string')
  })

  it('returns 400 when current password is wrong', async () => {
    const login = await loginAs('indra@curiosity.app', 'admin123')
    const update = await request(app)
      .post('/api/profile/password')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({
        currentPassword: 'wrong123',
        newPassword: 'admin12345',
      })

    expect(update.status).toBe(400)
    expect(update.body.message).toMatch(/Current password/i)
  })

  it('returns 400 when new password equals current password', async () => {
    const login = await loginAs('indra@curiosity.app', 'admin123')
    const update = await request(app)
      .post('/api/profile/password')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({
        currentPassword: 'admin123',
        newPassword: 'admin123',
      })

    expect(update.status).toBe(400)
    expect(update.body.message).toMatch(/harus berbeda/i)
  })

  it('handles users endpoint conflict and not-found branches', async () => {
    const login = await loginAs('indra@curiosity.app', 'admin123')

    const duplicateCreate = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({
        name: 'Duplicate',
        email: 'indra@curiosity.app',
        role: 'student',
        status: 'active',
      })
    expect(duplicateCreate.status).toBe(409)

    const updateNotFound = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({
        id: 'u-not-found',
        name: 'No User',
        email: 'nouser@curiosity.app',
        role: 'student',
        status: 'active',
      })
    expect(updateNotFound.status).toBe(404)
  })

  it('covers invite duplicate and delete/toggle/reset not-found branches', async () => {
    const login = await loginAs('indra@curiosity.app', 'admin123')

    const inviteDuplicate = await request(app)
      .post('/api/users/invite')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({
        name: 'Dup Invite',
        email: 'indra@curiosity.app',
        role: 'student',
      })
    expect(inviteDuplicate.status).toBe(409)

    const deleteMissing = await request(app)
      .delete('/api/users/u-missing')
      .set('Authorization', `Bearer ${login.body.token}`)
    expect(deleteMissing.status).toBe(404)

    const toggleMissing = await request(app)
      .post('/api/users/u-missing/toggle-status')
      .set('Authorization', `Bearer ${login.body.token}`)
    expect(toggleMissing.status).toBe(404)

    const resetMissing = await request(app)
      .post('/api/users/u-missing/reset-password')
      .set('Authorization', `Bearer ${login.body.token}`)
    expect(resetMissing.status).toBe(404)
  })

  it('updates permission matrix and supports bulk actions', async () => {
    const login = await loginAs('indra@curiosity.app', 'admin123')

    const permission = await request(app)
      .put('/api/users/permissions')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({
        admin: { viewDashboard: true, manageCourse: true, manageQuiz: true, manageUsers: true },
        instructor: { viewDashboard: true, manageCourse: true, manageQuiz: true, manageUsers: true },
        student: { viewDashboard: true, manageCourse: false, manageQuiz: false, manageUsers: false },
      })
    expect(permission.status).toBe(200)
    expect(permission.body.instructor.manageUsers).toBe(true)

    const bulkStatus = await request(app)
      .post('/api/users/bulk-status')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ ids: ['u-003'], status: 'suspended' })
    expect(bulkStatus.status).toBe(200)
    expect(bulkStatus.body.find((u) => u.id === 'u-003').status).toBe('suspended')

    const bulkDelete = await request(app)
      .post('/api/users/bulk-delete')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ ids: ['u-004'] })
    expect(bulkDelete.status).toBe(200)
    expect(bulkDelete.body.some((u) => u.id === 'u-004')).toBe(false)
  })

  it('returns admin users list and permission matrix for admin', async () => {
    const login = await loginAs('indra@curiosity.app', 'admin123')

    const users = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${login.body.token}`)
    expect(users.status).toBe(200)
    expect(Array.isArray(users.body)).toBe(true)
    expect(users.body.length).toBeGreaterThan(0)

    const permissions = await request(app)
      .get('/api/users/permissions')
      .set('Authorization', `Bearer ${login.body.token}`)
    expect(permissions.status).toBe(200)
    expect(permissions.body.admin.manageUsers).toBe(true)
  })

  it('enforces course-management access for manager roles only', async () => {
    const student = await loginAs('raka@curiosity.app', 'student123')
    const denied = await request(app).get('/api/course-management').set('Authorization', `Bearer ${student.body.token}`)
    expect(denied.status).toBe(403)

    const instructor = await loginAs('ayu@curiosity.app', 'instructor123')
    const allowed = await request(app).get('/api/course-management').set('Authorization', `Bearer ${instructor.body.token}`)
    expect(allowed.status).toBe(200)
    expect(Array.isArray(allowed.body)).toBe(true)
  })

  it('blocks publish when backend publish checklist is not satisfied', async () => {
    const admin = await loginAs('indra@curiosity.app', 'admin123')
    const auth = { Authorization: `Bearer ${admin.body.token}` }
    const payload = buildManagedCoursePayload({
      status: 'published',
      description: 'Terlalu pendek',
      thumbnail: '',
      modules: [
        {
          id: 'cm-ui-advanced-m1',
          title: 'Module',
          description: '',
          lessons: [
            {
              id: 'cm-ui-advanced-l1',
              title: 'Lesson',
              type: 'video',
              durationMin: 10,
              isPreview: false,
              isLocked: false,
              contentUrl: '',
            },
          ],
        },
      ],
    })
    const res = await request(app).post('/api/course-management').set(auth).send(payload)
    expect(res.status).toBe(422)
    expect(Array.isArray(res.body.errors)).toBe(true)
    expect(res.body.errors.length).toBeGreaterThan(0)
  })

  it('enforces optimistic concurrency version checks on save', async () => {
    const admin = await loginAs('indra@curiosity.app', 'admin123')
    const auth = { Authorization: `Bearer ${admin.body.token}` }

    const created = await request(app).post('/api/course-management').set(auth).send(buildManagedCoursePayload())
    expect(created.status).toBe(200)
    expect(created.body.version).toBe(1)

    const updated = await request(app)
      .post('/api/course-management')
      .set(auth)
      .send({
        ...buildManagedCoursePayload({
          id: created.body.id,
          slug: created.body.slug,
        }),
        version: 1,
        title: 'UI Advanced Systems v2',
      })
    expect(updated.status).toBe(200)
    expect(updated.body.version).toBe(2)

    const stale = await request(app)
      .post('/api/course-management')
      .set(auth)
      .send({
        ...buildManagedCoursePayload({
          id: created.body.id,
          slug: created.body.slug,
        }),
        version: 1,
        title: 'UI Advanced Systems stale write',
      })
    expect(stale.status).toBe(409)
    expect(stale.body.latest?.version).toBe(2)
  })

  it('rejects cyclic prerequisites on backend validation', async () => {
    const admin = await loginAs('indra@curiosity.app', 'admin123')
    const auth = { Authorization: `Bearer ${admin.body.token}` }

    const courseA = await request(app)
      .post('/api/course-management')
      .set(auth)
      .send(
        buildManagedCoursePayload({
          id: 'cm-course-a',
          title: 'Course A',
          slug: 'cm-course-a',
          level: 'intermediate',
        }),
      )
    expect(courseA.status).toBe(200)

    const courseB = await request(app)
      .post('/api/course-management')
      .set(auth)
      .send(
        buildManagedCoursePayload({
          id: 'cm-course-b',
          title: 'Course B',
          slug: 'cm-course-b',
          settings: {
            ...buildManagedCoursePayload().settings,
            prerequisiteCourseIds: ['cm-course-a'],
          },
        }),
      )
    expect(courseB.status).toBe(200)

    const cycleAttempt = await request(app)
      .post('/api/course-management')
      .set(auth)
      .send({
        ...buildManagedCoursePayload({
          id: courseA.body.id,
          title: courseA.body.title,
          slug: courseA.body.slug,
          level: courseA.body.level,
        }),
        version: courseA.body.version,
        settings: {
          ...buildManagedCoursePayload().settings,
          prerequisiteCourseIds: ['cm-course-b'],
        },
      })
    expect(cycleAttempt.status).toBe(422)
    expect(Array.isArray(cycleAttempt.body.errors)).toBe(true)
    expect(cycleAttempt.body.errors).toContain('prerequisite-cycle')
  })

  it('provides course-management permission matrix controls for admin', async () => {
    const admin = await loginAs('indra@curiosity.app', 'admin123')
    const auth = { Authorization: `Bearer ${admin.body.token}` }

    const current = await request(app).get('/api/course-management/permissions').set(auth)
    expect(current.status).toBe(200)
    expect(current.body.managePermissions).toBe(true)

    const matrix = await request(app).get('/api/course-management/permissions/matrix').set(auth)
    expect(matrix.status).toBe(200)
    expect(matrix.body.instructor.delete).toBe(false)

    const updated = await request(app)
      .put('/api/course-management/permissions/matrix')
      .set(auth)
      .send({
        ...matrix.body,
        instructor: {
          ...matrix.body.instructor,
          delete: true,
        },
      })
    expect(updated.status).toBe(200)
    expect(updated.body.instructor.delete).toBe(true)
  })

  it('returns revision history and restores selected revision', async () => {
    const admin = await loginAs('indra@curiosity.app', 'admin123')
    const auth = { Authorization: `Bearer ${admin.body.token}` }

    const created = await request(app).post('/api/course-management').set(auth).send(buildManagedCoursePayload())
    expect(created.status).toBe(200)

    const updated = await request(app)
      .post('/api/course-management')
      .set(auth)
      .send({
        ...buildManagedCoursePayload({
          id: created.body.id,
          slug: created.body.slug,
        }),
        version: created.body.version,
        title: 'UI Advanced Systems Updated',
      })
    expect(updated.status).toBe(200)

    const revisions = await request(app).get(`/api/course-management/${updated.body.id}/revisions`).set(auth)
    expect(revisions.status).toBe(200)
    expect(Array.isArray(revisions.body)).toBe(true)
    expect(revisions.body.length).toBeGreaterThan(0)

    const restored = await request(app)
      .post(`/api/course-management/${updated.body.id}/revisions/${revisions.body[0].id}/restore`)
      .set(auth)
    expect(restored.status).toBe(200)
    expect(restored.body.version).toBeGreaterThan(updated.body.version)
  })

  it('supports course listing and lesson progression with locking rules', async () => {
    const login = await loginAs('indra@curiosity.app', 'admin123')
    const authHeader = { Authorization: `Bearer ${login.body.token}` }

    const courseList = await request(app).get('/api/courses').set(authHeader)
    expect(courseList.status).toBe(200)
    expect(Array.isArray(courseList.body)).toBe(true)
    expect(courseList.body.length).toBeGreaterThan(0)
    expect(courseList.body[0].progress).toBe(0)
    expect(courseList.body[0].activeLessonId).toBeTypeOf('string')

    const detail = await request(app).get('/api/courses/ui-101').set(authHeader)
    expect(detail.status).toBe(200)
    expect(detail.body.activeLesson.id).toBe('ui-101-l1')

    const selectLocked = await request(app).post('/api/courses/ui-101/lessons/ui-101-l2/select').set(authHeader)
    expect(selectLocked.status).toBe(403)

    const blockedComplete = await request(app).post('/api/courses/ui-101/lessons/ui-101-l1/complete').set(authHeader)
    expect(blockedComplete.status).toBe(400)

    const checkpoints = [12, 24, 36, 48, 60, 72, 84, 96, 108]
    let unlockCompletion = null
    for (const positionSec of checkpoints) {
      unlockCompletion = await request(app)
        .post('/api/courses/ui-101/lessons/ui-101-l1/playback')
        .set(authHeader)
        .send({
          positionSec,
          durationSec: 120,
        })
      expect(unlockCompletion.status).toBe(200)
    }
    expect(unlockCompletion.body.progressPercent).toBeGreaterThanOrEqual(90)

    const completeFirst = await request(app).post('/api/courses/ui-101/lessons/ui-101-l1/complete').set(authHeader)
    expect(completeFirst.status).toBe(200)
    expect(completeFirst.body.completedLessons).toBe(1)
    expect(completeFirst.body.activeLesson.id).toBe('ui-101-l2')

    const selectSecond = await request(app).post('/api/courses/ui-101/lessons/ui-101-l2/select').set(authHeader)
    expect(selectSecond.status).toBe(200)
    expect(selectSecond.body.activeLesson.id).toBe('ui-101-l2')
  })

  it('saves lesson playback progress for resume', async () => {
    const login = await loginAs('indra@curiosity.app', 'admin123')
    const authHeader = { Authorization: `Bearer ${login.body.token}` }

    await request(app)
      .post('/api/courses/ui-101/lessons/ui-101-l1/playback')
      .set(authHeader)
      .send({
        positionSec: 12,
        durationSec: 120,
      })

    const savePlayback = await request(app)
      .post('/api/courses/ui-101/lessons/ui-101-l1/playback')
      .set(authHeader)
      .send({
        positionSec: 87,
        durationSec: 120,
      })
    expect(savePlayback.status).toBe(200)
    expect(savePlayback.body.positionSec).toBe(87)
    expect(savePlayback.body.progressPercent).toBeGreaterThan(0)

    const detail = await request(app).get('/api/courses/ui-101').set(authHeader)
    expect(detail.status).toBe(200)
    expect(detail.body.activeLesson.playback.positionSec).toBe(87)
  })

  it('prevents skip-ahead cheating in playback progress tracking', async () => {
    const login = await loginAs('indra@curiosity.app', 'admin123')
    const authHeader = { Authorization: `Bearer ${login.body.token}` }

    const jumpAhead = await request(app)
      .post('/api/courses/ui-101/lessons/ui-101-l1/playback')
      .set(authHeader)
      .send({
        positionSec: 115,
        durationSec: 120,
      })
    expect(jumpAhead.status).toBe(200)
    expect(jumpAhead.body.progressPercent).toBeLessThan(90)

    const blockedComplete = await request(app).post('/api/courses/ui-101/lessons/ui-101-l1/complete').set(authHeader)
    expect(blockedComplete.status).toBe(400)
  })

  it('locks next module until previous module quiz is passed', async () => {
    const login = await loginAs('indra@curiosity.app', 'admin123')
    const authHeader = { Authorization: `Bearer ${login.body.token}` }

    const db = await readDb()
    const course = db.courses.find((item) => item.id === 'ui-101')
    course.modules.push({
      id: 'ui-101-m2',
      title: 'Advanced Layout',
      lessons: [
        {
          id: 'ui-101-l5',
          title: 'Advanced Layout Patterns',
          duration: '13m',
          type: 'video',
          summary: 'Pattern layout untuk dashboard multi panel.',
          resources: ['layout-patterns.txt'],
        },
      ],
    })
    await writeDb(db)

    const completeWithPlaybackGate = async (lessonId, durationSec = 120) => {
      const checkpoints = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.92].map((ratio) => Math.floor(durationSec * ratio))
      for (const positionSec of checkpoints) {
        const playback = await request(app)
          .post(`/api/courses/ui-101/lessons/${lessonId}/playback`)
          .set(authHeader)
          .send({
            positionSec,
            durationSec,
          })
        expect(playback.status).toBe(200)
      }
      const complete = await request(app).post(`/api/courses/ui-101/lessons/${lessonId}/complete`).set(authHeader)
      expect(complete.status).toBe(200)
    }

    await completeWithPlaybackGate('ui-101-l1')
    await completeWithPlaybackGate('ui-101-l2')
    await completeWithPlaybackGate('ui-101-l3')

    const completeWorkshop = await request(app).post('/api/courses/ui-101/lessons/ui-101-l4/complete').set(authHeader)
    expect(completeWorkshop.status).toBe(200)

    const lockedCourse = await request(app).get('/api/courses/ui-101').set(authHeader)
    expect(lockedCourse.status).toBe(200)
    const lesson5Locked = lockedCourse.body.modules
      .flatMap((module) => module.lessons)
      .find((lesson) => lesson.id === 'ui-101-l5')
    expect(lesson5Locked.isLocked).toBe(true)
    expect(String(lesson5Locked.lockReason || '')).toMatch(/Pass|Lulus/i)

    const dbAfterComplete = await readDb()
    dbAfterComplete.quizAttempts = dbAfterComplete.quizAttempts || {}
    const scoped = dbAfterComplete.quizAttempts['u-001'] || {}
    scoped['ui-101-m1'] = [
      {
        id: 'attempt-pass-m1',
        attemptNo: 1,
        score: 100,
        passed: true,
        timedOut: false,
        correctCount: 2,
        total: 2,
        submittedAt: '2026-03-09T00:00:00.000Z',
        details: [],
      },
    ]
    dbAfterComplete.quizAttempts['u-001'] = scoped
    await writeDb(dbAfterComplete)

    const unlockedCourse = await request(app).get('/api/courses/ui-101').set(authHeader)
    expect(unlockedCourse.status).toBe(200)
    const lesson5Unlocked = unlockedCourse.body.modules
      .flatMap((module) => module.lessons)
      .find((lesson) => lesson.id === 'ui-101-l5')
    expect(lesson5Unlocked.isLocked).toBe(false)
  })

  it('supports configurable module prerequisite rules', async () => {
    const login = await loginAs('indra@curiosity.app', 'admin123')
    const authHeader = { Authorization: `Bearer ${login.body.token}` }

    const db = await readDb()
    const course = db.courses.find((item) => item.id === 'ui-101')
    course.modules.push({
      id: 'ui-101-m2',
      title: 'Advanced Layout',
      prerequisite: {
        mode: 'any',
        rules: [
          { type: 'lesson-complete', lessonId: 'ui-101-l4' },
          { type: 'module-quiz-pass', moduleId: 'ui-101-m1' },
        ],
      },
      lessons: [
        {
          id: 'ui-101-l5',
          title: 'Advanced Layout Patterns',
          duration: '13m',
          type: 'video',
          summary: 'Pattern layout untuk dashboard multi panel.',
          resources: ['layout-patterns.txt'],
        },
      ],
    })
    await writeDb(db)

    const completeWithPlaybackGate = async (lessonId, durationSec = 120) => {
      const checkpoints = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.92].map((ratio) => Math.floor(durationSec * ratio))
      for (const positionSec of checkpoints) {
        const playback = await request(app)
          .post(`/api/courses/ui-101/lessons/${lessonId}/playback`)
          .set(authHeader)
          .send({
            positionSec,
            durationSec,
          })
        expect(playback.status).toBe(200)
      }
      const complete = await request(app).post(`/api/courses/ui-101/lessons/${lessonId}/complete`).set(authHeader)
      expect(complete.status).toBe(200)
    }

    await completeWithPlaybackGate('ui-101-l1')
    await completeWithPlaybackGate('ui-101-l2')
    await completeWithPlaybackGate('ui-101-l3')
    const completeWorkshop = await request(app).post('/api/courses/ui-101/lessons/ui-101-l4/complete').set(authHeader)
    expect(completeWorkshop.status).toBe(200)

    const detail = await request(app).get('/api/courses/ui-101').set(authHeader)
    expect(detail.status).toBe(200)
    const lesson5 = detail.body.modules.flatMap((module) => module.lessons).find((lesson) => lesson.id === 'ui-101-l5')
    expect(lesson5.isLocked).toBe(false)
  })

  it('updates module prerequisite via API and restricts to reviewer roles', async () => {
    const admin = await loginAs('indra@curiosity.app', 'admin123')
    const adminAuth = { Authorization: `Bearer ${admin.body.token}` }

    const db = await readDb()
    const course = db.courses.find((item) => item.id === 'ui-101')
    course.modules.push({
      id: 'ui-101-m2',
      title: 'Advanced Layout',
      lessons: [
        {
          id: 'ui-101-l5',
          title: 'Advanced Layout Patterns',
          duration: '13m',
          type: 'video',
          summary: 'Pattern layout untuk dashboard multi panel.',
          resources: ['layout-patterns.txt'],
        },
      ],
    })
    await writeDb(db)

    const student = await loginAs('raka@curiosity.app', 'student123')
    const forbidden = await request(app)
      .patch('/api/courses/ui-101/modules/ui-101-m2/prerequisite')
      .set('Authorization', `Bearer ${student.body.token}`)
      .send({
        mode: 'any',
        rules: [{ type: 'module-complete', moduleId: 'ui-101-m1' }],
      })
    expect(forbidden.status).toBe(403)

    const updated = await request(app)
      .patch('/api/courses/ui-101/modules/ui-101-m2/prerequisite')
      .set(adminAuth)
      .send({
        mode: 'any',
        rules: [
          { type: 'module-complete', moduleId: 'ui-101-m1' },
          { type: 'lesson-complete', lessonId: 'ui-101-l4' },
        ],
      })
    expect(updated.status).toBe(200)
    const module2 = updated.body.modules.find((item) => item.id === 'ui-101-m2')
    expect(module2.prerequisite.mode).toBe('any')
    expect(module2.prerequisite.rules).toEqual([
      { type: 'module-complete', moduleId: 'ui-101-m1' },
      { type: 'lesson-complete', lessonId: 'ui-101-l4' },
    ])
  })

  it('returns learning analytics summary', async () => {
    const login = await loginAs('indra@curiosity.app', 'admin123')
    const authHeader = { Authorization: `Bearer ${login.body.token}` }

    await request(app)
      .post('/api/courses/ui-101/lessons/ui-101-l1/playback')
      .set(authHeader)
      .send({
        positionSec: 12,
        durationSec: 120,
      })
    await request(app)
      .post('/api/courses/ui-101/lessons/ui-101-l1/playback')
      .set(authHeader)
      .send({
        positionSec: 24,
        durationSec: 120,
      })

    const analytics = await request(app).get('/api/analytics/learning').set(authHeader)
    expect(analytics.status).toBe(200)
    expect(typeof analytics.body.completionRateAvg).toBe('number')
    expect(typeof analytics.body.weeklyStudy?.totalMinutes).toBe('number')
    expect(Array.isArray(analytics.body.courses)).toBe(true)
    expect(Array.isArray(analytics.body.weeklyStudy?.byDay)).toBe(true)
  })

  it('returns global continue learning based on most recent touched course', async () => {
    const login = await loginAs('indra@curiosity.app', 'admin123')
    const authHeader = { Authorization: `Bearer ${login.body.token}` }

    await request(app).post('/api/courses/ui-101/lessons/ui-101-l1/select').set(authHeader)
    await request(app).post('/api/courses/fe-101/lessons/fe-101-l1/select').set(authHeader)

    const res = await request(app).get('/api/courses/continue').set(authHeader)
    expect(res.status).toBe(200)
    expect(res.body.id).toBe('fe-101')
    expect(typeof res.body.activeLessonId).toBe('string')
  })

  it('supports lesson notes CRUD by authenticated user', async () => {
    const login = await loginAs('indra@curiosity.app', 'admin123')
    const authHeader = { Authorization: `Bearer ${login.body.token}` }

    const created = await request(app)
      .post('/api/courses/ui-101/lessons/ui-101-l1/notes')
      .set(authHeader)
      .send({
        timestampSec: 42,
        note: 'Gunakan kontras tinggi untuk CTA utama.',
      })
    expect(created.status).toBe(201)
    expect(Array.isArray(created.body)).toBe(true)
    expect(created.body.length).toBe(1)
    const noteId = created.body[0].id

    const listed = await request(app).get('/api/courses/ui-101/lessons/ui-101-l1/notes').set(authHeader)
    expect(listed.status).toBe(200)
    expect(listed.body[0].timestampSec).toBe(42)

    const updated = await request(app)
      .patch(`/api/courses/ui-101/lessons/ui-101-l1/notes/${noteId}`)
      .set(authHeader)
      .send({
        note: 'Kontras CTA harus konsisten di semua breakpoints.',
      })
    expect(updated.status).toBe(200)
    expect(updated.body[0].note).toMatch(/breakpoints/i)

    const removed = await request(app)
      .delete(`/api/courses/ui-101/lessons/ui-101-l1/notes/${noteId}`)
      .set(authHeader)
    expect(removed.status).toBe(200)
    expect(removed.body.length).toBe(0)
  })

  it('covers course endpoint edge cases and audit limit fallback', async () => {
    const login = await loginAs('indra@curiosity.app', 'admin123')
    const authHeader = { Authorization: `Bearer ${login.body.token}` }

    const db = await readDb()
    delete db.courses
    await writeDb(db)

    const listWithoutCourses = await request(app).get('/api/courses').set(authHeader)
    expect(listWithoutCourses.status).toBe(200)
    expect(Array.isArray(listWithoutCourses.body)).toBe(true)
    expect(listWithoutCourses.body.length).toBeGreaterThan(0)

    await resetDb()
    const relogin = await loginAs('indra@curiosity.app', 'admin123')
    const reloginAuth = { Authorization: `Bearer ${relogin.body.token}` }

    const missingCourse = await request(app).get('/api/courses/not-found').set(reloginAuth)
    expect(missingCourse.status).toBe(404)

    const missingLessonSelect = await request(app).post('/api/courses/ui-101/lessons/l-unknown/select').set(reloginAuth)
    expect(missingLessonSelect.status).toBe(404)

    const missingLessonComplete = await request(app).post('/api/courses/ui-101/lessons/l-unknown/complete').set(reloginAuth)
    expect(missingLessonComplete.status).toBe(404)

    const completeLockedLesson = await request(app).post('/api/courses/ui-101/lessons/ui-101-l2/complete').set(reloginAuth)
    expect(completeLockedLesson.status).toBe(403)

    const audit = await request(app).get('/api/audit-logs?limit=abc').set(reloginAuth)
    expect(audit.status).toBe(200)
    expect(Array.isArray(audit.body)).toBe(true)
    expect(audit.body.length).toBeGreaterThan(0)
  })

  it('supports lesson discussion list and create with validation', async () => {
    const login = await loginAs('indra@curiosity.app', 'admin123')
    const authHeader = { Authorization: `Bearer ${login.body.token}` }

    const initial = await request(app).get('/api/courses/ui-101/lessons/ui-101-l1/discussions').set(authHeader)
    expect(initial.status).toBe(200)
    expect(Array.isArray(initial.body)).toBe(true)

    const create = await request(app)
      .post('/api/courses/ui-101/lessons/ui-101-l1/discussions')
      .set(authHeader)
      .send({ message: 'Materi ini membantu banget untuk memahami hierarchy.' })
    expect(create.status).toBe(201)
    expect(create.body[0].message).toMatch(/hierarchy/i)
    expect(create.body[0].authorName).toBe('Indra Permana')
    expect(create.body[0].parentId).toBeNull()

    const reply = await request(app)
      .post('/api/courses/ui-101/lessons/ui-101-l1/discussions')
      .set(authHeader)
      .send({
        message: 'Setuju, terutama bagian visual scanning.',
        parentId: create.body[0].id,
      })
    expect(reply.status).toBe(201)
    expect(reply.body[0].parentId).toBe(create.body[0].id)

    const invalidPayload = await request(app)
      .post('/api/courses/ui-101/lessons/ui-101-l1/discussions')
      .set(authHeader)
      .send({ message: 'x' })
    expect(invalidPayload.status).toBe(400)

    const missingParent = await request(app)
      .post('/api/courses/ui-101/lessons/ui-101-l1/discussions')
      .set(authHeader)
      .send({ message: 'reply invalid', parentId: 'disc-not-found' })
    expect(missingParent.status).toBe(404)

    const missingLesson = await request(app)
      .post('/api/courses/ui-101/lessons/not-found/discussions')
      .set(authHeader)
      .send({ message: 'hello world' })
    expect(missingLesson.status).toBe(404)

    const edit = await request(app)
      .patch(`/api/courses/ui-101/lessons/ui-101-l1/discussions/${create.body[0].id}`)
      .set(authHeader)
      .send({ message: 'Materi ini sangat membantu untuk visual hierarchy.' })
    expect(edit.status).toBe(200)
    expect(edit.body.find((item) => item.id === create.body[0].id).message).toMatch(/sangat membantu/i)

    const student = await loginAs('raka@curiosity.app', 'student123')
    const studentAuth = { Authorization: `Bearer ${student.body.token}` }
    const forbiddenEdit = await request(app)
      .patch(`/api/courses/ui-101/lessons/ui-101-l1/discussions/${create.body[0].id}`)
      .set(studentAuth)
      .send({ message: 'attempt edit other comment' })
    expect(forbiddenEdit.status).toBe(403)

    const forbiddenDelete = await request(app)
      .delete(`/api/courses/ui-101/lessons/ui-101-l1/discussions/${create.body[0].id}`)
      .set(studentAuth)
    expect(forbiddenDelete.status).toBe(403)

    const studentReply = await request(app)
      .post('/api/courses/ui-101/lessons/ui-101-l1/discussions')
      .set(studentAuth)
      .send({
        message: 'Saya setuju dengan insight ini.',
        parentId: create.body[0].id,
      })
    expect(studentReply.status).toBe(201)

    const deleted = await request(app)
      .delete(`/api/courses/ui-101/lessons/ui-101-l1/discussions/${create.body[0].id}`)
      .set(authHeader)
    expect(deleted.status).toBe(200)
    expect(deleted.body.some((item) => item.id === create.body[0].id)).toBe(false)
    expect(deleted.body.some((item) => item.parentId === create.body[0].id)).toBe(false)
  })

  it('lists discussion notifications for other users and excludes own comments', async () => {
    const admin = await loginAs('indra@curiosity.app', 'admin123')
    const adminAuth = { Authorization: `Bearer ${admin.body.token}` }

    const create = await request(app)
      .post('/api/courses/ui-101/lessons/ui-101-l1/discussions')
      .set(adminAuth)
      .send({ message: 'Ping dari admin untuk notifikasi @raka.' })
    expect(create.status).toBe(201)
    expect(create.body[0].mentionUserIds).toContain('u-003')

    const createSecond = await request(app)
      .post('/api/courses/ui-101/lessons/ui-101-l1/discussions')
      .set(adminAuth)
      .send({ message: 'Pesan kedua admin untuk sorting notifikasi.' })
    expect(createSecond.status).toBe(201)

    const adminNotifications = await request(app).get('/api/notifications?limit=10').set(adminAuth)
    expect(adminNotifications.status).toBe(200)
    expect(adminNotifications.body.some((item) => item.id === create.body[0].id)).toBe(false)

    const student = await loginAs('raka@curiosity.app', 'student123')
    const studentNotifications = await request(app)
      .get('/api/notifications?limit=abc')
      .set('Authorization', `Bearer ${student.body.token}`)
    expect(studentNotifications.status).toBe(200)
    expect(studentNotifications.body.some((item) => item.id === create.body[0].id)).toBe(true)
    expect(studentNotifications.body.length).toBeGreaterThan(1)
    expect(studentNotifications.body.some((item) => item.id === create.body[0].id && item.isMention === true)).toBe(true)

    const db = await readDb()
    db.discussions['x-404:l-404'] = [
      {
        id: 'disc-fallback',
        courseId: 'x-404',
        lessonId: 'l-404',
        authorId: 'u-001',
        authorName: 'Indra Permana',
        message: 'Fallback notification item',
        createdAt: new Date().toISOString(),
      },
    ]
    await writeDb(db)

    const fallbackNotification = await request(app)
      .get('/api/notifications?limit=1')
      .set('Authorization', `Bearer ${student.body.token}`)
    expect(fallbackNotification.status).toBe(200)
    expect(fallbackNotification.body.length).toBe(1)
    expect(fallbackNotification.body[0].courseTitle).toBe('Course')
    expect(fallbackNotification.body[0].lessonTitle).toBe('Lesson')
  })

  it('supports quiz meta, session, submit, and history', async () => {
    const login = await loginAs('indra@curiosity.app', 'admin123')
    const authHeader = { Authorization: `Bearer ${login.body.token}` }

    const meta = await request(app).get('/api/quizzes/ui-101').set(authHeader)
    expect(meta.status).toBe(200)
    expect(meta.body.id).toBe('ui-101')
    expect(meta.body.questionCount).toBeGreaterThan(0)

    const historyBefore = await request(app).get('/api/quizzes/ui-101/history').set(authHeader)
    expect(historyBefore.status).toBe(200)
    expect(Array.isArray(historyBefore.body)).toBe(true)
    expect(historyBefore.body.length).toBe(0)

    const session = await request(app)
      .post('/api/quizzes/ui-101/session')
      .set(authHeader)
      .send({ retake: false })
    expect(session.status).toBe(201)
    expect(session.body.sessionId).toBeTypeOf('string')
    expect(Array.isArray(session.body.questions)).toBe(true)
    expect(session.body.questions.length).toBe(meta.body.questionCount)

    const firstAnswers = {}
    session.body.questions.forEach((question) => {
      firstAnswers[question.id] = question.options[0]?.id || ''
    })

    const submit = await request(app)
      .post('/api/quizzes/ui-101/submit')
      .set(authHeader)
      .send({
        sessionId: session.body.sessionId,
        answers: firstAnswers,
        forced: false,
      })
    expect(submit.status).toBe(200)
    expect(typeof submit.body.score).toBe('number')
    expect(submit.body.total).toBe(meta.body.questionCount)
    expect(Array.isArray(submit.body.details)).toBe(true)
    expect(submit.body.details.length).toBe(meta.body.questionCount)

    const historyAfter = await request(app).get('/api/quizzes/ui-101/history').set(authHeader)
    expect(historyAfter.status).toBe(200)
    expect(historyAfter.body.length).toBe(1)
    expect(historyAfter.body[0].id).toBe(submit.body.id)
  })

  it('returns quiz errors for unknown quiz and invalid/missing session', async () => {
    const login = await loginAs('indra@curiosity.app', 'admin123')
    const authHeader = { Authorization: `Bearer ${login.body.token}` }

    const missingQuiz = await request(app).get('/api/quizzes/not-found').set(authHeader)
    expect(missingQuiz.status).toBe(404)

    const missingSession = await request(app)
      .post('/api/quizzes/ui-101/submit')
      .set(authHeader)
      .send({
        sessionId: 'quizsess-missing',
        answers: {},
      })
    expect(missingSession.status).toBe(404)
  })

  it('supports quiz management for quiz manager role and blocks student', async () => {
    const instructor = await loginAs('ayu@curiosity.app', 'instructor123')
    const instructorAuth = { Authorization: `Bearer ${instructor.body.token}` }

    const list = await request(app).get('/api/quizzes').set(instructorAuth)
    expect(list.status).toBe(200)
    expect(Array.isArray(list.body)).toBe(true)
    expect(list.body.length).toBeGreaterThan(0)

    const created = await request(app)
      .post('/api/quizzes')
      .set(instructorAuth)
      .send({
        courseId: 'ui-101',
        moduleId: 'ui-101-m1',
        title: 'Quiz Authoring Test',
        description: 'Generated from integration test.',
        passingScore: 75,
        maxAttempts: 2,
        timeLimitSec: 300,
        status: 'draft',
        questions: [
          {
            id: 'author-q1',
            title: 'Apa tujuan quiz ini?',
            options: ['Testing', 'Production'],
            correctIndex: 0,
            explanation: 'Untuk menguji endpoint CRUD quiz.',
          },
        ],
      })
    expect(created.status).toBe(200)
    expect(created.body.title).toBe('Quiz Authoring Test')
    expect(created.body.status).toBe('draft')

    const detail = await request(app).get(`/api/quizzes/${created.body.id}/editor`).set(instructorAuth)
    expect(detail.status).toBe(200)
    expect(Array.isArray(detail.body.questions)).toBe(true)
    expect(detail.body.questions.length).toBe(1)

    const updateStatus = await request(app)
      .patch(`/api/quizzes/${created.body.id}/status`)
      .set(instructorAuth)
      .send({ status: 'published' })
    expect(updateStatus.status).toBe(200)
    expect(updateStatus.body.status).toBe('published')

    const bulkStatus = await request(app)
      .post('/api/quizzes/bulk-status')
      .set(instructorAuth)
      .send({ ids: [created.body.id], status: 'draft' })
    expect(bulkStatus.status).toBe(200)
    expect(Array.isArray(bulkStatus.body)).toBe(true)
    expect(bulkStatus.body[0].status).toBe('draft')

    const bulkDelete = await request(app)
      .post('/api/quizzes/bulk-delete')
      .set(instructorAuth)
      .send({ ids: [created.body.id] })
    expect(bulkDelete.status).toBe(200)
    expect(Array.isArray(bulkDelete.body)).toBe(true)
    expect(bulkDelete.body.some((quiz) => quiz.id === created.body.id)).toBe(false)

    const deleted = await request(app).delete(`/api/quizzes/${created.body.id}`).set(instructorAuth)
    expect(deleted.status).toBe(404)

    const student = await loginAs('raka@curiosity.app', 'student123')
    const forbiddenList = await request(app).get('/api/quizzes').set('Authorization', `Bearer ${student.body.token}`)
    expect(forbiddenList.status).toBe(403)
    const forbiddenStatus = await request(app)
      .patch(`/api/quizzes/${created.body.id}/status`)
      .set('Authorization', `Bearer ${student.body.token}`)
      .send({ status: 'draft' })
    expect(forbiddenStatus.status).toBe(403)
    const forbiddenBulk = await request(app)
      .post('/api/quizzes/bulk-status')
      .set('Authorization', `Bearer ${student.body.token}`)
      .send({ ids: ['ui-101'], status: 'draft' })
    expect(forbiddenBulk.status).toBe(403)
  })

  it('blocks student from draft quiz but allows quiz manager', async () => {
    const instructor = await loginAs('ayu@curiosity.app', 'instructor123')
    const instructorAuth = { Authorization: `Bearer ${instructor.body.token}` }

    const created = await request(app)
      .post('/api/quizzes')
      .set(instructorAuth)
      .send({
        courseId: 'ui-101',
        moduleId: 'ui-101-m1',
        title: 'Draft Visibility Test',
        description: 'Draft should not be visible for student.',
        passingScore: 70,
        maxAttempts: 3,
        timeLimitSec: 300,
        status: 'draft',
        questions: [
          {
            id: 'draft-q1',
            title: 'Draft question title',
            options: ['A', 'B'],
            correctIndex: 0,
            explanation: 'Draft explanation',
          },
        ],
      })
    expect(created.status).toBe(200)

    const managerMeta = await request(app).get(`/api/quizzes/${created.body.id}`).set(instructorAuth)
    expect(managerMeta.status).toBe(200)
    expect(managerMeta.body.status).toBe('draft')

    const student = await loginAs('raka@curiosity.app', 'student123')
    const studentAuth = { Authorization: `Bearer ${student.body.token}` }
    const studentMeta = await request(app).get(`/api/quizzes/${created.body.id}`).set(studentAuth)
    expect(studentMeta.status).toBe(403)

    const studentStart = await request(app).post(`/api/quizzes/${created.body.id}/session`).set(studentAuth).send({ retake: false })
    expect(studentStart.status).toBe(403)
  })

  it('toggles active user status to suspended', async () => {
    const login = await loginAs('indra@curiosity.app', 'admin123')
    const toggled = await request(app)
      .post('/api/users/u-003/toggle-status')
      .set('Authorization', `Bearer ${login.body.token}`)

    expect(toggled.status).toBe(200)
    expect(toggled.body.find((user) => user.id === 'u-003').status).toBe('suspended')
  })

  it('supports invite, toggle status, reset password, and delete user lifecycle', async () => {
    const login = await loginAs('indra@curiosity.app', 'admin123')

    const invite = await request(app)
      .post('/api/users/invite')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({
        name: 'Lifecycle User',
        email: 'lifecycle@curiosity.app',
        role: 'student',
      })
    expect(invite.status).toBe(200)

    const created = invite.body.find((u) => u.email === 'lifecycle@curiosity.app')
    expect(created).toBeTruthy()

    const toggle = await request(app)
      .post(`/api/users/${created.id}/toggle-status`)
      .set('Authorization', `Bearer ${login.body.token}`)
    expect(toggle.status).toBe(200)

    const resetPassword = await request(app)
      .post(`/api/users/${created.id}/reset-password`)
      .set('Authorization', `Bearer ${login.body.token}`)
    expect(resetPassword.status).toBe(200)

    const removed = await request(app)
      .delete(`/api/users/${created.id}`)
      .set('Authorization', `Bearer ${login.body.token}`)
    expect(removed.status).toBe(200)
    expect(removed.body.some((u) => u.id === created.id)).toBe(false)
  })

  it('updates existing user email and migrates credentials key', async () => {
    const login = await loginAs('indra@curiosity.app', 'admin123')

    const update = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({
        id: 'u-003',
        name: 'Raka Wijaya',
        email: 'raka.new@curiosity.app',
        role: 'student',
        status: 'active',
      })
    expect(update.status).toBe(200)

    const oldEmailLogin = await loginAs('raka@curiosity.app', 'student123')
    expect(oldEmailLogin.status).toBe(401)

    const newEmailLogin = await loginAs('raka.new@curiosity.app', 'student123')
    expect(newEmailLogin.status).toBe(200)
  })

  it('replaces full profile state', async () => {
    const login = await loginAs('indra@curiosity.app', 'admin123')
    const profile = await request(app)
      .get('/api/profile')
      .set('Authorization', `Bearer ${login.body.token}`)
    expect(profile.status).toBe(200)

    const nextState = {
      ...profile.body,
      profile: {
        ...profile.body.profile,
        name: 'Indra Replace',
      },
    }

    const replace = await request(app)
      .put('/api/profile')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send(nextState)
    expect(replace.status).toBe(200)
    expect(replace.body.profile.name).toBe('Indra Replace')
  })

  it('blocks non-admin from audit logs endpoint', async () => {
    const login = await loginAs('raka@curiosity.app', 'student123')
    const audit = await request(app)
      .get('/api/audit-logs?limit=5')
      .set('Authorization', `Bearer ${login.body.token}`)

    expect(audit.status).toBe(403)
  })

  it('supports submission and instructor review workflow', async () => {
    const studentLogin = await loginAs('raka@curiosity.app', 'student123')
    expect(studentLogin.status).toBe(200)

    const submission = await request(app)
      .post('/api/courses/ui-101/lessons/ui-101-l1/submission')
      .set('Authorization', `Bearer ${studentLogin.body.token}`)
      .send({
        linkUrl: 'https://example.com/project/ui-101-l1',
        notes: 'Initial delivery for review',
      })
    expect(submission.status).toBe(201)
    expect(submission.body.status).toBe('submitted')

    const instructorLogin = await loginAs('ayu@curiosity.app', 'instructor123')
    expect(instructorLogin.status).toBe(200)

    const assignment = await request(app)
      .get('/api/courses/ui-101/lessons/ui-101-l1/assignment')
      .set('Authorization', `Bearer ${instructorLogin.body.token}`)
    expect(assignment.status).toBe(200)
    expect(Array.isArray(assignment.body.submissions)).toBe(true)
    expect(assignment.body.submissions.length).toBeGreaterThan(0)

    const review = await request(app)
      .patch(`/api/courses/ui-101/lessons/ui-101-l1/submissions/${submission.body.id}/review`)
      .set('Authorization', `Bearer ${instructorLogin.body.token}`)
      .send({
        status: 'graded',
        feedback: 'Good progress, improve spacing consistency.',
        rubricScores: [
          { criterionId: 'problem-understanding', score: 33, comment: 'Context sudah kuat.' },
          { criterionId: 'execution-quality', score: 31, comment: 'Spacing masih perlu dirapikan.' },
          { criterionId: 'communication', score: 18, comment: 'Penjelasan cukup jelas.' },
        ],
      })

    expect(review.status).toBe(200)
    expect(review.body.status).toBe('graded')
    expect(review.body.scorePercent).toBe(82)
    expect(review.body.rubricScores[0].comment).toMatch(/Context/i)

    const resubmit = await request(app)
      .post('/api/courses/ui-101/lessons/ui-101-l1/submission')
      .set('Authorization', `Bearer ${studentLogin.body.token}`)
      .send({
        linkUrl: 'https://example.com/project/ui-101-l1-v2',
        notes: 'Revision v2 after feedback',
      })

    expect(resubmit.status).toBe(200)
    expect(Array.isArray(resubmit.body.history)).toBe(true)
    expect(resubmit.body.history.length).toBeGreaterThan(0)
    expect(resubmit.body.history[0].action).toBe('resubmitted')
    expect(resubmit.body.history[0].previousSnapshot?.status).toBe('submitted')
  })

  it('uploads attachment and reuses attachmentId in assignment submission', async () => {
    const studentLogin = await loginAs('raka@curiosity.app', 'student123')
    expect(studentLogin.status).toBe(200)

    const upload = await request(app)
      .post('/api/uploads')
      .set('Authorization', `Bearer ${studentLogin.body.token}`)
      .send({
        fileName: 'notes.txt',
        dataUrl: 'data:text/plain;base64,SGVsbG8gQ3VyaW9zaXR5',
        purpose: 'assignment',
      })

    expect(upload.status).toBe(201)
    expect(upload.body.id).toMatch(/^upl-/)

    const submit = await request(app)
      .post('/api/courses/ui-101/lessons/ui-101-l1/submission')
      .set('Authorization', `Bearer ${studentLogin.body.token}`)
      .send({
        notes: 'Upload reference attached',
        attachmentId: upload.body.id,
      })

    expect([200, 201]).toContain(submit.status)
    expect(submit.body.attachmentId).toBe(upload.body.id)
    expect(submit.body.attachmentDataUrl).toBe('')

    const fetchData = await request(app)
      .get(`/api/uploads/${upload.body.id}/data`)
      .set('Authorization', `Bearer ${studentLogin.body.token}`)

    expect(fetchData.status).toBe(200)
    expect(fetchData.body.dataUrl).toMatch(/^data:text\/plain;base64,/)

    const signedUrl = await request(app)
      .get(`/api/uploads/${upload.body.id}/url`)
      .set('Authorization', `Bearer ${studentLogin.body.token}`)
    expect(signedUrl.status).toBe(200)
    expect(signedUrl.body.requiresAuth).toBe(true)
  })

  it('rejects upload when mime signature does not match extension/content', async () => {
    const studentLogin = await loginAs('raka@curiosity.app', 'student123')
    expect(studentLogin.status).toBe(200)

    const invalidUpload = await request(app)
      .post('/api/uploads')
      .set('Authorization', `Bearer ${studentLogin.body.token}`)
      .send({
        fileName: 'fake.png',
        dataUrl: 'data:image/png;base64,SGVsbG8gV29ybGQ=',
        purpose: 'assignment',
      })

    expect(invalidUpload.status).toBe(400)
    expect(invalidUpload.body.message).toMatch(/signature|compatible|unsupported/i)
  })

  it('rejects upload when user quota exceeded', async () => {
    const db = await readDb()
    db.uploads['upl-seed-quota'] = {
      id: 'upl-seed-quota',
      fileName: 'seed.bin',
      safeName: 'seed.bin',
      storageName: 'upl-seed-quota-seed.bin',
      mimeType: 'application/zip',
      sizeBytes: 20 * 1024 * 1024,
      ownerId: 'u-003',
      purpose: 'assignment',
      uploadedAt: new Date().toISOString(),
    }
    await writeDb(db)

    const studentLogin = await loginAs('raka@curiosity.app', 'student123')
    expect(studentLogin.status).toBe(200)

    const upload = await request(app)
      .post('/api/uploads')
      .set('Authorization', `Bearer ${studentLogin.body.token}`)
      .send({
        fileName: 'notes.txt',
        dataUrl: 'data:text/plain;base64,SGVsbG8=',
        purpose: 'assignment',
      })

    expect(upload.status).toBe(400)
    expect(upload.body.message).toMatch(/quota/i)
  })

  it('enforces assignment deadline policy (late and closed)', async () => {
    const db = await readDb()
    const course = db.courses.find((item) => item.id === 'ui-101')
    const lesson = course.modules.flatMap((module) => module.lessons).find((item) => item.id === 'ui-101-l1')
    lesson.assignment = {
      dueAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      graceMinutes: 30,
    }
    await writeDb(db)

    const studentLogin = await loginAs('raka@curiosity.app', 'student123')
    expect(studentLogin.status).toBe(200)

    const lateSubmit = await request(app)
      .post('/api/courses/ui-101/lessons/ui-101-l1/submission')
      .set('Authorization', `Bearer ${studentLogin.body.token}`)
      .send({
        notes: 'Submitting in late window',
      })
    expect([200, 201]).toContain(lateSubmit.status)
    expect(lateSubmit.body.submissionMode).toBe('late')

    const dbClosed = await readDb()
    const courseClosed = dbClosed.courses.find((item) => item.id === 'ui-101')
    const lessonClosed = courseClosed.modules.flatMap((module) => module.lessons).find((item) => item.id === 'ui-101-l1')
    lessonClosed.assignment = {
      dueAt: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
      graceMinutes: 30,
    }
    await writeDb(dbClosed)

    const closedSubmit = await request(app)
      .post('/api/courses/ui-101/lessons/ui-101-l1/submission')
      .set('Authorization', `Bearer ${studentLogin.body.token}`)
      .send({
        notes: 'Trying after close',
      })
    expect(closedSubmit.status).toBe(403)
    expect(closedSubmit.body.message).toMatch(/closed/i)
  })

  it('allows instructor to update assignment deadline policy and blocks student', async () => {
    const instructorLogin = await loginAs('ayu@curiosity.app', 'instructor123')
    expect(instructorLogin.status).toBe(200)

    const dueAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
    const update = await request(app)
      .patch('/api/courses/ui-101/lessons/ui-101-l1/assignment-config')
      .set('Authorization', `Bearer ${instructorLogin.body.token}`)
      .send({
        dueAt,
        graceMinutes: 45,
      })

    expect(update.status).toBe(200)
    expect(update.body.assignment.dueAt).toBe(dueAt)
    expect(update.body.assignment.graceMinutes).toBe(45)

    const studentLogin = await loginAs('raka@curiosity.app', 'student123')
    expect(studentLogin.status).toBe(200)
    const forbidden = await request(app)
      .patch('/api/courses/ui-101/lessons/ui-101-l1/assignment-config')
      .set('Authorization', `Bearer ${studentLogin.body.token}`)
      .send({
        graceMinutes: 10,
      })
    expect(forbidden.status).toBe(403)
  })

  it('blocks student from reviewing submission', async () => {
    const studentLogin = await loginAs('raka@curiosity.app', 'student123')
    expect(studentLogin.status).toBe(200)

    const submission = await request(app)
      .post('/api/courses/ui-101/lessons/ui-101-l1/submission')
      .set('Authorization', `Bearer ${studentLogin.body.token}`)
      .send({
        notes: 'Try review self',
      })
    expect([200, 201]).toContain(submission.status)

    const forbidden = await request(app)
      .patch(`/api/courses/ui-101/lessons/ui-101-l1/submissions/${submission.body.id}/review`)
      .set('Authorization', `Bearer ${studentLogin.body.token}`)
      .send({
        status: 'graded',
      })
    expect(forbidden.status).toBe(403)
  })

  it('rate limits repeated failed login attempts from same ip', async () => {
    const headers = { 'X-Forwarded-For': '10.10.10.10' }
    let lastResponse = null

    for (let i = 0; i < 11; i += 1) {
      lastResponse = await loginAs('indra@curiosity.app', 'wrong-password', headers)
    }

    expect(lastResponse.status).toBe(429)
    expect(lastResponse.body.message).toMatch(/Terlalu banyak percobaan login/i)
  })

  it('returns 404 for unknown api endpoint', async () => {
    const res = await request(app).get('/api/does-not-exist')
    expect(res.status).toBe(404)
    expect(res.body.message).toMatch(/Endpoint not found/i)
  })
})
