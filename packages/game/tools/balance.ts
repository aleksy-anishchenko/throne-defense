// npm run balance — прогнать всех ботов по всем уровням и показать, как идут волны.
// Запускается прямо в Node: он умеет выполнять TypeScript без сборки.

import { BALANCE_VERSION, LEVELS } from '../src/index.ts'
import { STRATEGIES, playBot } from './bot.ts'

/** Ширина первого столбца таблицы (номер волны) и остальных, в символах; заголовок ниже подогнан под них */
const FIRST_COLUMN_WIDTH = 5
const OTHER_COLUMN_WIDTH = 7

const OUTCOME_LABEL = { won: 'ПОБЕДА', lost: 'поражение', stuck: 'зависла волна' }

console.log(`Баланс версии ${BALANCE_VERSION}\n`)

for (const level of LEVELS) {
  console.log(`=== Уровень «${level.name}» (${level.waves.length} волн)\n`)

  for (const strategy of STRATEGIES) {
    const started = performance.now()
    const result = playBot(level, strategy)
    const elapsedMs = Math.round(performance.now() - started)

    console.log(
      `--- ${strategy.name}: ${OUTCOME_LABEL[result.outcome]}, счёт ${result.score} (за ${elapsedMs} мс)`,
    )
    console.log('волна  жизни  потеряно  золото  стража')
    for (const report of result.waves) {
      // livesLost || '': потерь нет — оставляем клетку пустой
      const row = [report.wave, report.lives, report.livesLost || '', report.gold, report.towers]
      console.log(
        row
          .map((value, i) =>
            String(value).padStart(i === 0 ? FIRST_COLUMN_WIDTH : OTHER_COLUMN_WIDTH),
          )
          .join(''),
      )
    }
    console.log()
  }
}
