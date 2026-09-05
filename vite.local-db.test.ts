import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createLocalPuzzleStore } from './vite.local-db'
import type { Puzzle } from './src/lib/puzzle'

const puzzle: Puzzle = {
  v: 1,
  title: 'Teste local',
  author: 'Trama',
  groups: [
    { label: 'Um', words: ['A', 'B', 'C', 'D'] },
    { label: 'Dois', words: ['E', 'F', 'G', 'H'] },
    { label: 'Três', words: ['I', 'J', 'K', 'L'] },
    { label: 'Quatro', words: ['M', 'N', 'O', 'P'] },
  ],
}

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { force: true, recursive: true })
})

describe('SQLite local do Trama', () => {
  it('persiste e recupera uma Trama por slug', () => {
    const directory = mkdtempSync(join(tmpdir(), 'trama-'))
    temporaryDirectories.push(directory)
    const store = createLocalPuzzleStore(join(directory, 'trama.sqlite'))

    const id = store.save(puzzle)

    expect(id).toMatch(/^[A-Za-z0-9_-]{8}$/u)
    expect(store.get(id)).toEqual(puzzle)
    expect(store.get('nao-existe')).toBeNull()
    expect(store.list()).toEqual([
      expect.objectContaining({ id, title: puzzle.title, author: puzzle.author }),
    ])
    store.close()
  })
})
