import { defineStore } from 'pinia'
import {
  accessLevels,
  permissionLabels,
  userAccountService,
} from '../services/userAccountService'

export const useUserManagementStore = defineStore('userManagement', {
  state: () => ({
    users: [],
    accessLevels,
    permissionLabels,
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
          userAccountService.loadUsers(),
          userAccountService.loadPermissionMatrix(),
        ])
        this.users = users
        this.permissionMatrix = permissionMatrix
        this.loaded = true
      } finally {
        this.isLoading = false
      }
    },

    async savePermissionMatrix() {
      this.permissionMatrix = await userAccountService.savePermissionMatrix(this.permissionMatrix)
    },

    async saveUser(payload) {
      this.isSaving = true
      try {
        this.users = await userAccountService.saveUser(payload)
      } finally {
        this.isSaving = false
      }
    },

    async inviteUser(payload) {
      this.isSaving = true
      try {
        this.users = await userAccountService.inviteUser(payload)
      } finally {
        this.isSaving = false
      }
    },

    async deleteUser(id) {
      this.users = await userAccountService.deleteUser(id)
    },

    async deleteUsers(ids) {
      this.users = await userAccountService.deleteUsers(ids)
    },

    async bulkUpdateStatus(ids, status) {
      this.users = await userAccountService.bulkUpdateStatus(ids, status)
    },

    async toggleStatus(id) {
      this.users = await userAccountService.toggleStatus(id)
    },

    async resetPassword(id) {
      this.users = await userAccountService.resetPassword(id)
    },
  },
})
