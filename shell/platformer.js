// A small ASCII platformer for the /root arcade (unlocked by `sudo 42`, see shell/arcade.js). The rules
// are pure; startPlatformer drives them through the shell's takeover host, like Snake.
// It is the one game that needs key releases (host.onKey's second handler), so walking is smooth
// while a key is held instead of stuttering with the keyboard's auto-repeat.
// Ticks run on setInterval, not requestAnimationFrame.

export const VIEW_WIDTH = 60
export const TICK_MS = 80
export const LIVES = 3

// Physics in cells and ticks. A running jump rises four cells and carries about ten across.
export const JUMP = 1.5
export const GRAVITY = 0.25
export const MAX_FALL = 1

// Tiles: # ground, = one-way platform (stand on it, jump up through it), ^ spikes, o coin,
// E enemy (walks back and forth; stomp it from above), F the exit flag, @ the start.
export const LEVELS = [
  [
    '                                                                                          ',
    '                                                                                          ',
    '                                                                                          ',
    '                                                                                          ',
    '                                            o o o                                         ',
    '                                           =======                                        ',
    '                                 o                          o o                           ',
    '                               =====                      =======                         ',
    '                    o o                                                                   ',
    '                   =====                                                                  ',
    '                                                                                          ',
    '  @       o    o           ^^         o  o    E        ^^         o   E     o        F    ',
    '##########################################   ###############################   ###########',
    '##########################################   ###############################   ###########',
  ],
  [
    '                                                                                                      ',
    '                                                                                                      ',
    '                                                               o o                                    ',
    '                                                              =====                                   ',
    '                                     o                                  o o o                         ',
    '                                   =====                 o            =======                         ',
    '                          o                            =====                                          ',
    '                        =====             E                                       o                   ',
    '               o                       =========                                =====                 ',
    '             =====                                                                         o          ',
    '                                                                                         =====        ',
    '  @     o           ^^^      E          o       ^^       E    o     ^^^    o       E              F   ',
    '#########################  ##############  ######################   #####################  ##########',
    '#########################  ##############  ######################   #####################  ##########',
  ],
  [
    '                                                                                                                    ',
    '                                                                          o                                         ',
    '                                                    o o                 =====                  o o o                ',
    '                                                  ======                                      =======               ',
    '                                    o                        o                   o                                  ',
    '                                  =====        E           =====               =====      E                         ',
    '                    o                       =======                    #                ======                      ',
    '                  =====                                                #                                    o       ',
    '         o                    E                                        #          E                       =====     ',
    '       =====               =======                                     #        =====                               ',
    '                                                                       #                                            ',
    '  @            ^^      o          ^^^     o     E     ^^     o    E    #    o           ^^^      E     o          F ',
    '###################  #############   #######################   ###########  ###########################   ##########',
    '###################  #############   #######################   ###########  ###########################   ##########',
  ],
]

const SOLID = '#'
const key = (x, y) => `${x},${y}`

// Splits a level's map into fixed tiles and the things that move or get picked up.
export function parseLevel(rows) {
  const width = Math.max(...rows.map(row => row.length))
  const tiles = []
  const coins = []
  const enemies = []
  let start = { x: 0, y: 0 }
  rows.forEach((row, y) => {
    const line = []
    for (let x = 0; x < width; x++) {
      const ch = row[x] ?? ' '
      if (ch === '@') start = { x, y }
      else if (ch === 'o') coins.push(key(x, y))
      else if (ch === 'E') enemies.push({ x, y, dir: -1 })
      line.push(ch === '#' || ch === '=' || ch === '^' || ch === 'F' ? ch : ' ')
    }
    tiles.push(line)
  })
  return { width, height: rows.length, tiles, coins, enemies, start }
}

export function totalCoins(levels = LEVELS) {
  return levels.reduce((sum, rows) => sum + parseLevel(rows).coins.length, 0)
}

function tileAt(level, x, y) {
  if (x < 0 || x >= level.width || y < 0 || y >= level.height) return ' '
  return level.tiles[y][x]
}

// What can be stood on: ground and platforms.
function supports(level, x, y) {
  const tile = tileAt(level, x, y)
  return tile === SOLID || tile === '='
}

function loadLevel(game, index) {
  const level = parseLevel(game.levels[index])
  return {
    ...game,
    index,
    level,
    coins: level.coins,
    enemies: level.enemies,
    player: { x: level.start.x, y: level.start.y, vy: 0, acc: 0 },
    levelCoins: 0,
  }
}

export function createGame(levels = LEVELS) {
  const base = { levels, lives: LIVES, banked: 0, tick: 0, over: false, won: false, message: '', messageTicks: 0 }
  return loadLevel(base, 0)
}

function say(game, message) {
  return { ...game, message, messageTicks: 20 }
}

function die(game, why) {
  const lives = game.lives - 1
  if (lives <= 0) return { ...game, lives: 0, over: true, message: why }
  return say(loadLevel({ ...game, lives }, game.index), `${why} lives left: ${lives}`)
}

function finishLevel(game) {
  const banked = game.banked + game.levelCoins
  if (game.index === game.levels.length - 1) return { ...game, banked, levelCoins: 0, over: true, won: true }
  return say(loadLevel({ ...game, banked }, game.index + 1), `level ${game.index + 2}.`)
}

function movePlayer(level, player, input) {
  let { x, y, vy, acc } = player
  const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0)
  if (dx !== 0 && x + dx >= 0 && x + dx < level.width && tileAt(level, x + dx, y) !== SOLID) x += dx

  const grounded = supports(level, x, y + 1)
  if (input.jump && grounded) vy = -JUMP
  if (!grounded || vy < 0) vy = Math.min(vy + GRAVITY, MAX_FALL)
  else {
    vy = 0
    acc = 0
  }

  // One cell at a time, so a fall never skips through the floor. Platforms only stop a fall. acc is
  // rounded rather than truncated, which keeps the jump from hanging at its peak.
  acc += vy
  while (acc <= -0.5) {
    if (tileAt(level, x, y - 1) === SOLID) {
      vy = 0
      acc = 0
      break
    }
    y--
    acc += 1
  }
  while (acc >= 0.5) {
    if (supports(level, x, y + 1)) {
      vy = 0
      acc = 0
      break
    }
    y++
    acc -= 1
  }
  return { x, y, vy, acc }
}

// Enemies step every other tick, turning at walls, ledges, and spikes.
function moveEnemies(level, enemies, tick) {
  if (tick % 2 !== 0) return enemies
  return enemies.map(enemy => {
    const next = enemy.x + enemy.dir
    const ahead = tileAt(level, next, enemy.y)
    const blocked = ahead === SOLID || ahead === '^' || !supports(level, next, enemy.y + 1) || next < 0 || next >= level.width
    return blocked ? { ...enemy, dir: -enemy.dir } : { ...enemy, x: next }
  })
}

// Landing on an enemy from above stomps it; touching one any other way costs a life.
function meetEnemies(game, fromY) {
  const { player } = game
  const hit = game.enemies.find(enemy => enemy.x === player.x && enemy.y === player.y)
  if (!hit) return game
  if (fromY < player.y) {
    return { ...game, enemies: game.enemies.filter(enemy => enemy !== hit), player: { ...player, vy: -1, acc: 0 } }
  }
  return die(game, 'an enemy got you.')
}

// One tick. input is { left, right, jump }, each true while that key is held.
export function step(game, input = {}) {
  if (game.over) return game
  const { level } = game
  const fromY = game.player.y
  const tick = game.tick + 1
  let next = {
    ...game,
    tick,
    player: movePlayer(level, game.player, input),
    messageTicks: Math.max(0, game.messageTicks - 1),
  }
  const { x, y } = next.player
  if (y >= level.height) return die(next, 'you fell.')
  if (tileAt(level, x, y) === '^') return die(next, 'spikes.')

  // die() reloads the level, so a lost life means this tick is over.
  next = meetEnemies(next, fromY)
  if (next.lives !== game.lives) return next
  next = meetEnemies({ ...next, enemies: moveEnemies(level, next.enemies, tick) }, y)
  if (next.lives !== game.lives) return next

  if (next.coins.includes(key(x, y))) {
    next = { ...next, coins: next.coins.filter(coin => coin !== key(x, y)), levelCoins: next.levelCoins + 1 }
  }
  if (tileAt(level, x, y) === 'F') return finishLevel(next)
  return next
}

export function collected(game) {
  return game.banked + game.levelCoins
}

export function render(game, viewWidth = VIEW_WIDTH) {
  const { level, player } = game
  const view = Math.min(viewWidth, level.width)
  const camX = Math.max(0, Math.min(level.width - view, player.x - Math.floor(view / 2)))
  const enemies = new Set(game.enemies.map(enemy => key(enemy.x, enemy.y)))
  const coins = new Set(game.coins)
  const rows = [`+${'-'.repeat(view)}+`]
  for (let y = 0; y < level.height; y++) {
    let row = '|'
    for (let x = camX; x < camX + view; x++) {
      if (x === player.x && y === player.y) row += '@'
      else if (enemies.has(key(x, y))) row += 'E'
      else if (coins.has(key(x, y))) row += 'o'
      else row += level.tiles[y][x]
    }
    rows.push(`${row}|`)
  }
  rows.push(`+${'-'.repeat(view)}+`)
  const status = `level ${game.index + 1}/${game.levels.length}   coins ${collected(game)}   lives ${game.lives}`
  rows.push(game.messageTicks > 0 ? `${status}   ${game.message}` : status)
  rows.push('arrows/a d move, up/w/space jump, q quit')
  return rows.join('\n')
}

export function keyToAction(key) {
  const k = typeof key === 'string' ? key.toLowerCase() : ''
  if (k === 'arrowleft' || k === 'a') return 'left'
  if (k === 'arrowright' || k === 'd') return 'right'
  if (k === 'arrowup' || k === 'w' || k === ' ') return 'jump'
  if (k === 'q' || k === 'escape') return 'quit'
  return null
}

export function startPlatformer(host, store, options = {}) {
  const {
    setTimer = (fn, ms) => setInterval(fn, ms),
    clearTimer = id => clearInterval(id),
    levels = LEVELS,
  } = options
  const best = store ? store.get().platformerBest : 0
  const total = totalCoins(levels)
  let game = createGame(levels)
  let ended = false
  // held tracks keys that are down; pressed remembers a tap that came and went between two ticks.
  const held = { left: false, right: false, jump: false }
  const pressed = { left: false, right: false, jump: false }

  host.draw(render(game))

  const timer = setTimer(() => {
    const input = {}
    for (const name of Object.keys(held)) {
      input[name] = held[name] || pressed[name]
      pressed[name] = false
    }
    game = step(game, input)
    host.draw(render(game))
    if (game.over) end()
  }, TICK_MS)

  host.onKey(
    key => {
      const action = keyToAction(key)
      if (action === 'quit') end()
      else if (action) {
        held[action] = true
        pressed[action] = true
      }
    },
    key => {
      const action = keyToAction(key)
      if (action && action !== 'quit') held[action] = false
    },
  )

  function end() {
    if (ended) return
    ended = true
    clearTimer(timer)
    const coins = collected(game)
    if (store && coins > best) store.update(state => ({ ...state, platformerBest: coins }))
    const record = `best ${Math.max(best, coins)}/${total}`
    if (game.won) host.finish([`you win. coins ${coins}/${total}, ${record}.`])
    else if (game.over) host.finish([`game over on level ${game.index + 1}. coins ${coins}, ${record}.`])
    else host.finish([`quit on level ${game.index + 1}. coins ${coins}, ${record}.`])
  }
}

export const platformerCommand = {
  desc: 'play a small platformer',
  usage: 'platformer   (q to quit)',
  run: (args, ctx) => ({ out: [], takeover: host => startPlatformer(host, ctx.store) }),
}
