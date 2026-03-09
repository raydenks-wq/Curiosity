import { authSession } from '../../authSession'
import { getDefaultProfileState } from '../../profileService'
import { httpClient } from '../httpClient'

const SESSION_TTL_MS = 1000 * 60 * 60 * 12

const accessLevels = [
  {
    id: 'admin',
    label: 'Admin',
    description: 'Akses penuh termasuk manajemen user, role, dan konfigurasi platform.',
  },
  {
    id: 'instructor',
    label: 'Instructor',
    description: 'Kelola course, quiz, materi, dan melihat progres kelas yang diajar.',
  },
  {
    id: 'student',
    label: 'Student',
    description: 'Akses belajar, submit quiz/tugas, dan melihat progres pribadi.',
  },
]

const permissionLabels = {
  viewDashboard: 'View Dashboard',
  manageCourse: 'Manage Courses',
  manageQuiz: 'Manage Quizzes',
  manageUsers: 'Manage Users',
}

const mapAuthSession = (payload) => ({
  token: payload.token,
  user: payload.user,
  issuedAt: payload.issuedAt || Date.now(),
  expiresAt: payload.expiresAt || Date.now() + SESSION_TTL_MS,
})

export const httpAdapter = {
  auth: {
    async signIn(payload) {
      const result = await httpClient.request('/auth/login', {
        method: 'POST',
        body: payload,
      })
      const session = mapAuthSession(result)
      authSession.write(session)
      return session
    },

    async restoreSession() {
      const session = authSession.read()
      if (!session || !session.expiresAt || session.expiresAt < Date.now()) {
        authSession.clear()
        return null
      }

      try {
        const result = await httpClient.request('/auth/session', { auth: true })
        const refreshed = mapAuthSession({
          token: session.token,
          user: result.user || session.user,
          expiresAt: result.expiresAt || session.expiresAt,
          issuedAt: session.issuedAt,
        })
        authSession.write(refreshed)
        return refreshed
      } catch (error) {
        if (error instanceof Error && (error.code === 'AUTH_REQUIRED' || error.code === 'FORBIDDEN')) {
          authSession.clear()
          return null
        }
        return session
      }
    },

    async signOut() {
      try {
        await httpClient.request('/auth/logout', { method: 'POST', auth: true })
      } finally {
        authSession.clear()
      }
    },

    getDemoCredentials: () => [],
  },
  profile: {
    load: () => httpClient.request('/profile', { auth: true }),
    saveAccount: (payload) =>
      httpClient.request('/profile/account', {
        method: 'PATCH',
        body: payload,
        auth: true,
      }),
    savePreferences: (payload) =>
      httpClient.request('/profile/preferences', {
        method: 'PATCH',
        body: payload,
        auth: true,
      }),
    updatePassword: (payload) =>
      httpClient.request('/profile/password', {
        method: 'POST',
        body: payload,
        auth: true,
      }),
    reset: () =>
      httpClient.request('/profile/reset', {
        method: 'POST',
        auth: true,
      }),
    saveAll: (payload) =>
      httpClient.request('/profile', {
        method: 'PUT',
        body: payload,
        auth: true,
      }),
    getDefaultState: () => getDefaultProfileState(),
  },
  users: {
    loadUsers: () => httpClient.request('/users', { auth: true }),
    loadPermissionMatrix: () => httpClient.request('/users/permissions', { auth: true }),
    savePermissionMatrix: (payload) =>
      httpClient.request('/users/permissions', {
        method: 'PUT',
        body: payload,
        auth: true,
      }),
    saveUser: (payload) =>
      httpClient.request('/users', {
        method: 'POST',
        body: payload,
        auth: true,
      }),
    inviteUser: (payload) =>
      httpClient.request('/users/invite', {
        method: 'POST',
        body: payload,
        auth: true,
      }),
    deleteUser: (id) =>
      httpClient.request(`/users/${id}`, {
        method: 'DELETE',
        auth: true,
      }),
    deleteUsers: (ids) =>
      httpClient.request('/users/bulk-delete', {
        method: 'POST',
        body: { ids },
        auth: true,
      }),
    bulkUpdateStatus: (ids, status) =>
      httpClient.request('/users/bulk-status', {
        method: 'POST',
        body: { ids, status },
        auth: true,
      }),
    toggleStatus: (id) =>
      httpClient.request(`/users/${id}/toggle-status`, {
        method: 'POST',
        auth: true,
      }),
    resetPassword: (id) =>
      httpClient.request(`/users/${id}/reset-password`, {
        method: 'POST',
        auth: true,
      }),
  },
  audit: {
    list: (limit = 120) =>
      httpClient.request(`/audit-logs?limit=${encodeURIComponent(limit)}`, {
        auth: true,
      }),
  },
  meta: {
    accessLevels,
    permissionLabels,
  },
}
