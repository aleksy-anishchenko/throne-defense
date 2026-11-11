// npm run e2e — проверка собранной игры в настоящем браузере (Chrome без окна).
//
// Сам поднимает `vite preview` с папкой dist (её собирает `npm run build`),
// открывает игру с ?debug и проходит её как игрок: меню, постройка мышью, касанием и
// с клавиатуры, улучшение, продажа, волна, пауза, поражение, рекорд, победа, телефон.
// Состояние игры читает через window.__throne (доступен только с ?debug).
//
// Нужен установленный Google Chrome. Если его нет: `npx playwright-core install chromium`.

import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { preview } from 'vite'

const root = fileURLToPath(new URL('..', import.meta.url))
// Размер поля в клетках (как в уровне «Тронный зал»)
const COLS = 9
const ROWS = 13

let failed = 0
const errors = []

function check(name, ok, details = '') {
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${!ok && details ? ` — ${details}` : ''}`)
  if (!ok) failed++
}

async function launchBrowser() {
  try {
    return await chromium.launch({ channel: 'chrome', headless: true })
  } catch {
    try {
      return await chromium.launch({ headless: true })
    } catch {
      console.error(
        'Не найден браузер. Установи Google Chrome или выполни: npx playwright-core install chromium',
      )
      process.exit(1)
    }
  }
}

function watchErrors(page, label) {
  page.on(
    'console',
    (message) => message.type() === 'error' && errors.push(`${label}: ${message.text()}`),
  )
  page.on('pageerror', (error) => errors.push(`${label}: ${error.message}`))
}

/** Состояние игры коротко */
const readGameSnapshot = (page) =>
  page.evaluate(() => {
    const state = window.__throne.game.state
    return {
      phase: state.phase,
      wave: state.wave,
      gold: state.gold,
      lives: state.lives,
      paused: state.isPaused,
      time: state.time,
      towers: state.towers.map((tower) => `${tower.def.id}${tower.tier}@${tower.col},${tower.row}`),
    }
  })

/** Дождаться, пока Vue обновит экран (пара кадров) */
const waitForFrames = (page) =>
  page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  )

/**
 * Снять фокус с кнопки. Пробел на кнопке по задумке нажимает саму кнопку,
 * а нам нужно, чтобы он дошёл до игры. (body.focus() не помогает: body не фокусируется.)
 */
const blurActiveElement = (page) => page.evaluate(() => document.activeElement?.blur())

/** Нажать на клетку поля (button: 'left', 'right' или 'middle') */
async function clickCell(page, col, row, button = 'left') {
  const bounds = await page.locator('#board').boundingBox()
  await page.mouse.click(
    bounds.x + ((col + 0.5) / COLS) * bounds.width,
    bounds.y + ((row + 0.5) / ROWS) * bounds.height,
    { button },
  )
  await waitForFrames(page)
}

/** Кнопка «Начать волну» целиком внутри окна (а не за краем экрана) */
async function checkStartButtonVisible(page) {
  const { width, height } = page.viewportSize()
  const bounds = await page.getByRole('button', { name: 'Начать волну' }).boundingBox()
  check(
    `${width}×${height}: «Начать волну» на экране`,
    bounds !== null &&
      bounds.x >= 0 &&
      bounds.y >= 0 &&
      bounds.x + bounds.width <= width &&
      bounds.y + bounds.height <= height,
    JSON.stringify(bounds),
  )
}

async function desktop(browser, url) {
  console.log('\nКомпьютер')
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } })
  watchErrors(page, 'компьютер')
  const playButton = page.getByRole('button', { name: 'Играть' })

  await page.goto(url)
  await playButton.waitFor()
  await page.evaluate(() => document.fonts.ready)
  check(
    'шрифты загрузились',
    await page.evaluate(
      () =>
        document.fonts.check('800 20px "Alegreya Sans"') &&
        document.fonts.check('400 20px "Ruslan Display"'),
    ),
  )
  check(
    'фокус на «Играть»',
    await page.evaluate(() => document.activeElement?.textContent?.trim() === 'Играть'),
  )

  await playButton.click()
  await waitForFrames(page)
  check('меню закрылось', (await page.locator('.overlay').count()) === 0)
  check(
    'подсказка для новичка',
    (await page.locator('#hint').textContent()) === 'Выберите стража и нажмите на плиту у ковра',
  )

  // Постройка мышью
  const archerCard = page.getByRole('button', { name: /Лучник/ })
  await archerCard.click()
  check('карточка в магазине нажата', (await archerCard.getAttribute('aria-pressed')) === 'true')
  await clickCell(page, 5, 11, 'right')
  await clickCell(page, 5, 11, 'middle')
  check('правая и средняя кнопки не строят', (await readGameSnapshot(page)).towers.length === 0)
  await clickCell(page, 5, 11)
  await clickCell(page, 2, 9)
  let snapshot = await readGameSnapshot(page)
  check(
    'две башни, осталось 50 золота',
    snapshot.towers.length === 2 && snapshot.gold === 50,
    JSON.stringify(snapshot),
  )

  // Выбор, улучшение, продажа
  await page.keyboard.press('Escape')
  await clickCell(page, 5, 11)
  check('панель башни', (await page.locator('.tower-info b').textContent()) === 'Лучник I')
  const statLines = (await page.locator('.tower-info .tower-stats span').allTextContents()).join(
    ' | ',
  )
  check('характеристики в панели', statLines === 'урон 9 → 15 | дальность 2,3 → 2,5', statLines)
  await page.getByRole('button', { name: /Улучшить/ }).click()
  await waitForFrames(page)
  snapshot = await readGameSnapshot(page)
  check(
    'улучшение',
    snapshot.gold === 5 && snapshot.towers.includes('archer1@5,11'),
    JSON.stringify(snapshot),
  )
  await page.getByRole('button', { name: /Улучшить/ }).click()
  await waitForFrames(page)
  check(
    'тост «не хватает золота»',
    !!(await page.locator('.toast.visible').textContent())?.includes('Не хватает золота'),
  )
  await page.getByRole('button', { name: /Продать/ }).click()
  await waitForFrames(page)
  snapshot = await readGameSnapshot(page)
  check(
    'продажа вернула 60% (57 золота)',
    snapshot.gold === 62 && snapshot.towers.length === 1,
    JSON.stringify(snapshot),
  )
  check('панель башни скрылась', (await page.locator('.tower-info').count()) === 0)

  // Постройка с клавиатуры: 1, стрелки к клетке (5, 11), Enter
  await page.keyboard.press('1')
  await page.keyboard.press('ArrowRight')
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await waitForFrames(page)
  snapshot = await readGameSnapshot(page)
  check(
    'постройка с клавиатуры',
    snapshot.towers.includes('archer0@5,11') && snapshot.gold === 12,
    JSON.stringify(snapshot),
  )
  await page.keyboard.press('Escape')

  // Волна: пробел, скорость ×3
  await blurActiveElement(page)
  await page.keyboard.press('Space')
  await waitForFrames(page)
  check('пробел начал волну', (await readGameSnapshot(page)).phase === 'wave')
  check(
    'кнопка «Идёт бой» неактивна',
    await page.getByRole('button', { name: 'Идёт бой' }).isDisabled(),
  )
  const speedButton = page.getByRole('button', { name: 'Скорость игры' })
  await speedButton.click()
  await speedButton.click()
  await page.waitForFunction(() => window.__throne.game.state.enemies.length >= 3)
  check(
    'подсказка «Врагов осталось»',
    (await page.locator('#hint').textContent()).startsWith('Врагов осталось'),
  )
  await page.waitForFunction(() => window.__throne.game.state.phase === 'build', null, {
    timeout: 60_000,
  })
  snapshot = await readGameSnapshot(page)
  check(
    'первая волна отбита без потерь',
    snapshot.wave === 2 && snapshot.lives === 20,
    JSON.stringify(snapshot),
  )
  check(
    'шапка «Волна 2 из 20»',
    (await page.locator('.hud .wave').textContent()) === 'Волна 2 из 20',
  )
  check(
    'превью следующей волны',
    (await page.locator('#hint').textContent()) === 'Дальше: 12 бунтовщиков',
  )

  // Пауза
  await page.getByRole('button', { name: 'Начать волну' }).click()
  await page.getByRole('button', { name: 'Пауза' }).click()
  const timeBefore = (await readGameSnapshot(page)).time
  await page.waitForTimeout(400)
  const timeAfter = (await readGameSnapshot(page)).time
  check(
    'пауза останавливает время',
    timeBefore === timeAfter && (await readGameSnapshot(page)).paused,
  )
  check('подсказка паузы', (await page.locator('#hint').textContent()).startsWith('Пауза'))
  await page.getByRole('button', { name: 'Продолжить' }).click()

  // Поражение
  await page.evaluate(() => {
    window.__throne.game.state.lives = 1
  })
  await page.getByRole('heading', { name: 'Трон пал' }).waitFor({ timeout: 60_000 })
  await waitForFrames(page)
  check(
    'экран поражения',
    (await page.locator('.sheet p').first().textContent()).startsWith('Отбито волн: 1.'),
  )
  check(
    'рекорд сохранён',
    await page.evaluate(() => JSON.parse(localStorage.getItem('throne-best'))?.wave === 1),
  )
  check(
    '«Это ваш новый рекорд»',
    (await page.locator('.sheet .note').textContent()) === 'Это ваш новый рекорд.',
  )
  await page.getByRole('button', { name: 'Сыграть ещё раз' }).click()
  await waitForFrames(page)
  snapshot = await readGameSnapshot(page)
  check(
    'новая партия',
    snapshot.phase === 'build' &&
      snapshot.gold === 150 &&
      snapshot.lives === 20 &&
      !snapshot.towers.length,
    JSON.stringify(snapshot),
  )

  // Победа: перескакиваем сразу на 20-ю волну
  await page.evaluate(() => {
    const game = window.__throne.game
    game.state.wave = 20
    game.startWave()
    game.state.spawnQueue = []
  })
  await page.getByRole('heading', { name: 'Трон устоял' }).waitFor({ timeout: 10_000 })
  check(
    'экран победы',
    (await page.locator('.sheet p').first().textContent()).startsWith('Все 20 волн отбиты.'),
  )
  await page.getByRole('button', { name: 'Играть дальше' }).click()
  await waitForFrames(page)
  check('бесконечный режим', (await page.locator('.hud .wave').textContent()) === 'Волна 21')

  // Баллиста (баланс v2): начинаем новую партию, чтобы хватило золота
  await page.evaluate(() => window.__throne.store.newGame())
  await page.getByRole('button', { name: /Баллиста/ }).click()
  await clickCell(page, 5, 11)
  await page.keyboard.press('Escape')
  await clickCell(page, 5, 11)
  const ballista = (await page.locator('.tower-info .tower-stats span').allTextContents()).join(
    ' | ',
  )
  check('баллиста: числа баланса v2', ballista === 'урон 50 → 80 | дальность 3,4 → 3,6', ballista)

  // Зажатый пробел не должен ставить паузу (повторы клавиши игнорируются)
  await page.keyboard.press('Escape')
  await blurActiveElement(page)
  await page.keyboard.down('Space')
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() =>
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: ' ', code: 'Space', repeat: true }),
      ),
    )
  }
  await page.keyboard.up('Space')
  snapshot = await readGameSnapshot(page)
  check(
    'зажатый пробел: волна идёт, паузы нет',
    snapshot.phase === 'wave' && !snapshot.paused,
    JSON.stringify(snapshot),
  )

  // Испорченный рекорд в localStorage не ломает меню
  await page.evaluate(() => localStorage.setItem('throne-best', '123'))
  await page.reload()
  await page.waitForTimeout(500)
  check('испорченный рекорд: меню на месте', (await playButton.count()) === 1)
  await page.evaluate(() => localStorage.removeItem('throne-best'))
  await page.close()
}

async function phone(browser, url) {
  console.log('\nТелефон')
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  })
  watchErrors(page, 'телефон')
  await page.goto(url)
  await page.getByRole('button', { name: 'Играть' }).tap()
  await page.getByRole('button', { name: /Огневик/ }).tap()
  const bounds = await page.locator('#board').boundingBox()
  await page.touchscreen.tap(
    bounds.x + (5.5 / COLS) * bounds.width,
    bounds.y + (11.5 / ROWS) * bounds.height,
  )
  await page.waitForTimeout(100)
  check(
    'постройка касанием',
    await page.evaluate(() => window.__throne.game.state.towers.length === 1),
  )

  // Раскладка: кнопки управления не уезжают за край экрана ни в какой ориентации
  await checkStartButtonVisible(page)
  await page.setViewportSize({ width: 932, height: 430 }) // iPhone Plus/Max набок
  await waitForFrames(page)
  await checkStartButtonVisible(page)
  await page.close()
}

const server = await preview({
  root,
  logLevel: 'silent',
  preview: { port: 4173 },
})
const url = `${server.resolvedUrls.local[0]}?debug`
const browser = await launchBrowser()
console.log(`Проверяю ${url}`)

try {
  await desktop(browser, url)
  await phone(browser, url)
  console.log('\nКонсоль браузера')
  check('нет ошибок', errors.length === 0, errors.join('\n'))
} catch (error) {
  console.error('\nПроверка прервалась:', error.message)
  failed++
} finally {
  await browser.close()
  await server.close()
}

console.log(failed ? `\n✗ Не прошло проверок: ${failed}` : '\n✓ Все проверки прошли')
process.exit(failed ? 1 : 0)
