<template>
  <section v-if="currentTemplate === 'sunrise'" class="course-player-layout">
    <article class="card course-player-card">
      <div class="lesson-stage" :style="{ background: currentCourse?.gradient || fallbackGradient }">
        <p>{{ currentCourse?.title || 'Course' }}</p>
        <h2>{{ activeLesson?.title || 'Loading lesson...' }}</h2>
        <span>{{ activeLesson?.duration || '-' }} · {{ activeLesson?.type || 'lesson' }}</span>
      </div>

      <div class="lesson-content">
        <div class="tab-strip">
          <button class="tab" :class="{ active: activeTab === 'material' }" type="button" @click="activeTab = 'material'">
            Materi
          </button>
          <button class="tab" :class="{ active: activeTab === 'resources' }" type="button" @click="activeTab = 'resources'">
            Resources
          </button>
          <button
            class="tab"
            :class="{ active: activeTab === 'discussion' }"
            type="button"
            @click="activeTab = 'discussion'"
          >
            Discussion
          </button>
        </div>

        <template v-if="activeTab === 'material'">
          <p class="lesson-summary">{{ activeLesson?.summary || 'Menyiapkan konten lesson...' }}</p>
          <div class="hero-actions">
            <button class="ghost-btn" type="button" :disabled="!previousLesson" @click="goPrevious">Previous</button>
            <button class="primary-btn" type="button" :disabled="isCompleting || !activeLesson" @click="markComplete">
              {{ isCompleting ? 'Saving...' : 'Mark as Complete' }}
            </button>
            <button class="ghost-btn" type="button" :disabled="!nextLesson" @click="goNext">Next</button>
          </div>
        </template>

        <template v-else-if="activeTab === 'resources'">
          <p class="lesson-summary">Resources untuk lesson ini.</p>
          <div class="resource-chips">
            <span v-for="resource in activeLesson?.resources || []" :key="resource" class="resource-chip">{{ resource }}</span>
          </div>
        </template>

        <template v-else>
          <div class="discussion-composer">
            <p v-if="replyTarget" class="reply-indicator">
              Membalas {{ replyTarget.authorName }}
              <button type="button" @click="clearReplyTarget">Batal</button>
            </p>
            <textarea
              v-model="discussionDraft"
              class="discussion-input"
              placeholder="Tulis pertanyaan atau insight kamu..."
              rows="3"
            ></textarea>
            <ul v-if="mentionSuggestions.length" class="mention-suggestion-list">
              <li v-for="user in mentionSuggestions" :key="`sunrise-${user.id}`">
                <button type="button" @click="applyMention(user)">
                  <strong>@{{ user.handle }}</strong>
                  <span>{{ user.name }}</span>
                </button>
              </li>
            </ul>
            <div class="hero-actions">
              <button
                class="primary-btn"
                type="button"
                :disabled="discussionStore.isSubmitting || !discussionDraft.trim() || !activeLesson"
                @click="submitDiscussion"
              >
                {{ discussionStore.isSubmitting ? 'Mengirim...' : 'Kirim Komentar' }}
              </button>
            </div>
          </div>

          <p v-if="discussionStore.isLoading" class="muted">Memuat diskusi...</p>
          <ul v-else-if="threadedDiscussions.length" class="discussion-list">
            <li v-for="thread in threadedDiscussions" :key="thread.root.id" class="discussion-thread">
              <article
                class="discussion-item"
                :class="{ 'focus-target': focusDiscussionId === thread.root.id }"
                :data-discussion-id="thread.root.id"
              >
                <p class="discussion-meta">{{ thread.root.authorName }} · {{ formatDiscussionTime(thread.root.createdAt) }}</p>
                <template v-if="editingItemId === thread.root.id">
                  <textarea v-model="editDraft" class="discussion-input" rows="3"></textarea>
                  <div class="discussion-actions">
                    <button type="button" class="discussion-reply-btn" @click="saveEdit(thread.root)">Save</button>
                    <button type="button" class="discussion-reply-btn" @click="cancelEdit">Cancel</button>
                  </div>
                </template>
                <template v-else>
                  <p class="discussion-message">{{ thread.root.message }}</p>
                  <div class="discussion-actions">
                    <button type="button" class="discussion-reply-btn" @click="setReplyTarget(thread.root)">Reply</button>
                    <button v-if="canManageDiscussion(thread.root)" type="button" class="discussion-reply-btn" @click="startEdit(thread.root)">
                      Edit
                    </button>
                    <button v-if="canManageDiscussion(thread.root)" type="button" class="discussion-reply-btn danger" @click="removeDiscussion(thread.root)">
                      Delete
                    </button>
                  </div>
                </template>
              </article>
              <ul v-if="thread.replies.length" class="discussion-reply-list">
                <li
                  v-for="reply in thread.replies"
                  :key="reply.id"
                  class="discussion-item discussion-item-reply"
                  :class="{ 'focus-target': focusDiscussionId === reply.id }"
                  :data-discussion-id="reply.id"
                >
                  <p class="discussion-meta">{{ reply.authorName }} · {{ formatDiscussionTime(reply.createdAt) }}</p>
                  <template v-if="editingItemId === reply.id">
                    <textarea v-model="editDraft" class="discussion-input" rows="3"></textarea>
                    <div class="discussion-actions">
                      <button type="button" class="discussion-reply-btn" @click="saveEdit(reply)">Save</button>
                      <button type="button" class="discussion-reply-btn" @click="cancelEdit">Cancel</button>
                    </div>
                  </template>
                  <template v-else>
                    <p class="discussion-message">{{ reply.message }}</p>
                    <div class="discussion-actions">
                      <button type="button" class="discussion-reply-btn" @click="setReplyTarget(reply)">Reply</button>
                      <button v-if="canManageDiscussion(reply)" type="button" class="discussion-reply-btn" @click="startEdit(reply)">
                        Edit
                      </button>
                      <button v-if="canManageDiscussion(reply)" type="button" class="discussion-reply-btn danger" @click="removeDiscussion(reply)">
                        Delete
                      </button>
                    </div>
                  </template>
                </li>
              </ul>
            </li>
          </ul>
          <p v-else class="muted">Belum ada diskusi di lesson ini.</p>
        </template>
      </div>
    </article>

    <article v-if="moduleQuizPrompt" class="card module-quiz-prompt">
      <p class="eyebrow">Module Complete</p>
      <h3>{{ moduleQuizPrompt.moduleTitle }} selesai</h3>
      <p class="muted">Lanjutkan dengan quiz modul untuk mengunci pemahaman sebelum masuk materi berikutnya.</p>
      <div class="hero-actions">
        <button class="ghost-btn" type="button" @click="moduleQuizPrompt = null">Nanti</button>
        <RouterLink class="primary-btn" :to="toModuleQuizRoute(moduleQuizPrompt.quiz, 'module-complete')">Mulai Quiz</RouterLink>
      </div>
    </article>

    <article class="card course-outline-card">
      <div class="section-header">
        <h3>Modul Progress</h3>
        <span class="muted">{{ currentCourse?.completedLessons || 0 }}/{{ currentCourse?.totalLessons || 0 }} selesai</span>
      </div>
      <div class="progress-row course-progress-row">
        <div class="progress-track">
          <div class="progress-fill" :style="{ width: `${currentCourse?.progress || 0}%` }"></div>
        </div>
        <strong>{{ currentCourse?.progress || 0 }}%</strong>
      </div>

      <div class="module-stack">
        <section v-for="module in currentCourse?.modules || []" :key="module.id" class="module-block">
          <div class="module-head">
            <h4>{{ module.title }}</h4>
            <RouterLink
              v-if="isModuleCompleted(module) && getModuleQuiz(module.id)"
              :to="toModuleQuizRoute(getModuleQuiz(module.id), 'outline')"
              class="module-quiz-link"
            >
              Quiz Modul
            </RouterLink>
          </div>
          <ul class="lesson-list">
            <li
              v-for="lesson in module.lessons"
              :key="lesson.id"
              class="lesson-row"
              :class="{ active: lesson.isActive, done: lesson.isCompleted, locked: lesson.isLocked }"
            >
              <button type="button" class="lesson-btn" :disabled="lesson.isLocked" @click="selectLesson(lesson)">
                <span class="lesson-title">{{ lesson.title }}</span>
                <span class="lesson-meta">
                  {{ lesson.isLocked ? 'Locked' : lesson.isCompleted ? 'Completed' : lesson.duration }}
                </span>
              </button>
            </li>
          </ul>
        </section>
      </div>
    </article>

  </section>

  <section v-else class="course-player-layout aurora-player-layout">
    <article class="card aurora-player-panel">
      <div class="aurora-player-top">
        <div>
          <p class="eyebrow">{{ currentCourse?.title || 'Course' }}</p>
          <h2>{{ activeLesson?.title || 'Loading lesson...' }}</h2>
          <p class="muted">{{ activeLesson?.summary || 'Menyiapkan konten lesson...' }}</p>
        </div>
        <div class="aurora-badge">{{ currentCourse?.progress || 0 }}%</div>
      </div>

      <div class="lesson-stage aurora-stage" :style="{ background: currentCourse?.gradient || fallbackGradient }">
        <span>{{ activeLesson?.duration || '-' }} · {{ activeLesson?.type || 'lesson' }}</span>
      </div>

      <div class="resource-chips">
        <span v-for="resource in activeLesson?.resources || []" :key="resource" class="resource-chip">{{ resource }}</span>
      </div>

      <div class="tab-strip">
        <button class="tab" :class="{ active: activeTab === 'material' }" type="button" @click="activeTab = 'material'">Materi</button>
        <button class="tab" :class="{ active: activeTab === 'resources' }" type="button" @click="activeTab = 'resources'">
          Resources
        </button>
        <button class="tab" :class="{ active: activeTab === 'discussion' }" type="button" @click="activeTab = 'discussion'">
          Discussion
        </button>
      </div>

      <template v-if="activeTab === 'material'">
        <div class="hero-actions">
          <button class="ghost-btn" type="button" :disabled="!previousLesson" @click="goPrevious">Prev</button>
          <button class="primary-btn" type="button" :disabled="isCompleting || !activeLesson" @click="markComplete">
            {{ isCompleting ? 'Saving...' : 'Complete & Next' }}
          </button>
          <button class="ghost-btn" type="button" :disabled="!nextLesson" @click="goNext">Next</button>
        </div>
      </template>

      <template v-else-if="activeTab === 'discussion'">
        <div class="discussion-composer">
          <p v-if="replyTarget" class="reply-indicator">
            Membalas {{ replyTarget.authorName }}
            <button type="button" @click="clearReplyTarget">Batal</button>
          </p>
          <textarea
            v-model="discussionDraft"
            class="discussion-input"
            placeholder="Tulis pertanyaan atau insight kamu..."
            rows="3"
          ></textarea>
          <ul v-if="mentionSuggestions.length" class="mention-suggestion-list">
            <li v-for="user in mentionSuggestions" :key="`aurora-${user.id}`">
              <button type="button" @click="applyMention(user)">
                <strong>@{{ user.handle }}</strong>
                <span>{{ user.name }}</span>
              </button>
            </li>
          </ul>
          <div class="hero-actions">
            <button
              class="primary-btn"
              type="button"
              :disabled="discussionStore.isSubmitting || !discussionDraft.trim() || !activeLesson"
              @click="submitDiscussion"
            >
              {{ discussionStore.isSubmitting ? 'Mengirim...' : 'Kirim Komentar' }}
            </button>
          </div>
        </div>

        <p v-if="discussionStore.isLoading" class="muted">Memuat diskusi...</p>
        <ul v-else-if="threadedDiscussions.length" class="discussion-list">
          <li v-for="thread in threadedDiscussions" :key="thread.root.id" class="discussion-thread">
            <article
              class="discussion-item"
              :class="{ 'focus-target': focusDiscussionId === thread.root.id }"
              :data-discussion-id="thread.root.id"
            >
              <p class="discussion-meta">{{ thread.root.authorName }} · {{ formatDiscussionTime(thread.root.createdAt) }}</p>
              <template v-if="editingItemId === thread.root.id">
                <textarea v-model="editDraft" class="discussion-input" rows="3"></textarea>
                <div class="discussion-actions">
                  <button type="button" class="discussion-reply-btn" @click="saveEdit(thread.root)">Save</button>
                  <button type="button" class="discussion-reply-btn" @click="cancelEdit">Cancel</button>
                </div>
              </template>
              <template v-else>
                <p class="discussion-message">{{ thread.root.message }}</p>
                <div class="discussion-actions">
                  <button type="button" class="discussion-reply-btn" @click="setReplyTarget(thread.root)">Reply</button>
                  <button v-if="canManageDiscussion(thread.root)" type="button" class="discussion-reply-btn" @click="startEdit(thread.root)">
                    Edit
                  </button>
                  <button v-if="canManageDiscussion(thread.root)" type="button" class="discussion-reply-btn danger" @click="removeDiscussion(thread.root)">
                    Delete
                  </button>
                </div>
              </template>
            </article>
            <ul v-if="thread.replies.length" class="discussion-reply-list">
              <li
                v-for="reply in thread.replies"
                :key="reply.id"
                class="discussion-item discussion-item-reply"
                :class="{ 'focus-target': focusDiscussionId === reply.id }"
                :data-discussion-id="reply.id"
              >
                <p class="discussion-meta">{{ reply.authorName }} · {{ formatDiscussionTime(reply.createdAt) }}</p>
                <template v-if="editingItemId === reply.id">
                  <textarea v-model="editDraft" class="discussion-input" rows="3"></textarea>
                  <div class="discussion-actions">
                    <button type="button" class="discussion-reply-btn" @click="saveEdit(reply)">Save</button>
                    <button type="button" class="discussion-reply-btn" @click="cancelEdit">Cancel</button>
                  </div>
                </template>
                <template v-else>
                  <p class="discussion-message">{{ reply.message }}</p>
                  <div class="discussion-actions">
                    <button type="button" class="discussion-reply-btn" @click="setReplyTarget(reply)">Reply</button>
                    <button v-if="canManageDiscussion(reply)" type="button" class="discussion-reply-btn" @click="startEdit(reply)">
                      Edit
                    </button>
                    <button v-if="canManageDiscussion(reply)" type="button" class="discussion-reply-btn danger" @click="removeDiscussion(reply)">
                      Delete
                    </button>
                  </div>
                </template>
              </li>
            </ul>
          </li>
        </ul>
        <p v-else class="muted">Belum ada diskusi di lesson ini.</p>
      </template>
    </article>

    <article class="card aurora-outline-panel">
      <div class="section-header">
        <h3>Course Outline</h3>
        <span class="muted">{{ currentCourse?.completedLessons || 0 }}/{{ currentCourse?.totalLessons || 0 }} done</span>
      </div>

      <div class="module-stack">
        <section v-for="module in currentCourse?.modules || []" :key="module.id" class="module-block">
          <div class="module-head">
            <h4>{{ module.title }}</h4>
            <RouterLink
              v-if="isModuleCompleted(module) && getModuleQuiz(module.id)"
              :to="toModuleQuizRoute(getModuleQuiz(module.id), 'outline')"
              class="module-quiz-link"
            >
              Quiz Modul
            </RouterLink>
          </div>
          <ul class="lesson-list">
            <li
              v-for="lesson in module.lessons"
              :key="lesson.id"
              class="lesson-row"
              :class="{ active: lesson.isActive, done: lesson.isCompleted, locked: lesson.isLocked }"
            >
              <button type="button" class="lesson-btn" :disabled="lesson.isLocked" @click="selectLesson(lesson)">
                <span class="lesson-title">{{ lesson.title }}</span>
                <span class="lesson-meta">
                  {{ lesson.isLocked ? 'Locked' : lesson.isCompleted ? 'Completed' : lesson.duration }}
                </span>
              </button>
            </li>
          </ul>
        </section>
      </div>
    </article>

    <article v-if="moduleQuizPrompt" class="card module-quiz-prompt">
      <p class="eyebrow">Module Complete</p>
      <h3>{{ moduleQuizPrompt.moduleTitle }} selesai</h3>
      <p class="muted">Lanjutkan dengan quiz modul untuk mengunci pemahaman sebelum masuk materi berikutnya.</p>
      <div class="hero-actions">
        <button class="ghost-btn" type="button" @click="moduleQuizPrompt = null">Nanti</button>
        <RouterLink class="primary-btn" :to="toModuleQuizRoute(moduleQuizPrompt.quiz, 'module-complete')">Mulai Quiz</RouterLink>
      </div>
    </article>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import { useTemplateSwitcher } from '../plugins/templateSwitcher'
import { quizCatalogService } from '../services/quizCatalogService'
import { useAuthStore } from '../stores/auth'
import { useCoursePlayerStore } from '../stores/coursePlayer'
import { useLessonDiscussionStore } from '../stores/lessonDiscussion'
import { useToastStore } from '../stores/toast'

const route = useRoute()
const router = useRouter()
const toastStore = useToastStore()
const authStore = useAuthStore()
const coursePlayerStore = useCoursePlayerStore()
const discussionStore = useLessonDiscussionStore()
const { currentCourse } = storeToRefs(coursePlayerStore)
const { items: discussionItems } = storeToRefs(discussionStore)
const { currentTemplate } = useTemplateSwitcher()

const isCompleting = ref(false)
const moduleQuizPrompt = ref(null)
const activeTab = ref('material')
const discussionDraft = ref('')
const replyTarget = ref(null)
const editingItemId = ref('')
const editDraft = ref('')
const focusDiscussionId = ref('')
let focusResetTimer = null
const fallbackGradient = 'linear-gradient(145deg, #1f6feb, #53b3ff)'
const mentionDirectory = [
  { id: 'u-001', handle: 'indra', name: 'Indra Permana' },
  { id: 'u-002', handle: 'ayu', name: 'Ayu Pratama' },
  { id: 'u-003', handle: 'raka', name: 'Raka Wijaya' },
  { id: 'u-004', handle: 'nadia', name: 'Nadia Putri' },
]

const activeLesson = computed(() => currentCourse.value?.activeLesson || null)
const previousLesson = computed(() => currentCourse.value?.previousLesson || null)
const nextLesson = computed(() => currentCourse.value?.nextLesson || null)
const authUser = computed(() => authStore.user || null)
const mentionQuery = computed(() => {
  const match = String(discussionDraft.value || '').match(/(?:^|\s)@([a-zA-Z0-9._-]{0,30})$/)
  return match ? match[1].toLowerCase() : ''
})
const mentionSuggestions = computed(() => {
  const query = mentionQuery.value
  if (!query) return []
  return mentionDirectory
    .filter(
      (user) =>
        user.handle.toLowerCase().includes(query) ||
        user.name.toLowerCase().replace(/\s+/g, '').includes(query),
    )
    .slice(0, 6)
})
const threadedDiscussions = computed(() => {
  const roots = discussionItems.value.filter((item) => !item.parentId)
  return roots.map((root) => ({
    root,
    replies: discussionItems.value.filter((item) => item.parentId === root.id),
  }))
})

const getLessonModule = (course, lessonId) =>
  course?.modules?.find((module) => module.lessons.some((lesson) => lesson.id === lessonId)) || null

const isModuleCompleted = (module) => module.lessons.every((lesson) => lesson.isCompleted)

const getModuleQuiz = (moduleId) => quizCatalogService.getQuizForModule(String(route.params.id), moduleId)

const toModuleQuizRoute = (quiz, source) => ({
  name: 'quiz',
  params: { id: quiz.id },
  query: {
    course: String(route.params.id),
    module: quiz.moduleId,
    source,
  },
})

const formatDiscussionTime = (value) => {
  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return '-'
  }
}

const loadDiscussion = async () => {
  if (!activeLesson.value) return
  try {
    await discussionStore.load(String(route.params.id), activeLesson.value.id)
  } catch (error) {
    toastStore.push({
      type: 'error',
      title: 'Gagal memuat diskusi',
      message: error instanceof Error ? error.message : 'Terjadi kesalahan.',
    })
  }
}

const applyTabFromQuery = () => {
  const tab = String(route.query.tab || '')
  if (tab === 'material' || tab === 'resources' || tab === 'discussion') {
    activeTab.value = tab
  }
}

const focusDiscussionFromQuery = async () => {
  const targetId = String(route.query.focusDiscussion || '')
  if (!targetId) {
    focusDiscussionId.value = ''
    return
  }

  if (activeTab.value !== 'discussion') {
    activeTab.value = 'discussion'
  }

  await loadDiscussion()
  focusDiscussionId.value = targetId
  if (focusResetTimer) {
    clearTimeout(focusResetTimer)
    focusResetTimer = null
  }

  await nextTick()
  const selectorId = targetId.replace(/"/g, '\\"')
  const node = document.querySelector(`[data-discussion-id="${selectorId}"]`)
  if (node && typeof node.scrollIntoView === 'function') {
    node.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
  focusResetTimer = setTimeout(() => {
    focusDiscussionId.value = ''
    focusResetTimer = null
  }, 2600)
}

const submitDiscussion = async () => {
  if (!activeLesson.value) return
  try {
    await discussionStore.add(String(route.params.id), activeLesson.value.id, discussionDraft.value, replyTarget.value?.id || null)
    discussionDraft.value = ''
    replyTarget.value = null
  } catch (error) {
    toastStore.push({
      type: 'error',
      title: 'Komentar gagal dikirim',
      message: error instanceof Error ? error.message : 'Terjadi kesalahan.',
    })
  }
}

const applyMention = (user) => {
  discussionDraft.value = discussionDraft.value.replace(/@([a-zA-Z0-9._-]{0,30})$/, `@${user.handle} `)
}

const toMentionHandle = (name) =>
  String(name || '')
    .trim()
    .split(/\s+/)[0]
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')

const setReplyTarget = (item) => {
  replyTarget.value = item
  if (!discussionDraft.value.trim()) {
    const handle = toMentionHandle(item.authorName)
    discussionDraft.value = handle ? `@${handle} ` : ''
  }
}

const clearReplyTarget = () => {
  replyTarget.value = null
}

const canManageDiscussion = (item) => {
  const role = authUser.value?.role || ''
  const userId = authUser.value?.id || ''
  return role === 'admin' || item.authorId === userId
}

const startEdit = (item) => {
  editingItemId.value = item.id
  editDraft.value = item.message
  replyTarget.value = null
}

const cancelEdit = () => {
  editingItemId.value = ''
  editDraft.value = ''
}

const saveEdit = async (item) => {
  if (!activeLesson.value) return
  try {
    await discussionStore.update(String(route.params.id), activeLesson.value.id, item.id, editDraft.value)
    cancelEdit()
  } catch (error) {
    toastStore.push({
      type: 'error',
      title: 'Gagal edit komentar',
      message: error instanceof Error ? error.message : 'Terjadi kesalahan.',
    })
  }
}

const removeDiscussion = async (item) => {
  if (!activeLesson.value) return
  try {
    await discussionStore.remove(String(route.params.id), activeLesson.value.id, item.id)
    if (replyTarget.value?.id === item.id) {
      replyTarget.value = null
    }
    if (editingItemId.value === item.id) {
      cancelEdit()
    }
  } catch (error) {
    toastStore.push({
      type: 'error',
      title: 'Gagal hapus komentar',
      message: error instanceof Error ? error.message : 'Terjadi kesalahan.',
    })
  }
}

const syncLessonQuery = async (lessonId) => {
  const currentLessonQuery = String(route.query.lesson || '')
  if (!lessonId || currentLessonQuery === lessonId) return
  await router.replace({
    name: 'course-detail',
    params: { id: route.params.id },
    query: { ...route.query, lesson: lessonId },
  })
}

const applyLessonFromQuery = async () => {
  const requestedLessonId = String(route.query.lesson || '')
  if (!requestedLessonId || !currentCourse.value) return
  if (currentCourse.value.activeLesson?.id === requestedLessonId) return

  const targetLesson = currentCourse.value.modules
    .flatMap((module) => module.lessons)
    .find((lesson) => lesson.id === requestedLessonId)

  if (!targetLesson || targetLesson.isLocked) {
    await syncLessonQuery(currentCourse.value.activeLesson?.id || '')
    return
  }

  try {
    await coursePlayerStore.setActiveLesson(route.params.id, requestedLessonId)
  } catch {
    await syncLessonQuery(currentCourse.value.activeLesson?.id || '')
  }
}

const loadCourse = async () => {
  try {
    applyTabFromQuery()
    await coursePlayerStore.loadCourse(route.params.id)
    await applyLessonFromQuery()
    await syncLessonQuery(coursePlayerStore.currentCourse?.activeLesson?.id || '')
    await focusDiscussionFromQuery()
  } catch (error) {
    toastStore.push({
      type: 'error',
      title: 'Course gagal dimuat',
      message: error instanceof Error ? error.message : 'Terjadi kesalahan saat memuat course.',
    })
  }
}

const selectLesson = async (lesson) => {
  if (lesson.isLocked) {
    toastStore.push({
      type: 'info',
      title: 'Lesson masih terkunci',
      message: 'Selesaikan lesson sebelumnya untuk membuka lesson ini.',
    })
    return
  }
  try {
    await coursePlayerStore.setActiveLesson(route.params.id, lesson.id)
    await syncLessonQuery(coursePlayerStore.currentCourse?.activeLesson?.id || lesson.id)
    if (activeTab.value === 'discussion') {
      await loadDiscussion()
    }
  } catch (error) {
    toastStore.push({
      type: 'error',
      title: 'Gagal membuka lesson',
      message: error instanceof Error ? error.message : 'Terjadi kesalahan.',
    })
  }
}

const markComplete = async () => {
  if (!activeLesson.value) return
  const completedLessonId = activeLesson.value.id
  const beforeCourse = currentCourse.value ? JSON.parse(JSON.stringify(currentCourse.value)) : null
  isCompleting.value = true
  try {
    await coursePlayerStore.completeLesson(route.params.id, activeLesson.value.id)
    await syncLessonQuery(coursePlayerStore.currentCourse?.activeLesson?.id || '')

    const module = getLessonModule(beforeCourse, completedLessonId)
    if (module) {
      const updatedModule = currentCourse.value?.modules?.find((item) => item.id === module.id)
      const moduleCompleted = updatedModule ? isModuleCompleted(updatedModule) : false
      const moduleQuiz = getModuleQuiz(module.id)

      if (moduleCompleted && moduleQuiz) {
        moduleQuizPrompt.value = {
          moduleId: module.id,
          moduleTitle: module.title,
          quiz: moduleQuiz,
        }
        toastStore.push({
          type: 'info',
          title: 'Module selesai',
          message: `${module.title} selesai. Lanjutkan ke quiz modul.`,
          actionLabel: 'Mulai Quiz',
          onAction: () => {
            router.push(toModuleQuizRoute(moduleQuiz, 'module-complete'))
          },
          timeout: 5500,
        })
      }
    }

    toastStore.push({
      type: 'success',
      title: 'Progress tersimpan',
      message: 'Lesson ditandai selesai.',
    })
  } catch (error) {
    toastStore.push({
      type: 'error',
      title: 'Gagal menyimpan progress',
      message: error instanceof Error ? error.message : 'Terjadi kesalahan.',
    })
  } finally {
    isCompleting.value = false
  }
}

const goPrevious = async () => {
  if (!previousLesson.value) return
  await selectLesson(previousLesson.value)
}

const goNext = async () => {
  if (!nextLesson.value) return
  await selectLesson(nextLesson.value)
}

watch(
  () => route.params.id,
  () => {
    loadCourse()
    discussionStore.clear()
    discussionDraft.value = ''
    replyTarget.value = null
    cancelEdit()
  },
)

watch(
  () => route.query.lesson,
  () => {
    if (!currentCourse.value) return
    applyLessonFromQuery()
  },
)

watch(
  () => route.query.tab,
  () => {
    applyTabFromQuery()
  },
)

watch(
  () => route.query.focusDiscussion,
  () => {
    focusDiscussionFromQuery()
  },
)

watch(
  () => activeTab.value,
  (tab) => {
    if (tab === 'discussion') {
      loadDiscussion()
    }
  },
)

watch(
  () => activeLesson.value?.id,
  () => {
    if (activeTab.value === 'discussion') {
      loadDiscussion()
    }
    replyTarget.value = null
    cancelEdit()
  },
)

onMounted(() => {
  loadCourse()
})

onBeforeUnmount(() => {
  if (focusResetTimer) {
    clearTimeout(focusResetTimer)
    focusResetTimer = null
  }
})
</script>
