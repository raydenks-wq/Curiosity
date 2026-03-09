import { authService } from '../../authService'
import { auditLogService } from '../../auditLogService'
import { getDefaultProfileState, profileService } from '../../profileService'
import { accessLevels, permissionLabels, userAccountService } from '../../userAccountService'

export const localAdapter = {
  auth: {
    signIn: (payload) => authService.signIn(payload),
    restoreSession: () => authService.restoreSession(),
    signOut: () => authService.signOut(),
    getDemoCredentials: () => authService.getDemoCredentials(),
  },
  profile: {
    load: () => profileService.loadProfile(),
    saveAccount: (payload) => profileService.saveAccount(payload),
    savePreferences: (payload) => profileService.savePreferences(payload),
    updatePassword: (payload) => profileService.updatePassword(payload),
    reset: () => profileService.resetProfile(),
    saveAll: (payload) => profileService.saveFullState(payload),
    getDefaultState: () => getDefaultProfileState(),
  },
  users: {
    loadUsers: () => userAccountService.loadUsers(),
    loadPermissionMatrix: () => userAccountService.loadPermissionMatrix(),
    savePermissionMatrix: (payload) => userAccountService.savePermissionMatrix(payload),
    saveUser: (payload) => userAccountService.saveUser(payload),
    inviteUser: (payload) => userAccountService.inviteUser(payload),
    deleteUser: (id) => userAccountService.deleteUser(id),
    deleteUsers: (ids) => userAccountService.deleteUsers(ids),
    bulkUpdateStatus: (ids, status) => userAccountService.bulkUpdateStatus(ids, status),
    toggleStatus: (id) => userAccountService.toggleStatus(id),
    resetPassword: (id) => userAccountService.resetPassword(id),
  },
  audit: {
    list: (limit = 120) => Promise.resolve(auditLogService.list(limit)),
  },
  meta: {
    accessLevels,
    permissionLabels,
  },
}
