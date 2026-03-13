<template>
  <section class="certificate-verify-page">
    <article class="card certificate-verify-card">
      <div class="section-header">
        <h2>Certificate Verification</h2>
      </div>
      <p class="muted">Cek keaslian sertifikat menggunakan verification code atau certificate number.</p>

      <form class="certificate-verify-form" @submit.prevent="runVerify">
        <input v-model.trim="lookupCode" class="quiz-input" type="text" placeholder="contoh: crt-000123-abc123 atau CRT-000123" />
        <button class="primary-btn" type="submit">Verify</button>
      </form>

      <p v-if="loading" class="muted">Memproses verifikasi...</p>
      <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>

      <article v-if="result" class="certificate-verify-result" :class="`is-${result.status}`">
        <h3>
          {{
            result.status === 'valid'
              ? 'Certificate Valid'
              : result.status === 'revoked'
                ? 'Certificate Revoked'
                : result.status === 'expired'
                  ? 'Certificate Expired'
                  : 'Certificate Unknown'
          }}
        </h3>
        <div class="certificate-verify-grid">
          <p><strong>No:</strong> {{ result.issuance.certificateNo }}</p>
          <p><strong>Recipient:</strong> {{ result.issuance.recipientName }}</p>
          <p><strong>Course:</strong> {{ result.issuance.courseTitle }}</p>
          <p><strong>Issued:</strong> {{ formatDate(result.issuance.issuedAt) }}</p>
          <p><strong>Expires:</strong> {{ result.issuance.expiresAt ? formatDate(result.issuance.expiresAt) : '-' }}</p>
          <p><strong>Template:</strong> {{ result.template?.title || '-' }}</p>
        </div>
      </article>
    </article>
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { apiClient } from '../services/api/client'

const route = useRoute()
const router = useRouter()

const lookupCode = ref('')
const loading = ref(false)
const errorMessage = ref('')
const result = ref(null)

const formatDate = (value) => {
  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return '-'
  }
}

const runVerify = async () => {
  const code = String(lookupCode.value || '').trim()
  if (!code) {
    errorMessage.value = 'Verification code wajib diisi.'
    result.value = null
    return
  }
  loading.value = true
  errorMessage.value = ''
  try {
    const verified = await apiClient.certificates.verify(code)
    result.value = verified
    router.replace({ name: 'certificate-verify', params: { code } })
  } catch (error) {
    result.value = null
    errorMessage.value = error?.message || 'Certificate tidak ditemukan.'
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  const code = String(route.params.code || '').trim()
  if (!code) return
  lookupCode.value = code
  await runVerify()
})
</script>
