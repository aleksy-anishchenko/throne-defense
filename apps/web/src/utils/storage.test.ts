import { describe, expect, it } from 'vitest'
import { DEFAULT_AUDIO_SETTINGS, parseAudioSettings, parseBest } from './storage'

describe('рекорд из localStorage', () => {
  it('читает нормальный рекорд', () => {
    expect(parseBest('{"score":12345,"wave":14}')).toEqual({ score: 12345, wave: 14 })
  })

  it('лишние поля отбрасывает', () => {
    expect(parseBest('{"score":1,"wave":2,"x":3}')).toEqual({ score: 1, wave: 2 })
  })

  it('пусто — рекорда нет', () => {
    expect(parseBest(null)).toBeNull()
    expect(parseBest('')).toBeNull()
  })

  it('мусор не роняет игру, а считается «рекорда нет»', () => {
    for (const raw of [
      '123',
      '"x"',
      'null',
      'true',
      '[]',
      '{}',
      '{"score":"много","wave":3}',
      '{"score":5}',
      'не json',
      '{"score":1e999,"wave":1}',
    ]) {
      expect(parseBest(raw), raw).toBeNull()
    }
  })
})

describe('настройки звука из localStorage', () => {
  it('читает сохранённые настройки', () => {
    const saved = { isSfxOn: false, isMusicOn: true, sfxVolume: 40, musicVolume: 75 }
    expect(parseAudioSettings(JSON.stringify(saved), null)).toEqual(saved)
  })

  it('новых настроек нет — по умолчанию всё включено', () => {
    expect(parseAudioSettings(null, null)).toEqual(DEFAULT_AUDIO_SETTINGS)
    expect(parseAudioSettings(null, '0')).toEqual(DEFAULT_AUDIO_SETTINGS)
  })

  it('звук был выключен в старой версии — выключены и звуки, и музыка', () => {
    expect(parseAudioSettings(null, '1')).toEqual({
      ...DEFAULT_AUDIO_SETTINGS,
      isSfxOn: false,
      isMusicOn: false,
    })
  })

  it('старый выключатель не важен, если новые настройки уже есть', () => {
    const saved = { ...DEFAULT_AUDIO_SETTINGS, isSfxOn: true }
    expect(parseAudioSettings(JSON.stringify(saved), '1')).toEqual(saved)
  })

  it('громкость вне 0–100 обрезается, дробная округляется', () => {
    const raw = JSON.stringify({ ...DEFAULT_AUDIO_SETTINGS, sfxVolume: 250, musicVolume: 33.6 })
    expect(parseAudioSettings(raw, null)).toMatchObject({ sfxVolume: 100, musicVolume: 34 })
    const negative = JSON.stringify({ ...DEFAULT_AUDIO_SETTINGS, sfxVolume: -5 })
    expect(parseAudioSettings(negative, null).sfxVolume).toBe(0)
  })

  it('мусор не роняет игру — настройки по умолчанию', () => {
    for (const raw of ['не json', '123', 'null', '[]', '{"isSfxOn":"да","sfxVolume":"громко"}']) {
      expect(parseAudioSettings(raw, '1'), raw).toEqual(DEFAULT_AUDIO_SETTINGS)
    }
  })
})
