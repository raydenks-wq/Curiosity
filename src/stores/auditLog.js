import { defineStore } from 'pinia'
import { apiClient, currentApiAdapter } from '../services/api/client'
import { auditLogService } from '../services/auditLogService'

export const useAuditLogStore = defineStore('auditLog', {
  state: () => ({
    logs: [],
    loaded: false,
  }),

  actions: {
    async load({ force = false, limit = 120 } = {}) {
      if (this.loaded && !force) return

      if (currentApiAdapter === 'http') {
        this.logs = await apiClient.audit.list(limit)
      } else {
        this.logs = auditLogService.list(limit)
      }

      this.loaded = true
    },

    log({ actor, action, target, detail }) {
      if (currentApiAdapter === 'http') {
        this.load({ force: true }).catch(() => {})
        return
      }

      this.logs = auditLogService.append({ actor, action, target, detail })
    },
  },
})
