// Progress for the easter egg hunt, kept under one localStorage key. Never throws.

export const STORAGE_KEY = 'egt.eggs'

export function emptyState() {
  return { found: [], unlocked: false, snakeHigh: 0 }
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
  const unlocked = data.unlocked === true
  const snakeHigh = Number.isInteger(data.snakeHigh) && data.snakeHigh > 0 ? data.snakeHigh : 0
  return { found, unlocked, snakeHigh }
}

export function serializeState(state) {
  return JSON.stringify({ found: state.found, unlocked: state.unlocked, snakeHigh: state.snakeHigh })
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
