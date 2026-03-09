const DISCUSSION_KEY = 'curiosity:lms:lesson-discussion:v1'

const readJson = (key, fallback) => {
  if (typeof localStorage === 'undefined') return fallback
  const raw = localStorage.getItem(key)
  if (!raw) return fallback

  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

const writeJson = (key, value) => {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(key, JSON.stringify(value))
}

const nowStamp = () => {
  const now = new Date()
  return now.toISOString()
}

const discussionScope = (courseId, lessonId) => `${courseId}:${lessonId}`
const mentionDirectory = [
  { id: 'u-001', name: 'Indra Permana', email: 'indra@curiosity.app' },
  { id: 'u-002', name: 'Ayu Pratama', email: 'ayu@curiosity.app' },
  { id: 'u-003', name: 'Raka Wijaya', email: 'raka@curiosity.app' },
  { id: 'u-004', name: 'Nadia Putri', email: 'nadia@curiosity.app' },
]
const canModerate = (item, user) => {
  const userId = String(user?.id || '')
  const role = String(user?.role || '')
  return role === 'admin' || item.authorId === userId
}

const extractMentionTokens = (text) => {
  const matches = String(text || '').match(/@([a-zA-Z0-9._-]{2,40})/g) || []
  return [
    ...new Set(
      matches
        .map((raw) => raw.slice(1).toLowerCase().replace(/[.,!?;:]+$/g, ''))
        .filter(Boolean),
    ),
  ]
}

const resolveMentionUserIds = (text) => {
  const tokens = extractMentionTokens(text)
  if (!tokens.length) return []
  return mentionDirectory
    .filter((user) => {
      const emailLocal = user.email.split('@')[0].toLowerCase()
      const nameNoSpace = user.name.replace(/\s+/g, '').toLowerCase()
      const nameTokens = user.name
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
      return tokens.some((token) => token === emailLocal || token === nameNoSpace || nameTokens.includes(token))
    })
    .map((user) => user.id)
}

export const lessonDiscussionService = {
  list(courseId, lessonId) {
    const all = readJson(DISCUSSION_KEY, {})
    const key = discussionScope(courseId, lessonId)
    const items = Array.isArray(all[key]) ? all[key] : []
    return items
      .slice()
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .map((item) => ({ ...item }))
  },

  add({ courseId, lessonId, message, authorId, authorName, parentId = null }) {
    const trimmed = String(message || '').trim()
    if (trimmed.length < 2) {
      throw new Error('Komentar minimal 2 karakter.')
    }
    if (trimmed.length > 600) {
      throw new Error('Komentar maksimal 600 karakter.')
    }

    const all = readJson(DISCUSSION_KEY, {})
    const key = discussionScope(courseId, lessonId)
    const current = Array.isArray(all[key]) ? all[key] : []
    if (parentId && !current.some((item) => item.id === parentId)) {
      throw new Error('Komentar yang dibalas tidak ditemukan.')
    }

    const next = [
      {
        id: `disc-${Math.random().toString(36).slice(2, 10)}`,
        courseId,
        lessonId,
        parentId: parentId || null,
        message: trimmed,
        mentionUserIds: resolveMentionUserIds(trimmed),
        authorId: String(authorId || 'guest'),
        authorName: String(authorName || 'Guest User'),
        createdAt: nowStamp(),
      },
      ...current,
    ].slice(0, 200)

    all[key] = next
    writeJson(DISCUSSION_KEY, all)
    return next.map((item) => ({ ...item }))
  },

  update({ courseId, lessonId, discussionId, message, user }) {
    const trimmed = String(message || '').trim()
    if (trimmed.length < 2) {
      throw new Error('Komentar minimal 2 karakter.')
    }
    if (trimmed.length > 600) {
      throw new Error('Komentar maksimal 600 karakter.')
    }

    const all = readJson(DISCUSSION_KEY, {})
    const key = discussionScope(courseId, lessonId)
    const current = Array.isArray(all[key]) ? all[key] : []
    const target = current.find((item) => item.id === discussionId)
    if (!target) throw new Error('Komentar tidak ditemukan.')
    if (!canModerate(target, user)) throw new Error('Tidak punya akses untuk edit komentar ini.')

    all[key] = current.map((item) =>
      item.id === discussionId
        ? {
            ...item,
            message: trimmed,
            mentionUserIds: resolveMentionUserIds(trimmed),
            updatedAt: nowStamp(),
          }
        : item,
    )
    writeJson(DISCUSSION_KEY, all)
    return all[key].map((item) => ({ ...item }))
  },

  remove({ courseId, lessonId, discussionId, user }) {
    const all = readJson(DISCUSSION_KEY, {})
    const key = discussionScope(courseId, lessonId)
    const current = Array.isArray(all[key]) ? all[key] : []
    const target = current.find((item) => item.id === discussionId)
    if (!target) throw new Error('Komentar tidak ditemukan.')
    if (!canModerate(target, user)) throw new Error('Tidak punya akses untuk hapus komentar ini.')

    all[key] = current.filter((item) => item.id !== discussionId && item.parentId !== discussionId)
    writeJson(DISCUSSION_KEY, all)
    return all[key].map((item) => ({ ...item }))
  },

  listActivity(userId, limit = 30) {
    const all = readJson(DISCUSSION_KEY, {})
    const items = Object.values(all)
      .flatMap((list) => (Array.isArray(list) ? list : []))
      .filter((item) => !userId || item.authorId !== userId)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, limit)
      .map((item) => ({
        ...item,
        isMention: Array.isArray(item.mentionUserIds) ? item.mentionUserIds.includes(userId) : false,
        title: 'Diskusi Lesson',
        subtitle: item.message,
      }))
    return items
  },
}
