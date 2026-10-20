// Shared by the takeover programs (snake, tetris, platformer, matrix). Each start function takes
// setTimer/clearTimer options so tests can tick by hand; these are the real ones.

export const setTimer = (fn, ms) => setInterval(fn, ms)
export const clearTimer = id => clearInterval(id)

// Arrows and WASD as directions, q or Escape to quit. Games map the rest of their keys themselves.
export function directionKey(key) {
  const k = typeof key === 'string' ? key.toLowerCase() : ''
  if (k === 'arrowup' || k === 'w') return 'up'
  if (k === 'arrowdown' || k === 's') return 'down'
  if (k === 'arrowleft' || k === 'a') return 'left'
  if (k === 'arrowright' || k === 'd') return 'right'
  if (k === 'q' || k === 'escape') return 'quit'
  return null
}
