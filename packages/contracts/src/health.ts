import Type from 'typebox'
import type { Static } from 'typebox'

/**
 * Схема ответа. Из одного описания получаются и JSON Schema (по ней Fastify
 * проверяет и собирает ответ), и тип TypeScript (ниже) — разойтись им нельзя.
 */
export const HealthResponseSchema = Type.Object({ ok: Type.Literal(true) })

export type HealthResponse = Static<typeof HealthResponseSchema>

export const ReadyResponseSchema = Type.Object({
  ok: Type.Boolean(),
  releaseId: Type.String({ minLength: 1 }),
  schemaVersion: Type.Integer({ minimum: 0 }),
})

export type ReadyResponse = Static<typeof ReadyResponseSchema>
