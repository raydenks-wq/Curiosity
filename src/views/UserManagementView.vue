<template>
  <section class="user-mgmt-layout">
    <article class="card full-width">
      <div class="section-header">
        <h2>User Account Management</h2>
        <div class="table-actions">
          <button class="ghost-btn" type="button" @click="openInviteModal">Invite User</button>
          <button class="primary-btn" type="button" @click="openCreateModal">Add User</button>
        </div>
      </div>
      <p class="muted">Kelola role dan status akun dengan 3 level akses terstandar.</p>
      <div class="role-grid">
        <article v-for="level in accessLevels" :key="level.id" class="role-card">
          <h3>{{ level.label }}</h3>
          <p class="muted">{{ level.description }}</p>
          <span class="pill">{{ totals.byRole[level.id] || 0 }} users</span>
        </article>
      </div>
    </article>

    <article class="card summary-card">
      <h3>Total Users</h3>
      <p class="stat-big">{{ totals.total }}</p>
    </article>

    <article class="card summary-card">
      <h3>Active</h3>
      <p class="stat-big">{{ totals.active }}</p>
    </article>

    <article class="card summary-card">
      <h3>Suspended</h3>
      <p class="stat-big">{{ totals.suspended }}</p>
    </article>

    <article class="card full-width">
      <div class="user-filter-row">
        <input v-model="keyword" class="search-input" type="search" placeholder="Search name atau email..." />
        <select v-model="roleFilter">
          <option value="all">All Roles</option>
          <option v-for="level in accessLevels" :key="level.id" :value="level.id">{{ level.label }}</option>
        </select>
        <select v-model="statusFilter">
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="pending">Pending</option>
        </select>
        <select v-model="sortKey">
          <option value="name">Sort: Name</option>
          <option value="role">Sort: Role</option>
          <option value="status">Sort: Status</option>
          <option value="lastLogin">Sort: Last Login</option>
        </select>
        <select v-model="sortDir">
          <option value="asc">Asc</option>
          <option value="desc">Desc</option>
        </select>
      </div>

      <div class="bulk-row" v-if="selectedIds.length">
        <span>{{ selectedIds.length }} user terpilih</span>
        <div class="table-actions">
          <button class="ghost-btn" type="button" @click="runBulkStatus('active')">Activate</button>
          <button class="ghost-btn" type="button" @click="runBulkStatus('suspended')">Suspend</button>
          <button class="ghost-btn danger-btn" type="button" @click="runBulkDelete">Delete</button>
        </div>
      </div>

      <div class="user-table-wrap">
        <table class="user-table">
          <thead>
            <tr>
              <th><input type="checkbox" :checked="isPageSelected" @change="togglePageSelection" /></th>
              <th @click="toggleSort('name')" class="sortable">Name</th>
              <th>Email</th>
              <th @click="toggleSort('role')" class="sortable">Role</th>
              <th @click="toggleSort('status')" class="sortable">Status</th>
              <th @click="toggleSort('lastLogin')" class="sortable">Last Login</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in paginatedUsers" :key="user.id">
              <td>
                <input type="checkbox" :checked="selectedIds.includes(user.id)" @change="toggleSelected(user.id)" />
              </td>
              <td>{{ user.name }}</td>
              <td>{{ user.email }}</td>
              <td><span class="pill role-pill">{{ roleLabel(user.role) }}</span></td>
              <td>
                <span class="status-pill" :class="`status-${user.status}`">{{ user.status }}</span>
              </td>
              <td>{{ user.lastLogin }}</td>
              <td>
                <div class="table-actions">
                  <button class="ghost-btn" type="button" @click="openEditModal(user)">Edit</button>
                  <button class="ghost-btn" type="button" @click="resetPassword(user)">Reset Password</button>
                  <button class="ghost-btn" type="button" @click="toggleUserStatus(user)">
                    {{ user.status === 'active' ? 'Suspend' : 'Activate' }}
                  </button>
                  <button class="ghost-btn danger-btn" type="button" @click="deleteUser(user)">Delete</button>
                </div>
              </td>
            </tr>
            <tr v-if="!paginatedUsers.length">
              <td colspan="7" class="empty-cell">Tidak ada user yang cocok dengan filter.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="pager-row">
        <span>Page {{ page }} / {{ totalPages }}</span>
        <div class="table-actions">
          <select v-model="pageSize">
            <option :value="5">5 / page</option>
            <option :value="10">10 / page</option>
            <option :value="20">20 / page</option>
          </select>
          <button class="ghost-btn" type="button" :disabled="page <= 1" @click="page--">Prev</button>
          <button class="ghost-btn" type="button" :disabled="page >= totalPages" @click="page++">Next</button>
        </div>
      </div>
    </article>

    <article class="card full-width">
      <div class="section-header">
        <h3>Permission Matrix</h3>
        <button class="primary-btn" type="button" @click="savePermissionMatrix">Save Permissions</button>
      </div>
      <div class="user-table-wrap">
        <table class="user-table">
          <thead>
            <tr>
              <th>Permission</th>
              <th v-for="level in accessLevels" :key="`head-${level.id}`">{{ level.label }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(label, key) in permissionLabels" :key="key">
              <td>{{ label }}</td>
              <td v-for="level in accessLevels" :key="`${key}-${level.id}`">
                <input type="checkbox" v-model="permissionMatrix[level.id][key]" :disabled="level.id === 'admin'" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </article>

    <article class="card full-width">
      <div class="section-header">
        <h3>Audit Log</h3>
      </div>
      <div class="audit-list">
        <div class="audit-item" v-for="log in auditLogs" :key="log.id">
          <strong>{{ log.actor }}</strong>
          <span>{{ log.action }} · {{ log.target }}</span>
          <p class="muted">{{ log.detail }}</p>
          <small class="muted">{{ log.timestamp }}</small>
        </div>
      </div>
    </article>

    <article v-if="isLoading" class="card full-width profile-loading-card">
      <p class="muted">Loading user accounts...</p>
    </article>

    <Teleport to="body">
      <div v-if="isModalOpen || isInviteModalOpen" class="modal-overlay" @click.self="closeAllModal">
        <article class="modal-card" v-if="isModalOpen">
          <h3>{{ editingId ? 'Edit User' : 'Add User' }}</h3>
          <form class="form-grid compact" @submit.prevent="submitModal">
            <label>
              Full Name
              <input v-model="form.name" type="text" required />
            </label>
            <label>
              Email
              <input v-model="form.email" type="email" required />
            </label>
            <label>
              Role
              <select v-model="form.role">
                <option v-for="level in accessLevels" :key="level.id" :value="level.id">{{ level.label }}</option>
              </select>
            </label>
            <label>
              Status
              <select v-model="form.status">
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="pending">Pending</option>
              </select>
            </label>
            <div class="form-actions full">
              <button class="ghost-btn" type="button" @click="closeAllModal">Cancel</button>
              <button class="primary-btn" type="submit" :disabled="isSaving">{{ isSaving ? 'Saving...' : 'Save User' }}</button>
            </div>
          </form>
        </article>

        <article class="modal-card" v-else>
          <h3>Invite User by Email</h3>
          <form class="form-grid compact" @submit.prevent="submitInvite">
            <label>
              Full Name
              <input v-model="inviteForm.name" type="text" required />
            </label>
            <label>
              Email
              <input v-model="inviteForm.email" type="email" required />
            </label>
            <label>
              Role
              <select v-model="inviteForm.role">
                <option v-for="level in accessLevels" :key="level.id" :value="level.id">{{ level.label }}</option>
              </select>
            </label>
            <div class="form-actions full">
              <button class="ghost-btn" type="button" @click="closeAllModal">Cancel</button>
              <button class="primary-btn" type="submit" :disabled="isSaving">{{ isSaving ? 'Sending...' : 'Send Invite' }}</button>
            </div>
          </form>
        </article>
      </div>
    </Teleport>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useToastStore } from '../stores/toast'
import { useUserManagementStore } from '../stores/userManagement'
import { useAuditLogStore } from '../stores/auditLog'
import { useProfileStore } from '../stores/profile'

const toastStore = useToastStore()
const userStore = useUserManagementStore()
const auditLogStore = useAuditLogStore()
const profileStore = useProfileStore()

const { users, accessLevels, totals, isLoading, isSaving, permissionLabels, permissionMatrix } =
  storeToRefs(userStore)
const { logs } = storeToRefs(auditLogStore)
const { profile } = storeToRefs(profileStore)

const keyword = ref('')
const roleFilter = ref('all')
const statusFilter = ref('all')
const sortKey = ref('name')
const sortDir = ref('asc')
const page = ref(1)
const pageSize = ref(10)
const selectedIds = ref([])

const isModalOpen = ref(false)
const isInviteModalOpen = ref(false)
const editingId = ref('')
const form = reactive({
  name: '',
  email: '',
  role: 'student',
  status: 'active',
})
const inviteForm = reactive({
  name: '',
  email: '',
  role: 'student',
})

const actorName = computed(() => profile.value?.name || 'Admin')
const roleLabel = (role) => accessLevels.value.find((item) => item.id === role)?.label || role

const filteredUsers = computed(() => {
  const key = keyword.value.trim().toLowerCase()
  const list = users.value.filter((user) => {
    const matchKeyword = !key || user.name.toLowerCase().includes(key) || user.email.toLowerCase().includes(key)
    const matchRole = roleFilter.value === 'all' || user.role === roleFilter.value
    const matchStatus = statusFilter.value === 'all' || user.status === statusFilter.value
    return matchKeyword && matchRole && matchStatus
  })

  const sorted = [...list].sort((a, b) => {
    const aVal = String(a[sortKey.value] || '').toLowerCase()
    const bVal = String(b[sortKey.value] || '').toLowerCase()
    const base = aVal.localeCompare(bVal)
    return sortDir.value === 'asc' ? base : -base
  })

  return sorted
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredUsers.value.length / pageSize.value)))

const paginatedUsers = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return filteredUsers.value.slice(start, start + pageSize.value)
})

const isPageSelected = computed(() => {
  if (!paginatedUsers.value.length) return false
  return paginatedUsers.value.every((user) => selectedIds.value.includes(user.id))
})

const auditLogs = computed(() => logs.value.slice(0, 16))

const addAudit = (action, target, detail) => {
  auditLogStore.log({
    actor: actorName.value,
    action,
    target,
    detail,
  })
}

const openCreateModal = () => {
  editingId.value = ''
  Object.assign(form, {
    name: '',
    email: '',
    role: 'student',
    status: 'active',
  })
  isModalOpen.value = true
}

const openInviteModal = () => {
  Object.assign(inviteForm, {
    name: '',
    email: '',
    role: 'student',
  })
  isInviteModalOpen.value = true
}

const openEditModal = (user) => {
  editingId.value = user.id
  Object.assign(form, {
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
  })
  isModalOpen.value = true
}

const closeAllModal = () => {
  isModalOpen.value = false
  isInviteModalOpen.value = false
}

const submitModal = async () => {
  await userStore.saveUser({
    id: editingId.value || undefined,
    name: form.name,
    email: form.email,
    role: form.role,
    status: form.status,
  })

  addAudit(editingId.value ? 'update_user' : 'create_user', form.email, `${form.name} (${form.role}, ${form.status})`)

  toastStore.push({
    type: 'success',
    title: editingId.value ? 'User Updated' : 'User Added',
    message: `${form.name} berhasil disimpan.`,
  })

  closeAllModal()
}

const submitInvite = async () => {
  await userStore.inviteUser({ ...inviteForm })
  addAudit('invite_user', inviteForm.email, `${inviteForm.name} invited as ${inviteForm.role}`)
  toastStore.push({
    type: 'info',
    title: 'Invitation Sent',
    message: `Invite dikirim ke ${inviteForm.email}.`,
  })
  closeAllModal()
}

const toggleUserStatus = async (user) => {
  const nextStatus = user.status === 'active' ? 'suspended' : 'active'
  await userStore.toggleStatus(user.id)
  addAudit('toggle_status', user.email, `${user.name} => ${nextStatus}`)
  toastStore.push({
    type: 'info',
    title: 'Status Updated',
    message: `${user.name} sekarang ${nextStatus}.`,
  })
}

const resetPassword = async (user) => {
  await userStore.resetPassword(user.id)
  addAudit('reset_password', user.email, `Password reset requested for ${user.name}`)
  toastStore.push({
    type: 'info',
    title: 'Password Reset',
    message: `Password untuk ${user.name} telah di-reset.`,
  })
}

const deleteUser = async (user) => {
  await userStore.deleteUser(user.id)
  selectedIds.value = selectedIds.value.filter((id) => id !== user.id)
  addAudit('delete_user', user.email, `${user.name} deleted`)
  toastStore.push({
    type: 'error',
    title: 'User Deleted',
    message: `${user.name} dihapus dari sistem.`,
  })
}

const toggleSelected = (id) => {
  if (selectedIds.value.includes(id)) {
    selectedIds.value = selectedIds.value.filter((item) => item !== id)
    return
  }

  selectedIds.value = [...selectedIds.value, id]
}

const togglePageSelection = () => {
  const pageIds = paginatedUsers.value.map((user) => user.id)

  if (isPageSelected.value) {
    selectedIds.value = selectedIds.value.filter((id) => !pageIds.includes(id))
    return
  }

  const set = new Set([...selectedIds.value, ...pageIds])
  selectedIds.value = [...set]
}

const runBulkStatus = async (status) => {
  if (!selectedIds.value.length) return
  await userStore.bulkUpdateStatus(selectedIds.value, status)
  addAudit('bulk_status', `${selectedIds.value.length} users`, `Updated status to ${status}`)
  toastStore.push({
    type: 'info',
    title: 'Bulk Status Updated',
    message: `${selectedIds.value.length} user diubah ke ${status}.`,
  })
  selectedIds.value = []
}

const runBulkDelete = async () => {
  if (!selectedIds.value.length) return
  const count = selectedIds.value.length
  await userStore.deleteUsers(selectedIds.value)
  addAudit('bulk_delete', `${count} users`, `${count} users deleted from platform`)
  toastStore.push({
    type: 'error',
    title: 'Bulk Delete Completed',
    message: `${count} user dihapus dari sistem.`,
  })
  selectedIds.value = []
}

const savePermissionMatrix = async () => {
  await userStore.savePermissionMatrix()
  addAudit('update_permission_matrix', 'roles', 'Permission matrix updated')
  toastStore.push({
    type: 'success',
    title: 'Permissions Saved',
    message: 'Permission matrix berhasil diperbarui.',
  })
}

const toggleSort = (key) => {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
    return
  }
  sortKey.value = key
  sortDir.value = 'asc'
}

watch([keyword, roleFilter, statusFilter, sortKey, sortDir, pageSize], () => {
  page.value = 1
})

watch(totalPages, (next) => {
  if (page.value > next) {
    page.value = next
  }
})

onMounted(async () => {
  await Promise.all([userStore.load(), profileStore.load()])
  auditLogStore.load()
})
</script>
