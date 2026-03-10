import { createRouter, createWebHistory } from 'vue-router'
import DashboardView from '../views/DashboardView.vue'
import CourseDetailView from '../views/CourseDetailView.vue'
import QuizView from '../views/QuizView.vue'
import QuizManagementView from '../views/QuizManagementView.vue'
import CourseManagementView from '../views/CourseManagementView.vue'
import ProfileView from '../views/ProfileView.vue'
import UserManagementView from '../views/UserManagementView.vue'
import LoginView from '../views/LoginView.vue'
import { useAuthStore } from '../stores/auth'
import { useProfileStore } from '../stores/profile'
import { useToastStore } from '../stores/toast'

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
