import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { encodePuzzle, type Puzzle } from './lib/puzzle'

const testPuzzle: Puzzle = {
  v: 1,
  title: 'Trama de teste',
  author: 'Teste',
  groups: [
    { label: 'Temperos', words: ['SAL', 'ALHO', 'COMINHO', 'PÁPRICA'] },
    { label: 'Ritmos brasileiros', words: ['SAMBA', 'FORRÓ', 'FREVO', 'XOTE'] },
    { label: 'Roupas com manga', words: ['CAMISA', 'BLUSA', 'JAQUETA', 'VESTIDO'] },
    { label: 'Cartas do baralho', words: ['REI', 'DAMA', 'VALETE', 'ÁS'] },
  ],
}

describe('Trama', () => {
  beforeEach(() => {
    window.location.hash = ''
    window.history.replaceState({}, '', '/')
    localStorage.setItem('trama-onboarding-seen', '1')
    localStorage.removeItem('trama-history')
    localStorage.removeItem('trama-created')
    localStorage.removeItem('trama-creator-draft')
    try {
      const keys = Object.keys(localStorage)
      keys.forEach(k => { if (k.startsWith('trama-progress:')) localStorage.removeItem(k) })
    } catch {}
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  const startGame = async (_user: ReturnType<typeof userEvent.setup>) => {
    cleanup()
    window.location.hash = `#p=${encodePuzzle(testPuzzle)}`
    render(<App />)
    await waitFor(() => expect(screen.getByRole('grid', { name: 'Palavras' })).toBeInTheDocument())
  }

  it('permite abrir o criador e mostra os quatro grupos', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /criar trama/i }))

    expect(screen.getByRole('heading', { name: /crie a sua trama/i })).toBeInTheDocument()
    expect(screen.getAllByText(/grupo [1-4]/i)).toHaveLength(4)
  })

  it('salva e restaura automaticamente um rascunho não publicado', async () => {
    const user = userEvent.setup()
    const firstRender = render(<App />)
    await user.click(screen.getByRole('button', { name: /criar trama/i }))
    await user.type(screen.getByRole('textbox', { name: 'Título da Trama' }), 'Minha ideia inacabada')
    await user.type(screen.getByRole('textbox', { name: 'Conexão do grupo 1' }), 'Um grupo salvo')

    expect(JSON.parse(localStorage.getItem('trama-creator-draft') ?? '{}')).toEqual(
      expect.objectContaining({ title: 'Minha ideia inacabada' }),
    )

    firstRender.unmount()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /criar trama/i }))

    expect(screen.getByRole('textbox', { name: 'Título da Trama' })).toHaveValue('Minha ideia inacabada')
    expect(screen.getByRole('textbox', { name: 'Conexão do grupo 1' })).toHaveValue('Um grupo salvo')
  })

  it('desmarca as palavras depois de uma tentativa errada sem encerrar a partida', async () => {
    const user = userEvent.setup()
    render(<App />)
    await startGame(user)

    for (const word of ['SAL', 'ALHO', 'COMINHO', 'SAMBA']) {
      await user.click(screen.getByRole('button', { name: word }))
    }

    await waitFor(() => expect(screen.getByRole('button', { name: 'SAL' })).toHaveAttribute('aria-pressed', 'false'))
    expect(screen.queryByText(/não fechou/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/fim de jogo/i)).not.toBeInTheDocument()
  })

  it('submete automaticamente ao selecionar a quarta palavra correta', async () => {
    const user = userEvent.setup()
    render(<App />)
    await startGame(user)

    for (const word of ['SAL', 'ALHO', 'COMINHO', 'PÁPRICA']) {
      await user.click(screen.getByRole('button', { name: word }))
    }

    expect(document.querySelectorAll('.word-tile.solving')).toHaveLength(4)
    expect(await screen.findByText('Temperos')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Conectar' })).not.toBeInTheDocument()
  })

  it('reordena palavras ao arrastar um quadrado sobre outro', async () => {
    const user = userEvent.setup()
    render(<App />)
    await startGame(user)
    const grid = screen.getByRole('grid', { name: 'Palavras' })
    const before = within(grid).getAllByRole('button')
    const source = before[0]
    const target = before[3]
    const sourceLabel = source.textContent
    const targetLabel = target.textContent
    const middleLabels = [before[1].textContent, before[2].textContent]

    fireEvent.dragStart(source)
    expect(screen.getByTestId('drag-placeholder')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: sourceLabel ?? '' })).not.toBeInTheDocument()
    fireEvent.dragOver(target)
    fireEvent.drop(target)

    const after = within(grid).getAllByRole('button')
    expect(after[0]).toHaveTextContent(targetLabel ?? '')
    expect(after[1]).toHaveTextContent(middleLabels[0] ?? '')
    expect(after[2]).toHaveTextContent(middleLabels[1] ?? '')
    expect(after[3]).toHaveTextContent(sourceLabel ?? '')
  })

  it('permite trocar quadrados com Alt e setas', async () => {
    const user = userEvent.setup()
    render(<App />)
    await startGame(user)
    const grid = screen.getByRole('grid', { name: 'Palavras' })
    const before = within(grid).getAllByRole('button')
    const sourceLabel = before[0].textContent
    const targetLabel = before[1].textContent

    fireEvent.keyDown(before[0], { altKey: true, key: 'ArrowRight' })

    const after = within(grid).getAllByRole('button')
    expect(after[0]).toHaveTextContent(targetLabel ?? '')
    expect(after[1]).toHaveTextContent(sourceLabel ?? '')
  })

  it('abre o onboarding pelo botão de ajuda na partida', async () => {
    localStorage.removeItem('trama-onboarding-seen')
    render(<App />)
    await startGame(userEvent.setup())

    await userEvent.setup().click(screen.getByRole('button', { name: /como jogar/i }))

    await waitFor(() => expect(screen.getByRole('dialog', { name: /feche os quatro grupos/i })).toBeInTheDocument())
    await userEvent.setup().click(screen.getByRole('button', { name: 'Entendi' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(localStorage.getItem('trama-onboarding-seen')).toBe('1')
  })

  it('abre o onboarding no primeiro acesso sem jogo', async () => {
    localStorage.removeItem('trama-onboarding-seen')
    render(<App />)

    await waitFor(() => expect(screen.getByRole('dialog', { name: /feche os quatro grupos/i })).toBeInTheDocument())
    await userEvent.setup().click(screen.getByRole('button', { name: 'Entendi' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(localStorage.getItem('trama-onboarding-seen')).toBe('1')
  })

  it('marca dicas progressivamente na cor do grupo mais fácil em aberto', async () => {
    const user = userEvent.setup()
    render(<App />)
    await startGame(user)

    const dica = screen.getByRole('button', { name: /dica/i })
    await user.click(dica)

    const hintedTiles = document.querySelectorAll('.word-tile.hinted')
    expect(hintedTiles.length).toBe(2)

    await user.click(dica)

    const hintedTiles2 = document.querySelectorAll('.word-tile.hinted')
    expect(hintedTiles2.length).toBe(3)
  })

  it('mantém a partida focada sem footer de landing page', async () => {
    const user = userEvent.setup()
    render(<App />)
    await startGame(user)

    expect(screen.queryByText('Jogue, crie, compartilhe.')).not.toBeInTheDocument()
    expect(screen.getByRole('grid', { name: 'Palavras' })).toBeInTheDocument()
  })

  it('mantém uma única ação de voltar durante a partida', async () => {
    const user = userEvent.setup()
    render(<App />)
    await startGame(user)

    expect(screen.getAllByRole('button', { name: /voltar/i })).toHaveLength(1)
  })

  it('não exibe contador de seleção durante a partida', async () => {
    const user = userEvent.setup()
    render(<App />)
    await startGame(user)

    await user.click(screen.getByRole('button', { name: 'SAL' }))
    await user.click(screen.getByRole('button', { name: 'ALHO' }))

    expect(screen.queryByText(/de 4 selecionadas/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/fechando a trama/i)).not.toBeInTheDocument()
  })

  it('comunica acerto e erro apenas por animação, sem mensagens de texto', async () => {
    const user = userEvent.setup()
    render(<App />)
    await startGame(user)

    for (const word of ['SAL', 'ALHO', 'COMINHO', 'SAMBA']) {
      await user.click(screen.getByRole('button', { name: word }))
    }
    await waitFor(() => expect(screen.getByRole('button', { name: 'SAL' })).toHaveAttribute('aria-pressed', 'false'))

    await user.click(screen.getByRole('button', { name: /embaralhar/i }))

    expect(screen.queryByText(/ordem ajustada/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/misturadas/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/continue/i)).not.toBeInTheDocument()
    expect(document.querySelector('.game-message')).toBeNull()
  })

  it('publica uma Trama e mostra o link curto retornado pela API', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => (
      init?.method === 'POST'
        ? new Response(JSON.stringify({ id: 'Ab_12-x' }), { status: 201 })
        : new Response(JSON.stringify({ puzzles: [] }), { status: 200 })
    ))
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /criar trama/i }))
    await user.type(screen.getByRole('textbox', { name: 'Título da Trama' }), 'Trama do grupo')

    const groups = [
      ['Temperos', ['SAL', 'ALHO', 'COMINHO', 'PÁPRICA']],
      ['Ritmos', ['SAMBA', 'FORRÓ', 'FREVO', 'XOTE']],
      ['Roupas', ['CAMISA', 'BLUSA', 'JAQUETA', 'VESTIDO']],
      ['Cartas', ['REI', 'DAMA', 'VALETE', 'ÁS']],
    ] as const
    for (const [groupIndex, [label, words]] of groups.entries()) {
      await user.type(screen.getByRole('textbox', { name: `Conexão do grupo ${groupIndex + 1}` }), label)
      for (const [wordIndex, word] of words.entries()) {
        await user.type(screen.getByRole('textbox', { name: `Grupo ${groupIndex + 1}, palavra ${wordIndex + 1}` }), word)
      }
    }

    await user.click(screen.getByRole('button', { name: 'Criar link curto' }))
    expect(await screen.findByText(/link curto pronto/i)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Link compartilhável' })).toHaveValue('http://localhost:3000/p/Ab_12-x')
    expect(fetchMock).toHaveBeenCalledWith('/api/puzzles', expect.objectContaining({ method: 'POST' }))
    expect(JSON.parse(localStorage.getItem('trama-created') ?? '[]')).toEqual([
      expect.objectContaining({ id: 'Ab_12-x', puzzle: expect.objectContaining({ title: 'Trama do grupo' }) }),
    ])
  }, 10000)

  it('mostra uma home de exploração sem iniciar uma partida automaticamente', () => {
    render(<App />)

    expect(screen.queryByRole('grid', { name: 'Palavras' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /explore tramas/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Jogar /i })).not.toBeInTheDocument()
    expect(screen.queryByText(/trama do dia/i)).not.toBeInTheDocument()
  })

  it('abre uma Trama real retornada pela coleção, em vez de um jogo inventado', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ puzzles: [{ id: 'Ab_12-x', puzzle: testPuzzle, createdAt: '2026-08-27T03:29:45.000Z' }] }), { status: 200 }),
    )
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Jogar Trama de teste' }))

    expect(screen.getByRole('heading', { name: 'Trama de teste' })).toBeInTheDocument()
    expect(screen.getByRole('grid', { name: 'Palavras' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/puzzles')
  })

  it('mostra as Tramas criadas pelo jogador a partir do cache local', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ puzzles: [] }), { status: 200 }))
    localStorage.setItem('trama-created', JSON.stringify([
      { id: 'Ab_12-x', url: '/p/Ab_12-x', puzzle: testPuzzle, createdAt: 1777000000000 },
    ]))
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Suas Tramas' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Jogar Trama de teste' })).toBeInTheDocument()
    expect(screen.queryByText(/trama do dia/i)).not.toBeInTheDocument()
  })

  it('expande Explore tramas para todos os registros retornados pelo banco', async () => {
    const puzzles = Array.from({ length: 5 }, (_, index) => ({
      id: `Ab_12-${index}`,
      puzzle: { ...testPuzzle, title: `Trama publicada ${index + 1}` },
      createdAt: '2026-08-27T03:29:45.000Z',
    }))
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ puzzles }), { status: 200 }))
    render(<App />)

    const showAll = await screen.findByRole('button', { name: 'Ver todas' })
    expect(screen.getAllByRole('button', { name: /jogar trama publicada/i })).toHaveLength(4)
    await userEvent.setup().click(showAll)

    expect(screen.getAllByRole('button', { name: /jogar trama publicada/i })).toHaveLength(5)
    expect(screen.getByRole('button', { name: 'Mostrar menos' })).toBeInTheDocument()
  })

  it('abre o criador com apenas uma ação de voltar e mantém o opcional na mesma linha', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /criar trama/i }))

    expect(screen.getAllByRole('button', { name: /voltar/i })).toHaveLength(1)
    const authorLabel = screen.getByTestId('author-field-label')
    expect(authorLabel).toHaveTextContent('Seu nome (opcional)')
    expect(authorLabel.querySelector('.optional-label')).toBeInTheDocument()
  })

  it('mantém limpar sempre visível, mas desabilitado sem seleção', async () => {
    const user = userEvent.setup()
    render(<App />)
    await startGame(user)

    const clear = screen.getByRole('button', { name: /limpar seleção/i })
    expect(clear).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'SAL' }))
    expect(clear).toBeEnabled()
    await user.click(clear)
    expect(screen.getByRole('button', { name: 'SAL' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('bloqueia a dica quando restam apenas quatro palavras', async () => {
    const user = userEvent.setup()
    render(<App />)
    await startGame(user)

    const solve = async (words: string[], label: string) => {
      for (const word of words) await user.click(screen.getByRole('button', { name: word }))
      await screen.findByText(label)
    }
    await solve(['SAL', 'ALHO', 'COMINHO', 'PÁPRICA'], 'Temperos')
    await solve(['SAMBA', 'FORRÓ', 'FREVO', 'XOTE'], 'Ritmos brasileiros')
    await solve(['CAMISA', 'BLUSA', 'JAQUETA', 'VESTIDO'], 'Roupas com manga')

    expect(screen.getByRole('button', { name: /dica/i })).toBeDisabled()
    expect(within(screen.getByRole('grid', { name: 'Palavras' })).getAllByRole('button')).toHaveLength(4)
  })

  it('preserva a ordem cronológica de dicas e tentativas no resultado', async () => {
    const user = userEvent.setup()
    render(<App />)
    await startGame(user)

    await user.click(screen.getByRole('button', { name: /dica/i }))
    for (const word of ['SAL', 'ALHO', 'SAMBA', 'REI']) await user.click(screen.getByRole('button', { name: word }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'SAL' })).toHaveAttribute('aria-pressed', 'false'))
    await user.click(screen.getByRole('button', { name: /dica/i }))

    const solve = async (words: string[], label: string) => {
      for (const word of words) await user.click(screen.getByRole('button', { name: word }))
      await screen.findByText(label)
    }
    await solve(['SAL', 'ALHO', 'COMINHO', 'PÁPRICA'], 'Temperos')
    await solve(['SAMBA', 'FORRÓ', 'FREVO', 'XOTE'], 'Ritmos brasileiros')
    await solve(['CAMISA', 'BLUSA', 'JAQUETA', 'VESTIDO'], 'Roupas com manga')
    await solve(['REI', 'DAMA', 'VALETE', 'ÁS'], 'Cartas do baralho')

    const timeline = Array.from(screen.getByLabelText('Histórico de tentativas').children).map((item) => item.getAttribute('aria-label'))
    expect(timeline.slice(0, 3)).toEqual(['Dica usada', 'Tentativa incorreta', 'Dica usada'])
  }, 10000)

  it('não reexecuta a animação de entrada dos grupos restaurados após recarregar', async () => {
    const user = userEvent.setup()
    render(<App />)
    await startGame(user)
    for (const word of ['SAL', 'ALHO', 'COMINHO', 'PÁPRICA']) await user.click(screen.getByRole('button', { name: word }))
    await screen.findByText('Temperos')

    cleanup()
    window.history.replaceState({}, '', `/#p=${encodePuzzle(testPuzzle)}`)
    render(<App />)

    expect(screen.getByText('Temperos').closest('.solved-group')).toHaveClass('restored')
  })

  it('mostra home vazia sem histórico', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: /explore tramas/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /suas tramas/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/trama do dia/i)).not.toBeInTheDocument()
  })
})
