// Falling-code rain model, shared by the /root `matrix` screensaver (shell/matrix.js) and the
// background rain that fx.js draws as the hunt progresses. Pure state, no DOM. It lives under hunt/
// rather than shell/ because shell/ is served only after /root is unlocked, and every page needs this.

export const TRAIL = 6
export const GLYPHS = '0123456789abcdef$#*+=<>|/\\{}[]:;'

// Each column has a drop head (row index, negative = still above the screen) and its own speed.
export function createRain(width, height, rng) {
  const drops = Array.from({ length: width }, () => ({
    y: 0 - Math.floor(rng() * height * 2), // 0 - x, not -x, so a drop at the top is 0 rather than -0.
    speed: 1 + Math.floor(rng() * 2),
  }))
  return { width, height, drops, tick: 0 }
}

export function stepRain(rain, rng, trail = TRAIL) {
  const drops = rain.drops.map(drop => {
    const y = drop.y + drop.speed
    if (y - trail > rain.height) return { y: 0 - Math.floor(rng() * rain.height), speed: 1 + Math.floor(rng() * 2) }
    return { ...drop, y }
  })
  return { ...rain, drops, tick: rain.tick + 1 }
}

// Glyphs come from position and tick rather than rng, so a frame is a pure function of the state.
export function glyphAt(x, y, tick) {
  const n = Math.abs((x * 7919 + y * 104729 + tick * 31) % GLYPHS.length)
  return GLYPHS[n]
}
