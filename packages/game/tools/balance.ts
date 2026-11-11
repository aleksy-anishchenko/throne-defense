// npm run balance — прогнать всех ботов по всем уровням и показать, как идут волны.
// Запускается прямо в Node: он умеет выполнять TypeScript без сборки.

import { BALANCE_VERSION, LEVELS } from '../src/index.ts'
import { STRATEGIES, playBot } from './bot.ts'

const RESULT = { won: 'ПОБЕДА', lost: 'поражение', stuck: 'зависла волна' }

console.log(`Баланс версии ${BALANCE_VERSION}\n`)

for (const level of LEVELS) {
  console.log(`=== Уровень «${level.name}» (${level.waves.length} волн)\n`)

  for (const s of STRATEGIES) {
    const started = performance.now()
    const res = playBot(level, s)
    const ms = Math.round(performance.now() - started)

    console.log(`--- ${s.name}: ${RESULT[res.result]}, счёт ${res.score} (за ${ms} мс)`)
    console.log('волна  жизни  потеряно  золото  стража')
    for (const w of res.waves) {
      const row = [w.wave, w.lives, w.lost || '', w.gold, w.towers]
      console.log(row.map((v, i) => String(v).padStart(i === 0 ? 5 : 7)).join(''))
    }
    console.log()
  }
}
