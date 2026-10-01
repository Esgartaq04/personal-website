// Progress for the easter egg hunt, kept under one localStorage key. Never throws.
// None of it is trusted: whether /root is unlocked lives in a signed HttpOnly cookie (lib/token.js),
// so editing this key can change the progress badge but cannot open the shell.

export const STORAGE_KEY = 'egt.eggs'

export function emptyState() {
  return { found: [], texts: {}, snakeHigh: 0, fx: 'on', arcade: false, tetrisHigh: 0, platformerBest: 0 }
}

export function parseState(raw) {
  if (typeof raw !== 'string') return emptyState()
  let data
  try {
    data = JSON.parse(raw)
  } catch {
    return emptyState()
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return emptyState()
  const found = Array.isArray(data.found) ? [...new Set(data.found.filter(id => typeof id === 'string'))] : []
  const texts = {}
  if (data.texts && typeof data.texts === 'object' && !Array.isArray(data.texts)) {
    for (const [id, text] of Object.entries(data.texts)) {
      if (typeof text === 'string') texts[id] = text
    }
  }
  const score = value => (Number.isInteger(value) && value > 0 ? value : 0)
  const fx = data.fx === 'off' ? 'off' : 'on' // The corruption effects; `fsck` in the shell turns them off.
  const arcade = data.arcade === true // The /root arcade folder, unlocked by `sudo 42` (shell/arcade.js).
  return {
    found,
    texts,
    snakeHigh: score(data.snakeHigh),
    fx,
    arcade,
    tetrisHigh: score(data.tetrisHigh),
    platformerBest: score(data.platformerBest),
  }
}

export function serializeState(state) {
  return JSON.stringify({
    found: state.found,
    texts: state.texts,
    snakeHigh: state.snakeHigh,
    fx: state.fx,
    arcade: state.arcade,
    tetrisHigh: state.tetrisHigh,
    platformerBest: state.platformerBest,
  })
}

// Returns localStorage if it is usable, else null. Private browsing and blocked site data both throw.
export function safeStorage() {
  try {
    const probe = '__egt_probe__'
    localStorage.setItem(probe, probe)
    localStorage.removeItem(probe)
    return localStorage
  } catch {
    return null
  }
}

// Reads through to storage on every access so several stores on one page stay consistent.
// If storage is missing or throws, the in-memory copy carries the session.
export function createStore(storage) {
  let memory = emptyState()

  function load() {
    if (storage) {
      try {
        const raw = storage.getItem(STORAGE_KEY)
        if (raw !== null) memory = parseState(raw)
      } catch {
        // Unreadable storage: keep the in-memory copy.
      }
    }
    return memory
  }

  return {
    get: load,
    update(fn) {
      memory = fn(load())
      if (storage) {
        try {
          storage.setItem(STORAGE_KEY, serializeState(memory))
        } catch {
          // Quota or privacy mode: the in-memory copy still holds.
        }
      }
      return memory
    },
  }
}
