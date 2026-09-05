import { describe, expect, it } from 'vitest'
import {
  evaluateSelection,
  shuffleWords,
  validatePuzzle,
  type Puzzle,
} from './puzzle'

const puzzle: Puzzle = {
  v: 1,
  title: 'Brasilidades',
  author: 'Dani',
  groups: [
    { label: 'Frutas', words: ['AÇAÍ', 'CAJU', 'MANGA', 'PITANGA'] },
    { label: 'Ritmos', words: ['FORRÓ', 'FREVO', 'SAMBA', 'XOTE'] },
    { label: 'Estados', words: ['BAHIA', 'CEARÁ', 'PARÁ', 'SERGIPE'] },
    { label: 'Doces', words: ['COCADA', 'PAÇOCA', 'PUDIM', 'QUINDIM'] },
  ],
}

describe('validação do criador', () => {
  it('aceita quatro grupos completos com palavras únicas', () => {
    expect(validatePuzzle(puzzle)).toEqual([])
  })

  it('aponta palavra repetida ignorando caixa e espaços', () => {
    const duplicate: Puzzle = {
      ...puzzle,
      groups: puzzle.groups.map((group, index) =>
        index === 1 ? { ...group, words: [' açaí ', ...group.words.slice(1)] } : group,
      ),
    }

    expect(validatePuzzle(duplicate)).toContain('Cada palavra deve aparecer uma única vez.')
  })

  it('exige exatamente quatro grupos de quatro palavras', () => {
    expect(validatePuzzle({ ...puzzle, groups: puzzle.groups.slice(0, 3) })).toContain(
      'A Trama precisa ter exatamente 4 grupos.',
    )
  })
})

describe('motor do jogo', () => {
  it('reconhece um grupo correto sem depender da ordem', () => {
    expect(evaluateSelection(puzzle, ['PITANGA', 'MANGA', 'AÇAÍ', 'CAJU'])).toEqual({
      kind: 'correct',
      groupIndex: 0,
    })
  })

  it('avisa quando falta apenas uma palavra para um grupo', () => {
    expect(evaluateSelection(puzzle, ['AÇAÍ', 'CAJU', 'MANGA', 'SAMBA'])).toEqual({
      kind: 'wrong',
      oneAway: true,
    })
  })

  it('embaralha sem mutar nem perder palavras', () => {
    const words = puzzle.groups.flatMap((group) => group.words)
    const shuffled = shuffleWords(words, () => 0.25)

    expect(shuffled).not.toBe(words)
    expect([...shuffled].sort()).toEqual([...words].sort())
    expect(words).toEqual(puzzle.groups.flatMap((group) => group.words))
  })
})
