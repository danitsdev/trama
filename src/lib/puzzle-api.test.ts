import { describe, expect, it, vi } from 'vitest'
import { buildPuzzleUrl, createPuzzleLink, listPuzzles, loadPuzzleBySlug, parsePuzzleRoute } from './puzzle-api'
import type { Puzzle } from './puzzle'

const puzzle: Puzzle = {
  v: 1,
  title: 'Teste curto',
  author: 'Dani',
  groups: [
    { label: 'Um', words: ['A', 'B', 'C', 'D'] },
    { label: 'Dois', words: ['E', 'F', 'G', 'H'] },
    { label: 'Três', words: ['I', 'J', 'K', 'L'] },
    { label: 'Quatro', words: ['M', 'N', 'O', 'P'] },
  ],
}

describe('links curtos', () => {
  it('extrai slug apenas de rotas /p/:slug', () => {
    expect(parsePuzzleRoute('/p/Ab_12-x')).toBe('Ab_12-x')
    expect(parsePuzzleRoute('/')).toBeNull()
    expect(parsePuzzleRoute('/p/')).toBeNull()
    expect(parsePuzzleRoute('/api/puzzles/Ab_12-x')).toBeNull()
  })

  it('monta uma URL curta sem carregar o payload no navegador', () => {
    expect(buildPuzzleUrl('Ab_12-x', 'https://trama.example')).toBe('https://trama.example/p/Ab_12-x')
  })

  it('cria um puzzle e retorna o slug do servidor', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ id: 'Ab_12-x' }), { status: 201 }),
    )

    await expect(createPuzzleLink(puzzle, fetcher)).resolves.toEqual({ id: 'Ab_12-x', storage: 'server' })
    expect(fetcher).toHaveBeenCalledWith(
      '/api/puzzles',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ puzzle }),
      }),
    )
  })

  it('identifica o armazenamento SQLite do servidor local', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ id: 'Ab_12-x' }), {
        headers: { 'X-Trama-Storage': 'sqlite' },
        status: 201,
      }),
    )

    await expect(createPuzzleLink(puzzle, fetcher)).resolves.toEqual({ id: 'Ab_12-x', storage: 'local' })
  })

  it('carrega o puzzle de um slug e transforma erro HTTP em mensagem útil', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ puzzle }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Puzzle não encontrado.' }), { status: 404 }))

    await expect(loadPuzzleBySlug('Ab_12-x', fetcher)).resolves.toEqual(puzzle)
    await expect(loadPuzzleBySlug('sumiu1', fetcher)).rejects.toThrow('Puzzle não encontrado.')
  })

  it('lista somente Tramas válidas retornadas pela coleção', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({
        puzzles: [
          { id: 'Ab_12-x', puzzle, createdAt: '2026-08-27T03:29:45.000Z' },
          { id: 'invalido', puzzle: { title: 'sem formato' }, createdAt: 'agora' },
        ],
      }), { status: 200 }),
    )

    await expect(listPuzzles(fetcher)).resolves.toEqual([
      { id: 'Ab_12-x', puzzle, createdAt: '2026-08-27T03:29:45.000Z' },
    ])
    expect(fetcher).toHaveBeenCalledWith('/api/puzzles')
  })
})