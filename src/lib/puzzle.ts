export type PuzzleGroup = {
  label: string
  words: string[]
}

export type Puzzle = {
  v: 1
  title: string
  author: string
  groups: PuzzleGroup[]
}

export type ListedPuzzle = {
  id: string
  title: string
  author: string
  createdAt: string
}

export type SelectionResult =
  | { kind: 'correct'; groupIndex: number }
  | { kind: 'wrong'; oneAway: boolean }

const normalize = (value: string) => value.trim().toLocaleUpperCase('pt-BR')

export function isPuzzleShape(value: unknown): value is Puzzle {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<Puzzle>
  if (candidate.v !== 1 || typeof candidate.title !== 'string' || typeof candidate.author !== 'string') {
    return false
  }
  return (
    Array.isArray(candidate.groups) &&
    candidate.groups.every(
      (group) =>
        group &&
        typeof group === 'object' &&
        typeof group.label === 'string' &&
        Array.isArray(group.words) &&
        group.words.every((word) => typeof word === 'string'),
    )
  )
}

export function validatePuzzle(puzzle: Puzzle): string[] {
  const errors: string[] = []
  if (!puzzle.title.trim()) errors.push('Dê um título para a sua Trama.')
  if (puzzle.title.trim().length > 80) errors.push('O título pode ter no máximo 80 caracteres.')
  if (puzzle.author.trim().length > 40) errors.push('O nome do autor pode ter no máximo 40 caracteres.')

  if (puzzle.groups.length !== 4) {
    errors.push('A Trama precisa ter exatamente 4 grupos.')
    return errors
  }

  for (const group of puzzle.groups) {
    if (!group.label.trim()) errors.push('Todos os grupos precisam de um tema.')
    if (group.label.trim().length > 50) errors.push('O tema de cada grupo pode ter no máximo 50 caracteres.')
    if (group.words.length !== 4 || group.words.some((word) => !word.trim())) {
      errors.push('Cada grupo precisa ter exatamente 4 palavras preenchidas.')
    }
    if (group.words.some((word) => word.trim().length > 24)) {
      errors.push('Cada palavra pode ter no máximo 24 caracteres.')
    }
  }

  const words = puzzle.groups.flatMap((group) => group.words).map(normalize).filter(Boolean)
  if (new Set(words).size !== words.length) errors.push('Cada palavra deve aparecer uma única vez.')

  return [...new Set(errors)]
}

export function evaluateSelection(puzzle: Puzzle, selectedWords: string[]): SelectionResult {
  const selected = new Set(selectedWords.map(normalize))
  if (selected.size !== 4) return { kind: 'wrong', oneAway: false }

  const matches = puzzle.groups.map((group) =>
    group.words.map(normalize).filter((word) => selected.has(word)).length,
  )
  const groupIndex = matches.findIndex((count) => count === 4)
  if (groupIndex >= 0) return { kind: 'correct', groupIndex }

  return { kind: 'wrong', oneAway: matches.some((count) => count === 3) }
}

export function shuffleWords(words: string[], random: () => number = Math.random): string[] {
  const result = [...words]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[result[index], result[swapIndex]] = [result[swapIndex], result[index]]
  }
  return result
}
