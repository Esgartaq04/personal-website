// Snake for /root. The rules are pure; startSnake drives them through the shell's takeover host.
// Ticks run on setInterval, not requestAnimationFrame, so the game never depends on the page compositing.

export const DIRECTIONS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' }

export const WIDTH = 30
export const HEIGHT = 15
export const TICK_MS = 110

export function createGame(width, height, rng) {
  const x = Math.floor(width / 2)
  const y = Math.floor(height / 2)
  const base = {
    width,
    height,
    snake: [{ x, y }, { x: x - 1, y }, { x: x - 2, y }],
    dir: 'right',
    nextDir: 'right',
    food: null,
    score: 0,
    over: false,
  }
  return { ...base, food: placeFood(base, rng) }
}

export function placeFood(game, rng) {
  const free = []
  for (let y = 0; y < game.height; y++) {
    for (let x = 0; x < game.width; x++) {
      if (!game.snake.some(p => p.x === x && p.y === y)) free.push({ x, y })
    }
  }
  if (free.length === 0) return null
  return free[Math.floor(rng() * free.length)]
}

// Compares against the direction last moved, not the queued one, so two fast
// key presses between ticks cannot reverse the snake into itself.
export function turn(game, dir) {
  if (!DIRECTIONS[dir] || dir === OPPOSITE[game.dir]) return game
  return { ...game, nextDir: dir }
}

export function step(game, rng) {
  if (game.over) return game
  const dir = game.nextDir
  const head = game.snake[0]
  const next = { x: head.x + DIRECTIONS[dir].x, y: head.y + DIRECTIONS[dir].y }
  const eating = game.food !== null && next.x === game.food.x && next.y === game.food.y
  // Unless it is eating, the tail moves away this tick, so its cell is safe to enter.
  const body = eating ? game.snake : game.snake.slice(0, -1)
  const hitWall = next.x < 0 || next.y < 0 || next.x >= game.width || next.y >= game.height
  const hitSelf = body.some(p => p.x === next.x && p.y === next.y)
  if (hitWall || hitSelf) return { ...game, dir, over: true }
  const snake = [next, ...body]
  if (!eating) return { ...game, dir, snake }
  const grown = { ...game, dir, snake, score: game.score + 1 }
  const food = placeFood(grown, rng)
  return { ...grown, food, over: food === null }
}

export function render(game, high = 0) {
  const border = `+${'-'.repeat(game.width)}+`
  const rows = [border]
  for (let y = 0; y < game.height; y++) {
    let row = '|'
    for (let x = 0; x < game.width; x++) {
      const index = game.snake.findIndex(p => p.x === x && p.y === y)
      if (index === 0) row += '@'
      else if (index > 0) row += 'o'
      else if (game.food && game.food.x === x && game.food.y === y) row += '*'
      else row += ' '
    }
    rows.push(`${row}|`)
  }
  rows.push(border)
  rows.push(`score ${game.score}   high ${Math.max(high, game.score)}   arrows/wasd to move, q to quit`)
  return rows.join('\n')
}

export function keyToAction(key) {
  const k = typeof key === 'string' ? key.toLowerCase() : ''
  if (k === 'arrowup' || k === 'w') return 'up'
  if (k === 'arrowdown' || k === 's') return 'down'
  if (k === 'arrowleft' || k === 'a') return 'left'
  if (k === 'arrowright' || k === 'd') return 'right'
  if (k === 'q' || k === 'escape') return 'quit'
  return null
}

export function startSnake(host, store, options = {}) {
  const {
    rng = Math.random,
    setTimer = (fn, ms) => setInterval(fn, ms),
    clearTimer = id => clearInterval(id),
    width = WIDTH,
    height = HEIGHT,
  } = options
  const high = store ? store.get().snakeHigh : 0
  let game = createGame(width, height, rng)
  let ended = false

  host.draw(render(game, high))

  const timer = setTimer(() => {
    game = step(game, rng)
    host.draw(render(game, high))
    if (game.over) end()
  }, TICK_MS)

  host.onKey(key => {
    const action = keyToAction(key)
    if (action === 'quit') end()
    else if (action) game = turn(game, action)
  })

  function end() {
    if (ended) return
    ended = true
    clearTimer(timer)
    if (store && game.score > high) store.update(state => ({ ...state, snakeHigh: game.score }))
    host.finish([`game over. score ${game.score}, high score ${Math.max(high, game.score)}.`])
  }
}

export const snakeCommand = {
  desc: 'play snake',
  run: (args, ctx) => ({ out: [], takeover: host => startSnake(host, ctx.store) }),
}
