// npm run e2e — проверка собранной игры в настоящем браузере (Chrome без окна).
//
// Сам поднимает `vite preview` с папкой dist (её собирает `npm run build`),
// открывает игру с ?debug и проходит её как игрок: меню, постройка мышью, касанием и
// с клавиатуры, улучшение, продажа, волна, пауза, поражение, рекорд, победа, телефон.
// Состояние игры читает через window.__throne (доступен только с ?debug).
//
// Нужен установленный Google Chrome. Если его нет: `npx playwright install chromium`.

import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { preview } from 'vite'

const root = fileURLToPath(new URL('..', import.meta.url))
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
        'Не найден браузер. Установи Google Chrome или выполни: npx playwright install chromium',
      )
      process.exit(1)
    }
  }
}

function watchErrors(page, label) {
  page.on('console', (m) => m.type() === 'error' && errors.push(`${label}: ${m.text()}`))
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`))
}

/** Состояние игры коротко */
const state = (page) =>
  page.evaluate(() => {
    const s = window.__throne.game.state
    return {
      phase: s.phase,
      wave: s.wave,
      gold: s.gold,
      lives: s.lives,
      paused: s.paused,
      time: s.time,
      towers: s.towers.map((t) => `${t.def.id}${t.lv}@${t.c},${t.r}`),
    }
  })

/** Дождаться, пока Vue обновит экран (пара кадров) */
const frames = (page) =>
  page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))

/**
 * Снять фокус с кнопки. Пробел на кнопке по задумке нажимает саму кнопку,
 * а нам нужно, чтобы он дошёл до игры. (body.focus() не помогает: body не фокусируется.)
 */
const blur = (page) => page.evaluate(() => document.activeElement?.blur())

/** Нажать на клетку поля */
async function clickTile(page, c, r) {
  const box = await page.locator('#board').boundingBox()
  await page.mouse.click(box.x + ((c + 0.5) / 9) * box.width, box.y + ((r + 0.5) / 13) * box.height)
  await frames(page)
}

async function desktop(browser, url) {
  console.log('\nКомпьютер')
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } })
  watchErrors(page, 'компьютер')
  const play = page.getByRole('button', { name: 'Играть' })

  await page.goto(url)
  await play.waitFor()
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

  await play.click()
  await frames(page)
  check('меню закрылось', (await page.locator('.overlay').count()) === 0)
  check(
    'подсказка для новичка',
    (await page.locator('#hint').textContent()) === 'Выберите стража и нажмите на плиту у ковра',
  )

  // Постройка мышью
  const archerCard = page.getByRole('button', { name: /Лучник/ })
  await archerCard.click()
  check('карточка в магазине нажата', (await archerCard.getAttribute('aria-pressed')) === 'true')
  await clickTile(page, 5, 11)
  await clickTile(page, 2, 9)
  let s = await state(page)
  check('две башни, осталось 50 золота', s.towers.length === 2 && s.gold === 50, JSON.stringify(s))

  // Выбор, улучшение, продажа
  await page.keyboard.press('Escape')
  await clickTile(page, 5, 11)
  check('панель башни', (await page.locator('.towerbox b').textContent()) === 'Лучник I')
  const stats = (await page.locator('.towerbox .who span').allTextContents()).join(' | ')
  check('характеристики в панели', stats === 'урон 9 → 15 | дальность 2,3 → 2,5', stats)
  await page.getByRole('button', { name: /Улучшить/ }).click()
  await frames(page)
  s = await state(page)
  check('улучшение', s.gold === 5 && s.towers.includes('archer1@5,11'), JSON.stringify(s))
  await page.getByRole('button', { name: /Улучшить/ }).click()
  await frames(page)
  check(
    'тост «не хватает золота»',
    !!(await page.locator('.toast.on').textContent())?.includes('Не хватает золота'),
  )
  await page.getByRole('button', { name: /Продать/ }).click()
  await frames(page)
  s = await state(page)
  check(
    'продажа вернула 60% (57 золота)',
    s.gold === 62 && s.towers.length === 1,
    JSON.stringify(s),
  )
  check('панель башни скрылась', (await page.locator('.towerbox').count()) === 0)

  // Постройка с клавиатуры: 1, стрелки к клетке (5, 11), Enter
  await page.keyboard.press('1')
  await page.keyboard.press('ArrowRight')
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await frames(page)
  s = await state(page)
  check(
    'постройка с клавиатуры',
    s.towers.includes('archer0@5,11') && s.gold === 12,
    JSON.stringify(s),
  )
  await page.keyboard.press('Escape')

  // Волна: пробел, скорость ×3
  await blur(page)
  await page.keyboard.press('Space')
  await frames(page)
  check('пробел начал волну', (await state(page)).phase === 'wave')
  check(
    'кнопка «Идёт бой» неактивна',
    await page.getByRole('button', { name: 'Идёт бой' }).isDisabled(),
  )
  const speed = page.getByRole('button', { name: 'Скорость игры' })
  await speed.click()
  await speed.click()
  await page.waitForFunction(() => window.__throne.game.state.enemies.length >= 3)
  check(
    'подсказка «Врагов осталось»',
    (await page.locator('#hint').textContent()).startsWith('Врагов осталось'),
  )
  await page.waitForFunction(() => window.__throne.game.state.phase === 'build', null, {
    timeout: 60_000,
  })
  s = await state(page)
  check('первая волна отбита без потерь', s.wave === 2 && s.lives === 20, JSON.stringify(s))
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
  const t1 = (await state(page)).time
  await page.waitForTimeout(400)
  const t2 = (await state(page)).time
  check('пауза останавливает время', t1 === t2 && (await state(page)).paused)
  check('подсказка паузы', (await page.locator('#hint').textContent()).startsWith('Пауза'))
  await page.getByRole('button', { name: 'Продолжить' }).click()

  // Поражение
  await page.evaluate(() => {
    window.__throne.game.state.lives = 1
  })
  await page.getByRole('heading', { name: 'Трон пал' }).waitFor({ timeout: 60_000 })
  await frames(page)
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
    (await page.locator('.sheet .dim').textContent()) === 'Это ваш новый рекорд.',
  )
  await page.getByRole('button', { name: 'Сыграть ещё раз' }).click()
  await frames(page)
  s = await state(page)
  check(
    'новая партия',
    s.phase === 'build' && s.gold === 150 && s.lives === 20 && !s.towers.length,
    JSON.stringify(s),
  )

  // Победа: перескакиваем сразу на 20-ю волну
  await page.evaluate(() => {
    const g = window.__throne.game
    g.state.wave = 20
    g.startWave()
    g.state.queue = []
  })
  await page.getByRole('heading', { name: 'Трон устоял' }).waitFor({ timeout: 10_000 })
  check(
    'экран победы',
    (await page.locator('.sheet p').first().textContent()).startsWith('Все 20 волн отбиты.'),
  )
  await page.getByRole('button', { name: 'Играть дальше' }).click()
  await frames(page)
  check('бесконечный режим', (await page.locator('.hud .wave').textContent()) === 'Волна 21')

  // Баллиста (баланс v2): начинаем новую партию, чтобы хватило золота
  await page.evaluate(() => window.__throne.store.newGame())
  await page.getByRole('button', { name: /Баллиста/ }).click()
  await clickTile(page, 5, 11)
  await page.keyboard.press('Escape')
  await clickTile(page, 5, 11)
  const ballista = (await page.locator('.towerbox .who span').allTextContents()).join(' | ')
  check('баллиста: числа баланса v2', ballista === 'урон 50 → 80 | дальность 3,4 → 3,6', ballista)

  // Зажатый пробел не должен ставить паузу (повторы клавиши игнорируются)
  await page.keyboard.press('Escape')
  await blur(page)
  await page.keyboard.down('Space')
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() =>
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: ' ', code: 'Space', repeat: true }),
      ),
    )
  }
  await page.keyboard.up('Space')
  s = await state(page)
  check('зажатый пробел: волна идёт, паузы нет', s.phase === 'wave' && !s.paused, JSON.stringify(s))

  // Испорченный рекорд в localStorage не ломает меню
  await page.evaluate(() => localStorage.setItem('throne-best', '123'))
  await page.reload()
  await page.waitForTimeout(500)
  check('испорченный рекорд: меню на месте', (await play.count()) === 1)
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
  const box = await page.locator('#board').boundingBox()
  await page.touchscreen.tap(box.x + (5.5 / 9) * box.width, box.y + (11.5 / 13) * box.height)
  await page.waitForTimeout(100)
  check(
    'постройка касанием',
    await page.evaluate(() => window.__throne.game.state.towers.length === 1),
  )
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
} catch (e) {
  console.error('\nПроверка прервалась:', e.message)
  failed++
} finally {
  await browser.close()
  await server.close()
}

console.log(failed ? `\n✗ Не прошло проверок: ${failed}` : '\n✓ Все проверки прошли')
process.exit(failed ? 1 : 0)
