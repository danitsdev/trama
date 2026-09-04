/// <reference types="node" />

import { neon, type NeonQueryFunction } from '@neondatabase/serverless'
import { isPuzzleShape, validatePuzzle } from '../../src/lib/puzzle.js'
import type { ApiRequest, ApiResponse } from '../../src/lib/api-types.js'

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
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `
      await sql`CREATE INDEX IF NOT EXISTS trama_puzzles_created_at_idx ON trama_puzzles (created_at DESC)`
    })().catch((error: unknown) => {
      schemaReady = null
      throw error
    })
  }
  await schemaReady
}

function requestedId(request: ApiRequest): string | null {
  const value = request.query.id
  return typeof value === 'string' && /^[A-Za-z0-9_-]{6,32}$/u.test(value) ? value : null
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    return response.status(405).json({ message: 'Método não permitido.' })
  }

  const id = requestedId(request)
  if (!id) return response.status(400).json({ message: 'Link inválido ou incompleto.' })

  try {
    const sql = database()
    await ensureTable(sql)
    const rows = await sql`
      SELECT payload
      FROM trama_puzzles
      WHERE id = ${id}
      LIMIT 1
    `
    if (rows.length === 0) return response.status(404).json({ message: 'Puzzle não encontrado.' })

    const puzzle: unknown = JSON.parse(String(rows[0].payload))
    if (!isPuzzleShape(puzzle) || validatePuzzle(puzzle).length > 0) {
      return response.status(500).json({ message: 'Este puzzle salvo está inválido.' })
    }
    return response.status(200).json({ puzzle })
  } catch (error) {
    if (error instanceof Error && error.message === 'DATABASE_NOT_CONFIGURED') {
      return response.status(503).json({ message: 'O banco do Trama ainda não está configurado.', code: error.message })
    }
    console.error('load puzzle error', error)
    return response.status(500).json({ message: 'Não foi possível abrir esta Trama agora.' })
  }
}
