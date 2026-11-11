import type { EnemyDef } from '../types.ts'

const LIST: EnemyDef[] = [
  {
    id: 'rebel',
    name: ['бунтовщик', 'бунтовщика', 'бунтовщиков'],
    hp: 30,
    speed: 1,
    armor: 0,
    reward: 6,
    dmg: 1,
    r: 0.2,
  },
  {
    id: 'scout',
    name: ['лазутчик', 'лазутчика', 'лазутчиков'],
    hp: 18,
    speed: 1.9,
    armor: 0,
    reward: 5,
    dmg: 1,
    r: 0.15,
  },
  {
    id: 'armor',
    name: ['латник', 'латника', 'латников'],
    hp: 90,
    speed: 0.65,
    armor: 5,
    reward: 14,
    dmg: 2,
    r: 0.23,
  },
  {
    id: 'ogre',
    name: ['огр', 'огра', 'огров'],
    hp: 320,
    speed: 0.5,
    armor: 0,
    reward: 40,
    dmg: 4,
    r: 0.33,
  },
  {
    id: 'boss',
    name: ['узурпатор', 'узурпатора', 'узурпаторов'],
    hp: 1500,
    speed: 0.4,
    armor: 4,
    reward: 200,
    dmg: 20,
    r: 0.42,
    slowResist: 0.5,
  },
]

/** Все враги по id */
export const ENEMIES: Readonly<Record<string, EnemyDef>> = Object.fromEntries(
  LIST.map((e) => [e.id, e]),
)
