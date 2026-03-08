<template>
  <div class="app-shell" :class="`template-${currentTemplate}`">
    <TopNav />
    <GlobalToasts />

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
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { RouterView } from 'vue-router'
import TopNav from './components/TopNav.vue'
import TopBar from './components/TopBar.vue'
import GlobalToasts from './components/GlobalToasts.vue'
import { useTemplateSwitcher } from './plugins/templateSwitcher'

const { currentTemplate } = useTemplateSwitcher()

const transitionMap = {
  aurora: 'route-aurora',
  sunrise: 'route-mosaic',
}

const routeTransitionName = computed(() => transitionMap[currentTemplate.value] ?? 'route-mosaic')
</script>
