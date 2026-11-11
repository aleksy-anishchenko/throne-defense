// Шрифты: только кириллица и латиница. Общие файлы (500.css и т.п.) тянут ещё греческий,
// вьетнамский и прочие наборы — браузер их не качает, но они лежали бы в сборке.
// Стрелки «→» нет ни в одном наборе Alegreya Sans: она и раньше бралась из системного шрифта
import '@fontsource/alegreya-sans/cyrillic-500.css'
import '@fontsource/alegreya-sans/latin-500.css'
import '@fontsource/alegreya-sans/cyrillic-700.css'
import '@fontsource/alegreya-sans/latin-700.css'
import '@fontsource/alegreya-sans/cyrillic-800.css'
import '@fontsource/alegreya-sans/latin-800.css'
import '@fontsource/ruslan-display/cyrillic-400.css'
import '@fontsource/ruslan-display/latin-400.css'
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
