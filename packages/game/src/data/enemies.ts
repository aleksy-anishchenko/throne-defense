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
    isGiant: true,
    nameForms: ['огр', 'огра', 'огров'],
    hp: 390,
    speed: 0.5,
    armor: 0,
    reward: 40,
    throneDamage: 4,
    radius: 0.33,
    controlResistance: 0.3,
  },
  {
    id: 'healer',
    nameForms: ['знахарь', 'знахаря', 'знахарей'],
    hp: 50,
    speed: 0.8,
    armor: 0,
    reward: 12,
    throneDamage: 1,
    radius: 0.21,
    // Раз в 2,5 с возвращает каждому раненому соседу в радиусе 1,3 клетки 15% своего здоровья
    heal: { radius: 1.3, amount: 0.15, cooldown: 2.5 },
  },
  {
    id: 'gorynych',
    isGiant: true,
    nameForms: ['Змей Горыныч', 'Змея Горыныча', 'Змеев Горынычей'],
    hp: 380,
    speed: 0.5,
    armor: 3,
    reward: 35,
    throneDamage: 4,
    radius: 0.36,
    slowResistance: 0.3,
    controlResistance: 0.5,
    splitInto: { enemyId: 'snakelet', count: 3 },
  },
  {
    // В волнах не встречается: появляется, только когда погибает Горыныч
    id: 'snakelet',
    nameForms: ['змеёныш', 'змеёныша', 'змеёнышей'],
    hp: 45,
    speed: 1.1,
    armor: 0,
    reward: 6,
    throneDamage: 1,
    radius: 0.17,
  },
  {
    id: 'general',
    isGiant: true,
    nameForms: ['генерал мятежников', 'генерала мятежников', 'генералов мятежников'],
    hp: 700,
    speed: 0.62,
    armor: 4,
    reward: 80,
    throneDamage: 4,
    radius: 0.34,
    slowResistance: 0.25,
    controlResistance: 0.4,
    banner: { radius: 1.5, armor: 3 },
  },
  {
    id: 'boss',
    isGiant: true,
    nameForms: ['узурпатор', 'узурпатора', 'узурпаторов'],
    hp: 1275,
    speed: 0.36,
    armor: 4,
    reward: 200,
    throneDamage: 20,
    radius: 0.42,
    slowResistance: 0.5,
    controlResistance: 0.7,
    immuneToHealing: true,
  },
]

/** Все враги по id */
export const ENEMIES: Readonly<Record<string, EnemyDef>> = Object.fromEntries(
  ENEMY_LIST.map((enemyDef) => {
    if (enemyDef.id === 'boss' || enemyDef.id === 'general') return [enemyDef.id, enemyDef]
    const adjustment =
      enemyDef.id === 'healer' ? 0.9 : ['ogre', 'gorynych'].includes(enemyDef.id) ? 0.95 : 1
    return [enemyDef.id, { ...enemyDef, hp: enemyDef.hp * 1.15 * adjustment * 0.9 }]
  }),
)
