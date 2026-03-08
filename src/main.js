import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { createTemplateSwitcher } from './plugins/templateSwitcher'
import './style.css'

createApp(App).use(createPinia()).use(router).use(createTemplateSwitcher()).mount('#app')
