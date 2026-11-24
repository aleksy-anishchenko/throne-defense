// npm run e2e — проверка собранной игры в настоящем браузере (Chrome без окна).
// npm run e2e -- offline — один сценарий по имени (desktop, phone или offline).
//
// Сам поднимает `vite preview` с папкой dist (её собирает `npm run build`) и настоящий
// API (apps/server) со свежей временной базой для каждого сценария.
// Открывает игру с ?debug и проходит её как игрок:
// меню, постройка мышью, касанием и с клавиатуры, улучшение, продажа, волна, пауза,
// музыка, настройки звука, поражение, рекорд, общий топ, победа, телефон, игра без сервера.
// Состояние игры читает через window.__throne (доступен только с ?debug).
//
// Нужен установленный Google Chrome. Если его нет: `npx playwright-core install chromium`.

import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { preview } from 'vite'
import { startApi, withResources } from './resources.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
// Размер поля в клетках (как в уровне «Тронный зал»)
const COLS = 7
const ROWS = 11
const ARCHER_COST = 60
const ARCHER_UPGRADE_COST = 50

let failed = 0
const errors = []

function check(name, ok, details = '') {
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${!ok && details ? ` — ${details}` : ''}`)
  if (!ok) failed++
}

async function readStatRows(card) {
  return card
    .locator('[data-stat] > tr:first-child')
    .evaluateAll((rows) =>
      rows
        .map((row) => Array.from(row.cells, (cell) => cell.textContent.trim()).join(' / '))
        .join(' | '),
    )
}

async function launchBrowser() {
  try {
    return await chromium.launch({ channel: 'chrome', headless: true })
  } catch {
    try {
      return await chromium.launch({ headless: true })
    } catch {
      throw new Error(
        'Не найден браузер. Установи Google Chrome или выполни: npx playwright-core install chromium',
      )
    }
  }
}

/** ignore — какие ошибки здесь ожидаемы (например, «не удалось загрузить» без сервера) */
function watchErrors(page, label, ignore = null) {
  const expected = []
  page.on('console', (message) => {
    if (message.type() !== 'error' || ignore?.test(message.text())) return
    const index = expected.findIndex((pattern) => pattern.test(message.text()))
    if (index >= 0) expected.splice(index, 1)
    else errors.push(`${label}: ${message.text()}`)
  })
  page.on('pageerror', (error) => errors.push(`${label}: ${error.message}`))
  return (pattern) => expected.push(pattern)
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
      rewardWave: state.pendingReward?.wave ?? null,
      rewards: state.selectedRewards.map((reward) => reward.rewardId),
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

/** Доиграть волну штатными шагами симуляции за один вызов браузера. */
async function playWaveToEnd(page, changes = {}) {
  await page.evaluate((changes) => {
    const { game } = window.__throne
    Object.assign(game.state, changes)
    const stepsPerSecond = 60
    const timeLimit = 180
    for (let step = 0; step < timeLimit * stepsPerSecond && game.state.phase === 'wave'; step++) {
      game.step(1 / stepsPerSecond)
    }
    if (game.state.phase === 'wave') {
      throw new Error(`Волна ${game.state.wave} не завершилась за ${timeLimit} секунд симуляции`)
    }
  }, changes)
  await waitForFrames(page)
}

async function finishWave(page, wave, rewardSeed) {
  await page.evaluate(
    ({ wave, rewardSeed }) => {
      const { game } = window.__throne
      if (rewardSeed !== undefined) game.state.rewardSeed = rewardSeed
      Object.assign(game.state, {
        wave,
        waveTime: 0,
        spawnQueue: [],
        enemies: [],
        phase: 'wave',
      })
      game.step(1 / 60)
    },
    { wave, rewardSeed },
  )
}

async function finishRewardWave(page, wave, rewardSeed) {
  await finishWave(page, wave, rewardSeed)
  await page.getByRole('heading', { name: 'Выберите благословение' }).waitFor({ timeout: 5000 })
}

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
        return (
          bounds.left >= controls.left - 0.5 &&
          bounds.right <= controls.right + 0.5 &&
          bounds.top >= controls.top - 0.5 &&
          bounds.bottom <= controls.bottom + 0.5
        )
      })
  })
  check(`${width}: кнопки управления помещаются в строку`, fits)
}

/** Сравнивает каждый кадр с раскладкой начального меню при одном размере экрана. */
async function watchPhoneLayout(page) {
  const stop = await page.evaluateHandle(() => {
    const elements = ['.panel', '.controls', '#board'].map((selector) =>
      document.querySelector(selector),
    )
    const layouts = new Set()
    let frame
    function measure() {
      layouts.add(
        elements
          .map((el) => {
            const { x, y, width, height } = el.getBoundingClientRect()
            return [x, y, width, height].join(',')
          })
          .join(' | '),
      )
      frame = requestAnimationFrame(measure)
    }
    measure()
    return () => {
      cancelAnimationFrame(frame)
      return [...layouts]
    }
  })
  return async (label) => {
    const layouts = await stop.evaluate((finish) => finish())
    await stop.dispose()
    check(label, layouts.length === 1, layouts.join(' → '))
  }
}

/** Все девять карточек видны без прокрутки боковой панели. */
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
  const layout = await page.locator('.shop').evaluate((shop) => {
    const shopBounds = shop.getBoundingClientRect()
    const cards = [...shop.querySelectorAll('.card')]
    const clipped = cards.filter((card) => {
      const { left, top, right, bottom } = card.getBoundingClientRect()
      const labels = [...card.querySelectorAll('.card-name, .card-description, .cost')]
      return (
        left < 0 ||
        right > innerWidth ||
        top < Math.max(0, shopBounds.top) - 1 ||
        bottom > Math.min(innerHeight, shopBounds.bottom) + 1 ||
        labels.some((line) => line.scrollWidth > line.clientWidth)
      )
    })
    return {
      count: cards.length,
      overflow: shop.scrollHeight - shop.clientHeight,
      clipped: clipped.map((card) => card.querySelector('.card-name').textContent),
    }
  })
  check(
    `${width}×${height}: все девять карточек боковой панели видны без прокрутки`,
    layout.count === 9 && layout.overflow <= 1 && layout.clipped.length === 0,
    JSON.stringify(layout),
  )
}

async function desktop(page, url) {
  const expectConsoleError = watchErrors(page, 'компьютер')
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

  const versionText = (await page.locator('.sheet .version').textContent())?.trim()
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
  await hoverCell(4, 9)
  check('над пустой плитой без стража в руке курсор обычный', (await boardCursor()) === 'default')

  // Постройка мышью
  const archerCard = page.getByRole('button', { name: /Лучник/ })
  const cannonCard = page.getByRole('button', { name: /^Пушкарь/ })
  const cannonCardText = await cannonCard.innerText()
  check(
    'в карточке Пушкаря цена 340 и короткая подпись о роли',
    cannonCardText.includes('340') &&
      cannonCardText.includes('Бьёт по площади') &&
      !cannonCardText.includes('В центре взрыва урон выше.') &&
      !cannonCardText.includes('Урон 100') &&
      (await cannonCard.getAttribute('aria-description')) === 'Бьёт по площади',
  )
  await archerCard.click()
  check('карточка в магазине нажата', (await archerCard.getAttribute('aria-pressed')) === 'true')
  check(
    'при выборе стража в магазине подсказка предлагает поставить его',
    (await page.locator('#hint').innerText()) === 'Нажмите на свободную плиту',
  )
  await hoverCell(4, 9)
  check('со стражем в руке над свободной плитой — рука', (await boardCursor()) === 'pointer')
  await hoverCell(3, 9)
  check('над ковром (строить нельзя) — обычный курсор', (await boardCursor()) === 'default')
  await clickCell(page, 4, 9, 'right')
  await clickCell(page, 4, 9, 'middle')
  check('правая и средняя кнопки не строят', (await readGameSnapshot(page)).towers.length === 0)
  await clickCell(page, 4, 9)
  check(
    'после постройки страж убран из «руки»',
    (await archerCard.getAttribute('aria-pressed')) === 'false',
  )
  await clickCell(page, 1, 9)
  check(
    'нажатие на свободную плиту без стража ничего не строит',
    (await readGameSnapshot(page)).towers.length === 1,
  )
  await archerCard.click()
  await clickCell(page, 1, 9)
  let snapshot = await readGameSnapshot(page)
  check(
    'две башни, осталось 30 золота',
    snapshot.towers.length === 2 && snapshot.gold === 30,
    JSON.stringify(snapshot),
  )

  // Золота 30, Баллиста стоит 160: в руку не берётся, сразу отказ
  const ballistaCard = page.getByRole('button', { name: /Баллиста/ })
  await ballistaCard.click()
  await waitForFrames(page)
  check(
    'без золота страж не берётся в руку, есть тост',
    (await ballistaCard.getAttribute('aria-pressed')) === 'false' &&
      !!(await page.locator('.toast.visible').textContent())?.includes('Баллиста стоит 160'),
  )

  // Выбор, улучшение, продажа
  await hoverCell(4, 9)
  check('над башней — рука (её можно выбрать)', (await boardCursor()) === 'pointer')
  await page.keyboard.press('Escape')
  await waitForFrames(page)
  check('Escape снял выбор в магазине', (await archerCard.getAttribute('aria-pressed')) === 'false')
  await clickCell(page, 4, 9)
  check('панель башни', (await page.locator('.tower-info b').textContent()) === 'Лучник I')
  check(
    'по нажатию на построенного Лучника видно, как броня влияет на его урон',
    await page
      .locator('.tower-info')
      .getByText('Высокая скорость атаки. Низкий урон по броне.', { exact: true })
      .isVisible(),
  )
  const statLines = await readStatRows(page.locator('.tower-info'))
  check(
    'в первой колонке характеристика с текущим значением, во второй — II уровень',
    statLines ===
      'Урон 7 / 12 | Скорость атаки 2,5 атак/с / 2,78 атак/с | Дальность атаки 1,9 клетки / 2,1 клетки' &&
      (await page
        .locator('.tower-info')
        .getByRole('columnheader', { name: 'II уровень', exact: true })
        .isVisible()),
    statLines,
  )

  check('у лучника выбора цели нет', (await page.locator('.tower-info .target-mode').count()) === 0)

  // Звонарь: постоянный значок, подробности при выборе и честный предпросмотр без сложения.
  await page.keyboard.press('Escape')
  await waitForFrames(page)
  const readBellMark = () =>
    page.evaluate((cols) => {
      const canvas = document.querySelector('#board')
      const cell = canvas.width / cols
      return [
        ...canvas
          .getContext('2d')
          .getImageData(
            Math.round(4.09 * cell),
            Math.round(9.1 * cell),
            Math.round(0.26 * cell),
            Math.round(0.26 * cell),
          ).data,
      ]
    }, COLS)
  const withoutBellMark = await readBellMark()
  const goldBeforeBell = await page.evaluate(() => {
    const { game } = window.__throne
    const canvas = document.querySelector('#board')
    const ctx = canvas.getContext('2d')
    const fillText = ctx.fillText
    const fillRect = ctx.fillRect
    const strokeRect = ctx.strokeRect
    window.__bellLabels = []
    window.__bellCellFrames = {}
    ctx.fillRect = function (x, y, width, height) {
      if (x === 0 && y === 0 && width === canvas.width && height === canvas.height) {
        window.__bellLabels = []
        window.__bellCellFrames = {}
      }
      return fillRect.call(this, x, y, width, height)
    }
    ctx.fillText = function (text, ...args) {
      if (/^(→ )?\+\d+%$/.test(text)) window.__bellLabels.push(text)
      return fillText.call(this, text, ...args)
    }
    ctx.strokeRect = function (x, y, width, height) {
      if (width === height && width > 0.75 && width < 0.9) {
        window.__bellCellFrames[`${Math.floor(x)},${Math.floor(y)}`] = this.getLineDash().length
          ? 'dashed'
          : 'solid'
      }
      return strokeRect.call(this, x, y, width, height)
    }
    window.__restoreBellLabels = () => {
      ctx.fillText = fillText
      ctx.fillRect = fillRect
      ctx.strokeRect = strokeRect
      delete window.__bellLabels
      delete window.__bellCellFrames
      delete window.__restoreBellLabels
    }
    const gold = game.state.gold
    game.state.gold += 1000
    return gold
  })
  await waitForFrames(page)
  await page.getByRole('button', { name: /Звонарь/ }).click()
  await hoverCell(5, 9)
  check(
    'превью Звонаря: реальное усиление +20% и число получателей',
    (await page.locator('#hint').innerText()).includes('Лучник будет стрелять на 20% чаще') &&
      (await page.evaluate(() => window.__bellLabels.includes('→ +20%'))),
  )
  await clickCell(page, 5, 9)
  const withBellMark = await readBellMark()
  check(
    'без выбора башни ускорение отмечено значком, но без лишних процентов',
    withBellMark.some((value, i) => i % 4 < 3 && Math.abs(value - withoutBellMark[i]) > 30) &&
      (await page.evaluate(() => window.__bellLabels.length === 0)),
  )
  await clickCell(page, 4, 9)
  await waitForFrames(page)
  const attackRate = page.locator('.tower-info [data-stat="attackRate"]')
  const rateButton = attackRate.getByRole('button')
  const bellLine = await attackRate.innerText()
  check(
    'панель: жёлтым выделена действующая скорость Лучника, базовое число скрыто',
    (await rateButton.innerText()) === '3 атак/с' &&
      (await rateButton.getAttribute('aria-expanded')) === 'false' &&
      (await rateButton.evaluate((el) => el.matches('.is-boosted'))) &&
      (await attackRate.locator('.tower-stat-next').innerText()).trim() === '3,33 атак/с' &&
      !bellLine.includes('2,5') &&
      !bellLine.includes('Звонарь'),
    bellLine,
  )
  await rateButton.press('Enter')
  check(
    'источник ускорения можно раскрыть с клавиатуры',
    (await rateButton.getAttribute('aria-expanded')) === 'true' &&
      (await attackRate.locator('.tower-stat-bonus').innerText()) === 'Звонарь +20%',
  )
  await rateButton.press('Enter')
  check(
    'выбор получателя показывает его фактический процент на поле',
    await page.evaluate(() => window.__bellLabels.join(',') === '+20%'),
  )
  await page.evaluate(() => window.__throne.game.build('frost', 5, 10))
  await clickCell(page, 5, 10)
  await waitForFrames(page)
  const frostInfo = page.locator('.tower-info')
  check(
    'у Морозко замедление 45% → 55% и дальность указаны в характеристиках',
    (await readStatRows(frostInfo)) ===
      'Замедление 45% / 55% | Дальность 1,7 клетки / 1,9 клетки' &&
      !(await frostInfo.locator('.tower-description').innerText()).includes('%'),
  )
  await clickCell(page, 5, 9)
  await waitForFrames(page)
  const bellInfo = page.locator('.tower-info')
  check(
    'Звонарь показывает подходящие клетки сейчас и после улучшения',
    (await readStatRows(bellInfo)).includes('Клеток в зоне 6 / 7') &&
      !(await bellInfo.innerText()).includes('Сплошная рамка') &&
      (await bellInfo.innerText()).includes('Ускоряет 1 башню'),
  )
  check(
    'у ускоренного Лучника кольцо, рамки показывают свободную и будущую клетки',
    await page.evaluate(() => {
      const frames = window.__bellCellFrames
      return !frames['4,9'] && frames['6,9'] === 'solid' && frames['5,7'] === 'dashed'
    }),
  )
  await page.evaluate(() => {
    const { game } = window.__throne
    game.build('bell', 4, 10)
    game.upgrade(4, 10)
    game.upgrade(4, 10)
  })
  await waitForFrames(page)
  const weakerBellInfo = await page.locator('.tower-info').innerText()
  check(
    'слабый Звонарь честно показывает перекрытие сильным',
    weakerBellInfo.includes('Ускоряет 0 башен') &&
      weakerBellInfo.includes('Другой Звонарь даёт не меньший бонус: 1') &&
      (await page.evaluate(() => window.__bellLabels.length === 0)),
  )
  await clickCell(page, 4, 9)
  check(
    'две ауры не складываются: на поле и в панели +40%, а не +60%',
    (await rateButton.innerText()) === '3,5 атак/с' &&
      (await rateButton.getAttribute('title')) === 'Звонарь +40%' &&
      (await page.evaluate(() => window.__bellLabels.join(',') === '+40%')),
  )
  await page.keyboard.press('Escape')
  await waitForFrames(page)
  await page.getByRole('button', { name: /Звонарь/ }).click()
  await hoverCell(4, 8)
  check(
    'превью второго Звонаря не обещает прибавку поверх сильной ауры',
    (await page.locator('#hint').innerText()).includes('уже получают не меньший бонус') &&
      (await page.evaluate(() => !window.__bellLabels.includes('→ +20%'))),
  )
  await page.keyboard.press('Escape')
  const beforeArcherPreview = await readGameSnapshot(page)
  await archerCard.click()
  await hoverCell(4, 8)
  check(
    'до постройки Лучника видны будущие +40% от сильнейшего Звонаря и подсказка',
    (await page.evaluate(() => window.__bellLabels.join(',') === '→ +40%')) &&
      (await page.locator('#hint').innerText()).includes('получит +40% к скорострельности'),
  )
  const afterArcherPreview = await readGameSnapshot(page)
  check(
    'предпросмотр Лучника не тратит золото и не строит башню',
    beforeArcherPreview.gold === afterArcherPreview.gold &&
      beforeArcherPreview.towers.length === afterArcherPreview.towers.length &&
      (await page.evaluate(() => window.__throne.game.towerAt(4, 8) === undefined)),
  )
  await hoverCell(0, 1)
  check(
    'при выходе будущего Лучника из зоны бонус исчезает',
    await page.evaluate(() => window.__bellLabels.length === 0),
  )
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /Морозко/ }).click()
  await hoverCell(4, 8)
  check(
    'Морозко в зоне Звонаря не получает ложного предпросмотра ускорения',
    await page.evaluate(() => window.__bellLabels.length === 0),
  )
  await page.keyboard.press('Escape')
  await page.evaluate(() => window.__throne.game.sell(4, 10))
  await clickCell(page, 4, 9)
  check(
    'после продажи сильного Звонаря возвращается +20% от оставшегося',
    (await rateButton.innerText()) === '3 атак/с' &&
      (await rateButton.getAttribute('title')) === 'Звонарь +20%' &&
      (await page.evaluate(() => window.__bellLabels.join(',') === '+20%')),
  )
  await page.keyboard.press('Escape')
  await archerCard.click()
  await hoverCell(4, 8)
  check(
    'предпросмотр нового Лучника тоже обновляется до +20% после продажи сильной ауры',
    (await page.evaluate(() => window.__bellLabels.join(',') === '→ +20%')) &&
      (await page.locator('#hint').innerText()).includes('получит +20% к скорострельности'),
  )
  await page.keyboard.press('Escape')
  await page.evaluate(() => window.__throne.game.build('bell', 0, 0))
  await clickCell(page, 0, 0)
  check(
    'Звонарь без получателей явно сообщает об этом',
    (await page.locator('.tower-info').innerText()).includes('Нет подходящих башен в радиусе'),
  )
  await page.evaluate((gold) => {
    const { game } = window.__throne
    game.sell(5, 9)
    game.sell(5, 10)
    game.sell(0, 0)
    game.state.gold = gold
    window.__restoreBellLabels()
  }, goldBeforeBell)
  await waitForFrames(page)
  await clickCell(page, 4, 9)

  // Колдун: ослабление лечения видно отдельно и растёт при улучшении.
  const goldBeforeWarlock = await page.evaluate(() => {
    const { game } = window.__throne
    const gold = game.state.gold
    game.state.gold += 1000
    game.build('warlock', 5, 9)
    return gold
  })
  await clickCell(page, 5, 9)
  check(
    'выбранный Колдун I показывает ослабление лечения без скорости атаки',
    (await readStatRows(page.locator('.tower-info'))).includes('Получаемое лечение −20% / −30%') &&
      (await page.locator('.tower-info [data-stat="attackRate"]').count()) === 0 &&
      (await page.locator('.tower-info .tower-description').innerText()).includes(
        'Проклятые получают больше урона и меньше лечения.',
      ),
  )
  await page.getByRole('button', { name: /Улучшить/ }).click()
  await waitForFrames(page)
  check(
    'Колдун II: показано ослабление лечения 30% → 40%',
    (await readStatRows(page.locator('.tower-info'))).includes('Получаемое лечение −30% / −40%') &&
      (await page
        .locator('.tower-info')
        .getByRole('columnheader', { name: 'III уровень', exact: true })
        .isVisible()),
  )
  await page.getByRole('button', { name: /Улучшить/ }).click()
  await waitForFrames(page)
  check(
    'Колдун III: показано ослабление лечения 40%',
    (await readStatRows(page.locator('.tower-info'))).includes('Получаемое лечение −40%'),
  )
  await page.evaluate((gold) => {
    const { game } = window.__throne
    game.sell(5, 9)
    game.state.gold = gold
  }, goldBeforeWarlock)

  // Казны-соседи: бонус и фактический доход видны в общей панели.
  const goldBeforeTreasuries = await page.evaluate(() => {
    const { game } = window.__throne
    const canvas = document.querySelector('#board')
    const ctx = canvas.getContext('2d')
    const fillText = ctx.fillText
    const fillRect = ctx.fillRect
    window.__treasuryLabels = []
    ctx.fillRect = function (x, y, width, height) {
      if (x === 0 && y === 0 && width === canvas.width && height === canvas.height) {
        window.__treasuryLabels = []
      }
      return fillRect.call(this, x, y, width, height)
    }
    ctx.fillText = function (text, ...args) {
      if (/^(→ )?\+\d+%$/.test(text)) window.__treasuryLabels.push(text)
      return fillText.call(this, text, ...args)
    }
    window.__restoreTreasuryLabels = () => {
      ctx.fillText = fillText
      ctx.fillRect = fillRect
      delete window.__treasuryLabels
      delete window.__restoreTreasuryLabels
    }
    const gold = game.state.gold
    game.state.gold += 1000
    game.build('treasury', 0, 0)
    game.build('treasury', 1, 1)
    return gold
  })
  await waitForFrames(page)
  check(
    'без выбора Казны постоянных процентов на поле нет',
    await page.evaluate(() => window.__treasuryLabels.length === 0),
  )
  await clickCell(page, 4, 9)
  check(
    'выбор Лучника не раскрывает проценты соседних Казён',
    await page.evaluate(() => window.__treasuryLabels.length === 0),
  )
  await page.keyboard.press('Escape')
  await waitForFrames(page)
  const neighborPixel = () =>
    page.evaluate((cols) => {
      const canvas = document.querySelector('#board')
      const cell = canvas.width / cols
      return [
        ...canvas
          .getContext('2d')
          .getImageData(
            Math.round(1.05 * cell),
            Math.round(0.15 * cell),
            Math.max(2, Math.round(0.05 * cell)),
            Math.round(0.7 * cell),
          ).data,
      ]
    }, COLS)
  const beforePreview = await neighborPixel()
  await page.getByRole('button', { name: /Казна/ }).click()
  await hoverCell(2, 1)
  const withPreview = await neighborPixel()
  check(
    'при размещении Казны соседняя клетка подсвечена',
    withPreview.some((value, i) => i % 4 < 3 && Math.abs(value - beforePreview[i]) > 10),
  )
  check(
    'превью Казны показывает будущий бонус со стрелкой',
    await page.evaluate(() => window.__treasuryLabels.includes('→ +10%')),
  )
  await page.keyboard.press('Escape')
  await clickCell(page, 0, 0)
  await waitForFrames(page)
  const treasuryInfo = await page.locator('.tower-info').innerText()
  check(
    'Казна показывает соседа, округлённый доход и две свободные клетки на краю поля',
    treasuryInfo.includes('Соседние Казны: 1, бонус +10% · сплошная рамка') &&
      treasuryInfo.includes('Свободных клеток для Казн 2 · пунктир') &&
      (await readStatRows(page.locator('.tower-info'))) === 'Доход за волну 13 / 25' &&
      (await page.locator('.tower-info [data-stat="goldPerWave"] .is-boosted').isVisible()) &&
      !treasuryInfo.includes('Диагонали тоже считаются'),
    treasuryInfo,
  )
  check(
    'при выборе Казны проценты показаны у неё и у соседа',
    await page.evaluate(() => window.__treasuryLabels.join(',') === '+10%,+10%'),
  )
  await page.evaluate((gold) => {
    const { game } = window.__throne
    window.__treasuryLabels = []
    game.sell(1, 1)
    game.state.gold = gold
  }, goldBeforeTreasuries)
  await waitForFrames(page)
  const treasuryAfterSale = await page.locator('.tower-info').innerText()
  check(
    'после продажи соседа Казна показывает доход без бонуса и ещё одну свободную клетку',
    treasuryAfterSale.includes('Соседние Казны: 0, бонус +0%') &&
      treasuryAfterSale.includes('Свободных клеток для Казн 3 · пунктир') &&
      (await readStatRows(page.locator('.tower-info'))) === 'Доход за волну 12 / 23' &&
      (await page.locator('.tower-info [data-stat="goldPerWave"] .is-boosted').count()) === 0,
    treasuryAfterSale,
  )
  check(
    'после продажи соседа на поле +0%, старый бонус исчез',
    await page.evaluate(
      () => window.__treasuryLabels.includes('+0%') && !window.__treasuryLabels.includes('+10%'),
    ),
  )
  await page.keyboard.press('Escape')
  await waitForFrames(page)
  check(
    'снятие выбора Казны скрывает и нулевой процент',
    await page.evaluate(() => window.__treasuryLabels.length === 0),
  )
  await page.evaluate(
    ({ gold, upgradeCost }) => {
      const { game } = window.__throne
      game.sell(0, 0)
      game.state.gold = gold + upgradeCost
      window.__restoreTreasuryLabels()
    },
    { gold: goldBeforeTreasuries, upgradeCost: ARCHER_UPGRADE_COST },
  )
  await clickCell(page, 4, 9)

  await page.getByRole('button', { name: /Улучшить/ }).click()
  await waitForFrames(page)
  snapshot = await readGameSnapshot(page)
  check(
    'улучшение',
    snapshot.gold === goldBeforeTreasuries && snapshot.towers.includes('archer1@4,9'),
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
    'до волны «Вернуть» отдаёт всю постройку и улучшение',
    snapshot.gold === goldBeforeTreasuries + ARCHER_COST + ARCHER_UPGRADE_COST &&
      snapshot.towers.length === 1,
    JSON.stringify(snapshot),
  )
  check('панель башни скрылась', (await page.locator('.tower-info').count()) === 0)

  // Постройка с клавиатуры: 1, стрелки к клетке (4, 9), Enter
  await page.keyboard.press('1')
  await page.keyboard.press('ArrowRight')
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await waitForFrames(page)
  snapshot = await readGameSnapshot(page)
  check(
    'постройка с клавиатуры',
    snapshot.towers.includes('archer0@4,9') &&
      snapshot.gold === goldBeforeTreasuries + ARCHER_UPGRADE_COST,
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
  await clickCell(page, 2, 9)
  await page.keyboard.up('Shift')
  check(
    'Shift: построил и страж остался «в руке»',
    (await readGameSnapshot(page)).towers.includes('archer0@2,9') &&
      (await archerCard.getAttribute('aria-pressed')) === 'true',
  )
  await page.keyboard.press('Escape')
  await clickCell(page, 2, 9)
  await page.getByRole('button', { name: /Вернуть/ }).click()
  await waitForFrames(page)
  check(
    'Shift-башню вернули, золото прежнее',
    (await readGameSnapshot(page)).gold === goldBeforeTreasuries + ARCHER_UPGRADE_COST,
  )
  await page.keyboard.press('Escape')
  // Оставшегося золота хватает на третьего Лучника перед волной.
  await archerCard.click()
  await clickCell(page, 2, 9)

  // Лучник III: два аспекта по 120, покупка и отмена видны в панели.
  const goldBeforeArcherAspectTest = (await readGameSnapshot(page)).gold
  await page.evaluate(() => (window.__throne.game.state.gold = 1000))
  await clickCell(page, 4, 9)
  await page.getByRole('button', { name: /Улучшить/ }).click()
  await page.getByRole('button', { name: /Улучшить/ }).click()
  await waitForFrames(page)
  const archerAspects = page.locator('.tower-info .tower-aspects')
  check(
    'Лучник III: два аспекта по 120',
    (await archerAspects.locator('.aspect-option').count()) === 2 &&
      (await archerAspects.innerText()).includes('Метка охотника') &&
      (await archerAspects.innerText()).includes('Рикошет'),
  )
  const archerGoldBeforeAspect = (await readGameSnapshot(page)).gold
  await archerAspects.getByRole('button', { name: 'Рикошет за 120 золота' }).click()
  await waitForFrames(page)
  check(
    'Рикошет: Лучник IV и списание 120',
    (await page.locator('.tower-info b').textContent()) === 'Лучник IV' &&
      (await readGameSnapshot(page)).gold === archerGoldBeforeAspect - 120 &&
      (await page.evaluate(() => window.__throne.game.towerAt(4, 9).aspectId)) === 'ricochet',
  )
  await archerAspects.getByRole('button', { name: /Отменить аспект/ }).click()
  await waitForFrames(page)
  check(
    'аспект Лучника можно отменить до боя',
    (await page.locator('.tower-info b').textContent()) === 'Лучник III' &&
      (await readGameSnapshot(page)).gold === archerGoldBeforeAspect,
  )
  await page.keyboard.press('Escape')
  await page.evaluate((gold) => {
    const { game } = window.__throne
    game.sell(4, 9)
    game.build('archer', 4, 9)
    game.state.gold = gold
  }, goldBeforeArcherAspectTest)
  await waitForFrames(page)

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
  // Дверь расположена за нижним краем canvas: появившийся враг ещё может быть невидим.
  // Для сравнения пикселей ждём, пока целиком войдёт и тело, и область огня вокруг него.
  await page.waitForFunction(() => {
    const { game } = window.__throne
    const enemy = game.state.enemies.find((candidate) => candidate.def.id === 'rebel')
    return enemy && enemy.y + enemy.def.radius + 0.15 < game.level.def.rows
  })
  check(
    'подсказка «Врагов осталось»',
    (await page.locator('#hint').textContent()).startsWith('Врагов осталось'),
  )
  await page.evaluate(() => window.__throne.game.setPaused(true))
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
  await page.evaluate(() => window.__throne.game.setPaused(false))
  await playWaveToEnd(page)
  snapshot = await readGameSnapshot(page)
  check(
    'первая волна отбита без потерь',
    snapshot.phase === 'build' && snapshot.wave === 2 && snapshot.lives === 20,
    JSON.stringify(snapshot),
  )
  check(
    'шапка «Волна 2 из 30» и название зала',
    (await page.locator('.hud .wave-label').textContent()) === 'Волна 2 из 30' &&
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
  await playWaveToEnd(page, { lives: 1 })
  await page.getByRole('heading', { name: 'Трон пал' }).waitFor({ timeout: 5000 })
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
  // Новая страница при ещё старом API: результат остаётся доступен для повтора.
  await page.route('**/api/runs', (route) => {
    const body = route.request().postDataJSON()
    body.balanceVersion++
    return route.continue({ postData: JSON.stringify(body) })
  })
  await page.getByRole('button', { name: 'Сменить имя' }).click()
  expectConsoleError(/status of 503/)
  await page.getByRole('button', { name: 'Сохранить' }).click()
  check(
    'API ещё не обновлён: результат можно отправить повторно',
    await appears(page.getByRole('button', { name: 'Отправить ещё раз' })),
  )
  await page.unroute('**/api/runs')
  await page.getByRole('button', { name: 'Отправить ещё раз' }).click()
  check(
    'после обновления API повторная отправка успешна',
    await appears(page.locator('.run-place').filter({ hasText: 'Страж 1, вы первым' })),
  )
  // Как вкладка старой версии после деплоя: запрос проходит в настоящий API,
  // только номер баланса подменён. Отказ должен объяснять обновление, без вечного повтора.
  await page.route('**/api/runs', (route) => {
    const body = route.request().postDataJSON()
    body.balanceVersion--
    return route.continue({ postData: JSON.stringify(body) })
  })
  await page.getByRole('button', { name: 'Сменить имя' }).click()
  expectConsoleError(/status of 422/)
  await page.getByRole('button', { name: 'Сохранить' }).click()
  check(
    'старый баланс: есть объяснение и кнопка обновления',
    (await appears(page.getByRole('button', { name: 'Обновить игру' }))) &&
      (await page.locator('.run-place').innerText()).includes('Правила игры обновились'),
  )
  check(
    'старый баланс: повторная отправка не предлагается',
    (await page.getByRole('button', { name: 'Отправить ещё раз' }).count()) === 0,
  )
  await page.unroute('**/api/runs')
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

  // Фиксируем розыгрыш: три редкости, а после обновления доступны «Заточенные клинки».
  const rewardGoal = page.locator('.hud').getByText(/за волны/)
  check('в шапке нет статуса отрезка для благословения', (await rewardGoal.count()) === 0)
  await finishRewardWave(page, 5, 5252)
  const rewardCards = page.locator('.reward-card')
  const rewardNames = await rewardCards.locator('strong').allTextContents()
  check(
    'после 5-й волны три разные награды показывают редкость и прогресс 1 из 3',
    rewardNames.length === 3 &&
      new Set(rewardNames).size === 3 &&
      new Set(await rewardCards.locator('.reward-rarity').allTextContents()).size === 3 &&
      (await page.locator('.reward-caption').count()) === 0 &&
      (await page.locator('.reward-sheet').getAttribute('aria-describedby')) === null &&
      (await rewardCards.locator('.reward-set-status').allTextContents()).every(
        (status) => status === 'После выбора 1 из 3',
      ) &&
      (await page.evaluate(() =>
        ['.hud', '.stage', '.panel'].every((selector) => document.querySelector(selector).inert),
      )),
    rewardNames.join(', '),
  )
  const desktopRewardBounds = await rewardCards.evaluateAll((cards) =>
    cards.map((card) => {
      const { left, width, top, bottom } = card.getBoundingClientRect()
      return { left, width, top, bottom }
    }),
  )
  check(
    'на компьютере карточки стоят друг под другом',
    desktopRewardBounds.length === 3 &&
      desktopRewardBounds.every(
        ({ left, width, top }, index) =>
          left === desktopRewardBounds[0].left &&
          width === desktopRewardBounds[0].width &&
          (index === 0 || top >= desktopRewardBounds[index - 1].bottom),
      ),
    JSON.stringify(desktopRewardBounds),
  )
  const pendingReward = await readGameSnapshot(page)
  const giantDiet = rewardCards.filter({ hasText: 'Разгрузочный день' })
  check(
    '«Разгрузочный день» показывает редкость, описание и эффект набора',
    (await giantDiet.getAttribute('data-rarity')) === 'rare' &&
      (await giantDiet.locator('.reward-description').innerText()) ===
        'У боссов и полубоссов на 20% меньше здоровья' &&
      (await giantDiet.locator('.reward-set-effect').innerText()) ===
        'Все враги идут на 10% медленнее',
  )
  check(
    '«Целебный обоз» доступен и при полном здоровье',
    pendingReward.lives === 20 && rewardNames.includes('Целебный обоз'),
  )
  const rerollButton = page.getByRole('button', { name: /Обновить варианты/ })
  const rerollPrice = rerollButton.locator('.reward-reroll-cost')
  await rewardCards.last().focus()
  await page.keyboard.press('Tab')
  const wrappedToStart = await rerollButton.evaluate((button) => document.activeElement === button)
  await page.keyboard.press('Shift+Tab')
  check(
    'Tab и Shift+Tab удерживают фокус в окне благословений',
    wrappedToStart &&
      (await rewardCards.last().evaluate((card) => document.activeElement === card)),
  )
  const rerollBounds = await rerollButton.boundingBox()
  const firstRewardBounds = await rewardCards.first().boundingBox()
  check(
    'над карточками компактная кнопка обновления с ценой −60 и монетой',
    rerollBounds &&
      firstRewardBounds &&
      rerollBounds.y + rerollBounds.height <= firstRewardBounds.y &&
      (await rerollButton.locator('.reward-reroll-label').innerText()) === 'Обновить' &&
      (await rerollPrice.innerText()).trim() === '−60' &&
      (await rerollButton.locator('.reward-coin').isVisible()) &&
      !(await page.locator('.reward-sheet').innerText()).includes('В запасе'),
  )
  await rerollButton.press('Enter')
  const rerolledReward = await readGameSnapshot(page)
  const rerolledNames = await rewardCards.locator('strong').allTextContents()
  check(
    'обновление заменяет все карточки, списывает 60 золота и сохраняет фокус в диалоге',
    rerolledNames.length === 3 &&
      rerolledNames.every((name) => !rewardNames.includes(name)) &&
      rerolledReward.gold === pendingReward.gold - 60 &&
      rerolledReward.phase === 'reward' &&
      (await rerollPrice.innerText()).trim() === '−80' &&
      (await rewardCards.first().evaluate((card) => document.activeElement === card)),
    rerolledNames.join(', '),
  )
  const blades = rewardCards.filter({ hasText: 'Заточенные клинки' })
  check(
    '«Заточенные клинки» стали легендарными и дают +18% урона',
    (await blades.getAttribute('data-rarity')) === 'legendary' &&
      (await blades.locator('.reward-description').innerText()).includes('+18%'),
  )
  await blades.click()
  await waitForFrames(page)
  const chosenReward = await readGameSnapshot(page)
  check(
    'выбранная награда сохранена, партия вернулась к строительству',
    (await page.locator('.overlay').count()) === 0 &&
      chosenReward.phase === 'build' &&
      chosenReward.rewardWave === null &&
      chosenReward.rewards.join(',') === 'sharpened-steel' &&
      pendingReward.rewardWave === 5,
    JSON.stringify({ pendingReward, chosenReward }),
  )
  const bladesIcon = page.getByRole('button', { name: 'Заточенные клинки', exact: true })
  const inventoryBounds = await bladesIcon.boundingBox()
  const boardBounds = await page.locator('#board').boundingBox()
  check(
    'SVG-значок благословения расположен слева от поля',
    inventoryBounds.x + inventoryBounds.width <= boardBounds.x &&
      (await bladesIcon.locator('img').evaluate((icon) => icon.complete && icon.naturalWidth > 0)),
  )
  await bladesIcon.hover()
  const tooltip = page.getByRole('tooltip')
  check(
    'наведение показывает бонус «Гнева стражи» и прогресс 1 из 3',
    (await tooltip.isVisible()) &&
      (await tooltip.innerText()).includes('+18% ко всему урону стражей') &&
      (await tooltip.locator('.reward-set-title').innerText()) === 'Набор «Гнев стражи»' &&
      (await tooltip.locator('.reward-set-status').innerText()) === 'Собрано 1 из 3' &&
      (await tooltip.locator('.reward-set-effect').innerText()).includes('+15%') &&
      (await bladesIcon.locator('.reward-progress span').count()) === 3 &&
      (await bladesIcon.locator('.reward-progress .is-filled').count()) === 1,
  )
  await page.keyboard.press('Escape')
  check('Escape закрывает подсказку', !(await tooltip.isVisible()))
  await page.locator('#board').focus()
  await page.keyboard.press('Shift+Tab')
  check('фокус с клавиатуры показывает подсказку', await tooltip.isVisible())
  await page.locator('#board').focus()
  await bladesIcon.evaluate((button) => {
    button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }))
    button.dispatchEvent(
      new PointerEvent('click', { bubbles: true, pointerType: 'mouse', detail: 1 }),
    )
  })
  check('подсказка значка открывается от касания с click типа mouse', await tooltip.isVisible())
  await page.keyboard.press('Escape')

  // Двигаем вышедшего бунтовщика до трона и даём игре самой засчитать урон.
  await page.evaluate(() => {
    const { game } = window.__throne
    game.state.wave = 6
    game.startWave()
    game.step(1 / 60)
    game.state.enemies[0].pathDistance = game.level.path.length
    game.step(1 / 60)
  })
  await waitForFrames(page)
  check(
    'прорыв отнимает жизнь без отдельного статуса благословения в шапке',
    (await readGameSnapshot(page)).lives === 19 && (await rewardGoal.count()) === 0,
  )
  await finishRewardWave(page, 10, 1)
  check(
    'после прорыва на 6-й волне на 10-й доступны три благословения',
    (await rewardCards.count()) === 3 &&
      (await readGameSnapshot(page)).rewardWave === 10 &&
      (await rerollPrice.innerText()).trim() === '−80',
  )
  await rewardCards.filter({ hasText: 'Целебный обоз' }).click()
  await waitForFrames(page)
  const healed = await readGameSnapshot(page)
  check(
    '«Целебный обоз» восстанавливает потерянную жизнь перед 11-й волной',
    healed.phase === 'build' && healed.wave === 11 && healed.lives === 20,
  )
  await finishRewardWave(page, 15, 0)
  check(
    'после 15-й волны выбранные «Клинки» исчезли из предложения и цена сброшена',
    (await blades.count()) === 0 && (await rerollPrice.innerText()).trim() === '−100',
  )
  check(
    'после 15-й волны может выпасть обычная «Щедрая награда»',
    (await rewardCards.filter({ hasText: 'Щедрая награда' }).getAttribute('data-rarity')) ===
      'common',
  )
  await rerollButton.click()
  const iceNeedles = rewardCards.filter({ hasText: 'Ледяные иглы' })
  const needlesDescription = await iceNeedles.locator('.reward-description').innerText()
  const iceNeedlesSet = iceNeedles.locator('.reward-card-set')
  check(
    'после обновления «Ледяные иглы» показывают эффект и прогресс 2 из 3',
    (await blades.count()) === 0 &&
      (await iceNeedles.getAttribute('data-rarity')) === 'rare' &&
      needlesDescription.includes('по врагу под морозом') &&
      needlesDescription.includes('25%') &&
      (await iceNeedles
        .locator('img')
        .evaluate((icon) => icon.complete && icon.naturalWidth > 0)) &&
      (await iceNeedlesSet.locator('.reward-set-status').innerText()) === 'После выбора 2 из 3' &&
      (await iceNeedlesSet.locator('.reward-set-effect').innerText()).includes('+15%') &&
      !(await iceNeedles.locator('.reward-set-ready').count()),
  )
  await iceNeedles.click()
  await waitForFrames(page)
  await bladesIcon.hover()
  check(
    'две карты «Гнева стражи» дают прогресс 2 из 3',
    (await readGameSnapshot(page)).rewards.join(',') ===
      'sharpened-steel,field-medic,ice-needles' &&
      (await bladesIcon.locator('.reward-count').count()) === 0 &&
      (await tooltip.innerText()).includes('+18% ко всему урону стражей') &&
      (await tooltip.locator('.reward-set-status').innerText()) === 'Собрано 2 из 3' &&
      (await bladesIcon.locator('.reward-progress .is-filled').count()) === 2,
  )

  await page.getByRole('button', { name: /^Баллиста/ }).click()
  await clickCell(page, 4, 9)
  await page.keyboard.press('Escape')
  await clickCell(page, 4, 9)
  check(
    'карточка Баллисты показывает то же условие для игл, что и благословение',
    (await page.locator('.tower-info').innerText()).includes(needlesDescription),
  )
  await page.getByRole('button', { name: /Вернуть/ }).click()

  // Проверяем состав двух волн и переходы между этапами. Бои сокращаем после выхода врагов.
  await page.evaluate(() => {
    const { game, store } = window.__throne
    game.state.wave = 20
    game.state.rewardSeed = 4
    store.syncHud()
  })
  await waitForFrames(page)
  const generalHint = await page.locator('#hint').innerText()
  check(
    'на 20-й волне объявлен генерал и описано знамя',
    generalHint.includes('1 генерал мятежников') && generalHint.includes('+3 брони'),
    generalHint,
  )
  await page.getByRole('button', { name: 'Начать волну' }).click()
  const generalWave = await page.evaluate(() => {
    const { game } = window.__throne
    for (let step = 0; step < 120; step++) game.step(1 / 60)
    return game.state.enemies.map((enemy) => enemy.def.id)
  })
  check(
    'на 20-й волне вышли генерал и латники',
    generalWave.includes('general') &&
      generalWave.includes('armor') &&
      !generalWave.includes('boss'),
  )
  await page.evaluate(() => {
    const { game } = window.__throne
    game.state.spawnQueue = []
    game.state.enemies = []
    game.step(1 / 60)
  })
  await page.getByRole('heading', { name: 'Выберите благословение' }).waitFor({ timeout: 5000 })
  check(
    'после 20-й волны доступно благословение, первое обновление за 120',
    (await readGameSnapshot(page)).rewardWave === 20 &&
      (await rerollPrice.innerText()).trim() === '−120',
  )
  const doubleShot = rewardCards.filter({ hasText: 'Двойной выстрел' })
  check(
    'третья карта «Гнева стражи» подсвечена подписью «Откроет бонус»',
    (await doubleShot.locator('.reward-set-ready .reward-set-status').innerText()) ===
      'Откроет бонус',
  )
  await doubleShot.click()
  await waitForFrames(page)
  check(
    'после 20-й волны показано сообщение о наборе и началась подготовка к 21-й',
    (await page.locator('.hud .wave-label').textContent()) === 'Волна 21 из 30' &&
      (await readGameSnapshot(page)).phase === 'build' &&
      (await page.locator('.toast').innerText()).includes('Набор «Гнев стражи» собран'),
  )

  await finishRewardWave(page, 29, 56)
  const finalOffer = await readGameSnapshot(page)
  check(
    'лишняя карта собранного набора показывает «Бонус уже получен»',
    (await rewardCards
      .filter({ hasText: 'Испепеление' })
      .locator('.reward-set-status')
      .innerText()) === 'Бонус уже получен',
  )
  check(
    'после 29-й волны может выпасть «Военный налог», первое обновление за 160',
    finalOffer.rewardWave === 29 &&
      (await rerollPrice.innerText()).trim() === '−160' &&
      (await rewardCards.filter({ hasText: 'Военный налог' }).isVisible()),
  )
  await rerollButton.click()
  check(
    'после 29-й волны обновление списало 160 золота, следующее стоит 180',
    (await readGameSnapshot(page)).gold === finalOffer.gold - 160 &&
      (await rerollPrice.innerText()).trim() === '−180',
  )
  const slowCard = rewardCards.filter({ hasText: 'Распутица' })
  check(
    '«Распутица» показывается как легендарная карта с замедлением 25%',
    (await slowCard.getAttribute('data-rarity')) === 'legendary' &&
      (await slowCard.locator('.reward-description').innerText()).includes('25%'),
  )
  const finalChest = rewardCards.filter({ hasText: 'Военная казна' })
  check(
    'на 29-й волне «Военная казна» обещает 560 золота прямо на карточке',
    (await finalChest.locator('.reward-description').innerText()) === '+560 золота сразу',
  )
  await finalChest.click()
  const beforeFinalWave = await readGameSnapshot(page)
  check(
    'Казна начисляет показанные 560 золота, открывается 30-я волна',
    beforeFinalWave.gold === finalOffer.gold - 160 + 560 && beforeFinalWave.wave === 30,
  )
  await page.getByRole('button', { name: 'Начать волну' }).click()
  check(
    '30-я волна начинается с Узурпатора',
    await page.evaluate(() => {
      const { game } = window.__throne
      game.step(1 / 60)
      return game.state.enemies[0]?.def.id === 'boss'
    }),
  )
  await page.evaluate(() => {
    const { game } = window.__throne
    game.state.spawnQueue = []
    game.state.enemies = []
    game.step(1 / 60)
  })
  await page.getByRole('heading', { name: 'Трон устоял' }).waitFor({ timeout: 10_000 })
  check(
    'экран победы',
    (await page.locator('.sheet p').first().textContent()).startsWith('Все 30 волн отбиты.'),
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
  check('бесконечный режим', (await page.locator('.hud .wave-label').textContent()) === 'Волна 31')
  await page.getByRole('button', { name: 'Начать волну' }).click()
  await page.waitForFunction(() => window.__throne.game.state.enemies.length > 0)
  check('31-я волна началась, враги вышли', (await readGameSnapshot(page)).phase === 'wave')

  // Баллиста стоит дороже стартового бюджета: выдаём средства только для проверки панели.
  await page.evaluate(() => window.__throne.store.newGame())
  await page.evaluate(() => (window.__throne.game.state.gold = 160))
  await page.getByRole('button', { name: /Баллиста/ }).click()
  await clickCell(page, 4, 9)
  await page.keyboard.press('Escape')
  await clickCell(page, 4, 9)
  const ballista = await readStatRows(page.locator('.tower-info'))
  check(
    'баллиста: характеристики',
    ballista ===
      'Урон 75 / 125 | Скорость атаки 0,31 атак/с / 0,33 атак/с | Дальность атаки 2,7 клетки / 2,9 клетки',
    ballista,
  )

  // Выбор цели — умение баллисты: кнопкой в панели и клавишей T
  const targetButton = page.locator('.tower-info .target-mode')
  const ballistaTargetMode = () =>
    page.evaluate(() => window.__throne.game.towerAt(4, 9).targetMode)
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

  // IV ступень — выбор из двух аспектов. Деньги выдаются только для проверки интерфейса.
  check(
    'Баллиста I: специализация ещё не предлагается',
    (await page.locator('.tower-info .tower-aspects').count()) === 0,
  )
  await page.evaluate(() => (window.__throne.game.state.gold = 530))
  await waitForFrames(page)
  await page.getByRole('button', { name: /Улучшить/ }).click()
  await page.getByRole('button', { name: /Улучшить/ }).click()
  await waitForFrames(page)
  const aspects = page.locator('.tower-info .tower-aspects')
  check(
    'Баллиста III: два аспекта по 180, «Сокрушитель» включает генерала',
    (await aspects.locator('.aspect-option').count()) === 2 &&
      (await aspects.innerText()).includes('генералам мятежников'),
  )
  await aspects.getByRole('button', { name: 'Сокрушитель за 180 золота', exact: true }).click()
  await waitForFrames(page)
  check(
    'покупка аспекта: IV ступень, списано 180, только одна специализация',
    (await page.locator('.tower-info b').textContent()) === 'Баллиста IV' &&
      (await readGameSnapshot(page)).gold === 0 &&
      (await page.evaluate(() => window.__throne.game.towerAt(4, 9).aspectId)) === 'giant-slayer' &&
      (await aspects.locator('.aspect-option').count()) === 0,
  )
  await aspects.getByRole('button', { name: /Отменить аспект/ }).click()
  await waitForFrames(page)
  check(
    'отмена: снова III, возвращено 180 и можно выбрать другой аспект',
    (await page.locator('.tower-info b').textContent()) === 'Баллиста III' &&
      (await readGameSnapshot(page)).gold === 180,
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
  await clickCell(page, 4, 9)
  await aspects.getByRole('button', { name: 'Раскол лат за 180 золота', exact: true }).click()
  await waitForFrames(page)
  check(
    'во время волны можно купить «Раскол лат», он сразу закрепляется за Баллистой IV',
    (await page.locator('.tower-info b').textContent()) === 'Баллиста IV' &&
      (await aspects.innerText()).includes('на 4 с') &&
      (await aspects.locator('.aspect-hint').count()) === 0 &&
      (await aspects.getByRole('button', { name: /Отменить аспект/ }).count()) === 0 &&
      (await page.evaluate(() => {
        const tower = window.__throne.game.towerAt(4, 9)
        return tower.aspectId === 'armor-breaker' && tower.aspectLocked
      })),
  )

  // Два Огневика у входа получают разные аспекты через обычную панель.
  await page.evaluate(() => {
    const { store, game } = window.__throne
    store.newGame()
    game.state.gold = 900
    for (const col of [2, 4]) {
      game.build('mage', col, 9)
      game.upgrade(col, 9)
      game.upgrade(col, 9)
    }
    store.syncHud()
  })
  await clickCell(page, 2, 9)
  const oilOption = aspects.getByRole('button', { name: 'Кипящее масло за 150 золота' })
  check(
    'масло указывает верхнюю границу замедления',
    (await oilOption.innerText()).includes('до 20% замедления'),
  )
  await oilOption.click()
  await clickCell(page, 4, 9)
  await aspects.getByRole('button', { name: 'Дикий огонь за 150 золота' }).click()
  await waitForFrames(page)
  check(
    'Огневик IV показывает 84,46 урона за 2 с, обе специализации оплачены',
    (await readStatRows(page.locator('.tower-info'))).includes(
      'Урон от горения (за 2 сек) 84,46',
    ) && (await readGameSnapshot(page)).gold === 0,
  )
  await page.getByRole('button', { name: 'Начать волну' }).click()
  const oiledAndBurning = await page.evaluate(() => {
    const { game } = window.__throne
    game.setPaused(true)
    for (let i = 0; i < 600; i++) {
      game.step(1 / 60)
      if (
        game.state.oilPuddles.length &&
        game.state.enemies.some((e) => e.wildfire && e.oilTimeLeft > 0)
      )
        return true
    }
    return false
  })
  await waitForFrames(page)
  check('первые враги попадают в масляную лужу и загораются синим', oiledAndBurning)

  // Стрелки снимают выбор с плиты: цифра ставит стража под курсор, а не на старую плиту
  await page.evaluate(() => window.__throne.store.newGame())
  await clickCell(page, 5, 9) // выбрали пустую плиту
  await page.keyboard.press('ArrowUp') // курсор: из центра (3, 5) на (3, 4)
  await page.keyboard.press('1')
  await page.keyboard.press('Enter')
  await waitForFrames(page)
  snapshot = await readGameSnapshot(page)
  check(
    'стрелки снимают выбор с плиты',
    snapshot.towers.length === 1 && snapshot.towers[0] === 'archer0@3,4',
    JSON.stringify(snapshot.towers),
  )

  // Меню посреди боя: игра встаёт на паузу, из меню открываются настройки
  await page.getByRole('button', { name: 'Начать волну' }).click()
  await page.getByRole('button', { name: 'Меню' }).click()
  const pauseMenu = page.getByRole('dialog', { name: 'Пауза' })
  check(
    'меню открылось, бой на паузе',
    (await appears(pauseMenu)) && (await readGameSnapshot(page)).paused,
  )
  await pauseMenu.getByRole('button', { name: 'Настройки' }).click()
  const settingsDialog = page.getByRole('dialog', { name: 'Настройки' })
  snapshot = await readGameSnapshot(page)
  check(
    'настройки открылись из меню, бой на паузе',
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
    'Escape закрыл настройки и вернул в меню',
    (await settingsDialog.count()) === 0 &&
      (await pauseMenu.isVisible()) &&
      (await readGameSnapshot(page)).paused,
  )
  await page.keyboard.press('Escape')
  await waitForFrames(page)
  check('Escape закрыл меню, бой продолжился', !(await readGameSnapshot(page)).paused)

  // Пауза, поставленная игроком до настроек, после них остаётся
  await page.getByRole('button', { name: 'Пауза' }).click()
  await page.getByRole('button', { name: 'Меню' }).click()
  await page
    .getByRole('dialog', { name: 'Пауза' })
    .getByRole('button', { name: 'Настройки' })
    .click()
  await page.getByRole('button', { name: 'Готово' }).click()
  await waitForFrames(page)
  await page.keyboard.press('Escape')
  await waitForFrames(page)
  check('своя пауза игрока после меню и настроек осталась', (await readGameSnapshot(page)).paused)

  // Настройки и испорченный рекорд переживают перезагрузку
  await page.evaluate(() => localStorage.setItem('throne-best', '123'))
  await page.reload()
  await page.waitForFunction(() => document.querySelector('#app')?.children.length > 0)
  check('испорченный рекорд: меню на месте', await playButton.isVisible())
  // Кнопка меню под главным экраном тоже есть в разметке (выключена inert) — берём кнопку меню
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

  // Все девять карточек помещаются и на высоком экране, и на ноутбуке.
  await page.getByRole('button', { name: 'Играть' }).click()
  await waitForFrames(page)
  await checkShopCardsVisible(page)
  await page.setViewportSize({ width: 1366, height: 650 })
  await waitForFrames(page)
  await checkStartButtonVisible(page)
  await checkShopCardsVisible(page)

  // Сдаться можно только после подтверждения
  await page.getByRole('button', { name: 'Меню' }).click()
  await page.getByRole('dialog', { name: 'Пауза' }).getByRole('button', { name: 'Сдаться' }).click()
  check(
    'сдаться сначала просит подтверждение',
    await appears(page.getByRole('dialog', { name: 'Сдаться?' })),
  )
  await page.getByRole('button', { name: 'Отмена' }).click()
  check(
    'отмена сдачи возвращает в меню',
    await appears(page.getByRole('dialog', { name: 'Пауза' })),
  )
  await page.getByRole('button', { name: 'Сдаться' }).click()
  await page.getByRole('button', { name: 'Да, сдаться' }).click()
  await page.getByRole('heading', { name: 'Трон пал' }).waitFor({ timeout: 5000 })
  check(
    'подтверждённая сдача завершает партию',
    (await readGameSnapshot(page)).phase === 'lost' && (await readGameSnapshot(page)).lives === 0,
  )
}

/** Сервер недоступен: игра работает как раньше, просто без топа */
async function offline(page, url) {
  const playerName = 'Страж без сети'
  const score = 100
  // Браузер сам пишет в консоль о запросах, которые оборвала проверка.
  watchErrors(page, 'без сервера', /Failed to load resource/)
  await page.route('**/api/**', (route) => route.abort('connectionrefused'))
  // Имя уже есть: результат сразу пытается уйти на сервер
  await page.addInitScript((name) => localStorage.setItem('throne-name', name), playerName)
  await page.goto(url)
  await page.getByRole('button', { name: 'Играть' }).click()
  await page.getByRole('button', { name: 'Начать волну' }).click()
  await playWaveToEnd(page, { score, lives: 1 })
  await page.getByRole('heading', { name: 'Трон пал' }).waitFor({ timeout: 5000 })
  const retry = page.getByRole('button', { name: 'Отправить ещё раз' })
  check(
    'нет сервера: итоги на месте, результат можно отправить повторно',
    (await appears(page.locator('.run-place').filter({ hasText: 'недоступна' }))) &&
      (await retry.isVisible()),
  )
  const openRanking = page.getByRole('button', { name: 'Лучшие результаты' })
  const back = page.getByRole('button', { name: 'Назад', exact: true })
  const rankingPlaceholder = page.locator('.leaderboard-status').filter({
    hasText: 'Таблица лучших сейчас недоступна.',
  })
  await openRanking.click()
  check('нет сервера: в таблице лучших видна заглушка', await appears(rankingPlaceholder))
  await back.click()
  await page.unroute('**/api/**')
  await page.context().setOffline(true)
  await openRanking.click()
  check('нет интернета: в таблице лучших видна заглушка', await appears(rankingPlaceholder))
  await back.click()
  await page.context().setOffline(false)
  await retry.click()
  check(
    'после подключения повторная отправка сохраняет результат этой партии',
    await appears(page.locator('.run-place').filter({ hasText: `${playerName}, вы первым` })),
  )
  await openRanking.click()
  const playerRow = page.locator('.leaderboard li').filter({ hasText: playerName })
  check(
    'после подключения таблица показывает результат этой партии',
    (await appears(playerRow)) &&
      (await playerRow.locator('.leaderboard-score').innerText()) === String(score),
  )
  await back.click()
  await page.context().setOffline(true)
  await page.getByRole('button', { name: 'Сыграть ещё раз' }).click()
  await waitForFrames(page)
  check('нет интернета: новая партия начинается', (await readGameSnapshot(page)).phase === 'build')
}

async function phone(page, url) {
  watchErrors(page, 'телефон')
  await page.goto(url)
  await page.getByRole('button', { name: 'Играть' }).tap()
  await page.evaluate(() => document.fonts.ready)
  await waitForFrames(page)
  const layout = () =>
    page
      .locator('.hud, #board, .panel, .controls')
      .evaluateAll((items) =>
        JSON.stringify(items.map((item) => item.getBoundingClientRect().toJSON())),
      )
  const panelHeight = () =>
    page.evaluate(() => document.querySelector('.panel').getBoundingClientRect().height)
  const controls = page.locator('.controls')
  const panelButtons = () => page.locator('.panel').getByRole('button').allInnerTexts()
  const prompt = controls.locator('#placement-prompt')
  const promptFitsRow = () =>
    prompt.evaluate((el) => {
      const row = el.closest('.controls')
      const bounds = row.getBoundingClientRect()
      const text = el.getBoundingClientRect()
      const button = row.querySelector('button')
      return (
        el.getClientRects().length === 1 &&
        Math.abs(text.top + text.height / 2 - (bounds.top + bounds.height / 2)) <= 2 &&
        (!button || text.right <= button.getBoundingClientRect().left)
      )
    })
  const tapTile = async (col, row) => {
    const bounds = await page.locator('#board').boundingBox()
    await page.touchscreen.tap(
      bounds.x + ((col + 0.5) / COLS) * bounds.width,
      bounds.y + ((row + 0.5) / ROWS) * bounds.height,
    )
    await waitForFrames(page)
  }

  // Кнопка открывает список стражей с короткими подписями.
  const shopToggle = page.getByRole('button', { name: 'Выбрать стража' })
  check(
    'на телефоне вместо карточек кнопка «Выбрать стража»',
    (await shopToggle.isVisible()) && (await page.locator('.shop .card').first().isHidden()),
  )
  await shopToggle.tap()
  const drawer = page.getByRole('dialog', { name: 'Выбор стража' })
  check('кнопка открыла меню стражей', await drawer.isVisible())
  check(
    '390×844: все девять карточек в меню видны без прокрутки',
    (await drawer.locator('.drawer-card').count()) === 9 &&
      (await drawer
        .locator('.shop-drawer-list')
        .evaluate((list) => list.scrollHeight <= list.clientHeight + 1)),
  )
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
    'в меню выбора видны короткие роли Огневика и Колдуна',
    drawerText.includes('Поджигает врагов') &&
      drawerText.includes('Ослабляет врагов') &&
      !drawerText.includes('Поджигает цель') &&
      !drawerText.includes('Получаемое лечение'),
    drawerText.slice(0, 200),
  )
  check(
    'в карточках видны короткие описания стражей без радиуса',
    !/радиус/i.test(drawerText) &&
      (await drawer.getByText('Часто стреляет', { exact: true }).isVisible()) &&
      (await drawer.getByText('Ускоряет стрельбу на 20%', { exact: true }).isVisible()) &&
      (await drawer.getByText('Казны рядом повышают доход', { exact: true }).isVisible()),
  )
  await page.keyboard.press('Escape')
  await waitForFrames(page)
  check('Escape закрыл меню', (await page.getByRole('dialog').count()) === 0)
  await shopToggle.tap()
  await page.locator('.shop-drawer-backdrop').tap({ position: { x: 10, y: 10 } })
  check('нажатие мимо меню закрыло его', (await page.getByRole('dialog').count()) === 0)

  // Высота игровой области iPhone 12 при открытых панелях браузера.
  await page.setViewportSize({ width: 390, height: 664 })
  await waitForFrames(page)
  const idleLayout = await layout()
  const idlePanelHeight = await panelHeight()
  const finishLayoutCheck = await watchPhoneLayout(page)
  const waveButton = await page.getByRole('button', { name: 'Начать волну' }).boundingBox()
  check(
    '390×664: под полем одна строка обычных кнопок',
    (await panelButtons()).length === 5 &&
      (await page.locator('#hint').isHidden()) &&
      waveButton?.height >= 44 &&
      idlePanelHeight - waveButton.height <= 16,
  )

  // Фиксируем пламя канделябра до выбора стража, чтобы сравнить окружности на поле.
  await page.getByRole('button', { name: 'Пауза', exact: true }).tap()
  await waitForFrames(page)
  await shopToggle.tap()
  await drawer.getByRole('button', { name: /Огневик/ }).tap()
  check('выбор в меню закрыл его', (await page.getByRole('dialog').count()) === 0)
  const place = page.getByRole('button', { name: 'Да', exact: true })
  const cancel = page.getByRole('button', { name: 'Нет', exact: true })
  const placementDetails = page.locator('#placement-details')
  const tilePrompt = 'Выберите свободную плиту.'
  check(
    'после выбора стража инструкция занимает место кнопок, поле на месте',
    (await prompt.innerText()) === tilePrompt &&
      (await promptFitsRow()) &&
      (await panelButtons()).length === 0 &&
      (await layout()) === idleLayout,
  )
  const beforePlacement = await readGameSnapshot(page)
  // Выборка вдоль текущего и максимального радиусов Огневика, верхние полуокружности внутри поля.
  const rangeEdges = () =>
    page.locator('#board').evaluate((canvas, cols) => {
      const cell = canvas.width / cols
      const ctx = canvas.getContext('2d')
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      return [1.5, 1.9].map((radius) =>
        Array.from({ length: 96 }, (_, i) => {
          const angle = Math.PI + (Math.PI * i) / 95
          const x = Math.floor((4.5 + Math.cos(angle) * radius) * cell)
          const y = Math.floor((9.5 + Math.sin(angle) * radius) * cell)
          return pixels[(y * canvas.width + x) * 4]
        }),
      )
    }, COLS)
  const emptyEdges = await rangeEdges()
  await tapTile(5, 9)
  await tapTile(3, 9)
  check(
    'касание ковра возвращает к выбору плиты',
    (await prompt.innerText()) === tilePrompt && (await panelButtons()).length === 0,
  )
  await tapTile(4, 9)
  await tapTile(4, 9)
  const preview = await readGameSnapshot(page)
  const previewEdges = await rangeEdges()
  const detailsBox = await placementDetails.boundingBox()
  const yesBox = await place.boundingBox()
  const noBox = await cancel.boundingBox()
  check(
    'вопрос о покупке и кнопки «Да» и «Нет» помещаются в ту же строку',
    (await prompt.innerText()) === 'Поставить стража?' &&
      (await promptFitsRow()) &&
      (await panelButtons()).join(' ') === 'Да Нет' &&
      yesBox !== null &&
      noBox !== null &&
      Math.abs(yesBox.width - noBox.width) < 1 &&
      detailsBox?.width === 1 &&
      detailsBox.height === 1 &&
      (await placementDetails.textContent()).includes('Огневик') &&
      (await placementDetails.textContent()).includes('Цена 90 золота'),
  )
  check(
    'после отпускания пальца видны текущий и максимальный радиусы',
    previewEdges.every((ring, i) => ring.some((pixel, j) => pixel - emptyEdges[i][j] > 12)),
  )
  check(
    'повторное касание сохраняет предпросмотр без траты золота',
    (await place.isEnabled()) &&
      preview.towers.length === 0 &&
      preview.gold === beforePlacement.gold &&
      (await cancel.isVisible()) &&
      (await layout()) === idleLayout &&
      (await placementDetails.textContent()).includes('Столбец 5, ряд 10'),
  )
  await place.tap()
  await waitForFrames(page)
  const built = await readGameSnapshot(page)
  check(
    'подтверждение ставит одного Огневика на последнюю выбранную плиту за 90',
    built.towers.join() === 'mage0@4,9' &&
      built.gold === beforePlacement.gold - 90 &&
      (await layout()) === idleLayout,
  )
  check(
    'после постройки страж убран из руки, кнопка снова «Выбрать стража»',
    (await shopToggle.isVisible()) &&
      (await page.locator('.controls').getByRole('button').count()) === 5,
  )
  // Выбранная башня: панели башни внизу нет (она в меню), высота панели та же, поле не прыгает
  await tapTile(4, 9)
  await waitForFrames(page)
  const builtEdges = await rangeEdges()
  check(
    'у построенного Огневика обе окружности совпадают с предпросмотром',
    builtEdges.every((ring, i) => ring.every((pixel, j) => pixel === previewEdges[i][j])),
    JSON.stringify(
      builtEdges.map((ring, i) =>
        ring.flatMap((v, j) => (v === previewEdges[i][j] ? [] : [[j, previewEdges[i][j], v]])),
      ),
    ),
  )
  check('панель башни на телефоне внизу скрыта', await page.locator('.tower-info').isHidden())
  check(
    'выбор башни не меняет высоту панели',
    Math.abs((await panelHeight()) - idlePanelHeight) < 1,
    `${idlePanelHeight} → ${await panelHeight()}`,
  )
  const towerMenu = page.getByRole('dialog', { name: /Башня: Огневик/ })
  check('нажатие на башню сразу открыло её меню', await towerMenu.isVisible())
  // Так ведёт себя Safari на iPhone: «щелчок» от того же касания приходит уже в затемнение
  // под пальцем. Он не должен закрывать только что открытое меню
  await page.locator('.tower-drawer .shop-drawer-backdrop').dispatchEvent('click')
  await waitForFrames(page)
  check('«щелчок» от касания, открывшего меню, его не закрыл', await towerMenu.isVisible())
  check(
    'кнопки «Действие» нет: слева по-прежнему «Стражи»',
    (await page.getByRole('button', { name: 'Действия с башней' }).count()) === 0 &&
      (await page.locator('.shop-toggle .shop-toggle-label').innerText()) === 'Стражи',
  )
  const towerMenuText = await towerMenu.innerText()
  const mageStats = await readStatRows(towerMenu)
  check(
    'карточка Огневика показывает описание, урон за 5 с, скорость и дальность атаки',
    (await towerMenu.locator('.tower-description').innerText()) ===
      'Поджигает цель и врагов рядом с ней. Горение игнорирует броню.' &&
      mageStats ===
        'Урон от горения (за 5 сек) 18,36 / 44,88 | Скорость атаки 0,83 атак/с / 0,91 атак/с | Дальность атаки 1,5 клетки / 1,7 клетки' &&
      (await towerMenu.locator('.tower-stat-next svg').count()) === 3 &&
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
  await page.getByRole('button', { name: 'Продолжить', exact: true }).tap()
  // Снова нажали на башню — меню снова открыто; нажали мимо меню — закрыто и без выбора.
  // Башня внизу поля, поэтому меню наверху, а левый нижний угол экрана — мимо него
  const tapTower = () => tapTile(4, 9)
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
  await finishLayoutCheck(
    '390×664: магазин, покупка и меню башни сохраняют размеры и положение панели и поля в каждом кадре',
  )
  await page.setViewportSize({ width: 320, height: 568 }) // самый узкий телефон
  await waitForFrames(page)
  await checkStartButtonVisible(page)
  await checkControlsFit(page)
  await checkShopCardsVisible(page)
  // На узком телефоне обе карточки аспекта доступны в прокручиваемом меню.
  await page.evaluate(() => {
    const { game } = window.__throne
    game.state.gold = 1000
    game.build('ballista', 4, 9)
    game.upgrade(4, 9)
    game.upgrade(4, 9)
  })
  await clickCell(page, 4, 9)
  const aspectMenu = page.getByRole('dialog', { name: 'Башня: Баллиста III', exact: true })
  check(
    '320×568: обе специализации есть в меню башни',
    (await aspectMenu.locator('.aspect-option').count()) === 2,
  )
  await aspectMenu.getByRole('button', { name: 'Раскол лат за 180 золота', exact: true }).tap()
  await waitForFrames(page)
  const specializedMenu = page.getByRole('dialog', { name: 'Башня: Баллиста IV', exact: true })
  check(
    '320×568: аспект покупается касанием, текст не выходит за ширину меню',
    (await specializedMenu.isVisible()) &&
      (await specializedMenu.evaluate((element) => element.scrollWidth <= element.clientWidth)),
  )
  await specializedMenu.getByRole('button', { name: /Отменить аспект/ }).tap()
  await aspectMenu.getByRole('button', { name: /Вернуть/ }).tap()
  await waitForFrames(page)
  const phoneGoldBeforeBell = await page.evaluate(() => {
    const { game } = window.__throne
    const gold = game.state.gold
    game.state.gold += 500
    game.build('archer', 4, 9)
    return gold
  })
  await shopToggle.tap()
  await drawer.getByRole('button', { name: /Звонарь/ }).tap()
  await page.setViewportSize({ width: 667, height: 375 })
  await waitForFrames(page)
  check(
    'на повёрнутом телефоне инструкция тоже занимает строку кнопок',
    (await prompt.innerText()) === tilePrompt &&
      (await promptFitsRow()) &&
      (await panelButtons()).length === 0 &&
      (await page.locator('.shop').isHidden()),
  )
  await page.setViewportSize({ width: 320, height: 568 })
  await waitForFrames(page)
  await tapTile(0, 1)
  check(
    'описание Звонаря для экранного диктора сообщает о пустой зоне',
    (await placementDetails.textContent()).includes('нет стражей'),
  )
  await tapTile(5, 9)
  check(
    'перенос к Лучнику показывает получателя и реальное усиление',
    (await placementDetails.textContent()).includes('Лучник будет стрелять на 20% чаще') &&
      (await readGameSnapshot(page)).towers.length === 1,
  )
  await checkControlsFit(page)
  await page.setViewportSize({ width: 667, height: 375 })
  await waitForFrames(page)
  await checkControlsFit(page)
  check(
    'после поворота телефона выбранная плита и усиление сохраняются',
    (await place.isEnabled()) &&
      (await panelButtons()).join(' ') === 'Да Нет' &&
      (await placementDetails.textContent()).includes('Лучник будет стрелять на 20% чаще'),
  )
  await page.setViewportSize({ width: 320, height: 568 })
  await waitForFrames(page)
  await place.tap()
  await tapTile(5, 9)
  const bellMenu = page.getByRole('dialog', { name: 'Башня: Звонарь I', exact: true })
  check(
    '320×568: меню Звонаря показывает получателей и правило сильнейшего бонуса',
    (await bellMenu.innerText()).includes('Ускоряет 1 башню · Лучник') &&
      (await bellMenu.locator('.tower-description').innerText()).includes(
        'действует сильнейший бонус',
      ),
  )
  await page.keyboard.press('Escape')
  const beforeCancel = await readGameSnapshot(page)
  const narrowLayout = await layout()
  await shopToggle.tap()
  await drawer.getByRole('button', { name: /Лучник/ }).tap()
  await tapTile(4, 8)
  check(
    '320×568: вопрос и обе кнопки помещаются в одну строку',
    (await promptFitsRow()) && (await panelButtons()).join(' ') === 'Да Нет',
  )
  check(
    'будущий получатель видит ускорение от построенного Звонаря',
    (await placementDetails.textContent()).includes('получит +20% к скорострельности') &&
      (await layout()) === narrowLayout,
  )
  await tapTile(0, 1)
  check(
    'за пределами ауры исчезает обещание ускорения',
    (await placementDetails.textContent()).includes('вне зоны ускорения'),
  )
  await cancel.tap()
  const afterCancel = await readGameSnapshot(page)
  check(
    'отмена убирает предпросмотр и сохраняет золото и стражей',
    (await place.isHidden()) &&
      (await shopToggle.isVisible()) &&
      (await page.locator('.controls').getByRole('button').count()) === 5 &&
      (await layout()) === narrowLayout &&
      afterCancel.gold === beforeCancel.gold &&
      afterCancel.towers.join() === beforeCancel.towers.join(),
  )
  await page.evaluate(() => window.__throne.game.build('treasury', 0, 0))
  await shopToggle.press('Enter')
  await drawer.getByRole('button', { name: /Казна/ }).press('Enter')
  check(
    'после выбора с клавиатуры фокус на поле',
    await page.locator('#board').evaluate((board) => document.activeElement === board),
  )
  await tapTile(2, 1)
  await page.keyboard.press('ArrowLeft')
  check(
    'стрелка переносит Казну в предпросмотре по диагонали от соседа',
    (await placementDetails.textContent()).includes('+10% к доходу этой Казны') &&
      !(await readGameSnapshot(page)).towers.includes('treasury0@1,1'),
  )
  await page.keyboard.press('Enter')
  check(
    'Enter строит на проверенной с клавиатуры плите',
    (await readGameSnapshot(page)).towers.includes('treasury0@1,1'),
  )
  await page.evaluate((gold) => {
    const { game } = window.__throne
    game.sell(0, 0)
    game.sell(1, 1)
    game.sell(4, 9)
    game.sell(5, 9)
    game.state.gold = gold
  }, phoneGoldBeforeBell)
  await waitForFrames(page)

  const phoneBlessings = page.locator('.hud-reward-toggle')
  const phoneRewardSheet = page.getByRole('dialog', { name: 'Благословения', exact: true })
  const phoneBoard = page.locator('#board')
  const samePhoneLayout = async () => (await layout()) === narrowLayout
  check('320×568: до первой награды счётчик скрыт', !(await phoneBlessings.isVisible()))

  await page.getByRole('button', { name: 'Начать волну' }).tap()
  await page.evaluate(() => {
    window.__throne.game.state.gold = 339
  })
  await shopToggle.tap()
  const cannon = drawer.getByRole('button', { name: /^Пушкарь,/ })
  const priceColor = () =>
    cannon.locator('.drawer-card-cost').evaluate((el) => getComputedStyle(el).color)
  const lastCard = drawer.getByRole('button').last()
  await lastCard.focus()
  const shopLayout = () =>
    drawer.evaluate((menu) => {
      const list = menu.querySelector('.shop-drawer-list')
      return JSON.stringify([
        menu.offsetTop,
        menu.offsetHeight,
        list.scrollTop,
        list.scrollHeight,
        Array.from(list.children, (card) => [card.offsetTop, card.offsetHeight]),
      ])
    })
  const layoutBeforeGold = await shopLayout()
  check(
    'в бою при 339 золота цена Пушкаря серая, отдельной строки о нехватке нет',
    (await priceColor()) === 'rgb(183, 175, 157)' &&
      (await cannon.getAttribute('aria-label')) === 'Пушкарь, цена 340, недостаточно золота' &&
      !/не хватает/i.test(await drawer.innerText()),
  )
  await page.evaluate(() => {
    window.__throne.game.state.gold += 1
  })
  await waitForFrames(page)
  check(
    'при 340 золота цена снова золотая, карточки, прокрутка и фокус на месте',
    (await priceColor()) === 'rgb(227, 178, 74)' &&
      (await cannon.getAttribute('aria-label')) === 'Пушкарь, цена 340' &&
      (await shopLayout()) === layoutBeforeGold &&
      (await lastCard.evaluate((card) => document.activeElement === card)),
  )
  await page.keyboard.press('Escape')

  // На узком экране три карточки выбора идут столбиком и не выходят по ширине.
  await finishRewardWave(page, 10, 8)
  const phoneRewardCards = page.locator('.reward-card')
  const warChest = phoneRewardCards.filter({ hasText: 'Военная казна' })
  const phoneRewardBounds = await phoneRewardCards.evaluateAll((cards) =>
    cards.map((card) => {
      const { left, right, top, bottom } = card.getBoundingClientRect()
      return { left, right, top, bottom }
    }),
  )
  check(
    '320×568: три благословения целиком помещаются на экране',
    phoneRewardBounds.length === 3 &&
      phoneRewardBounds.every(
        ({ left, right, top, bottom }) => left >= 0 && right <= 320 && top >= 0 && bottom <= 568,
      ),
    JSON.stringify(phoneRewardBounds),
  )
  await page.evaluate(() => {
    const { game, store } = window.__throne
    game.state.gold = 79
    store.syncHud()
  })
  const phoneReroll = page.getByRole('button', { name: /Обновить варианты/ })
  const phonePrice = phoneReroll.locator('.reward-reroll-cost')
  check(
    '320×568: при нехватке золота цена −80 красная, обновление недоступно',
    (await phoneReroll.isDisabled()) &&
      (await phonePrice.innerText()).trim() === '−80' &&
      (await phonePrice.evaluate((price) => getComputedStyle(price).color)) ===
        'rgb(255, 120, 130)' &&
      !(await page.locator('.reward-sheet').innerText()).match(/В запасе|Не хватает/),
  )
  check(
    '320×568: на карточке Казны после 10-й волны видно 200 золота',
    (await warChest.locator('.reward-description').innerText()) === '+200 золота сразу',
  )
  await warChest.tap()
  await waitForFrames(page)
  check(
    '320×568: благословение выбирается касанием',
    (await page.locator('.overlay').count()) === 0 &&
      (await readGameSnapshot(page)).rewards.length === 1,
  )
  const counterBounds = await phoneBlessings.boundingBox()
  const goldBounds = await page.locator('.hud-stats .stat').nth(1).boundingBox()
  check(
    '320×568: первая награда добавляет кнопку 44×44 рядом с золотом, поле остаётся на месте',
    counterBounds?.width >= 44 &&
      counterBounds?.height >= 44 &&
      counterBounds.x >= goldBounds.x + goldBounds.width &&
      counterBounds.x + counterBounds.width <= 320 &&
      (await phoneBlessings.getAttribute('aria-label')) === 'Благословения, получено 1' &&
      (await page.locator('.reward-inventory').isHidden()) &&
      (await samePhoneLayout()),
  )
  await phoneBlessings.tap()
  check(
    '320×568: тап открывает панель поверх поля с эффектом и прогрессом 1 из 3',
    (await phoneRewardSheet.isVisible()) &&
      (await phoneRewardSheet.locator('.reward-description').innerText()) ===
        'Получено 200 золота' &&
      (await phoneRewardSheet.locator('.reward-set-title').innerText()) === 'Набор «Дар короны»' &&
      (await phoneRewardSheet.locator('.reward-set-status').innerText()) === 'Собрано 1 из 3' &&
      (await page.locator('.stage').evaluate((stage) => stage.inert)) &&
      (await samePhoneLayout()),
  )
  await phoneRewardSheet.getByRole('button', { name: 'Закрыть' }).tap()
  check('320×568: крестик закрывает панель благословений', !(await phoneRewardSheet.isVisible()))

  // Safari может прислать click с pointerType mouse от обычного касания.
  await phoneBlessings.evaluate((button) => {
    button.dispatchEvent(
      new PointerEvent('click', { bubbles: true, pointerType: 'mouse', detail: 1 }),
    )
  })
  check('320×568: click типа mouse также открывает панель', await phoneRewardSheet.isVisible())
  await page.locator('.reward-drawer .shop-drawer-backdrop').tap({ position: { x: 10, y: 10 } })
  check('320×568: касание затемнения закрывает панель', !(await phoneRewardSheet.isVisible()))

  await phoneBlessings.press('Enter')
  await page.keyboard.press('1')
  let focusStayedInRewards = true
  for (const key of ['Tab', 'Tab', 'Tab', 'Shift+Tab']) {
    await page.keyboard.press(key)
    focusStayedInRewards &&= await phoneRewardSheet.evaluate((sheet) =>
      sheet.contains(document.activeElement),
    )
  }
  check(
    '320×568: Tab остаётся в панели, горячая клавиша не выбирает стража под ней',
    focusStayedInRewards &&
      (await page.evaluate(() => window.__throne.selection.armedTowerId)) === null,
  )
  await page.keyboard.press('Escape')
  await waitForFrames(page)
  check(
    '320×568: Escape закрывает панель и возвращает фокус на счётчик',
    !(await phoneRewardSheet.isVisible()) &&
      (await phoneBlessings.evaluate((button) => document.activeElement === button)),
  )

  await finishRewardWave(page, 15, 7)
  const royalTax = phoneRewardCards.filter({ hasText: 'Военный налог' })
  check(
    '320×568: вторая карта «Дара короны» показывает прогресс 2 из 3',
    (await royalTax.locator('.reward-set-status').innerText()) === 'После выбора 2 из 3',
  )
  await royalTax.tap()
  check(
    '320×568: после второй карты подарка ещё нет',
    (await readGameSnapshot(page)).phase === 'build',
  )

  await page.evaluate(() => {
    const { game } = window.__throne
    game.build('treasury', 4, 9)
    game.build('treasury', 5, 9)
    game.upgrade(4, 9)
    game.startWave()
  })
  await finishRewardWave(page, 20, 30)
  const beforeGift = await readGameSnapshot(page)
  const engineer = phoneRewardCards.filter({ hasText: 'Военный инженер' })
  check(
    '320×568: «Военный инженер» показывает скидку на улучшения и аспекты и собирает набор',
    (await warChest.count()) === 0 &&
      (await engineer.getAttribute('data-rarity')) === 'legendary' &&
      (await engineer.locator('.reward-description').innerText()).includes(
        '30% на улучшения и аспекты',
      ) &&
      (await engineer.locator('.reward-set-ready .reward-set-status').innerText()) ===
        'Откроет бонус' &&
      (await engineer.locator('img').evaluate((icon) => icon.complete && icon.naturalWidth > 0)),
  )
  await engineer.tap()
  const gift = page.getByRole('dialog', { name: 'Дар короны', exact: true })
  await gift.waitFor()
  const giftCards = gift.locator('.reward-card')
  const duringGift = await readGameSnapshot(page)
  const giftCardsFit = await giftCards.evaluateAll((cards) =>
    cards.every((card) => {
      const { left, right, top, bottom } = card.getBoundingClientRect()
      return left >= 0 && right <= innerWidth && top >= 0 && bottom <= innerHeight
    }),
  )
  check(
    '320×568: «Дар короны» предлагает три обычные карты, поле выключено',
    (await giftCards.count()) === 3 &&
      (await gift.getAttribute('aria-describedby')) === 'reward-caption' &&
      (await gift.locator('#reward-caption').innerText()) ===
        'Выберите одно обычное благословение.' &&
      (await warChest.count()) === 0 &&
      (await giftCards.evaluateAll((cards) =>
        cards.every((card) => card.dataset.rarity === 'common'),
      )) &&
      giftCardsFit &&
      (await gift.locator('.reward-reroll').count()) === 0 &&
      (await page.locator('.stage').evaluate((stage) => stage.inert)) &&
      duringGift.gold === beforeGift.gold,
  )
  const buybackCard = giftCards.filter({ hasText: 'Выкуп' })
  check(
    '320×568: карточка «Выкуп» показывает возврат 100% между волнами',
    (await buybackCard.locator('.reward-description').innerText()).includes('100%') &&
      (await buybackCard.locator('img').evaluate((icon) => icon.complete && icon.naturalWidth > 0)),
  )
  await buybackCard.tap()
  const afterGift = await readGameSnapshot(page)
  check(
    '320×568: «Выкуп» из дара возвращает к подготовке 21-й волны',
    (await gift.count()) === 0 &&
      afterGift.phase === 'build' &&
      afterGift.wave === 21 &&
      new Set(afterGift.rewards).size === 4 &&
      afterGift.rewards.includes('buyback') &&
      afterGift.gold === duringGift.gold,
  )
  await phoneBlessings.tap()
  const chestEntry = phoneRewardSheet
    .locator('.reward-drawer-entry')
    .filter({ hasText: 'Военная казна' })
  const engineerEntry = phoneRewardSheet
    .locator('.reward-drawer-entry')
    .filter({ hasText: 'Военный инженер' })
  const crownSet = phoneRewardSheet.locator('.reward-set').filter({ hasText: 'Дар короны' })
  check(
    '320×568: счётчик показывает четыре карты, набор «Дар короны» собран',
    (await phoneBlessings.getAttribute('aria-label')) === 'Благословения, получено 4' &&
      (await phoneRewardSheet.locator('.reward-drawer-entry').count()) === 4 &&
      (await chestEntry.locator('.reward-description').innerText()) === 'Получено 200 золота' &&
      (await engineerEntry.locator('.reward-description').innerText()) ===
        '−30% к цене улучшений и аспектов' &&
      (await crownSet.locator('.reward-set-status').innerText()) === 'Собрано 3 из 3',
  )
  await phoneRewardSheet.getByRole('button', { name: 'Закрыть' }).tap()
  const boundsWithTreasury = await phoneBoard.boundingBox()
  await page.touchscreen.tap(
    boundsWithTreasury.x + (4.5 / COLS) * boundsWithTreasury.width,
    boundsWithTreasury.y + (9.5 / ROWS) * boundsWithTreasury.height,
  )
  const treasuryMenu = page.getByRole('dialog', { name: 'Башня: Казна II', exact: true })
  const sellTreasury = treasuryMenu.getByRole('button', { name: /Продать/ })
  const sellText = await sellTreasury.innerText()
  const goldBeforeSale = (await readGameSnapshot(page)).gold
  await sellTreasury.tap()
  check(
    '320×568: «Выкуп» показывает и возвращает все 150 золота за Казну II',
    sellText.includes('150') && (await readGameSnapshot(page)).gold === goldBeforeSale + 150,
  )
  await treasuryMenu.waitFor({ state: 'hidden', timeout: 5000 })

  await page.evaluate(() => {
    const { game, store } = window.__throne
    if (!game.build('archer', 4, 9) || !game.upgrade(4, 9)) {
      throw new Error('Не удалось подготовить Лучника II для проверки скидки')
    }
    game.state.gold = 140
    store.syncHud()
  })
  await tapTile(4, 9)
  await page.getByRole('button', { name: 'Улучшить за 56', exact: true }).tap()
  check(
    '320×568: с «Военным инженером» улучшение Лучника до III стоит 56',
    (await readGameSnapshot(page)).gold === 84,
  )
  const discountedArcher = page.getByRole('dialog', { name: 'Башня: Лучник III', exact: true })
  await discountedArcher.waitFor({ timeout: 5000 })
  await discountedArcher
    .getByRole('button', { name: 'Рикошет за 84 золота', exact: true })
    .tap({ timeout: 5000 })
  const undoDiscounted = page
    .getByRole('dialog', { name: 'Башня: Лучник IV', exact: true })
    .getByRole('button', { name: 'Отменить аспект — вернуть 84', exact: true })
  const paidAspect = (await readGameSnapshot(page)).gold === 0
  await undoDiscounted.tap({ timeout: 5000 })
  check(
    '320×568: «Рикошет» со скидкой стоит 84, при отмене возвращаются те же 84',
    paidAspect && (await readGameSnapshot(page)).gold === 84,
  )
  await page.keyboard.press('Escape')

  // Максимум за кампанию — шесть рубежей и «Дар короны». Заполняем инвентарь для проверки размеров.
  await page.evaluate(() => {
    const { game } = window.__throne
    Object.assign(game.state, {
      wave: 30,
      phase: 'reward',
      pendingReward: { kind: 'wave', wave: 29, options: ['rapid-orders'], rerolls: 0 },
      selectedRewards: [
        { wave: 5, rewardId: 'war-chest' },
        { wave: 10, rewardId: 'bounty' },
        { wave: 15, rewardId: 'royal-tax' },
        { wave: 15, rewardId: 'control-master' },
        { wave: 20, rewardId: 'sharpened-steel' },
        { wave: 25, rewardId: 'wildfire' },
      ],
    })
    game.chooseReward('rapid-orders')
  })
  await waitForFrames(page)
  await tapTile(4, 9)
  const blessedDamage = discountedArcher.locator('[data-stat="damage"]')
  const blessedRate = discountedArcher.locator('[data-stat="attackRate"]')
  const initialStats = await discountedArcher.innerText()
  await blessedDamage.getByRole('button').tap()
  const damageBonuses = await blessedDamage.locator('.tower-stat-bonus').innerText()
  await blessedRate.getByRole('button').tap()
  check(
    '320×568: карточка Лучника III показывает силу набора и скорость от благословения, поле на месте',
    (await blessedDamage.getByRole('button').innerText()) === '25,27' &&
      !initialStats.includes('Без усилений') &&
      !initialStats.includes('Гнев стражи') &&
      damageBonuses.includes('Заточенные клинки +18%') &&
      damageBonuses.includes('Гнев стражи +15%') &&
      (await blessedDamage.getByRole('button').getAttribute('aria-expanded')) === 'false' &&
      (await blessedRate.locator('.tower-stat-bonus').innerText()) === 'Быстрые приказы +15%' &&
      !(await discountedArcher.getByRole('columnheader').count()) &&
      (await samePhoneLayout()),
    initialStats,
  )
  await discountedArcher.getByRole('button', { name: 'Закрыть' }).tap()
  await phoneBlessings.tap()
  check(
    '320×568: все семь наград в прокручиваемой панели, размер и место поля сохраняются',
    (await phoneBlessings.getAttribute('aria-label')) === 'Благословения, получено 7' &&
      (await phoneRewardSheet.locator('.reward-drawer-entry').count()) === 7 &&
      (await phoneRewardSheet.getByRole('region').evaluate((list) => {
        list.scrollTop = list.scrollHeight
        return list.scrollTop > 0
      })) &&
      (await samePhoneLayout()),
  )
  await phoneRewardSheet.getByRole('button', { name: 'Закрыть' }).tap()
  await checkStartButtonVisible(page)

  await page.setViewportSize({ width: 932, height: 430 }) // iPhone Plus/Max набок
  await waitForFrames(page)
  await checkStartButtonVisible(page)
  await checkShopCardsVisible(page)
  await page.setViewportSize({ width: 667, height: 375 }) // небольшой телефон набок
  await waitForFrames(page)
  await checkStartButtonVisible(page)
  await checkControlsFit(page)
  await checkShopCardsVisible(page)
  check(
    '667×375: на сенсорном экране набок остаётся счётчик вместо ряда значков',
    (await phoneBlessings.isVisible()) && (await page.locator('.reward-inventory').isHidden()),
  )
  await phoneBlessings.tap()
  check('667×375: счётчик открывает нижнюю панель', await phoneRewardSheet.isVisible())
  await phoneRewardSheet.getByRole('button', { name: 'Закрыть' }).tap()
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

  for (const [width, height, fontPercent] of [
    [320, 568, 200],
    [390, 664, 150],
  ]) {
    await page.setViewportSize({ width, height })
    await page.goto(url)
    await page.addStyleTag({
      content: `html { font-size: ${fontPercent}% } body { font-size: 1rem }`,
    })
    await page.getByRole('button', { name: 'Играть', exact: true }).tap()
    await page.evaluate(() => document.fonts.ready)
    await waitForFrames(page)
    const finishLargeTextCheck = await watchPhoneLayout(page)
    await checkControlsFit(page)
    await shopToggle.tap()
    await drawer.getByRole('button', { name: /Лучник/ }).tap()
    await tapTile(4, 9)
    await checkControlsFit(page)
    await cancel.tap()
    await page.getByRole('button', { name: 'Начать волну' }).tap()
    await page.getByRole('button', { name: /Скорость игры/ }).tap()
    await page.getByRole('button', { name: 'Пауза', exact: true }).tap()
    await page.getByRole('button', { name: 'Меню', exact: true }).tap()
    await page.getByRole('button', { name: 'Настройки', exact: true }).tap()
    await page.getByRole('button', { name: 'Готово', exact: true }).tap()
    await page
      .getByRole('dialog', { name: 'Пауза' })
      .getByRole('button', { name: 'Продолжить' })
      .tap()
    await page.evaluate(() => {
      const { game, store } = window.__throne
      Object.assign(game.state, { wave: 30, gold: 18750 })
      store.syncHud()
    })
    await waitForFrames(page)
    await finishLargeTextCheck(
      `${width}×${height}, шрифт ${fontPercent}%: размещение, бой, пауза и настройки сохраняют исходную раскладку`,
    )
  }
}

const scenarios = [
  { name: 'desktop', title: 'Компьютер', run: desktop },
  {
    name: 'phone',
    title: 'Телефон',
    run: phone,
    pageOptions: {
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    },
  },
  { name: 'offline', title: 'Без сервера и интернета', run: offline },
]

async function runScenario(browser, scenario) {
  console.log(`\n${scenario.title}`)
  await withResources(async (cleanup) => {
    const api = await startApi()
    cleanup(() => api.stop())
    const server = await preview({
      root,
      logLevel: 'silent',
      preview: { port: 0, proxy: { '/api': api.address } },
    })
    cleanup(() => server.close())
    // Фиксированный зал: проверки ставят башни на конкретные клетки.
    const url = `${server.resolvedUrls.local[0]}?debug&level=throne-hall`
    const page = await browser.newPage({
      viewport: { width: 1280, height: 860 },
      ...scenario.pageOptions,
    })
    cleanup(() => page.close())
    console.log(`Проверяю ${url}`)
    await scenario.run(page, url)
  })
}

try {
  const args = process.argv.slice(2)
  const selected = args.length ? scenarios.filter(({ name }) => name === args[0]) : scenarios
  if (args.length > 1 || selected.length === 0) {
    throw new Error(`Укажи один сценарий из списка ${scenarios.map(({ name }) => name).join(', ')}`)
  }
  await withResources(async (cleanup) => {
    const browser = await launchBrowser()
    cleanup(() => browser.close())
    for (const scenario of selected) {
      try {
        await runScenario(browser, scenario)
      } catch (error) {
        failed++
        console.error(`Сценарий ${scenario.name} прервался: ${error.message}`)
      }
    }
    console.log('\nКонсоль браузера')
    check('нет ошибок', errors.length === 0, errors.join('\n'))
  })
} catch (error) {
  console.error('\nПроверка прервалась:', error.message)
  failed++
}

console.log(failed ? `\n✗ Не прошло проверок: ${failed}` : '\n✓ Все проверки прошли')
process.exitCode = failed ? 1 : 0
