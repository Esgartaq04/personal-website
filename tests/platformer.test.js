import { test, assert, assertEqual, assertDeepEqual } from './harness.js'
import { fakeHost, fakeTimers } from './fakes.js'
import { createStore } from '../hunt/state.js'
import { LEVELS, createGame, keyToAction, parseLevel, render, startPlatformer, step, totalCoins } from '../shell/platformer.js'

// Small maps keep each rule visible. Rows are padded to the widest.
const OPEN = ['          ', '          ', '          ', '          ', ' @        ', '##########']

function run(game, input, ticks) {
  for (let i = 0; i < ticks; i++) game = step(game, input)
  return game
}

test('platformer: parseLevel finds the start, coins, and enemies, and pads rows', () => {
  const level = parseLevel(['@ o', ' E ', '#####'])
  assertEqual(level.width, 5)
  assertDeepEqual(level.start, { x: 0, y: 0 })
  assertDeepEqual(level.coins, ['2,0'])
  assertDeepEqual(level.enemies, [{ x: 1, y: 1, dir: -1 }])
  assertDeepEqual(level.tiles[1], [' ', ' ', ' ', ' ', ' '])
})

test('platformer: gravity pulls the player down until they land', () => {
  const game = run(createGame([['@   ', '    ', '    ', '####']]), {}, 10)
  assertEqual(game.player.y, 2)
  assertEqual(game.player.vy, 0)
})

test('platformer: walking moves one cell a tick and stops at walls', () => {
  let game = createGame([[' @   # ', '#######']])
  game = step(game, { right: true })
  assertEqual(game.player.x, 2)
  game = run(game, { right: true }, 10)
  assertEqual(game.player.x, 4)
})

test('platformer: a jump rises and comes back down', () => {
  let game = createGame([OPEN])
  const groundY = game.player.y
  game = step(game, { jump: true })
  assert(game.player.y < groundY)
  let peak = game.player.y
  for (let i = 0; i < 20; i++) {
    game = step(game, {})
    peak = Math.min(peak, game.player.y)
  }
  assertEqual(game.player.y, groundY)
  assertEqual(groundY - peak, 4)
})

test('platformer: no jumping in mid-air', () => {
  let game = createGame([['@   ', '    ', '    ', '    ', '####']])
  game = step(game, { jump: true })
  assert(game.player.vy >= 0)
})

test('platformer: one-way platforms let you up through and hold you on top', () => {
  let game = createGame([['      ', '      ', ' ==== ', '      ', ' @    ', '######']])
  game = step(game, { jump: true })
  for (let i = 0; i < 20; i++) game = step(game, {})
  assertEqual(game.player.y, 1) // standing on the platform in row 2
})

test('platformer: a jump that peaks inside a platform lands on top of it', () => {
  // The jump rises four cells, which is exactly the platform's row.
  let game = createGame([['      ', ' ==== ', '      ', '      ', '      ', ' @    ', '######']])
  game = step(game, { jump: true })
  for (let i = 0; i < 20; i++) game = step(game, {})
  assertEqual(game.player.y, 0)
})

test('platformer: stepping sideways into a platform puts you on top of it', () => {
  let game = createGame([['      ', ' @==  ', '##    ']])
  game = run(game, { right: true }, 1)
  assertDeepEqual([game.player.x, game.player.y], [2, 0])
  game = run(game, {}, 10)
  assertEqual(game.player.y, 0)
})

test('platformer: spikes cost a life and restart the level', () => {
  let game = createGame([[' @^  F', '######']])
  game = step(game, { right: true })
  assertEqual(game.lives, 2)
  assertEqual(game.player.x, 1)
  assert(game.message.includes('spikes'))
})

test('platformer: falling off the map costs a life', () => {
  let game = createGame([[' @    ', '##  ##']])
  game = step(game, { right: true })
  for (let i = 0; i < 5 && game.lives === 3; i++) game = step(game, {})
  assertEqual(game.lives, 2)
  assert(game.message.includes('fell'))
})

test('platformer: losing the last life ends the game', () => {
  let game = { ...createGame([[' @^  F', '######']]), lives: 1 }
  game = step(game, { right: true })
  assertEqual(game.over, true)
  assertEqual(game.won, false)
})

test('platformer: coins from the attempt that ends the game do not count', () => {
  const levels = [['@o^', '###']]
  const lastLife = run({ ...createGame(levels), lives: 1 }, { right: true }, 2)
  const earlierLife = run(createGame(levels), { right: true }, 2)
  assertEqual(lastLife.over, true)
  assertEqual(lastLife.levelCoins, 0)
  assertEqual(earlierLife.levelCoins, 0)
})

test('platformer: landing on an enemy stomps it', () => {
  // Walls on both sides keep the enemy in place under the player.
  let game = createGame([[' @ ', '   ', '   ', '#E#', '###']])
  game = run(game, {}, 6)
  assertEqual(game.lives, 3)
  assertEqual(game.enemies.length, 0)
})

test('platformer: falling onto a cell an enemy steps into stomps it', () => {
  // Mid-fall, the player drops from row 3 to row 4 on the same (even) tick the enemy steps under it.
  let game = createGame([['  @  ', '     ', '     ', '     ', '   E#', '#####']])
  game = { ...game, tick: 1, player: { ...game.player, y: 3, vy: 1, acc: 0 } }
  game = step(game, {})
  assertEqual(game.lives, 3)
})

test('platformer: walking into an enemy costs a life', () => {
  let game = createGame([[' @ E  ', '######']])
  game = run(game, { right: true }, 3)
  assertEqual(game.lives, 2)
})

test('platformer: enemies turn around at ledges', () => {
  let game = createGame([['@      ', '#      ', '#  E   ', '#  ##  ']])
  for (let i = 0; i < 8; i++) {
    game = step(game, {})
    assert(game.enemies[0].x === 3 || game.enemies[0].x === 4)
  }
})

test('platformer: coins add up and survive into the next level', () => {
  const levels = [[' @oo F', '######'], [' @o  F', '######']]
  let game = run(createGame(levels), { right: true }, 4)
  assertEqual(game.index, 1)
  assertEqual(game.banked, 2)
  game = run(game, { right: true }, 4)
  assertEqual(game.won, true)
  assertEqual(game.banked, 3)
})

test('platformer: render follows the player and shows the status line', () => {
  const game = createGame()
  const lines = render(game, 20).split('\n')
  assertEqual(lines[0], `+${'-'.repeat(20)}+`)
  assert(lines.some(line => line.includes('@')))
  assert(lines.at(-2).startsWith('level 1/3   coins 0   lives 3'))
})

test('platformer: keyToAction maps arrows, letters, and space', () => {
  assertEqual(keyToAction('ArrowLeft'), 'left')
  assertEqual(keyToAction('d'), 'right')
  assertEqual(keyToAction(' '), 'jump')
  assertEqual(keyToAction('W'), 'jump')
  assertEqual(keyToAction('q'), 'quit')
  assertEqual(keyToAction('Shift'), null)
})

// Breadth-first search over the inputs, enemies left out (they can be stomped or dodged).
// Guards against an edit that makes a level impossible.
test('platformer: every level can be finished', () => {
  const inputs = []
  for (const h of [-1, 0, 1]) for (const jump of [false, true]) inputs.push({ left: h < 0, right: h > 0, jump })
  LEVELS.forEach((rows, i) => {
    const queue = [{ ...createGame([rows]), enemies: [] }]
    const seen = new Set()
    let won = false
    while (queue.length > 0 && !won) {
      const state = queue.shift()
      for (const input of inputs) {
        const next = step(state, input)
        if (next.won) won = true
        if (won || next.lives !== state.lives) continue
        const id = `${next.player.x},${next.player.y},${next.player.vy},${next.player.acc}`
        if (seen.has(id)) continue
        seen.add(id)
        queue.push({ ...next, enemies: [], coins: [], tick: 0, messageTicks: 0 })
      }
    }
    assert(won, `level ${i + 1} cannot be finished`)
  })
})

test('platformer: held keys keep walking until released', () => {
  const host = fakeHost()
  const timers = fakeTimers()
  startPlatformer(host, null, { ...timers, levels: [[' @        F', '###########']] })
  host.keyHandler('ArrowRight')
  timers.callback()
  timers.callback()
  assert(host.frames.at(-1).includes('|   @'))
  host.keyUpHandler('ArrowRight')
  timers.callback()
  assert(host.frames.at(-1).includes('|   @'))
})

test('platformer: losing focus releases held keys', () => {
  const host = fakeHost()
  const timers = fakeTimers()
  startPlatformer(host, null, { ...timers, levels: [[' @        F', '###########']] })
  host.keyHandler('ArrowRight')
  timers.callback()
  host.keyUpHandler(null)
  timers.callback()
  assert(host.frames.at(-1).includes('|  @'))
})

test('platformer: a tap between ticks still moves once', () => {
  const host = fakeHost()
  const timers = fakeTimers()
  startPlatformer(host, null, { ...timers, levels: [[' @        F', '###########']] })
  host.keyHandler('d')
  host.keyUpHandler('d')
  timers.callback()
  timers.callback()
  assert(host.frames.at(-1).includes('|  @'))
})

test('platformer: winning saves the best coin count', () => {
  const store = createStore(null)
  const host = fakeHost()
  const timers = fakeTimers()
  startPlatformer(host, store, { ...timers, levels: [[' @o F', '#####']] })
  host.keyHandler('ArrowRight')
  for (let i = 0; i < 3; i++) timers.callback()
  assertDeepEqual(host.finished, ['you win. coins 1/1, best 1/1.'])
  assertEqual(store.get().platformerBest, 1)
  assertEqual(timers.cleared, 1)
})

test('platformer: totalCoins counts every level', () => {
  assertEqual(totalCoins([['@o o', '####'], ['@o', '##']]), 3)
})
