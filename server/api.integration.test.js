import request from 'supertest'
import jwt from 'jsonwebtoken'
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

    const completeFirst = await request(app).post('/api/courses/ui-101/lessons/ui-101-l1/complete').set(authHeader)
    expect(completeFirst.status).toBe(200)
    expect(completeFirst.body.completedLessons).toBe(1)
    expect(completeFirst.body.activeLesson.id).toBe('ui-101-l2')

    const selectSecond = await request(app).post('/api/courses/ui-101/lessons/ui-101-l2/select').set(authHeader)
    expect(selectSecond.status).toBe(200)
    expect(selectSecond.body.activeLesson.id).toBe('ui-101-l2')
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
