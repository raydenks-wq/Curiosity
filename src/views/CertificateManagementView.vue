<template>
  <section class="quiz-admin-layout certificate-mgmt-layout">
    <article class="card quiz-admin-list">
      <div class="section-header">
        <h2>Certificate Management</h2>
        <div class="table-actions">
          <button class="ghost-btn" type="button" @click="createTemplate">New Template</button>
        </div>
      </div>
      <p class="muted">Kelola template sertifikat, aturan kelulusan, auto-issue, dan status publish.</p>

      <div class="quiz-admin-filter-row">
        <input v-model.trim="searchKeyword" class="quiz-input" type="search" placeholder="Search title/course/id..." />
        <select v-model="statusFilter" class="quiz-input">
          <option value="all">All Status</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
        <select v-model="courseFilter" class="quiz-input">
          <option value="all">All Course</option>
          <option v-for="course in courseOptions" :key="`filter-${course.id}`" :value="course.id">
            {{ course.title }}
          </option>
        </select>
        <select v-model="sortKey" class="quiz-input">
          <option value="updatedAt">Sort: Updated</option>
          <option value="title">Sort: Title</option>
          <option value="status">Sort: Status</option>
        </select>
      </div>

      <div class="quiz-admin-grid">
        <article
          v-for="item in filteredTemplates"
          :key="item.id"
          class="quiz-admin-item"
          :class="{ active: editor.id === item.id }"
        >
          <button type="button" class="quiz-admin-select" @click="openTemplate(item.id)">
            <strong>{{ item.title }}</strong>
            <span>{{ item.id }} · {{ findCourseTitle(item.courseId) }}</span>
            <span class="muted">
              Pass {{ item.passingScore }}% · Valid {{ item.validityDays }} hari · {{ item.autoIssue ? 'Auto Issue' : 'Manual Issue' }}
            </span>
            <span class="pill">{{ item.status }}</span>
          </button>
          <div class="quiz-admin-item-actions">
            <button class="ghost-btn" type="button" @click="duplicateTemplate(item.id)">Duplicate</button>
            <button class="ghost-btn danger-btn" type="button" @click="removeTemplate(item.id)">Delete</button>
          </div>
        </article>
      </div>
      <p v-if="!filteredTemplates.length" class="muted">Belum ada template certificate.</p>
    </article>

    <article class="card quiz-admin-editor">
      <div class="quiz-editor-toolbar">
        <h3>{{ editor.id ? 'Edit Certificate Template' : 'Create Certificate Template' }}</h3>
        <div class="table-actions quiz-editor-actions">
          <button class="ghost-btn" type="button" @click="createTemplate">Reset</button>
          <button class="primary-btn" type="button" @click="saveTemplate">Save Template</button>
        </div>
      </div>

      <section class="quiz-editor-section">
        <div class="quiz-editor-section-head">
          <h4>Basic Info</h4>
        </div>
        <form class="form-grid compact quiz-admin-form" @submit.prevent="saveTemplate">
          <label class="quiz-input-group">
            <span class="quiz-input-label">Template ID</span>
            <input v-model="editor.id" class="quiz-input" type="text" placeholder="auto-generated if empty" />
          </label>
          <label class="quiz-input-group">
            <span class="quiz-input-label">Status</span>
            <select v-model="editor.status" class="quiz-input">
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <label class="quiz-input-group">
            <span class="quiz-input-label">Course</span>
            <select v-model="editor.courseId" class="quiz-input">
              <option value="">Select course</option>
              <option v-for="course in courseOptions" :key="`course-${course.id}`" :value="course.id">
                {{ course.title }}
              </option>
            </select>
          </label>
          <label class="quiz-input-group">
            <span class="quiz-input-label">Passing Score (%)</span>
            <input v-model.number="editor.passingScore" class="quiz-input" type="number" min="0" max="100" />
          </label>
          <label class="full quiz-input-group">
            <span class="quiz-input-label">Title</span>
            <input v-model="editor.title" class="quiz-input" type="text" placeholder="Certificate of Completion" />
          </label>
          <label class="full quiz-input-group">
            <span class="quiz-input-label">Subtitle</span>
            <input v-model="editor.subtitle" class="quiz-input" type="text" placeholder="Diberikan kepada peserta yang memenuhi standar kelulusan" />
          </label>
        </form>
      </section>

      <section class="quiz-editor-section">
        <div class="quiz-editor-section-head">
          <h4>Policy & Signature</h4>
        </div>
        <form class="form-grid compact quiz-admin-form" @submit.prevent="saveTemplate">
          <label class="quiz-input-group">
            <span class="quiz-input-label">Validity (days)</span>
            <input v-model.number="editor.validityDays" class="quiz-input" type="number" min="1" max="3650" />
          </label>
          <label class="quiz-input-group">
            <span class="quiz-input-label">Certificate Prefix</span>
            <input v-model="editor.certificatePrefix" class="quiz-input" type="text" placeholder="CRT-UI" />
          </label>
          <label class="quiz-input-group">
            <span class="quiz-input-label">Signer Name</span>
            <input v-model="editor.signerName" class="quiz-input" type="text" placeholder="Head of Learning" />
          </label>
          <label class="quiz-input-group">
            <span class="quiz-input-label">Signer Title</span>
            <input v-model="editor.signerTitle" class="quiz-input" type="text" placeholder="Program Director" />
          </label>
          <label class="quiz-input-group">
            <span class="quiz-input-label">Theme</span>
            <select v-model="editor.theme" class="quiz-input">
              <option value="aurora">Aurora</option>
              <option value="sunrise">Sunrise</option>
              <option value="minimal">Minimal</option>
            </select>
          </label>
          <label class="quiz-input-group certificate-toggle-row">
            <span class="quiz-input-label">Auto Issue on Completion</span>
            <input v-model="editor.autoIssue" type="checkbox" />
          </label>
        </form>
      </section>

      <section class="quiz-editor-section">
        <div class="quiz-editor-section-head">
          <h4>Preview Text</h4>
        </div>
        <textarea
          v-model="editor.bodyText"
          class="quiz-input"
          rows="4"
          placeholder="Dengan ini menyatakan peserta telah menyelesaikan course sesuai standar evaluasi."
        ></textarea>
      </section>

      <section class="quiz-editor-section">
        <div class="quiz-editor-section-head">
          <h4>Issue Certificate</h4>
          <span class="muted cert-schema-text">Schema v{{ storeStats.schemaVersion || 2 }}</span>
        </div>
        <form class="form-grid compact quiz-admin-form" @submit.prevent="issueCertificate">
          <label class="quiz-input-group">
            <span class="quiz-input-label">Recipient Name</span>
            <input v-model="issueForm.recipientName" class="quiz-input" type="text" placeholder="Nama peserta" />
          </label>
          <label class="quiz-input-group">
            <span class="quiz-input-label">Recipient Email</span>
            <input v-model="issueForm.recipientEmail" class="quiz-input" type="email" placeholder="email@domain.com" />
          </label>
          <label class="quiz-input-group">
            <span class="quiz-input-label">Score (optional)</span>
            <input v-model.number="issueForm.score" class="quiz-input" type="number" min="0" max="100" />
          </label>
          <div class="quiz-input-group cert-issue-actions">
            <span class="quiz-input-label">Action</span>
            <button class="primary-btn" type="submit" :disabled="!editor.id">Issue Certificate</button>
          </div>
        </form>
      </section>
    </article>

    <article class="card full-width">
      <div class="section-header">
        <h3>Issuance Log</h3>
      </div>
      <div class="user-table-wrap">
        <table class="user-table">
          <thead>
            <tr>
              <th>Certificate No</th>
              <th>Template</th>
              <th>Course</th>
              <th>Issued To</th>
              <th>Issued At</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in issuanceLog" :key="item.id">
              <td>
                <div class="cert-no-cell">
                  <strong>{{ item.certificateNo }}</strong>
                  <small>{{ item.verificationCode }}</small>
                </div>
              </td>
              <td>{{ item.templateTitle }}</td>
              <td>{{ item.courseTitle }}</td>
              <td>{{ item.recipientName }}</td>
              <td>{{ formatDate(item.issuedAt) }}</td>
              <td><span class="pill">{{ item.status }}</span></td>
              <td>
                <div class="cert-actions-grid">
                  <button class="ghost-btn" type="button" @click="openVerifyPage(item)">Verify</button>
                  <button class="ghost-btn" type="button" @click="openQrPreview(item)">QR</button>
                  <button class="ghost-btn" type="button" @click="downloadCertificatePdf(item)">PDF</button>
                  <button class="ghost-btn danger-btn" type="button" :disabled="item.status === 'revoked'" @click="revokeIssuance(item.id)">
                    Revoke
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="!issuanceLog.length">
              <td colspan="7" class="empty-cell">Belum ada issuance log.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </article>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { apiClient } from '../services/api/client'
import { useCoursePlayerStore } from '../stores/coursePlayer'
import { useToastStore } from '../stores/toast'

const router = useRouter()
const toastStore = useToastStore()
const coursePlayerStore = useCoursePlayerStore()
const { courses } = storeToRefs(coursePlayerStore)

const searchKeyword = ref('')
const statusFilter = ref('all')
const courseFilter = ref('all')
const sortKey = ref('updatedAt')

const templates = ref([])
const issuanceLog = ref([])
const storeStats = ref({ schemaVersion: 2, templates: 0, issuances: 0 })

const issueForm = ref({
  recipientName: '',
  recipientEmail: '',
  score: null,
})

const createBlankTemplate = () => ({
  id: '',
  title: '',
  subtitle: '',
  bodyText: '',
  status: 'draft',
  courseId: '',
  passingScore: 70,
  validityDays: 365,
  certificatePrefix: 'CRT',
  signerName: '',
  signerTitle: '',
  autoIssue: true,
  theme: 'aurora',
  updatedAt: new Date().toISOString(),
})

const editor = ref(createBlankTemplate())

const courseOptions = computed(() => courses.value || [])

const filteredTemplates = computed(() => {
  const keyword = String(searchKeyword.value || '').trim().toLowerCase()
  const sorted = [...templates.value].sort((a, b) => {
    if (sortKey.value === 'title') return String(a.title || '').localeCompare(String(b.title || ''))
    if (sortKey.value === 'status') return String(a.status || '').localeCompare(String(b.status || ''))
    return Date.parse(b.updatedAt || '') - Date.parse(a.updatedAt || '')
  })
  return sorted.filter((item) => {
    if (statusFilter.value !== 'all' && item.status !== statusFilter.value) return false
    if (courseFilter.value !== 'all' && item.courseId !== courseFilter.value) return false
    if (!keyword) return true
    return (
      String(item.id || '').toLowerCase().includes(keyword) ||
      String(item.title || '').toLowerCase().includes(keyword) ||
      String(findCourseTitle(item.courseId) || '').toLowerCase().includes(keyword)
    )
  })
})

const findCourseTitle = (courseId) => {
  const course = courseOptions.value.find((item) => item.id === courseId)
  return course?.title || courseId || '-'
}

const buildVerificationUrl = (verificationCode) => {
  if (typeof window === 'undefined') return `/verify/certificate/${encodeURIComponent(verificationCode)}`
  const origin = window.location.origin
  return `${origin}/verify/certificate/${encodeURIComponent(verificationCode)}`
}

const buildQrImageUrl = (verificationCode) => {
  const data = encodeURIComponent(buildVerificationUrl(verificationCode))
  return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${data}`
}

const openTemplate = (id) => {
  const selected = templates.value.find((item) => item.id === id)
  if (!selected) return
  editor.value = { ...selected }
}

const createTemplate = () => {
  editor.value = createBlankTemplate()
}

const duplicateTemplate = async (id) => {
  try {
    const duplicated = await apiClient.certificates.duplicateTemplate(id)
    templates.value = [duplicated, ...templates.value]
    editor.value = { ...duplicated }
    await reloadIssuanceAndStats()
    toastStore.push({ type: 'success', title: 'Template diduplikasi', message: 'Template copy berhasil dibuat.' })
  } catch (error) {
    toastStore.push({ type: 'error', title: 'Gagal duplicate', message: error?.message || 'Terjadi kesalahan.' })
  }
}

const saveTemplate = async () => {
  const payload = {
    ...editor.value,
    id: String(editor.value.id || '').trim(),
    title: String(editor.value.title || '').trim(),
    courseId: String(editor.value.courseId || '').trim(),
    passingScore: Math.max(0, Math.min(100, Number(editor.value.passingScore || 0))),
    validityDays: Math.max(1, Number(editor.value.validityDays || 365)),
  }
  if (!payload.title) {
    toastStore.push({ type: 'error', title: 'Template belum valid', message: 'Title wajib diisi.' })
    return
  }
  if (!payload.courseId) {
    toastStore.push({ type: 'error', title: 'Template belum valid', message: 'Course wajib dipilih.' })
    return
  }
  try {
    const saved = await apiClient.certificates.saveTemplate(payload)
    templates.value = templates.value.some((item) => item.id === saved.id)
      ? templates.value.map((item) => (item.id === saved.id ? saved : item))
      : [saved, ...templates.value]
    editor.value = { ...saved }
    await reloadIssuanceAndStats()
    toastStore.push({ type: 'success', title: 'Template tersimpan', message: 'Certificate template berhasil disimpan.' })
  } catch (error) {
    toastStore.push({ type: 'error', title: 'Save gagal', message: error?.message || 'Terjadi kesalahan saat simpan.' })
  }
}

const removeTemplate = async (id) => {
  try {
    await apiClient.certificates.removeTemplate(id)
    templates.value = templates.value.filter((item) => item.id !== id)
    if (editor.value.id === id) {
      createTemplate()
    }
    await reloadIssuanceAndStats()
    toastStore.push({ type: 'info', title: 'Template dihapus', message: 'Certificate template sudah dihapus.' })
  } catch (error) {
    toastStore.push({ type: 'error', title: 'Delete gagal', message: error?.message || 'Terjadi kesalahan saat hapus.' })
  }
}

const issueCertificate = async () => {
  if (!editor.value.id) {
    toastStore.push({ type: 'error', title: 'Template belum dipilih', message: 'Pilih template dulu sebelum issue.' })
    return
  }
  try {
    const issued = await apiClient.certificates.issue({
      templateId: editor.value.id,
      courseId: editor.value.courseId,
      recipientName: issueForm.value.recipientName,
      recipientEmail: issueForm.value.recipientEmail,
      score: Number.isFinite(Number(issueForm.value.score)) ? Number(issueForm.value.score) : null,
    })
    issuanceLog.value = [issued, ...issuanceLog.value]
    issueForm.value = {
      recipientName: '',
      recipientEmail: '',
      score: null,
    }
    await reloadIssuanceAndStats()
    toastStore.push({ type: 'success', title: 'Certificate issued', message: `No: ${issued.certificateNo}` })
  } catch (error) {
    toastStore.push({ type: 'error', title: 'Issue gagal', message: error?.message || 'Terjadi kesalahan saat issue.' })
  }
}

const revokeIssuance = async (id) => {
  try {
    const revoked = await apiClient.certificates.revoke(id, { reason: 'manual revoke from management' })
    issuanceLog.value = issuanceLog.value.map((item) => (item.id === id ? revoked : item))
    toastStore.push({ type: 'info', title: 'Issuance revoked', message: revoked.certificateNo })
  } catch (error) {
    toastStore.push({ type: 'error', title: 'Revoke gagal', message: error?.message || 'Terjadi kesalahan saat revoke.' })
  }
}

const openVerifyPage = (item) => {
  const code = String(item?.verificationCode || '').trim()
  if (!code) return
  const route = router.resolve({ name: 'certificate-verify', params: { code } })
  if (typeof window !== 'undefined') {
    window.open(route.href, '_blank', 'noopener')
  }
}

const openQrPreview = (item) => {
  const code = String(item?.verificationCode || '').trim()
  if (!code || typeof window === 'undefined') return
  window.open(buildQrImageUrl(code), '_blank', 'noopener')
}

const escapeHtml = (value) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const downloadCertificatePdf = (item) => {
  if (typeof window === 'undefined') return
  const template = templates.value.find((entry) => entry.id === item.templateId)
  const verifyUrl = buildVerificationUrl(item.verificationCode)
  const qrUrl = buildQrImageUrl(item.verificationCode)
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Certificate ${escapeHtml(item.certificateNo)}</title>
    <style>
      body { font-family: 'Nunito Sans', Arial, sans-serif; margin: 0; padding: 24px; color: #162542; }
      .sheet { border: 2px solid #0b7aa8; border-radius: 16px; padding: 28px; min-height: 680px; box-sizing: border-box; }
      .top { display: flex; justify-content: space-between; gap: 16px; }
      .title { font-size: 36px; font-weight: 800; margin: 12px 0 6px; }
      .subtitle { color: #5b6e86; margin-bottom: 24px; }
      .recipient { font-size: 32px; font-weight: 800; margin: 0 0 12px; }
      .line { margin: 0 0 22px; color: #334155; }
      .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 24px; }
      .meta-box { border: 1px solid #c8d6e8; border-radius: 12px; padding: 12px; }
      .label { color: #5b6e86; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }
      .value { font-size: 16px; font-weight: 700; margin-top: 4px; }
      .qr { text-align: right; }
      .qr img { width: 120px; height: 120px; border-radius: 8px; }
      .verify { font-size: 12px; color: #5b6e86; margin-top: 6px; }
    </style>
  </head>
  <body>
    <section class="sheet">
      <div class="top">
        <div>
          <div class="label">${escapeHtml(template?.theme || 'Aurora')} Theme</div>
          <div class="title">${escapeHtml(template?.title || 'Certificate of Completion')}</div>
          <div class="subtitle">${escapeHtml(template?.subtitle || 'Awarded for successful completion')}</div>
        </div>
        <div class="qr">
          <img src="${escapeHtml(qrUrl)}" alt="QR" />
          <div class="verify">Verify: ${escapeHtml(verifyUrl)}</div>
        </div>
      </div>
      <div class="label">Presented to</div>
      <p class="recipient">${escapeHtml(item.recipientName)}</p>
      <p class="line">${escapeHtml(template?.bodyText || 'Peserta dinyatakan lulus sesuai standar evaluasi program.')}</p>
      <div class="meta">
        <div class="meta-box"><div class="label">Certificate No</div><div class="value">${escapeHtml(item.certificateNo)}</div></div>
        <div class="meta-box"><div class="label">Issued At</div><div class="value">${escapeHtml(formatDate(item.issuedAt))}</div></div>
        <div class="meta-box"><div class="label">Course</div><div class="value">${escapeHtml(item.courseTitle)}</div></div>
        <div class="meta-box"><div class="label">Signer</div><div class="value">${escapeHtml(template?.signerName || '-')} · ${escapeHtml(template?.signerTitle || '-')}</div></div>
      </div>
    </section>
    <script>window.onload = () => window.print();<\\/script>
  </body>
</html>`
  const tab = window.open('', '_blank', 'noopener')
  if (!tab) return
  tab.document.open()
  tab.document.write(html)
  tab.document.close()
}

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

const loadTemplates = async () => {
  const rows = await apiClient.certificates.listTemplates()
  templates.value = Array.isArray(rows) ? rows : []
}

const reloadIssuanceAndStats = async () => {
  const [issues, stats] = await Promise.all([
    apiClient.certificates.listIssuance(400),
    apiClient.certificates.getStoreStats(),
  ])
  issuanceLog.value = Array.isArray(issues) ? issues : []
  storeStats.value = stats || { schemaVersion: 2, templates: templates.value.length, issuances: issuanceLog.value.length }
}

onMounted(async () => {
  try {
    await coursePlayerStore.loadCourses()
  } catch {
    // keep view usable without course cards
  }

  try {
    await loadTemplates()
    await reloadIssuanceAndStats()
    if (templates.value.length) {
      editor.value = { ...templates.value[0] }
    } else {
      createTemplate()
    }
  } catch (error) {
    createTemplate()
    toastStore.push({
      type: 'error',
      title: 'Gagal memuat certificate',
      message: error?.message || 'Coba refresh halaman.',
    })
  }
})
</script>
