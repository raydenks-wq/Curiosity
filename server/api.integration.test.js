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
