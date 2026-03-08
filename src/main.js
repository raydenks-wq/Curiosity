import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { createTemplateSwitcher } from './plugins/templateSwitcher'
import './style.css'

createApp(App).use(router).use(createTemplateSwitcher()).mount('#app')
