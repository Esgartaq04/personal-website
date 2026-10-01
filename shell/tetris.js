// Tetris for the /root arcade (unlocked by `sudo 42`, see shell/arcade.js). The rules are pure;
// startTetris drives them through the shell's takeover host, the same way Snake does.
// Gravity runs on setInterval, not requestAnimationFrame, so the game never depends on the page compositing.

export const WIDTH = 10
export const HEIGHT = 20

// Each piece is its rotations, precomputed as [x, y] cells inside a 4x4 box. Rotation is clockwise.
export const PIECES = {
  I: [
    [[0, 1], [1, 1], [2, 1], [3, 1]],
    [[2, 0], [2, 1], [2, 2], [2, 3]],
    [[0, 2], [1, 2], [2, 2], [3, 2]],
    [[1, 0], [1, 1], [1, 2], [1, 3]],
  ],
  O: [[[1, 0], [2, 0], [1, 1], [2, 1]]],
  T: [
    [[1, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [1, 2]],
    [[1, 0], [0, 1], [1, 1], [1, 2]],
  ],
  S: [
    [[1, 0], [2, 0], [0, 1], [1, 1]],
    [[1, 0], [1, 1], [2, 1], [2, 2]],
    [[1, 1], [2, 1], [0, 2], [1, 2]],
    [[0, 0], [0, 1], [1, 1], [1, 2]],
  ],
  Z: [
    [[0, 0], [1, 0], [1, 1], [2, 1]],
    [[2, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [1, 2], [2, 2]],
    [[1, 0], [0, 1], [1, 1], [0, 2]],
  ],
  J: [
    [[0, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [2, 2]],
    [[1, 0], [1, 1], [0, 2], [1, 2]],
  ],
  L: [
    [[2, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [1, 2], [2, 2]],
    [[0, 1], [1, 1], [2, 1], [0, 2]],
    [[0, 0], [1, 0], [1, 1], [1, 2]],
  ],
}

export const NAMES = Object.keys(PIECES)
export const LINE_SCORES = [0, 100, 300, 500, 800]
const KICKS = [0, -1, 1, -2, 2]

// A shuffled bag of all seven pieces, so droughts are short and the sequence is deterministic in tests.
export function newBag(rng) {
  const bag = [...NAMES]
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1)) % (i + 1)
    ;[bag[i], bag[j]] = [bag[j], bag[i]]
  }
  return bag
}

export function emptyBoard(width = WIDTH, height = HEIGHT) {
  return Array.from({ length: height }, () => Array(width).fill(null))
}

export function cells(piece) {
  const shapes = PIECES[piece.name]
  return shapes[piece.rot % shapes.length].map(([x, y]) => ({ x: piece.x + x, y: piece.y + y }))
}

export function collides(board, piece) {
  return cells(piece).some(({ x, y }) => x < 0 || x >= board[0].length || y >= board.length || (y >= 0 && board[y][x] !== null))
}

export function createGame(rng, width = WIDTH, height = HEIGHT) {
  const bag = newBag(rng)
  const base = { board: emptyBoard(width, height), piece: null, next: bag.shift(), bag, score: 0, lines: 0, level: 1, over: false }
  return spawn(base, rng)
}

// Takes the queued piece, queues the next from the bag, and ends the game if it does not fit.
export function spawn(game, rng) {
  const bag = game.bag.length > 0 ? [...game.bag] : newBag(rng)
  const next = bag.shift()
  const piece = { name: game.next, rot: 0, x: Math.floor((game.board[0].length - 4) / 2), y: 0 }
  const spawned = { ...game, piece, next, bag: bag.length > 0 ? bag : newBag(rng) }
  return collides(game.board, piece) ? { ...spawned, over: true } : spawned
}

export function move(game, dx) {
  if (game.over) return game
  const piece = { ...game.piece, x: game.piece.x + dx }
  return collides(game.board, piece) ? game : { ...game, piece }
}

// Tries the rotation in place, then nudged sideways, so pieces can turn against a wall.
export function rotate(game) {
  if (game.over) return game
  const rot = (game.piece.rot + 1) % PIECES[game.piece.name].length
  for (const dx of KICKS) {
    const piece = { ...game.piece, rot, x: game.piece.x + dx }
    if (!collides(game.board, piece)) return { ...game, piece }
  }
  return game
}

export function clearLines(board) {
  const kept = board.filter(row => row.some(cell => cell === null))
  const cleared = board.length - kept.length
  const fresh = Array.from({ length: cleared }, () => Array(board[0].length).fill(null))
  return { board: [...fresh, ...kept], cleared }
}

export function levelFor(lines) {
  return Math.floor(lines / 10) + 1
}

export function dropInterval(level) {
  return Math.max(100, 800 - (level - 1) * 70)
}

function lock(game, rng) {
  const board = game.board.map(row => [...row])
  for (const { x, y } of cells(game.piece)) {
    if (y >= 0) board[y][x] = game.piece.name
  }
  const result = clearLines(board)
  const lines = game.lines + result.cleared
  const score = game.score + LINE_SCORES[result.cleared] * game.level
  return spawn({ ...game, board: result.board, lines, score, level: levelFor(lines) }, rng)
}

// One row down, or lock in place if the piece has landed.
export function drop(game, rng) {
  if (game.over) return game
  const piece = { ...game.piece, y: game.piece.y + 1 }
  return collides(game.board, piece) ? lock(game, rng) : { ...game, piece }
}

// Two points per row, like most versions.
export function hardDrop(game, rng) {
  if (game.over) return game
  let piece = game.piece
  let rows = 0
  while (!collides(game.board, { ...piece, y: piece.y + 1 })) {
    piece = { ...piece, y: piece.y + 1 }
    rows++
  }
  return lock({ ...game, piece, score: game.score + rows * 2 }, rng)
}

export function render(game, high = 0, paused = false) {
  const width = game.board[0].length
  const active = new Set(game.over ? [] : cells(game.piece).map(({ x, y }) => `${x},${y}`))
  const preview = PIECES[game.next][0]
  const side = [
    'next',
    ...[0, 1].map(y => [0, 1, 2, 3].map(x => (preview.some(([px, py]) => px === x && py === y) ? '[]' : '  ')).join('')),
    '',
    `score  ${game.score}`,
    `lines  ${game.lines}`,
    `level  ${game.level}`,
    `high   ${Math.max(high, game.score)}`,
    '',
    paused ? '** paused **' : '',
  ]
  const rows = [`+${'-'.repeat(width * 2)}+`]
  game.board.forEach((row, y) => {
    const line = row.map((cell, x) => (cell !== null || active.has(`${x},${y}`) ? '[]' : ' .')).join('')
    rows.push(`|${line}|  ${side[y] ?? ''}`.trimEnd())
  })
  rows.push(`+${'-'.repeat(width * 2)}+`)
  rows.push('arrows/wasd move, up rotate, space drop, p pause, q quit')
  return rows.join('\n')
}

export function keyToAction(key) {
  const k = typeof key === 'string' ? key.toLowerCase() : ''
  if (k === 'arrowleft' || k === 'a') return 'left'
  if (k === 'arrowright' || k === 'd') return 'right'
  if (k === 'arrowup' || k === 'w' || k === 'x') return 'rotate'
  if (k === 'arrowdown' || k === 's') return 'down'
  if (k === ' ') return 'drop'
  if (k === 'p') return 'pause'
  if (k === 'q' || k === 'escape') return 'quit'
  return null
}

export function startTetris(host, store, options = {}) {
  const {
    rng = Math.random,
    setTimer = (fn, ms) => setInterval(fn, ms),
    clearTimer = id => clearInterval(id),
  } = options
  const high = store ? store.get().tetrisHigh : 0
  let game = createGame(rng)
  let paused = false
  let ended = false
  let timer = null
  let timerLevel = 0

  const draw = () => host.draw(render(game, high, paused))

  // Restarts gravity when the level changes, so the speed-up takes effect.
  function schedule() {
    if (timer !== null && timerLevel === game.level) return
    if (timer !== null) clearTimer(timer)
    timerLevel = game.level
    timer = setTimer(tick, dropInterval(game.level))
  }

  function update(next) {
    game = next
    draw()
    if (game.over) end()
    else schedule()
  }

  function tick() {
    if (!paused && !ended) update(drop(game, rng))
  }

  host.onKey(key => {
    const action = keyToAction(key)
    if (ended || !action) return
    if (action === 'quit') return end()
    if (action === 'pause') {
      paused = !paused
      return draw()
    }
    if (paused) return
    if (action === 'left') update(move(game, -1))
    else if (action === 'right') update(move(game, 1))
    else if (action === 'rotate') update(rotate(game))
    else if (action === 'down') update(drop(game, rng))
    else if (action === 'drop') update(hardDrop(game, rng))
  })

  draw()
  schedule()

  function end() {
    if (ended) return
    ended = true
    clearTimer(timer)
    if (store && game.score > high) store.update(state => ({ ...state, tetrisHigh: game.score }))
    host.finish([`game over. score ${game.score}, lines ${game.lines}, high score ${Math.max(high, game.score)}.`])
  }
}

export const tetrisCommand = {
  desc: 'play tetris',
  usage: 'tetris   (q to quit)',
  run: (args, ctx) => ({ out: [], takeover: host => startTetris(host, ctx.store) }),
}
