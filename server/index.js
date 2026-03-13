import bcrypt from 'bcryptjs'
import cors from 'cors'
import express from 'express'
import { S3Client, DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl as getSignedS3Url } from '@aws-sdk/s3-request-presigner'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import jwt from 'jsonwebtoken'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { TextDecoder } from 'node:util'
import { z } from 'zod'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DB_DIR = path.join(__dirname, 'data')
const UPLOAD_DIR = path.join(DB_DIR, 'uploads')
const isTestEnv = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST)
const defaultDbName = isTestEnv ? `db.test.${process.pid}.json` : 'db.json'
const DB_PATH = process.env.DB_PATH || path.join(DB_DIR, defaultDbName)

const PORT = Number(process.env.PORT || 3000)
const JWT_SECRET = process.env.JWT_SECRET || 'curiosity-dev-secret'
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '12h'
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*'
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 10)
const STORAGE_PROVIDER = process.env.STORAGE_PROVIDER || 'local'
const S3_REGION = process.env.S3_REGION || 'us-east-1'
const S3_BUCKET = process.env.S3_BUCKET || ''
const S3_ENDPOINT = process.env.S3_ENDPOINT || ''
const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID || ''
const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY || ''
const S3_FORCE_PATH_STYLE = String(process.env.S3_FORCE_PATH_STYLE || 'false') === 'true'
const S3_SIGNED_URL_EXPIRES_SEC = Number(process.env.S3_SIGNED_URL_EXPIRES_SEC || 900)
const NOTIFICATION_WEBHOOK_SECRET = process.env.NOTIFICATION_WEBHOOK_SECRET || ''
const COURSE_JOB_RETRY_BASE_MS = Number(process.env.COURSE_JOB_RETRY_BASE_MS || 5000)
const COURSE_JOB_LEASE_TTL_MS = Number(process.env.COURSE_JOB_LEASE_TTL_MS || 12000)
const WEBHOOK_SIGNATURE_TOLERANCE_SEC = Number(process.env.WEBHOOK_SIGNATURE_TOLERANCE_SEC || 300)
const EMAIL_PROVIDER_MODE = String(process.env.EMAIL_PROVIDER_MODE || 'simulated').toLowerCase()
const EMAIL_PROVIDER_WEBHOOK_URL = process.env.EMAIL_PROVIDER_WEBHOOK_URL || ''
const EMAIL_PROVIDER_API_KEY = process.env.EMAIL_PROVIDER_API_KEY || ''
const EMAIL_PROVIDER_TIMEOUT_MS = Number(process.env.EMAIL_PROVIDER_TIMEOUT_MS || 5000)

const allowedOrigins = CORS_ORIGIN === '*' ? '*' : CORS_ORIGIN.split(',').map((v) => v.trim()).filter(Boolean)

const accessLevels = {
  admin: 'Admin',
  instructor: 'Instructor',
  student: 'Student',
}

const roles = ['admin', 'instructor', 'student']
const statuses = ['active', 'suspended', 'pending']
const MAX_ASSIGNMENT_UPLOAD_BYTES = 2 * 1024 * 1024
const MAX_ASSIGNMENT_UPLOAD_TOTAL_BYTES = Number(process.env.MAX_ASSIGNMENT_UPLOAD_TOTAL_BYTES || 20 * 1024 * 1024)
const VIDEO_COMPLETION_THRESHOLD_PERCENT = 90
const MAX_WATCH_STEP_SEC = 20
const ANALYTICS_WINDOW_DAYS = 7
const MAX_WEBHOOK_REPLAY_NONCES = 5000

const defaultUsers = [
  {
    id: 'u-001',
    name: 'Indra Permana',
    email: 'indra@curiosity.app',
    role: 'admin',
    status: 'active',
    lastLogin: '2026-03-09 08:20',
  },
  {
    id: 'u-002',
    name: 'Ayu Pratama',
    email: 'ayu@curiosity.app',
    role: 'instructor',
    status: 'active',
    lastLogin: '2026-03-08 21:17',
  },
  {
    id: 'u-003',
    name: 'Raka Wijaya',
    email: 'raka@curiosity.app',
    role: 'student',
    status: 'active',
    lastLogin: '2026-03-08 19:44',
  },
  {
    id: 'u-004',
    name: 'Nadia Putri',
    email: 'nadia@curiosity.app',
    role: 'student',
    status: 'suspended',
    lastLogin: '2026-03-03 11:08',
  },
]

const defaultCredentialsPlain = {
  'indra@curiosity.app': 'admin123',
  'ayu@curiosity.app': 'instructor123',
  'raka@curiosity.app': 'student123',
}

const defaultPermissionMatrix = {
  admin: {
    viewDashboard: true,
    manageCourse: true,
    manageQuiz: true,
    manageUsers: true,
  },
  instructor: {
    viewDashboard: true,
    manageCourse: true,
    manageQuiz: true,
    manageUsers: false,
  },
  student: {
    viewDashboard: true,
    manageCourse: false,
    manageQuiz: false,
    manageUsers: false,
  },
}

const defaultCourseManagementPermissionMatrix = {
  admin: {
    view: true,
    create: true,
    edit: true,
    delete: true,
    publish: true,
    schedule: true,
    bulk: true,
    importExport: true,
    history: true,
    duplicate: true,
    restoreRevision: true,
    managePermissions: true,
  },
  instructor: {
    view: true,
    create: true,
    edit: true,
    delete: false,
    publish: true,
    schedule: true,
    bulk: true,
    importExport: true,
    history: true,
    duplicate: true,
    restoreRevision: false,
    managePermissions: false,
  },
  student: {
    view: false,
    create: false,
    edit: false,
    delete: false,
    publish: false,
    schedule: false,
    bulk: false,
    importExport: false,
    history: false,
    duplicate: false,
    restoreRevision: false,
    managePermissions: false,
  },
}

const demoVideoUrl = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4'

const toDataUrlFromText = (text, mimeType = 'text/plain') =>
  `data:${mimeType};base64,${Buffer.from(String(text || ''), 'utf8').toString('base64')}`

const toLessonResourceList = (courseId, lessonId, resources = []) =>
  resources
    .map((resource, index) => {
      if (typeof resource === 'string') {
        return {
          id: `${lessonId}-res-${index + 1}`,
          title: resource,
          fileName: String(resource).toLowerCase().replace(/[^a-z0-9._-]+/g, '-'),
          mimeType: 'text/plain',
          sizeBytes: Buffer.byteLength(resource, 'utf8'),
          dataUrl: toDataUrlFromText(`Lesson resource: ${resource}\nCourse: ${courseId}\nLesson: ${lessonId}\n`, 'text/plain'),
        }
      }
      if (!resource || typeof resource !== 'object') return null
      if (resource.dataUrl) {
        return {
          id: String(resource.id || `${lessonId}-res-${index + 1}`),
          title: String(resource.title || resource.fileName || `Resource ${index + 1}`),
          fileName: String(resource.fileName || `${lessonId}-resource-${index + 1}.txt`),
          mimeType: String(resource.mimeType || 'text/plain'),
          sizeBytes: Number(resource.sizeBytes || 0),
          dataUrl: String(resource.dataUrl),
        }
      }
      const content = String(resource.content || resource.text || '')
      return {
        id: String(resource.id || `${lessonId}-res-${index + 1}`),
        title: String(resource.title || resource.fileName || `Resource ${index + 1}`),
        fileName: String(resource.fileName || `${lessonId}-resource-${index + 1}.txt`),
        mimeType: String(resource.mimeType || 'text/plain'),
        sizeBytes: Number(resource.sizeBytes || Buffer.byteLength(content, 'utf8')),
        dataUrl: toDataUrlFromText(content || `Resource ${index + 1}`, String(resource.mimeType || 'text/plain')),
      }
    })
    .filter(Boolean)

const getLessonCompletionGate = (lesson, playback = {}) => {
  if (lesson.type !== 'video') {
    return {
      canComplete: true,
      requiredProgressPercent: 0,
      reason: '',
    }
  }
  const progressPercent = Math.max(0, Math.min(100, Math.round(Number(playback.progressPercent || 0))))
  const canComplete = progressPercent >= VIDEO_COMPLETION_THRESHOLD_PERCENT || Boolean(playback.completedVideoAt)
  return {
    canComplete,
    requiredProgressPercent: VIDEO_COMPLETION_THRESHOLD_PERCENT,
    reason: canComplete ? '' : `Watch at least ${VIDEO_COMPLETION_THRESHOLD_PERCENT}% of the video before completing.`,
  }
}

const normalizeRanges = (ranges = [], durationSec = 0) => {
  const max = Math.max(0, Math.floor(Number(durationSec || 0)))
  const normalized = (Array.isArray(ranges) ? ranges : [])
    .map((row) => {
      const start = Math.max(0, Math.floor(Number(row?.start ?? row?.from ?? 0)))
      const end = Math.max(0, Math.floor(Number(row?.end ?? row?.to ?? 0)))
      const safeEnd = max > 0 ? Math.min(end, max) : end
      const safeStart = max > 0 ? Math.min(start, max) : start
      if (safeEnd <= safeStart) return null
      return { start: safeStart, end: safeEnd }
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start)

  const merged = []
  normalized.forEach((range) => {
    const last = merged[merged.length - 1]
    if (!last || range.start > last.end) {
      merged.push({ ...range })
      return
    }
    last.end = Math.max(last.end, range.end)
  })
  return merged
}

const sumRangeDuration = (ranges = []) =>
  normalizeRanges(ranges).reduce((sum, row) => sum + Math.max(0, row.end - row.start), 0)

const appendWatchedRange = (ranges = [], fromSec, toSec, durationSec) => {
  const start = Math.max(0, Math.floor(Number(fromSec || 0)))
  const end = Math.max(0, Math.floor(Number(toSec || 0)))
  if (end <= start) return normalizeRanges(ranges, durationSec)
  return normalizeRanges([...(Array.isArray(ranges) ? ranges : []), { start, end }], durationSec)
}

const defaultCourseCatalog = [
  {
    id: 'ui-101',
    title: 'UI Design Fundamentals',
    description: 'Dasar komposisi, warna, tipografi, dan hierarchy.',
    tag: 'Design',
    gradient: 'linear-gradient(120deg, #0081a7, #00afb9)',
    instructor: 'Ayu Pratama',
    modules: [
      {
        id: 'ui-101-m1',
        title: 'Foundations',
        lessons: [
          {
            id: 'ui-101-l1',
            title: 'Intro to Visual Hierarchy',
            duration: '12m',
            type: 'video',
            summary: 'Memahami prinsip hierarchy untuk layout yang mudah dipahami.',
            transcript: [
              { atSec: 8, text: 'Visual hierarchy membantu user menangkap informasi paling penting lebih dulu.' },
              { atSec: 36, text: 'Gunakan skala ukuran, kontras, dan posisi untuk memandu scanning pattern.' },
              { atSec: 74, text: 'Judul, subjudul, dan CTA harus punya prioritas visual yang jelas.' },
              { atSec: 108, text: 'Hierarchy yang baik menurunkan cognitive load di halaman dashboard.' },
            ],
            resources: ['Hierarchy Checklist.pdf', 'Reference Board.fig'],
          },
          {
            id: 'ui-101-l2',
            title: 'Typography Pairing',
            duration: '16m',
            type: 'video',
            summary: 'Kombinasi font headline-body untuk readability.',
            transcript: [
              { atSec: 12, text: 'Mulai dari satu font netral untuk body text yang mudah dibaca.' },
              { atSec: 48, text: 'Pasangkan display font seperlunya untuk heading, bukan untuk paragraf panjang.' },
              { atSec: 86, text: 'Pastikan rasio ukuran heading ke body konsisten di semua halaman.' },
              { atSec: 124, text: 'Gunakan line-height 1.4 sampai 1.6 untuk meningkatkan readability.' },
            ],
            resources: ['Type Scale Guide.pdf'],
          },
          {
            id: 'ui-101-l3',
            title: 'Color Contrast in UI',
            duration: '14m',
            type: 'video',
            summary: 'Praktik kontras warna agar aksesibel dan konsisten brand.',
            transcript: [
              { atSec: 10, text: 'Kontras bukan hanya soal estetika, tapi juga aksesibilitas.' },
              { atSec: 42, text: 'Untuk teks normal, targetkan rasio minimal 4.5 banding 1.' },
              { atSec: 79, text: 'State hover dan disabled juga perlu kontras yang tetap terbaca.' },
              { atSec: 112, text: 'Uji kombinasi warna pada latar terang dan gelap sebelum publish.' },
            ],
            resources: ['WCAG Contrast Card.pdf'],
          },
          {
            id: 'ui-101-l4',
            title: 'Grid and Spacing System',
            duration: '18m',
            type: 'workshop',
            summary: 'Membuat 8pt grid untuk desain yang rapi dan scalable.',
            resources: ['8pt Grid Template.fig'],
          },
        ],
      },
    ],
  },
  {
    id: 'fe-101',
    title: 'Frontend for Designer',
    description: 'HTML, CSS, dan Vue komponen untuk prototyping.',
    tag: 'Code',
    gradient: 'linear-gradient(120deg, #fb8500, #ffb703)',
    instructor: 'Rafi Nugraha',
    modules: [
      {
        id: 'fe-101-m1',
        title: 'HTML/CSS Core',
        lessons: [
          {
            id: 'fe-101-l1',
            title: 'Semantic HTML Basics',
            duration: '10m',
            type: 'video',
            summary: 'Struktur HTML yang benar untuk SEO dan aksesibilitas.',
            transcript: [
              { atSec: 9, text: 'Tag semantik membantu browser dan screen reader memahami struktur konten.' },
              { atSec: 34, text: 'Gunakan main hanya sekali, lalu susun section dan article sesuai konteks.' },
              { atSec: 61, text: 'Label pada input form wajib terhubung agar aksesibel.' },
              { atSec: 92, text: 'Semantic HTML mempermudah maintenance dan testing komponen.' },
            ],
            resources: ['Semantic Tag Cheat Sheet.pdf'],
          },
          {
            id: 'fe-101-l2',
            title: 'Responsive Layout with CSS Grid',
            duration: '20m',
            type: 'video',
            summary: 'Membangun layout adaptif untuk desktop dan mobile.',
            transcript: [
              { atSec: 15, text: 'Mulai dari grid 12 kolom agar fleksibel untuk banyak skenario layout.' },
              { atSec: 58, text: 'Gunakan minmax dan auto-fit untuk komponen card yang responsif.' },
              { atSec: 104, text: 'Breakpoint harus mengikuti konten, bukan sekadar ukuran device populer.' },
              { atSec: 151, text: 'Gabungkan grid dan container query untuk komponen modular.' },
            ],
            resources: ['Grid Playground.zip'],
          },
        ],
      },
    ],
  },
  {
    id: 'pm-101',
    title: 'Product Thinking',
    description: 'Menyusun roadmap fitur berbasis kebutuhan user.',
    tag: 'Product',
    gradient: 'linear-gradient(120deg, #8338ec, #3a86ff)',
    instructor: 'Nadia Putri',
    modules: [
      {
        id: 'pm-101-m1',
        title: 'Discovery',
        lessons: [
          {
            id: 'pm-101-l1',
            title: 'Problem Framing',
            duration: '11m',
            type: 'video',
            summary: 'Teknik menyusun problem statement berbasis user impact.',
            transcript: [
              { atSec: 11, text: 'Problem framing dimulai dari user pain yang nyata dan terukur.' },
              { atSec: 41, text: 'Pisahkan gejala dari akar masalah sebelum menentukan solusi.' },
              { atSec: 73, text: 'Tulis problem statement dengan format siapa, hambatan, dan dampaknya.' },
              { atSec: 98, text: 'Validasi framing lewat data perilaku user dan feedback lapangan.' },
            ],
            resources: ['Problem Framing Canvas.pdf'],
          },
          {
            id: 'pm-101-l2',
            title: 'Prioritization Matrix',
            duration: '15m',
            type: 'workshop',
            summary: 'Skoring impact vs effort untuk memilih prioritas fitur.',
            resources: ['Prioritization Matrix.xlsx'],
          },
        ],
      },
    ],
  },
]

const defaultQuizCatalog = [
  {
    id: 'ui-101',
    courseId: 'ui-101',
    moduleId: 'ui-101-m1',
    title: 'Quiz UI Design Fundamentals',
    description: 'Evaluasi pemahaman konsep visual hierarchy, typography, dan layout dasar.',
    passingScore: 70,
    maxAttempts: 3,
    timeLimitSec: 8 * 60,
    questions: [
      {
        id: 'q1',
        title: 'Apa fungsi utama visual hierarchy pada halaman dashboard?',
        options: [
          'Membuat elemen tampak penuh warna',
          'Mengatur prioritas informasi agar mudah dipindai',
          'Memastikan semua teks berukuran sama',
          'Menghapus kebutuhan navigation',
        ],
        correctIndex: 1,
        explanation: 'Hierarchy membantu user menemukan informasi paling penting lebih cepat.',
      },
      {
        id: 'q2',
        title: 'Komponen mana yang paling tepat untuk menampilkan progres belajar?',
        options: ['Modal dialog', 'Progress bar', 'Tooltip', 'Dropdown'],
        correctIndex: 1,
        explanation: 'Progress bar memberikan konteks visual yang jelas terhadap progres.',
      },
      {
        id: 'q3',
        title: 'Tujuan utama penggunaan grid system adalah...',
        options: ['Dekorasi layout', 'Konsistensi alignment dan spacing', 'Mengurangi warna', 'Memperbesar teks'],
        correctIndex: 1,
        explanation: 'Grid memastikan komponen tersusun rapi dan konsisten antar layar.',
      },
    ],
  },
  {
    id: 'ui-101-m1',
    courseId: 'ui-101',
    moduleId: 'ui-101-m1',
    title: 'Module Quiz: Foundations',
    description: 'Kuis cepat setelah modul Foundations selesai.',
    passingScore: 70,
    maxAttempts: 3,
    timeLimitSec: 6 * 60,
    questions: [
      {
        id: 'm1-q1',
        title: 'Prinsip hierarchy yang paling penting untuk halaman kursus adalah...',
        options: ['Kontras ukuran', 'Semua elemen setara', 'Random alignment', 'Warna neon'],
        correctIndex: 0,
        explanation: 'Kontras ukuran dan visual weight membantu prioritas konten.',
      },
      {
        id: 'm1-q2',
        title: 'Tujuan typography pairing adalah...',
        options: ['Agar font terlihat unik', 'Meningkatkan readability', 'Menghemat warna', 'Menaikkan SEO'],
        correctIndex: 1,
        explanation: 'Typography pairing yang tepat memudahkan membaca konten.',
      },
    ],
  },
  {
    id: 'fe-101-m1',
    courseId: 'fe-101',
    moduleId: 'fe-101-m1',
    title: 'Module Quiz: HTML/CSS Core',
    description: 'Validasi dasar semantic HTML dan responsive layout.',
    passingScore: 70,
    maxAttempts: 3,
    timeLimitSec: 6 * 60,
    questions: [
      {
        id: 'fe-q1',
        title: 'Tag semantic yang tepat untuk area navigasi adalah...',
        options: ['<div>', '<nav>', '<span>', '<article>'],
        correctIndex: 1,
        explanation: 'Tag <nav> digunakan untuk kumpulan link navigasi utama.',
      },
      {
        id: 'fe-q2',
        title: 'CSS Grid berguna untuk...',
        options: ['Menyimpan data', 'Menyusun layout 2D', 'Memanggil API', 'Membuat state global'],
        correctIndex: 1,
        explanation: 'Grid cocok untuk layout baris-kolom yang kompleks.',
      },
    ],
  },
  {
    id: 'pm-101-m1',
    courseId: 'pm-101',
    moduleId: 'pm-101-m1',
    title: 'Module Quiz: Discovery',
    description: 'Uji pemahaman problem framing dan prioritization matrix.',
    passingScore: 70,
    maxAttempts: 3,
    timeLimitSec: 6 * 60,
    questions: [
      {
        id: 'pm-q1',
        title: 'Problem statement sebaiknya berfokus pada...',
        options: ['Fitur internal', 'Outcome pengguna', 'Pilihan warna produk', 'Brand slogan'],
        correctIndex: 1,
        explanation: 'Problem statement yang baik menekankan impact bagi user.',
      },
      {
        id: 'pm-q2',
        title: 'Prioritization matrix mengevaluasi...',
        options: ['Mood tim', 'Impact vs effort', 'Jumlah slide presentasi', 'Durasi meeting'],
        correctIndex: 1,
        explanation: 'Framework ini dipakai untuk menentukan prioritas implementasi fitur.',
      },
    ],
  },
]

const loginSchema = z
  .object({
    email: z.string().email().max(160),
    password: z.string().min(6).max(128),
  })
  .strict()

const profileAccountPatchSchema = z
  .object({
    name: z.string().min(1).max(90).optional(),
    email: z.string().email().max(160).optional(),
    role: z.string().min(1).max(90).optional(),
    accessRole: z.enum(roles).optional(),
    timezone: z.string().min(1).max(80).optional(),
    avatarDataUrl: z.string().max(2_200_000).optional(),
    bio: z.string().max(400).optional(),
  })
  .strict()

const profilePreferencesPatchSchema = z
  .object({
    deadlineNotif: z.boolean().optional(),
    discussionNotif: z.boolean().optional(),
    productUpdateNotif: z.boolean().optional(),
    language: z.string().min(2).max(10).optional(),
    themeId: z.string().min(1).max(30).optional(),
  })
  .strict()

const profileStateSchema = z
  .object({
    profile: z.object({
      name: z.string().min(1).max(90),
      email: z.string().email().max(160),
      role: z.string().min(1).max(90),
      accessRole: z.enum(roles),
      timezone: z.string().min(1).max(80),
      avatarDataUrl: z.string().max(2_200_000),
      bio: z.string().max(400),
    }),
    preferences: z.object({
      deadlineNotif: z.boolean(),
      discussionNotif: z.boolean(),
      productUpdateNotif: z.boolean(),
      language: z.string().min(2).max(10),
      themeId: z.string().min(1).max(30),
    }),
    stats: z.object({
      streakDays: z.number().min(0).max(9999),
      coursesCompleted: z.number().min(0).max(9999),
      learningHours: z.number().min(0).max(999999),
    }),
    certificates: z.array(
      z.object({
        title: z.string().max(120),
        issuedAt: z.string().max(40),
        courseId: z.string().max(90).optional(),
        courseTitle: z.string().max(220).optional(),
        recipientUserId: z.string().max(90).optional(),
        certificateNo: z.string().max(40).optional(),
        verificationCode: z.string().max(120).optional(),
        templateId: z.string().max(90).optional(),
        status: z.enum(['issued', 'revoked', 'expired']).optional(),
      }),
    ),
    badges: z.array(z.string().max(60)),
    progressMetrics: z.array(z.object({ label: z.string().max(80), value: z.number().min(0).max(100) })),
  })
  .strict()

const permissionMatrixSchema = z
  .object({
    admin: z.object({
      viewDashboard: z.boolean(),
      manageCourse: z.boolean(),
      manageQuiz: z.boolean(),
      manageUsers: z.boolean(),
    }),
    instructor: z.object({
      viewDashboard: z.boolean(),
      manageCourse: z.boolean(),
      manageQuiz: z.boolean(),
      manageUsers: z.boolean(),
    }),
    student: z.object({
      viewDashboard: z.boolean(),
      manageCourse: z.boolean(),
      manageQuiz: z.boolean(),
      manageUsers: z.boolean(),
    }),
  })
  .strict()

const userSaveSchema = z
  .object({
    id: z.string().min(1).max(40).optional(),
    name: z.string().min(1).max(90),
    email: z.string().email().max(160),
    role: z.enum(roles),
    status: z.enum(statuses),
  })
  .strict()

const userInviteSchema = z
  .object({
    name: z.string().min(1).max(90),
    email: z.string().email().max(160),
    role: z.enum(roles),
  })
  .strict()

const idsSchema = z
  .object({
    ids: z.array(z.string().min(1)).max(300),
  })
  .strict()

const bulkStatusSchema = z
  .object({
    ids: z.array(z.string().min(1)).max(300),
    status: z.enum(statuses),
  })
  .strict()

const passwordUpdateSchema = z
  .object({
    currentPassword: z.string().min(6).max(128),
    newPassword: z.string().min(8).max(128),
  })
  .strict()

const discussionCreateSchema = z
  .object({
    message: z.string().min(2).max(600),
    parentId: z.string().min(1).max(80).nullable().optional(),
  })
  .strict()

const discussionUpdateSchema = z
  .object({
    message: z.string().min(2).max(600),
  })
  .strict()

const assignmentSubmissionSchema = z
  .object({
    linkUrl: z.string().url().max(500).optional().or(z.literal('')),
    notes: z.string().max(4000).optional(),
    attachmentName: z.string().max(180).optional().or(z.literal('')),
    attachmentDataUrl: z.string().max(2_200_000).optional().or(z.literal('')),
    attachmentId: z.string().min(1).max(80).optional().or(z.literal('')),
  })
  .strict()

const assignmentReviewSchema = z
  .object({
    status: z.enum(['revised', 'graded']),
    feedback: z.string().max(4000).optional(),
    rubricScores: z
      .array(
        z
          .object({
            criterionId: z.string().min(1).max(80),
            score: z.number().min(0).max(100),
            comment: z.string().max(400).optional(),
          })
          .strict(),
      )
      .max(30)
      .optional(),
  })
  .strict()

const assignmentConfigSchema = z
  .object({
    dueAt: z.string().datetime().nullable().optional(),
    graceMinutes: z.number().int().min(0).max(60 * 24 * 14).optional(),
  })
  .strict()

const lessonPlaybackSchema = z
  .object({
    positionSec: z.number().min(0).max(24 * 60 * 60),
    durationSec: z.number().min(0).max(24 * 60 * 60).optional(),
    markCompleted: z.boolean().optional(),
  })
  .strict()

const lessonNoteCreateSchema = z
  .object({
    timestampSec: z.number().min(0).max(24 * 60 * 60),
    note: z.string().min(1).max(400),
  })
  .strict()

const lessonNoteUpdateSchema = z
  .object({
    note: z.string().min(1).max(400),
  })
  .strict()

const modulePrerequisiteSchema = z
  .object({
    mode: z.enum(['all', 'any']).optional(),
    rules: z
      .array(
        z
          .object({
            type: z.enum(['module-complete', 'module-quiz-pass', 'lesson-complete']),
            moduleId: z.string().min(1).max(80).optional(),
            lessonId: z.string().min(1).max(80).optional(),
          })
          .strict(),
      )
      .max(12)
      .optional(),
  })
  .strict()

const uploadCreateSchema = z
  .object({
    fileName: z.string().min(1).max(180),
    dataUrl: z.string().min(30).max(2_900_000),
    purpose: z.enum(['assignment']).optional(),
  })
  .strict()

const quizSessionStartSchema = z
  .object({
    retake: z.boolean().optional(),
  })
  .strict()

const quizSubmitSchema = z
  .object({
    sessionId: z.string().min(1).max(100),
    answers: z.record(z.string(), z.string()).optional(),
    forced: z.boolean().optional(),
  })
  .strict()

const quizQuestionSchema = z
  .object({
    id: z.string().min(1).max(80),
    title: z.string().min(6).max(400),
    options: z.array(z.string().min(1).max(220)).min(2).max(6),
    correctIndex: z.number().int().min(0).max(5),
    explanation: z.string().max(400).optional(),
  })
  .strict()

const quizSaveSchema = z
  .object({
    id: z.string().min(1).max(80).optional(),
    courseId: z.string().min(1).max(80),
    moduleId: z.string().min(1).max(80),
    title: z.string().min(3).max(180),
    description: z.string().min(3).max(500),
    passingScore: z.number().int().min(0).max(100),
    maxAttempts: z.number().int().min(1).max(20),
    timeLimitSec: z.number().int().min(60).max(60 * 60 * 4),
    status: z.enum(['draft', 'published']).optional(),
    questions: z.array(quizQuestionSchema).min(1).max(60),
  })
  .strict()

const quizStatusSchema = z
  .object({
    status: z.enum(['draft', 'published']),
  })
  .strict()

const quizBulkStatusSchema = z
  .object({
    ids: z.array(z.string().min(1)).max(300),
    status: z.enum(['draft', 'published']),
  })
  .strict()

const telemetryEventSchema = z
  .object({
    domain: z.string().min(2).max(80),
    action: z.string().min(2).max(120),
    severity: z.enum(['info', 'warning', 'error']).optional(),
    message: z.string().max(500).optional(),
    context: z
      .object({
        feature: z.string().max(120).optional(),
        courseId: z.string().max(120).optional(),
        operation: z.string().max(120).optional(),
      })
      .passthrough()
      .optional(),
    meta: z.record(z.string(), z.any()).optional(),
  })
  .strict()

const notificationChannelConfigSchema = z
  .object({
    webhookEnabled: z.boolean(),
    webhookUrl: z.string().max(1500).optional().or(z.literal('')),
    emailEnabled: z.boolean(),
    emailFrom: z.string().max(220).optional().or(z.literal('')),
  })
  .strict()

const notificationTestDeliverySchema = z
  .object({
    channel: z.enum(['webhook', 'email']),
    message: z.string().min(1).max(500),
  })
  .strict()

const webhookIngestSchema = z
  .object({
    event: z.string().min(1).max(200),
    message: z.string().max(500).optional(),
    courseId: z.string().max(90).optional(),
    meta: z.record(z.string(), z.any()).optional(),
  })
  .strict()

const courseManagementPermissionSchema = z
  .object({
    view: z.boolean(),
    create: z.boolean(),
    edit: z.boolean(),
    delete: z.boolean(),
    publish: z.boolean(),
    schedule: z.boolean(),
    bulk: z.boolean(),
    importExport: z.boolean(),
    history: z.boolean(),
    duplicate: z.boolean(),
    restoreRevision: z.boolean(),
    managePermissions: z.boolean(),
  })
  .strict()

const courseManagementPermissionMatrixSchema = z
  .object({
    admin: courseManagementPermissionSchema,
    instructor: courseManagementPermissionSchema,
    student: courseManagementPermissionSchema,
  })
  .strict()

const courseManagementStatusValues = ['draft', 'scheduled', 'published', 'archived']
const courseManagementLessonTypeValues = ['video', 'article', 'quiz', 'assignment', 'live']
const courseManagementCompletionModes = ['lesson', 'module', 'hybrid']
const courseManagementLevels = ['beginner', 'intermediate', 'advanced']
const courseManagementVisibilityValues = ['public', 'private', 'invite-only']
const certificateTemplateStatusValues = ['draft', 'in_review', 'published', 'archived']
const certificateTemplateThemeValues = ['aurora', 'sunrise', 'minimal']
const certificateIssuanceStatusValues = ['issued', 'revoked', 'expired']

const courseManagementAssetSchema = z
  .object({
    id: z.string().min(1).max(90),
    name: z.string().max(220),
    type: z.enum(['file', 'video', 'link']),
    url: z.string().max(1500).optional().or(z.literal('')),
    sizeBytes: z.number().int().min(0).max(1_000_000_000).optional(),
    version: z.number().int().min(1).max(10_000).optional(),
    versions: z
      .array(
        z
          .object({
            version: z.number().int().min(1).max(10_000),
            note: z.string().max(300).optional(),
            url: z.string().max(1500).optional(),
            updatedAt: z.string().max(80).optional(),
          })
          .strict(),
      )
      .max(100)
      .optional(),
    updatedAt: z.string().max(80).optional(),
  })
  .strict()

const courseManagementLessonSchema = z
  .object({
    id: z.string().min(1).max(90),
    title: z.string().max(220),
    type: z.enum(courseManagementLessonTypeValues),
    durationMin: z.number().int().min(1).max(24 * 60),
    isPreview: z.boolean().optional(),
    isLocked: z.boolean().optional(),
    contentUrl: z.string().max(1500).optional().or(z.literal('')),
  })
  .strict()

const courseManagementModuleSchema = z
  .object({
    id: z.string().min(1).max(90),
    title: z.string().max(220),
    description: z.string().max(3000).optional().or(z.literal('')),
    lessons: z.array(courseManagementLessonSchema).min(1).max(300),
  })
  .strict()

const courseManagementSettingsSchema = z
  .object({
    completionMode: z.enum(courseManagementCompletionModes),
    completionThresholdPercent: z.number().int().min(1).max(100),
    certificateEnabled: z.boolean(),
    certificateTemplate: z.string().max(100),
    allowRetake: z.boolean(),
    maxRetake: z.number().int().min(0).max(200),
    allowProgressReset: z.boolean(),
    prerequisiteMode: z.enum(['all', 'any']).optional(),
    prerequisiteCourseIds: z.array(z.string().min(1).max(90)).max(120).optional(),
    enrollmentCap: z.number().int().min(0).max(2_000_000).optional(),
    estimatedHours: z.number().min(0).max(20_000).optional(),
    approvalRequired: z.boolean().optional(),
    approvalStatus: z.enum(['draft', 'in_review', 'approved', 'rejected']).optional(),
    approverUserIds: z.array(z.string().min(1).max(90)).max(120).optional(),
    enrollmentStartAt: z.string().max(80).optional().or(z.literal('')),
    enrollmentEndAt: z.string().max(80).optional().or(z.literal('')),
    waitlistEnabled: z.boolean().optional(),
    priceUsd: z.number().min(0).max(10_000_000).optional(),
    cohortLabel: z.string().max(120).optional().or(z.literal('')),
    tags: z.array(z.string().min(1).max(60)).max(120).optional(),
    ownerUserIds: z.array(z.string().min(1).max(90)).max(120).optional(),
    editorUserIds: z.array(z.string().min(1).max(90)).max(120).optional(),
    releaseVersion: z.string().max(60).optional(),
    releaseChannel: z.enum(['stable', 'beta', 'internal']).optional(),
    locales: z.array(z.string().min(2).max(10)).max(20).optional(),
    localeFallback: z.string().max(10).optional(),
    localizedContent: z.record(z.string(), z.object({ title: z.string().max(220).optional(), description: z.string().max(5000).optional() })).optional(),
    complianceRetentionDays: z.number().int().min(30).max(3650).optional(),
  })
  .strict()

const courseManagementAuditEntrySchema = z
  .object({
    id: z.string().max(120).optional(),
    action: z.string().max(120).optional(),
    detail: z.string().max(500).optional(),
    createdAt: z.string().max(80).optional(),
  })
  .strict()

const courseManagementSaveSchema = z
  .object({
    id: z.string().min(1).max(90).optional(),
    version: z.number().int().min(1).max(1_000_000).optional(),
    title: z.string().min(1).max(220),
    slug: z.string().min(1).max(220),
    description: z.string().max(5000).optional().or(z.literal('')),
    thumbnail: z.string().max(1500).optional().or(z.literal('')),
    category: z.string().max(120).optional(),
    level: z.enum(courseManagementLevels).optional(),
    language: z.string().max(32).optional(),
    visibility: z.enum(courseManagementVisibilityValues).optional(),
    status: z.enum(courseManagementStatusValues).optional(),
    publishAt: z.string().max(80).optional().or(z.literal('')),
    unpublishAt: z.string().max(80).optional().or(z.literal('')),
    modules: z.array(courseManagementModuleSchema).min(1).max(200),
    assets: z.array(courseManagementAssetSchema).max(1000).optional(),
    settings: courseManagementSettingsSchema,
    auditTrail: z.array(courseManagementAuditEntrySchema).max(200).optional(),
    createdAt: z.string().max(80).optional(),
    updatedAt: z.string().max(80).optional(),
  })
  .strict()

const courseManagementStatusPatchSchema = z
  .object({
    status: z.enum(courseManagementStatusValues),
    version: z.number().int().min(1).max(1_000_000).optional(),
  })
  .strict()

const courseManagementJobCreateSchema = z
  .object({
    type: z.enum(['bulk-status', 'bulk-delete', 'bulk-auto-prerequisite', 'bulk-clear-prerequisite']),
    ids: z.array(z.string().min(1).max(90)).min(1).max(300),
    statusValue: z.enum(courseManagementStatusValues).optional(),
  })
  .strict()

const certificateTemplateSaveSchema = z
  .object({
    id: z.string().min(1).max(90).optional().or(z.literal('')),
    title: z.string().min(1).max(220),
    subtitle: z.string().max(400).optional().or(z.literal('')),
    bodyText: z.string().max(5000).optional().or(z.literal('')),
    status: z.enum(certificateTemplateStatusValues).optional(),
    courseId: z.string().min(1).max(90),
    passingScore: z.number().min(0).max(100).optional(),
    validityDays: z.number().int().min(1).max(3650).optional(),
    certificatePrefix: z.string().min(1).max(16).optional(),
    signerName: z.string().max(120).optional().or(z.literal('')),
    signerTitle: z.string().max(120).optional().or(z.literal('')),
    autoIssue: z.boolean().optional(),
    theme: z.enum(certificateTemplateThemeValues).optional(),
    createdAt: z.string().max(80).optional(),
    updatedAt: z.string().max(80).optional(),
  })
  .strict()

const certificateIssueSchema = z
  .object({
    templateId: z.string().min(1).max(90),
    courseId: z.string().min(1).max(90).optional().or(z.literal('')),
    recipientUserId: z.string().min(1).max(90),
    score: z.number().min(0).max(100).nullable().optional(),
  })
  .strict()

const certificateRevokeSchema = z
  .object({
    reason: z.string().trim().min(3).max(300),
  })
  .strict()

const certificateBulkIssueSchema = z
  .object({
    templateId: z.string().min(1).max(90),
    courseId: z.string().min(1).max(90).optional().or(z.literal('')),
    recipientUserIds: z.array(z.string().min(1).max(90)).min(1).max(300),
    score: z.number().min(0).max(100).nullable().optional(),
  })
  .strict()

const createDefaultProfileState = (user) => ({
  profile: {
    name: user.name,
    email: user.email,
    role: accessLevels[user.role] || user.role,
    accessRole: user.role,
    timezone: 'Asia/Jakarta',
    avatarDataUrl: '',
    bio: 'Belajar design systems dan frontend untuk membangun pengalaman belajar yang menarik.',
  },
  preferences: {
    deadlineNotif: true,
    discussionNotif: true,
    productUpdateNotif: false,
    language: 'id',
    themeId: 'aurora',
  },
  stats: {
    streakDays: 12,
    coursesCompleted: 7,
    learningHours: 146,
  },
  certificates: [
    { title: 'UI Design Fundamentals', issuedAt: '12 Feb 2026' },
    { title: 'UX Research Essentials', issuedAt: '18 Jan 2026' },
  ],
  badges: ['Streak 12 Days', 'Quiz Master', 'Mentor Choice'],
  progressMetrics: [
    { label: 'Design Track', value: 78 },
    { label: 'Frontend Track', value: 62 },
    { label: 'Product Track', value: 83 },
  ],
})

const deepClone = (value) => JSON.parse(JSON.stringify(value))
const buildWebhookSignature = (secret, timestamp, bodyText) => {
  const normalizedSecret = String(secret || '')
  if (!normalizedSecret) return ''
  const normalizedTimestamp = String(timestamp || '')
  const normalizedBody = String(bodyText || '')
  const digest = createHmac('sha256', normalizedSecret).update(`${normalizedTimestamp}.${normalizedBody}`).digest('hex')
  return `v1=${digest}`
}
const parseWebhookTimestampMs = (rawValue) => {
  const raw = String(rawValue || '').trim()
  if (!raw) return Number.NaN
  const numeric = Number(raw)
  if (Number.isFinite(numeric)) {
    if (numeric > 10_000_000_000) return Math.floor(numeric)
    if (numeric > 1_000_000_000) return Math.floor(numeric * 1000)
  }
  const isoParsed = Date.parse(raw)
  return Number.isFinite(isoParsed) ? isoParsed : Number.NaN
}
const secureTextEqual = (a, b) => {
  const left = Buffer.from(String(a || ''), 'utf8')
  const right = Buffer.from(String(b || ''), 'utf8')
  if (!left.length || !right.length || left.length !== right.length) return false
  return timingSafeEqual(left, right)
}
const verifyImmutableAuditChain = (items = []) => {
  const chain = Array.isArray(items) ? items : []
  let brokenAt = -1
  for (let index = 0; index < chain.length; index += 1) {
    const item = chain[index]
    const seed = {
      id: item.id,
      actor: String(item.actor || ''),
      action: String(item.action || ''),
      target: String(item.target || ''),
      detail: String(item.detail || ''),
      timestamp: String(item.timestamp || ''),
      prevHash: String(item.prevHash || ''),
    }
    const expectedHash = createHash('sha256').update(JSON.stringify(seed)).digest('hex')
    if (expectedHash !== item.hash) {
      brokenAt = index
      break
    }
    if (index > 0 && item.prevHash !== chain[index - 1].hash) {
      brokenAt = index
      break
    }
  }
  return {
    ok: brokenAt < 0,
    brokenAt,
    total: chain.length,
    lastHash: chain[0]?.hash || '',
  }
}
const normalizeEmail = (value) => String(value || '').trim().toLowerCase()
const toSlug = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
const toCertificateCode = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
const hasDuplicate = (values = []) => {
  const set = new Set()
  for (const item of values) {
    const value = String(item || '').trim()
    if (!value) continue
    if (set.has(value)) return true
    set.add(value)
  }
  return false
}
const buildCourseManagementDependencyIndex = (courses = []) => {
  const map = {}
  courses.forEach((course) => {
    map[course.id] = Array.isArray(course?.settings?.prerequisiteCourseIds) ? course.settings.prerequisiteCourseIds : []
  })
  return map
}
const findDependencyCycle = (startId, dependencyById = {}) => {
  const visiting = new Set()
  const visited = new Set()
  const path = []
  const dfs = (courseId) => {
    if (visiting.has(courseId)) {
      const idx = path.indexOf(courseId)
      if (idx >= 0) return [...path.slice(idx), courseId]
      return [courseId, courseId]
    }
    if (visited.has(courseId)) return null
    visiting.add(courseId)
    path.push(courseId)
    for (const depId of dependencyById[courseId] || []) {
      const cycle = dfs(depId)
      if (cycle) return cycle
    }
    path.pop()
    visiting.delete(courseId)
    visited.add(courseId)
    return null
  }
  return dfs(startId) || null
}
const normalizeCourseManagementPermissionMatrix = (matrix) => {
  const fallback = defaultCourseManagementPermissionMatrix
  const rolesList = ['admin', 'instructor', 'student']
  return Object.fromEntries(
    rolesList.map((role) => {
      const base = fallback[role]
      const source = matrix?.[role] || {}
      return [
        role,
        {
          view: Boolean(source.view ?? base.view),
          create: Boolean(source.create ?? base.create),
          edit: Boolean(source.edit ?? base.edit),
          delete: Boolean(source.delete ?? base.delete),
          publish: Boolean(source.publish ?? base.publish),
          schedule: Boolean(source.schedule ?? base.schedule),
          bulk: Boolean(source.bulk ?? base.bulk),
          importExport: Boolean(source.importExport ?? base.importExport),
          history: Boolean(source.history ?? base.history),
          duplicate: Boolean(source.duplicate ?? base.duplicate),
          restoreRevision: Boolean(source.restoreRevision ?? base.restoreRevision),
          managePermissions: Boolean(source.managePermissions ?? base.managePermissions),
        },
      ]
    }),
  )
}
const getCourseManagementPermissionsForUser = (db, user) => {
  const matrix = normalizeCourseManagementPermissionMatrix(db?.courseManagementPermissions)
  return matrix[user?.role] || matrix.student
}
const canManageCertificateRole = (db, user) => user?.role === 'admin' || user?.role === 'instructor' || canReviewAssignmentRole(db, user)

const normalizeCertificatePrefix = (value) => {
  const prefix = String(value || 'CRT')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 12)
  return prefix || 'CRT'
}

const normalizeCertificateTemplatePayload = (payload, existing = null) => {
  const nowIso = new Date().toISOString()
  return {
    id: String(payload?.id || existing?.id || '').trim(),
    title: String(payload?.title || existing?.title || '').trim(),
    subtitle: String(payload?.subtitle || existing?.subtitle || '').trim(),
    bodyText: String(payload?.bodyText || existing?.bodyText || '').trim(),
    status: certificateTemplateStatusValues.includes(String(payload?.status || existing?.status || 'draft'))
      ? String(payload?.status || existing?.status || 'draft')
      : 'draft',
    courseId: String(payload?.courseId || existing?.courseId || '').trim(),
    passingScore: Math.max(0, Math.min(100, Number(payload?.passingScore ?? existing?.passingScore ?? 70))),
    validityDays: Math.max(1, Math.min(3650, Number(payload?.validityDays ?? existing?.validityDays ?? 365))),
    certificatePrefix: normalizeCertificatePrefix(payload?.certificatePrefix || existing?.certificatePrefix || 'CRT'),
    signerName: String(payload?.signerName || existing?.signerName || '').trim(),
    signerTitle: String(payload?.signerTitle || existing?.signerTitle || '').trim(),
    autoIssue: Boolean(payload?.autoIssue ?? existing?.autoIssue ?? true),
    theme: certificateTemplateThemeValues.includes(String(payload?.theme || existing?.theme || 'aurora'))
      ? String(payload?.theme || existing?.theme || 'aurora')
      : 'aurora',
    createdAt: existing?.createdAt || payload?.createdAt || nowIso,
    updatedAt: payload?.updatedAt || nowIso,
  }
}

const createIssuedCertificateRecord = (db, { template, courseId, recipient, score, issuedBy }) => {
  const issueSeq = Math.max(1, Number(db?.certificateCounters?.issuance || 1))
  const certSeq = Math.max(1, Number(db?.certificateCounters?.certificate || 1))
  const certificateNo = `${normalizeCertificatePrefix(template.certificatePrefix)}-${String(certSeq).padStart(6, '0')}`
  const verificationCode = toCertificateCode(`${certificateNo}-${Math.random().toString(36).slice(2, 8)}`)
  const issuedAt = new Date().toISOString()
  const expiresAt = new Date(Date.now() + Math.max(1, Number(template.validityDays || 365)) * 24 * 60 * 60 * 1000).toISOString()
  const issued = normalizeCertificateIssuancePayload({
    id: `certiss-${String(issueSeq).padStart(5, '0')}`,
    templateId: template.id,
    templateTitle: template.title,
    courseId,
    courseTitle: getCourseTitleForCertificate(db, courseId),
    recipientUserId: recipient.id,
    recipientName: recipient.name,
    recipientEmail: recipient.email,
    certificateNo,
    verificationCode,
    issuedAt,
    expiresAt,
    status: 'issued',
    score: Number.isFinite(Number(score)) ? Number(score) : null,
    issuedBy: {
      id: issuedBy?.id || '',
      name: issuedBy?.name || issuedBy?.email || 'Instructor',
      email: issuedBy?.email || '',
    },
  })
  db.certificateCounters.issuance = issueSeq + 1
  db.certificateCounters.certificate = certSeq + 1
  return issued
}

const normalizeCertificateIssuancePayload = (payload) => ({
  id: String(payload?.id || '').trim(),
  templateId: String(payload?.templateId || '').trim(),
  templateTitle: String(payload?.templateTitle || '').trim(),
  courseId: String(payload?.courseId || '').trim(),
  courseTitle: String(payload?.courseTitle || '').trim(),
  recipientUserId: String(payload?.recipientUserId || '').trim(),
  recipientName: String(payload?.recipientName || '').trim(),
  recipientEmail: normalizeEmail(payload?.recipientEmail || ''),
  certificateNo: String(payload?.certificateNo || '').trim().toUpperCase(),
  verificationCode: toCertificateCode(payload?.verificationCode || ''),
  issuedAt: String(payload?.issuedAt || '').trim(),
  expiresAt: payload?.expiresAt ? String(payload.expiresAt) : null,
  status: certificateIssuanceStatusValues.includes(String(payload?.status || 'issued')) ? String(payload.status || 'issued') : 'issued',
  score: Number.isFinite(Number(payload?.score)) ? Math.max(0, Math.min(100, Number(payload.score))) : null,
  issuedBy: payload?.issuedBy && typeof payload.issuedBy === 'object'
    ? {
        id: String(payload.issuedBy.id || ''),
        name: String(payload.issuedBy.name || ''),
        email: String(payload.issuedBy.email || ''),
      }
    : null,
  revokedAt: payload?.revokedAt ? String(payload.revokedAt) : null,
  revokedReason: String(payload?.revokedReason || '').trim(),
})

const getCourseTitleForCertificate = (db, courseId) => {
  const id = String(courseId || '').trim()
  if (!id) return '-'
  const managed = (Array.isArray(db?.courseManagement) ? db.courseManagement : []).find((item) => item.id === id)
  if (managed?.title) return String(managed.title)
  const runtime = (Array.isArray(db?.courses) ? db.courses : []).find((item) => item.id === id)
  return runtime?.title || id
}

const resolveCertificateStatus = (issuance) => {
  if (issuance?.status === 'revoked') return 'revoked'
  const expiresAtMs = issuance?.expiresAt ? Date.parse(issuance.expiresAt) : Number.NaN
  if (Number.isFinite(expiresAtMs) && Date.now() > expiresAtMs) return 'expired'
  return 'issued'
}

const findCertificateRecipientUser = (db, { recipientUserId, recipientEmail, recipientName }) => {
  const users = Array.isArray(db?.users) ? db.users : []
  const userId = String(recipientUserId || '').trim()
  if (userId) {
    const byId = users.find((user) => user.id === userId)
    if (byId) return byId
  }
  const email = normalizeEmail(recipientEmail || '')
  if (email) {
    const byEmail = users.find((user) => normalizeEmail(user.email) === email)
    if (byEmail) return byEmail
  }
  const name = String(recipientName || '')
    .trim()
    .toLowerCase()
  if (!name) return null
  const matches = users.filter((user) => String(user.name || '').trim().toLowerCase() === name)
  if (matches.length === 1) return matches[0]
  return null
}

const syncIssuedCertificateToProfile = (db, issued) => {
  const recipient = findCertificateRecipientUser(db, {
    recipientUserId: issued?.recipientUserId,
    recipientEmail: issued?.recipientEmail,
    recipientName: issued?.recipientName,
  })
  if (!recipient?.id) return null
  const currentState = db.profiles?.[recipient.id] || createDefaultProfileState(recipient)
  const nextCertificatesRaw = Array.isArray(currentState.certificates) ? currentState.certificates.slice() : []
  const item = {
    title: String(issued?.courseTitle || issued?.templateTitle || 'Certificate'),
    issuedAt: nowStamp(),
    courseId: String(issued?.courseId || ''),
    courseTitle: String(issued?.courseTitle || ''),
    recipientUserId: String(recipient?.id || issued?.recipientUserId || ''),
    certificateNo: String(issued?.certificateNo || ''),
    verificationCode: String(issued?.verificationCode || ''),
    templateId: String(issued?.templateId || ''),
    status: resolveCertificateStatus(issued),
  }
  const deduped = nextCertificatesRaw.filter((row) => String(row?.certificateNo || '') !== item.certificateNo)
  const nextState = {
    ...currentState,
    certificates: [item, ...deduped].slice(0, 60),
  }
  const previousExists = nextCertificatesRaw.some((row) => String(row?.certificateNo || '') === item.certificateNo)
  if (!previousExists) {
    const currentCompleted = Math.max(0, Number(nextState?.stats?.coursesCompleted || 0))
    nextState.stats = {
      ...(nextState.stats || {}),
      coursesCompleted: currentCompleted + 1,
    }
  }
  const issuedCount = (Array.isArray(nextState.certificates) ? nextState.certificates : []).filter(
    (row) => String(row?.status || 'issued') !== 'revoked',
  ).length
  const badgeSet = new Set((Array.isArray(nextState.badges) ? nextState.badges : []).map((row) => String(row || '').trim()).filter(Boolean))
  if (issuedCount > 0) badgeSet.add('Certificate Earner')
  if (issuedCount >= 3) badgeSet.add('Certified Learner')
  if (issuedCount <= 0) badgeSet.delete('Certificate Earner')
  if (issuedCount < 3) badgeSet.delete('Certified Learner')
  nextState.badges = [...badgeSet]
  db.profiles[recipient.id] = nextState
  return recipient
}
const buildCourseRevisionEntry = (course, action, actor) => ({
  id: `rev-${Math.random().toString(36).slice(2, 10)}`,
  action: String(action || 'updated'),
  actor: String(actor || 'system'),
  createdAt: new Date().toISOString(),
  version: Math.max(1, Number(course?.version || 1)),
  snapshot: deepClone({
    ...course,
    revisions: [],
  }),
})
const normalizeCourseManagementPayload = (payload) => {
  const nowIso = new Date().toISOString()
  const modules = (Array.isArray(payload.modules) ? payload.modules : []).map((module) => ({
    id: String(module.id || ''),
    title: String(module.title || ''),
    description: String(module.description || ''),
    lessons: (Array.isArray(module.lessons) ? module.lessons : []).map((lesson) => ({
      id: String(lesson.id || ''),
      title: String(lesson.title || ''),
      type: String(lesson.type || 'video'),
      durationMin: Math.max(1, Number(lesson.durationMin || 1)),
      isPreview: Boolean(lesson.isPreview),
      isLocked: Boolean(lesson.isLocked),
      contentUrl: String(lesson.contentUrl || ''),
    })),
  }))
  const settings = {
    completionMode: courseManagementCompletionModes.includes(payload?.settings?.completionMode) ? payload.settings.completionMode : 'lesson',
    completionThresholdPercent: Math.min(100, Math.max(1, Number(payload?.settings?.completionThresholdPercent || 100))),
    certificateEnabled: Boolean(payload?.settings?.certificateEnabled ?? true),
    certificateTemplate: String(payload?.settings?.certificateTemplate || 'default'),
    allowRetake: Boolean(payload?.settings?.allowRetake ?? true),
    maxRetake: Math.max(0, Number(payload?.settings?.maxRetake ?? 3)),
    allowProgressReset: Boolean(payload?.settings?.allowProgressReset ?? false),
    prerequisiteMode: payload?.settings?.prerequisiteMode === 'any' ? 'any' : 'all',
    prerequisiteCourseIds: [...new Set((payload?.settings?.prerequisiteCourseIds || []).map((id) => String(id || '').trim()).filter(Boolean))],
    enrollmentCap: Math.max(0, Number(payload?.settings?.enrollmentCap || 0)),
    estimatedHours: Math.max(0, Number(payload?.settings?.estimatedHours || 0)),
    approvalRequired: Boolean(payload?.settings?.approvalRequired ?? false),
    approvalStatus: ['draft', 'in_review', 'approved', 'rejected'].includes(payload?.settings?.approvalStatus) ? payload.settings.approvalStatus : 'draft',
    approverUserIds: [...new Set((payload?.settings?.approverUserIds || []).map((id) => String(id || '').trim()).filter(Boolean))],
    enrollmentStartAt: String(payload?.settings?.enrollmentStartAt || ''),
    enrollmentEndAt: String(payload?.settings?.enrollmentEndAt || ''),
    waitlistEnabled: Boolean(payload?.settings?.waitlistEnabled ?? false),
    priceUsd: Math.max(0, Number(payload?.settings?.priceUsd || 0)),
    cohortLabel: String(payload?.settings?.cohortLabel || ''),
    tags: [...new Set((payload?.settings?.tags || []).map((tag) => String(tag || '').trim()).filter(Boolean))],
    ownerUserIds: [...new Set((payload?.settings?.ownerUserIds || []).map((id) => String(id || '').trim()).filter(Boolean))],
    editorUserIds: [...new Set((payload?.settings?.editorUserIds || []).map((id) => String(id || '').trim()).filter(Boolean))],
    releaseVersion: String(payload?.settings?.releaseVersion || 'v1'),
    releaseChannel: ['stable', 'beta', 'internal'].includes(payload?.settings?.releaseChannel) ? payload.settings.releaseChannel : 'stable',
    locales: [...new Set((payload?.settings?.locales || ['id']).map((locale) => String(locale || '').trim().toLowerCase()).filter(Boolean))],
    localeFallback: String(payload?.settings?.localeFallback || 'id').trim().toLowerCase() || 'id',
    localizedContent: payload?.settings?.localizedContent && typeof payload.settings.localizedContent === 'object' ? payload.settings.localizedContent : {},
    complianceRetentionDays: Math.max(30, Number(payload?.settings?.complianceRetentionDays || 365)),
  }
  return {
    id: String(payload?.id || ''),
    version: Math.max(1, Number(payload?.version || 1)),
    title: String(payload?.title || ''),
    slug: String(payload?.slug || toSlug(payload?.title || '')),
    description: String(payload?.description || ''),
    thumbnail: String(payload?.thumbnail || ''),
    category: String(payload?.category || 'General'),
    level: courseManagementLevels.includes(payload?.level) ? payload.level : 'beginner',
    language: String(payload?.language || 'id'),
    visibility: courseManagementVisibilityValues.includes(payload?.visibility) ? payload.visibility : 'public',
    status: courseManagementStatusValues.includes(payload?.status) ? payload.status : 'draft',
    publishAt: String(payload?.publishAt || ''),
    unpublishAt: String(payload?.unpublishAt || ''),
    modules,
    assets: Array.isArray(payload?.assets) ? payload.assets : [],
    settings,
    auditTrail: Array.isArray(payload?.auditTrail) ? payload.auditTrail : [],
    createdAt: String(payload?.createdAt || nowIso),
    updatedAt: String(payload?.updatedAt || nowIso),
  }
}
const validateCourseManagementIntegrity = (course, allCourses = []) => {
  const checks = []
  const modules = Array.isArray(course?.modules) ? course.modules : []
  const lessons = modules.flatMap((module) => (Array.isArray(module.lessons) ? module.lessons : []))
  const duplicateModuleIds = hasDuplicate(modules.map((module) => module.id))
  const duplicateLessonIds = hasDuplicate(lessons.map((lesson) => lesson.id))
  const hasPreviewLesson = lessons.some((lesson) => Boolean(lesson.isPreview))
  const hasValidLessonType = lessons.every((lesson) => courseManagementLessonTypeValues.includes(lesson.type))
  const hasDuration = lessons.every((lesson) => Number(lesson.durationMin || 0) > 0)
  const publishAtMs = Date.parse(course?.publishAt || '')
  const unpublishAtMs = Date.parse(course?.unpublishAt || '')
  const scheduleOk = !Number.isFinite(publishAtMs) || !Number.isFinite(unpublishAtMs) || publishAtMs < unpublishAtMs
  const enrollmentStartAtMs = Date.parse(course?.settings?.enrollmentStartAt || '')
  const enrollmentEndAtMs = Date.parse(course?.settings?.enrollmentEndAt || '')
  const enrollmentWindowOk =
    !Number.isFinite(enrollmentStartAtMs) || !Number.isFinite(enrollmentEndAtMs) || enrollmentStartAtMs < enrollmentEndAtMs
  const prerequisiteIds = Array.isArray(course?.settings?.prerequisiteCourseIds) ? course.settings.prerequisiteCourseIds : []
  const existingIds = new Set(allCourses.map((item) => item.id))
  const invalidPrerequisites = prerequisiteIds.filter((id) => id !== course.id && !existingIds.has(id))
  const selfReference = prerequisiteIds.includes(course.id)
  const dependencyById = buildCourseManagementDependencyIndex(
    allCourses.map((item) => (item.id === course.id ? course : item))
  )
  const cycle = findDependencyCycle(course.id, dependencyById)

  checks.push({ id: 'slug', passed: Boolean(toSlug(course.slug)) })
  checks.push({ id: 'module-id-unique', passed: !duplicateModuleIds })
  checks.push({ id: 'lesson-id-unique', passed: !duplicateLessonIds })
  checks.push({ id: 'lesson-type', passed: hasValidLessonType })
  checks.push({ id: 'duration', passed: hasDuration })
  checks.push({ id: 'schedule', passed: scheduleOk })
  checks.push({ id: 'enrollment-window', passed: enrollmentWindowOk })
  checks.push({ id: 'prerequisite-valid', passed: invalidPrerequisites.length === 0 && !selfReference })
  checks.push({ id: 'prerequisite-cycle', passed: !cycle })

  const publishChecks = [
    { id: 'title', passed: Boolean(String(course?.title || '').trim()) },
    { id: 'description', passed: String(course?.description || '').trim().length >= 30 },
    { id: 'thumbnail', passed: Boolean(String(course?.thumbnail || '').trim()) },
    { id: 'module', passed: modules.length > 0 },
    { id: 'lesson', passed: modules.length > 0 && modules.every((module) => (module.lessons || []).length > 0) },
    { id: 'preview', passed: hasPreviewLesson },
    ...checks,
  ]

  return {
    checks,
    publishChecks,
    invalidPrerequisites,
    cyclePath: cycle || [],
    hasIntegrityError: checks.some((item) => !item.passed),
    hasPublishGap: publishChecks.some((item) => !item.passed),
  }
}
const toCourseLevelScore = (level) => {
  const order = ['beginner', 'intermediate', 'advanced']
  const index = order.indexOf(String(level || '').toLowerCase())
  return index >= 0 ? index : 0
}
const suggestCourseManagementPrerequisites = (course, allCourses = []) => {
  const currentLevelScore = toCourseLevelScore(course?.level)
  if (currentLevelScore <= 0) return []
  const currentCategory = String(course?.category || '').trim().toLowerCase()
  const candidates = (allCourses || [])
    .filter((item) => item.id !== course?.id)
    .map((item) => ({
      id: item.id,
      levelScore: toCourseLevelScore(item.level),
      sameCategory: String(item.category || '').trim().toLowerCase() === currentCategory,
      updatedAtMs: Date.parse(item.updatedAt || '') || 0,
    }))
    .filter((item) => item.levelScore < currentLevelScore)
    .sort((a, b) => {
      if (a.sameCategory !== b.sameCategory) return a.sameCategory ? -1 : 1
      if (a.levelScore !== b.levelScore) return b.levelScore - a.levelScore
      return b.updatedAtMs - a.updatedAtMs
    })
  const selected = []
  const usedLevel = new Set()
  for (const candidate of candidates) {
    if (usedLevel.has(candidate.levelScore)) continue
    usedLevel.add(candidate.levelScore)
    selected.push(candidate.id)
    if (selected.length >= currentLevelScore) break
  }
  return selected
}
const acquireCourseJobWorkerLease = (db, ownerId, ttlMs = COURSE_JOB_LEASE_TTL_MS) => {
  const now = Date.now()
  const lease = db?.jobWorkerLease && typeof db.jobWorkerLease === 'object' ? db.jobWorkerLease : null
  const expiresAtMs = Date.parse(lease?.expiresAt || '')
  const isExpired = !Number.isFinite(expiresAtMs) || expiresAtMs <= now
  if (lease && !isExpired && lease.ownerId && lease.ownerId !== ownerId) {
    return {
      acquired: false,
      lease,
    }
  }
  const nextLease = {
    ownerId,
    acquiredAt: isExpired ? new Date(now).toISOString() : String(lease?.acquiredAt || new Date(now).toISOString()),
    heartbeatAt: new Date(now).toISOString(),
    expiresAt: new Date(now + Math.max(1_000, Number(ttlMs || COURSE_JOB_LEASE_TTL_MS))).toISOString(),
  }
  db.jobWorkerLease = nextLease
  return {
    acquired: true,
    lease: nextLease,
  }
}
const releaseCourseJobWorkerLease = (db, ownerId) => {
  const lease = db?.jobWorkerLease && typeof db.jobWorkerLease === 'object' ? db.jobWorkerLease : null
  if (!lease) return false
  if (lease.ownerId && lease.ownerId !== ownerId) return false
  db.jobWorkerLease = null
  return true
}
const createCourseManagementJob = (payload, actorEmail) => ({
  id: `cmjob-${Math.random().toString(36).slice(2, 10)}`,
  type: payload.type,
  ids: [...new Set((payload.ids || []).map((id) => String(id || '').trim()).filter(Boolean))],
  statusValue: payload.statusValue || '',
  status: 'pending',
  attempts: 0,
  processed: 0,
  total: Array.isArray(payload.ids) ? payload.ids.length : 0,
  errorCount: 0,
  errors: [],
  createdBy: actorEmail || '',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  lastRunAt: '',
  nextRunAt: '',
  finishedAt: '',
})
const pushCourseManagementJobToDlq = (db, job, reason = 'terminal-failure') => {
  const dlqItem = {
    id: `dlq-${Math.random().toString(36).slice(2, 10)}`,
    sourceJobId: String(job?.id || ''),
    reason: String(reason || 'terminal-failure'),
    status: 'open',
    createdAt: new Date().toISOString(),
    redrivenAt: '',
    redriveCount: 0,
    snapshot: {
      id: String(job?.id || ''),
      type: String(job?.type || ''),
      ids: Array.isArray(job?.ids) ? job.ids : [],
      statusValue: String(job?.statusValue || ''),
      attempts: Number(job?.attempts || 0),
      processed: Number(job?.processed || 0),
      total: Number(job?.total || 0),
      errorCount: Number(job?.errorCount || 0),
      errors: Array.isArray(job?.errors) ? job.errors : [],
      finishedAt: String(job?.finishedAt || ''),
    },
  }
  db.courseManagementJobDlq = [dlqItem, ...(Array.isArray(db.courseManagementJobDlq) ? db.courseManagementJobDlq : [])].slice(0, 1000)
  return dlqItem
}
const executeCourseManagementJob = (db, job, actorEmail = 'system') => {
  const ids = Array.isArray(job?.ids) ? job.ids : []
  const errors = []
  let processed = 0
  for (const id of ids) {
    const courses = Array.isArray(db.courseManagement) ? db.courseManagement.slice() : []
    const target = courses.find((item) => item.id === id)
    if (!target) continue
    try {
      let nextCourse = null
      if (job.type === 'bulk-delete') {
        db.courseManagement = courses.filter((item) => item.id !== id)
        addAuditLog(db, {
          actor: actorEmail,
          action: 'course_mgmt_job_delete',
          target: id,
          detail: `Deleted course by queued job ${job.id}.`,
        })
        processed += 1
        continue
      }
      if (job.type === 'bulk-status') {
        const statusValue = courseManagementStatusValues.includes(job.statusValue) ? job.statusValue : 'draft'
        nextCourse = {
          ...target,
          status: statusValue,
          version: Number(target.version || 1) + 1,
          updatedAt: new Date().toISOString(),
          revisions: [buildCourseRevisionEntry(target, `job-status:${statusValue}`, actorEmail), ...(target.revisions || [])].slice(0, 40),
        }
      } else if (job.type === 'bulk-auto-prerequisite') {
        const suggestedIds = suggestCourseManagementPrerequisites(target, courses)
        nextCourse = {
          ...target,
          settings: {
            ...target.settings,
            prerequisiteCourseIds: suggestedIds,
          },
          version: Number(target.version || 1) + 1,
          updatedAt: new Date().toISOString(),
          revisions: [buildCourseRevisionEntry(target, 'job-auto-prerequisite', actorEmail), ...(target.revisions || [])].slice(0, 40),
        }
      } else if (job.type === 'bulk-clear-prerequisite') {
        nextCourse = {
          ...target,
          settings: {
            ...target.settings,
            prerequisiteCourseIds: [],
          },
          version: Number(target.version || 1) + 1,
          updatedAt: new Date().toISOString(),
          revisions: [buildCourseRevisionEntry(target, 'job-clear-prerequisite', actorEmail), ...(target.revisions || [])].slice(0, 40),
        }
      } else {
        throw new Error('Unsupported job type.')
      }
      const validation = validateCourseManagementIntegrity(nextCourse, courses.map((item) => (item.id === id ? nextCourse : item)))
      if (validation.hasIntegrityError || (['published', 'scheduled'].includes(nextCourse.status) && validation.hasPublishGap)) {
        throw new Error(`Validation failed: ${(validation.publishChecks || validation.checks).filter((item) => !item.passed).map((item) => item.id).join(', ')}`)
      }
      db.courseManagement = courses.map((item) => (item.id === id ? nextCourse : item))
      addAuditLog(db, {
        actor: actorEmail,
        action: 'course_mgmt_job_update',
        target: id,
        detail: `Updated course by queued job ${job.id} (${job.type}).`,
      })
      processed += 1
    } catch (error) {
      errors.push({
        id,
        message: error?.message || 'Unknown job execution error.',
      })
    }
  }
  const errorCount = errors.length
  return {
    processed,
    total: ids.length,
    errorCount,
    errors,
    status: errorCount > 0 && processed > 0 ? 'partial' : errorCount > 0 ? 'failed' : 'completed',
  }
}
const processDueCourseManagementJobs = (db, actorEmail = 'system', limit = 3) => {
  const jobs = Array.isArray(db.courseManagementJobs) ? db.courseManagementJobs : []
  const now = Date.now()
  const dueJobs = jobs
    .filter((job) => ['pending', 'retrying'].includes(job.status))
    .filter((job) => {
      const nextRunAtMs = Date.parse(job.nextRunAt || '')
      return !Number.isFinite(nextRunAtMs) || nextRunAtMs <= now
    })
    .slice(0, Math.max(1, limit))
  const results = []
  for (const job of dueJobs) {
    job.status = 'running'
    job.lastRunAt = new Date().toISOString()
    job.updatedAt = job.lastRunAt
    const execution = executeCourseManagementJob(db, job, actorEmail)
    job.processed = execution.processed
    job.total = execution.total
    job.errorCount = execution.errorCount
    job.errors = execution.errors
    job.attempts = Number(job.attempts || 0) + 1
    if (execution.status === 'failed' && job.attempts < 3) {
      job.status = 'retrying'
      job.nextRunAt = new Date(Date.now() + job.attempts * COURSE_JOB_RETRY_BASE_MS).toISOString()
    } else {
      job.status = execution.status
      job.finishedAt = new Date().toISOString()
      job.nextRunAt = ''
      if (execution.errorCount > 0) {
        pushCourseManagementJobToDlq(
          db,
          job,
          execution.status === 'partial' ? 'partial-failure' : execution.status === 'failed' ? 'max-retry-reached' : 'error',
        )
      }
    }
    job.updatedAt = new Date().toISOString()
    results.push({
      id: job.id,
      status: job.status,
      processed: job.processed,
      total: job.total,
      errorCount: job.errorCount,
    })
  }
  db.courseManagementJobs = jobs
  return results
}
const isBcryptHash = (value) => typeof value === 'string' && value.startsWith('$2')
const hashPassword = (value) => bcrypt.hash(value, BCRYPT_ROUNDS)
const shuffle = (list) => {
  const next = [...list]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = next[i]
    next[i] = next[j]
    next[j] = temp
  }
  return next
}

const nowStamp = () => {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
}

const createDefaultDb = () => {
  const profiles = Object.fromEntries(defaultUsers.map((user) => [user.id, createDefaultProfileState(user)]))
  const credentials = Object.fromEntries(
    Object.entries(defaultCredentialsPlain).map(([email, password]) => [normalizeEmail(email), bcrypt.hashSync(password, BCRYPT_ROUNDS)]),
  )

  return {
    users: deepClone(defaultUsers),
    credentials,
    permissionMatrix: deepClone(defaultPermissionMatrix),
    courseManagementPermissions: deepClone(defaultCourseManagementPermissionMatrix),
    courses: deepClone(defaultCourseCatalog),
    courseManagement: [],
    quizzes: deepClone(defaultQuizCatalog),
    quizAttempts: {},
    quizSessions: {},
    uploads: {},
    nextUploadSeq: 1,
    assignmentSubmissions: {},
    courseProgress: {},
    lessonNotes: {},
    discussions: {},
    certificateSchemaVersion: 2,
    certificateTemplates: [],
    certificateIssuances: [],
    certificateCounters: {
      template: 1,
      issuance: 1,
      certificate: 1,
    },
    courseManagementJobs: [],
    courseManagementJobDlq: [],
    jobWorkerLease: null,
    profiles,
    revokedTokens: [],
    telemetryEvents: [],
    notificationChannels: {
      webhookEnabled: false,
      webhookUrl: '',
      emailEnabled: false,
      emailFrom: 'no-reply@curiosity.app',
    },
    notificationDeliveryLogs: [],
    webhookReplayNonces: {},
    immutableAuditLogs: [],
    auditLogs: [
      {
        id: `audit-${Math.random().toString(36).slice(2, 9)}`,
        actor: 'system',
        action: 'seed_data',
        target: 'bootstrap',
        detail: 'Initial database seeded.',
        timestamp: nowStamp(),
      },
    ],
  }
}

const resetDb = async () => {
  await writeDb(createDefaultDb())
}

const hydrateDb = (db) => {
  const next = { ...db }
  next.users = Array.isArray(next.users) ? next.users : deepClone(defaultUsers)
  next.permissionMatrix = next.permissionMatrix || deepClone(defaultPermissionMatrix)
  next.courseManagementPermissions = normalizeCourseManagementPermissionMatrix(next.courseManagementPermissions || defaultCourseManagementPermissionMatrix)
  next.courses = Array.isArray(next.courses) ? next.courses : deepClone(defaultCourseCatalog)
  next.courseManagement = (Array.isArray(next.courseManagement) ? next.courseManagement : []).map((course) => ({
    ...course,
    version: Math.max(1, Number(course?.version || 1)),
    revisions: Array.isArray(course?.revisions) ? course.revisions : [],
  }))
  next.quizzes = (Array.isArray(next.quizzes) ? next.quizzes : deepClone(defaultQuizCatalog)).map((quiz) => ({
    ...quiz,
    status: quiz.status || 'published',
  }))
  next.quizAttempts = next.quizAttempts || {}
  next.quizSessions = next.quizSessions || {}
  next.uploads = next.uploads || {}
  next.nextUploadSeq = Number.isFinite(next.nextUploadSeq) ? Number(next.nextUploadSeq) : 1
  next.assignmentSubmissions = next.assignmentSubmissions || {}
  next.courseProgress = next.courseProgress || {}
  next.lessonNotes = next.lessonNotes || {}
  next.discussions = next.discussions || {}
  next.certificateSchemaVersion = Number(next.certificateSchemaVersion || 2)
  next.certificateTemplates = Array.isArray(next.certificateTemplates) ? next.certificateTemplates : []
  next.certificateIssuances = Array.isArray(next.certificateIssuances) ? next.certificateIssuances : []
  next.certificateCounters =
    next.certificateCounters && typeof next.certificateCounters === 'object'
      ? {
          template: Math.max(1, Number(next.certificateCounters.template || 1)),
          issuance: Math.max(1, Number(next.certificateCounters.issuance || 1)),
          certificate: Math.max(1, Number(next.certificateCounters.certificate || 1)),
        }
      : {
          template: Math.max(1, next.certificateTemplates.length + 1),
          issuance: Math.max(1, next.certificateIssuances.length + 1),
          certificate: Math.max(1, next.certificateIssuances.length + 1),
        }
  next.courseManagementJobs = Array.isArray(next.courseManagementJobs) ? next.courseManagementJobs : []
  next.courseManagementJobDlq = Array.isArray(next.courseManagementJobDlq) ? next.courseManagementJobDlq : []
  next.jobWorkerLease = next.jobWorkerLease && typeof next.jobWorkerLease === 'object' ? next.jobWorkerLease : null
  next.profiles = next.profiles || {}
  next.revokedTokens = Array.isArray(next.revokedTokens) ? next.revokedTokens : []
  next.telemetryEvents = Array.isArray(next.telemetryEvents) ? next.telemetryEvents : []
  next.notificationChannels =
    next.notificationChannels && typeof next.notificationChannels === 'object'
      ? {
          webhookEnabled: Boolean(next.notificationChannels.webhookEnabled),
          webhookUrl: String(next.notificationChannels.webhookUrl || ''),
          emailEnabled: Boolean(next.notificationChannels.emailEnabled),
          emailFrom: String(next.notificationChannels.emailFrom || 'no-reply@curiosity.app'),
        }
      : {
          webhookEnabled: false,
          webhookUrl: '',
          emailEnabled: false,
          emailFrom: 'no-reply@curiosity.app',
        }
  next.notificationDeliveryLogs = Array.isArray(next.notificationDeliveryLogs) ? next.notificationDeliveryLogs : []
  next.webhookReplayNonces =
    next.webhookReplayNonces && typeof next.webhookReplayNonces === 'object' ? next.webhookReplayNonces : {}
  next.immutableAuditLogs = Array.isArray(next.immutableAuditLogs) ? next.immutableAuditLogs : []
  next.auditLogs = Array.isArray(next.auditLogs) ? next.auditLogs : []
  next.credentials = next.credentials || {}

  for (const [email, value] of Object.entries(next.credentials)) {
    if (!isBcryptHash(value) && typeof value === 'string') {
      next.credentials[normalizeEmail(email)] = bcrypt.hashSync(value, BCRYPT_ROUNDS)
      if (normalizeEmail(email) !== email) {
        delete next.credentials[email]
      }
    }
  }

  return next
}

const ensureDb = async () => {
  await mkdir(DB_DIR, { recursive: true })
  await storageAdapter.ensure()
  try {
    const raw = await readFile(DB_PATH, 'utf-8')
    const parsed = hydrateDb(JSON.parse(raw))
    if (!parsed || typeof parsed !== 'object') throw new Error('invalid db')
    await writeFile(DB_PATH, JSON.stringify(parsed, null, 2), 'utf-8')
  } catch {
    await writeFile(DB_PATH, JSON.stringify(createDefaultDb(), null, 2), 'utf-8')
  }
}

const readDb = async () => {
  const raw = await readFile(DB_PATH, 'utf-8')
  return hydrateDb(JSON.parse(raw))
}

const writeDb = async (db) => {
  await writeFile(DB_PATH, JSON.stringify(db, null, 2), 'utf-8')
}

const toSafeUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  roleLabel: accessLevels[user.role] || user.role,
})

const addAuditLog = (db, { actor, action, target, detail }) => {
  const entry = {
    id: `audit-${Math.random().toString(36).slice(2, 9)}`,
    actor,
    action,
    target,
    detail,
    timestamp: nowStamp(),
  }
  db.auditLogs = [entry, ...(db.auditLogs || [])].slice(0, 400)
  const previousHash = db.immutableAuditLogs?.[0]?.hash || 'genesis'
  const immutableSeed = {
    id: entry.id,
    actor: String(entry.actor || ''),
    action: String(entry.action || ''),
    target: String(entry.target || ''),
    detail: String(entry.detail || ''),
    timestamp: String(entry.timestamp || ''),
    prevHash: previousHash,
  }
  const hash = createHash('sha256').update(JSON.stringify(immutableSeed)).digest('hex')
  db.immutableAuditLogs = [
    {
      ...immutableSeed,
      hash,
      createdAt: new Date().toISOString(),
    },
    ...(db.immutableAuditLogs || []),
  ].slice(0, 4000)
}

const addTelemetryEvent = (db, payload, user) => {
  const nowIso = new Date().toISOString()
  db.telemetryEvents = [
    {
      id: `evt-${Math.random().toString(36).slice(2, 10)}`,
      domain: String(payload?.domain || 'app'),
      action: String(payload?.action || 'unknown'),
      severity: String(payload?.severity || 'info'),
      message: String(payload?.message || ''),
      context: payload?.context && typeof payload.context === 'object' ? payload.context : {},
      meta: payload?.meta && typeof payload.meta === 'object' ? payload.meta : {},
      actorId: user?.id || '',
      actorEmail: user?.email || '',
      createdAt: nowIso,
    },
    ...(Array.isArray(db.telemetryEvents) ? db.telemetryEvents : []),
  ].slice(0, 1000)
}

const checkPasswordAndUpgrade = async (db, email, plainPassword) => {
  const key = normalizeEmail(email)
  const expected = db.credentials[key]
  if (!expected) return false

  if (isBcryptHash(expected)) {
    return bcrypt.compare(plainPassword, expected)
  }

  const match = plainPassword === expected
  if (match) {
    db.credentials[key] = await hashPassword(plainPassword)
  }
  return match
}

const flattenLessons = (course) =>
  course.modules.flatMap((module) => module.lessons.map((lesson) => ({ ...lesson, moduleId: module.id, moduleTitle: module.title })))

const getQuizById = (db, quizId) => (db.quizzes || []).find((item) => item.id === quizId) || null
const canManageQuizRole = (db, user) =>
  user?.role === 'admin' || Boolean(db?.permissionMatrix?.[user?.role || '']?.manageQuiz)
const canReviewAssignmentRole = (db, user) =>
  user?.role === 'admin' || Boolean(db?.permissionMatrix?.[user?.role || '']?.manageCourse)
const isQuizPublished = (quiz) => String(quiz?.status || 'published') === 'published'

const buildQuizMeta = (quiz) => ({
  id: quiz.id,
  courseId: quiz.courseId,
  moduleId: quiz.moduleId,
  title: quiz.title,
  description: quiz.description,
  passingScore: quiz.passingScore,
  maxAttempts: quiz.maxAttempts,
  timeLimitSec: quiz.timeLimitSec,
  status: quiz.status || 'published',
  questionCount: Array.isArray(quiz.questions) ? quiz.questions.length : 0,
})

const getQuizHistory = (db, userId, quizId) => {
  const scopedByUser = db.quizAttempts?.[userId] || {}
  return Array.isArray(scopedByUser[quizId]) ? scopedByUser[quizId] : []
}

const getModuleQuizForCourseModule = (db, courseId, moduleId) => {
  const quizzes = Array.isArray(db?.quizzes) ? db.quizzes : []
  const published = quizzes.filter((quiz) => quiz.courseId === courseId && quiz.moduleId === moduleId && isQuizPublished(quiz))
  if (!published.length) return null
  const exact = published.find((quiz) => quiz.id === moduleId)
  return exact || published[0]
}

const getModuleQuizGateByModuleId = (db, userId, course) =>
  Object.fromEntries(
    (course.modules || []).map((module) => {
      const quiz = getModuleQuizForCourseModule(db, course.id, module.id)
      if (!quiz) {
        return [
          module.id,
          {
            required: false,
            passed: true,
            quizId: '',
            quizTitle: '',
          },
        ]
      }
      const history = getQuizHistory(db, userId, quiz.id)
      const passed = history.some((attempt) => Boolean(attempt?.passed))
      return [
        module.id,
        {
          required: true,
          passed,
          quizId: quiz.id,
          quizTitle: quiz.title || 'Module Quiz',
        },
      ]
    }),
  )

const evaluatePrerequisiteRules = ({ mode = 'all', rules = [] }, context) => {
  const normalizedRules = Array.isArray(rules) ? rules : []
  if (!normalizedRules.length) {
    return { blocked: false, reason: '' }
  }
  const results = normalizedRules.map((rule) => {
    const type = String(rule?.type || '')
    if (type === 'module-complete') {
      const module = context.moduleById[rule.moduleId]
      const passed = Boolean(module) && module.lessons.every((lesson) => context.completedSet.has(lesson.id))
      return {
        passed,
        reason: `Complete module ${module?.title || rule.moduleId} first.`,
      }
    }
    if (type === 'module-quiz-pass') {
      const gate = context.moduleQuizGateByModuleId[rule.moduleId]
      const passed = !gate?.required || Boolean(gate?.passed)
      return {
        passed,
        reason: `Pass ${gate?.quizTitle || 'module quiz'} first.`,
      }
    }
    if (type === 'lesson-complete') {
      const passed = context.completedSet.has(rule.lessonId)
      return {
        passed,
        reason: `Complete lesson ${rule.lessonId} first.`,
      }
    }
    return { passed: true, reason: '' }
  })

  if (String(mode || 'all') === 'any') {
    const anyPassed = results.some((row) => row.passed)
    return {
      blocked: !anyPassed,
      reason: anyPassed ? '' : results.map((row) => row.reason).find(Boolean) || 'Prerequisite is not satisfied.',
    }
  }

  const unmet = results.find((row) => !row.passed)
  return {
    blocked: Boolean(unmet),
    reason: unmet?.reason || '',
  }
}

const setQuizHistory = (db, userId, quizId, history) => {
  db.quizAttempts = db.quizAttempts || {}
  const scopedByUser = db.quizAttempts[userId] || {}
  db.quizAttempts[userId] = {
    ...scopedByUser,
    [quizId]: history,
  }
}

const buildQuizSession = (quiz, userId, attemptNo) => {
  const startedAt = Date.now()
  const questionBank = shuffle(Array.isArray(quiz.questions) ? quiz.questions : []).map((question, qIdx) => {
    const optionPairs = (question.options || []).map((label, index) => ({ label, index }))
    const optionShuffled = shuffle(optionPairs)
    const options = optionShuffled.map((item, oIdx) => ({
      id: `${question.id}-opt-${oIdx}`,
      label: item.label,
      sourceIndex: item.index,
    }))
    const correctOption = options.find((item) => item.sourceIndex === question.correctIndex)
    return {
      id: question.id || `q-${qIdx + 1}`,
      title: question.title || `Question ${qIdx + 1}`,
      explanation: question.explanation || '',
      options: options.map((item) => ({ id: item.id, label: item.label })),
      correctOptionId: correctOption?.id || '',
    }
  })

  return {
    sessionId: `quizsess-${Math.random().toString(36).slice(2, 12)}`,
    quizId: quiz.id,
    userId,
    title: quiz.title,
    description: quiz.description,
    passingScore: quiz.passingScore,
    maxAttempts: quiz.maxAttempts,
    timeLimitSec: quiz.timeLimitSec,
    attemptNo,
    startedAt,
    expiresAt: startedAt + quiz.timeLimitSec * 1000,
    questions: questionBank,
  }
}

const toPublicQuizSession = (session) => ({
  sessionId: session.sessionId,
  quizId: session.quizId,
  title: session.title,
  description: session.description,
  passingScore: session.passingScore,
  maxAttempts: session.maxAttempts,
  timeLimitSec: session.timeLimitSec,
  attemptNo: session.attemptNo,
  startedAt: session.startedAt,
  expiresAt: session.expiresAt,
  questions: session.questions.map((question) => ({
    id: question.id,
    title: question.title,
    options: question.options,
  })),
})

const removeQuizArtifacts = (db, quizId) => {
  if (db.quizAttempts && typeof db.quizAttempts === 'object') {
    Object.keys(db.quizAttempts).forEach((userId) => {
      const scoped = db.quizAttempts[userId] || {}
      if (Object.prototype.hasOwnProperty.call(scoped, quizId)) {
        delete scoped[quizId]
      }
      db.quizAttempts[userId] = scoped
    })
  }

  if (db.quizSessions && typeof db.quizSessions === 'object') {
    Object.keys(db.quizSessions).forEach((sessionId) => {
      if (db.quizSessions[sessionId]?.quizId === quizId) {
        delete db.quizSessions[sessionId]
      }
    })
  }
}

const ensureCourseState = (db, userId, course) => {
  const userScope = db.courseProgress[userId] || {}
  const courseState = userScope[course.id] || {}
  const firstLessonId = flattenLessons(course)[0]?.id || ''
  const state = {
    completedLessonIds: Array.isArray(courseState.completedLessonIds) ? courseState.completedLessonIds : [],
    activeLessonId: courseState.activeLessonId || firstLessonId,
    lessonPlayback: courseState.lessonPlayback && typeof courseState.lessonPlayback === 'object' ? courseState.lessonPlayback : {},
    studyEvents: Array.isArray(courseState.studyEvents) ? courseState.studyEvents : [],
    lastTouchedAt: courseState.lastTouchedAt || null,
  }
  db.courseProgress[userId] = {
    ...userScope,
    [course.id]: state,
  }
  return state
}

const lessonNoteScope = (courseId, lessonId) => `${courseId}:${lessonId}`

const listLessonNotes = (db, userId, courseId, lessonId) => {
  const all = db.lessonNotes?.[userId] || {}
  const scoped = all[lessonNoteScope(courseId, lessonId)]
  if (!Array.isArray(scoped)) return []
  return scoped
    .map((item) => ({
      id: item.id,
      timestampSec: Math.max(0, Math.floor(Number(item.timestampSec || 0))),
      note: String(item.note || ''),
      createdAt: item.createdAt || null,
      updatedAt: item.updatedAt || item.createdAt || null,
    }))
    .sort((a, b) => a.timestampSec - b.timestampSec)
}

const writeLessonNotes = (db, userId, courseId, lessonId, notes) => {
  db.lessonNotes = db.lessonNotes || {}
  const scopedByUser = db.lessonNotes[userId] || {}
  db.lessonNotes[userId] = {
    ...scopedByUser,
    [lessonNoteScope(courseId, lessonId)]: Array.isArray(notes) ? notes : [],
  }
}

const buildContinueLearning = (db, userId) => {
  const courses = db.courses || []
  const cards = courses.map((course) => {
    const state = ensureCourseState(db, userId, course)
    const moduleQuizGateByModuleId = getModuleQuizGateByModuleId(db, userId, course)
    const view = buildCourseView(course, state, { moduleQuizGateByModuleId })
    return toCourseCard(view)
  })
  if (!cards.length) return null

  const sorted = cards
    .slice()
    .sort((a, b) => Date.parse(b.lastTouchedAt || 0) - Date.parse(a.lastTouchedAt || 0))
  const mostRecent = sorted[0]
  if (mostRecent?.lastTouchedAt) return mostRecent
  return cards.find((item) => Number(item.progress || 0) < 100) || cards[0]
}

const buildCourseView = (course, state, options = {}) => {
  const moduleQuizGateByModuleId = options.moduleQuizGateByModuleId || {}
  const allLessons = flattenLessons(course)
  const lessonIds = allLessons.map((lesson) => lesson.id)
  const completedSet = new Set(state.completedLessonIds)
  const moduleById = Object.fromEntries((course.modules || []).map((module) => [module.id, module]))
  const firstLessonIdByModule = Object.fromEntries(
    (course.modules || []).map((module) => [module.id, module.lessons?.[0]?.id || '']),
  )
  const isModuleCompleted = (module) =>
    (module?.lessons || []).every((lesson) => completedSet.has(lesson.id))

  const lessonMetaById = Object.fromEntries(
    lessonIds.map((lessonId, index) => {
      const prevLessonId = lessonIds[index - 1]
      let isLocked = index > 0 && !completedSet.has(prevLessonId)
      let lockReason = isLocked ? 'Complete previous lesson first.' : ''

      if (!isLocked) {
        const currentModuleIndex = (course.modules || []).findIndex((module) => (module.lessons || []).some((lesson) => lesson.id === lessonId))
        if (currentModuleIndex > 0) {
          const currentModule = course.modules[currentModuleIndex]
          const prevModule = course.modules[currentModuleIndex - 1]
          const isFirstLessonInModule = firstLessonIdByModule[currentModule.id] === lessonId
          if (isFirstLessonInModule) {
            const prerequisite = currentModule?.prerequisite || {
              mode: 'all',
              rules: [
                { type: 'module-complete', moduleId: prevModule?.id },
                ...(moduleQuizGateByModuleId[prevModule?.id]?.required ? [{ type: 'module-quiz-pass', moduleId: prevModule?.id }] : []),
              ].filter((row) => row.moduleId),
            }
            const evalResult = evaluatePrerequisiteRules(prerequisite, {
              moduleById,
              completedSet,
              moduleQuizGateByModuleId,
            })
            if (evalResult.blocked) {
              isLocked = true
              lockReason = evalResult.reason || 'Prerequisite is not satisfied.'
            }
          }
        }
      }

      return [lessonId, { index, isLocked, lockReason }]
    }),
  )

  const activeLessonId = lessonMetaById[state.activeLessonId]?.isLocked ? lessonIds[0] : state.activeLessonId

  const modules = course.modules.map((module) => ({
    ...module,
    lessons: module.lessons.map((lesson) => {
      const meta = lessonMetaById[lesson.id]
      const playback = {
        positionSec: Math.max(0, Math.floor(Number(state.lessonPlayback?.[lesson.id]?.positionSec || 0))),
        durationSec: Math.max(0, Math.floor(Number(state.lessonPlayback?.[lesson.id]?.durationSec || 0))),
        watchedRanges: normalizeRanges(state.lessonPlayback?.[lesson.id]?.watchedRanges || [], state.lessonPlayback?.[lesson.id]?.durationSec || 0),
        watchedSec: Math.max(
          0,
          Math.floor(
            Number(
              state.lessonPlayback?.[lesson.id]?.watchedSec ||
                sumRangeDuration(state.lessonPlayback?.[lesson.id]?.watchedRanges || []),
            ),
          ),
        ),
        progressPercent: Math.max(0, Math.min(100, Math.round(Number(state.lessonPlayback?.[lesson.id]?.progressPercent || 0)))),
        completedVideoAt: state.lessonPlayback?.[lesson.id]?.completedVideoAt || null,
      }
      const completionGate = getLessonCompletionGate(lesson, playback)
      return {
        ...lesson,
        videoUrl: String(lesson.videoUrl || (lesson.type === 'video' ? demoVideoUrl : '')),
        resources: toLessonResourceList(course.id, lesson.id, lesson.resources || []),
        transcript: (
          Array.isArray(lesson.transcript) && lesson.transcript.length
            ? lesson.transcript
            : lesson.summary
              ? [{ atSec: 0, text: lesson.summary }]
              : []
        )
          .map((row, index) => ({
            id: `${lesson.id}-tr-${index + 1}`,
            atSec: Math.max(0, Math.floor(Number(row?.atSec ?? 0))),
            text: String(row?.text || ''),
          }))
          .filter((row) => row.text),
        isCompleted: completedSet.has(lesson.id),
        isLocked: Boolean(meta?.isLocked),
        lockReason: meta?.lockReason || '',
        isActive: lesson.id === activeLessonId,
        playback,
        canComplete: completionGate.canComplete,
        completionRequiredPercent: completionGate.requiredProgressPercent,
        completionGateReason: completionGate.reason,
      }
    }),
  }))

  const lessonViews = modules.flatMap((module) => module.lessons)
  const completedLessons = lessonViews.filter((lesson) => lesson.isCompleted).length
  const totalLessons = allLessons.length
  const progress = totalLessons ? Math.round((completedLessons / totalLessons) * 100) : 0
  const activeLesson = lessonViews.find((lesson) => lesson.id === activeLessonId) || lessonViews[0] || null
  const activeIndex = activeLesson ? lessonViews.findIndex((lesson) => lesson.id === activeLesson.id) : -1
  const previousLesson = activeIndex > 0 ? lessonViews[activeIndex - 1] : null
  const nextLesson = activeIndex >= 0 && activeIndex < lessonViews.length - 1 ? lessonViews[activeIndex + 1] : null

  return {
    id: course.id,
    title: course.title,
    description: course.description,
    tag: course.tag,
    gradient: course.gradient,
    instructor: course.instructor,
    modules,
    activeLesson,
    previousLesson,
    nextLesson,
    progress,
    completedLessons,
    totalLessons,
    lastTouchedAt: state.lastTouchedAt || null,
  }
}

const toCourseCard = (courseView) => ({
  id: courseView.id,
  title: courseView.title,
  description: courseView.description,
  progress: courseView.progress,
  tag: courseView.tag,
  gradient: courseView.gradient,
  activeLessonId: courseView.activeLesson?.id || '',
  activeLessonTitle: courseView.activeLesson?.title || '',
  totalLessons: courseView.totalLessons,
  completedLessons: courseView.completedLessons,
  blockedLessons: (courseView.modules || []).flatMap((module) => module.lessons || []).filter((lesson) => lesson.isLocked).length,
  nextLockedLessonTitle:
    (courseView.modules || [])
      .flatMap((module) => module.lessons || [])
      .find((lesson) => lesson.isLocked)?.title || '',
  nextLockReason:
    (courseView.modules || [])
      .flatMap((module) => module.lessons || [])
      .find((lesson) => lesson.isLocked)?.lockReason || '',
  lastTouchedAt: courseView.lastTouchedAt || null,
})

const buildLearningAnalytics = (db, userId) => {
  const nowMs = Date.now()
  const sinceMs = nowMs - ANALYTICS_WINDOW_DAYS * 24 * 60 * 60 * 1000
  const dayBuckets = Array.from({ length: ANALYTICS_WINDOW_DAYS }).map((_, index) => {
    const day = new Date(nowMs - (ANALYTICS_WINDOW_DAYS - 1 - index) * 24 * 60 * 60 * 1000)
    return {
      date: day.toISOString().slice(0, 10),
      minutes: 0,
    }
  })
  const bucketByDate = Object.fromEntries(dayBuckets.map((row) => [row.date, row]))

  const courses = (db.courses || []).map((course) => {
    const state = ensureCourseState(db, userId, course)
    const moduleQuizGateByModuleId = getModuleQuizGateByModuleId(db, userId, course)
    const view = buildCourseView(course, state, { moduleQuizGateByModuleId })
    const studyEvents = Array.isArray(state.studyEvents) ? state.studyEvents : []
    const weeklySeconds = studyEvents
      .filter((event) => Date.parse(event.at || '') >= sinceMs)
      .reduce((sum, event) => sum + Math.max(0, Number(event.seconds || 0)), 0)
    studyEvents.forEach((event) => {
      const eventMs = Date.parse(event.at || '')
      if (!Number.isFinite(eventMs) || eventMs < sinceMs) return
      const keyDate = new Date(eventMs).toISOString().slice(0, 10)
      if (bucketByDate[keyDate]) {
        bucketByDate[keyDate].minutes += Math.max(0, Number(event.seconds || 0)) / 60
      }
    })
    const lastStudiedAt = studyEvents[0]?.at || null
    const atRisk = view.progress < 40 && (!lastStudiedAt || nowMs - Date.parse(lastStudiedAt) > 3 * 24 * 60 * 60 * 1000)
    return {
      courseId: view.id,
      title: view.title,
      progress: view.progress,
      completionRate: view.progress,
      completedLessons: view.completedLessons,
      totalLessons: view.totalLessons,
      weeklyStudyMinutes: Math.round(weeklySeconds / 60),
      lastStudiedAt,
      atRisk,
    }
  })

  const weeklyTotalMinutes = Math.round(dayBuckets.reduce((sum, row) => sum + row.minutes, 0))
  const completionRateAvg = courses.length ? Math.round(courses.reduce((sum, row) => sum + row.completionRate, 0) / courses.length) : 0
  const earlyWarnings = courses
    .filter((row) => row.atRisk)
    .map((row) => ({
      courseId: row.courseId,
      title: row.title,
      progress: row.progress,
      lastStudiedAt: row.lastStudiedAt,
      reason: row.lastStudiedAt
        ? 'Progress masih rendah dan aktivitas belajar menurun.'
        : 'Belum ada aktivitas belajar untuk course ini.',
    }))
    .slice(0, 6)

  return {
    generatedAt: new Date().toISOString(),
    completionRateAvg,
    weeklyStudy: {
      totalMinutes: weeklyTotalMinutes,
      byDay: dayBuckets.map((row) => ({
        date: row.date,
        minutes: Math.round(row.minutes),
      })),
    },
    courses,
    earlyWarnings,
  }
}

const findCourseAndLesson = (db, courseId, lessonId) => {
  const course = (db.courses || []).find((item) => item.id === courseId)
  if (!course) return { course: null, lesson: null }
  const lessons = flattenLessons(course)
  const lesson = lessons.find((item) => item.id === lessonId) || null
  return { course, lesson }
}

const updateLessonAssignmentConfig = (db, courseId, lessonId, updater) => {
  db.courses = (db.courses || []).map((course) => {
    if (course.id !== courseId) return course
    return {
      ...course,
      modules: course.modules.map((module) => ({
        ...module,
        lessons: module.lessons.map((lesson) => {
          if (lesson.id !== lessonId) return lesson
          const nextAssignment = updater(lesson.assignment || {})
          return {
            ...lesson,
            assignment: nextAssignment,
          }
        }),
      })),
    }
  })
}

const findLessonTitle = (course, lessonId) => {
  const lesson = flattenLessons(course).find((item) => item.id === lessonId)
  return lesson?.title || 'Lesson'
}

const assignmentScopeKey = (courseId, lessonId) => `${courseId}:${lessonId}`
const uploadMimeByExt = {
  png: ['image/png'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  webp: ['image/webp'],
  gif: ['image/gif'],
  pdf: ['application/pdf'],
  zip: ['application/zip'],
  txt: ['text/plain'],
  json: ['application/json'],
}
const allowedUploadMimes = new Set(Object.values(uploadMimeByExt).flat())
const uploadExtByMime = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'text/plain': 'txt',
  'application/json': 'json',
}

const safeUploadFileName = (fileName) => {
  const ext = path.extname(String(fileName || '')).slice(1).toLowerCase()
  const base = path
    .basename(String(fileName || ''), ext ? `.${ext}` : '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  const safeBase = base || 'file'
  const safeExt = ext.replace(/[^a-z0-9]/g, '').slice(0, 12)
  return safeExt ? `${safeBase}.${safeExt}` : safeBase
}

const parseDataUrl = (value) => {
  const match = String(value || '').match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return null
  const mimeType = String(match[1] || '').toLowerCase()
  const buffer = Buffer.from(match[2], 'base64')
  return { mimeType, buffer }
}

const canonicalizeMime = (mimeType) => {
  const input = String(mimeType || '').toLowerCase()
  if (input === 'image/jpg') return 'image/jpeg'
  return input
}

const detectMimeFromBuffer = (buffer) => {
  if (!buffer || !buffer.length) return null
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'image/png'
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg'
  }
  if (buffer.length >= 6) {
    const head = buffer.slice(0, 6).toString('ascii')
    if (head === 'GIF87a' || head === 'GIF89a') return 'image/gif'
  }
  if (buffer.length >= 12) {
    const riff = buffer.slice(0, 4).toString('ascii')
    const webp = buffer.slice(8, 12).toString('ascii')
    if (riff === 'RIFF' && webp === 'WEBP') return 'image/webp'
  }
  if (buffer.length >= 5 && buffer.slice(0, 5).toString('ascii') === '%PDF-') return 'application/pdf'
  if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07) && (buffer[3] === 0x04 || buffer[3] === 0x06 || buffer[3] === 0x08)) {
    return 'application/zip'
  }
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true })
    const text = decoder.decode(buffer)
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) return null
    const trimmed = text.trim()
    if (!trimmed) return 'text/plain'
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        JSON.parse(trimmed)
        return 'application/json'
      } catch {
        return 'text/plain'
      }
    }
    return 'text/plain'
  } catch {
    return null
  }
}

const validateUploadMimeAndExtension = (fileName, declaredMime, detectedMime) => {
  const normalizedDeclared = canonicalizeMime(declaredMime)
  const normalizedDetected = canonicalizeMime(detectedMime || declaredMime)
  if (!allowedUploadMimes.has(normalizedDetected)) {
    return { ok: false, message: 'Unsupported file type.' }
  }
  if (normalizedDeclared && normalizedDeclared !== normalizedDetected) {
    return { ok: false, message: 'File mime type does not match content signature.' }
  }

  const ext = path.extname(String(fileName || '')).slice(1).toLowerCase()
  if (ext) {
    const allowedForExt = uploadMimeByExt[ext]
    if (!allowedForExt || !allowedForExt.includes(normalizedDetected)) {
      return { ok: false, message: 'File extension is not compatible with mime type.' }
    }
  }
  return {
    ok: true,
    mimeType: normalizedDetected,
    normalizedFileName: ext ? safeUploadFileName(fileName) : safeUploadFileName(`${fileName}.${uploadExtByMime[normalizedDetected]}`),
  }
}

const calculateUserUploadUsage = (db, userId, purpose = 'assignment') =>
  Object.values(db.uploads || {})
    .filter((item) => item.ownerId === userId && item.purpose === purpose)
    .reduce((sum, item) => sum + Number(item.sizeBytes || 0), 0)

const streamToBuffer = async (stream) => {
  const chunks = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

const createStorageAdapter = () => {
  if (STORAGE_PROVIDER === 's3') {
    if (!S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
      throw new Error('S3 storage selected but S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY is missing.')
    }
    const s3Client = new S3Client({
      region: S3_REGION,
      endpoint: S3_ENDPOINT || undefined,
      forcePathStyle: S3_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: S3_ACCESS_KEY_ID,
        secretAccessKey: S3_SECRET_ACCESS_KEY,
      },
    })
    return {
      async ensure() {
        return null
      },
      async put(storageKey, buffer, meta = {}) {
        await s3Client.send(
          new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: storageKey,
            Body: buffer,
            ContentType: meta.mimeType || 'application/octet-stream',
            ContentDisposition: meta.fileName ? `attachment; filename="${meta.fileName}"` : undefined,
            Metadata: meta.ownerId
              ? {
                  ownerid: String(meta.ownerId),
                  purpose: String(meta.purpose || 'assignment'),
                }
              : undefined,
          }),
        )
        return storageKey
      },
      async get(storageKey) {
        const response = await s3Client.send(
          new GetObjectCommand({
            Bucket: S3_BUCKET,
            Key: storageKey,
          }),
        )
        return streamToBuffer(response.Body)
      },
      async remove(storageKey) {
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: S3_BUCKET,
            Key: storageKey,
          }),
        )
        return null
      },
      async getSignedUrl(storageKey, fileName) {
        const command = new GetObjectCommand({
          Bucket: S3_BUCKET,
          Key: storageKey,
          ResponseContentDisposition: fileName ? `attachment; filename="${safeUploadFileName(fileName)}"` : undefined,
        })
        return getSignedS3Url(s3Client, command, {
          expiresIn: Math.max(60, Math.min(S3_SIGNED_URL_EXPIRES_SEC, 60 * 60)),
        })
      },
      supportsPublicSignedUrl: true,
    }
  }

  if (STORAGE_PROVIDER !== 'local') {
    return {
      async ensure() {
        throw new Error(`Storage provider "${STORAGE_PROVIDER}" is not configured.`)
      },
      async put() {
        throw new Error(`Storage provider "${STORAGE_PROVIDER}" is not configured.`)
      },
      async get() {
        throw new Error(`Storage provider "${STORAGE_PROVIDER}" is not configured.`)
      },
      async remove() {
        return null
      },
      async getSignedUrl() {
        return null
      },
      supportsPublicSignedUrl: false,
    }
  }

  return {
    async ensure() {
      await mkdir(UPLOAD_DIR, { recursive: true })
    },
    async put(storageKey, buffer) {
      await writeFile(path.join(UPLOAD_DIR, storageKey), buffer)
      return storageKey
    },
    async get(storageKey) {
      return readFile(path.join(UPLOAD_DIR, storageKey))
    },
    async remove(storageKey) {
      try {
        await unlink(path.join(UPLOAD_DIR, storageKey))
      } catch {
        return null
      }
      return null
    },
    async getSignedUrl() {
      return null
    },
    supportsPublicSignedUrl: false,
  }
}

const storageAdapter = createStorageAdapter()

const getUploadDownloadUrl = (uploadId) => `/api/uploads/${encodeURIComponent(uploadId)}/data`
const getUploadSignedUrlEndpoint = (uploadId) => `/api/uploads/${encodeURIComponent(uploadId)}/url`

const buildDefaultAssignment = (course, lesson) => ({
  id: `asg-${course.id}-${lesson.id}`,
  title: `Project: ${lesson.title}`,
  instructions: `${lesson.summary} Upload hasil praktik kamu dalam format link atau lampiran.`,
  acceptedFormats: ['link', 'attachment'],
  maxAttachmentMb: 2,
  dueAt: '2026-03-31T16:59:00.000Z',
  graceMinutes: 24 * 60,
  rubric: [
    {
      id: 'problem-understanding',
      label: 'Problem Understanding',
      description: 'Apakah solusi menunjukkan pemahaman konteks dan kebutuhan user.',
      maxScore: 40,
    },
    {
      id: 'execution-quality',
      label: 'Execution Quality',
      description: 'Kualitas struktur, detail visual, atau implementasi teknis.',
      maxScore: 40,
    },
    {
      id: 'communication',
      label: 'Communication',
      description: 'Kejelasan penjelasan proses, keputusan, dan hasil.',
      maxScore: 20,
    },
  ],
})

const getAssignmentDefinition = (course, lesson) => {
  const lessonAssignment = lesson?.assignment
  if (!lessonAssignment || typeof lessonAssignment !== 'object') {
    return buildDefaultAssignment(course, lesson)
  }
  const fallback = buildDefaultAssignment(course, lesson)
  return {
    ...fallback,
    ...lessonAssignment,
    rubric: Array.isArray(lessonAssignment.rubric) && lessonAssignment.rubric.length ? lessonAssignment.rubric : fallback.rubric,
  }
}

const getAssignmentSubmissions = (db, courseId, lessonId) => {
  const key = assignmentScopeKey(courseId, lessonId)
  const items = db.assignmentSubmissions?.[key]
  if (!Array.isArray(items)) return []
  return items.map((item) => ({
    ...item,
    attachmentId: item.attachmentId || '',
    attachmentUrl: item.attachmentUrl || '',
    history: Array.isArray(item.history) ? item.history : [],
    rubricScores: Array.isArray(item.rubricScores) ? item.rubricScores : [],
  }))
}

const getAssignmentWindowStatus = (assignment, now = Date.now()) => {
  const dueAtIso = assignment?.dueAt || null
  const dueAtMs = dueAtIso ? Date.parse(dueAtIso) : Number.NaN
  const graceMinutes = Math.max(0, Number(assignment?.graceMinutes || 0))
  if (!Number.isFinite(dueAtMs)) {
    return {
      hasDeadline: false,
      dueAt: null,
      graceMinutes: 0,
      isLateWindow: false,
      isClosed: false,
      lateByMinutes: 0,
    }
  }
  const graceMs = graceMinutes * 60 * 1000
  const isLateWindow = now > dueAtMs && now <= dueAtMs + graceMs
  const isClosed = now > dueAtMs + graceMs
  const lateByMinutes = now > dueAtMs ? Math.floor((now - dueAtMs) / (60 * 1000)) : 0
  return {
    hasDeadline: true,
    dueAt: new Date(dueAtMs).toISOString(),
    graceMinutes,
    isLateWindow,
    isClosed,
    lateByMinutes,
  }
}

const canAccessUpload = (db, user, upload) => {
  if (!user || !upload) return false
  if (user.role === 'admin') return true
  if (upload.ownerId === user.id) return true
  return Boolean(db?.permissionMatrix?.[user.role || '']?.manageCourse)
}

const setAssignmentSubmissions = (db, courseId, lessonId, items) => {
  db.assignmentSubmissions = db.assignmentSubmissions || {}
  db.assignmentSubmissions[assignmentScopeKey(courseId, lessonId)] = items
}

const toAssignmentHistoryEntry = (submission, action, actor, previousSnapshot = null) => ({
  id: `subhist-${Math.random().toString(36).slice(2, 10)}`,
  action,
  actor: {
    id: actor?.id || '',
    name: actor?.name || actor?.email || 'System',
    email: actor?.email || '',
  },
  createdAt: new Date().toISOString(),
  previousSnapshot: previousSnapshot || null,
  snapshot: {
    status: submission?.status || 'submitted',
    linkUrl: submission?.linkUrl || '',
    notes: submission?.notes || '',
    attachmentName: submission?.attachmentName || '',
    attachmentId: submission?.attachmentId || '',
    attachmentUrl: submission?.attachmentUrl || '',
    feedback: submission?.feedback || '',
    rubricScores: Array.isArray(submission?.rubricScores) ? submission.rubricScores : [],
    scorePercent: submission?.scorePercent ?? null,
    reviewedAt: submission?.reviewedAt || null,
    submissionMode: submission?.submissionMode || 'on-time',
    lateByMinutes: Number(submission?.lateByMinutes || 0),
  },
})

const calculateRubricScore = (assignment, rubricScores = []) => {
  const criteria = Array.isArray(assignment?.rubric) ? assignment.rubric : []
  const maxScore = criteria.reduce((sum, criterion) => sum + Number(criterion.maxScore || 0), 0)
  if (!maxScore) return { totalScore: 0, maxScore: 0, percentage: null }

  const scoreMap = new Map(rubricScores.map((item) => [item.criterionId, Number(item.score || 0)]))
  const totalScore = criteria.reduce((sum, criterion) => sum + Math.max(0, Number(scoreMap.get(criterion.id) || 0)), 0)
  const percentage = Math.round((totalScore / maxScore) * 100)
  return { totalScore, maxScore, percentage }
}

const canModerateDiscussion = (user, discussionItem) =>
  user?.role === 'admin' || discussionItem?.authorId === user?.id

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

const resolveMentionUserIds = (users, text) => {
  const tokens = extractMentionTokens(text)
  if (!tokens.length) return []
  return (users || [])
    .filter((user) => {
      const emailLocal = String(user.email || '')
        .split('@')[0]
        .toLowerCase()
      const nameNoSpace = String(user.name || '')
        .replace(/\s+/g, '')
        .toLowerCase()
      const nameTokens = String(user.name || '')
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
      return tokens.some((token) => token === emailLocal || token === nameNoSpace || nameTokens.includes(token))
    })
    .map((user) => user.id)
}

const validateBody = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body)
  if (!result.success) {
    const issue = result.error.issues[0]
    return res.status(400).json({ message: issue?.message || 'Invalid request payload.' })
  }
  req.body = result.data
  return next()
}

const createCorsOriginValidator = (origins) => (origin, callback) => {
  if (!origin) return callback(null, true)
  if (origins === '*') return callback(null, true)
  if (origins.includes(origin)) return callback(null, true)
  return callback(new Error('CORS origin denied'))
}

const handleAppError = (error, _req, res, _next) => {
  if (error instanceof Error && error.message.includes('CORS')) {
    return res.status(403).json({ message: 'CORS origin denied.' })
  }
  return res.status(500).json({ message: 'Internal server error.' })
}

const app = express()
app.set('trust proxy', 1)
app.use(
  helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: false,
  }),
)
app.use(
  cors({
    origin: createCorsOriginValidator(allowedOrigins),
    credentials: true,
  }),
)
app.use(express.json({ limit: '3mb' }))

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Terlalu banyak percobaan login. Coba lagi nanti.' },
})

const certificateVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Terlalu banyak request verifikasi. Coba lagi nanti.' },
})

const requireAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    if (!token) return res.status(401).json({ message: 'Missing authorization token.' })

    const db = await readDb()
    if (db.revokedTokens.includes(token)) {
      return res.status(401).json({ message: 'Token has been revoked.' })
    }

    const payload = jwt.verify(token, JWT_SECRET)
    const user = db.users.find((item) => item.id === payload.sub)
    if (!user || user.status !== 'active') {
      return res.status(401).json({ message: 'Invalid session user.' })
    }

    req.token = token
    req.auth = payload
    req.user = user
    req.db = db
    return next()
  } catch {
    return res.status(401).json({ message: 'Unauthorized.' })
  }
}

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required.' })
  }
  return next()
}

const requireQuizManager = (req, res, next) => {
  if (!canManageQuizRole(req.db, req.user)) {
    return res.status(403).json({ message: 'Quiz manager access required.' })
  }
  return next()
}

const requireCourseManager = (req, res, next) => {
  if (!canReviewAssignmentRole(req.db, req.user)) {
    return res.status(403).json({ message: 'Course manager access required.' })
  }
  return next()
}

const requireCertificateManager = (req, res, next) => {
  if (!canManageCertificateRole(req.db, req.user)) {
    return res.status(403).json({ message: 'Certificate manager access required.' })
  }
  return next()
}

const requireCoursePermission = (permissionKey) => (req, res, next) => {
  const permissions = getCourseManagementPermissionsForUser(req.db, req.user)
  if (!permissions?.[permissionKey]) {
    return res.status(403).json({ message: `Course management permission "${permissionKey}" required.` })
  }
  return next()
}

app.post('/api/auth/login', loginLimiter, validateBody(loginSchema), async (req, res) => {
  const email = normalizeEmail(req.body.email)
  const password = req.body.password
  const db = await readDb()
  const user = db.users.find((item) => normalizeEmail(item.email) === email)

  if (!user) return res.status(401).json({ message: 'Email tidak ditemukan.' })
  if (user.status !== 'active') return res.status(403).json({ message: 'Akun belum aktif atau suspended.' })

  const isPasswordMatch = await checkPasswordAndUpgrade(db, email, password)
  if (!isPasswordMatch) {
    return res.status(401).json({ message: 'Password tidak sesuai.' })
  }

  user.lastLogin = nowStamp()
  addAuditLog(db, {
    actor: user.email,
    action: 'auth_login',
    target: user.id,
    detail: 'User logged in successfully.',
  })
  await writeDb(db)

  const issuedAt = Date.now()
  const token = jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN },
  )
  const decoded = jwt.decode(token)
  const expiresAt = decoded?.exp ? decoded.exp * 1000 : issuedAt + 1000 * 60 * 60 * 12

  return res.json({
    token,
    user: toSafeUser(user),
    issuedAt,
    expiresAt,
  })
})

app.get('/api/auth/session', requireAuth, async (req, res) => {
  const decoded = jwt.decode(req.token)
  return res.json({
    user: toSafeUser(req.user),
    expiresAt: decoded?.exp ? decoded.exp * 1000 : Date.now() + 1000 * 60 * 60,
  })
})

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  req.db.revokedTokens = [...req.db.revokedTokens, req.token].slice(-400)
  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'auth_logout',
    target: req.user.id,
    detail: 'User logged out.',
  })
  await writeDb(req.db)
  return res.status(204).send()
})

app.get('/api/profile', requireAuth, async (req, res) => {
  const state = req.db.profiles[req.user.id] || createDefaultProfileState(req.user)
  req.db.profiles[req.user.id] = state
  await writeDb(req.db)
  return res.json(state)
})

app.patch('/api/profile/account', requireAuth, validateBody(profileAccountPatchSchema), async (req, res) => {
  const current = req.db.profiles[req.user.id] || createDefaultProfileState(req.user)
  const next = {
    ...current,
    profile: { ...current.profile, ...(req.body || {}) },
  }
  req.db.profiles[req.user.id] = next
  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'profile_account_update',
    target: req.user.id,
    detail: 'Profile account fields updated.',
  })
  await writeDb(req.db)
  return res.json(next)
})

app.patch('/api/profile/preferences', requireAuth, validateBody(profilePreferencesPatchSchema), async (req, res) => {
  const current = req.db.profiles[req.user.id] || createDefaultProfileState(req.user)
  const next = {
    ...current,
    preferences: { ...current.preferences, ...(req.body || {}) },
  }
  req.db.profiles[req.user.id] = next
  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'profile_preferences_update',
    target: req.user.id,
    detail: 'Profile preferences updated.',
  })
  await writeDb(req.db)
  return res.json(next)
})

app.post('/api/profile/password', requireAuth, validateBody(passwordUpdateSchema), async (req, res) => {
  const email = normalizeEmail(req.user.email)
  const currentHash = req.db.credentials[email]
  if (!currentHash || !(await bcrypt.compare(req.body.currentPassword, currentHash))) {
    return res.status(400).json({ message: 'Current password tidak sesuai.' })
  }

  if (req.body.currentPassword === req.body.newPassword) {
    return res.status(400).json({ message: 'Password baru harus berbeda dari password lama.' })
  }

  req.db.credentials[email] = await hashPassword(req.body.newPassword)
  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'profile_password_update',
    target: req.user.id,
    detail: 'Password updated.',
  })
  await writeDb(req.db)
  return res.json({ ok: true })
})

app.post('/api/profile/reset', requireAuth, async (req, res) => {
  const next = createDefaultProfileState(req.user)
  req.db.profiles[req.user.id] = next
  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'profile_reset',
    target: req.user.id,
    detail: 'Profile reset to defaults.',
  })
  await writeDb(req.db)
  return res.json(next)
})

app.put('/api/profile', requireAuth, validateBody(profileStateSchema), async (req, res) => {
  req.db.profiles[req.user.id] = req.body
  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'profile_replace',
    target: req.user.id,
    detail: 'Profile full state replaced.',
  })
  await writeDb(req.db)
  return res.json(req.body)
})

app.get('/api/users', requireAuth, requireAdmin, async (req, res) => {
  return res.json(req.db.users)
})

app.get('/api/users/permissions', requireAuth, requireAdmin, async (req, res) => {
  return res.json(req.db.permissionMatrix)
})

app.put('/api/users/permissions', requireAuth, requireAdmin, validateBody(permissionMatrixSchema), async (req, res) => {
  req.db.permissionMatrix = req.body
  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'users_permissions_update',
    target: 'permission_matrix',
    detail: 'Permission matrix updated.',
  })
  await writeDb(req.db)
  return res.json(req.db.permissionMatrix)
})

app.post('/api/users', requireAuth, requireAdmin, validateBody(userSaveSchema), async (req, res) => {
  const payload = req.body
  const normalizedEmail = normalizeEmail(payload.email)

  if (payload.id) {
    const existing = req.db.users.find((user) => user.id === payload.id)
    if (!existing) return res.status(404).json({ message: 'User not found.' })

    const duplicate = req.db.users.find((user) => user.id !== payload.id && normalizeEmail(user.email) === normalizedEmail)
    if (duplicate) return res.status(409).json({ message: 'Email sudah digunakan user lain.' })

    const oldEmail = normalizeEmail(existing.email)
    req.db.users = req.db.users.map((user) => (user.id === payload.id ? { ...user, ...payload } : user))

    if (oldEmail !== normalizedEmail) {
      const oldCredential = req.db.credentials[oldEmail]
      if (oldCredential) {
        req.db.credentials[normalizedEmail] = oldCredential
        delete req.db.credentials[oldEmail]
      }
    }

    if (req.db.profiles[payload.id]) {
      req.db.profiles[payload.id].profile = {
        ...req.db.profiles[payload.id].profile,
        name: payload.name,
        email: payload.email,
        accessRole: payload.role,
        role: accessLevels[payload.role] || payload.role,
      }
    }

    addAuditLog(req.db, {
      actor: req.user.email,
      action: 'users_update',
      target: payload.id,
      detail: `${payload.email} updated (${payload.role}/${payload.status}).`,
    })
    await writeDb(req.db)
    return res.json(req.db.users)
  }

  const duplicate = req.db.users.find((user) => normalizeEmail(user.email) === normalizedEmail)
  if (duplicate) return res.status(409).json({ message: 'Email sudah terdaftar.' })

  const created = {
    id: `u-${Math.random().toString(36).slice(2, 8)}`,
    name: payload.name,
    email: payload.email,
    role: payload.role,
    status: payload.status,
    lastLogin: '-',
  }

  req.db.users = [created, ...req.db.users]
  req.db.credentials[normalizedEmail] = await hashPassword('changeme123')
  req.db.profiles[created.id] = createDefaultProfileState(created)
  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'users_create',
    target: created.id,
    detail: `${created.email} created (${created.role}/${created.status}).`,
  })
  await writeDb(req.db)
  return res.json(req.db.users)
})

app.post('/api/users/invite', requireAuth, requireAdmin, validateBody(userInviteSchema), async (req, res) => {
  const payload = req.body
  const normalizedEmail = normalizeEmail(payload.email)
  const duplicate = req.db.users.find((user) => normalizeEmail(user.email) === normalizedEmail)
  if (duplicate) return res.status(409).json({ message: 'Email sudah terdaftar.' })

  const created = {
    id: `u-${Math.random().toString(36).slice(2, 8)}`,
    name: payload.name,
    email: payload.email,
    role: payload.role,
    status: 'pending',
    lastLogin: '-',
  }

  req.db.users = [created, ...req.db.users]
  req.db.credentials[normalizedEmail] = await hashPassword('changeme123')
  req.db.profiles[created.id] = createDefaultProfileState(created)
  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'users_invite',
    target: created.id,
    detail: `${created.email} invited as ${created.role}.`,
  })
  await writeDb(req.db)
  return res.json(req.db.users)
})

app.delete('/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params
  const target = req.db.users.find((user) => user.id === id)
  if (!target) return res.status(404).json({ message: 'User not found.' })

  req.db.users = req.db.users.filter((user) => user.id !== id)
  delete req.db.profiles[id]
  delete req.db.credentials[normalizeEmail(target.email)]
  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'users_delete',
    target: id,
    detail: `${target.email} deleted.`,
  })
  await writeDb(req.db)
  return res.json(req.db.users)
})

app.post('/api/users/bulk-delete', requireAuth, requireAdmin, validateBody(idsSchema), async (req, res) => {
  const ids = req.body.ids
  const idSet = new Set(ids)

  const removedUsers = req.db.users.filter((user) => idSet.has(user.id))
  req.db.users = req.db.users.filter((user) => !idSet.has(user.id))

  removedUsers.forEach((user) => {
    delete req.db.profiles[user.id]
    delete req.db.credentials[normalizeEmail(user.email)]
  })

  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'users_bulk_delete',
    target: 'bulk',
    detail: `${removedUsers.length} users deleted.`,
  })
  await writeDb(req.db)
  return res.json(req.db.users)
})

app.post('/api/users/bulk-status', requireAuth, requireAdmin, validateBody(bulkStatusSchema), async (req, res) => {
  const { ids, status } = req.body
  const idSet = new Set(ids)
  req.db.users = req.db.users.map((user) => (idSet.has(user.id) ? { ...user, status } : user))
  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'users_bulk_status',
    target: 'bulk',
    detail: `${ids.length} users changed to ${status}.`,
  })
  await writeDb(req.db)
  return res.json(req.db.users)
})

app.post('/api/users/:id/toggle-status', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params
  const target = req.db.users.find((user) => user.id === id)
  if (!target) return res.status(404).json({ message: 'User not found.' })

  req.db.users = req.db.users.map((user) => {
    if (user.id !== id) return user
    return {
      ...user,
      status: user.status === 'active' ? 'suspended' : 'active',
    }
  })
  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'users_toggle_status',
    target: id,
    detail: `${target.email} status toggled.`,
  })
  await writeDb(req.db)
  return res.json(req.db.users)
})

app.post('/api/users/:id/reset-password', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params
  const target = req.db.users.find((user) => user.id === id)
  if (!target) return res.status(404).json({ message: 'User not found.' })

  req.db.users = req.db.users.map((user) => (user.id === id ? { ...user, lastLogin: nowStamp() } : user))
  req.db.credentials[normalizeEmail(target.email)] = await hashPassword('changeme123')
  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'users_reset_password',
    target: id,
    detail: `${target.email} password reset to temporary value.`,
  })
  await writeDb(req.db)
  return res.json(req.db.users)
})

app.post('/api/uploads', requireAuth, validateBody(uploadCreateSchema), async (req, res) => {
  const parsed = parseDataUrl(req.body.dataUrl)
  if (!parsed) return res.status(400).json({ message: 'Invalid dataUrl payload.' })
  const detectedMime = detectMimeFromBuffer(parsed.buffer)
  const validated = validateUploadMimeAndExtension(req.body.fileName, parsed.mimeType, detectedMime)
  if (!validated.ok) return res.status(400).json({ message: validated.message })
  if (parsed.buffer.length > MAX_ASSIGNMENT_UPLOAD_BYTES) {
    return res.status(400).json({ message: 'File size exceeds 2MB limit.' })
  }
  const nextUsage = calculateUserUploadUsage(req.db, req.user.id, req.body.purpose || 'assignment') + parsed.buffer.length
  if (nextUsage > MAX_ASSIGNMENT_UPLOAD_TOTAL_BYTES) {
    return res.status(400).json({ message: 'User upload quota exceeded (20MB).' })
  }

  const seq = req.db.nextUploadSeq || 1
  const uploadId = `upl-${seq}`
  req.db.nextUploadSeq = seq + 1

  const safeName = validated.normalizedFileName
  const storageName = `${uploadId}-${safeName}`
  await storageAdapter.put(storageName, parsed.buffer, {
    ownerId: req.user.id,
    purpose: req.body.purpose || 'assignment',
    mimeType: validated.mimeType,
    fileName: req.body.fileName,
  })

  req.db.uploads[uploadId] = {
    id: uploadId,
    fileName: req.body.fileName,
    safeName,
    storageName,
    mimeType: validated.mimeType,
    sizeBytes: parsed.buffer.length,
    ownerId: req.user.id,
    purpose: req.body.purpose || 'assignment',
    uploadedAt: new Date().toISOString(),
  }

  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'upload_create',
    target: uploadId,
    detail: `Uploaded file ${req.body.fileName}.`,
  })
  await writeDb(req.db)

  return res.status(201).json({
    id: uploadId,
    fileName: req.body.fileName,
    mimeType: validated.mimeType,
    sizeBytes: parsed.buffer.length,
    uploadedAt: req.db.uploads[uploadId].uploadedAt,
    downloadUrl: getUploadDownloadUrl(uploadId),
    signedUrlEndpoint: getUploadSignedUrlEndpoint(uploadId),
  })
})

app.get('/api/uploads/:uploadId/data', requireAuth, async (req, res) => {
  const upload = req.db.uploads?.[req.params.uploadId]
  if (!upload) return res.status(404).json({ message: 'Upload not found.' })
  if (!canAccessUpload(req.db, req.user, upload)) {
    return res.status(403).json({ message: 'Not allowed to access this file.' })
  }
  try {
    const fileBuffer = await storageAdapter.get(upload.storageName)
    const dataUrl = `data:${upload.mimeType};base64,${fileBuffer.toString('base64')}`
    return res.json({
      id: upload.id,
      fileName: upload.fileName,
      mimeType: upload.mimeType,
      sizeBytes: upload.sizeBytes,
      dataUrl,
    })
  } catch {
    return res.status(404).json({ message: 'Stored file not found.' })
  }
})

app.get('/api/uploads/:uploadId/url', requireAuth, async (req, res) => {
  const upload = req.db.uploads?.[req.params.uploadId]
  if (!upload) return res.status(404).json({ message: 'Upload not found.' })
  if (!canAccessUpload(req.db, req.user, upload)) {
    return res.status(403).json({ message: 'Not allowed to access this file.' })
  }
  if (!storageAdapter.supportsPublicSignedUrl) {
    return res.json({
      url: '',
      requiresAuth: true,
      fallbackDataEndpoint: getUploadDownloadUrl(upload.id),
    })
  }

  const signedUrl = await storageAdapter.getSignedUrl(upload.storageName, upload.fileName)
  return res.json({
    url: signedUrl,
    requiresAuth: false,
    expiresInSec: Math.max(60, Math.min(S3_SIGNED_URL_EXPIRES_SEC, 60 * 60)),
  })
})

app.get('/api/certificates/templates', requireAuth, requireCertificateManager, async (req, res) => {
  const templates = (Array.isArray(req.db.certificateTemplates) ? req.db.certificateTemplates : [])
    .map((item) => normalizeCertificateTemplatePayload(item))
    .filter((item) => item.id && item.title && item.courseId)
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
  return res.json(templates)
})

app.get('/api/certificates/recipients', requireAuth, requireCertificateManager, async (req, res) => {
  const users = (Array.isArray(req.db.users) ? req.db.users : [])
    .filter((user) => user.status === 'active')
    .map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    }))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
  return res.json(users)
})

app.get('/api/certificates/templates/:id', requireAuth, requireCertificateManager, async (req, res) => {
  const template = (req.db.certificateTemplates || []).find((item) => item.id === req.params.id)
  if (!template) return res.status(404).json({ message: 'Template not found.' })
  return res.json(normalizeCertificateTemplatePayload(template))
})

app.post('/api/certificates/templates', requireAuth, requireCertificateManager, validateBody(certificateTemplateSaveSchema), async (req, res) => {
  const templates = Array.isArray(req.db.certificateTemplates) ? req.db.certificateTemplates.slice() : []
  const nowIso = new Date().toISOString()
  const payloadId = String(req.body.id || '').trim()
  const existing = payloadId ? templates.find((item) => item.id === payloadId) : null
  const generatedId = `certtpl-${String(req.db?.certificateCounters?.template || 1).padStart(4, '0')}`
  const id = existing?.id || payloadId || generatedId
  const normalized = normalizeCertificateTemplatePayload(
    {
      ...req.body,
      id,
      updatedAt: nowIso,
      createdAt: existing?.createdAt || req.body.createdAt || nowIso,
    },
    existing,
  )
  if (!normalized.title) return res.status(400).json({ message: 'Title wajib diisi.' })
  if (!normalized.courseId) return res.status(400).json({ message: 'Course wajib dipilih.' })
  if (existing?.status === 'published') {
    const allowArchiveOnly = normalized.status === 'archived'
    if (!allowArchiveOnly) {
      return res.status(409).json({ message: 'Template published terkunci. Duplicate template baru atau ubah status ke archived.' })
    }
  }
  const duplicateId = templates.some((item) => item.id === id && item.id !== existing?.id)
  if (duplicateId) return res.status(409).json({ message: 'Template ID sudah digunakan.' })

  if (!existing && !payloadId) {
    req.db.certificateCounters.template = Math.max(1, Number(req.db?.certificateCounters?.template || 1)) + 1
  }

  req.db.certificateTemplates = existing
    ? templates.map((item) => (item.id === id ? normalized : item))
    : [normalized, ...templates]
  addAuditLog(req.db, {
    actor: req.user.email,
    action: existing ? 'certificate_template_update' : 'certificate_template_create',
    target: normalized.id,
    detail: `${existing ? 'Updated' : 'Created'} certificate template ${normalized.title}.`,
  })
  await writeDb(req.db)
  return res.json(normalized)
})

app.delete('/api/certificates/templates/:id', requireAuth, requireCertificateManager, async (req, res) => {
  const templates = Array.isArray(req.db.certificateTemplates) ? req.db.certificateTemplates.slice() : []
  const target = templates.find((item) => item.id === req.params.id)
  if (!target) return res.status(404).json({ message: 'Template not found.' })
  const hasIssued = (req.db.certificateIssuances || []).some((item) => item.templateId === target.id)
  if (hasIssued) return res.status(409).json({ message: 'Template sudah dipakai issuance, tidak dapat dihapus.' })
  req.db.certificateTemplates = templates.filter((item) => item.id !== req.params.id)
  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'certificate_template_delete',
    target: target.id,
    detail: `Deleted certificate template ${target.title}.`,
  })
  await writeDb(req.db)
  return res.status(204).send()
})

app.post('/api/certificates/templates/:id/duplicate', requireAuth, requireCertificateManager, async (req, res) => {
  const templates = Array.isArray(req.db.certificateTemplates) ? req.db.certificateTemplates.slice() : []
  const source = templates.find((item) => item.id === req.params.id)
  if (!source) return res.status(404).json({ message: 'Template not found.' })
  const nowIso = new Date().toISOString()
  const newId = `certtpl-${String(req.db?.certificateCounters?.template || 1).padStart(4, '0')}`
  req.db.certificateCounters.template = Math.max(1, Number(req.db?.certificateCounters?.template || 1)) + 1
  const duplicated = normalizeCertificateTemplatePayload({
    ...source,
    id: newId,
    title: `${source.title} (Copy)`,
    status: 'draft',
    createdAt: nowIso,
    updatedAt: nowIso,
  })
  req.db.certificateTemplates = [duplicated, ...templates]
  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'certificate_template_duplicate',
    target: duplicated.id,
    detail: `Duplicated template ${source.id} to ${duplicated.id}.`,
  })
  await writeDb(req.db)
  return res.json(duplicated)
})

app.get('/api/certificates/issuances', requireAuth, requireCertificateManager, async (req, res) => {
  const limit = Math.max(1, Math.min(Number(req.query.limit || 200), 1000))
  const items = (Array.isArray(req.db.certificateIssuances) ? req.db.certificateIssuances : [])
    .map((item) => normalizeCertificateIssuancePayload(item))
    .sort((a, b) => String(b.issuedAt || '').localeCompare(String(a.issuedAt || '')))
    .slice(0, limit)
    .map((item) => ({ ...item, status: resolveCertificateStatus(item) }))
  return res.json(items)
})

app.post('/api/certificates/issuances', requireAuth, requireCertificateManager, validateBody(certificateIssueSchema), async (req, res) => {
  const templates = Array.isArray(req.db.certificateTemplates) ? req.db.certificateTemplates : []
  const template = templates.find((item) => item.id === req.body.templateId)
  if (!template) return res.status(404).json({ message: 'Template tidak ditemukan.' })
  if (template.status !== 'published') {
    return res.status(409).json({ message: 'Template harus published sebelum issue.' })
  }
  const recipient = (Array.isArray(req.db.users) ? req.db.users : []).find((item) => item.id === req.body.recipientUserId)
  if (!recipient) return res.status(404).json({ message: 'Recipient user tidak ditemukan.' })
  if (recipient.status !== 'active') return res.status(409).json({ message: 'Recipient user tidak aktif.' })
  const courseId = String(req.body.courseId || template.courseId || '').trim()
  const issued = createIssuedCertificateRecord(req.db, {
    template,
    courseId,
    recipient,
    score: req.body.score,
    issuedBy: req.user,
  })
  req.db.certificateIssuances = [issued, ...(Array.isArray(req.db.certificateIssuances) ? req.db.certificateIssuances : [])]
  const syncedRecipient = syncIssuedCertificateToProfile(req.db, issued)
  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'certificate_issue',
    target: issued.id,
    detail: `Issued certificate ${issued.certificateNo} for ${issued.recipientName}${syncedRecipient ? ` and synced to ${syncedRecipient.email}` : ''}.`,
  })
  await writeDb(req.db)
  return res.status(201).json(issued)
})

app.post('/api/certificates/issuances/bulk', requireAuth, requireCertificateManager, validateBody(certificateBulkIssueSchema), async (req, res) => {
  const templates = Array.isArray(req.db.certificateTemplates) ? req.db.certificateTemplates : []
  const template = templates.find((item) => item.id === req.body.templateId)
  if (!template) return res.status(404).json({ message: 'Template tidak ditemukan.' })
  if (template.status !== 'published') {
    return res.status(409).json({ message: 'Template harus published sebelum issue.' })
  }
  const userMap = new Map((Array.isArray(req.db.users) ? req.db.users : []).map((item) => [item.id, item]))
  const recipientIds = [...new Set((Array.isArray(req.body.recipientUserIds) ? req.body.recipientUserIds : []).map((id) => String(id || '').trim()).filter(Boolean))]
  const invalidIds = recipientIds.filter((id) => !userMap.has(id))
  if (invalidIds.length) {
    return res.status(404).json({ message: `Recipient user tidak ditemukan: ${invalidIds.slice(0, 10).join(', ')}` })
  }
  const inactiveIds = recipientIds.filter((id) => userMap.get(id)?.status !== 'active')
  if (inactiveIds.length) {
    return res.status(409).json({ message: `Recipient user tidak aktif: ${inactiveIds.slice(0, 10).join(', ')}` })
  }
  const courseId = String(req.body.courseId || template.courseId || '').trim()
  const issuedItems = recipientIds.map((id) =>
    createIssuedCertificateRecord(req.db, {
      template,
      courseId,
      recipient: userMap.get(id),
      score: req.body.score,
      issuedBy: req.user,
    }),
  )
  req.db.certificateIssuances = [...issuedItems, ...(Array.isArray(req.db.certificateIssuances) ? req.db.certificateIssuances : [])]
  issuedItems.forEach((item) => {
    syncIssuedCertificateToProfile(req.db, item)
  })
  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'certificate_issue_bulk',
    target: template.id,
    detail: `Bulk issued ${issuedItems.length} certificate(s) using template ${template.id}.`,
  })
  await writeDb(req.db)
  return res.status(201).json({
    total: issuedItems.length,
    items: issuedItems,
  })
})

app.post('/api/certificates/issuances/:id/revoke', requireAuth, requireCertificateManager, validateBody(certificateRevokeSchema), async (req, res) => {
  const issuances = Array.isArray(req.db.certificateIssuances) ? req.db.certificateIssuances.slice() : []
  const target = issuances.find((item) => item.id === req.params.id)
  if (!target) return res.status(404).json({ message: 'Issuance not found.' })
  const revoked = normalizeCertificateIssuancePayload({
    ...target,
    status: 'revoked',
    revokedAt: new Date().toISOString(),
    revokedReason: req.body.reason || target.revokedReason || '',
  })
  req.db.certificateIssuances = issuances.map((item) => (item.id === req.params.id ? revoked : item))
  const recipient = findCertificateRecipientUser(req.db, {
    recipientUserId: revoked.recipientUserId,
    recipientEmail: revoked.recipientEmail,
    recipientName: revoked.recipientName,
  })
  if (recipient?.id) {
    const profileState = req.db.profiles?.[recipient.id] || createDefaultProfileState(recipient)
    const previousCertificate = (Array.isArray(profileState.certificates) ? profileState.certificates : []).find(
      (item) => String(item?.certificateNo || '') === revoked.certificateNo,
    )
    const nextCertificates = (Array.isArray(profileState.certificates) ? profileState.certificates : []).map((item) =>
      String(item?.certificateNo || '') === revoked.certificateNo
        ? {
            ...item,
            status: 'revoked',
          }
        : item,
    )
    const shouldDecreaseCompleted = previousCertificate && String(previousCertificate?.status || 'issued') !== 'revoked'
    const currentCompleted = Math.max(0, Number(profileState?.stats?.coursesCompleted || 0))
    const nextCompleted = shouldDecreaseCompleted ? Math.max(0, currentCompleted - 1) : currentCompleted
    const activeCertificateCount = nextCertificates.filter((item) => String(item?.status || 'issued') !== 'revoked').length
    const badgeSet = new Set((Array.isArray(profileState.badges) ? profileState.badges : []).map((row) => String(row || '').trim()).filter(Boolean))
    if (activeCertificateCount > 0) badgeSet.add('Certificate Earner')
    if (activeCertificateCount >= 3) badgeSet.add('Certified Learner')
    if (activeCertificateCount <= 0) badgeSet.delete('Certificate Earner')
    if (activeCertificateCount < 3) badgeSet.delete('Certified Learner')
    req.db.profiles[recipient.id] = {
      ...profileState,
      stats: {
        ...(profileState.stats || {}),
        coursesCompleted: nextCompleted,
      },
      certificates: nextCertificates,
      badges: [...badgeSet],
    }
  }
  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'certificate_revoke',
    target: revoked.id,
    detail: `Revoked certificate ${revoked.certificateNo}.`,
  })
  await writeDb(req.db)
  return res.json(revoked)
})

app.get('/api/certificates/stats', requireAuth, requireCertificateManager, async (req, res) => {
  const templates = Array.isArray(req.db.certificateTemplates) ? req.db.certificateTemplates.length : 0
  const issuances = Array.isArray(req.db.certificateIssuances) ? req.db.certificateIssuances.length : 0
  return res.json({
    schemaVersion: Number(req.db.certificateSchemaVersion || 2),
    templates,
    issuances,
  })
})

app.get('/api/certificates/issuances/export.csv', requireAuth, requireCertificateManager, async (req, res) => {
  const rows = (Array.isArray(req.db.certificateIssuances) ? req.db.certificateIssuances : [])
    .map((item) => normalizeCertificateIssuancePayload(item))
    .sort((a, b) => String(b.issuedAt || '').localeCompare(String(a.issuedAt || '')))
  const header = ['certificateNo', 'verificationCode', 'templateId', 'templateTitle', 'courseId', 'courseTitle', 'recipientUserId', 'recipientName', 'recipientEmail', 'status', 'issuedAt', 'expiresAt', 'score']
  const escape = (value) => `"${String(value ?? '').replace(/\"/g, '""')}"`
  const lines = [header.join(',')]
  rows.forEach((item) => {
    lines.push(
      [
        item.certificateNo,
        item.verificationCode,
        item.templateId,
        item.templateTitle,
        item.courseId,
        item.courseTitle,
        item.recipientUserId,
        item.recipientName,
        item.recipientEmail,
        resolveCertificateStatus(item),
        item.issuedAt,
        item.expiresAt || '',
        item.score ?? '',
      ]
        .map(escape)
        .join(','),
    )
  })
  const csv = lines.join('\n')
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename=\"certificate-issuances-${new Date().toISOString().slice(0, 10)}.csv\"`)
  return res.status(200).send(csv)
})

app.get('/api/certificates/verify/:code', certificateVerifyLimiter, async (req, res) => {
  const code = toCertificateCode(req.params.code || '')
  if (!code) return res.status(400).json({ message: 'Verification code is required.' })
  const db = await readDb()
  const items = Array.isArray(db.certificateIssuances) ? db.certificateIssuances : []
  const issuance = items
    .map((item) => normalizeCertificateIssuancePayload(item))
    .find((item) => toCertificateCode(item.verificationCode) === code || toCertificateCode(item.certificateNo) === code)
  if (!issuance) return res.status(404).json({ message: 'Certificate not found.' })
  const template = (db.certificateTemplates || [])
    .map((item) => normalizeCertificateTemplatePayload(item))
    .find((item) => item.id === issuance.templateId) || null
  const status = resolveCertificateStatus(issuance)
  return res.json({
    status: status === 'issued' ? 'valid' : status,
    issuance: { ...issuance, status },
    template,
  })
})

app.get('/api/course-management/permissions', requireAuth, requireCourseManager, requireCoursePermission('view'), async (req, res) => {
  return res.json(getCourseManagementPermissionsForUser(req.db, req.user))
})

app.get('/api/course-management/permissions/matrix', requireAuth, requireAdmin, async (req, res) => {
  return res.json(normalizeCourseManagementPermissionMatrix(req.db.courseManagementPermissions))
})

app.put('/api/course-management/permissions/matrix', requireAuth, requireAdmin, validateBody(courseManagementPermissionMatrixSchema), async (req, res) => {
  req.db.courseManagementPermissions = normalizeCourseManagementPermissionMatrix(req.body)
  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'course_mgmt_permissions_update',
    target: 'course_management_permission_matrix',
    detail: 'Course management permission matrix updated.',
  })
  await writeDb(req.db)
  return res.json(req.db.courseManagementPermissions)
})

app.get('/api/course-management', requireAuth, requireCourseManager, requireCoursePermission('view'), async (req, res) => {
  const items = Array.isArray(req.db.courseManagement) ? req.db.courseManagement : []
  const sorted = items
    .slice()
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
  return res.json(sorted)
})

app.post('/api/course-management', requireAuth, requireCourseManager, validateBody(courseManagementSaveSchema), async (req, res) => {
  const payload = normalizeCourseManagementPayload(req.body)
  const courses = Array.isArray(req.db.courseManagement) ? req.db.courseManagement.slice() : []
  const nowIso = new Date().toISOString()
  const isUpdate = Boolean(payload.id) && courses.some((item) => item.id === payload.id)
  if (isUpdate && !getCourseManagementPermissionsForUser(req.db, req.user).edit) {
    return res.status(403).json({ message: 'Course management permission "edit" required.' })
  }
  if (!isUpdate && !getCourseManagementPermissionsForUser(req.db, req.user).create) {
    return res.status(403).json({ message: 'Course management permission "create" required.' })
  }
  const targetId = payload.id || `course-${Math.random().toString(36).slice(2, 9)}`
  const existing = courses.find((item) => item.id === targetId) || null
  const sameSlug = courses.find((item) => item.id !== targetId && toSlug(item.slug) === toSlug(payload.slug))
  if (sameSlug) {
    return res.status(409).json({ message: 'Slug sudah digunakan course lain.' })
  }

  if (isUpdate) {
    if (!Number.isFinite(Number(req.body.version))) {
      return res.status(409).json({
        message: 'Course version is required for update.',
        latest: existing,
      })
    }
    if (Number(existing?.version || 1) !== Number(req.body.version)) {
      return res.status(409).json({
        message: 'Course has changed on server. Refresh data first.',
        latest: existing,
      })
    }
  }

  const nextCourse = {
    ...payload,
    id: targetId,
    version: isUpdate ? Number(existing?.version || 1) + 1 : 1,
    createdAt: existing?.createdAt || nowIso,
    updatedAt: nowIso,
    revisions: Array.isArray(existing?.revisions) ? existing.revisions : [],
  }
  if (nextCourse.publishAt || nextCourse.unpublishAt) {
    if (!getCourseManagementPermissionsForUser(req.db, req.user).schedule) {
      return res.status(403).json({ message: 'Course management permission "schedule" required.' })
    }
  }
  if (nextCourse.status === 'published' || nextCourse.status === 'scheduled') {
    if (!getCourseManagementPermissionsForUser(req.db, req.user).publish) {
      return res.status(403).json({ message: 'Course management permission "publish" required.' })
    }
  }
  const peerCourses = courses.filter((item) => item.id !== targetId)
  const validation = validateCourseManagementIntegrity(nextCourse, [...peerCourses, nextCourse])
  if (validation.hasIntegrityError) {
    return res.status(422).json({
      message: 'Course integrity validation failed.',
      errors: validation.checks.filter((item) => !item.passed).map((item) => item.id),
      cyclePath: validation.cyclePath,
      invalidPrerequisites: validation.invalidPrerequisites,
    })
  }
  if (nextCourse.status === 'published' || nextCourse.status === 'scheduled') {
    if (validation.hasPublishGap) {
      return res.status(422).json({
        message: 'Course belum memenuhi publish checklist.',
        errors: validation.publishChecks.filter((item) => !item.passed).map((item) => item.id),
      })
    }
  }
  if (isUpdate && existing) {
    nextCourse.revisions = [buildCourseRevisionEntry(existing, 'updated', req.user.email), ...(existing.revisions || [])].slice(0, 40)
  } else if (!isUpdate) {
    nextCourse.revisions = [buildCourseRevisionEntry(nextCourse, 'created', req.user.email)]
  }

  req.db.courseManagement = isUpdate ? courses.map((item) => (item.id === targetId ? nextCourse : item)) : [nextCourse, ...courses]
  addAuditLog(req.db, {
    actor: req.user.email,
    action: isUpdate ? 'course_mgmt_update' : 'course_mgmt_create',
    target: nextCourse.id,
    detail: `${isUpdate ? 'Updated' : 'Created'} managed course ${nextCourse.title}.`,
  })
  await writeDb(req.db)
  return res.json(nextCourse)
})

app.get('/api/course-management/:id/revisions', requireAuth, requireCourseManager, requireCoursePermission('history'), async (req, res) => {
  const target = (req.db.courseManagement || []).find((item) => item.id === req.params.id)
  if (!target) return res.status(404).json({ message: 'Course not found.' })
  return res.json(Array.isArray(target.revisions) ? target.revisions : [])
})

app.post('/api/course-management/:id/revisions/:revisionId/restore', requireAuth, requireCourseManager, requireCoursePermission('restoreRevision'), async (req, res) => {
  const courses = Array.isArray(req.db.courseManagement) ? req.db.courseManagement.slice() : []
  const target = courses.find((item) => item.id === req.params.id)
  if (!target) return res.status(404).json({ message: 'Course not found.' })
  const revisions = Array.isArray(target.revisions) ? target.revisions : []
  const revision = revisions.find((item) => item.id === req.params.revisionId)
  if (!revision || !revision.snapshot) {
    return res.status(404).json({ message: 'Revision not found.' })
  }
  const restored = normalizeCourseManagementPayload({
    ...revision.snapshot,
    id: target.id,
  })
  const nextCourse = {
    ...restored,
    id: target.id,
    version: Number(target.version || 1) + 1,
    createdAt: target.createdAt || restored.createdAt,
    updatedAt: new Date().toISOString(),
    revisions: [buildCourseRevisionEntry(target, `restore:${revision.id}`, req.user.email), ...revisions].slice(0, 40),
  }
  const validation = validateCourseManagementIntegrity(nextCourse, courses.map((item) => (item.id === nextCourse.id ? nextCourse : item)))
  if (validation.hasIntegrityError || (['published', 'scheduled'].includes(nextCourse.status) && validation.hasPublishGap)) {
    return res.status(422).json({
      message: 'Restored revision tidak valid untuk kondisi saat ini.',
      errors: validation.publishChecks.filter((item) => !item.passed).map((item) => item.id),
      cyclePath: validation.cyclePath,
      invalidPrerequisites: validation.invalidPrerequisites,
    })
  }
  req.db.courseManagement = courses.map((item) => (item.id === nextCourse.id ? nextCourse : item))
  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'course_mgmt_restore_revision',
    target: nextCourse.id,
    detail: `Restored managed course from revision ${revision.id}.`,
  })
  await writeDb(req.db)
  return res.json(nextCourse)
})

app.patch('/api/course-management/:id/status', requireAuth, requireCourseManager, validateBody(courseManagementStatusPatchSchema), async (req, res) => {
  const courses = Array.isArray(req.db.courseManagement) ? req.db.courseManagement.slice() : []
  const target = courses.find((item) => item.id === req.params.id)
  if (!target) return res.status(404).json({ message: 'Course not found.' })
  const permissions = getCourseManagementPermissionsForUser(req.db, req.user)
  if (req.body.status === 'published' || req.body.status === 'scheduled') {
    if (!permissions.publish) {
      return res.status(403).json({ message: 'Course management permission "publish" required.' })
    }
  } else if (!permissions.edit) {
    return res.status(403).json({ message: 'Course management permission "edit" required.' })
  }
  if (!Number.isFinite(Number(req.body.version))) {
    return res.status(409).json({
      message: 'Course version is required for status update.',
      latest: target,
    })
  }
  if (Number(target.version || 1) !== Number(req.body.version)) {
    return res.status(409).json({
      message: 'Course has changed on server. Refresh data first.',
      latest: target,
    })
  }
  const nextCourse = {
    ...target,
    status: req.body.status,
    version: Number(target.version || 1) + 1,
    updatedAt: new Date().toISOString(),
    revisions: [buildCourseRevisionEntry(target, `status:${req.body.status}`, req.user.email), ...(target.revisions || [])].slice(0, 40),
  }
  const validation = validateCourseManagementIntegrity(nextCourse, courses.map((item) => (item.id === nextCourse.id ? nextCourse : item)))
  if (nextCourse.status === 'published' || nextCourse.status === 'scheduled') {
    if (validation.hasPublishGap || validation.hasIntegrityError) {
      return res.status(422).json({
        message: 'Course belum memenuhi publish checklist.',
        errors: validation.publishChecks.filter((item) => !item.passed).map((item) => item.id),
      })
    }
  }
  req.db.courseManagement = courses.map((item) => (item.id === nextCourse.id ? nextCourse : item))
  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'course_mgmt_status',
    target: nextCourse.id,
    detail: `Course status changed to ${nextCourse.status}.`,
  })
  await writeDb(req.db)
  return res.json(nextCourse)
})

app.delete('/api/course-management/:id', requireAuth, requireCourseManager, requireCoursePermission('delete'), async (req, res) => {
  const courses = Array.isArray(req.db.courseManagement) ? req.db.courseManagement.slice() : []
  const target = courses.find((item) => item.id === req.params.id)
  if (!target) return res.status(404).json({ message: 'Course not found.' })
  req.db.courseManagement = courses.filter((item) => item.id !== req.params.id)
  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'course_mgmt_delete',
    target: target.id,
    detail: `Deleted managed course ${target.title}.`,
  })
  await writeDb(req.db)
  return res.status(204).send()
})

app.post('/api/course-management/:id/duplicate', requireAuth, requireCourseManager, requireCoursePermission('duplicate'), async (req, res) => {
  const courses = Array.isArray(req.db.courseManagement) ? req.db.courseManagement.slice() : []
  const source = courses.find((item) => item.id === req.params.id)
  if (!source) return res.status(404).json({ message: 'Course not found.' })
  const nowIso = new Date().toISOString()
  const existingSlugs = new Set(courses.map((item) => toSlug(item.slug)))
  let nextSlug = `${toSlug(source.slug || source.title)}-copy`
  let counter = 2
  while (existingSlugs.has(nextSlug)) {
    nextSlug = `${toSlug(source.slug || source.title)}-copy-${counter}`
    counter += 1
  }
  const duplicated = {
    ...deepClone(source),
    id: `course-${Math.random().toString(36).slice(2, 9)}`,
    title: `${source.title || source.id} (Copy)`,
    slug: nextSlug,
    status: 'draft',
    publishAt: '',
    unpublishAt: '',
    version: 1,
    createdAt: nowIso,
    updatedAt: nowIso,
    revisions: [buildCourseRevisionEntry(source, 'duplicated', req.user.email)],
  }
  req.db.courseManagement = [duplicated, ...courses]
  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'course_mgmt_duplicate',
    target: duplicated.id,
    detail: `Duplicated managed course from ${source.id}.`,
  })
  await writeDb(req.db)
  return res.status(201).json(duplicated)
})

app.get('/api/course-management/:id/compliance-export', requireAuth, requireCourseManager, requireCoursePermission('history'), async (req, res) => {
  const target = (req.db.courseManagement || []).find((item) => item.id === req.params.id)
  if (!target) return res.status(404).json({ message: 'Course not found.' })
  const immutableVerify = verifyImmutableAuditChain(req.db.immutableAuditLogs || [])
  const relatedAudit = (req.db.auditLogs || []).filter((item) => String(item.target || '').includes(target.id))
  const relatedJobs = (req.db.courseManagementJobs || []).filter((item) => Array.isArray(item.ids) && item.ids.includes(target.id))
  const relatedDlq = (req.db.courseManagementJobDlq || []).filter(
    (item) => Array.isArray(item?.snapshot?.ids) && item.snapshot.ids.includes(target.id),
  )
  const relatedTelemetry = (req.db.telemetryEvents || []).filter((item) => item?.context?.courseId === target.id)
  const bundle = {
    schemaVersion: '1.0',
    generatedAt: new Date().toISOString(),
    generatedBy: req.user.email,
    course: target,
    revisions: Array.isArray(target.revisions) ? target.revisions : [],
    audit: {
      mutable: relatedAudit,
      immutableVerify,
      immutableSample: (req.db.immutableAuditLogs || []).slice(0, 120),
    },
    operations: {
      queue: relatedJobs,
      dlq: relatedDlq,
      telemetry: relatedTelemetry,
    },
    notifications: {
      channels: req.db.notificationChannels || {},
      deliveryLogs: (req.db.notificationDeliveryLogs || []).slice(0, 200),
    },
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${target.id}-compliance-export.json"`)
  return res.json(bundle)
})

app.get('/api/course-management/jobs', requireAuth, requireCourseManager, requireCoursePermission('bulk'), async (req, res) => {
  const rawLimit = Number(req.query.limit || 100)
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 500) : 100
  return res.json((req.db.courseManagementJobs || []).slice(0, limit))
})

app.get('/api/course-management/jobs/worker-lease', requireAuth, requireCourseManager, requireCoursePermission('bulk'), async (req, res) => {
  return res.json(req.db.jobWorkerLease || null)
})

app.post('/api/course-management/jobs', requireAuth, requireCourseManager, requireCoursePermission('bulk'), validateBody(courseManagementJobCreateSchema), async (req, res) => {
  const item = createCourseManagementJob(req.body, req.user.email)
  req.db.courseManagementJobs = [item, ...(req.db.courseManagementJobs || [])].slice(0, 1000)
  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'course_mgmt_job_enqueue',
    target: item.id,
    detail: `Queued course management job ${item.type}.`,
  })
  await writeDb(req.db)
  return res.status(201).json(item)
})

app.post('/api/course-management/jobs/process-due', requireAuth, requireCourseManager, requireCoursePermission('bulk'), async (req, res) => {
  const leaseOwner = `manual:${req.user.id}:${Math.random().toString(36).slice(2, 7)}`
  const lease = acquireCourseJobWorkerLease(req.db, leaseOwner)
  if (!lease.acquired) {
    return res.status(423).json({
      message: 'Job worker is locked by another instance.',
      lease: lease.lease || null,
    })
  }
  let results = []
  try {
    results = processDueCourseManagementJobs(req.db, req.user.email, 5)
  } finally {
    releaseCourseJobWorkerLease(req.db, leaseOwner)
  }
  await writeDb(req.db)
  return res.json({
    processedJobs: results.length,
    results,
    leaseReleased: true,
  })
})

app.post('/api/course-management/jobs/:id/run', requireAuth, requireCourseManager, requireCoursePermission('bulk'), async (req, res) => {
  const jobs = Array.isArray(req.db.courseManagementJobs) ? req.db.courseManagementJobs : []
  const target = jobs.find((item) => item.id === req.params.id)
  if (!target) return res.status(404).json({ message: 'Job not found.' })
  const leaseOwner = `manual-single:${req.user.id}:${Math.random().toString(36).slice(2, 7)}`
  const lease = acquireCourseJobWorkerLease(req.db, leaseOwner)
  if (!lease.acquired) {
    return res.status(423).json({
      message: 'Job worker is locked by another instance.',
      lease: lease.lease || null,
    })
  }
  target.status = 'pending'
  target.nextRunAt = ''
  let results = []
  try {
    results = processDueCourseManagementJobs(req.db, req.user.email, 1)
  } finally {
    releaseCourseJobWorkerLease(req.db, leaseOwner)
  }
  await writeDb(req.db)
  return res.json(results[0] || { id: target.id, status: target.status })
})

app.delete('/api/course-management/jobs/:id', requireAuth, requireCourseManager, requireCoursePermission('bulk'), async (req, res) => {
  const jobs = Array.isArray(req.db.courseManagementJobs) ? req.db.courseManagementJobs : []
  const exists = jobs.some((item) => item.id === req.params.id)
  if (!exists) return res.status(404).json({ message: 'Job not found.' })
  req.db.courseManagementJobs = jobs.filter((item) => item.id !== req.params.id)
  await writeDb(req.db)
  return res.status(204).send()
})

app.get('/api/course-management/jobs/dlq', requireAuth, requireCourseManager, requireCoursePermission('bulk'), async (req, res) => {
  const rawLimit = Number(req.query.limit || 100)
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 500) : 100
  return res.json((req.db.courseManagementJobDlq || []).slice(0, limit))
})

app.post('/api/course-management/jobs/dlq/:id/redrive', requireAuth, requireCourseManager, requireCoursePermission('bulk'), async (req, res) => {
  const dlqItems = Array.isArray(req.db.courseManagementJobDlq) ? req.db.courseManagementJobDlq : []
  const target = dlqItems.find((item) => item.id === req.params.id)
  if (!target) return res.status(404).json({ message: 'DLQ item not found.' })
  const snapshot = target.snapshot || {}
  const queued = createCourseManagementJob(
    {
      type: snapshot.type,
      ids: Array.isArray(snapshot.ids) ? snapshot.ids : [],
      statusValue: snapshot.statusValue || '',
    },
    req.user.email,
  )
  req.db.courseManagementJobs = [queued, ...(req.db.courseManagementJobs || [])].slice(0, 1000)
  target.status = 'redriven'
  target.redriveCount = Number(target.redriveCount || 0) + 1
  target.redrivenAt = new Date().toISOString()
  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'course_mgmt_job_redrive',
    target: target.id,
    detail: `Redrive DLQ item ${target.id} as job ${queued.id}.`,
  })
  await writeDb(req.db)
  return res.status(201).json({ queued, dlq: target })
})

app.get('/api/courses', requireAuth, async (req, res) => {
  const courses = req.db.courses || []
  const userId = req.user.id
  const cards = courses.map((course) => {
    const state = ensureCourseState(req.db, userId, course)
    const moduleQuizGateByModuleId = getModuleQuizGateByModuleId(req.db, userId, course)
    return toCourseCard(buildCourseView(course, state, { moduleQuizGateByModuleId }))
  })
  await writeDb(req.db)
  return res.json(cards)
})

app.get('/api/courses/continue', requireAuth, async (req, res) => {
  const payload = buildContinueLearning(req.db, req.user.id)
  await writeDb(req.db)
  return res.json(payload || null)
})

app.get('/api/courses/:id', requireAuth, async (req, res) => {
  const course = (req.db.courses || []).find((item) => item.id === req.params.id)
  if (!course) return res.status(404).json({ message: 'Course not found.' })
  const state = ensureCourseState(req.db, req.user.id, course)
  const moduleQuizGateByModuleId = getModuleQuizGateByModuleId(req.db, req.user.id, course)
  const view = buildCourseView(course, state, { moduleQuizGateByModuleId })
  await writeDb(req.db)
  return res.json(view)
})

app.get('/api/analytics/learning', requireAuth, async (req, res) => {
  const data = buildLearningAnalytics(req.db, req.user.id)
  await writeDb(req.db)
  return res.json(data)
})

app.patch('/api/courses/:id/modules/:moduleId/prerequisite', requireAuth, validateBody(modulePrerequisiteSchema), async (req, res) => {
  if (!canReviewAssignmentRole(req.db, req.user)) {
    return res.status(403).json({ message: 'Instructor/Admin access required.' })
  }
  const course = (req.db.courses || []).find((item) => item.id === req.params.id)
  if (!course) return res.status(404).json({ message: 'Course not found.' })
  const module = (course.modules || []).find((item) => item.id === req.params.moduleId)
  if (!module) return res.status(404).json({ message: 'Module not found.' })

  const rules = (req.body.rules || [])
    .filter((rule) =>
      rule.type === 'lesson-complete'
        ? Boolean(rule.lessonId)
        : rule.type === 'module-complete' || rule.type === 'module-quiz-pass'
          ? Boolean(rule.moduleId)
          : false,
    )
    .map((rule) => ({
      type: rule.type,
      moduleId: rule.moduleId || undefined,
      lessonId: rule.lessonId || undefined,
    }))

  req.db.courses = (req.db.courses || []).map((item) =>
    item.id !== course.id
      ? item
      : {
          ...item,
          modules: (item.modules || []).map((mod) =>
            mod.id !== module.id
              ? mod
              : {
                  ...mod,
                  prerequisite: {
                    mode: req.body.mode === 'any' ? 'any' : 'all',
                    rules,
                  },
                },
          ),
        },
  )

  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'course_module_prerequisite_update',
    target: `${course.id}:${module.id}`,
    detail: `Updated prerequisite for module ${module.title}.`,
  })

  await writeDb(req.db)
  const updatedCourse = (req.db.courses || []).find((item) => item.id === course.id)
  const state = ensureCourseState(req.db, req.user.id, updatedCourse)
  const view = buildCourseView(
    updatedCourse,
    state,
    { moduleQuizGateByModuleId: getModuleQuizGateByModuleId(req.db, req.user.id, updatedCourse) },
  )
  return res.json(view)
})

app.post('/api/courses/:id/lessons/:lessonId/select', requireAuth, async (req, res) => {
  const course = (req.db.courses || []).find((item) => item.id === req.params.id)
  if (!course) return res.status(404).json({ message: 'Course not found.' })

  const userId = req.user.id
  const state = ensureCourseState(req.db, userId, course)
  const moduleQuizGateByModuleId = getModuleQuizGateByModuleId(req.db, userId, course)
  const view = buildCourseView(course, state, { moduleQuizGateByModuleId })
  const lessons = view.modules.flatMap((module) => module.lessons)
  const lesson = lessons.find((item) => item.id === req.params.lessonId)
  if (!lesson) return res.status(404).json({ message: 'Lesson not found.' })
  if (lesson.isLocked) return res.status(403).json({ message: 'Lesson is still locked.' })

  req.db.courseProgress[userId][course.id].activeLessonId = lesson.id
  req.db.courseProgress[userId][course.id].lastTouchedAt = new Date().toISOString()
  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'course_select_lesson',
    target: `${course.id}:${lesson.id}`,
    detail: `Selected lesson ${lesson.title}.`,
  })
  await writeDb(req.db)
  return res.json(
    buildCourseView(course, req.db.courseProgress[userId][course.id], {
      moduleQuizGateByModuleId: getModuleQuizGateByModuleId(req.db, userId, course),
    }),
  )
})

app.post('/api/courses/:id/lessons/:lessonId/complete', requireAuth, async (req, res) => {
  const course = (req.db.courses || []).find((item) => item.id === req.params.id)
  if (!course) return res.status(404).json({ message: 'Course not found.' })

  const userId = req.user.id
  const state = ensureCourseState(req.db, userId, course)
  const moduleQuizGateByModuleId = getModuleQuizGateByModuleId(req.db, userId, course)
  const view = buildCourseView(course, state, { moduleQuizGateByModuleId })
  const lessons = view.modules.flatMap((module) => module.lessons)
  const lesson = lessons.find((item) => item.id === req.params.lessonId)
  if (!lesson) return res.status(404).json({ message: 'Lesson not found.' })
  if (lesson.isLocked) return res.status(403).json({ message: 'Lesson is still locked.' })
  if (!lesson.canComplete) {
    return res.status(400).json({
      message: lesson.completionGateReason || 'Complete lesson requirement first.',
      requiredProgressPercent: lesson.completionRequiredPercent || VIDEO_COMPLETION_THRESHOLD_PERCENT,
      currentProgressPercent: Number(lesson.playback?.progressPercent || 0),
    })
  }

  const completedSet = new Set(req.db.courseProgress[userId][course.id].completedLessonIds)
  completedSet.add(lesson.id)
  req.db.courseProgress[userId][course.id].completedLessonIds = Array.from(completedSet)

  const currentIndex = lessons.findIndex((item) => item.id === lesson.id)
  const nextLesson = currentIndex >= 0 ? lessons[currentIndex + 1] : null
  req.db.courseProgress[userId][course.id].activeLessonId = nextLesson?.id || lesson.id
  req.db.courseProgress[userId][course.id].lastTouchedAt = new Date().toISOString()

  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'course_complete_lesson',
    target: `${course.id}:${lesson.id}`,
    detail: `Completed lesson ${lesson.title}.`,
  })
  await writeDb(req.db)
  return res.json(
    buildCourseView(course, req.db.courseProgress[userId][course.id], {
      moduleQuizGateByModuleId: getModuleQuizGateByModuleId(req.db, userId, course),
    }),
  )
})

app.post(
  '/api/courses/:id/lessons/:lessonId/playback',
  requireAuth,
  validateBody(lessonPlaybackSchema),
  async (req, res) => {
    const course = (req.db.courses || []).find((item) => item.id === req.params.id)
    if (!course) return res.status(404).json({ message: 'Course not found.' })

    const userId = req.user.id
    const state = ensureCourseState(req.db, userId, course)
    const moduleQuizGateByModuleId = getModuleQuizGateByModuleId(req.db, userId, course)
    const view = buildCourseView(course, state, { moduleQuizGateByModuleId })
    const lessons = view.modules.flatMap((module) => module.lessons)
    const lesson = lessons.find((item) => item.id === req.params.lessonId)
    if (!lesson) return res.status(404).json({ message: 'Lesson not found.' })
    if (lesson.isLocked) return res.status(403).json({ message: 'Lesson is still locked.' })

    const durationSec = Math.max(0, Math.floor(Number(req.body.durationSec || lesson.playback?.durationSec || 0)))
    const rawPosition = Math.max(0, Math.floor(Number(req.body.positionSec || 0)))
    const positionSec = durationSec > 0 ? Math.min(rawPosition, durationSec) : rawPosition
    const previous = req.db.courseProgress[userId][course.id].lessonPlayback?.[lesson.id] || {}
    const prevPosition = Math.max(0, Math.floor(Number(previous.positionSec || 0)))
    const step = Math.max(0, positionSec - prevPosition)
    const treatAsContinuousWatch = step > 0 && step <= MAX_WATCH_STEP_SEC
    const watchedRanges = treatAsContinuousWatch
      ? appendWatchedRange(previous.watchedRanges || [], prevPosition, positionSec, durationSec)
      : normalizeRanges(previous.watchedRanges || [], durationSec)
    const watchedSec = sumRangeDuration(watchedRanges)
    const watchedDeltaSec = Math.max(0, watchedSec - Math.floor(Number(previous.watchedSec || 0)))
    const progressPercent = durationSec > 0 ? Math.round((watchedSec / durationSec) * 100) : 0
    const isCompletedVideo = Boolean(req.body.markCompleted) || progressPercent >= VIDEO_COMPLETION_THRESHOLD_PERCENT

    req.db.courseProgress[userId][course.id].lessonPlayback = req.db.courseProgress[userId][course.id].lessonPlayback || {}
    req.db.courseProgress[userId][course.id].lessonPlayback[lesson.id] = {
      positionSec,
      durationSec,
      watchedSec,
      watchedRanges,
      progressPercent: Math.max(0, Math.min(100, progressPercent)),
      completedVideoAt: isCompletedVideo ? previous.completedVideoAt || new Date().toISOString() : previous.completedVideoAt || null,
    }
    req.db.courseProgress[userId][course.id].lastTouchedAt = new Date().toISOString()
    req.db.courseProgress[userId][course.id].studyEvents = req.db.courseProgress[userId][course.id].studyEvents || []
    if (watchedDeltaSec > 0) {
      req.db.courseProgress[userId][course.id].studyEvents = [
        {
          at: new Date().toISOString(),
          lessonId: lesson.id,
          seconds: watchedDeltaSec,
        },
        ...req.db.courseProgress[userId][course.id].studyEvents,
      ].slice(0, 800)
    }

    await writeDb(req.db)
    const completionGate = getLessonCompletionGate(lesson, req.db.courseProgress[userId][course.id].lessonPlayback[lesson.id])
    return res.json({
      ...req.db.courseProgress[userId][course.id].lessonPlayback[lesson.id],
      canComplete: completionGate.canComplete,
      completionRequiredPercent: completionGate.requiredProgressPercent,
      completionGateReason: completionGate.reason,
    })
  },
)

app.get('/api/courses/:id/lessons/:lessonId/notes', requireAuth, async (req, res) => {
  const { course, lesson } = findCourseAndLesson(req.db, req.params.id, req.params.lessonId)
  if (!course) return res.status(404).json({ message: 'Course not found.' })
  if (!lesson) return res.status(404).json({ message: 'Lesson not found.' })
  const notes = listLessonNotes(req.db, req.user.id, course.id, lesson.id)
  await writeDb(req.db)
  return res.json(notes)
})

app.post('/api/courses/:id/lessons/:lessonId/notes', requireAuth, validateBody(lessonNoteCreateSchema), async (req, res) => {
  const { course, lesson } = findCourseAndLesson(req.db, req.params.id, req.params.lessonId)
  if (!course) return res.status(404).json({ message: 'Course not found.' })
  if (!lesson) return res.status(404).json({ message: 'Lesson not found.' })

  const nowIso = new Date().toISOString()
  const noteItem = {
    id: `note-${Math.random().toString(36).slice(2, 10)}`,
    timestampSec: Math.max(0, Math.floor(Number(req.body.timestampSec || 0))),
    note: String(req.body.note || '').trim(),
    createdAt: nowIso,
    updatedAt: nowIso,
  }
  const notes = [...listLessonNotes(req.db, req.user.id, course.id, lesson.id), noteItem]
  writeLessonNotes(req.db, req.user.id, course.id, lesson.id, notes)
  await writeDb(req.db)
  return res.status(201).json(listLessonNotes(req.db, req.user.id, course.id, lesson.id))
})

app.patch(
  '/api/courses/:id/lessons/:lessonId/notes/:noteId',
  requireAuth,
  validateBody(lessonNoteUpdateSchema),
  async (req, res) => {
    const { course, lesson } = findCourseAndLesson(req.db, req.params.id, req.params.lessonId)
    if (!course) return res.status(404).json({ message: 'Course not found.' })
    if (!lesson) return res.status(404).json({ message: 'Lesson not found.' })

    const current = listLessonNotes(req.db, req.user.id, course.id, lesson.id)
    const target = current.find((item) => item.id === req.params.noteId)
    if (!target) return res.status(404).json({ message: 'Note not found.' })
    const next = current.map((item) =>
      item.id === req.params.noteId
        ? {
            ...item,
            note: String(req.body.note || '').trim(),
            updatedAt: new Date().toISOString(),
          }
        : item,
    )
    writeLessonNotes(req.db, req.user.id, course.id, lesson.id, next)
    await writeDb(req.db)
    return res.json(listLessonNotes(req.db, req.user.id, course.id, lesson.id))
  },
)

app.delete('/api/courses/:id/lessons/:lessonId/notes/:noteId', requireAuth, async (req, res) => {
  const { course, lesson } = findCourseAndLesson(req.db, req.params.id, req.params.lessonId)
  if (!course) return res.status(404).json({ message: 'Course not found.' })
  if (!lesson) return res.status(404).json({ message: 'Lesson not found.' })

  const current = listLessonNotes(req.db, req.user.id, course.id, lesson.id)
  const next = current.filter((item) => item.id !== req.params.noteId)
  if (next.length === current.length) return res.status(404).json({ message: 'Note not found.' })
  writeLessonNotes(req.db, req.user.id, course.id, lesson.id, next)
  await writeDb(req.db)
  return res.json(listLessonNotes(req.db, req.user.id, course.id, lesson.id))
})

app.get('/api/courses/:id/lessons/:lessonId/discussions', requireAuth, async (req, res) => {
  const { course, lesson } = findCourseAndLesson(req.db, req.params.id, req.params.lessonId)
  if (!course) return res.status(404).json({ message: 'Course not found.' })
  if (!lesson) return res.status(404).json({ message: 'Lesson not found.' })

  const key = `${course.id}:${lesson.id}`
  const items = Array.isArray(req.db.discussions[key]) ? req.db.discussions[key] : []
  return res.json(items)
})

app.post('/api/courses/:id/lessons/:lessonId/discussions', requireAuth, validateBody(discussionCreateSchema), async (req, res) => {
  const { course, lesson } = findCourseAndLesson(req.db, req.params.id, req.params.lessonId)
  if (!course) return res.status(404).json({ message: 'Course not found.' })
  if (!lesson) return res.status(404).json({ message: 'Lesson not found.' })

  const key = `${course.id}:${lesson.id}`
  const items = Array.isArray(req.db.discussions[key]) ? req.db.discussions[key] : []
  if (req.body.parentId && !items.some((item) => item.id === req.body.parentId)) {
    return res.status(404).json({ message: 'Parent discussion not found.' })
  }
  req.db.discussions[key] = [
    {
      id: `disc-${Math.random().toString(36).slice(2, 10)}`,
      courseId: course.id,
      lessonId: lesson.id,
      parentId: req.body.parentId || null,
      message: req.body.message.trim(),
      mentionUserIds: resolveMentionUserIds(req.db.users, req.body.message),
      authorId: req.user.id,
      authorName: req.user.name,
      createdAt: new Date().toISOString(),
    },
    ...items,
  ].slice(0, 300)

  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'course_discussion_add',
    target: `${course.id}:${lesson.id}`,
    detail: `Added discussion on ${lesson.title}.`,
  })
  await writeDb(req.db)
  return res.status(201).json(req.db.discussions[key])
})

app.patch(
  '/api/courses/:id/lessons/:lessonId/discussions/:discussionId',
  requireAuth,
  validateBody(discussionUpdateSchema),
  async (req, res) => {
    const { course, lesson } = findCourseAndLesson(req.db, req.params.id, req.params.lessonId)
    if (!course) return res.status(404).json({ message: 'Course not found.' })
    if (!lesson) return res.status(404).json({ message: 'Lesson not found.' })

    const key = `${course.id}:${lesson.id}`
    const items = Array.isArray(req.db.discussions[key]) ? req.db.discussions[key] : []
    const target = items.find((item) => item.id === req.params.discussionId)
    if (!target) return res.status(404).json({ message: 'Discussion not found.' })
    if (!canModerateDiscussion(req.user, target)) {
      return res.status(403).json({ message: 'Not allowed to edit this discussion.' })
    }

    req.db.discussions[key] = items.map((item) =>
      item.id === req.params.discussionId
        ? {
            ...item,
            message: req.body.message.trim(),
            mentionUserIds: resolveMentionUserIds(req.db.users, req.body.message),
            updatedAt: new Date().toISOString(),
          }
        : item,
    )
    addAuditLog(req.db, {
      actor: req.user.email,
      action: 'course_discussion_edit',
      target: `${course.id}:${lesson.id}:${req.params.discussionId}`,
      detail: `Edited discussion on ${lesson.title}.`,
    })
    await writeDb(req.db)
    return res.json(req.db.discussions[key])
  },
)

app.delete('/api/courses/:id/lessons/:lessonId/discussions/:discussionId', requireAuth, async (req, res) => {
  const { course, lesson } = findCourseAndLesson(req.db, req.params.id, req.params.lessonId)
  if (!course) return res.status(404).json({ message: 'Course not found.' })
  if (!lesson) return res.status(404).json({ message: 'Lesson not found.' })

  const key = `${course.id}:${lesson.id}`
  const items = Array.isArray(req.db.discussions[key]) ? req.db.discussions[key] : []
  const target = items.find((item) => item.id === req.params.discussionId)
  if (!target) return res.status(404).json({ message: 'Discussion not found.' })
  if (!canModerateDiscussion(req.user, target)) {
    return res.status(403).json({ message: 'Not allowed to delete this discussion.' })
  }

  req.db.discussions[key] = items.filter((item) => item.id !== target.id && item.parentId !== target.id)
  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'course_discussion_delete',
    target: `${course.id}:${lesson.id}:${req.params.discussionId}`,
    detail: `Deleted discussion on ${lesson.title}.`,
  })
  await writeDb(req.db)
  return res.json(req.db.discussions[key])
})

app.get('/api/courses/:id/lessons/:lessonId/assignment', requireAuth, async (req, res) => {
  const { course, lesson } = findCourseAndLesson(req.db, req.params.id, req.params.lessonId)
  if (!course) return res.status(404).json({ message: 'Course not found.' })
  if (!lesson) return res.status(404).json({ message: 'Lesson not found.' })

  const assignment = getAssignmentDefinition(course, lesson)
  const windowStatus = getAssignmentWindowStatus(assignment, Date.now())
  const submissions = getAssignmentSubmissions(req.db, course.id, lesson.id).slice().sort((a, b) => String(b.updatedAt || b.submittedAt).localeCompare(String(a.updatedAt || a.submittedAt)))
  const mySubmission = submissions.find((item) => item.userId === req.user.id) || null

  return res.json({
    assignment,
    windowStatus,
    serverTime: new Date().toISOString(),
    mySubmission,
    submissions: canReviewAssignmentRole(req.db, req.user) ? submissions : [],
  })
})

app.patch(
  '/api/courses/:id/lessons/:lessonId/assignment-config',
  requireAuth,
  validateBody(assignmentConfigSchema),
  async (req, res) => {
    if (!canReviewAssignmentRole(req.db, req.user)) {
      return res.status(403).json({ message: 'Instructor/Admin access required.' })
    }
    const { course, lesson } = findCourseAndLesson(req.db, req.params.id, req.params.lessonId)
    if (!course) return res.status(404).json({ message: 'Course not found.' })
    if (!lesson) return res.status(404).json({ message: 'Lesson not found.' })

    const dueAt = req.body.dueAt === null ? null : req.body.dueAt ?? lesson.assignment?.dueAt ?? null
    const graceMinutes = Number.isFinite(req.body.graceMinutes)
      ? Number(req.body.graceMinutes)
      : Number(lesson.assignment?.graceMinutes || 24 * 60)

    updateLessonAssignmentConfig(req.db, course.id, lesson.id, (current) => ({
      ...current,
      dueAt,
      graceMinutes: Math.max(0, graceMinutes),
    }))

    addAuditLog(req.db, {
      actor: req.user.email,
      action: 'assignment_config_update',
      target: `${course.id}:${lesson.id}`,
      detail: `Updated assignment deadline config.`,
    })
    await writeDb(req.db)

    const updated = findCourseAndLesson(req.db, course.id, lesson.id)
    const assignment = getAssignmentDefinition(updated.course, updated.lesson)
    return res.json({
      assignment,
      windowStatus: getAssignmentWindowStatus(assignment, Date.now()),
      serverTime: new Date().toISOString(),
    })
  },
)

app.post(
  '/api/courses/:id/lessons/:lessonId/submission',
  requireAuth,
  validateBody(assignmentSubmissionSchema),
  async (req, res) => {
    const { course, lesson } = findCourseAndLesson(req.db, req.params.id, req.params.lessonId)
    if (!course) return res.status(404).json({ message: 'Course not found.' })
    if (!lesson) return res.status(404).json({ message: 'Lesson not found.' })

    const assignment = getAssignmentDefinition(course, lesson)
    const windowStatus = getAssignmentWindowStatus(assignment, Date.now())
    if (windowStatus.isClosed) {
      return res.status(403).json({ message: 'Submission window is closed.' })
    }
    const linkUrl = String(req.body.linkUrl || '').trim()
    const notes = String(req.body.notes || '').trim()
    const attachmentName = String(req.body.attachmentName || '').trim()
    const attachmentDataUrl = String(req.body.attachmentDataUrl || '').trim()
    const attachmentId = String(req.body.attachmentId || '').trim()

    if (!linkUrl && !notes && !attachmentDataUrl && !attachmentId) {
      return res.status(400).json({ message: 'Isi minimal salah satu: link, catatan, atau lampiran.' })
    }
    if (attachmentDataUrl && !attachmentDataUrl.startsWith('data:')) {
      return res.status(400).json({ message: 'Lampiran tidak valid.' })
    }

    let attachmentMeta = null
    if (attachmentId) {
      const upload = req.db.uploads?.[attachmentId]
      if (!upload) return res.status(404).json({ message: 'Attachment upload not found.' })
      if (upload.ownerId !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Attachment does not belong to this user.' })
      }
      if (upload.purpose !== 'assignment') {
        return res.status(400).json({ message: 'Attachment purpose is not valid for assignment.' })
      }
      attachmentMeta = upload
    }

    const current = getAssignmentSubmissions(req.db, course.id, lesson.id)
    const existing = current.find((item) => item.userId === req.user.id)
    const nowIso = new Date().toISOString()
    const previousSnapshot = existing?.history?.[0]?.snapshot || null
    const nextHistory = existing
      ? [toAssignmentHistoryEntry(existing, 'resubmitted', req.user, previousSnapshot), ...(existing.history || [])].slice(0, 40)
      : []
    const nextSubmission = {
      id: existing?.id || `sub-${Math.random().toString(36).slice(2, 10)}`,
      courseId: course.id,
      lessonId: lesson.id,
      assignmentId: assignment.id,
      userId: req.user.id,
      userName: req.user.name,
      userEmail: req.user.email,
      status: 'submitted',
      linkUrl,
      notes,
      attachmentId: attachmentMeta?.id || '',
      attachmentName: attachmentMeta?.fileName || attachmentName,
      attachmentUrl: attachmentMeta?.id ? getUploadDownloadUrl(attachmentMeta.id) : '',
      attachmentMimeType: attachmentMeta?.mimeType || '',
      attachmentSizeBytes: attachmentMeta?.sizeBytes || 0,
      attachmentDataUrl: attachmentMeta ? '' : attachmentDataUrl,
      submittedAt: existing?.submittedAt || nowIso,
      updatedAt: nowIso,
      submissionMode: windowStatus.isLateWindow ? 'late' : 'on-time',
      lateByMinutes: windowStatus.isLateWindow ? windowStatus.lateByMinutes : 0,
      reviewedAt: null,
      reviewedBy: null,
      feedback: '',
      rubricScores: [],
      scorePercent: null,
      history: nextHistory,
    }

    const updated = existing
      ? current.map((item) => (item.id === existing.id ? nextSubmission : item))
      : [nextSubmission, ...current]
    setAssignmentSubmissions(req.db, course.id, lesson.id, updated)

    addAuditLog(req.db, {
      actor: req.user.email,
      action: 'assignment_submit',
      target: `${course.id}:${lesson.id}:${nextSubmission.id}`,
      detail: `Submitted assignment for ${lesson.title}.`,
    })
    await writeDb(req.db)
    return res.status(existing ? 200 : 201).json(nextSubmission)
  },
)

app.patch(
  '/api/courses/:id/lessons/:lessonId/submissions/:submissionId/review',
  requireAuth,
  validateBody(assignmentReviewSchema),
  async (req, res) => {
    if (!canReviewAssignmentRole(req.db, req.user)) {
      return res.status(403).json({ message: 'Instructor/Admin access required.' })
    }

    const { course, lesson } = findCourseAndLesson(req.db, req.params.id, req.params.lessonId)
    if (!course) return res.status(404).json({ message: 'Course not found.' })
    if (!lesson) return res.status(404).json({ message: 'Lesson not found.' })

    const assignment = getAssignmentDefinition(course, lesson)
    const rubricCriteria = Array.isArray(assignment.rubric) ? assignment.rubric : []
    const rubricMap = new Map(rubricCriteria.map((criterion) => [criterion.id, criterion]))
    const current = getAssignmentSubmissions(req.db, course.id, lesson.id)
    const target = current.find((item) => item.id === req.params.submissionId)

    if (!target) return res.status(404).json({ message: 'Submission not found.' })

    const payloadScores = Array.isArray(req.body.rubricScores) ? req.body.rubricScores : target.rubricScores || []
    const normalizedScores = []
    for (const item of payloadScores) {
      const criterion = rubricMap.get(item.criterionId)
      if (!criterion) {
        return res.status(400).json({ message: `Unknown rubric criterion: ${item.criterionId}` })
      }
      if (item.score > Number(criterion.maxScore || 0)) {
        return res.status(400).json({ message: `Score for ${criterion.label} exceeds max ${criterion.maxScore}` })
      }
      normalizedScores.push({
        criterionId: item.criterionId,
        score: Math.max(0, Number(item.score || 0)),
        comment: String(item.comment || '').trim(),
      })
    }

    const scoreMeta = calculateRubricScore(assignment, normalizedScores)
    const nextFeedback = typeof req.body.feedback === 'string' ? req.body.feedback.trim() : String(target.feedback || '')
    const nowIso = new Date().toISOString()
    const previousSnapshot = target?.history?.[0]?.snapshot || null
    const reviewedBy = {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
    }

    const nextSubmission = {
      ...target,
      status: req.body.status,
      feedback: nextFeedback,
      rubricScores: normalizedScores,
      scorePercent: req.body.status === 'graded' ? scoreMeta.percentage : null,
      reviewedAt: nowIso,
      reviewedBy,
      updatedAt: nowIso,
      history: [toAssignmentHistoryEntry(target, 'reviewed', req.user, previousSnapshot), ...(target.history || [])].slice(0, 40),
    }

    setAssignmentSubmissions(
      req.db,
      course.id,
      lesson.id,
      current.map((item) => (item.id === target.id ? nextSubmission : item)),
    )

    addAuditLog(req.db, {
      actor: req.user.email,
      action: 'assignment_review',
      target: `${course.id}:${lesson.id}:${target.id}`,
      detail: `Set submission status to ${req.body.status} for ${target.userName}.`,
    })
    await writeDb(req.db)
    return res.json(nextSubmission)
  },
)

app.get('/api/quizzes/:id', requireAuth, async (req, res) => {
  const quiz = getQuizById(req.db, req.params.id)
  if (!quiz) return res.status(404).json({ message: 'Quiz not found.' })
  if (!isQuizPublished(quiz) && !canManageQuizRole(req.db, req.user)) {
    return res.status(403).json({ message: 'Quiz ini belum dipublish.' })
  }
  return res.json(buildQuizMeta(quiz))
})

app.get('/api/quizzes/:id/editor', requireAuth, requireQuizManager, async (req, res) => {
  const quiz = getQuizById(req.db, req.params.id)
  if (!quiz) return res.status(404).json({ message: 'Quiz not found.' })
  return res.json(quiz)
})

app.get('/api/quizzes', requireAuth, requireQuizManager, async (req, res) => {
  const quizzes = Array.isArray(req.db.quizzes) ? req.db.quizzes : []
  return res.json(quizzes.map((quiz) => ({ ...buildQuizMeta(quiz), updatedAt: quiz.updatedAt || quiz.createdAt || null })))
})

app.post('/api/quizzes/bulk-status', requireAuth, requireQuizManager, validateBody(quizBulkStatusSchema), async (req, res) => {
  const idSet = new Set(req.body.ids)
  req.db.quizzes = (req.db.quizzes || []).map((quiz) =>
    idSet.has(quiz.id)
      ? {
          ...quiz,
          status: req.body.status,
          updatedAt: new Date().toISOString(),
        }
      : quiz,
  )

  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'quiz_bulk_status',
    target: 'bulk',
    detail: `${req.body.ids.length} quizzes updated to ${req.body.status}.`,
  })
  await writeDb(req.db)

  return res.json((req.db.quizzes || []).filter((quiz) => idSet.has(quiz.id)).map((quiz) => buildQuizMeta(quiz)))
})

app.post('/api/quizzes/bulk-delete', requireAuth, requireQuizManager, validateBody(idsSchema), async (req, res) => {
  const idSet = new Set(req.body.ids)
  const deleted = (req.db.quizzes || []).filter((quiz) => idSet.has(quiz.id))

  req.db.quizzes = (req.db.quizzes || []).filter((quiz) => !idSet.has(quiz.id))
  deleted.forEach((quiz) => removeQuizArtifacts(req.db, quiz.id))

  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'quiz_bulk_delete',
    target: 'bulk',
    detail: `${deleted.length} quizzes deleted.`,
  })
  await writeDb(req.db)

  return res.json(req.db.quizzes.map((quiz) => ({ ...buildQuizMeta(quiz), updatedAt: quiz.updatedAt || quiz.createdAt || null })))
})

app.post('/api/quizzes', requireAuth, requireQuizManager, validateBody(quizSaveSchema), async (req, res) => {
  const payload = req.body
  if (payload.questions.some((question) => question.correctIndex >= question.options.length)) {
    return res.status(400).json({ message: 'Invalid question: correctIndex must point to existing option.' })
  }
  const normalizedQuestions = payload.questions.map((question, idx) => {
    const cleanOptions = question.options.map((option) => String(option || '').trim())
    return {
      ...question,
      id: question.id || `q-${idx + 1}`,
      title: String(question.title || '').trim(),
      options: cleanOptions,
      explanation: String(question.explanation || '').trim(),
    }
  })

  const quizzes = Array.isArray(req.db.quizzes) ? req.db.quizzes : []
  const quizId = payload.id || `${payload.courseId}-${payload.moduleId}-${Math.random().toString(36).slice(2, 6)}`
  const nowIso = new Date().toISOString()
  const existingQuiz = quizzes.find((item) => item.id === quizId) || null

  const nextQuiz = {
    id: quizId,
    courseId: payload.courseId,
    moduleId: payload.moduleId,
    title: payload.title.trim(),
    description: payload.description.trim(),
    passingScore: payload.passingScore,
    maxAttempts: payload.maxAttempts,
    timeLimitSec: payload.timeLimitSec,
    status: payload.status || existingQuiz?.status || 'draft',
    questions: normalizedQuestions,
    updatedAt: nowIso,
    createdAt: existingQuiz?.createdAt || nowIso,
  }

  req.db.quizzes = quizzes.some((item) => item.id === quizId)
    ? quizzes.map((item) => (item.id === quizId ? nextQuiz : item))
    : [nextQuiz, ...quizzes]

  addAuditLog(req.db, {
    actor: req.user.email,
    action: payload.id ? 'quiz_update' : 'quiz_create',
    target: quizId,
    detail: `${payload.id ? 'Updated' : 'Created'} quiz ${nextQuiz.title}.`,
  })
  await writeDb(req.db)
  return res.json(nextQuiz)
})

app.patch('/api/quizzes/:id/status', requireAuth, requireQuizManager, validateBody(quizStatusSchema), async (req, res) => {
  const target = getQuizById(req.db, req.params.id)
  if (!target) return res.status(404).json({ message: 'Quiz not found.' })

  req.db.quizzes = (req.db.quizzes || []).map((quiz) =>
    quiz.id === target.id
      ? {
          ...quiz,
          status: req.body.status,
          updatedAt: new Date().toISOString(),
        }
      : quiz,
  )

  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'quiz_status_update',
    target: target.id,
    detail: `Quiz ${target.title} status changed to ${req.body.status}.`,
  })
  await writeDb(req.db)

  return res.json(buildQuizMeta(req.db.quizzes.find((quiz) => quiz.id === target.id)))
})

app.delete('/api/quizzes/:id', requireAuth, requireQuizManager, async (req, res) => {
  const target = getQuizById(req.db, req.params.id)
  if (!target) return res.status(404).json({ message: 'Quiz not found.' })

  req.db.quizzes = (req.db.quizzes || []).filter((item) => item.id !== target.id)
  removeQuizArtifacts(req.db, target.id)

  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'quiz_delete',
    target: target.id,
    detail: `Deleted quiz ${target.title}.`,
  })
  await writeDb(req.db)
  return res.status(204).send()
})

app.get('/api/quizzes/:id/history', requireAuth, async (req, res) => {
  const quiz = getQuizById(req.db, req.params.id)
  if (!quiz) return res.status(404).json({ message: 'Quiz not found.' })
  if (!isQuizPublished(quiz) && !canManageQuizRole(req.db, req.user)) {
    return res.status(403).json({ message: 'Quiz ini belum dipublish.' })
  }
  return res.json(getQuizHistory(req.db, req.user.id, quiz.id))
})

app.post('/api/quizzes/:id/session', requireAuth, validateBody(quizSessionStartSchema), async (req, res) => {
  const quiz = getQuizById(req.db, req.params.id)
  if (!quiz) return res.status(404).json({ message: 'Quiz not found.' })
  if (!isQuizPublished(quiz) && !canManageQuizRole(req.db, req.user)) {
    return res.status(403).json({ message: 'Quiz ini belum dipublish.' })
  }

  const history = getQuizHistory(req.db, req.user.id, quiz.id)
  if (req.body.retake && history.length >= quiz.maxAttempts) {
    return res.status(409).json({ message: 'Batas retake sudah tercapai.' })
  }

  const session = buildQuizSession(quiz, req.user.id, history.length + 1)
  req.db.quizSessions = req.db.quizSessions || {}
  req.db.quizSessions[session.sessionId] = session
  await writeDb(req.db)
  return res.status(201).json(toPublicQuizSession(session))
})

app.post('/api/quizzes/:id/submit', requireAuth, validateBody(quizSubmitSchema), async (req, res) => {
  const quiz = getQuizById(req.db, req.params.id)
  if (!quiz) return res.status(404).json({ message: 'Quiz not found.' })
  if (!isQuizPublished(quiz) && !canManageQuizRole(req.db, req.user)) {
    return res.status(403).json({ message: 'Quiz ini belum dipublish.' })
  }

  const answers = req.body.answers || {}
  const session = req.db.quizSessions?.[req.body.sessionId]
  if (!session || session.userId !== req.user.id || session.quizId !== quiz.id) {
    return res.status(404).json({ message: 'Quiz session not found.' })
  }

  const timedOut = Date.now() > session.expiresAt || Boolean(req.body.forced)
  const details = session.questions.map((question) => {
    const selectedOptionId = answers[question.id] || ''
    const selected = question.options.find((item) => item.id === selectedOptionId) || null
    const correct = question.options.find((item) => item.id === question.correctOptionId) || null
    const isCorrect = selected ? selected.id === question.correctOptionId : false

    return {
      questionId: question.id,
      title: question.title,
      selectedOptionId,
      selectedLabel: selected?.label || '',
      correctLabel: correct?.label || '',
      isCorrect,
      explanation: question.explanation,
    }
  })

  const correctCount = details.filter((item) => item.isCorrect).length
  const total = details.length
  const score = total > 0 ? Math.round((correctCount / total) * 100) : 0
  const passed = !timedOut && score >= session.passingScore

  const nextAttempt = {
    id: `attempt-${Math.random().toString(36).slice(2, 10)}`,
    attemptNo: session.attemptNo,
    score,
    passed,
    timedOut,
    correctCount,
    total,
    submittedAt: new Date().toISOString(),
    details,
  }

  const nextHistory = [nextAttempt, ...getQuizHistory(req.db, req.user.id, quiz.id)].slice(0, 20)
  setQuizHistory(req.db, req.user.id, quiz.id, nextHistory)
  delete req.db.quizSessions[session.sessionId]

  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'quiz_submit',
    target: `${quiz.id}:${session.sessionId}`,
    detail: `Submitted quiz ${quiz.title} with score ${score}%.`,
  })
  await writeDb(req.db)

  return res.json({
    ...nextAttempt,
    passingScore: session.passingScore,
    remainingAttempts: Math.max(session.maxAttempts - nextHistory.length, 0),
    canRetake: nextHistory.length < session.maxAttempts,
  })
})

app.get('/api/notifications', requireAuth, async (req, res) => {
  const rawLimit = Number(req.query.limit || 30)
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 30

  const courses = Array.isArray(req.db.courses) ? req.db.courses : []
  const courseMap = Object.fromEntries(courses.map((course) => [course.id, course]))
  const activities = Object.values(req.db.discussions || {})
    .flatMap((items) => (Array.isArray(items) ? items : []))
    .filter((item) => item.authorId !== req.user.id)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, limit)
    .map((item) => {
      const course = courseMap[item.courseId]
      return {
        id: item.id,
        courseId: item.courseId,
        lessonId: item.lessonId,
        authorName: item.authorName,
        message: item.message,
        isMention: Array.isArray(item.mentionUserIds) ? item.mentionUserIds.includes(req.user.id) : false,
        createdAt: item.createdAt,
        courseTitle: course?.title || 'Course',
        lessonTitle: course ? findLessonTitle(course, item.lessonId) : 'Lesson',
      }
    })

  return res.json(activities)
})

app.get('/api/notifications/channels', requireAuth, requireAdmin, async (req, res) => {
  return res.json({
    ...(req.db.notificationChannels || { webhookEnabled: false, webhookUrl: '', emailEnabled: false, emailFrom: 'no-reply@curiosity.app' }),
    emailProviderMode: EMAIL_PROVIDER_MODE,
    emailProviderWebhookConfigured: Boolean(EMAIL_PROVIDER_WEBHOOK_URL),
  })
})

app.put('/api/notifications/channels', requireAuth, requireAdmin, validateBody(notificationChannelConfigSchema), async (req, res) => {
  req.db.notificationChannels = {
    webhookEnabled: Boolean(req.body.webhookEnabled),
    webhookUrl: String(req.body.webhookUrl || ''),
    emailEnabled: Boolean(req.body.emailEnabled),
    emailFrom: String(req.body.emailFrom || 'no-reply@curiosity.app'),
  }
  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'notification_channels_update',
    target: 'notification_channels',
    detail: 'Updated notification delivery channels.',
  })
  await writeDb(req.db)
  return res.json(req.db.notificationChannels)
})

app.post('/api/notifications/test-delivery', requireAuth, requireAdmin, validateBody(notificationTestDeliverySchema), async (req, res) => {
  const channels = req.db.notificationChannels || {}
  const channel = req.body.channel
  const message = String(req.body.message || '').trim()
  const createdAt = new Date().toISOString()
  const item = {
    id: `delivery-${Math.random().toString(36).slice(2, 10)}`,
    channel,
    message,
    status: 'queued',
    target: channel === 'webhook' ? String(channels.webhookUrl || '') : String(channels.emailFrom || ''),
    actorEmail: req.user.email,
    createdAt,
    responseStatus: null,
    responseBody: '',
  }

  if (channel === 'webhook') {
    const enabled = Boolean(channels.webhookEnabled && channels.webhookUrl)
    if (!enabled) {
      item.status = 'skipped'
      item.responseBody = 'Webhook channel disabled or URL missing.'
    } else {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), EMAIL_PROVIDER_TIMEOUT_MS)
        const payload = {
          event: 'curiosity.notification.test',
          message,
          triggeredAt: createdAt,
          actor: req.user.email,
        }
        const bodyText = JSON.stringify(payload)
        const nonce = `nonce-${Math.random().toString(36).slice(2, 11)}`
        const signature = buildWebhookSignature(NOTIFICATION_WEBHOOK_SECRET, createdAt, bodyText)
        const response = await fetch(channels.webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(signature ? { 'X-Curiosity-Signature': signature } : {}),
            'X-Curiosity-Timestamp': createdAt,
            'X-Curiosity-Nonce': nonce,
          },
          body: bodyText,
          signal: controller.signal,
        })
        clearTimeout(timeoutId)
        item.responseStatus = response.status
        item.responseBody = await response.text()
        item.status = response.ok ? 'delivered' : 'failed'
      } catch (error) {
        item.status = 'failed'
        item.responseBody = error?.message || 'Webhook delivery failed.'
      }
    }
  } else {
    const enabled = Boolean(channels.emailEnabled)
    if (!enabled) {
      item.status = 'skipped'
      item.responseBody = 'Email channel disabled.'
    } else {
      if (EMAIL_PROVIDER_MODE === 'webhook') {
        if (!EMAIL_PROVIDER_WEBHOOK_URL) {
          item.status = 'failed'
          item.responseBody = 'EMAIL_PROVIDER_WEBHOOK_URL not configured.'
        } else {
          try {
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), EMAIL_PROVIDER_TIMEOUT_MS)
            const payload = {
              event: 'curiosity.notification.email-test',
              from: String(channels.emailFrom || 'no-reply@curiosity.app'),
              to: req.user.email,
              subject: 'Curiosity LMS test email delivery',
              text: message,
              sentAt: createdAt,
            }
            const bodyText = JSON.stringify(payload)
            const signature = buildWebhookSignature(NOTIFICATION_WEBHOOK_SECRET, createdAt, bodyText)
            const response = await fetch(EMAIL_PROVIDER_WEBHOOK_URL, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(EMAIL_PROVIDER_API_KEY ? { Authorization: `Bearer ${EMAIL_PROVIDER_API_KEY}` } : {}),
                ...(signature ? { 'X-Curiosity-Signature': signature } : {}),
                'X-Curiosity-Timestamp': createdAt,
              },
              body: bodyText,
              signal: controller.signal,
            })
            clearTimeout(timeoutId)
            item.responseStatus = response.status
            item.responseBody = await response.text()
            item.status = response.ok ? 'delivered' : 'failed'
          } catch (error) {
            item.status = 'failed'
            item.responseBody = error?.message || 'Email provider delivery failed.'
          }
        }
      } else {
        item.status = 'queued'
        item.responseBody = 'Email delivery queued (simulation).'
      }
    }
  }

  req.db.notificationDeliveryLogs = [item, ...(req.db.notificationDeliveryLogs || [])].slice(0, 1000)
  addAuditLog(req.db, {
    actor: req.user.email,
    action: 'notification_test_delivery',
    target: channel,
    detail: `Test delivery ${item.status}.`,
  })
  await writeDb(req.db)
  return res.json(item)
})

app.post('/api/notifications/webhook/ingest', validateBody(webhookIngestSchema), async (req, res) => {
  if (!NOTIFICATION_WEBHOOK_SECRET) {
    return res.status(503).json({ message: 'Webhook secret is not configured.' })
  }
  const signature = String(req.headers['x-curiosity-signature'] || '')
  const timestampRaw = String(req.headers['x-curiosity-timestamp'] || '')
  const nonce = String(req.headers['x-curiosity-nonce'] || '').trim()
  if (!signature || !timestampRaw || !nonce) {
    return res.status(401).json({ message: 'Missing signature headers.' })
  }
  const timestampMs = parseWebhookTimestampMs(timestampRaw)
  if (!Number.isFinite(timestampMs)) {
    return res.status(401).json({ message: 'Invalid webhook timestamp.' })
  }
  const toleranceMs = Math.max(1, WEBHOOK_SIGNATURE_TOLERANCE_SEC) * 1000
  if (Math.abs(Date.now() - timestampMs) > toleranceMs) {
    return res.status(401).json({ message: 'Webhook timestamp expired.' })
  }
  req.db.webhookReplayNonces = req.db.webhookReplayNonces && typeof req.db.webhookReplayNonces === 'object' ? req.db.webhookReplayNonces : {}
  const existingNonceTime = Number(req.db.webhookReplayNonces[nonce] || 0)
  if (Number.isFinite(existingNonceTime) && existingNonceTime > Date.now()) {
    return res.status(409).json({ message: 'Webhook replay detected.' })
  }
  const bodyText = JSON.stringify(req.body || {})
  const expected = buildWebhookSignature(NOTIFICATION_WEBHOOK_SECRET, timestampRaw, bodyText)
  if (!secureTextEqual(expected, signature)) {
    return res.status(401).json({ message: 'Invalid webhook signature.' })
  }
  req.db.webhookReplayNonces[nonce] = Date.now() + toleranceMs * 2
  const nonceEntries = Object.entries(req.db.webhookReplayNonces)
    .filter(([, expiresAt]) => Number(expiresAt) > Date.now())
    .slice(0, MAX_WEBHOOK_REPLAY_NONCES)
  req.db.webhookReplayNonces = Object.fromEntries(nonceEntries)

  const item = {
    id: `delivery-${Math.random().toString(36).slice(2, 10)}`,
    channel: 'webhook-inbound',
    message: String(req.body?.message || ''),
    status: 'accepted',
    target: String(req.body?.event || 'incoming-event'),
    actorEmail: 'external-webhook',
    createdAt: new Date().toISOString(),
    responseStatus: 202,
    responseBody: 'accepted',
  }
  req.db.notificationDeliveryLogs = [item, ...(req.db.notificationDeliveryLogs || [])].slice(0, 1000)
  addAuditLog(req.db, {
    actor: 'external-webhook',
    action: 'notification_webhook_ingest',
    target: String(req.body?.event || 'event'),
    detail: `Accepted webhook event ${String(req.body?.event || 'unknown')}.`,
  })
  await writeDb(req.db)
  return res.status(202).json({ ok: true, receivedAt: item.createdAt })
})

app.get('/api/notifications/delivery-logs', requireAuth, requireAdmin, async (req, res) => {
  const rawLimit = Number(req.query.limit || 100)
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 500) : 100
  return res.json((req.db.notificationDeliveryLogs || []).slice(0, limit))
})

app.get('/api/audit-logs', requireAuth, requireAdmin, async (req, res) => {
  const rawLimit = Number(req.query.limit || 100)
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 300) : 100
  return res.json((req.db.auditLogs || []).slice(0, limit))
})

app.get('/api/audit-logs/immutable', requireAuth, requireAdmin, async (req, res) => {
  const rawLimit = Number(req.query.limit || 100)
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 1000) : 100
  return res.json((req.db.immutableAuditLogs || []).slice(0, limit))
})

app.get('/api/audit-logs/immutable/verify', requireAuth, requireAdmin, async (req, res) => {
  return res.json(verifyImmutableAuditChain(req.db.immutableAuditLogs || []))
})

app.post('/api/telemetry/events', requireAuth, validateBody(telemetryEventSchema), async (req, res) => {
  addTelemetryEvent(req.db, req.body, req.user)
  await writeDb(req.db)
  return res.status(202).json({ ok: true })
})

app.get('/api/telemetry/events', requireAuth, requireAdmin, async (req, res) => {
  const rawLimit = Number(req.query.limit || 100)
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 500) : 100
  return res.json((req.db.telemetryEvents || []).slice(0, limit))
})

app.use('/api/*splat', (_req, res) => {
  res.status(404).json({ message: 'Endpoint not found.' })
})

app.use(handleAppError)

const start = async () => {
  await ensureDb()
  const server = app.listen(PORT, () => {
    console.log(`Curiosity API listening on http://localhost:${PORT}/api`)
  })
  const schedulerWorkerId = `scheduler:${process.pid}`
  let jobWorkerBusy = false
  const jobWorkerTimer = setInterval(async () => {
    if (jobWorkerBusy) return
    jobWorkerBusy = true
    try {
      const db = await readDb()
      const lease = acquireCourseJobWorkerLease(db, schedulerWorkerId)
      if (lease.acquired) {
        await writeDb(db)
        try {
          processDueCourseManagementJobs(db, 'scheduler', 3)
        } finally {
          releaseCourseJobWorkerLease(db, schedulerWorkerId)
        }
        await writeDb(db)
      }
    } catch {
      // swallow scheduler errors
    } finally {
      jobWorkerBusy = false
    }
  }, 5000)
  if (server && typeof server.on === 'function') {
    server.on('close', () => {
      clearInterval(jobWorkerTimer)
    })
  }
  return server
}

/* c8 ignore start */
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  start().catch((error) => {
    console.error('Failed to start API:', error)
    process.exit(1)
  })
}
/* c8 ignore stop */

export { app, ensureDb, readDb, writeDb, resetDb, start, createCorsOriginValidator, handleAppError, checkPasswordAndUpgrade }
