import type { EnemyDef } from '../types.ts'

const ENEMY_LIST: EnemyDef[] = [
  {
    id: 'rebel',
    nameForms: ['бунтовщик', 'бунтовщика', 'бунтовщиков'],
    hp: 37,
    speed: 1,
    armor: 0,
    reward: 6,
    throneDamage: 1,
    radius: 0.2,
  },
  {
    id: 'scout',
    nameForms: ['лазутчик', 'лазутчика', 'лазутчиков'],
    hp: 22,
    speed: 1.9,
    armor: 0,
    reward: 5,
    throneDamage: 1,
    radius: 0.15,
  },
  {
    id: 'armor',
    nameForms: ['латник', 'латника', 'латников'],
    hp: 110,
    speed: 0.65,
    armor: 5,
    reward: 14,
    throneDamage: 2,
    radius: 0.23,
  },
  {
    id: 'ogre',
    nameForms: ['огр', 'огра', 'огров'],
    hp: 390,
    speed: 0.5,
    armor: 0,
    reward: 40,
    throneDamage: 4,
    radius: 0.33,
  },
  {
    id: 'boss',
    nameForms: ['узурпатор', 'узурпатора', 'узурпаторов'],
    hp: 1500,
    speed: 0.36,
    armor: 4,
    reward: 200,
    throneDamage: 20,
    radius: 0.42,
    slowResistance: 0.5,
  },
]

/** Все враги по id */
export const ENEMIES: Readonly<Record<string, EnemyDef>> = Object.fromEntries(
  ENEMY_LIST.map((enemyDef) => [enemyDef.id, enemyDef]),
)
