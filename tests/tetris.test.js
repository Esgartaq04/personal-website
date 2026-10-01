import { test, assert, assertEqual, assertDeepEqual } from './harness.js'
import { createStore } from '../hunt/state.js'
import {
  NAMES,
  cells,
  clearLines,
  collides,
  createGame,
  drop,
  dropInterval,
  emptyBoard,
  hardDrop,
  keyToAction,
  levelFor,
  move,
  newBag,
  render,
  rotate,
  spawn,
  startTetris,
} from '../shell/tetris.js'

const zero = () => 0

function fakeHost() {
  const host = { frames: [], finished: null, keyHandler: null }
  host.draw = text => host.frames.push(text)
  host.onKey = handler => {
    host.keyHandler = handler
  }
  host.finish = lines => {
    host.finished = lines
  }
  return host
}

function fakeTimers() {
  const timers = { callback: null, intervals: [], cleared: 0 }
  timers.setTimer = (fn, ms) => {
    timers.callback = fn
    timers.intervals.push(ms)
    return timers.intervals.length
  }
  timers.clearTimer = () => {
    timers.cleared++
  }
  return timers
}

// A game with one piece placed by hand on an empty board.
function withPiece(name, x = 3, y = 0, rot = 0) {
  return { ...createGame(zero), piece: { name, rot, x, y } }
}

test('tetris: newBag holds each piece once and is deterministic', () => {
  const bag = newBag(zero)
  assertDeepEqual([...bag].sort(), [...NAMES].sort())
  assertDeepEqual(newBag(zero), bag)
})

test('tetris: createGame spawns a piece at the top with the next one queued', () => {
  const game = createGame(zero)
  assertEqual(game.piece.y, 0)
  assert(NAMES.includes(game.piece.name))
  assert(NAMES.includes(game.next))
  assertEqual(game.over, false)
})

test('tetris: pieces stop at the walls', () => {
  let game = withPiece('O')
  for (let i = 0; i < 20; i++) game = move(game, -1)
  assertEqual(Math.min(...cells(game.piece).map(c => c.x)), 0)
  for (let i = 0; i < 20; i++) game = move(game, 1)
  assertEqual(Math.max(...cells(game.piece).map(c => c.x)), 9)
})

test('tetris: collides checks walls, floor, and filled cells', () => {
  const board = emptyBoard()
  assert(collides(board, { name: 'O', rot: 0, x: -2, y: 0 }))
  assert(collides(board, { name: 'O', rot: 0, x: 3, y: 19 }))
  assert(!collides(board, { name: 'O', rot: 0, x: 3, y: 18 }))
  board[5][4] = 'T'
  assert(collides(board, { name: 'O', rot: 0, x: 3, y: 5 }))
})

test('tetris: rotate kicks off a wall instead of refusing', () => {
  // A vertical I hugging the right wall cannot turn in place.
  const game = withPiece('I', 7, 5, 1)
  assertEqual(Math.max(...cells(game.piece).map(c => c.x)), 9)
  const turned = rotate(game)
  assertEqual(turned.piece.rot, 2)
  assert(cells(turned.piece).every(c => c.x >= 0 && c.x <= 9))
})

test('tetris: drop locks a landed piece and spawns the next', () => {
  let game = withPiece('O', 3, 18)
  const next = game.next
  game = drop(game, zero)
  assertEqual(game.board[19][4], 'O')
  assertEqual(game.board[18][5], 'O')
  assertEqual(game.piece.name, next)
})

test('tetris: hardDrop lands at the bottom and scores two per row', () => {
  const game = hardDrop(withPiece('O', 3, 0), zero)
  assertEqual(game.board[19][4], 'O')
  assertEqual(game.score, 36) // fell 18 rows
})

test('tetris: clearLines removes full rows and drops the rest', () => {
  const board = emptyBoard(4, 4)
  board[3] = ['I', 'I', 'I', 'I']
  board[2] = ['T', null, null, null]
  board[1] = ['I', 'I', 'I', 'I']
  const result = clearLines(board)
  assertEqual(result.cleared, 2)
  assertDeepEqual(result.board[3], ['T', null, null, null])
  assert(result.board.slice(0, 3).every(row => row.every(cell => cell === null)))
})

test('tetris: clearing lines scores by count and level', () => {
  let game = withPiece('I', 3, 0, 1) // vertical I in column 5
  const board = emptyBoard()
  for (let y = 16; y < 20; y++) board[y] = board[y].map((_, x) => (x === 5 ? null : 'O'))
  game = hardDrop({ ...game, board, level: 2 }, zero)
  assertEqual(game.lines, 4)
  assertEqual(game.score, 16 * 2 + 800 * 2)
  assert(game.board.every(row => row.every(cell => cell === null)))
})

test('tetris: levels rise every ten lines and gravity speeds up within limits', () => {
  assertEqual(levelFor(0), 1)
  assertEqual(levelFor(9), 1)
  assertEqual(levelFor(10), 2)
  assert(dropInterval(2) < dropInterval(1))
  assertEqual(dropInterval(99), 100)
})

test('tetris: the game ends when a new piece cannot spawn', () => {
  const game = createGame(zero)
  const board = emptyBoard()
  board[0] = board[0].map(() => 'Z')
  board[1] = board[1].map(() => 'Z')
  assertEqual(spawn({ ...game, board }, zero).over, true)
})

test('tetris: render draws the board, the next piece, and the score', () => {
  const frame = render(createGame(zero), 500)
  const lines = frame.split('\n')
  assertEqual(lines.length, 23)
  assert(lines[1].includes('next'))
  assert(frame.includes('high   500'))
  assert(frame.includes('[]'))
})

test('tetris: keyToAction maps arrows, wasd, space, pause, and quit', () => {
  assertEqual(keyToAction('ArrowLeft'), 'left')
  assertEqual(keyToAction('D'), 'right')
  assertEqual(keyToAction('ArrowUp'), 'rotate')
  assertEqual(keyToAction('s'), 'down')
  assertEqual(keyToAction(' '), 'drop')
  assertEqual(keyToAction('p'), 'pause')
  assertEqual(keyToAction('Escape'), 'quit')
  assertEqual(keyToAction('Enter'), null)
})

test('tetris: pause stops gravity until pressed again', () => {
  const host = fakeHost()
  const timers = fakeTimers()
  startTetris(host, null, { rng: zero, ...timers })
  host.keyHandler('p')
  const frames = host.frames.length
  timers.callback()
  assertEqual(host.frames.length, frames)
  host.keyHandler('p')
  timers.callback()
  assertEqual(host.frames.length, frames + 2)
})

test('tetris: quitting saves a new high score once', () => {
  const store = createStore(null)
  const host = fakeHost()
  const timers = fakeTimers()
  startTetris(host, store, { rng: zero, ...timers })
  host.keyHandler(' ') // hard drop scores
  host.keyHandler('q')
  host.keyHandler('q')
  assert(store.get().tetrisHigh > 0)
  assert(host.finished[0].startsWith('game over. score '))
  assertEqual(timers.cleared, 1)
})
