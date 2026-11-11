import '@fontsource/alegreya-sans/500.css'
import '@fontsource/alegreya-sans/700.css'
import '@fontsource/alegreya-sans/800.css'
import '@fontsource/ruslan-display/400.css'
import './style.css'

import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { useGameStore } from './stores/game'

createApp(App).use(createPinia()).mount('#app')

// ?debug в адресе — игра доступна из консоли как window.__throne
if (new URLSearchParams(location.search).has('debug')) {
  const store = useGameStore()
  Object.assign(window, { __throne: { game: store.game, store } })
}
