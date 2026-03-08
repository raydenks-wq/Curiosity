import { createRouter, createWebHistory } from 'vue-router'
import DashboardView from '../views/DashboardView.vue'
import CourseDetailView from '../views/CourseDetailView.vue'
import QuizView from '../views/QuizView.vue'
import ProfileView from '../views/ProfileView.vue'
import UserManagementView from '../views/UserManagementView.vue'
import { useProfileStore } from '../stores/profile'
import { useToastStore } from '../stores/toast'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: DashboardView,
    },
    {
      path: '/courses/:id',
      name: 'course-detail',
      component: CourseDetailView,
    },
    {
      path: '/quiz/:id',
      name: 'quiz',
      component: QuizView,
    },
    {
      path: '/profile',
      name: 'profile',
      component: ProfileView,
    },
    {
      path: '/users',
      name: 'users',
      component: UserManagementView,
    },
  ],
})

router.beforeEach(async (to) => {
  if (to.name !== 'users') return true

  const profileStore = useProfileStore()
  const toastStore = useToastStore()
  await profileStore.load()

  if (profileStore.profile.accessRole === 'admin') {
    return true
  }

  toastStore.push({
    type: 'error',
    title: 'Access Denied',
    message: 'Halaman User Management hanya untuk Admin.',
  })

  return { name: 'dashboard' }
})

export default router
