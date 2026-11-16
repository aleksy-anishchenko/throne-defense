// Проверка конкретного релиза и реального чтения рейтинга после выкладки.
const [baseUrl, releaseId] = process.argv.slice(2)
if (!baseUrl || !releaseId) throw new Error('Нужны URL API и ожидаемый releaseId')
const ready = await fetch(`${baseUrl}/api/ready`, { signal: AbortSignal.timeout(3000) })
const body = await ready.json()
if (!ready.ok || body.ok !== true || body.releaseId !== releaseId) {
  throw new Error(`Релиз ${releaseId} не готов: HTTP ${ready.status}, ${JSON.stringify(body)}`)
}
const leaderboard = await fetch(`${baseUrl}/api/leaderboard`, {
  signal: AbortSignal.timeout(3000),
})
const top = await leaderboard.json()
if (!leaderboard.ok || !Array.isArray(top.entries)) {
  throw new Error('Маршрут рейтинга не работает')
}
console.log(`Релиз ${releaseId}: API и рейтинг готовы`)
