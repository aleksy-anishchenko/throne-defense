import Value from 'typebox/value'
import { describe, expect, it } from 'vitest'
import { SubmitRunRequestSchema, isValidPlayerName, normalizePlayerName } from '../src/index.ts'

describe('имя игрока', () => {
  it('normalizePlayerName убирает лишние пробелы', () => {
    expect(normalizePlayerName('  Василиса   Прекрасная \n')).toBe('Василиса Прекрасная')
  })

  it('normalizePlayerName приводит буквы к одной записи (NFC)', () => {
    // «й» из двух частей: «и» + значок краткости
    expect(normalizePlayerName('Андре\u0438\u0306')).toBe('Андрей')
  })

  it('годится: 1–20 символов, кириллица и эмодзи считаются по одному', () => {
    for (const name of ['Я', 'Василиса', 'Я'.repeat(20), 'Царь 🙂', 'Ivan_2', 'Renée', '🙂']) {
      expect(isValidPlayerName(name), name).toBe(true)
    }
  })

  it('не годится: пусто, длинно, пробелы по краям, невидимые символы', () => {
    for (const name of ['', ' ', 'Я'.repeat(21), ' Вася', 'Вася  Пупкин', 'Ва\u200bся', 'Ва\nся']) {
      expect(isValidPlayerName(name), JSON.stringify(name)).toBe(false)
    }
  })

  it('не годится: имя, пустое на вид, и «залго» из столбов надстрочных знаков', () => {
    const blankLooking = ['\u3164', '\u3164\u3164', '\u2800', '\u115F', '\uFE0F', 'Вася\u3164']
    for (const name of [...blankLooking, 'Z\u0316\u0319\u0317\u0318']) {
      expect(isValidPlayerName(name), JSON.stringify(name)).toBe(false)
    }
  })

  it('имя не в NFC сервер не примет — браузер присылает уже нормализованное', () => {
    expect(isValidPlayerName('Андре\u0438\u0306')).toBe(false)
  })
})

describe('SubmitRunRequestSchema', () => {
  const valid = {
    playerName: 'Василиса',
    levelId: 'throne-hall',
    score: 1234,
    wavesCleared: 5,
    balanceVersion: 4,
  }

  it('пропускает нормальный запрос', () => {
    expect(Value.Check(SubmitRunRequestSchema, valid)).toBe(true)
  })

  it('не пропускает мусор', () => {
    const garbage = [
      { score: -1 },
      { score: 1.5 },
      { wavesCleared: -1 },
      { balanceVersion: 0 },
      { levelId: '../etc' },
      { playerName: '' },
      { extra: 'поле' },
    ]
    for (const change of garbage) {
      expect(
        Value.Check(SubmitRunRequestSchema, { ...valid, ...change }),
        JSON.stringify(change),
      ).toBe(false)
    }
  })
})
