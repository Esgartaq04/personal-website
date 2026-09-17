import { test, assertEqual, assertDeepEqual } from './harness.js'
import { STORAGE_KEY, createStore, emptyState, parseState, serializeState } from '../hunt/state.js'

function memoryStorage(initial = {}) {
  const data = { ...initial }
  return {
    getItem: key => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = String(value)
    },
    data,
  }
}

function throwingStorage() {
  return {
    getItem() {
      throw new Error('SecurityError')
    },
    setItem() {
      throw new Error('QuotaExceededError')
    },
  }
}

test('state: emptyState has no progress', () => {
  assertDeepEqual(emptyState(), { found: [], unlocked: false, snakeHigh: 0 })
})

test('state: parseState round-trips serializeState', () => {
  const state = { found: ['console', 'konami'], unlocked: true, snakeHigh: 12 }
  assertDeepEqual(parseState(serializeState(state)), state)
})

test('state: parseState resets null and non-string input', () => {
  assertDeepEqual(parseState(null), emptyState())
  assertDeepEqual(parseState(undefined), emptyState())
  assertDeepEqual(parseState(42), emptyState())
})

test('state: parseState resets corrupt JSON', () => {
  assertDeepEqual(parseState('{not json'), emptyState())
})

test('state: parseState resets JSON that is not an object', () => {
  assertDeepEqual(parseState('[1,2,3]'), emptyState())
  assertDeepEqual(parseState('"hello"'), emptyState())
  assertDeepEqual(parseState('null'), emptyState())
})

test('state: parseState sanitizes wrong field types', () => {
  const raw = JSON.stringify({ found: ['console', 7, 'console', null, 'cursor'], unlocked: 'yes', snakeHigh: -3 })
  assertDeepEqual(parseState(raw), { found: ['console', 'cursor'], unlocked: false, snakeHigh: 0 })
})

test('state: parseState rejects a fractional high score', () => {
  assertEqual(parseState(JSON.stringify({ snakeHigh: 4.5 })).snakeHigh, 0)
})

test('state: createStore loads what storage holds', () => {
  const stored = serializeState({ found: ['konami'], unlocked: false, snakeHigh: 3 })
  const store = createStore(memoryStorage({ [STORAGE_KEY]: stored }))
  assertDeepEqual(store.get(), { found: ['konami'], unlocked: false, snakeHigh: 3 })
})

test('state: createStore update persists to storage', () => {
  const storage = memoryStorage()
  createStore(storage).update(state => ({ ...state, unlocked: true }))
  assertDeepEqual(parseState(storage.data[STORAGE_KEY]), { found: [], unlocked: true, snakeHigh: 0 })
})

test('state: createStore with null storage works in memory', () => {
  const store = createStore(null)
  store.update(state => ({ ...state, snakeHigh: 9 }))
  assertEqual(store.get().snakeHigh, 9)
})

test('state: createStore survives storage that throws on read and write', () => {
  const store = createStore(throwingStorage())
  assertDeepEqual(store.get(), emptyState())
  assertDeepEqual(store.update(state => ({ ...state, found: ['console'] })).found, ['console'])
  assertDeepEqual(store.get().found, ['console'])
})

// /root loads eggs.js and shell.js, each with its own store. A load-time cache would let one
// silently overwrite the other's newer writes, so stores must read through on every access.
test("state: two stores on one storage see each other's writes", () => {
  const storage = memoryStorage()
  const eggs = createStore(storage)
  const shell = createStore(storage)
  eggs.update(state => ({ ...state, found: ['comment'] }))
  shell.update(state => ({ ...state, unlocked: true }))
  assertDeepEqual(eggs.get(), { found: ['comment'], unlocked: true, snakeHigh: 0 })
})
