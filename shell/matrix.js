// Falling-code screensaver for /root. The rain model is in hunt/rain.js; this renders it as text and
// drives it through the shell's takeover host, the same way Snake does.
// Ticks run on setInterval, not requestAnimationFrame.

import { GLYPHS, TRAIL, createRain, glyphAt, stepRain } from '../hunt/rain.js'

export { GLYPHS, TRAIL, createRain, glyphAt, stepRain }

export const WIDTH = 60
export const HEIGHT = 16
export const TICK_MS = 80

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
