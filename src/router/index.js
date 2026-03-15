import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useProfileStore } from '../stores/profile'
import { useToastStore } from '../stores/toast'
import { featureFlags } from '../config/runtimeFlags'

const DashboardView = () => import('../views/DashboardView.vue')
const CourseCatalogView = () => import('../views/CourseCatalogView.vue')
const CourseDetailView = () => import('../views/CourseDetailView.vue')
const QuizView = () => import('../views/QuizView.vue')
const QuizManagementView = () => import('../views/QuizManagementView.vue')
const CourseManagementView = () => import('../views/CourseManagementView.vue')
const CertificateManagementView = () => import('../views/CertificateManagementView.vue')
const CertificateVerifyView = () => import('../views/CertificateVerifyView.vue')
const ProfileView = () => import('../views/ProfileView.vue')
const UserManagementView = () => import('../views/UserManagementView.vue')
const LoginView = () => import('../views/LoginView.vue')

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: DashboardView,
      meta: { requiresAuth: true },
    },
    {
      path: '/courses',
      name: 'courses',
      component: CourseCatalogView,
      meta: { requiresAuth: true },
    },
    {
      path: '/courses/:id',
      name: 'course-detail',
      component: CourseDetailView,
      meta: { requiresAuth: true },
    },
    {
      path: '/quiz/:id',
      name: 'quiz',
      component: QuizView,
      meta: { requiresAuth: true },
    },
    {
      path: '/management/quizzes',
      name: 'quiz-admin',
      alias: ['/quiz-admin'],
      component: QuizManagementView,
      meta: { requiresAuth: true, roles: ['admin', 'instructor'] },
    },
    {
      path: '/management/courses',
      name: 'course-management',
      component: CourseManagementView,
      meta: { requiresAuth: true, roles: ['admin', 'instructor'] },
    },
    ...(featureFlags.certificateManagement
      ? [
          {
            path: '/management/certificates',
            name: 'certificate-management',
            component: CertificateManagementView,
            meta: { requiresAuth: true, roles: ['admin', 'instructor'] },
          },
        ]
      : []),
    {
      path: '/verify/certificate/:code?',
      name: 'certificate-verify',
      component: CertificateVerifyView,
      meta: { requiresAuth: false },
    },
    {
      path: '/profile',
      name: 'profile',
      component: ProfileView,
      meta: { requiresAuth: true },
    },
    {
      path: '/management/users',
      name: 'users',
      alias: ['/users'],
      component: UserManagementView,
      meta: { requiresAuth: true, roles: ['admin'] },
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView,
    },
  ],
})

const prefetchedRouteKeys = new Set()
const resolveRouteComponents = (target) => {
  const resolved = router.resolve(target)
  return (resolved.matched || [])
    .map((record) => {
      if (record?.components?.default) return record.components.default
      if (record?.component) return record.component
      return null
    })
    .filter(Boolean)
}

export const prefetchRouteComponents = async (target) => {
  const resolved = router.resolve(target)
  const key = `${resolved.name || resolved.path}::${resolved.fullPath || resolved.path}`
  if (prefetchedRouteKeys.has(key)) return
  prefetchedRouteKeys.add(key)
  const components = resolveRouteComponents(target)
  const tasks = components
    .map((component) => {
      if (typeof component === 'function') return component()
      return null
    })
    .filter(Boolean)
  if (!tasks.length) return
  await Promise.allSettled(tasks)
}

router.beforeEach(async (to) => {
  const authStore = useAuthStore()
  const profileStore = useProfileStore()
  const toastStore = useToastStore()

  await authStore.restoreSession()

  if (to.name === 'login' && authStore.isAuthenticated) {
    return { name: 'dashboard' }
  }

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  if (!to.meta.requiresAuth) {
    return true
  }

  await profileStore.load()
  profileStore.syncFromAuthUser(authStore.user)

  const requiredRoles = Array.isArray(to.meta.roles) ? to.meta.roles : []
  if (!requiredRoles.length || requiredRoles.includes(authStore.role)) {
    return true
  }

  toastStore.push({
    type: 'error',
    title: 'Access Denied',
    message: 'Kamu tidak punya akses ke halaman ini.',
  })

  return { name: 'dashboard' }
})

export default router
