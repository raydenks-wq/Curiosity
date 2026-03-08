<template>
  <Teleport to="body">
    <div class="toast-stack" aria-live="polite" aria-atomic="true">
      <TransitionGroup name="toast-pop" tag="div">
        <article
          v-for="toast in items"
          :key="toast.id"
          class="toast-item"
          :class="`toast-${toast.type}`"
        >
          <div>
            <h4>{{ toast.title }}</h4>
            <p v-if="toast.message">{{ toast.message }}</p>
            <button
              v-if="toast.actionLabel"
              type="button"
              class="toast-action-btn"
              @click="triggerAction(toast.id)"
            >
              {{ toast.actionLabel }}
            </button>
          </div>
          <button type="button" @click="remove(toast.id)" aria-label="Dismiss notification">✕</button>
        </article>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup>
import { storeToRefs } from 'pinia'
import { useToastStore } from '../stores/toast'

const toastStore = useToastStore()
const { items } = storeToRefs(toastStore)

const remove = (id) => {
  toastStore.remove(id)
}

const triggerAction = (id) => {
  toastStore.triggerAction(id)
}
</script>
