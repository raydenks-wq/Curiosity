<template>
  <section class="auth-page aurora-auth">
    <article class="auth-shell">
      <div class="auth-hero">
        <p class="eyebrow">Curiosity LMS</p>
        <h1>Welcome Back</h1>
        <p>Masuk ke learning command center untuk lanjutkan progres belajarmu.</p>
        <div class="auth-hero-metrics">
          <div>
            <strong>12</strong>
            <span>Streak Hari</span>
          </div>
          <div>
            <strong>7</strong>
            <span>Course Selesai</span>
          </div>
          <div>
            <strong>146h</strong>
            <span>Learning Hours</span>
          </div>
        </div>
      </div>

      <div class="auth-card">
        <h2>Sign In</h2>
        <p class="muted">Gunakan akunmu untuk mengakses dashboard.</p>

        <form class="auth-form" @submit.prevent="submitLogin">
          <label>
            Email
            <div class="auth-input-wrap">
              <span class="auth-input-icon">✉</span>
              <input v-model="form.email" type="email" required autocomplete="username" placeholder="you@domain.com" />
            </div>
          </label>
          <label>
            Password
            <div class="auth-input-wrap">
              <span class="auth-input-icon">•</span>
              <input
                v-model="form.password"
                :type="showPassword ? 'text' : 'password'"
                required
                autocomplete="current-password"
                placeholder="Your password"
              />
              <button class="auth-eye-btn" type="button" @click="showPassword = !showPassword">
                {{ showPassword ? 'Hide' : 'Show' }}
              </button>
            </div>
          </label>
          <button class="auth-submit primary-btn" type="submit" :disabled="isLoading">
            {{ isLoading ? 'Signing in...' : 'Sign In' }}
          </button>
          <p v-if="errorMessage" class="error-badge">{{ errorMessage }}</p>
        </form>

        <div class="auth-demo">
          <p class="auth-demo-title">Quick Demo Access</p>
          <button
            v-for="item in demoCredentials"
            :key="item.email"
            type="button"
            class="auth-demo-item"
            @click="useDemo(item)"
          >
            <strong>{{ item.role }}</strong>
            <small>{{ item.email }} / {{ item.password }}</small>
          </button>
        </div>
      </div>
    </article>
  </section>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { apiClient } from '../services/api/client'
import { useAuthStore } from '../stores/auth'
import { useToastStore } from '../stores/toast'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const toastStore = useToastStore()
const { isLoading } = storeToRefs(authStore)

const form = reactive({
  email: '',
  password: '',
})

const errorMessage = ref('')
const showPassword = ref(false)
const demoCredentials = apiClient.auth.getDemoCredentials()

const useDemo = (demo) => {
  form.email = demo.email
  form.password = demo.password
}

const submitLogin = async () => {
  errorMessage.value = ''
  try {
    const user = await authStore.login(form)
    toastStore.push({
      type: 'success',
      title: 'Login Success',
      message: `Selamat datang, ${user.name}.`,
    })
    const redirectTo = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    router.replace(redirectTo)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Login gagal.'
  }
}
</script>
