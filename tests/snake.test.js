import { test, assert, assertEqual, assertDeepEqual } from './harness.js'
import { createStore } from '../hunt/state.js'
import { createGame, keyToAction, placeFood, render, snakeCommand, startSnake, step, turn } from '../shell/snake.js'

const zero = () => 0

function game(overrides = {}) {
  return {
    width: 10,
    height: 5,
    snake: [{ x: 5, y: 2 }, { x: 4, y: 2 }, { x: 3, y: 2 }],
    dir: 'right',
    nextDir: 'right',
    food: { x: 0, y: 0 },
    score: 0,
    over: false,
    ...overrides,
  }
}

function fakeHost() {
  const host = { frames: [], finished: null, finishCount: 0, keyHandler: null }
  host.draw = text => host.frames.push(text)
  host.onKey = handler => {
    host.keyHandler = handler
  }
  host.finish = lines => {
    host.finished = lines
    host.finishCount++
  }
  return host
}

function fakeTimers() {
  const timers = { callback: null, cleared: false }
  timers.setTimer = fn => {
    timers.callback = fn
    return 1
  }
  timers.clearTimer = () => {
    timers.cleared = true
  }
  return timers
}

test('snake: createGame centers a three-cell snake heading right', () => {
  const g = createGame(10, 5, zero)
  assertDeepEqual(g.snake, [{ x: 5, y: 2 }, { x: 4, y: 2 }, { x: 3, y: 2 }])
  assertEqual(g.dir, 'right')
  assertEqual(g.score, 0)
  assertEqual(g.over, false)
})

test('snake: placeFood picks free cells deterministically from rng', () => {
  const g = createGame(10, 5, zero)
  assertDeepEqual(g.food, { x: 0, y: 0 })
  assertDeepEqual(placeFood(g, () => 0.9999), { x: 9, y: 4 })
})

test('snake: placeFood returns null when the board is full', () => {
  assertEqual(placeFood({ width: 2, height: 1, snake: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }, zero), null)
})

test('snake: step moves the head forward and drops the tail', () => {
  const next = step(game(), zero)
  assertDeepEqual(next.snake, [{ x: 6, y: 2 }, { x: 5, y: 2 }, { x: 4, y: 2 }])
  assertEqual(next.over, false)
})

test('snake: turn ignores reversing into the body', () => {
  assertEqual(turn(game(), 'left').nextDir, 'right')
})

test('snake: turn accepts a perpendicular direction and step applies it', () => {
  const next = step(turn(game(), 'up'), zero)
  assertDeepEqual(next.snake[0], { x: 5, y: 1 })
  assertEqual(next.dir, 'up')
})

test('snake: turn ignores unknown directions', () => {
  const state = game()
  assertEqual(turn(state, 'sideways'), state)
})

test('snake: eating grows the snake, scores, and moves the food', () => {
  const next = step(game({ food: { x: 6, y: 2 } }), zero)
  assertEqual(next.snake.length, 4)
  assertEqual(next.score, 1)
  assertDeepEqual(next.food, { x: 0, y: 0 })
})

test('snake: hitting a wall ends the game', () => {
  assertEqual(step(game({ snake: [{ x: 9, y: 2 }, { x: 8, y: 2 }] }), zero).over, true)
})

test('snake: running into the body ends the game', () => {
  const snake = [{ x: 2, y: 2 }, { x: 2, y: 3 }, { x: 1, y: 3 }, { x: 1, y: 2 }, { x: 1, y: 1 }, { x: 0, y: 1 }]
  assertEqual(step(game({ snake, dir: 'up', nextDir: 'left' }), zero).over, true)
})

test('snake: moving into the cell the tail is leaving is allowed', () => {
  const snake = [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 1, y: 2 }]
  const next = step(game({ snake, dir: 'left', nextDir: 'down' }), zero)
  assertEqual(next.over, false)
  assertDeepEqual(next.snake[0], { x: 1, y: 2 })
})

test('snake: step does nothing once the game is over', () => {
  const over = game({ over: true })
  assertEqual(step(over, zero), over)
})

test('snake: filling the board ends the game after the final bite', () => {
  const next = step(game({ width: 3, height: 1, snake: [{ x: 1, y: 0 }, { x: 0, y: 0 }], food: { x: 2, y: 0 } }), zero)
  assertEqual(next.score, 1)
  assertEqual(next.food, null)
  assertEqual(next.over, true)
})

test('snake: render draws a bordered grid with head, body, food, and score', () => {
  const state = game({ width: 4, height: 2, snake: [{ x: 1, y: 0 }, { x: 0, y: 0 }], food: { x: 3, y: 1 }, score: 2 })
  const rows = render(state, 5).split('\n')
  assertDeepEqual(rows.slice(0, 4), ['+----+', '|o@  |', '|   *|', '+----+'])
  assert(rows[4].startsWith('score 2   high 5'))
})

test('snake: keyToAction maps arrows, wasd, and quit keys', () => {
  assertEqual(keyToAction('ArrowUp'), 'up')
  assertEqual(keyToAction('S'), 'down')
  assertEqual(keyToAction('a'), 'left')
  assertEqual(keyToAction('ArrowRight'), 'right')
  assertEqual(keyToAction('Escape'), 'quit')
  assertEqual(keyToAction('q'), 'quit')
  assertEqual(keyToAction('x'), null)
})

test('snake: snakeCommand hands the shell a takeover', () => {
  const result = snakeCommand.run([], { store: null })
  assertDeepEqual(result.out, [])
  assertEqual(typeof result.takeover, 'function')
})

test('snake: startSnake quits on q and stops the timer', () => {
  const host = fakeHost()
  const timers = fakeTimers()
  startSnake(host, createStore(null), { rng: zero, setTimer: timers.setTimer, clearTimer: timers.clearTimer })
  assertEqual(host.frames.length, 1)
  host.keyHandler('q')
  assert(timers.cleared)
  assertDeepEqual(host.finished, ['game over. score 0, high score 0.'])
})

// On a 4x1 board the snake fills three cells, so the only free cell holds the food and the first tick eats it.
test('snake: startSnake records a new high score when the game ends', () => {
  const store = createStore(null)
  const host = fakeHost()
  const timers = fakeTimers()
  startSnake(host, store, { rng: zero, setTimer: timers.setTimer, clearTimer: timers.clearTimer, width: 4, height: 1 })
  timers.callback()
  assertDeepEqual(host.finished, ['game over. score 1, high score 1.'])
  assertEqual(store.get().snakeHigh, 1)
})

test('snake: finish is reported once even if quit follows game over', () => {
  const host = fakeHost()
  const timers = fakeTimers()
  startSnake(host, createStore(null), { rng: zero, setTimer: timers.setTimer, clearTimer: timers.clearTimer, width: 4, height: 1 })
  timers.callback()
  host.keyHandler('q')
  assertEqual(host.finishCount, 1)
})
