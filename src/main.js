import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { createTemplateSwitcher } from './plugins/templateSwitcher'
import { currentApiAdapter } from './services/api/client'
import { runStartupMaintenance } from './services/startupMaintenance'
import './style.css'

runStartupMaintenance(currentApiAdapter)

createApp(App).use(createPinia()).use(router).use(createTemplateSwitcher()).mount('#app')
