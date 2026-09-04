import { isPuzzleShape, validatePuzzle, type ListedPuzzle, type Puzzle } from './puzzle'

const SLUG_PATTERN = /^[A-Za-z0-9_-]{6,32}$/u

type Fetcher = typeof fetch

type ApiError = {
  message?: string
}

export function parsePuzzleRoute(pathname: string): string | null {
  const match = pathname.match(/^\/p\/([A-Za-z0-9_-]{6,32})\/?$/u)
  return match?.[1] ?? null
}

export function buildPuzzleUrl(id: string, origin: string = window.location.origin): string {
  if (!SLUG_PATTERN.test(id)) throw new Error('Slug inválido.')
  return new URL(`/p/${id}`, origin).toString()
}

async function readApiBody(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function errorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && typeof (body as ApiError).message === 'string') {
    return (body as ApiError).message as string
  }
  return fallback
}

export async function createPuzzleLink(puzzle: Puzzle, fetcher: Fetcher = fetch): Promise<{ id: string; storage: 'local' | 'server' }> {
  const response = await fetcher('/api/puzzles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ puzzle }),
  })
  const body = await readApiBody(response)
  if (!response.ok || !body || typeof body !== 'object' || typeof (body as { id?: unknown }).id !== 'string') {
    throw new Error(errorMessage(body, 'Não foi possível criar o link curto.'))
  }
  const id = (body as { id: string }).id
  if (!SLUG_PATTERN.test(id)) throw new Error('O servidor retornou um slug inválido.')
  return { id, storage: response.headers.get('x-trama-storage') === 'sqlite' ? 'local' : 'server' }
}

export async function loadPuzzleBySlug(slug: string, fetcher: Fetcher = fetch): Promise<Puzzle> {
  if (!SLUG_PATTERN.test(slug)) throw new Error('Link inválido ou incompleto.')
  const response = await fetcher(`/api/puzzles/${encodeURIComponent(slug)}`)
  const body = await readApiBody(response)
  if (!response.ok || !body || typeof body !== 'object' || !('puzzle' in body)) {
    throw new Error(errorMessage(body, 'Não foi possível abrir esta Trama.'))
  }
  return (body as { puzzle: Puzzle }).puzzle
}

export async function listPuzzles(fetcher: Fetcher = fetch): Promise<ListedPuzzle[]> {
  const response = await fetcher('/api/puzzles')
  const body = await readApiBody(response)
  if (!response.ok || !body || typeof body !== 'object' || !Array.isArray((body as { puzzles?: unknown }).puzzles)) {
    throw new Error(errorMessage(body, 'Não foi possível carregar as Tramas.'))
  }

  return (body as { puzzles: unknown[] }).puzzles.filter((item): item is ListedPuzzle => {
    if (!item || typeof item !== 'object') return false
    const candidate = item as Partial<ListedPuzzle>
    return (
      typeof candidate.id === 'string' &&
      SLUG_PATTERN.test(candidate.id) &&
      typeof candidate.createdAt === 'string' &&
      isPuzzleShape(candidate.puzzle) &&
      validatePuzzle(candidate.puzzle).length === 0
    )
  })
}
