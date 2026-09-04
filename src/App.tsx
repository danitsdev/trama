import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  CircleHelp,
  Copy,
  ExternalLink,
  Lightbulb,
  LoaderCircle,
  Plus,
  RotateCcw,
  Search,
  Share2,
  Shuffle,
  ChevronRight,
  X,
} from 'lucide-react'
import './App.css'
import {
  decodePuzzle,
  encodePuzzle,
  evaluateSelection,
  shuffleWords,
  validatePuzzle,
  isPuzzleShape,
  type ListedPuzzle,
  type Puzzle,
} from './lib/puzzle'
import { buildPuzzleUrl, createPuzzleLink, listPuzzles, loadPuzzleBySlug, parsePuzzleRoute } from './lib/puzzle-api'

const GROUP_COLORS = ['sun', 'leaf', 'sky', 'berry'] as const

type LinkMode = 'server' | 'sqlite' | 'hash'
type CreatedLink = { url: string; mode: LinkMode }
type TimelineEntry = 'wrong' | 'hint' | number
type HistoryEntry = { id: string; title: string; author: string; playedAt: number; completed: boolean; payload?: string }
type CreatedPuzzleEntry = { id: string; url: string; puzzle: Puzzle; createdAt: number }
const ONBOARDING_KEY = 'trama-onboarding-seen'
const HISTORY_KEY = 'trama-history'
const CREATED_KEY = 'trama-created'
const CREATOR_DRAFT_KEY = 'trama-creator-draft'

const emptyPuzzle = (): Puzzle => ({
  v: 1,
  title: '',
  author: '',
  groups: Array.from({ length: 4 }, () => ({ label: '', words: ['', '', '', ''] })),
})

function loadCreatorDraft(): Puzzle {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(CREATOR_DRAFT_KEY) ?? 'null')
    if (
      isPuzzleShape(value) &&
      value.groups.length === 4 &&
      value.groups.every((group) => group.words.length === 4)
    ) return value
  } catch {
    // Rascunho ausente ou corrompido: começa com o editor vazio.
  }
  return emptyPuzzle()
}

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  )
}

function hashPuzzle(): { puzzle: Puzzle | null; error: string | null } {
  const encoded = window.location.hash.startsWith('#p=') ? window.location.hash.slice(3) : ''
  if (!encoded) return { puzzle: null, error: null }
  try {
    return { puzzle: decodePuzzle(encoded), error: null }
  } catch {
    return { puzzle: null, error: 'Este link está incompleto ou não é mais compatível.' }
  }
}

function initialRouteState(): { puzzle: Puzzle | null; error: string | null; loading: boolean } {
  const slug = parsePuzzleRoute(window.location.pathname)
  if (slug) {
    return { puzzle: null, error: null, loading: true }
  }
  const hash = hashPuzzle()
  if (hash.puzzle || hash.error) return { puzzle: hash.puzzle, error: hash.error, loading: false }
  // Sem slug ou hash: Home primeiro. Nunca iniciar um jogo aleatório.
  return { puzzle: null, error: null, loading: false }
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const area = document.createElement('textarea')
  area.value = text
  document.body.append(area)
  area.select()
  document.execCommand('copy')
  area.remove()
}

function IconButton({
  label,
  children,
  onClick,
  disabled = false,
}: {
  label: string
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button aria-label={label} className="icon-button" disabled={disabled} onClick={onClick} title={label} type="button">
      {children}
    </button>
  )
}

type Progress = {
  words: string[]
  solved: number[]
  attempts: number
  history: TimelineEntry[]
  hints: string[]
  hintsUsed: number
}

const progressKey = (puzzle: Puzzle) => `trama-progress:${encodePuzzle(puzzle)}`

function loadProgress(puzzle: Puzzle): Progress | null {
  try {
    const raw = localStorage.getItem(progressKey(puzzle))
    if (!raw) return null
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object') return null
    const candidate = value as Partial<Progress>
    const allWords = puzzle.groups.flatMap((group) => group.words)
    const sameWords =
      Array.isArray(candidate.words) &&
      candidate.words.length === allWords.length &&
      [...candidate.words].sort().join('|') === [...allWords].sort().join('|')
    const validSolved =
      Array.isArray(candidate.solved) &&
      candidate.solved.every((index) => typeof index === 'number' && Number.isInteger(index) && index >= 0 && index < puzzle.groups.length)
    const rawHistory = candidate.history
    const validHistory =
      Array.isArray(rawHistory) &&
      rawHistory.every((entry) => entry === 'wrong' || entry === 'hint' || (typeof entry === 'number' && Number.isInteger(entry)))
    if (!sameWords || !validSolved || !validHistory || !Array.isArray(candidate.hints)) return null
    const { words, solved } = candidate
    return {
      words: words as string[],
      solved: solved as number[],
      attempts: typeof candidate.attempts === 'number' ? candidate.attempts : rawHistory.length,
      history: candidate.history as TimelineEntry[],
      hints: candidate.hints.filter((word) => typeof word === 'string'),
      hintsUsed: typeof candidate.hintsUsed === 'number' ? candidate.hintsUsed : candidate.hints.length,
    }
  } catch {
    return null
  }
}

function GameBoard({ puzzle }: { puzzle: Puzzle }) {
  const [initialProgress] = useState(() => loadProgress(puzzle))
  const storageKey = useMemo(() => progressKey(puzzle), [puzzle])
  const puzzlePayload = useMemo(() => encodePuzzle(puzzle), [puzzle])
  const [restorationActive, setRestorationActive] = useState(true)
  const restoredSolved = restorationActive ? initialProgress?.solved ?? [] : []
  const restoredFinished = restorationActive && restoredSolved.length === puzzle.groups.length
  const [words, setWords] = useState(() => initialProgress?.words ?? shuffleWords(puzzle.groups.flatMap((group) => group.words)))
  const [selected, setSelected] = useState<string[]>([])
  const [solved, setSolved] = useState<number[]>(() => initialProgress?.solved ?? [])
  const [attempts, setAttempts] = useState(() => initialProgress?.attempts ?? 0)
  const [history, setHistory] = useState<TimelineEntry[]>(() => initialProgress?.history ?? [])
  const [hints, setHints] = useState<string[]>(() => initialProgress?.hints ?? [])
  const [hintsUsed, setHintsUsed] = useState(() => initialProgress?.hintsUsed ?? 0)
  const [copied, setCopied] = useState(false)
  const [wrongAttempt, setWrongAttempt] = useState(false)
  const [oneAwayPulse, setOneAwayPulse] = useState(false)
  const [celebratingGroup, setCelebratingGroup] = useState<number | null>(null)
  const [draggedWord, setDraggedWord] = useState<string | null>(null)
  const [dragOverWord, setDragOverWord] = useState<string | null>(null)
  const [swappingWords, setSwappingWords] = useState<string[]>([])
  const didDrag = useRef(false)
  const wrongTimer = useRef<number | null>(null)
  const correctTimer = useRef<number | null>(null)
  const swapTimer = useRef<number | null>(null)

  useEffect(() => () => {
    if (wrongTimer.current !== null) window.clearTimeout(wrongTimer.current)
    if (correctTimer.current !== null) window.clearTimeout(correctTimer.current)
    if (swapTimer.current !== null) window.clearTimeout(swapTimer.current)
  }, [])

  // Salva a partida no navegador a cada mudança: sair e voltar restaura tudo.
  useEffect(() => {
    const progress: Progress = { words, solved, attempts, history, hints, hintsUsed }
    try {
      localStorage.setItem(storageKey, JSON.stringify(progress))
    } catch {
      // Sem storage disponível (modo privado, cota cheia): o jogo segue sem persistência.
    }
  }, [storageKey, words, solved, attempts, history, hints, hintsUsed])

  useEffect(() => {
    saveHistory({
      id: puzzlePayload,
      title: puzzle.title,
      author: puzzle.author,
      playedAt: Date.now(),
      completed: restoredFinished,
      payload: puzzlePayload,
    })
  }, [puzzle, puzzlePayload, restoredFinished])

  const finished = solved.length === puzzle.groups.length
  const remainingWords = useMemo(
    () => words.filter((word) => !solved.some((index) => puzzle.groups[index].words.includes(word))),
    [puzzle, solved, words],
  )

  const submitSelection = (selection: string[]) => {
    if (selection.length !== 4 || finished || wrongAttempt || celebratingGroup !== null) return
    const result = evaluateSelection(puzzle, selection)
    setAttempts((current) => current + 1)
    setHistory((current) => [...current, result.kind === 'correct' ? result.groupIndex : 'wrong'])

    if (result.kind === 'correct') {
      const nextSolved = [...solved, result.groupIndex]
      setCelebratingGroup(result.groupIndex)
      if (correctTimer.current !== null) window.clearTimeout(correctTimer.current)
      // As 4 peças se organizam e se fundem antes do grupo aparecer.
      correctTimer.current = window.setTimeout(() => {
        setSolved(nextSolved)
        setSelected([])
        setCelebratingGroup(null)
        setHints((current) => current.filter((word) => !puzzle.groups[result.groupIndex].words.includes(word)))
        saveHistory({
          id: puzzlePayload,
          title: puzzle.title,
          author: puzzle.author,
          playedAt: Date.now(),
          completed: nextSolved.length === puzzle.groups.length,
          payload: puzzlePayload,
        })
      }, 720)
      return
    }

    if (wrongTimer.current !== null) window.clearTimeout(wrongTimer.current)
    setWrongAttempt(true)
    setOneAwayPulse(result.oneAway)
    wrongTimer.current = window.setTimeout(() => {
      setSelected([])
      setWrongAttempt(false)
      setOneAwayPulse(false)
    }, 520)
  }

  const toggleWord = (word: string) => {
    if (finished || wrongAttempt || celebratingGroup !== null) return
    const nextSelection = selected.includes(word)
      ? selected.filter((item) => item !== word)
      : selected.length < 4
        ? [...selected, word]
        : selected
    setSelected(nextSelection)
    if (nextSelection.length === 4) submitSelection(nextSelection)
  }

  const moveWord = (source: string, target: string) => {
    if (source === target) return
    setWords((current) => {
      const sourceIndex = current.indexOf(source)
      const targetIndex = current.indexOf(target)
      if (sourceIndex < 0 || targetIndex < 0) return current
      const next = [...current]
      ;[next[sourceIndex], next[targetIndex]] = [next[targetIndex], next[sourceIndex]]
      return next
    })
    setSwappingWords([source, target])
    if (swapTimer.current !== null) window.clearTimeout(swapTimer.current)
    swapTimer.current = window.setTimeout(() => setSwappingWords([]), 260)
  }

  const handleDragStart = (event: React.DragEvent<HTMLButtonElement>, word: string) => {
    didDrag.current = false
    setDraggedWord(word)
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', word)
    }
  }

  const handleDragOver = (event: React.DragEvent<HTMLButtonElement>, word: string) => {
    event.preventDefault()
    if (draggedWord && draggedWord !== word) didDrag.current = true
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    setDragOverWord(word)
  }

  const handleDrop = (event: React.DragEvent<HTMLButtonElement>, word: string) => {
    event.preventDefault()
    const source = draggedWord ?? event.dataTransfer?.getData('text/plain')
    if (source) moveWord(source, word)
    setDraggedWord(null)
    setDragOverWord(null)
  }

  const handleDragEnd = () => {
    setDraggedWord(null)
    setDragOverWord(null)
  }

  const handleTileKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, word: string) => {
    if (!event.altKey) return
    const offsetByKey: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -4, ArrowDown: 4 }
    const offset = offsetByKey[event.key]
    if (offset === undefined) return
    const index = remainingWords.indexOf(word)
    const target = remainingWords[index + offset]
    if (!target) return
    event.preventDefault()
    moveWord(word, target)
  }

  const reshuffle = () => {
    if (wrongAttempt || finished || celebratingGroup !== null) return
    setWords((current) => shuffleWords(current))
    setSelected([])
  }

  // Dicas: partem sempre do grupo mais fácil ainda em aberto.
  // 1º clique marca 2 palavras; o 2º marca mais 1 (3 no total) e encerra as dicas
  // daquele grupo. As marcas persistem mesmo após erros e só saem quando o grupo fecha.
  const hintTargetGroup = puzzle.groups.findIndex((_, index) => !solved.includes(index))
  const targetWords = hintTargetGroup >= 0 ? puzzle.groups[hintTargetGroup].words : []
  const markedInTarget = targetWords.filter((word) => hints.includes(word))
  const canGiveHint = remainingWords.length > 4 && hintTargetGroup >= 0 && markedInTarget.length < 3 && !wrongAttempt && celebratingGroup === null

  const giveHint = () => {
    if (!canGiveHint) return
    const missing = targetWords.filter((word) => !hints.includes(word))
    // A dica sempre revela na ordem do tema. Isso torna o resultado previsível
    // e mantém a sequência de dicas fiel ao momento em que elas foram usadas.
    const picks = missing.slice(0, markedInTarget.length === 0 ? 2 : 1)
    setHints((current) => [...current, ...picks])
    setHintsUsed((current) => current + 1)
    setHistory((current) => [...current, 'hint'])
  }

  // Zera a partida e o progresso salvo no navegador.
  const restart = () => {
    try {
      localStorage.removeItem(storageKey)
    } catch {
      // segue com o reset em memória
    }
    setWords(shuffleWords(puzzle.groups.flatMap((group) => group.words)))
    setSelected([])
    setSolved([])
    setRestorationActive(false)
    setAttempts(0)
    setHistory([])
    setHints([])
    setHintsUsed(0)
    saveHistory({ id: puzzlePayload, title: puzzle.title, author: puzzle.author, playedAt: Date.now(), completed: false, payload: puzzlePayload })
  }

  const attemptLine = history.map((entry) => {
    if (entry === 'wrong') return '❌'
    if (entry === 'hint') return '💡'
    return ['🟧', '🟩', '🟦', '🟪'][entry]
  }).join('')

  const copyResult = async () => {
    const hintSummary = hintsUsed
      ? ` e ${hintsUsed} dica${hintsUsed === 1 ? '' : 's'}`
      : ' e sem dicas'
    await copyText([
      `Joguei ${window.location.href} e consegui em ${attempts} tentativa${attempts === 1 ? '' : 's'}${hintSummary}.`,
      '',
      attemptLine,
    ].join('\n'))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <main className="game-shell">
      <section className="game-intro" aria-labelledby="puzzle-title">
        <div className="game-meta" aria-label="Informações do jogo">
          <div className="puzzle-context">
            <h1 id="puzzle-title">{puzzle.title}</h1>
            <span>{puzzle.author ? `por ${puzzle.author}` : 'Trama'}</span>
          </div>
          <div className="meta-counters">
            <div className="attempt-counter" aria-label={`${attempts} tentativas`}>
              <span>Tentativas</span>
              <strong>{attempts}</strong>
            </div>
            <div className="attempt-counter" aria-label={`${hintsUsed} dicas`}>
              <span>Dicas</span>
              <strong>{hintsUsed}</strong>
            </div>
          </div>
        </div>
      </section>

      {finished && (
        <section aria-labelledby="result-title" className={`victory-card ${restoredFinished ? 'restored' : ''}`}>
          <h2 id="result-title">Parabéns!</h2>
          <p>Você fechou a Trama em {attempts} tentativa{attempts === 1 ? '' : 's'}.</p>
          <div aria-label="Histórico de tentativas" className="victory-history">
            {history.map((entry, index) => {
              if (entry === 'hint') {
                return <span aria-label="Dica usada" className="history-mark history-hint" key={index} style={{ animationDelay: `${index * 70}ms` }}><Lightbulb aria-hidden="true" size={15} /></span>
              }
              if (entry === 'wrong') {
                return <span aria-label="Tentativa incorreta" className="history-mark history-wrong" key={index} style={{ animationDelay: `${index * 70}ms` }}>×</span>
              }
              return <span aria-label={`Grupo ${entry + 1} fechado`} className={`history-mark ${GROUP_COLORS[entry]}`} key={index} style={{ animationDelay: `${index * 70}ms` }}><i aria-hidden="true" /></span>
            })}
          </div>
          <div className="button-row">
            <button className="button primary" onClick={copyResult} type="button">
              <Share2 aria-hidden="true" size={17} />
              <span>{copied ? 'Copiado!' : 'Compartilhar'}</span>
            </button>
            <button className="button secondary" onClick={restart} type="button">
              <RotateCcw aria-hidden="true" size={17} />
              <span>Jogar de novo</span>
            </button>
          </div>
        </section>
      )}

      <section aria-label="Tabuleiro" className={`board ${finished && !restoredFinished ? 'settled' : ''}`}>
        {solved.map((groupIndex) => {
          const group = puzzle.groups[groupIndex]
          return (
            <article className={`solved-group ${GROUP_COLORS[groupIndex]} ${restoredSolved.includes(groupIndex) ? 'restored' : ''}`} key={groupIndex}>
              <strong>{group.label}</strong>
              <span>{group.words.join(' · ')}</span>
            </article>
          )
        })}

        {!finished && (
          <div
            aria-label="Palavras"
            className={`word-grid ${celebratingGroup !== null ? `forming ${GROUP_COLORS[celebratingGroup]}` : ''} ${oneAwayPulse ? 'one-away' : ''}`}
            role="grid"
          >
            {remainingWords.map((word) => {
              const isSelected = selected.includes(word)
              const isWrong = wrongAttempt && isSelected
              const isDragging = draggedWord === word
              const isDropTarget = dragOverWord === word && draggedWord !== word
              const isSolving = celebratingGroup !== null && isSelected
              const isSwapping = swappingWords.includes(word)
              const solveOrder = isSelected ? selected.indexOf(word) : 0
              const hintGroupIndex = puzzle.groups.findIndex((group) => group.words.includes(word))
              const hasHint = hints.includes(word) && hintGroupIndex >= 0
              return (
                <button
                  aria-label={isDragging ? 'Espaço reservado da peça arrastada' : word}
                  aria-pressed={isSelected}
                  className={`word-tile ${isSelected ? 'selected' : ''} ${isWrong ? 'wrong' : ''} ${isDragging ? 'drag-placeholder' : ''} ${isDropTarget ? 'drop-target' : ''} ${isSolving ? 'solving' : ''} ${isSwapping ? 'swapping' : ''} ${hasHint ? `hinted ${GROUP_COLORS[hintGroupIndex]}` : ''}`}
                  data-testid={isDragging ? 'drag-placeholder' : undefined}
                  draggable={!finished && !wrongAttempt && celebratingGroup === null}
                  key={word}
                  onClick={() => {
                    if (didDrag.current) {
                      didDrag.current = false
                      return
                    }
                    toggleWord(word)
                  }}
                  onDragEnd={handleDragEnd}
                  onDragOver={(event) => handleDragOver(event, word)}
                  onDragStart={(event) => handleDragStart(event, word)}
                  onDrop={(event) => handleDrop(event, word)}
                  onKeyDown={(event) => handleTileKeyDown(event, word)}
                  style={isSolving ? { animationDelay: `${120 + solveOrder * 90}ms` } : undefined}
                  type="button"
                >
                  {isDragging ? <span aria-hidden="true" className="placeholder-mark" /> : word}
                </button>
              )
            })}
          </div>
        )}
      </section>

      {!finished && (
        <section className="game-controls">
          <div className="button-row">
            <button aria-label="Dica" className="button quiet" disabled={!canGiveHint} onClick={giveHint} type="button">
              <Lightbulb aria-hidden="true" size={17} />
              <span>Dica</span>
            </button>
            <button className="button quiet" disabled={wrongAttempt || celebratingGroup !== null} onClick={reshuffle} type="button">
              <Shuffle aria-hidden="true" size={17} />
              <span>Embaralhar</span>
            </button>
            <button aria-label="Limpar seleção" className="button quiet" disabled={selected.length === 0 || wrongAttempt || celebratingGroup !== null} onClick={() => setSelected([])} type="button">
              <RotateCcw aria-hidden="true" size={16} />
              <span>Limpar</span>
            </button>

          </div>
        </section>
      )}

    </main>
  )
}
function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    const value: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(value)) return []
    return value.filter((entry): entry is HistoryEntry => {
      if (!entry || typeof entry !== 'object') return false
      const candidate = entry as Partial<HistoryEntry>
      return typeof candidate.id === 'string' && typeof candidate.title === 'string' && typeof candidate.author === 'string' && typeof candidate.playedAt === 'number' && typeof candidate.completed === 'boolean'
    })
  } catch {
    return []
  }
}

function saveHistory(entry: HistoryEntry) {
  try {
    const filtered = loadHistory().filter((item) => item.id !== entry.id)
    filtered.unshift(entry)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(filtered.slice(0, 20)))
  } catch {}
}

function loadCreatedPuzzles(): CreatedPuzzleEntry[] {
  try {
    const raw = localStorage.getItem(CREATED_KEY)
    const value: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(value)) return []
    return value.filter((entry): entry is CreatedPuzzleEntry => {
      if (!entry || typeof entry !== 'object') return false
      const candidate = entry as Partial<CreatedPuzzleEntry>
      return (
        typeof candidate.id === 'string' &&
        typeof candidate.url === 'string' &&
        typeof candidate.createdAt === 'number' &&
        Number.isFinite(candidate.createdAt) &&
        isPuzzleShape(candidate.puzzle) &&
        validatePuzzle(candidate.puzzle).length === 0
      )
    })
  } catch {
    return []
  }
}

function saveCreatedPuzzle(entry: CreatedPuzzleEntry) {
  try {
    const encoded = encodePuzzle(entry.puzzle)
    const filtered = loadCreatedPuzzles().filter((item) => item.id !== entry.id && encodePuzzle(item.puzzle) !== encoded)
    filtered.unshift(entry)
    localStorage.setItem(CREATED_KEY, JSON.stringify(filtered.slice(0, 50)))
  } catch {}
}

function formatCardDate(value: string | number): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(date).replace('.', '')
}

function historyPuzzle(entry: HistoryEntry): Puzzle | null {
  try {
    return decodePuzzle(entry.payload ?? entry.id)
  } catch {
    return null
  }
}

type CardTone = (typeof GROUP_COLORS)[number]

function TramaCard({ puzzle, status = 'Publicada', date, tone, onPlay }: { puzzle: Puzzle; status?: string; date?: string | number; tone: CardTone; onPlay: () => void }) {
  const wordCount = puzzle.groups.reduce((total, group) => total + group.words.length, 0)
  const formattedDate = date === undefined ? '' : formatCardDate(date)
  const activateCard = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onPlay()
  }
  return (
    <article aria-label={`Jogar ${puzzle.title}`} className={`trama-card ${tone}`} onClick={onPlay} onKeyDown={activateCard} role="button" tabIndex={0}>
      <span aria-hidden="true" className="trama-card-thread"><i /><i /><i /></span>
      <div className="trama-card-top">
        <span className="trama-category">{status}</span>
        {formattedDate && <time dateTime={typeof date === 'number' ? new Date(date).toISOString() : date}>{formattedDate}</time>}
      </div>
      <h3>{puzzle.title}</h3>
      <p className="trama-meta">por {puzzle.author || 'Anônimo'}</p>
      <div className="trama-card-foot">
        <span className="trama-size">{wordCount} palavras</span>
        <span aria-hidden="true" className="card-play">
          <span>Jogar</span>
          <ChevronRight aria-hidden="true" size={17} />
        </span>
      </div>
    </article>
  )
}

function Home({ onPlay, onCreate, catalog, catalogLoading, catalogError, onRetryCatalog }: {
  onPlay: (puzzle: Puzzle, url: string) => void
  onCreate: () => void
  catalog: ListedPuzzle[]
  catalogLoading: boolean
  catalogError: string | null
  onRetryCatalog: () => void
}) {
  const history = loadHistory()
  const recent = history
    .map((entry) => ({ entry, puzzle: historyPuzzle(entry) }))
    .filter((item): item is { entry: HistoryEntry; puzzle: Puzzle } => Boolean(item.puzzle))
  const created = loadCreatedPuzzles()
  const [showAllRecent, setShowAllRecent] = useState(false)
  const [showAllCreated, setShowAllCreated] = useState(false)
  const [showAllCatalog, setShowAllCatalog] = useState(false)
  const recentVisible = showAllRecent ? recent : recent.slice(0, 4)
  const createdVisible = showAllCreated ? created : created.slice(0, 4)
  const catalogVisible = showAllCatalog ? catalog : catalog.slice(0, 4)

  return (
    <main className="home-shell">
      <section className="home-hero">
        <span className="eyebrow">JOGOS DE CONEXÃO</span>
        <h1>Qual fio você puxa agora?</h1>
        <p className="home-tagline">Quatro grupos. Dezesseis palavras. Uma trama para fechar.</p>
        <div className="home-actions">
          <button className="button primary large" onClick={() => document.getElementById('explore-tramas')?.scrollIntoView?.({ behavior: 'smooth' })} type="button">
            <Search aria-hidden="true" size={16} /> Ver tramas
          </button>
          <button className="button secondary large" onClick={onCreate} type="button">
            <Plus aria-hidden="true" size={16} /> Criar Trama
          </button>
        </div>
      </section>

      {recent.length > 0 && (
        <section className="home-section">
          <header className="section-header">
            <div>
              <span className="section-kicker">ÚLTIMAS JOGADAS</span>
              <h2>Continue de onde parou</h2>
            </div>
            {recent.length > 4 && <button className="section-link" onClick={() => setShowAllRecent((current) => !current)} type="button">{showAllRecent ? 'Mostrar menos' : 'Ver todas'}</button>}
          </header>
          <div className="trama-grid">
            {recentVisible.map(({ entry, puzzle }, index) => <TramaCard key={entry.id} date={entry.playedAt} onPlay={() => onPlay(puzzle, `#p=${encodePuzzle(puzzle)}`)} puzzle={puzzle} status={entry.completed ? 'Concluída' : 'Em andamento'} tone={GROUP_COLORS[index % GROUP_COLORS.length]} />)}
          </div>
        </section>
      )}

      {created.length > 0 && (
        <section className="home-section">
          <header className="section-header">
            <div>
              <span className="section-kicker">CRIADAS POR VOCÊ</span>
              <h2>Suas Tramas</h2>
            </div>
            {created.length > 4 && <button className="section-link" onClick={() => setShowAllCreated((current) => !current)} type="button">{showAllCreated ? 'Mostrar menos' : 'Ver todas'}</button>}
          </header>
          <div className="trama-grid">
            {createdVisible.map((item, index) => <TramaCard key={item.id} date={item.createdAt} onPlay={() => onPlay(item.puzzle, item.url)} puzzle={item.puzzle} status="Criada por você" tone={GROUP_COLORS[(index + 1) % GROUP_COLORS.length]} />)}
          </div>
        </section>
      )}

      <section className="home-section" id="explore-tramas">
        <header className="section-header">
          <div>
            <span className="section-kicker">PUBLICADAS RECENTEMENTE</span>
            <h2>Explore tramas</h2>
          </div>
          {!catalogLoading && !catalogError && catalog.length > 4 && <button className="section-link" onClick={() => setShowAllCatalog((current) => !current)} type="button">{showAllCatalog ? 'Mostrar menos' : 'Ver todas'}</button>}
        </header>
        {catalogLoading && <div className="home-empty"><LoaderCircle aria-hidden="true" className="spin" size={20} /><span>Carregando tramas publicadas…</span></div>}
        {!catalogLoading && catalogError && <div className="home-empty"><p>{catalogError}</p><button className="section-link" onClick={onRetryCatalog} type="button">Tentar novamente</button></div>}
        {!catalogLoading && !catalogError && catalog.length === 0 && <div className="home-empty"><p>Ainda não há tramas publicadas.</p><button className="button secondary" onClick={onCreate} type="button"><Plus aria-hidden="true" size={16} /> Criar a primeira</button></div>}
        {!catalogLoading && !catalogError && catalog.length > 0 && <div className="trama-grid">{catalogVisible.map((item, index) => <TramaCard key={item.id} date={item.createdAt} onPlay={() => onPlay(item.puzzle, `/p/${item.id}`)} puzzle={item.puzzle} tone={GROUP_COLORS[(index + 2) % GROUP_COLORS.length]} />)}</div>}
      </section>
    </main>
  )
}

function OnboardingModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section aria-labelledby="onboarding-title" aria-modal="true" className="onboarding-card" role="dialog">
        <IconButton label="Fechar" onClick={onClose}>
          <X aria-hidden="true" size={21} />
        </IconButton>
        <span className="eyebrow">COMO JOGAR</span>
        <h2 id="onboarding-title">Feche os quatro grupos</h2>
        <p>Encontre conjuntos de quatro palavras que têm algo em comum.</p>
        <ol>
          <li>Toque em quatro palavras: a tentativa é enviada na hora.</li>
          <li>Arraste as peças para organizar a mesa como quiser.</li>
          <li>Travou? A primeira dica marca duas palavras e a segunda mais uma. No último grupo, ela se desativa.</li>
        </ol>
        <h3>Exemplos de temas</h3>
        <div className="example-group sun">
          <strong>FRUTAS</strong>
          <span>MANGA · CAJÁ · JABUTICABA · PITANGA</span>
        </div>
        <div className="example-group sky">
          <strong>FIO ___</strong>
          <span>DENTAL · ELÉTRICO · TERRA · AÉREO</span>
        </div>
        <p className="onboarding-note">
          Os temas são sempre mais específicos que “palavras de 5 letras” ou “verbos” — e cada
          enigma tem uma única solução. Cuidado com pegadinhas: algumas palavras parecem pertencer
          a mais de um grupo!
        </p>
        <p className="onboarding-note">
          Cada grupo tem uma cor fixa, revelada quando você o fecha:
          <span aria-label="Cores dos grupos" className="color-dots">
            <i className="sun" /><i className="leaf" /><i className="sky" /><i className="berry" />
          </span>
        </p>
        <button className="button primary full-width" onClick={onClose} type="button">Entendi</button>
      </section>
    </div>
  )
}

function ErrorScreen({ message, onRetry, onCreate }: { message: string; onRetry: () => void; onCreate: () => void }) {
  return (
    <main className="empty-state">
      <div className="empty-icon"><CircleHelp aria-hidden="true" size={28} /></div>
      <span className="eyebrow">LINK INDISPONÍVEL</span>
      <h1>Não deu para abrir esta Trama.</h1>
      <p>{message}</p>
      <div className="button-row">
        <button className="button primary" onClick={onRetry} type="button">Tentar novamente</button>
        <button className="button secondary" onClick={onCreate} type="button">Criar uma Trama</button>
      </div>
    </main>
  )
}

function Creator({ onBack, onPlay }: { onBack: () => void; onPlay: (puzzle: Puzzle, url: string) => void }) {
  const [draft, setDraft] = useState<Puzzle>(loadCreatorDraft)
  const [errors, setErrors] = useState<string[]>([])
  const [createdLink, setCreatedLink] = useState<CreatedLink | null>(null)
  const [copied, setCopied] = useState(false)
  const [publishing, setPublishing] = useState(false)

  const filledWords = draft.groups.flatMap((group) => group.words).filter((word) => word.trim()).length
  const nativeShare = (navigator as unknown as { share?: (data: ShareData) => Promise<void> }).share

  useEffect(() => {
    if (createdLink) return
    try {
      localStorage.setItem(CREATOR_DRAFT_KEY, JSON.stringify(draft))
    } catch {
      // Sem storage disponível, o editor continua funcionando normalmente.
    }
  }, [createdLink, draft])

  const updateGroup = (groupIndex: number, field: 'label' | 'word', value: string, wordIndex = 0) => {
    setDraft((current) => ({
      ...current,
      groups: current.groups.map((group, index) => {
        if (index !== groupIndex) return group
        if (field === 'label') return { ...group, label: value }
        return { ...group, words: group.words.map((word, position) => (position === wordIndex ? value : word)) }
      }),
    }))
  }

  const publish = async () => {
    const cleaned: Puzzle = {
      ...draft,
      title: draft.title.trim(),
      author: draft.author.trim(),
      groups: draft.groups.map((group) => ({
        label: group.label.trim(),
        words: group.words.map((word) => word.trim().toLocaleUpperCase('pt-BR')),
      })),
    }
    const nextErrors = validatePuzzle(cleaned)
    setErrors(nextErrors)
    if (nextErrors.length) return

    setPublishing(true)
    try {
      const { id, storage } = await createPuzzleLink(cleaned)
      const url = buildPuzzleUrl(id)
      saveCreatedPuzzle({ id, url, puzzle: cleaned, createdAt: Date.now() })
      localStorage.removeItem(CREATOR_DRAFT_KEY)
      setCreatedLink({ url, mode: storage === 'local' ? 'sqlite' : 'server' })
      setDraft(cleaned)
    } catch (error) {
      if (import.meta.env.DEV) {
        const url = `${window.location.origin}${window.location.pathname}#p=${encodePuzzle(cleaned)}`
        saveCreatedPuzzle({ id: encodePuzzle(cleaned), url, puzzle: cleaned, createdAt: Date.now() })
        localStorage.removeItem(CREATOR_DRAFT_KEY)
        setCreatedLink({
          url,
          mode: 'hash',
        })
        setDraft(cleaned)
      } else {
        setErrors([error instanceof Error ? error.message : 'Não foi possível criar o link curto.'])
      }
    } finally {
      setPublishing(false)
    }
  }

  const shareLink = async () => {
    if (!createdLink) return
    if (nativeShare) {
      await nativeShare({ title: `Trama: ${draft.title}`, text: 'Montei uma Trama para você.', url: createdLink.url })
    } else {
      await copyText(createdLink.url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    }
  }

  if (createdLink) {
    return (
      <main className="creator-shell success-screen">
        <div className="success-knot"><BrandMark /></div>
        <span className="eyebrow">LINK CURTO PRONTO</span>
        <h1>Sua Trama ganhou vida.</h1>
        <p>{createdLink.mode === 'hash' ? 'A API local não respondeu; este link com payload serve apenas para testar.' : 'Agora é só mandar o link no grupo.'}</p>
        <div className="share-box">
          <input aria-label="Link compartilhável" readOnly value={createdLink.url} />
          <button className="button primary" onClick={shareLink} type="button">
            {nativeShare ? <Share2 aria-hidden="true" size={17} /> : <Copy aria-hidden="true" size={17} />}
            <span>{copied ? 'Copiado!' : nativeShare ? 'Compartilhar' : 'Copiar link'}</span>
          </button>
        </div>
        <button className="text-button" onClick={() => onPlay(draft, createdLink.url)} type="button">
          Jogar antes de compartilhar <ExternalLink aria-hidden="true" size={15} />
        </button>
      </main>
    )
  }

  return (
    <main className="creator-shell">
      <section className="creator-heading">
        <button className="back-button" onClick={onBack} type="button"><ArrowLeft aria-hidden="true" size={17} /> Voltar ao início</button>
        <span className="eyebrow">MESA DE CRIAÇÃO</span>
        <h1>Crie a sua Trama</h1>
        <p>Quatro temas, quatro palavras em cada. Quanto mais inesperada a conexão, melhor.</p>
      </section>

      <section className="creator-progress" aria-label={`${filledWords} de 16 palavras preenchidas`}>
        <div><span>PROGRESSO</span><strong>{filledWords}/16 palavras</strong></div>
        <div className="progress-track"><span style={{ width: `${(filledWords / 16) * 100}%` }} /></div>
      </section>

      <section className="creator-meta">
        <label>
          <span className="field-label-text">Título da Trama</span>
          <input maxLength={80} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Ex.: Memórias da escola" value={draft.title} />
        </label>
        <label data-testid="author-field-label">
          <span className="field-label-text">Seu nome <span className="optional-label">(opcional)</span></span>
          <input maxLength={40} onChange={(event) => setDraft({ ...draft, author: event.target.value })} placeholder="Como vai aparecer" value={draft.author} />
        </label>
      </section>

      <section className="group-editor-list">
        {draft.groups.map((group, groupIndex) => (
          <fieldset className={`group-editor ${GROUP_COLORS[groupIndex]}`} key={groupIndex}>
            <legend>Grupo {groupIndex + 1}</legend>
            <label>
              Qual é a conexão?
              <input aria-label={`Conexão do grupo ${groupIndex + 1}`} maxLength={50} onChange={(event) => updateGroup(groupIndex, 'label', event.target.value)} placeholder="Ex.: Coisas de festa junina" value={group.label} />
            </label>
            <div className="word-inputs">
              {group.words.map((word, wordIndex) => (
                <label key={wordIndex}>
                  <span>Palavra {wordIndex + 1}</span>
                  <input aria-label={`Grupo ${groupIndex + 1}, palavra ${wordIndex + 1}`} maxLength={24} onChange={(event) => updateGroup(groupIndex, 'word', event.target.value, wordIndex)} placeholder="Digite aqui" value={word} />
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </section>

      {errors.length > 0 && (
        <div className="error-box" role="alert">
          <strong>Tem um fio solto:</strong>
          <ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul>
        </div>
      )}

      <div className="publish-row">
        <button className="button primary large" disabled={publishing} onClick={publish} type="button">
          {publishing ? <LoaderCircle aria-hidden="true" className="spin" size={18} /> : <Share2 aria-hidden="true" size={18} />}
          <span>{publishing ? 'Criando link...' : 'Criar link curto'}</span>
        </button>
      </div>
    </main>
  )
}

function AppHeader({ screen, onBack, onHelp }: { screen: 'home' | 'play' | 'create'; onBack?: () => void; onHelp?: () => void }) {
  return (
    <header className={`topbar topbar-${screen}`}>
      {screen === 'play' ? <IconButton label="Voltar para o início" onClick={onBack ?? (() => undefined)}><ArrowLeft aria-hidden="true" size={21} /></IconButton> : <span aria-hidden="true" className="topbar-spacer" />}
      <div aria-label="TRAMA" className="brand"><BrandMark /><span>TRAMA</span></div>
      <div className="topbar-actions">
        {screen !== 'create' && <IconButton label="Como jogar" onClick={onHelp ?? (() => undefined)}><CircleHelp aria-hidden="true" size={21} /></IconButton>}
      </div>
    </header>
  )
}

function App() {
  const [initialRoute] = useState(initialRouteState)
  const [mode, setMode] = useState<'play' | 'create'>('play')
  const [puzzle, setPuzzle] = useState<Puzzle | null>(initialRoute.puzzle)
  const [loading, setLoading] = useState(initialRoute.loading)
  const [routeError, setRouteError] = useState<string | null>(initialRoute.error)
  const [catalog, setCatalog] = useState<ListedPuzzle[]>([])
  const [catalogLoading, setCatalogLoading] = useState(() => !initialRoute.loading && !initialRoute.puzzle && !initialRoute.error)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [showOnboarding, setShowOnboarding] = useState(() => localStorage.getItem(ONBOARDING_KEY) !== '1')

  const refreshCatalog = useCallback(() => {
    setCatalogLoading(true)
    setCatalogError(null)
    listPuzzles()
      .then((items) => setCatalog(items))
      .catch((error: unknown) => setCatalogError(error instanceof Error ? error.message : 'Não foi possível carregar as Tramas.'))
      .finally(() => setCatalogLoading(false))
  }, [])

  useEffect(() => {
    let active = true
    const slug = parsePuzzleRoute(window.location.pathname)
    if (!slug) return () => { active = false }

    loadPuzzleBySlug(slug)
      .then((loaded) => {
        if (!active) return
        setPuzzle(loaded)
        setLoading(false)
      })
      .catch((error: unknown) => {
        if (!active) return
        setRouteError(error instanceof Error ? error.message : 'Não foi possível abrir esta Trama.')
        setLoading(false)
      })

    return () => { active = false }
  }, [])

  useEffect(() => {
    if (initialRoute.loading || initialRoute.puzzle || initialRoute.error) return
    let active = true
    listPuzzles()
      .then((items) => {
        if (active) setCatalog(items)
      })
      .catch((error: unknown) => {
        if (active) setCatalogError(error instanceof Error ? error.message : 'Não foi possível carregar as Tramas.')
      })
      .finally(() => {
        if (active) setCatalogLoading(false)
      })
    return () => { active = false }
  }, [initialRoute])

  const goHome = () => {
    window.history.pushState({}, '', '/')
    setPuzzle(null)
    setRouteError(null)
    setMode('play')
    refreshCatalog()
  }

  const playPuzzle = (nextPuzzle: Puzzle, url: string) => {
    const target = new URL(url, window.location.origin)
    window.history.pushState({}, '', `${target.pathname}${target.hash}`)
    setPuzzle(nextPuzzle)
    setRouteError(null)
    setMode('play')
  }

  const openCreator = () => {
    setShowOnboarding(false)
    setMode('create')
    setPuzzle(null)
    setRouteError(null)
    window.history.pushState({}, '', '/')
  }

  const dismissOnboarding = () => {
    setShowOnboarding(false)
    localStorage.setItem(ONBOARDING_KEY, '1')
  }

  if (loading) {
    return <div className="loading-state"><LoaderCircle aria-label="Carregando Trama" className="spin" size={28} /></div>
  }

  const isHome = !puzzle && !routeError && mode === 'play'
  const isCreate = !routeError && mode === 'create'
  const screen = puzzle && mode === 'play' ? 'play' : isCreate ? 'create' : 'home'

  return (
    <div className="app">
      <AppHeader screen={screen} onBack={goHome} onHelp={() => setShowOnboarding(true)} />
      {routeError ? <ErrorScreen message={routeError} onCreate={openCreator} onRetry={() => window.location.reload()} /> : isHome ? <Home catalog={catalog} catalogError={catalogError} catalogLoading={catalogLoading} onCreate={openCreator} onPlay={playPuzzle} onRetryCatalog={refreshCatalog} /> : isCreate ? <Creator onBack={goHome} onPlay={playPuzzle} /> : puzzle ? <GameBoard key={encodePuzzle(puzzle)} puzzle={puzzle} /> : null}
      {(isHome || isCreate || routeError) && <footer><span>Trama</span><span>Jogue, crie, compartilhe.</span></footer>}
      {showOnboarding && !isCreate && <OnboardingModal onClose={dismissOnboarding} />}
    </div>
  )
}

export default App
