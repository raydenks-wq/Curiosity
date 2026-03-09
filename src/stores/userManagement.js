import { defineStore } from 'pinia'
import { apiClient } from '../services/api/client'

export const useUserManagementStore = defineStore('userManagement', {
  state: () => ({
    users: [],
    accessLevels: apiClient.meta.accessLevels,
    permissionLabels: apiClient.meta.permissionLabels,
    permissionMatrix: {
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
    },
    isLoading: false,
    isSaving: false,
    loaded: false,
  }),

  getters: {
    totals(state) {
      const total = state.users.length
      const active = state.users.filter((user) => user.status === 'active').length
      const suspended = state.users.filter((user) => user.status === 'suspended').length
      const pending = state.users.filter((user) => user.status === 'pending').length

      const byRole = state.accessLevels.reduce((acc, role) => {
        acc[role.id] = state.users.filter((user) => user.role === role.id).length
        return acc
      }, {})

      return { total, active, suspended, pending, byRole }
    },
  },

  actions: {
    async load() {
      if (this.loaded) return

      this.isLoading = true
      try {
        const [users, permissionMatrix] = await Promise.all([
          apiClient.users.loadUsers(),
          apiClient.users.loadPermissionMatrix(),
        ])
        this.users = users
        this.permissionMatrix = permissionMatrix
        this.loaded = true
      } finally {
        this.isLoading = false
      }
    },

    async savePermissionMatrix() {
      this.permissionMatrix = await apiClient.users.savePermissionMatrix(this.permissionMatrix)
    },

    async saveUser(payload) {
      this.isSaving = true
      try {
        this.users = await apiClient.users.saveUser(payload)
      } finally {
        this.isSaving = false
      }
    },

    async inviteUser(payload) {
      this.isSaving = true
      try {
        this.users = await apiClient.users.inviteUser(payload)
      } finally {
        this.isSaving = false
      }
    },

    async deleteUser(id) {
      this.users = await apiClient.users.deleteUser(id)
    },

    async deleteUsers(ids) {
      this.users = await apiClient.users.deleteUsers(ids)
    },

    async bulkUpdateStatus(ids, status) {
      this.users = await apiClient.users.bulkUpdateStatus(ids, status)
    },

    async toggleStatus(id) {
      this.users = await apiClient.users.toggleStatus(id)
    },

    async resetPassword(id) {
      this.users = await apiClient.users.resetPassword(id)
    },
  },
})
