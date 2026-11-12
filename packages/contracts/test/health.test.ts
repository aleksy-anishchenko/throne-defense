import Value from 'typebox/value'
import { describe, expect, it } from 'vitest'
import { HealthResponseSchema } from '../src/index.ts'

describe('HealthResponseSchema', () => {
  it('пропускает { ok: true }', () => {
    expect(Value.Check(HealthResponseSchema, { ok: true })).toBe(true)
  })

  it('не пропускает другое', () => {
    for (const response of [{ ok: false }, {}, { ok: 'true' }, null]) {
      expect(Value.Check(HealthResponseSchema, response)).toBe(false)
    }
  })
})
