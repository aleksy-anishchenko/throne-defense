// npm run e2e — проверка собранной игры в настоящем браузере (Chrome без окна).
//
// Сам поднимает `vite preview` с папкой dist (её собирает `npm run build`) и настоящий
// API (apps/server) на временной базе, открывает игру с ?debug и проходит её как игрок:
// меню, постройка мышью, касанием и с клавиатуры, улучшение, продажа, волна, пауза,
// музыка, настройки звука, поражение, рекорд, общий топ, победа, телефон, игра без сервера.
// Состояние игры читает через window.__throne (доступен только с ?debug).
//
// Нужен установленный Google Chrome. Если его нет: `npx playwright-core install chromium`.

import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { preview } from 'vite'

const root = fileURLToPath(new URL('..', import.meta.url))
const serverRoot = fileURLToPath(new URL('../../server', import.meta.url))
// Не 3000: там может работать npm run dev:server со своей базой
const API_PORT = 3101
/** Сколько ждать, пока API поднимется */
const API_START_TIMEOUT_MS = 15_000
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

/** ignore — какие ошибки здесь ожидаемы (например, «не удалось загрузить» без сервера) */
function watchErrors(page, label, ignore = null) {
  page.on(
    'console',
    (message) =>
      message.type() === 'error' &&
      !ignore?.test(message.text()) &&
      errors.push(`${label}: ${message.text()}`),
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

/** Что играет музыка: { isPlaying, mood, isMuffled } */
const readMusic = (page) => page.evaluate(() => window.__throne.music.debugState())

/** Появится ли элемент за timeout мс (true/false, без исключения — проверка не прерывается) */
const appears = (locator, timeout = 5000) =>
  locator.waitFor({ timeout }).then(
    () => true,
    () => false,
  )

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
/** Огонь виден, если вокруг врага после поджога поменялась хотя бы такая доля пикселей */
const BURN_MIN_CHANGED_SHARE = 0.1

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

/**
 * Огонь на враге: сравниваем квадрат вокруг врага до поджога и после (пламя, кольцо, отсвет).
 * Игра на паузе; чтобы кадр перерисовался, убираем врагов на пару кадров и возвращаем
 * (на паузе renderer рисует кадр, только если что-то поменялось — например, число врагов)
 */
const compareBurnPixels = (page, pixelChangeThreshold) =>
  page.evaluate(async (threshold) => {
    const { game } = window.__throne
    const canvas = document.querySelector('#board')
    const ctx = canvas.getContext('2d')
    const nextFrames = () =>
      new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const redraw = async () => {
      const enemies = game.state.enemies
      game.state.enemies = []
      await nextFrames()
      game.state.enemies = enemies
      await nextFrames()
    }
    const wasPaused = game.state.isPaused
    game.setPaused(true)
    const enemy = game.state.enemies.find((candidate) => candidate.def.id === 'rebel')
    const saved = { burnTimeLeft: enemy.burnTimeLeft, burnDamageLeft: enemy.burnDamageLeft }
    enemy.burnTimeLeft = 0
    enemy.burnDamageLeft = 0
    const cellPx = canvas.width / game.level.def.cols
    // Квадрат с центром во враге: со стороной в два радиуса и ещё по 0,15 клетки — с кольцом у ног
    const width = Math.round((enemy.def.radius + 0.15) * 2 * cellPx)
    const height = width
    const left = Math.round(enemy.x * cellPx - width / 2)
    const top = Math.round(enemy.y * cellPx - height / 2)
    const readArea = () => ctx.getImageData(left, top, width, height).data
    await redraw()
    const before = readArea()
    enemy.burnTimeLeft = 5
    enemy.burnDamageLeft = 1
    await redraw()
    const after = readArea()
    Object.assign(enemy, saved)
    game.setPaused(wasPaused)
    let changed = 0
    for (let i = 0; i < before.length; i += 4) {
      const difference =
        Math.abs(before[i] - after[i]) +
        Math.abs(before[i + 1] - after[i + 1]) +
        Math.abs(before[i + 2] - after[i + 2])
      if (difference > threshold) changed++
    }
    return { width, height, changedShare: changed / (width * height) }
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

/** Нижняя строка кнопок помещается по ширине (на телефоне вертикально — одна строка) */
async function checkControlsFit(page) {
  const { width } = page.viewportSize()
  const fits = await page.evaluate(() => {
    const controls = document.querySelector('.controls').getBoundingClientRect()
    return [...document.querySelectorAll('.controls > *')]
      .filter((element) => getComputedStyle(element).display !== 'none')
      .every((element) => {
        const bounds = element.getBoundingClientRect()
        return bounds.left >= controls.left - 0.5 && bounds.right <= controls.right + 0.5
      })
  })
  check(`${width}: кнопки управления помещаются в строку`, fits)
}

/** Все шесть карточек магазина на экране, и имя башни в каждой влезло целиком (без «…») */
async function checkShopCardsVisible(page) {
  const { width, height } = page.viewportSize()
  // Телефон в вертикальной раскладке: кнопка на экране, а девять стражей — в меню
  if (await page.locator('.shop-toggle').isVisible()) {
    const toggle = await page.locator('.shop-toggle').boundingBox()
    await page.locator('.shop-toggle').click()
    // Меню выезжает снизу: размеры берём, когда оно доехало
    await page.waitForTimeout(400)
    const names = await page.locator('.drawer-card').evaluateAll((elements) =>
      elements.map((card) => {
        const bounds = card.getBoundingClientRect()
        return { left: bounds.left, right: bounds.right }
      }),
    )
    const drawerBox = await page.locator('.shop-drawer-body').boundingBox()
    await page.keyboard.press('Escape')
    check(
      `${width}×${height}: кнопка «Выбрать стража» на экране, в меню все карточки (${names.length}) по ширине`,
      toggle !== null &&
        toggle.x >= 0 &&
        toggle.x + toggle.width <= width &&
        toggle.y + toggle.height <= height &&
        names.length === 9 &&
        names.every((card) => card.left >= 0 && card.right <= width) &&
        drawerBox.y >= 0 &&
        drawerBox.y + drawerBox.height <= height + 1,
      JSON.stringify({ toggle, drawerBox }),
    )
    return
  }
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
    // Девять башен (TOWER_LIST в packages/game/src/data/towers.ts)
    cards.length === 9 && badCards.length === 0,
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

  check(
    'музыка молчит до первого действия игрока (браузер иначе не разрешит звук)',
    !(await readMusic(page)).isPlaying,
  )
  await playButton.click()
  await waitForFrames(page)
  check('меню закрылось', (await page.locator('.overlay').count()) === 0)
  let music = await readMusic(page)
  check(
    'после клика играет спокойная музыка',
    music.isPlaying && music.mood === 'calm',
    JSON.stringify(music),
  )
  check(
    'поле и панель снова доступны',
    await page.evaluate(() => !document.querySelector('.panel').inert),
  )
  check(
    'подсказка для новичка',
    (await page.locator('#hint').textContent()) === 'Выберите стража и нажмите на плиту у ковра',
  )

  // Курсор над полем: рука только там, где нажатие что-то делает
  const boardCursor = () =>
    page.locator('#board').evaluate((element) => getComputedStyle(element).cursor)
  const hoverCell = async (col, row) => {
    const bounds = await page.locator('#board').boundingBox()
    await page.mouse.move(
      bounds.x + ((col + 0.5) / COLS) * bounds.width,
      bounds.y + ((row + 0.5) / ROWS) * bounds.height,
    )
    await waitForFrames(page)
  }
  await hoverCell(5, 11)
  check('над пустой плитой без стража в руке курсор обычный', (await boardCursor()) === 'default')

  // Постройка мышью
  const archerCard = page.getByRole('button', { name: /Лучник/ })
  await archerCard.click()
  check('карточка в магазине нажата', (await archerCard.getAttribute('aria-pressed')) === 'true')
  // innerText, а не textContent: учитывает, что скрыто стилями
  check(
    'описание есть в карточке — подсказка его не повторяет, а говорит, что делать',
    (await page.locator('#hint').innerText()).startsWith('Нажмите на свободную плиту'),
    await page.locator('#hint').innerText(),
  )
  await hoverCell(5, 11)
  check('со стражем в руке над свободной плитой — рука', (await boardCursor()) === 'pointer')
  await hoverCell(4, 11)
  check('над ковром (строить нельзя) — обычный курсор', (await boardCursor()) === 'default')
  await clickCell(page, 5, 11, 'right')
  await clickCell(page, 5, 11, 'middle')
  check('правая и средняя кнопки не строят', (await readGameSnapshot(page)).towers.length === 0)
  await clickCell(page, 5, 11)
  check(
    'после постройки страж убран из «руки»',
    (await archerCard.getAttribute('aria-pressed')) === 'false',
  )
  await clickCell(page, 2, 9)
  check(
    'нажатие на свободную плиту без стража ничего не строит',
    (await readGameSnapshot(page)).towers.length === 1,
  )
  await archerCard.click()
  await clickCell(page, 2, 9)
  let snapshot = await readGameSnapshot(page)
  check(
    'две башни, осталось 50 золота',
    snapshot.towers.length === 2 && snapshot.gold === 50,
    JSON.stringify(snapshot),
  )

  // Золота 50, Баллиста стоит 130: в руку не берётся, сразу отказ
  const ballistaCard = page.getByRole('button', { name: /Баллиста/ })
  await ballistaCard.click()
  await waitForFrames(page)
  check(
    'без золота страж не берётся в руку, есть тост',
    (await ballistaCard.getAttribute('aria-pressed')) === 'false' &&
      !!(await page.locator('.toast.visible').textContent())?.includes('Баллиста стоит 130'),
  )

  // Выбор, улучшение, продажа
  await hoverCell(5, 11)
  check('над башней — рука (её можно выбрать)', (await boardCursor()) === 'pointer')
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

  // Звонарь рядом: в панели лучника видно, насколько он ускорен. Потом всё как было
  const goldBeforeBell = await page.evaluate(() => {
    const { game } = window.__throne
    const gold = game.state.gold
    game.state.gold += 1000
    game.build('bell', 6, 11)
    return gold
  })
  await waitForFrames(page)
  const bellLine = (await page.locator('.tower-info .tower-stats span').allTextContents()).at(-1)
  check('панель: лучник ускорен Звонарём', bellLine === 'Звонарь: стреляет на 15% чаще', bellLine)
  await page.evaluate((gold) => {
    const { game } = window.__throne
    game.sell(6, 11)
    game.state.gold = gold
  }, goldBeforeBell)
  await waitForFrames(page)

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
  check(
    'после постройки с клавиатуры страж тоже убран из «руки»',
    (await archerCard.getAttribute('aria-pressed')) === 'false',
  )
  await page.keyboard.press('Escape')

  // Shift+цифра выбирает стража так же, как цифра (на клавише «1» с Shift символ «!»)
  await page.keyboard.down('Shift')
  await page.keyboard.press('1')
  await page.keyboard.up('Shift')
  await waitForFrames(page)
  check('Shift+1 выбрал стража', (await archerCard.getAttribute('aria-pressed')) === 'true')
  await page.keyboard.press('Escape')

  // Shift: страж остаётся «в руке», можно ставить подряд (потом башню возвращаем — золото прежнее)
  await archerCard.click()
  await page.keyboard.down('Shift')
  await clickCell(page, 3, 9)
  await page.keyboard.up('Shift')
  check(
    'Shift: построил и страж остался «в руке»',
    (await readGameSnapshot(page)).towers.includes('archer0@3,9') &&
      (await archerCard.getAttribute('aria-pressed')) === 'true',
  )
  await page.keyboard.press('Escape')
  await clickCell(page, 3, 9)
  await page.getByRole('button', { name: /Вернуть/ }).click()
  await waitForFrames(page)
  check('Shift-башню вернули, золото прежнее', (await readGameSnapshot(page)).gold === 50)
  await page.keyboard.press('Escape')

  // Волна: пробел, скорость ×3. Башня «в руке» перед волной — выбор должен сняться.
  // Карточку выбираем мышью: фокус остаётся на ней, но без рамки — пробел всё равно игре
  await archerCard.click()
  await page.keyboard.press('Space')
  await waitForFrames(page)
  check(
    'пробел начал волну после щелчка по карточке мышью',
    (await readGameSnapshot(page)).phase === 'wave',
  )
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
  const burnPixels = await compareBurnPixels(page, PIXEL_CHANGE_THRESHOLD)
  check(
    'горящего врага видно: пламя и огненное кольцо',
    burnPixels.changedShare >= BURN_MIN_CHANGED_SHARE,
    JSON.stringify(burnPixels),
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
    'шапка «Волна 2 из 20» и название зала',
    (await page.locator('.hud .wave-label').textContent()) === 'Волна 2 из 20' &&
      (await page.locator('.hud .hud-level').textContent()) === 'Тронный зал',
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
  await archerCard.click()
  check(
    'на паузе страж «в руке» важнее подсказки паузы',
    (await page.locator('#hint').innerText()).startsWith('Нажмите на свободную плиту'),
    await page.locator('#hint').innerText(),
  )
  await page.keyboard.press('Escape')
  music = await readMusic(page)
  check(
    'в волне музыка боевая, на паузе — приглушённая',
    music.isPlaying && music.mood === 'battle' && music.isMuffled,
    JSON.stringify(music),
  )
  await page.getByRole('button', { name: 'Продолжить' }).click()
  await waitForFrames(page)
  check('после паузы музыка снова не приглушена', !(await readMusic(page)).isMuffled)

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
  check('после поражения музыка затихла', !(await readMusic(page)).isPlaying)
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

  // Общий топ: имени ещё нет — экран поражения спрашивает его
  const nameInput = page.locator('#player-name')
  check('после первой партии спрашивают имя', await nameInput.isVisible())
  await page.getByRole('button', { name: 'Сохранить' }).click()
  check('пустое имя не принимается', await appears(page.locator('.name-error'), 2000))
  // Цифра в имени уходит в поле, а не в игру (клавиши 1–9 выбирают стража)
  await nameInput.pressSequentially('Страж 1')
  await nameInput.press('Enter')
  check(
    'результат ушёл в общий топ: первое место',
    await appears(page.locator('.run-place').filter({ hasText: 'Страж 1, вы первым' })),
  )
  check(
    'имя запомнено в браузере',
    await page.evaluate(() => localStorage.getItem('throne-name') === 'Страж 1'),
  )
  await page.getByRole('button', { name: 'Лучшие результаты' }).click()
  const leaderboardRows = page.locator('.leaderboard li')
  await appears(leaderboardRows.first())
  const rowTexts = await leaderboardRows.allTextContents()
  check(
    'таблица лучших: строка игрока с залом рекорда, выделена',
    rowTexts.length === 1 &&
      rowTexts[0].includes('Страж 1') &&
      rowTexts[0].includes('Тронный зал') &&
      (await page.locator('.leaderboard li.is-player').count()) === 1,
    rowTexts.join(' | '),
  )
  await page.keyboard.press('Escape')
  check(
    'Esc на «Лучших» возвращает к итогам партии',
    await appears(page.getByRole('heading', { name: 'Трон пал' }), 2000),
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
  music = await readMusic(page)
  check(
    'новая партия — снова спокойная музыка',
    music.isPlaying && music.mood === 'calm',
    JSON.stringify(music),
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
  check(
    'победа: имя уже есть — результат ушёл в топ сам',
    (await appears(page.locator('.run-place').filter({ hasText: 'Страж 1, вы' }))) &&
      (await nameInput.count()) === 0,
  )
  await page.getByRole('button', { name: 'Сменить имя' }).click()
  check('«Сменить имя»: в поле прежнее имя', (await nameInput.inputValue()) === 'Страж 1')
  await nameInput.fill('Страж 2')
  await nameInput.press('Enter')
  check(
    '«Сменить имя»: результат под новым именем, в таблице двое',
    await appears(page.locator('.run-place').filter({ hasText: 'Страж 2, вы на 1-м месте из 2' })),
  )
  await page.getByRole('button', { name: 'Играть дальше' }).click()
  await waitForFrames(page)
  check('бесконечный режим', (await page.locator('.hud .wave-label').textContent()) === 'Волна 21')
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

  // Настройки посреди боя: игра встаёт на паузу, клавиши не управляют игрой под экраном
  await page.getByRole('button', { name: 'Начать волну' }).click()
  await page.getByRole('button', { name: 'Настройки' }).click()
  const settingsDialog = page.getByRole('dialog', { name: 'Настройки' })
  snapshot = await readGameSnapshot(page)
  check(
    'настройки открылись, бой на паузе',
    (await appears(settingsDialog)) && snapshot.phase === 'wave' && snapshot.paused,
    JSON.stringify(snapshot),
  )
  check('в настройках музыку не глушим', !(await readMusic(page)).isMuffled)
  await blurActiveElement(page)
  await page.keyboard.press('Space')
  check('пробел в настройках не снимает паузу', (await readGameSnapshot(page)).paused)
  await page.getByRole('checkbox', { name: 'Музыка' }).uncheck()
  check('выключатель «Музыка» выключил музыку', !(await readMusic(page)).isPlaying)
  check(
    'без музыки ползунок её громкости неактивен',
    await page.getByRole('slider', { name: 'Громкость музыки' }).isDisabled(),
  )
  await page.getByRole('slider', { name: 'Громкость звуков' }).fill('30')
  await page.keyboard.press('Escape')
  await waitForFrames(page)
  check(
    'Escape закрыл настройки, бой продолжился сам',
    (await settingsDialog.count()) === 0 && !(await readGameSnapshot(page)).paused,
  )

  // Пауза, поставленная игроком до настроек, после них остаётся
  await page.getByRole('button', { name: 'Пауза' }).click()
  await page.getByRole('button', { name: 'Настройки' }).click()
  await page.getByRole('button', { name: 'Готово' }).click()
  await waitForFrames(page)
  check('своя пауза игрока после настроек осталась', (await readGameSnapshot(page)).paused)

  // Настройки и испорченный рекорд переживают перезагрузку
  await page.evaluate(() => localStorage.setItem('throne-best', '123'))
  await page.reload()
  await page.waitForFunction(() => document.querySelector('#app')?.children.length > 0)
  check('испорченный рекорд: меню на месте', await playButton.isVisible())
  // Шестерёнка под меню тоже есть в разметке (выключена inert) — берём кнопку самого меню
  await page.getByRole('dialog').getByRole('button', { name: 'Настройки' }).click()
  check(
    'настройки звука пережили перезагрузку',
    !(await page.getByRole('checkbox', { name: 'Музыка' }).isChecked()) &&
      (await page.getByRole('checkbox', { name: 'Звуки' }).isChecked()) &&
      (await page.getByRole('slider', { name: 'Громкость звуков' }).inputValue()) === '30',
  )
  check('без музыки она молчит и после клика', !(await readMusic(page)).isPlaying)
  await page.getByRole('checkbox', { name: 'Музыка' }).check()
  check('музыку можно включить обратно', (await readMusic(page)).isPlaying)
  await page.getByRole('button', { name: 'Готово' }).click()
  check('«Готово» вернуло в меню', await playButton.isVisible())
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

/** Сервер недоступен: игра работает как раньше, просто без топа */
async function offline(browser, url) {
  console.log('\nБез сервера')
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } })
  // Браузер сам пишет в консоль о каждом неудавшемся запросе — здесь это и проверяем
  watchErrors(page, 'без сервера', /Failed to load resource/)
  await page.route('**/api/**', (route) => route.abort('connectionrefused'))
  // Имя уже есть: результат сразу пытается уйти на сервер
  await page.addInitScript(() => localStorage.setItem('throne-name', 'Страж'))
  await page.goto(url)
  await page.getByRole('button', { name: 'Играть' }).click()
  await page.getByRole('button', { name: 'Начать волну' }).click()
  await page.evaluate(() => {
    const state = window.__throne.game.state
    state.score = 100
    state.lives = 1
  })
  await page.getByRole('heading', { name: 'Трон пал' }).waitFor({ timeout: 60_000 })
  check(
    'нет сервера: итоги на месте, «таблица лучших недоступна»',
    await appears(page.locator('.run-place').filter({ hasText: 'недоступна' })),
  )
  await page.getByRole('button', { name: 'Отправить ещё раз' }).click()
  check(
    'нет сервера: «Отправить ещё раз» пробует снова и честно говорит «недоступна»',
    await appears(page.locator('.run-place').filter({ hasText: 'недоступна' })),
  )
  await page.getByRole('button', { name: 'Лучшие результаты' }).click()
  check(
    'нет сервера: «Лучшие результаты» говорят, что не загрузились',
    await appears(page.locator('.leaderboard-status').filter({ hasText: 'Не удалось' })),
  )
  await page.getByRole('button', { name: 'Назад', exact: true }).click()
  await page.getByRole('button', { name: 'Сыграть ещё раз' }).click()
  await waitForFrames(page)
  check('нет сервера: новая партия начинается', (await readGameSnapshot(page)).phase === 'build')
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
  const panelHeight = () =>
    page.evaluate(() => document.querySelector('.panel').getBoundingClientRect().height)
  const idlePanelHeight = await panelHeight()

  // Вместо девяти карточек — кнопка; карточки с описанием и характеристиками — в меню
  const shopToggle = page.getByRole('button', { name: 'Выбрать стража' })
  check(
    'на телефоне вместо карточек кнопка «Выбрать стража»',
    (await shopToggle.isVisible()) && (await page.locator('.shop .card').first().isHidden()),
  )
  await shopToggle.tap()
  const drawer = page.getByRole('dialog', { name: 'Выбор стража' })
  check('кнопка открыла меню стражей', await drawer.isVisible())
  // Меню модальное: Tab ходит по кругу внутри него и не уходит на кнопки под ним
  let isFocusInside = true
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Tab')
    isFocusInside &&= await page.evaluate(
      () => !!document.activeElement?.closest('[role="dialog"]'),
    )
  }
  check('Tab не выводит фокус из меню стражей', isFocusInside)
  const drawerText = await drawer.innerText()
  check(
    'в меню до покупки есть описание и характеристики',
    drawerText.includes('Поджигает толпу') && /урон \d/.test(drawerText),
    drawerText.slice(0, 200),
  )
  await page.keyboard.press('Escape')
  await waitForFrames(page)
  check('Escape закрыл меню', (await page.getByRole('dialog').count()) === 0)
  await shopToggle.tap()
  await page.locator('.shop-drawer-backdrop').tap({ position: { x: 10, y: 10 } })
  check('нажатие мимо меню закрыло его', (await page.getByRole('dialog').count()) === 0)

  await shopToggle.tap()
  await drawer.getByRole('button', { name: /Огневик/ }).tap()
  check('выбор в меню закрыл его', (await page.getByRole('dialog').count()) === 0)
  check(
    'на телефоне подсказка показывает описание стража в руке',
    (await page.locator('#hint').innerText()).startsWith('Огневик:'),
    await page.locator('#hint').innerText(),
  )
  check(
    'кнопка показывает стража в руке (значок и подпись для скринридера)',
    (await page.locator('.shop-toggle.armed').getAttribute('aria-label')).includes('Огневик'),
  )
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
  check(
    'после постройки страж убран из руки, кнопка снова «Выбрать стража»',
    await shopToggle.isVisible(),
  )
  // Выбранная башня: панели башни внизу нет (она в меню), высота панели та же, поле не прыгает
  await page.touchscreen.tap(
    bounds.x + (5.5 / COLS) * bounds.width,
    bounds.y + (11.5 / ROWS) * bounds.height,
  )
  await waitForFrames(page)
  check('панель башни на телефоне внизу скрыта', await page.locator('.tower-info').isHidden())
  check(
    'выбор башни не меняет высоту панели',
    Math.abs((await panelHeight()) - idlePanelHeight) < 1,
    `${idlePanelHeight} → ${await panelHeight()}`,
  )
  const towerMenu = page.getByRole('dialog', { name: /Башня: Огневик/ })
  check('нажатие на башню сразу открыло её меню', await towerMenu.isVisible())
  check(
    'кнопки «Действие» нет: слева по-прежнему «Стражи»',
    (await page.getByRole('button', { name: 'Действия с башней' }).count()) === 0 &&
      (await page.locator('.shop-toggle .shop-toggle-label').innerText()) === 'Стражи',
  )
  const towerMenuText = await towerMenu.innerText()
  check(
    'в меню башни есть характеристики и кнопки, лишнего нет',
    !towerMenuText.includes('Поджигает') &&
      !towerMenuText.includes('Выбрать стража') &&
      /урон \d/.test(towerMenuText) &&
      towerMenuText.includes('Улучшить') &&
      towerMenuText.includes('Вернуть'),
    towerMenuText,
  )
  // Золота 60, улучшение стоит 80: отказ виден поверх меню
  await towerMenu.getByRole('button', { name: /Улучшить/ }).tap()
  await waitForFrames(page)
  check(
    'в меню башни отказ «не хватает золота» виден',
    !!(await page.locator('.toast.visible').textContent())?.includes('Не хватает золота'),
  )
  await page.keyboard.press('Escape')
  await waitForFrames(page)
  check(
    'Escape закрыл меню башни и снял с неё выбор',
    (await page.getByRole('dialog').count()) === 0 &&
      (await page.evaluate(() => window.__throne.selection.selectedTowerCell)) === null,
  )
  // Снова нажали на башню — меню снова открыто; нажали мимо меню — закрыто и без выбора.
  // Башня внизу поля, поэтому меню наверху, а левый нижний угол экрана — мимо него
  const tapTower = () =>
    page.touchscreen.tap(
      bounds.x + (5.5 / COLS) * bounds.width,
      bounds.y + (11.5 / ROWS) * bounds.height,
    )
  await tapTower()
  await waitForFrames(page)
  check('повторное нажатие на башню снова открыло меню', await towerMenu.isVisible())
  await page.touchscreen.tap(4, page.viewportSize().height - 4)
  await waitForFrames(page)
  check(
    'нажатие мимо меню закрыло его и сняло выбор',
    (await page.getByRole('dialog').count()) === 0 &&
      (await page.evaluate(() => window.__throne.selection.selectedTowerCell)) === null,
  )
  await tapTower()
  await waitForFrames(page)
  await towerMenu.getByRole('button', { name: /Вернуть/ }).tap()
  await waitForFrames(page)
  check(
    '«Вернуть» в меню: башни нет, меню закрылось, кнопка снова «Стражи»',
    (await readGameSnapshot(page)).towers.length === 0 &&
      (await page.getByRole('dialog').count()) === 0 &&
      (await shopToggle.isVisible()),
  )

  // Раскладка: кнопки управления не уезжают за край экрана ни в какой ориентации
  await checkStartButtonVisible(page)
  await checkControlsFit(page)
  await checkShopCardsVisible(page)
  await page.setViewportSize({ width: 320, height: 568 }) // самый узкий телефон
  await waitForFrames(page)
  await checkStartButtonVisible(page)
  await checkControlsFit(page)
  await checkShopCardsVisible(page)
  await page.setViewportSize({ width: 932, height: 430 }) // iPhone Plus/Max набок
  await waitForFrames(page)
  await checkStartButtonVisible(page)
  await checkShopCardsVisible(page)
  // Почти квадратное окно: по бокам поля пусто — там боковая панель с карточками, а не меню
  await page.setViewportSize({ width: 983, height: 987 })
  await waitForFrames(page)
  check(
    '983×987: боковая панель с карточками, кнопки «Выбрать стража» нет',
    (await page.locator('.shop-toggle').isHidden()) &&
      (await page.locator('.shop .card').first().isVisible()),
  )
  await checkStartButtonVisible(page)
  await checkShopCardsVisible(page)
  // А планшет вертикально остаётся с нижней панелью
  await page.setViewportSize({ width: 768, height: 1024 })
  await waitForFrames(page)
  check(
    '768×1024: нижняя панель, кнопка «Выбрать стража»',
    await page.locator('.shop-toggle').isVisible(),
  )
  await page.close()
}

/** Настоящий API на временной базе — как на сайте, только у себя */
async function startApi() {
  const databaseDirectory = await mkdtemp(join(tmpdir(), 'throne-e2e-'))
  const api = spawn(process.execPath, ['src/main.ts'], {
    cwd: serverRoot,
    env: {
      ...process.env,
      PORT: String(API_PORT),
      DATABASE_PATH: join(databaseDirectory, 'e2e.db'),
    },
    // Журнал запросов не нужен, а ошибки запуска — нужны
    stdio: ['ignore', 'ignore', 'inherit'],
  })
  const deadline = Date.now() + API_START_TIMEOUT_MS
  while (Date.now() < deadline) {
    const isUp = await fetch(`http://127.0.0.1:${API_PORT}/api/health`).then(
      (response) => response.ok,
      () => false,
    )
    if (isUp) {
      return {
        async stop() {
          api.kill('SIGTERM')
          await rm(databaseDirectory, { recursive: true, force: true })
        },
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  api.kill('SIGTERM')
  console.error(`API не поднялось за ${API_START_TIMEOUT_MS / 1000} с`)
  process.exit(1)
}

const api = await startApi()
const server = await preview({
  root,
  logLevel: 'silent',
  // /api — в наш API на временной базе (вместо 3000 из vite.config.ts)
  preview: { port: 4173, proxy: { '/api': `http://127.0.0.1:${API_PORT}` } },
})
// ?level=throne-hall: проверки ставят башни на конкретные клетки «Тронного зала».
// Без него зал на партию выпадает случайно
const url = `${server.resolvedUrls.local[0]}?debug&level=throne-hall`
const browser = await launchBrowser()
console.log(`Проверяю ${url}`)

try {
  await desktop(browser, url)
  await phone(browser, url)
  await offline(browser, url)
  console.log('\nКонсоль браузера')
  check('нет ошибок', errors.length === 0, errors.join('\n'))
} catch (error) {
  console.error('\nПроверка прервалась:', error.message)
  failed++
} finally {
  await browser.close()
  await server.close()
  await api.stop()
}

console.log(failed ? `\n✗ Не прошло проверок: ${failed}` : '\n✓ Все проверки прошли')
process.exit(failed ? 1 : 0)
