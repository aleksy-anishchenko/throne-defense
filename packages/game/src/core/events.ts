// Простейший «эмиттер» событий — как emit у Vue-компонента, только без Vue.
// Игра вызывает emit('kill', враг), а интерфейс/звук подписываются через on('kill', ...).

export type Listener<T> = (payload: T) => void

export interface Emitter<E> {
  /** Подписаться. Возвращает функцию, которая отписывает */
  on<K extends keyof E>(type: K, fn: Listener<E[K]>): () => void
  emit<K extends keyof E>(type: K, payload: E[K]): void
}

export type Emit<E> = Emitter<E>['emit']

export function createEmitter<E>(): Emitter<E> {
  const listeners: { [K in keyof E]?: Set<Listener<E[K]>> } = {}

  return {
    on(type, fn) {
      const typeListeners = (listeners[type] ??= new Set())
      typeListeners.add(fn)
      return () => {
        typeListeners.delete(fn)
      }
    },
    emit(type, payload) {
      listeners[type]?.forEach((fn) => fn(payload))
    },
  }
}
