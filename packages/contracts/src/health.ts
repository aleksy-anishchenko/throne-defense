import Type from 'typebox'
import type { Static } from 'typebox'

/** GET /api/health — «сервер жив» */
export const HEALTH_PATH = '/api/health'

/**
 * Схема ответа. Из одного описания получаются и JSON Schema (по ней Fastify
 * проверяет и собирает ответ), и тип TypeScript (ниже) — разойтись им нельзя.
 */
export const HealthResponseSchema = Type.Object({ ok: Type.Literal(true) })

export type HealthResponse = Static<typeof HealthResponseSchema>
