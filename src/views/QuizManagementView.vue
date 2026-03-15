<template>
  <section class="quiz-admin-layout">
    <article class="card quiz-admin-list">
      <div class="section-header">
        <h2>Quiz Management</h2>
        <div class="table-actions">
          <button v-if="showQuizAdvancedTools" class="ghost-btn" type="button" @click="triggerImport">Import JSON</button>
          <button class="primary-btn" type="button" @click="createNewQuiz">New Quiz</button>
        </div>
      </div>
      <p class="muted">Kelola bank soal, passing score, timer, retake policy, dan publish status.</p>
      <div class="quiz-admin-filter-row">
        <input v-model="searchKeyword" class="quiz-input" type="search" placeholder="Search title/course/module/id..." />
        <select v-model="statusFilter" class="quiz-input">
          <option value="all">All Status</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>
        <select v-model="sortKey" class="quiz-input">
          <option value="updatedAt">Sort: Updated</option>
          <option value="title">Sort: Title</option>
          <option value="status">Sort: Status</option>
        </select>
        <select v-model="sortDir" class="quiz-input">
          <option value="desc">Desc</option>
          <option value="asc">Asc</option>
        </select>
      </div>
      <input ref="importInput" class="hidden-input" type="file" accept="application/json,.json" @change="handleImportFile" />

      <div v-if="canUseBulkManagement && selectedIds.length" class="bulk-row">
        <span>{{ selectedIds.length }} quiz terpilih</span>
        <div class="table-actions">
          <button class="ghost-btn" type="button" @click="runBulkStatus('published')">Publish selected</button>
          <button class="ghost-btn" type="button" @click="runBulkStatus('draft')">Unpublish selected</button>
          <button class="ghost-btn danger-btn" type="button" @click="openBulkDeleteConfirm">Delete selected</button>
        </div>
      </div>

      <div class="quiz-admin-grid">
        <article v-for="quiz in paginatedQuizzes" :key="quiz.id" class="quiz-admin-item" :class="{ active: editor.id === quiz.id }">
          <label class="quiz-item-check">
            <input v-if="canUseBulkManagement" type="checkbox" :checked="selectedIds.includes(quiz.id)" @change="toggleSelected(quiz.id)" />
            <span v-else class="muted">•</span>
          </label>
          <button type="button" class="quiz-admin-select" @click="openEditor(quiz.id)">
            <strong>{{ quiz.title }}</strong>
            <span>{{ quiz.courseId }} · {{ quiz.moduleId }}</span>
            <span class="muted">{{ quiz.questionCount || 0 }} questions · pass {{ quiz.passingScore }}%</span>
            <span class="pill">{{ quiz.status || 'published' }}</span>
          </button>
          <div class="quiz-admin-item-actions">
            <button class="ghost-btn" type="button" @click="duplicateFromList(quiz.id)">Duplicate</button>
            <button class="ghost-btn" type="button" @click="toggleQuickStatus(quiz)">
              {{ quiz.status === 'published' ? 'Unpublish' : 'Publish' }}
            </button>
          </div>
        </article>
      </div>

      <p v-if="!filteredQuizzes.length && !isLoading" class="muted">Belum ada quiz.</p>
      <div v-if="filteredQuizzes.length" class="pager-row">
        <span>Page {{ page }} / {{ totalPages }}</span>
        <div class="table-actions">
          <label v-if="canUseBulkManagement" class="quiz-select-page">
            <input type="checkbox" :checked="isPageSelected" @change="togglePageSelection" />
            Select page
          </label>
          <select v-model.number="pageSize">
            <option :value="5">5 / page</option>
            <option :value="10">10 / page</option>
            <option :value="20">20 / page</option>
          </select>
          <button class="ghost-btn" type="button" :disabled="page <= 1" @click="page--">Prev</button>
          <button class="ghost-btn" type="button" :disabled="page >= totalPages" @click="page++">Next</button>
        </div>
      </div>
      <p v-if="isLoading" class="muted">Memuat daftar quiz...</p>
    </article>

    <article ref="editorPanelRef" class="card quiz-admin-editor">
      <div class="quiz-editor-toolbar">
        <h3>{{ editor.id ? 'Edit Quiz' : 'Create Quiz' }}</h3>
        <div class="table-actions quiz-editor-actions">
          <button class="ghost-btn" type="button" @click="mode = mode === 'edit' ? 'preview' : 'edit'">
            {{ mode === 'edit' ? 'Preview' : 'Back to Edit' }}
          </button>
          <button v-if="showQuizAdvancedTools" class="ghost-btn" type="button" @click="exportCurrentQuiz">Export JSON</button>
          <button class="ghost-btn" type="button" @click="duplicateCurrent">Duplicate</button>
          <button v-if="editor.id" class="ghost-btn danger-btn" type="button" :disabled="isSaving" @click="removeCurrentQuiz">Delete</button>
          <button class="primary-btn" type="button" :disabled="isSaving || hasValidationError" @click="saveQuiz">
            {{ isSaving ? 'Saving...' : 'Save Quiz' }}
          </button>
        </div>
      </div>

      <template v-if="mode === 'edit'">
        <div class="quiz-editor-stepper">
          <div
            class="ghost-btn quiz-step-item"
            :class="{ active: activeStep === 'basic' }"
            role="button"
            tabindex="0"
            @click="scrollToEditorSection('basic')"
            @keydown.enter.prevent="scrollToEditorSection('basic')"
            @keydown.space.prevent="scrollToEditorSection('basic')"
          >
            Basic Info
            <button
              class="step-badge"
              :class="{ error: stepIssues.basic > 0 }"
              type="button"
              @click.stop="toggleStepDetail('basic')"
            >
              {{ stepIssues.basic > 0 ? `${stepIssues.basic} err` : 'ok' }}
            </button>
          </div>
          <div
            class="ghost-btn quiz-step-item"
            :class="{ active: activeStep === 'scoring' }"
            role="button"
            tabindex="0"
            @click="scrollToEditorSection('scoring')"
            @keydown.enter.prevent="scrollToEditorSection('scoring')"
            @keydown.space.prevent="scrollToEditorSection('scoring')"
          >
            Scoring
            <button
              class="step-badge"
              :class="{ error: stepIssues.scoring > 0 }"
              type="button"
              @click.stop="toggleStepDetail('scoring')"
            >
              {{ stepIssues.scoring > 0 ? `${stepIssues.scoring} err` : 'ok' }}
            </button>
          </div>
          <div
            class="ghost-btn quiz-step-item"
            :class="{ active: activeStep === 'questions' }"
            role="button"
            tabindex="0"
            @click="scrollToEditorSection('questions')"
            @keydown.enter.prevent="scrollToEditorSection('questions')"
            @keydown.space.prevent="scrollToEditorSection('questions')"
          >
            Questions
            <button
              class="step-badge"
              :class="{ error: stepIssues.questions > 0 }"
              type="button"
              @click.stop="toggleStepDetail('questions')"
            >
              {{ stepIssues.questions > 0 ? `${stepIssues.questions} err` : 'ok' }}
            </button>
          </div>
        </div>
        <article v-if="stepDetailOpen && stepDetailMessages.length" class="step-detail-popover">
          <p class="step-detail-title">{{ stepDetailTitle }}</p>
          <ul>
            <li v-for="message in stepDetailMessages" :key="message">{{ message }}</li>
          </ul>
        </article>

        <article v-if="hasValidationError" class="quiz-admin-validation">
          <strong>Form belum valid</strong>
          <ul>
            <li v-for="message in validationMessages" :key="message">{{ message }}</li>
          </ul>
        </article>

        <section ref="basicSectionRef" class="quiz-editor-section">
          <div class="quiz-editor-section-head">
            <h4>Basic Info</h4>
          </div>
          <form class="form-grid compact quiz-admin-form" @submit.prevent="saveQuiz">
            <label class="quiz-input-group">
              <span class="quiz-input-label">Quiz ID</span>
              <input v-model="editor.id" class="quiz-input" type="text" placeholder="auto-generated if empty" />
            </label>
            <label class="quiz-input-group">
              <span class="quiz-input-label">Status</span>
              <select v-model="editor.status" class="quiz-input">
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </label>
            <label class="quiz-input-group">
              <span class="quiz-input-label">Course ID</span>
              <select v-model="editor.courseId" class="quiz-input" required>
                <option v-for="course in courses" :key="course.id" :value="course.id">
                  {{ course.id }} · {{ course.title }}
                </option>
              </select>
            </label>
            <label class="quiz-input-group">
              <span class="quiz-input-label">Module ID</span>
              <select v-model="editor.moduleId" class="quiz-input" required>
                <option v-for="module in modulesForCourse" :key="module.id" :value="module.id">
                  {{ module.id }} · {{ module.title }}
                </option>
              </select>
            </label>
            <label class="full quiz-input-group">
              <span class="quiz-input-label">Title</span>
              <input v-model="editor.title" class="quiz-input" type="text" required />
            </label>
            <label class="full quiz-input-group">
              <span class="quiz-input-label">Description</span>
              <textarea v-model="editor.description" class="quiz-input" rows="2" required></textarea>
            </label>
          </form>
        </section>

        <section ref="scoringSectionRef" class="quiz-editor-section">
          <div class="quiz-editor-section-head">
            <h4>Scoring & Policy</h4>
          </div>
          <form class="form-grid compact quiz-admin-form quiz-admin-form-scoring" @submit.prevent="saveQuiz">
            <label class="quiz-input-group">
              <span class="quiz-input-label">Passing Score (%)</span>
              <input v-model.number="editor.passingScore" class="quiz-input" type="number" min="0" max="100" />
            </label>
            <label class="quiz-input-group">
              <span class="quiz-input-label">Max Attempts</span>
              <input v-model.number="editor.maxAttempts" class="quiz-input" type="number" min="1" max="20" />
            </label>
            <label class="quiz-input-group">
              <span class="quiz-input-label">Time Limit (sec)</span>
              <input v-model.number="editor.timeLimitSec" class="quiz-input" type="number" min="60" />
            </label>
          </form>
        </section>

        <div ref="questionsSectionRef" class="quiz-admin-question-head">
          <h4>Questions ({{ editor.questions.length }})</h4>
          <button class="ghost-btn" type="button" @click="quizStore.addQuestion">Add Question</button>
        </div>

        <div class="quiz-admin-question-list">
          <article
            v-for="(question, qIndex) in editor.questions"
            :key="question.id"
            class="quiz-admin-question-card"
            :class="{ invalid: Boolean(questionErrorMap[qIndex]) }"
          >
            <div class="section-header">
              <p class="eyebrow">Question {{ qIndex + 1 }}</p>
              <button class="ghost-btn danger-btn" type="button" @click="quizStore.removeQuestion(question.id)">Remove</button>
            </div>
            <p v-if="questionErrorMap[qIndex]" class="quiz-field-error">{{ questionErrorMap[qIndex] }}</p>
            <label class="quiz-input-group">
              <span class="quiz-input-label">Question ID</span>
              <input v-model="question.id" class="quiz-input" type="text" />
            </label>
            <label class="quiz-input-group">
              <span class="quiz-input-label">Question Text</span>
              <textarea v-model="question.title" class="quiz-input" rows="2"></textarea>
            </label>
            <label class="quiz-input-group">
              <span class="quiz-input-label">Explanation</span>
              <textarea v-model="question.explanation" class="quiz-input" rows="2"></textarea>
            </label>

            <p class="muted">Options</p>
            <div v-for="(_, optionIndex) in question.options" :key="`${question.id}-${optionIndex}`" class="quiz-option-row">
              <input
                type="radio"
                :name="`correct-${question.id}`"
                :checked="question.correctIndex === optionIndex"
                class="quiz-option-radio"
                @change="question.correctIndex = optionIndex"
              />
              <span class="quiz-option-badge">{{ String.fromCharCode(65 + optionIndex) }}</span>
              <input v-model="question.options[optionIndex]" class="quiz-input quiz-option-input" type="text" placeholder="Option text" />
              <button class="ghost-btn quiz-option-remove" type="button" @click="quizStore.removeOption(question.id, optionIndex)">-</button>
            </div>
            <button class="ghost-btn" type="button" @click="quizStore.addOption(question.id)">+ Add Option</button>
          </article>
        </div>
      </template>

      <template v-else>
        <article class="quiz-preview-card">
          <div class="section-header">
            <h3>{{ editor.title || 'Untitled Quiz' }}</h3>
            <span class="pill">{{ editor.status }}</span>
          </div>
          <p class="muted">{{ editor.description || '-' }}</p>
          <div class="quiz-preview-kpi">
            <span class="pill">Pass {{ editor.passingScore }}%</span>
            <span class="pill">Attempts {{ editor.maxAttempts }}</span>
            <span class="pill">Timer {{ Math.floor(editor.timeLimitSec / 60) }}m</span>
          </div>

          <div class="quiz-preview-list">
            <article v-for="(question, qIndex) in editor.questions" :key="`preview-${question.id}-${qIndex}`" class="quiz-preview-question">
              <p class="eyebrow">Question {{ qIndex + 1 }}</p>
              <h4>{{ question.title || '-' }}</h4>
              <ul>
                <li v-for="(option, optionIndex) in question.options" :key="`${question.id}-preview-opt-${optionIndex}`" :class="{ correct: optionIndex === question.correctIndex }">
                  {{ option || '(empty option)' }}
                </li>
              </ul>
              <p class="muted">{{ question.explanation || '-' }}</p>
            </article>
          </div>
        </article>
      </template>
    </article>

    <Teleport v-if="canUseBulkManagement" to="body">
      <div v-if="isBulkDeleteConfirmOpen" class="modal-overlay" @click.self="isBulkDeleteConfirmOpen = false">
        <article class="modal-card">
          <h3>Konfirmasi Bulk Delete</h3>
          <p class="muted">Kamu akan menghapus {{ selectedIds.length }} quiz terpilih. Aksi ini tidak bisa dibatalkan.</p>
          <div class="form-actions">
            <button class="ghost-btn" type="button" @click="isBulkDeleteConfirmOpen = false">Cancel</button>
            <button class="ghost-btn danger-btn" type="button" @click="runBulkDelete">Delete sekarang</button>
          </div>
        </article>
      </div>
    </Teleport>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useToastStore } from '../stores/toast'
import { useQuizManagementStore } from '../stores/quizManagement'
import { featureFlags, isSimplifiedMode } from '../config/runtimeFlags'

const toastStore = useToastStore()
const quizStore = useQuizManagementStore()
const { quizzes, courses, modulesByCourse, editor, isLoading, isSaving } = storeToRefs(quizStore)
const importInput = ref(null)
const mode = ref('edit')
const statusFilter = ref('all')
const searchKeyword = ref('')
const sortKey = ref('updatedAt')
const sortDir = ref('desc')
const page = ref(1)
const pageSize = ref(10)
const selectedIds = ref([])
const isBulkDeleteConfirmOpen = ref(false)
const editorPanelRef = ref(null)
const basicSectionRef = ref(null)
const scoringSectionRef = ref(null)
const questionsSectionRef = ref(null)
const activeStep = ref('basic')
const stepDetailOpen = ref('')
const canUseBulkManagement = featureFlags.quizBulkManagement
const showQuizAdvancedTools = !isSimplifiedMode

const filteredQuizzes = computed(() =>
  [...quizzes.value]
    .filter((quiz) => {
      const statusOk = statusFilter.value === 'all' || (quiz.status || 'published') === statusFilter.value
      if (!statusOk) return false
      const key = searchKeyword.value.trim().toLowerCase()
      if (!key) return true
      const haystack = [quiz.id, quiz.title, quiz.courseId, quiz.moduleId].map((item) => String(item || '').toLowerCase()).join(' ')
      return haystack.includes(key)
    })
    .sort((a, b) => {
      if (sortKey.value === 'status') {
        const base = String(a.status || 'published').localeCompare(String(b.status || 'published'))
        return sortDir.value === 'asc' ? base : -base
      }
      if (sortKey.value === 'updatedAt') {
        const aTs = new Date(a.updatedAt || 0).getTime()
        const bTs = new Date(b.updatedAt || 0).getTime()
        const base = aTs - bTs
        return sortDir.value === 'asc' ? base : -base
      }
      const base = String(a.title || '').localeCompare(String(b.title || ''))
      return sortDir.value === 'asc' ? base : -base
    }),
)
const totalPages = computed(() => Math.max(1, Math.ceil(filteredQuizzes.value.length / pageSize.value)))
const paginatedQuizzes = computed(() => {
  const safePage = Math.min(page.value, totalPages.value)
  const start = (safePage - 1) * pageSize.value
  return filteredQuizzes.value.slice(start, start + pageSize.value)
})
const isPageSelected = computed(() => {
  if (!paginatedQuizzes.value.length) return false
  return paginatedQuizzes.value.every((quiz) => selectedIds.value.includes(quiz.id))
})
const modulesForCourse = computed(() => modulesByCourse.value[editor.value.courseId] || [])
const questionErrorMap = computed(() =>
  Object.fromEntries(
    editor.value.questions.map((question, idx) => {
      const optionCount = question.options.filter((option) => String(option || '').trim()).length
      const errors = []
      if (!String(question.title || '').trim()) errors.push('Question text wajib diisi.')
      if (optionCount < 2) errors.push('Minimal 2 opsi wajib diisi.')
      if (question.correctIndex < 0 || question.correctIndex >= question.options.length) errors.push('Jawaban benar belum valid.')
      return [idx, errors.join(' ')]
    }),
  ),
)
const stepIssues = computed(() => {
  let basic = 0
  if (!String(editor.value.courseId || '').trim()) basic += 1
  if (!String(editor.value.moduleId || '').trim()) basic += 1
  if (!String(editor.value.title || '').trim()) basic += 1
  if (!String(editor.value.description || '').trim()) basic += 1

  let scoring = 0
  const passing = Number(editor.value.passingScore)
  const attempts = Number(editor.value.maxAttempts)
  const timeLimit = Number(editor.value.timeLimitSec)
  if (!Number.isFinite(passing) || passing < 0 || passing > 100) scoring += 1
  if (!Number.isFinite(attempts) || attempts < 1 || attempts > 20) scoring += 1
  if (!Number.isFinite(timeLimit) || timeLimit < 60) scoring += 1

  const questionErrors = Object.values(questionErrorMap.value).filter(Boolean).length
  const questions = editor.value.questions.length ? 0 : 1
  return {
    basic,
    scoring,
    questions: questionErrors + questions,
  }
})
const stepMessages = computed(() => ({
  basic: [
    !String(editor.value.courseId || '').trim() ? 'Course wajib dipilih.' : '',
    !String(editor.value.moduleId || '').trim() ? 'Module wajib dipilih.' : '',
    !String(editor.value.title || '').trim() ? 'Title wajib diisi.' : '',
    !String(editor.value.description || '').trim() ? 'Description wajib diisi.' : '',
  ].filter(Boolean),
  scoring: [
    !Number.isFinite(Number(editor.value.passingScore)) || Number(editor.value.passingScore) < 0 || Number(editor.value.passingScore) > 100
      ? 'Passing score harus 0-100.'
      : '',
    !Number.isFinite(Number(editor.value.maxAttempts)) || Number(editor.value.maxAttempts) < 1 || Number(editor.value.maxAttempts) > 20
      ? 'Max attempts harus 1-20.'
      : '',
    !Number.isFinite(Number(editor.value.timeLimitSec)) || Number(editor.value.timeLimitSec) < 60
      ? 'Time limit minimal 60 detik.'
      : '',
  ].filter(Boolean),
  questions: [
    !editor.value.questions.length ? 'Minimal harus ada 1 question.' : '',
    ...Object.values(questionErrorMap.value).filter(Boolean),
  ].filter(Boolean),
}))
const stepDetailMessages = computed(() => stepMessages.value[stepDetailOpen.value] || [])
const stepDetailTitle = computed(() => {
  if (stepDetailOpen.value === 'basic') return 'Basic Info Checklist'
  if (stepDetailOpen.value === 'scoring') return 'Scoring Checklist'
  if (stepDetailOpen.value === 'questions') return 'Questions Checklist'
  return ''
})
const validationMessages = computed(() => {
  const messages = []
  if (!String(editor.value.courseId || '').trim()) messages.push('Course wajib dipilih.')
  if (!String(editor.value.moduleId || '').trim()) messages.push('Module wajib dipilih.')
  if (!String(editor.value.title || '').trim()) messages.push('Title wajib diisi.')
  if (!String(editor.value.description || '').trim()) messages.push('Description wajib diisi.')
  if (!editor.value.questions.length) messages.push('Minimal 1 question.')
  if (Object.values(questionErrorMap.value).some(Boolean)) messages.push('Masih ada question yang belum valid.')
  return messages
})
const hasValidationError = computed(() => validationMessages.value.length > 0)

const openEditor = async (quizId) => {
  try {
    await quizStore.editQuiz(quizId)
    mode.value = 'edit'
  } catch (error) {
    toastStore.push({
      type: 'error',
      title: 'Gagal memuat quiz',
      message: error instanceof Error ? error.message : 'Terjadi kesalahan.',
    })
  }
}

const createNewQuiz = () => {
  quizStore.resetEditor()
  mode.value = 'edit'
}

const duplicateFromList = async (quizId) => {
  await openEditor(quizId)
  duplicateCurrent()
}

const duplicateCurrent = () => {
  quizStore.duplicateCurrentEditor()
  mode.value = 'edit'
  toastStore.push({
    type: 'info',
    title: 'Quiz diduplikasi',
    message: 'Quiz copy siap diedit sebelum disimpan.',
  })
}

const triggerImport = () => {
  importInput.value?.click()
}

const handleImportFile = async (event) => {
  const file = event.target.files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    const json = JSON.parse(text)
    const imported = quizStore.importEditor(json)
    mode.value = 'edit'
    toastStore.push({
      type: imported?.hasIdConflict ? 'info' : 'success',
      title: imported?.hasIdConflict ? 'Import dengan penyesuaian' : 'Import berhasil',
      message: imported?.hasIdConflict
        ? `ID quiz bentrok, otomatis diganti ke: ${imported.resolvedId}`
        : `Quiz dari ${file.name} sudah dimuat ke editor.`,
    })
  } catch {
    toastStore.push({
      type: 'error',
      title: 'Import gagal',
      message: 'File JSON tidak valid.',
    })
  } finally {
    event.target.value = ''
  }
}

const exportCurrentQuiz = () => {
  const payload = JSON.stringify(editor.value, null, 2)
  const blob = new Blob([payload], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const filename = `${editor.value.id || 'quiz-template'}.json`
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

const saveQuiz = async () => {
  if (hasValidationError.value) return
  try {
    await quizStore.saveEditor()
    toastStore.push({
      type: 'success',
      title: 'Quiz disimpan',
      message: 'Perubahan quiz berhasil tersimpan.',
    })
  } catch (error) {
    toastStore.push({
      type: 'error',
      title: 'Gagal menyimpan quiz',
      message: error instanceof Error ? error.message : 'Periksa kembali field quiz.',
    })
  }
}

const removeCurrentQuiz = async () => {
  if (!editor.value.id) return
  try {
    await quizStore.deleteQuiz(editor.value.id)
    mode.value = 'edit'
    toastStore.push({
      type: 'info',
      title: 'Quiz dihapus',
      message: 'Quiz berhasil dihapus dari bank soal.',
    })
  } catch (error) {
    toastStore.push({
      type: 'error',
      title: 'Gagal menghapus quiz',
      message: error instanceof Error ? error.message : 'Terjadi kesalahan.',
    })
  }
}

const toggleQuickStatus = async (quiz) => {
  try {
    const nextStatus = quiz.status === 'published' ? 'draft' : 'published'
    const updated = await quizStore.setQuizStatus(quiz.id, nextStatus)
    toastStore.push({
      type: 'success',
      title: 'Status quiz diperbarui',
      message: `${updated.title} sekarang ${updated.status}.`,
    })
  } catch (error) {
    toastStore.push({
      type: 'error',
      title: 'Gagal ubah status',
      message: error instanceof Error ? error.message : 'Terjadi kesalahan.',
    })
  }
}

const toggleSelected = (quizId) => {
  if (selectedIds.value.includes(quizId)) {
    selectedIds.value = selectedIds.value.filter((id) => id !== quizId)
    return
  }
  selectedIds.value = [...selectedIds.value, quizId]
}

const togglePageSelection = () => {
  if (isPageSelected.value) {
    const pageSet = new Set(paginatedQuizzes.value.map((quiz) => quiz.id))
    selectedIds.value = selectedIds.value.filter((id) => !pageSet.has(id))
    return
  }
  const merged = new Set([...selectedIds.value, ...paginatedQuizzes.value.map((quiz) => quiz.id)])
  selectedIds.value = Array.from(merged)
}

const runBulkStatus = async (status) => {
  if (!selectedIds.value.length) return
  try {
    await quizStore.bulkSetStatus(selectedIds.value, status)
    toastStore.push({
      type: 'success',
      title: 'Bulk status updated',
      message: `${selectedIds.value.length} quiz diubah ke ${status}.`,
    })
    selectedIds.value = []
  } catch (error) {
    toastStore.push({
      type: 'error',
      title: 'Bulk status gagal',
      message: error instanceof Error ? error.message : 'Terjadi kesalahan.',
    })
  }
}

const runBulkDelete = async () => {
  if (!selectedIds.value.length) return
  try {
    const count = selectedIds.value.length
    await quizStore.bulkDelete(selectedIds.value)
    selectedIds.value = []
    isBulkDeleteConfirmOpen.value = false
    toastStore.push({
      type: 'info',
      title: 'Bulk delete selesai',
      message: `${count} quiz dihapus.`,
    })
  } catch (error) {
    toastStore.push({
      type: 'error',
      title: 'Bulk delete gagal',
      message: error instanceof Error ? error.message : 'Terjadi kesalahan.',
    })
  }
}

const openBulkDeleteConfirm = () => {
  if (!selectedIds.value.length) return
  isBulkDeleteConfirmOpen.value = true
}

const scrollToEditorSection = (section) => {
  const map = {
    basic: basicSectionRef.value,
    scoring: scoringSectionRef.value,
    questions: questionsSectionRef.value,
  }
  const target = map[section]
  if (!target || typeof target.scrollIntoView !== 'function') return
  activeStep.value = section
  target.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const toggleStepDetail = (section) => {
  stepDetailOpen.value = stepDetailOpen.value === section ? '' : section
}

const updateActiveStep = () => {
  if (mode.value !== 'edit') return
  const panel = editorPanelRef.value
  if (!panel) return

  const sections = [
    { id: 'basic', el: basicSectionRef.value },
    { id: 'scoring', el: scoringSectionRef.value },
    { id: 'questions', el: questionsSectionRef.value },
  ].filter((item) => item.el)
  if (!sections.length) return

  const panelTop = panel.getBoundingClientRect().top
  const anchor = panelTop + 120
  let current = sections[0].id

  for (const section of sections) {
    const top = section.el.getBoundingClientRect().top
    if (top <= anchor) {
      current = section.id
    }
  }

  activeStep.value = current
}

onMounted(async () => {
  await quizStore.load()
  if (quizzes.value.length) {
    await openEditor(quizzes.value[0].id)
  }
  editorPanelRef.value?.addEventListener('scroll', updateActiveStep, { passive: true })
  window.addEventListener('resize', updateActiveStep)
  updateActiveStep()
})

onBeforeUnmount(() => {
  editorPanelRef.value?.removeEventListener('scroll', updateActiveStep)
  window.removeEventListener('resize', updateActiveStep)
})

watch(
  () => editor.value.courseId,
  (courseId) => {
    const modules = modulesByCourse.value[courseId] || []
    if (!modules.some((module) => module.id === editor.value.moduleId)) {
      editor.value.moduleId = modules[0]?.id || ''
    }
  },
)

watch([statusFilter, searchKeyword, sortKey, sortDir, pageSize], () => {
  page.value = 1
})

watch(totalPages, (next) => {
  if (page.value > next) {
    page.value = next
  }
})

watch(filteredQuizzes, (items) => {
  const visible = new Set(items.map((quiz) => quiz.id))
  selectedIds.value = selectedIds.value.filter((id) => visible.has(id))
})

watch(
  () => mode.value,
  async (nextMode) => {
    if (nextMode !== 'edit') {
      stepDetailOpen.value = ''
      return
    }
    await nextTick()
    updateActiveStep()
  },
)

watch(
  () => editor.value.questions.length,
  async () => {
    await nextTick()
    updateActiveStep()
  },
)
</script>
