<template>
  <section v-if="currentTemplate === 'sunrise'" class="quiz-layout">
    <article class="card full-width quiz-header-card">
      <div class="section-header">
        <h2>{{ quizTitle }}</h2>
        <span class="pill">{{ questionCount }} pertanyaan</span>
      </div>
      <p class="muted">{{ quizDescription }}</p>
      <p v-if="isModuleTriggered" class="quiz-trigger-note">Module complete. Kerjakan quiz untuk lanjut ke modul berikutnya.</p>
      <div class="quiz-kpi-row">
        <span class="pill">Timer: {{ timerLabel }}</span>
        <span class="pill">Passing: {{ passingScore }}%</span>
        <span class="pill">Attempt: {{ currentAttempt }}/{{ maxAttempts }}</span>
      </div>
    </article>

    <template v-if="!quizStore.isFinished">
      <article class="card question-card quiz-question-card" v-for="(question, index) in questions" :key="question.id">
        <p class="eyebrow">Question {{ index + 1 }}</p>
        <h3>{{ question.title }}</h3>
        <div class="options">
          <label v-for="option in question.options" :key="option.id" class="option-row">
            <input
              type="radio"
              :name="question.id"
              :checked="quizStore.answers[question.id] === option.id"
              @change="quizStore.setAnswer(question.id, option.id)"
            />
            <span>{{ option.label }}</span>
          </label>
        </div>
      </article>

      <article class="card full-width actions-row quiz-actions-card">
        <button class="ghost-btn" type="button" @click="resetSession">Reset Jawaban</button>
        <button class="primary-btn" type="button" :disabled="quizStore.isSubmitting" @click="submitQuiz">
          {{ quizStore.isSubmitting ? 'Submitting...' : 'Submit Quiz' }}
        </button>
      </article>
    </template>

    <article v-else class="card full-width quiz-result-card">
      <h3>Hasil Quiz</h3>
      <p class="stat-big">{{ quizStore.result?.score || 0 }}%</p>
      <p class="muted">
        {{ quizStore.result?.passed ? 'Lulus' : 'Belum lulus' }} · {{ quizStore.result?.correctCount }}/{{ quizStore.result?.total }}
        benar
      </p>
      <p v-if="quizStore.result?.timedOut" class="error-badge">Waktu habis, jawaban otomatis disubmit.</p>

      <div class="hero-actions">
        <button class="ghost-btn" type="button" @click="startAttempt(true)" :disabled="!canRetake">Retake</button>
      </div>

      <div class="quiz-feedback-list">
        <article
          v-for="item in quizStore.result?.details || []"
          :key="item.questionId"
          class="quiz-feedback-item"
          :class="{ correct: item.isCorrect, wrong: !item.isCorrect }"
        >
          <h4>{{ item.title }}</h4>
          <p><strong>Jawaban kamu:</strong> {{ item.selectedLabel || '-' }}</p>
          <p><strong>Jawaban benar:</strong> {{ item.correctLabel }}</p>
          <p class="muted">{{ item.explanation }}</p>
        </article>
      </div>
    </article>

    <TemplateQuizWidget class="full-width" />
  </section>

  <section v-else class="quiz-alt aurora-quiz">
    <article class="card aurora-quiz-header">
      <div class="section-header">
        <h2>{{ quizTitle }}</h2>
        <span class="pill">{{ questionCount }} pertanyaan</span>
      </div>
      <p class="muted">{{ quizDescription }}</p>
      <div class="quiz-kpi-row">
        <span class="pill">{{ timerLabel }}</span>
        <span class="pill">Passing {{ passingScore }}%</span>
      </div>
    </article>

    <template v-if="!quizStore.isFinished">
      <article class="card aurora-question" v-for="(question, index) in questions" :key="question.id">
        <p class="eyebrow">Q{{ index + 1 }}</p>
        <h3>{{ question.title }}</h3>
        <div class="options">
          <label v-for="option in question.options" :key="option.id" class="option-row">
            <input
              type="radio"
              :name="question.id"
              :checked="quizStore.answers[question.id] === option.id"
              @change="quizStore.setAnswer(question.id, option.id)"
            />
            <span>{{ option.label }}</span>
          </label>
        </div>
      </article>

      <article class="card aurora-quiz-side">
        <h3>Quick Nav</h3>
        <div class="mosaic-grid">
          <button
            v-for="(q, n) in questions"
            :key="q.id"
            type="button"
            class="ghost-btn"
            :class="{ active: !!quizStore.answers[q.id] }"
          >
            #{{ n + 1 }}
          </button>
        </div>
        <div class="hero-actions">
          <button class="ghost-btn" type="button" @click="resetSession">Reset</button>
          <button class="primary-btn" type="button" :disabled="quizStore.isSubmitting" @click="submitQuiz">Submit</button>
        </div>
      </article>
    </template>

    <article v-else class="card aurora-quiz-side full-width">
      <h3>Result</h3>
      <p class="stat-big">{{ quizStore.result?.score || 0 }}%</p>
      <p class="muted">{{ quizStore.result?.passed ? 'Passed' : 'Not passed yet' }}</p>
      <button class="ghost-btn" type="button" @click="startAttempt(true)" :disabled="!canRetake">Retake</button>
    </article>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import TemplateQuizWidget from '../components/template/TemplateQuizWidget.vue'
import { useTemplateSwitcher } from '../plugins/templateSwitcher'
import { useQuizEngineStore } from '../stores/quizEngine'
import { useToastStore } from '../stores/toast'

const route = useRoute()
const toastStore = useToastStore()
const { currentTemplate } = useTemplateSwitcher()
const quizStore = useQuizEngineStore()

const remainingSec = ref(0)
let timerId = null

const quizId = computed(() => String(route.params.id || 'ui-101'))
const isModuleTriggered = computed(() => String(route.query.source || '') === 'module-complete')
const questions = computed(() => quizStore.session?.questions || [])
const questionCount = computed(() => questions.value.length)
const quizTitle = computed(() => quizStore.session?.title || quizStore.meta?.title || 'Quiz')
const quizDescription = computed(() => quizStore.session?.description || quizStore.meta?.description || '')
const passingScore = computed(() => quizStore.session?.passingScore || quizStore.meta?.passingScore || 70)
const currentAttempt = computed(() => quizStore.session?.attemptNo || quizStore.history.length + 1)
const maxAttempts = computed(() => quizStore.session?.maxAttempts || quizStore.meta?.maxAttempts || 3)
const canRetake = computed(() => Boolean(quizStore.result?.canRetake))

const timerLabel = computed(() => {
  const sec = Math.max(remainingSec.value, 0)
  const mm = String(Math.floor(sec / 60)).padStart(2, '0')
  const ss = String(sec % 60).padStart(2, '0')
  return `${mm}:${ss}`
})

const stopTimer = () => {
  if (timerId) {
    clearInterval(timerId)
    timerId = null
  }
}

const startTimer = () => {
  stopTimer()
  const tick = async () => {
    if (!quizStore.session || quizStore.isFinished) {
      stopTimer()
      return
    }
    const next = Math.floor((quizStore.session.expiresAt - Date.now()) / 1000)
    remainingSec.value = Math.max(next, 0)
    if (next <= 0) {
      stopTimer()
      const result = await quizStore.submit({ forced: true })
      if (result) {
        toastStore.push({
          type: 'info',
          title: 'Auto submit',
          message: 'Waktu quiz habis. Jawaban otomatis disubmit.',
        })
      }
    }
  }
  tick()
  timerId = setInterval(tick, 1000)
}

const startAttempt = async (retake = false) => {
  try {
    await quizStore.startSession(quizId.value, { retake })
    remainingSec.value = Math.floor((quizStore.session.expiresAt - Date.now()) / 1000)
    startTimer()
  } catch (error) {
    toastStore.push({
      type: 'error',
      title: 'Tidak bisa memulai quiz',
      message: error instanceof Error ? error.message : 'Terjadi kesalahan.',
    })
  }
}

const submitQuiz = async () => {
  const result = await quizStore.submit({ forced: false })
  if (!result) return
  stopTimer()
  toastStore.push({
    type: result.passed ? 'success' : 'info',
    title: result.passed ? 'Kamu lulus' : 'Belum lulus',
    message: `Skor ${result.score}% (passing ${result.passingScore}%).`,
  })
}

const resetSession = () => {
  if (!quizStore.session) return
  quizStore.answers = {}
}

watch(
  () => route.params.id,
  () => {
    startAttempt(false)
  },
)

onMounted(() => {
  startAttempt(false)
})

onBeforeUnmount(() => {
  stopTimer()
})
</script>
