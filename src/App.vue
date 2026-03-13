<template>
  <div class="app-shell" :class="`template-${currentTemplate}`">
    <GlobalToasts />

    <template v-if="isAppLayout">
      <TopNav />
      <div class="main-region">
        <TopBar />
        <main class="content-area">
          <RouterView v-slot="{ Component }">
            <Transition :name="routeTransitionName" mode="out-in">
              <component :is="Component" />
            </Transition>
          </RouterView>
        </main>
      </div>
    </template>

    <main v-else class="auth-content">
      <RouterView v-slot="{ Component }">
        <Transition :name="routeTransitionName" mode="out-in">
          <component :is="Component" />
        </Transition>
      </RouterView>
    </main>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import TopNav from './components/TopNav.vue'
import TopBar from './components/TopBar.vue'
import GlobalToasts from './components/GlobalToasts.vue'
import { useTemplateSwitcher } from './plugins/templateSwitcher'

const route = useRoute()
const { currentTemplate } = useTemplateSwitcher()

const transitionMap = {
  aurora: 'route-aurora',
  sunrise: 'route-mosaic',
}

const routeTransitionName = computed(() => transitionMap[currentTemplate.value] ?? 'route-mosaic')
const isAppLayout = computed(() => !['login', 'certificate-verify'].includes(String(route.name || '')))
</script>
