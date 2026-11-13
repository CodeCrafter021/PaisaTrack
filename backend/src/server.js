import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './app.js'
import { createDatabase } from './database.js'

const backendDirectory = fileURLToPath(new URL('..', import.meta.url))
const databasePath = process.env.DATABASE_PATH ?? resolve(backendDirectory, 'data/paisatrack.sqlite')
const port = Number(process.env.PORT ?? 3001)

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.')
}

const db = createDatabase(databasePath)
db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString())
const app = createApp({ db, serveFrontend: true })
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`PaisaTrack API listening on port ${port}`)
})

function shutdown() {
  server.close(() => {
    db.close()
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
