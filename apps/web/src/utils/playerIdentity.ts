const DATABASE_NAME = 'throne-defense-player'
const PROFILE_STORE = 'profile'
const TOKEN_KEY = 'token'
const PROFILE_TIMEOUT_MS = 3000

function openProfileDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(PROFILE_STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => {
      request.onsuccess = () => request.result.close()
      reject(new Error('Хранилище профиля занято'))
    }
  })
}

async function readOrCreateToken(): Promise<string> {
  const database = await openProfileDatabase()
  try {
    return await new Promise((resolve, reject) => {
      // Чтение и создание в одной транзакции: две вкладки получат один и тот же ключ.
      const transaction = database.transaction(PROFILE_STORE, 'readwrite')
      const store = transaction.objectStore(PROFILE_STORE)
      let token: string
      transaction.oncomplete = () => resolve(token)
      transaction.onabort = () => reject(transaction.error)
      const read = store.get(TOKEN_KEY)
      read.onsuccess = () => {
        const stored: unknown = read.result
        if (typeof stored === 'string' && /^[0-9a-f]{64}$/.test(stored)) {
          token = stored
          return
        }
        try {
          const bytes = crypto.getRandomValues(new Uint8Array(32))
          token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
          store.put(token, TOKEN_KEY)
        } catch {
          transaction.abort()
        }
      }
    })
  } finally {
    database.close()
  }
}

let tokenRequest: Promise<string | null> | undefined

function loadToken(): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Истекло ожидание профиля')), PROFILE_TIMEOUT_MS)
  })
  return Promise.race([readOrCreateToken(), timeout]).finally(() => clearTimeout(timer))
}

/** Секретный ключ профиля хранится в браузере и используется только для запросов рейтинга. */
export function browserPlayerToken(): Promise<string | null> {
  tokenRequest ??= loadToken().catch(() => {
    tokenRequest = undefined
    return null
  })
  return tokenRequest
}
