<template>
  <div class="hero-art" :class="`hero-art-${currentTemplate}`" aria-hidden="true">
    <svg v-if="currentTemplate === 'sunrise'" viewBox="0 0 320 140" class="hero-art-svg">
      <rect x="30" y="20" width="80" height="80" rx="16" fill="rgba(255,246,228,0.45)"/>
      <rect x="120" y="42" width="70" height="56" rx="12" fill="rgba(255,208,171,0.65)"/>
      <rect x="202" y="24" width="88" height="90" rx="20" fill="rgba(255,233,210,0.5)"/>
    </svg>

    <svg v-else viewBox="0 0 320 140" class="hero-art-svg">
      <path d="M0 88 C60 34, 130 132, 190 78 S280 26, 320 64" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="10"/>
      <circle cx="52" cy="32" r="12" fill="rgba(255,255,255,0.42)"/>
      <circle cx="252" cy="102" r="18" fill="rgba(255,255,255,0.28)"/>
    </svg>
  </div>
</template>

<script setup>
import { useTemplateSwitcher } from '../../plugins/templateSwitcher'

const { currentTemplate } = useTemplateSwitcher()
</script>
