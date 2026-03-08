import { computed, inject, ref } from 'vue'

const TEMPLATE_SWITCHER_KEY = Symbol('template-switcher')
const STORAGE_KEY = 'curiosity:lms:template'

const templateOptions = [
  {
    id: 'ocean',
    label: 'Ocean Flow',
    summary: 'Balanced dashboard dengan fokus progress.',
  },
  {
    id: 'sunrise',
    label: 'Sunrise Mosaic',
    summary: 'Mosaic cards asimetris, nuansa kreatif.',
  },
  {
    id: 'graphite',
    label: 'Graphite Pro',
    summary: 'Panel layout dua kolom, gaya enterprise.',
  },
  {
    id: 'neon',
    label: 'Neon Sprint',
    summary: 'Bento grid dinamis ala bootcamp.',
  },
  {
    id: 'paper',
    label: 'Paper Classroom',
    summary: 'Editorial layout, gaya modul akademik.',
  },
]

const isValidTemplate = (id) => templateOptions.some((option) => option.id === id)

const applyTemplate = (id) => {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-template', id)
}

export const createTemplateSwitcher = () => ({
  install(app) {
    const currentTemplate = ref('ocean')

    const setTemplate = (id) => {
      if (!isValidTemplate(id)) return
      currentTemplate.value = id
      applyTemplate(id)

      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, id)
      }
    }

    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved && isValidTemplate(saved)) {
        currentTemplate.value = saved
      }
    }

    applyTemplate(currentTemplate.value)

    app.provide(TEMPLATE_SWITCHER_KEY, {
      templateOptions,
      currentTemplate,
      currentOption: computed(
        () => templateOptions.find((option) => option.id === currentTemplate.value) ?? templateOptions[0],
      ),
      setTemplate,
    })
  },
})

export const useTemplateSwitcher = () => {
  const context = inject(TEMPLATE_SWITCHER_KEY, null)

  if (!context) {
    throw new Error('templateSwitcher plugin is not installed')
  }

  return context
}
