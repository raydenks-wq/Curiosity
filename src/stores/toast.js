import { defineStore } from 'pinia'

let nextToastId = 1

export const useToastStore = defineStore('toast', {
  state: () => ({
    items: [],
  }),

  actions: {
    push({ title, message = '', type = 'info', timeout = 2600, actionLabel = '', onAction = null }) {
      const id = nextToastId++
      this.items.push({ id, title, message, type, actionLabel, onAction })

      if (timeout > 0) {
        window.setTimeout(() => {
          this.remove(id)
        }, timeout)
      }

      return id
    },

    remove(id) {
      this.items = this.items.filter((item) => item.id !== id)
    },

    triggerAction(id) {
      const toast = this.items.find((item) => item.id === id)
      if (!toast) return
      if (typeof toast.onAction === 'function') {
        toast.onAction()
      }
      this.remove(id)
    },

    clear() {
      this.items = []
    },
  },
})
