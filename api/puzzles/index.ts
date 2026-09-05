/// <reference types="node" />

import { randomBytes } from 'node:crypto'
import { neon, type NeonQueryFunction } from '@neondatabase/serverless'
import { isPuzzleShape, validatePuzzle, type Puzzle } from '../../src/lib/puzzle.js'
import type { ApiRequest, ApiResponse } from '../../src/lib/api-types.js'

function jsonBody(request: ApiRequest): unknown {
  if (typeof request.body === 'string') return JSON.parse(request.body) as unknown
  return request.body
}

function newSlug(): string {
  return randomBytes(6).toString('base64url').slice(0, 8)
}

function database() {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL
  if (!url) throw new Error('DATABASE_NOT_CONFIGURED')
  return neon(url)
}

let schemaReady: Promise<void> | null = null

async function ensureTable(sql: NeonQueryFunction<false, false>) {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS trama_puzzles (
          id TEXT PRIMARY KEY,
          payload TEXT NOT NULL,
          title TEXT NOT NULL DEFAULT '',
          author TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `
      await sql`ALTER TABLE trama_puzzles ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT ''`
      await sql`ALTER TABLE trama_puzzles ADD COLUMN IF NOT EXISTS author TEXT NOT NULL DEFAULT ''`
      await sql`
        UPDATE trama_puzzles
        SET title = COALESCE(payload::jsonb ->> 'title', ''),
            author = COALESCE(payload::jsonb ->> 'author', '')
        WHERE title = ''
      `
      await sql`CREATE INDEX IF NOT EXISTS trama_puzzles_created_at_idx ON trama_puzzles (created_at DESC)`
    })().catch((error: unknown) => {
      schemaReady = null
      throw error
    })
  }
  await schemaReady
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== 'POST' && request.method !== 'GET') {
    response.setHeader('Allow', 'GET, POST')
    return response.status(405).json({ message: 'Método não permitido.' })
  }

  try {
    const sql = database()
    await ensureTable(sql)

    if (request.method === 'GET') {
      const rows = await sql`
        SELECT id, title, author, created_at
        FROM trama_puzzles
        ORDER BY created_at DESC, id DESC
      `
      const puzzles = rows.map((row) => ({
        id: String(row.id),
        title: String(row.title),
        author: String(row.author),
        createdAt: String(row.created_at),
      }))
      return response.status(200).json({ puzzles })
    }

    const body = jsonBody(request)
    const candidate = body && typeof body === 'object' && 'puzzle' in body ? body.puzzle : null
    if (!isPuzzleShape(candidate)) {
      return response.status(400).json({ message: 'A Trama enviada tem um formato inválido.' })
    }

    const errors = validatePuzzle(candidate)
    if (errors.length > 0) {
      return response.status(400).json({ message: errors[0], errors })
    }

    const payload = JSON.stringify(candidate satisfies Puzzle)

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const id = newSlug()
      const inserted = await sql`
        INSERT INTO trama_puzzles (id, payload, title, author)
        VALUES (${id}, ${payload}, ${candidate.title}, ${candidate.author})
        ON CONFLICT (id) DO NOTHING
        RETURNING id
      `
      if (inserted.length > 0) return response.status(201).json({ id })
    }

    return response.status(503).json({ message: 'Não foi possível reservar um link. Tente novamente.' })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return response.status(400).json({ message: 'JSON inválido.' })
    }
    if (error instanceof Error && error.message === 'DATABASE_NOT_CONFIGURED') {
      return response.status(503).json({ message: 'O banco do Trama ainda não está configurado.', code: error.message })
    }
    console.error('create puzzle error', error)
    return response.status(500).json({ message: 'Não foi possível criar este link agora.' })
  }
}
