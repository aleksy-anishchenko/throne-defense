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

/** Пиксель «изменился», если сумма разниц по R, G, B больше этого */
const PIXEL_CHANGE_THRESHOLD = 30
/** Враг нарисован, если без него поменялась хотя бы такая доля пикселей в квадрате вокруг него */
const ENEMY_MIN_CHANGED_SHARE = 0.2

/**
 * Нарисован ли враг. Тесты состояния этого не видят: при чистке кода обычные враги
 * пропали с поля, а состояние игры было верным. Поэтому смотрим на сам canvas:
 * квадрат вокруг врага с врагом и без него (убираем врагов на пару кадров).
 * Одной точки мало: в центре врага цвет бывает близок к цвету ковра.
 * Игра на это время стоит на паузе, чтобы враг не ушёл с места
 */
const compareEnemyPixels = (page, pixelChangeThreshold) =>
  page.evaluate(async (threshold) => {
    const { game } = window.__throne
    const canvas = document.querySelector('#board')
    const ctx = canvas.getContext('2d')
    const nextFrames = () =>
      new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const wasPaused = game.state.isPaused
    game.setPaused(true)
    await nextFrames()
    // Обычный враг (не босс): именно они пропадали
    const enemy = game.state.enemies.find((candidate) => candidate.def.id === 'rebel')
    const cellPx = canvas.width / game.level.def.cols
    // Квадрат со стороной в радиус врага, с центром во враге
    const side = Math.max(2, Math.round(enemy.def.radius * cellPx))
    const left = Math.round(enemy.x * cellPx - side / 2)
    const top = Math.round(enemy.y * cellPx - side / 2)
    const readArea = () => ctx.getImageData(left, top, side, side).data
    const withEnemy = readArea()
    const enemies = game.state.enemies
    game.state.enemies = []
    await nextFrames()
    const withoutEnemy = readArea()
    game.state.enemies = enemies
    game.setPaused(wasPaused)
    let changed = 0
    for (let i = 0; i < withEnemy.length; i += 4) {
      const difference =
        Math.abs(withEnemy[i] - withoutEnemy[i]) +
        Math.abs(withEnemy[i + 1] - withoutEnemy[i + 1]) +
        Math.abs(withEnemy[i + 2] - withoutEnemy[i + 2])
      if (difference > threshold) changed++
    }
    return { side, changedShare: changed / (side * side) }
  }, pixelChangeThreshold)

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

/** Все шесть карточек магазина на экране, и имя башни в каждой влезло целиком (без «…») */
async function checkShopCardsVisible(page) {
  const { width, height } = page.viewportSize()
  const cards = await page.locator('.shop .card').evaluateAll((elements) =>
    elements.map((card) => {
      const bounds = card.getBoundingClientRect()
      const name = card.querySelector('.card-name')
      return {
        name: name.textContent,
        isNameCut: name.scrollWidth > name.clientWidth,
        left: bounds.left,
        top: bounds.top,
        right: bounds.right,
        bottom: bounds.bottom,
      }
    }),
  )
  const badCards = cards.filter(
    (card) =>
      card.isNameCut || card.left < 0 || card.top < 0 || card.right > width || card.bottom > height,
  )
  check(
    `${width}×${height}: все карточки магазина (${cards.length}) видны целиком`,
    cards.length === 6 && badCards.length === 0,
    JSON.stringify(badCards),
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
  // Смотрим на список реально загруженных шрифтов: document.fonts.check() отвечает «да»
  // и тогда, когда шрифт вообще не подключён
  const loadedFonts = await page.evaluate(() =>
    [...document.fonts]
      .filter((font) => font.status === 'loaded')
      .map((font) => `${font.family.replaceAll('"', '')} ${font.weight}`),
  )
  const expectedFonts = ['Alegreya Sans 500', 'Alegreya Sans 800', 'Ruslan Display 400']
  check(
    'шрифты загрузились',
    expectedFonts.every((font) => loadedFonts.includes(font)),
    loadedFonts.join(', '),
  )
  check(
    'фокус на «Играть»',
    await page.evaluate(() => document.activeElement?.textContent?.trim() === 'Играть'),
  )

  check(
    'меню — диалог, поле и панель под ним выключены (inert)',
    (await page.getByRole('dialog', { name: 'Защита трона' }).count()) === 1 &&
      (await page.evaluate(() =>
        ['.hud', '.stage', '.panel'].every((selector) => document.querySelector(selector).inert),
      )),
  )

  const versionText = await page.locator('.sheet .version').textContent()
  check(
    'в меню видна версия сборки',
    /^Версия ([0-9a-f]{7,}|dev) · \d{2}\.\d{2}\.\d{4}$/.test(versionText),
    versionText,
  )

  await playButton.click()
  await waitForFrames(page)
  check('меню закрылось', (await page.locator('.overlay').count()) === 0)
  check(
    'поле и панель снова доступны',
    await page.evaluate(() => !document.querySelector('.panel').inert),
  )
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
  await waitForFrames(page)
  check('Escape снял выбор в магазине', (await archerCard.getAttribute('aria-pressed')) === 'false')
  await clickCell(page, 5, 11)
  check('панель башни', (await page.locator('.tower-info b').textContent()) === 'Лучник I')
  const statLines = (await page.locator('.tower-info .tower-stats span').allTextContents()).join(
    ' | ',
  )
  check('характеристики в панели', statLines === 'урон 7 → 12 | дальность 2,4 → 2,6', statLines)

  check('у лучника выбора цели нет', (await page.locator('.tower-info .target-mode').count()) === 0)

  await page.getByRole('button', { name: /Улучшить/ }).click()
  await waitForFrames(page)
  snapshot = await readGameSnapshot(page)
  check(
    'улучшение',
    snapshot.gold === 10 && snapshot.towers.includes('archer1@5,11'),
    JSON.stringify(snapshot),
  )
  await page.getByRole('button', { name: /Улучшить/ }).click()
  await waitForFrames(page)
  check(
    'тост «не хватает золота»',
    !!(await page.locator('.toast.visible').textContent())?.includes('Не хватает золота'),
  )
  // Башня ещё не была в бою: кнопка «Вернуть», и возвращается всё вложенное (50 + 40)
  await page.getByRole('button', { name: /Вернуть/ }).click()
  await waitForFrames(page)
  snapshot = await readGameSnapshot(page)
  check(
    'до волны «Вернуть» отдаёт всё (90 золота)',
    snapshot.gold === 100 && snapshot.towers.length === 1,
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
    snapshot.towers.includes('archer0@5,11') && snapshot.gold === 50,
    JSON.stringify(snapshot),
  )
  await page.keyboard.press('Escape')

  // Волна: пробел, скорость ×3. Башня «в руке» перед волной — выбор должен сняться
  await page.keyboard.press('1')
  await blurActiveElement(page)
  await page.keyboard.press('Space')
  await waitForFrames(page)
  check('пробел начал волну', (await readGameSnapshot(page)).phase === 'wave')
  check(
    'начало волны сняло выбор в магазине',
    (await archerCard.getAttribute('aria-pressed')) === 'false',
  )
  check(
    'кнопка «Идёт бой» неактивна',
    await page.getByRole('button', { name: 'Идёт бой' }).isDisabled(),
  )
  const speedButton = page.getByRole('button', { name: 'Скорость игры' })
  await speedButton.click()
  await speedButton.click()
  await waitForFrames(page)
  check(
    'кнопка скорости называет значение',
    (await speedButton.getAttribute('aria-label')) === 'Скорость игры: ×3',
  )
  await page.waitForFunction(() => window.__throne.game.state.enemies.length >= 3)
  check(
    'подсказка «Врагов осталось»',
    (await page.locator('#hint').textContent()).startsWith('Врагов осталось'),
  )
  const enemyPixels = await compareEnemyPixels(page, PIXEL_CHANGE_THRESHOLD)
  check(
    'враг нарисован на поле',
    enemyPixels.changedShare >= ENEMY_MIN_CHANGED_SHARE,
    JSON.stringify(enemyPixels),
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
    'после поражения фокус на экране, а не на кнопке (Enter не перезапустит партию)',
    await page.evaluate(() => document.activeElement?.getAttribute('role') === 'dialog'),
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
  await page.getByRole('button', { name: 'Начать волну' }).click()
  await page.waitForFunction(() => window.__throne.game.state.enemies.length > 0)
  check('21-я волна началась, враги вышли', (await readGameSnapshot(page)).phase === 'wave')

  // Баллиста (баланс v4): начинаем новую партию, чтобы хватило золота
  await page.evaluate(() => window.__throne.store.newGame())
  await page.getByRole('button', { name: /Баллиста/ }).click()
  await clickCell(page, 5, 11)
  await page.keyboard.press('Escape')
  await clickCell(page, 5, 11)
  const ballista = (await page.locator('.tower-info .tower-stats span').allTextContents()).join(
    ' | ',
  )
  check('баллиста: числа баланса v4', ballista === 'урон 80 → 135 | дальность 3,4 → 3,6', ballista)

  // Выбор цели — умение баллисты: кнопкой в панели и клавишей T
  const targetButton = page.locator('.tower-info .target-mode')
  const ballistaTargetMode = () =>
    page.evaluate(() => window.__throne.game.towerAt(5, 11).targetMode)
  check('баллиста: цель «первый»', (await targetButton.textContent()).trim() === 'цель: первый')
  await targetButton.click()
  await waitForFrames(page)
  check(
    'кнопка цели сменила режим на «сильный»',
    (await targetButton.textContent()).trim() === 'цель: сильный' &&
      (await ballistaTargetMode()) === 'strongest',
  )
  await page.keyboard.press('t')
  await waitForFrames(page)
  check(
    'клавиша T вернула «первый»',
    (await targetButton.textContent()).trim() === 'цель: первый' &&
      (await ballistaTargetMode()) === 'first',
  )

  // Зажатый пробел не должен ставить паузу (повторы клавиши игнорируются)
  await page.keyboard.press('Escape')
  await waitForFrames(page)
  check('Escape закрыл панель башни', (await page.locator('.tower-info').count()) === 0)
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

  // Стрелки снимают выбор с плиты: цифра ставит стража под курсор, а не на старую плиту
  await page.evaluate(() => window.__throne.store.newGame())
  await clickCell(page, 6, 11) // выбрали пустую плиту
  await page.keyboard.press('ArrowUp') // курсор: из центра (4, 6) на (4, 5)
  await page.keyboard.press('1')
  await page.keyboard.press('Enter')
  await waitForFrames(page)
  snapshot = await readGameSnapshot(page)
  check(
    'стрелки снимают выбор с плиты',
    snapshot.towers.length === 1 && snapshot.towers[0] === 'archer0@4,5',
    JSON.stringify(snapshot.towers),
  )

  // Выключенный звук и испорченный рекорд переживают перезагрузку
  await page.getByRole('button', { name: 'Звук' }).click()
  await page.evaluate(() => localStorage.setItem('throne-best', '123'))
  await page.reload()
  await page.waitForFunction(() => document.querySelector('#app')?.children.length > 0)
  check('испорченный рекорд: меню на месте', await playButton.isVisible())
  check(
    'выключенный звук пережил перезагрузку',
    (await page
      .getByRole('button', { name: 'Звук', includeHidden: true })
      .getAttribute('aria-pressed')) === 'false',
  )
  await page.evaluate(() => localStorage.removeItem('throne-best'))

  // Раскладка: магазин из шести карточек влезает и на высоком экране, и на ноутбуке
  await page.getByRole('button', { name: 'Играть' }).click()
  await waitForFrames(page)
  await checkShopCardsVisible(page)
  await page.setViewportSize({ width: 1366, height: 650 })
  await waitForFrames(page)
  await checkStartButtonVisible(page)
  await checkShopCardsVisible(page)
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
  check(
    'постройка касанием',
    await page
      .waitForFunction(() => window.__throne.game.state.towers.length === 1, null, {
        timeout: 2000,
      })
      .then(() => true)
      .catch(() => false),
  )

  // Раскладка: кнопки управления не уезжают за край экрана ни в какой ориентации
  await checkStartButtonVisible(page)
  await checkShopCardsVisible(page)
  await page.setViewportSize({ width: 320, height: 568 }) // самый узкий телефон
  await waitForFrames(page)
  await checkStartButtonVisible(page)
  await checkShopCardsVisible(page)
  await page.setViewportSize({ width: 932, height: 430 }) // iPhone Plus/Max набок
  await waitForFrames(page)
  await checkStartButtonVisible(page)
  await checkShopCardsVisible(page)
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
