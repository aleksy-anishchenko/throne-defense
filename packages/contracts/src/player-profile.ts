import Type from 'typebox'
import type { Static } from 'typebox'
import { PLAYER_NAME_MAX_LENGTH } from './player-name.ts'

export const PlayerNameSchema = Type.String({ minLength: 1, maxLength: PLAYER_NAME_MAX_LENGTH })

export const PlayerProfileSchema = Type.Object(
  { playerName: PlayerNameSchema },
  { additionalProperties: false },
)
export type PlayerProfile = Static<typeof PlayerProfileSchema>
