<template>
  <div class="hero-art" :class="`hero-art-${currentTemplate}`" aria-hidden="true">
    <svg v-if="currentTemplate === 'ocean'" viewBox="0 0 320 140" class="hero-art-svg">
      <path d="M0 88 C60 34, 130 132, 190 78 S280 26, 320 64" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="10"/>
      <circle cx="52" cy="32" r="12" fill="rgba(255,255,255,0.42)"/>
      <circle cx="252" cy="102" r="18" fill="rgba(255,255,255,0.28)"/>
    </svg>

    <svg v-else-if="currentTemplate === 'sunrise'" viewBox="0 0 320 140" class="hero-art-svg">
      <rect x="30" y="20" width="80" height="80" rx="16" fill="rgba(255,246,228,0.45)"/>
      <rect x="120" y="42" width="70" height="56" rx="12" fill="rgba(255,208,171,0.65)"/>
      <rect x="202" y="24" width="88" height="90" rx="20" fill="rgba(255,233,210,0.5)"/>
    </svg>

    <svg v-else-if="currentTemplate === 'graphite'" viewBox="0 0 320 140" class="hero-art-svg">
      <rect x="24" y="22" width="272" height="96" rx="14" fill="rgba(203,213,225,0.18)"/>
      <path d="M40 48h90 M40 66h110 M40 84h70" stroke="rgba(226,232,240,0.65)" stroke-width="7" stroke-linecap="round"/>
      <rect x="190" y="42" width="84" height="58" rx="10" fill="rgba(241,245,249,0.28)"/>
    </svg>

    <svg v-else-if="currentTemplate === 'neon'" viewBox="0 0 320 140" class="hero-art-svg">
      <path d="M32 102 L88 30 L150 96 L216 24 L286 104" fill="none" stroke="rgba(186,230,253,0.8)" stroke-width="8" stroke-linecap="round"/>
      <circle cx="88" cy="30" r="10" fill="rgba(196,181,253,0.78)"/>
      <circle cx="216" cy="24" r="10" fill="rgba(167,243,208,0.8)"/>
    </svg>

    <svg v-else viewBox="0 0 320 140" class="hero-art-svg">
      <rect x="38" y="20" width="238" height="98" rx="8" fill="rgba(255,245,230,0.38)"/>
      <path d="M56 44h188 M56 62h170 M56 80h145" stroke="rgba(255,235,204,0.65)" stroke-width="6" stroke-linecap="round"/>
      <circle cx="254" cy="94" r="14" fill="rgba(249,217,165,0.55)"/>
    </svg>
  </div>
</template>

<script setup>
import { useTemplateSwitcher } from '../../plugins/templateSwitcher'

const { currentTemplate } = useTemplateSwitcher()
</script>
