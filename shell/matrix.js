// Falling-code screensaver for /root. Pure rain state plus a driver that runs it through the shell's
// takeover host, the same way Snake does. Ticks run on setInterval, not requestAnimationFrame.

export const WIDTH = 60
export const HEIGHT = 16
export const TRAIL = 6
export const TICK_MS = 80
export const GLYPHS = '0123456789abcdef$#*+=<>|/\\{}[]:;'

// Each column has a drop head (row index, negative = still above the screen) and its own speed.
export function createRain(width, height, rng) {
  const drops = Array.from({ length: width }, () => ({
    y: 0 - Math.floor(rng() * height * 2), // 0 - x, not -x, so a drop at the top is 0 rather than -0.
    speed: 1 + Math.floor(rng() * 2),
  }))
  return { width, height, drops, tick: 0 }
}

export function stepRain(rain, rng) {
  const drops = rain.drops.map(drop => {
    const y = drop.y + drop.speed
    if (y - TRAIL > rain.height) return { y: 0 - Math.floor(rng() * rain.height), speed: 1 + Math.floor(rng() * 2) }
    return { ...drop, y }
  })
  return { ...rain, drops, tick: rain.tick + 1 }
}

// Glyphs come from position and tick rather than rng, so a frame is a pure function of the state.
export function glyphAt(x, y, tick) {
  const n = Math.abs((x * 7919 + y * 104729 + tick * 31) % GLYPHS.length)
  return GLYPHS[n]
}

export function renderRain(rain) {
  const rows = []
  for (let y = 0; y < rain.height; y++) {
    let row = ''
    for (let x = 0; x < rain.width; x++) {
      const head = rain.drops[x].y
      row += y <= head && y > head - TRAIL ? glyphAt(x, y, rain.tick) : ' '
    }
    rows.push(row)
  }
  rows.push('', 'press q to wake up')
  return rows.join('\n')
}

export function startMatrix(host, options = {}) {
  const {
    rng = Math.random,
    setTimer = (fn, ms) => setInterval(fn, ms),
    clearTimer = id => clearInterval(id),
    width = WIDTH,
    height = HEIGHT,
  } = options
  let rain = createRain(width, height, rng)
  let ended = false

  host.draw(renderRain(rain))

  const timer = setTimer(() => {
    rain = stepRain(rain, rng)
    host.draw(renderRain(rain))
  }, TICK_MS)

  host.onKey(key => {
    const k = typeof key === 'string' ? key.toLowerCase() : ''
    if (k === 'q' || k === 'escape') end()
  })

  function end() {
    if (ended) return
    ended = true
    clearTimer(timer)
    host.finish(['wake up, visitor.'])
  }
}

export const matrixCommand = {
  desc: 'falling-code screensaver',
  usage: 'matrix   (q to quit)',
  run: () => ({ out: [], takeover: host => startMatrix(host) }),
}
