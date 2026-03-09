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
  notifications: {
    list: (limit = 30) =>
      httpClient.request(`/notifications?limit=${encodeURIComponent(limit)}`, {
        auth: true,
      }),
  },
  analytics: {
    getLearning: () =>
      httpClient.request('/analytics/learning', {
        auth: true,
      }),
  },
  courses: {
    listCourses: () =>
      httpClient.request('/courses', {
        auth: true,
      }),
    getContinueLearning: () =>
      httpClient.request('/courses/continue', {
        auth: true,
      }),
    getCourse: (courseId) =>
      httpClient.request(`/courses/${encodeURIComponent(courseId)}`, {
        auth: true,
      }),
    setActiveLesson: (courseId, lessonId) =>
      httpClient.request(`/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/select`, {
        method: 'POST',
        auth: true,
      }),
    completeLesson: (courseId, lessonId) =>
      httpClient.request(`/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/complete`, {
        method: 'POST',
        auth: true,
      }),
    saveLessonPlayback: (courseId, lessonId, payload) =>
      httpClient.request(`/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/playback`, {
        method: 'POST',
        auth: true,
        body: payload,
      }),
    listLessonNotes: (courseId, lessonId) =>
      httpClient.request(`/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/notes`, {
        auth: true,
      }),
    addLessonNote: (courseId, lessonId, payload) =>
      httpClient.request(`/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/notes`, {
        method: 'POST',
        auth: true,
        body: payload,
      }),
    updateLessonNote: (courseId, lessonId, noteId, payload) =>
      httpClient.request(`/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/notes/${encodeURIComponent(noteId)}`, {
        method: 'PATCH',
        auth: true,
        body: payload,
      }),
    deleteLessonNote: (courseId, lessonId, noteId) =>
      httpClient.request(`/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/notes/${encodeURIComponent(noteId)}`, {
        method: 'DELETE',
        auth: true,
      }),
    updateModulePrerequisite: (courseId, moduleId, payload) =>
      httpClient.request(`/courses/${encodeURIComponent(courseId)}/modules/${encodeURIComponent(moduleId)}/prerequisite`, {
        method: 'PATCH',
        auth: true,
        body: payload,
      }),
    listDiscussion: (courseId, lessonId) =>
      httpClient.request(`/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/discussions`, {
        auth: true,
      }),
    addDiscussion: (courseId, lessonId, payload) =>
      httpClient.request(`/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/discussions`, {
        method: 'POST',
        auth: true,
        body: payload,
      }),
    updateDiscussion: (courseId, lessonId, discussionId, payload) =>
      httpClient.request(
        `/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/discussions/${encodeURIComponent(discussionId)}`,
        {
          method: 'PATCH',
          auth: true,
          body: payload,
        },
      ),
    deleteDiscussion: (courseId, lessonId, discussionId) =>
      httpClient.request(
        `/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/discussions/${encodeURIComponent(discussionId)}`,
        {
          method: 'DELETE',
          auth: true,
        },
      ),
    getAssignment: (courseId, lessonId) =>
      httpClient.request(`/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/assignment`, {
        auth: true,
      }),
    updateAssignmentConfig: (courseId, lessonId, payload) =>
      httpClient.request(`/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/assignment-config`, {
        method: 'PATCH',
        auth: true,
        body: payload,
      }),
    submitAssignment: async (courseId, lessonId, payload) => {
      let attachmentId = String(payload?.attachmentId || '').trim()
      if (!attachmentId && payload?.attachmentDataUrl) {
        const upload = await httpClient.request('/uploads', {
          method: 'POST',
          auth: true,
          body: {
            fileName: payload?.attachmentName || 'attachment',
            dataUrl: payload.attachmentDataUrl,
            purpose: 'assignment',
          },
        })
        attachmentId = upload?.id || ''
      }
      return httpClient.request(`/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/submission`, {
        method: 'POST',
        auth: true,
        body: {
          linkUrl: payload?.linkUrl || '',
          notes: payload?.notes || '',
          attachmentName: payload?.attachmentName || '',
          attachmentDataUrl: attachmentId ? '' : payload?.attachmentDataUrl || '',
          attachmentId,
        },
      })
    },
    reviewSubmission: (courseId, lessonId, submissionId, payload) =>
      httpClient.request(
        `/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/submissions/${encodeURIComponent(submissionId)}/review`,
        {
          method: 'PATCH',
          auth: true,
          body: payload,
        },
      ),
    getAttachmentData: (uploadId) =>
      httpClient.request(`/uploads/${encodeURIComponent(uploadId)}/data`, {
        auth: true,
      }),
    getAttachmentUrl: (uploadId) =>
      httpClient.request(`/uploads/${encodeURIComponent(uploadId)}/url`, {
        auth: true,
      }),
  },
  quiz: {
    list: () =>
      httpClient.request('/quizzes', {
        auth: true,
      }),
    getEditor: (quizId) =>
      httpClient.request(`/quizzes/${encodeURIComponent(quizId)}/editor`, {
        auth: true,
      }),
    save: (payload) =>
      httpClient.request('/quizzes', {
        method: 'POST',
        auth: true,
        body: payload,
      }),
    updateStatus: (quizId, status) =>
      httpClient.request(`/quizzes/${encodeURIComponent(quizId)}/status`, {
        method: 'PATCH',
        auth: true,
        body: { status },
      }),
    bulkUpdateStatus: (ids, status) =>
      httpClient.request('/quizzes/bulk-status', {
        method: 'POST',
        auth: true,
        body: { ids, status },
      }),
    bulkDelete: (ids) =>
      httpClient.request('/quizzes/bulk-delete', {
        method: 'POST',
        auth: true,
        body: { ids },
      }),
    remove: (quizId) =>
      httpClient.request(`/quizzes/${encodeURIComponent(quizId)}`, {
        method: 'DELETE',
        auth: true,
      }),
    getMeta: (quizId) =>
      httpClient.request(`/quizzes/${encodeURIComponent(quizId)}`, {
        auth: true,
      }),
    getHistory: (quizId) =>
      httpClient.request(`/quizzes/${encodeURIComponent(quizId)}/history`, {
        auth: true,
      }),
    startSession: (quizId, payload = {}) =>
      httpClient.request(`/quizzes/${encodeURIComponent(quizId)}/session`, {
        method: 'POST',
        auth: true,
        body: payload,
      }),
    submit: (quizId, payload) =>
      httpClient.request(`/quizzes/${encodeURIComponent(quizId)}/submit`, {
        method: 'POST',
        auth: true,
        body: payload,
      }),
  },
  meta: {
    accessLevels,
    permissionLabels,
  },
}
