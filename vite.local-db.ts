import { randomBytes } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ListedPuzzle, Puzzle } from './src/lib/puzzle.js'
import { isPuzzleShape, validatePuzzle } from './src/lib/puzzle.js'
import type { Plugin } from 'vite'

const ID_PATTERN = /^[A-Za-z0-9_-]{8}$/u

type PuzzleRow = { payload: string }

export type LocalPuzzleStore = {
  save(puzzle: Puzzle): string
  get(id: string): Puzzle | null
  list(): ListedPuzzle[]
  close(): void
}

function createId(): string {
  return randomBytes(8).toString('base64url').slice(0, 8)
}

export function createLocalPuzzleStore(filename: string): LocalPuzzleStore {
  mkdirSync(dirname(filename), { recursive: true })
  const database = new DatabaseSync(filename)
  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS trama_puzzles (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      author TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  const columns = database.prepare('PRAGMA table_info(trama_puzzles)').all() as Array<{ name: string }>
  if (!columns.some((column) => column.name === 'title')) database.exec("ALTER TABLE trama_puzzles ADD COLUMN title TEXT NOT NULL DEFAULT ''")
  if (!columns.some((column) => column.name === 'author')) database.exec("ALTER TABLE trama_puzzles ADD COLUMN author TEXT NOT NULL DEFAULT ''")
  const updateMetadata = database.prepare('UPDATE trama_puzzles SET title = ?, author = ? WHERE id = ?')
  const legacyRows = database.prepare("SELECT id, payload FROM trama_puzzles WHERE title = ''").all() as Array<{ id: string; payload: string }>
  for (const row of legacyRows) {
    try {
      const puzzle = JSON.parse(row.payload) as Puzzle
      updateMetadata.run(puzzle.title, puzzle.author, row.id)
    } catch {
      // Uma linha legada inválida não impede a inicialização do banco local.
    }
  }

  const insert = database.prepare('INSERT INTO trama_puzzles (id, payload, title, author) VALUES (?, ?, ?, ?)')
  const select = database.prepare('SELECT payload FROM trama_puzzles WHERE id = ? LIMIT 1')
  const selectAll = database.prepare('SELECT id, title, author, created_at FROM trama_puzzles ORDER BY created_at DESC, id DESC')

  return {
    save(puzzle) {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const id = createId()
        try {
          insert.run(id, JSON.stringify(puzzle), puzzle.title, puzzle.author)
          return id
        } catch (error) {
          if (!(error instanceof Error) || !error.message.includes('UNIQUE constraint failed')) throw error
        }
      }
      throw new Error('Não foi possível gerar um slug local único.')
    },
    get(id) {
      if (!ID_PATTERN.test(id)) return null
      const row = select.get(id) as PuzzleRow | undefined
      if (!row) return null
      return JSON.parse(row.payload) as Puzzle
    },
    list() {
      return (selectAll.all() as Array<{ id: string; title: string; author: string; created_at: string }>).map((row) => ({
        id: row.id,
        title: row.title,
        author: row.author,
        createdAt: row.created_at,
      }))
    },
    close() {
      database.close()
    },
  }
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('X-Trama-Storage', 'sqlite')
  response.end(JSON.stringify(body))
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer | string) => chunks.push(Buffer.from(chunk)))
    request.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

function localPuzzleApi(filename = resolve(process.cwd(), 'data', 'trama.local.sqlite')): Plugin {
  return {
    name: 'trama-local-sqlite',
    configureServer(server) {
      const store = createLocalPuzzleStore(filename)
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url ?? '/', 'http://trama.local').pathname
        const isCollection = pathname === '/api/puzzles' || pathname === '/api/puzzles/'
        const itemMatch = pathname.match(/^\/api\/puzzles\/([A-Za-z0-9_-]{8,32})\/?$/u)
        if (!isCollection && !itemMatch) {
          next()
          return
        }

        try {
          if (isCollection && request.method === 'POST') {
            const parsed: unknown = JSON.parse(await readBody(request))
            const candidate = parsed && typeof parsed === 'object' && 'puzzle' in parsed
              ? (parsed as { puzzle?: unknown }).puzzle
              : null
            if (!isPuzzleShape(candidate)) {
              sendJson(response, 400, { message: 'O formato da Trama é inválido.' })
              return
            }
            const errors = validatePuzzle(candidate)
            if (errors.length > 0) {
              sendJson(response, 400, { message: errors[0] })
              return
            }
            sendJson(response, 201, { id: store.save(candidate) })
            return
          }

          if (isCollection && request.method === 'GET') {
            sendJson(response, 200, { puzzles: store.list() })
            return
          }

          if (itemMatch && request.method === 'GET') {
            const puzzle = store.get(itemMatch[1])
            if (!puzzle) {
              sendJson(response, 404, { message: 'Trama não encontrada.' })
              return
            }
            sendJson(response, 200, { puzzle })
            return
          }

          response.setHeader('Allow', isCollection ? 'GET, POST' : 'GET')
          sendJson(response, 405, { message: 'Método não permitido.' })
        } catch (error) {
          if (error instanceof SyntaxError) {
            sendJson(response, 400, { message: 'JSON inválido.' })
            return
          }
          sendJson(response, 500, { message: 'O banco local não respondeu.' })
        }
      })
    },
  }
}

export default localPuzzleApi
