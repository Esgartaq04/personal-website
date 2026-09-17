import { test, assert, assertEqual, assertDeepEqual } from './harness.js'
import { emptyState } from '../hunt/state.js'
import {
  FRAGMENTS,
  KONAMI,
  PASSPHRASE,
  bannerText,
  countFound,
  fragmentById,
  fragmentByText,
  isPassphrase,
  isTouchOnly,
  markFound,
  nextHint,
  progressLabel,
  pushKey,
  registerClick,
  shouldIgnoreKeyTarget,
  statusLines,
  toastText,
  unlockAttempt,
} from '../hunt/trail.js'

test('trail: five fragments assemble the passphrase', () => {
  assertEqual(FRAGMENTS.length, 5)
  assertDeepEqual(FRAGMENTS.map(f => f.id), ['console', 'cursor', 'comment', 'konami', 'robots'])
  assertEqual(PASSPHRASE, 'kernel_panic_at_0x00')
})

test('trail: isPassphrase ignores case and surrounding whitespace', () => {
  assert(isPassphrase('kernel_panic_at_0x00'))
  assert(isPassphrase('  KERNEL_PANIC_AT_0X00\n'))
})

test('trail: isPassphrase rejects near misses and non-strings', () => {
  assert(!isPassphrase('kernel_panic_at_0x0'))
  assert(!isPassphrase('kernel panic at 0x00'))
  assert(!isPassphrase(''))
  assert(!isPassphrase(null))
})

test('trail: fragmentByText matches whole fragment text only', () => {
  assertEqual(fragmentByText('nic_').id, 'comment')
  assertEqual(fragmentByText(' 0X00 ').id, 'robots')
  assertEqual(fragmentByText('nic'), null)
  assertEqual(fragmentByText(undefined), null)
})

test('trail: fragmentById returns null for unknown ids', () => {
  assertEqual(fragmentById('cursor').text, 'el_pa')
  assertEqual(fragmentById('nope'), null)
})

test('trail: every fragment has a hint, and no hint uses an extensionless page URL', () => {
  for (const fragment of FRAGMENTS) {
    assert(typeof fragment.hint === 'string' && fragment.hint.length > 0, `${fragment.id} has no hint`)
    assert(!/\/(home|about|projects|contact|experience)\b/.test(fragment.hint), `${fragment.id} hint names a URL`)
  }
})

test('trail: markFound adds a new fragment once', () => {
  const first = markFound(emptyState(), 'konami')
  assert(first.isNew)
  assertDeepEqual(first.state.found, ['konami'])
  const second = markFound(first.state, 'konami')
  assert(!second.isNew)
  assertEqual(second.state, first.state, 'a repeat find returns the same state object')
})

test('trail: markFound ignores unknown ids', () => {
  const result = markFound(emptyState(), 'bogus')
  assert(!result.isNew)
  assertDeepEqual(result.state.found, [])
})

test('trail: markFound does not mutate its input', () => {
  const state = emptyState()
  markFound(state, 'console')
  assertDeepEqual(state.found, [])
})

test('trail: countFound and progressLabel ignore unknown stored ids', () => {
  const state = { found: ['console', 'tampered', 'robots'], unlocked: false, snakeHigh: 0 }
  assertEqual(countFound(state), 2)
  assertEqual(progressLabel(state), '[2/5]')
})

test('trail: toastText formats the acquisition message', () => {
  assertEqual(toastText(fragmentById('comment'), 3), 'FRAGMENT 3/5 ACQUIRED :: "nic_"')
})

test('trail: statusLines masks unfound fragments in trail order', () => {
  const state = { found: ['konami'], unlocked: false, snakeHigh: 0 }
  assertDeepEqual(statusLines(state), ['  1. ????', '  2. ????', '  3. ????', '  4. at_', '  5. ????'])
})

test('trail: nextHint points at the first unfound fragment in trail order', () => {
  const state = { found: ['console', 'comment'], unlocked: false, snakeHigh: 0 }
  assertEqual(nextHint(state), fragmentById('cursor').hint)
})

test('trail: nextHint is null once everything is found', () => {
  const state = { found: FRAGMENTS.map(f => f.id), unlocked: false, snakeHigh: 0 }
  assertEqual(nextHint(state), null)
})

test('trail: bannerText lines share one width and mention hunt()', () => {
  const lines = bannerText().split('\n')
  assert(lines.every(line => line.length === lines[0].length), 'banner lines are ragged')
  assert(bannerText().includes('hunt()'))
})

const KONAMI_KEYS = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']

function feed(keys) {
  let buffer = []
  let completions = 0
  for (const key of keys) {
    const result = pushKey(buffer, key)
    buffer = result.buffer
    if (result.complete) completions++
  }
  return completions
}

test('trail: pushKey completes on the Konami code', () => {
  assertEqual(KONAMI.length, 10)
  assertEqual(feed(KONAMI_KEYS), 1)
})

test('trail: pushKey accepts uppercase B and A', () => {
  assertEqual(feed([...KONAMI_KEYS.slice(0, 8), 'B', 'A']), 1)
})

test('trail: pushKey ignores modifier keys so Shift+B still counts', () => {
  assertEqual(feed([...KONAMI_KEYS.slice(0, 8), 'Shift', 'B', 'Shift', 'A']), 1)
})

test('trail: pushKey completes after an extra leading ArrowUp', () => {
  assertEqual(feed(['ArrowUp', ...KONAMI_KEYS]), 1)
})

test('trail: pushKey completes after unrelated keys', () => {
  assertEqual(feed(['x', 'Enter', 'ArrowDown', ...KONAMI_KEYS]), 1)
})

test('trail: pushKey does not complete on a broken sequence', () => {
  assertEqual(feed(['ArrowUp', 'ArrowUp', 'ArrowDown', 'x', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']), 0)
})

test('trail: pushKey clears its buffer on completion', () => {
  let buffer = []
  let result = null
  for (const key of KONAMI_KEYS) {
    result = pushKey(buffer, key)
    buffer = result.buffer
  }
  assert(result.complete)
  assertDeepEqual(result.buffer, [])
})

test('trail: registerClick triggers on three clicks inside the window', () => {
  let result = registerClick([], 0)
  assert(!result.triggered)
  result = registerClick(result.times, 400)
  assert(!result.triggered)
  result = registerClick(result.times, 900)
  assert(result.triggered)
  assertDeepEqual(result.times, [])
})

test('trail: registerClick forgets clicks older than the window', () => {
  let result = registerClick([], 0)
  result = registerClick(result.times, 1000)
  result = registerClick(result.times, 2600)
  assert(!result.triggered, 'the click at 0 expired before the third click')
  assertDeepEqual(result.times, [2600])
})

test('trail: shouldIgnoreKeyTarget ignores typing surfaces', () => {
  assert(shouldIgnoreKeyTarget({ tagName: 'INPUT' }))
  assert(shouldIgnoreKeyTarget({ tagName: 'textarea' }))
  assert(shouldIgnoreKeyTarget({ tagName: 'SELECT' }))
  assert(shouldIgnoreKeyTarget({ tagName: 'DIV', isContentEditable: true }))
})

test('trail: shouldIgnoreKeyTarget allows ordinary targets', () => {
  assert(!shouldIgnoreKeyTarget({ tagName: 'BODY' }))
  assert(!shouldIgnoreKeyTarget({ tagName: 'A', isContentEditable: false }))
  assert(!shouldIgnoreKeyTarget({}), 'document has no tagName')
  assert(!shouldIgnoreKeyTarget(null))
})

function fakeMatchMedia(matching) {
  return query => ({ matches: matching.includes(query) })
}

test('trail: isTouchOnly is true for a coarse pointer with no fine pointer', () => {
  assert(isTouchOnly(fakeMatchMedia(['(pointer: coarse)'])))
})

test('trail: isTouchOnly is false for laptops, touchscreen laptops, and missing matchMedia', () => {
  assert(!isTouchOnly(fakeMatchMedia(['(pointer: fine)', '(any-pointer: fine)'])))
  assert(!isTouchOnly(fakeMatchMedia(['(pointer: coarse)', '(any-pointer: fine)'])))
  assert(!isTouchOnly(undefined))
})

test('trail: unlockAttempt grants access on the passphrase', () => {
  const result = unlockAttempt('kernel_panic_at_0x00', 2)
  assert(result.ok)
  assertEqual(result.failures, 2)
  assertEqual(result.lines[0], 'ACCESS GRANTED')
})

test('trail: unlockAttempt counts failures and hints on every third', () => {
  const first = unlockAttempt('guess', 0)
  assert(!first.ok)
  assertDeepEqual(first.lines, ['ACCESS DENIED [1]'])
  const third = unlockAttempt('guess', 2)
  assertEqual(third.failures, 3)
  assertEqual(third.lines.length, 2)
  assert(third.lines[1].startsWith('hint:'))
})
