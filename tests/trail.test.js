import { test, assert, assertEqual, assertDeepEqual } from './harness.js'
import { emptyState } from '../hunt/state.js'
import {
  FRAGMENTS,
  KONAMI,
  SECRET_IDS,
  bannerText,
  countFound,
  fragmentById,
  fragmentByText,
  isTouchOnly,
  fragmentText,
  markFound,
  normalizePassphrase,
  nextHint,
  progressLabel,
  pushKey,
  registerClick,
  shouldIgnoreKeyTarget,
  statusLines,
  toastText,
  unlockAttempt,
} from '../hunt/trail.js'

test('trail: five fragments in trail order', () => {
  assertEqual(FRAGMENTS.length, 5)
  assertDeepEqual(FRAGMENTS.map(f => f.id), ['console', 'cursor', 'comment', 'konami', 'robots'])
})

// The whole point of the server half: the browser bundle must not be able to assemble the passphrase.
test('trail: secret fragments carry no text in client code', () => {
  assertDeepEqual(SECRET_IDS, ['console', 'cursor', 'konami'])
  for (const id of SECRET_IDS) assertEqual(fragmentById(id).text, null)
  for (const id of ['comment', 'robots']) assert(typeof fragmentById(id).text === 'string', `${id} should be public`)
})

test('trail: normalizePassphrase trims and lowercases, and blanks non-strings', () => {
  assertEqual(normalizePassphrase('  ABC_def\n'), 'abc_def')
  assertEqual(normalizePassphrase(null), '')
  assertEqual(normalizePassphrase(42), '')
})

test('trail: fragmentByText matches whole public fragment text only', () => {
  const comment = fragmentById('comment').text
  assertEqual(fragmentByText(comment).id, 'comment')
  assertEqual(fragmentByText(` ${fragmentById('robots').text.toUpperCase()} `).id, 'robots')
  assertEqual(fragmentByText(comment.slice(0, -1)), null)
  assertEqual(fragmentByText(undefined), null)
})

test('trail: fragmentByText matches secret text only once it has been earned', () => {
  assertEqual(fragmentByText('zz_'), null)
  assertEqual(fragmentByText('zz_', { konami: 'zz_' }).id, 'konami')
})

test('trail: fragmentText prefers public text, then earned text, else null', () => {
  assertEqual(fragmentText(fragmentById('robots')), fragmentById('robots').text)
  assertEqual(fragmentText(fragmentById('cursor'), { cursor: 'q_' }), 'q_')
  assertEqual(fragmentText(fragmentById('cursor')), null)
})

test('trail: fragmentById returns null for unknown ids', () => {
  assertEqual(fragmentById('comment').id, 'comment')
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
  const state = { found: ['console', 'tampered', 'robots'], texts: {}, snakeHigh: 0 }
  assertEqual(countFound(state), 2)
  assertEqual(progressLabel(state), '[2/5]')
})

test('trail: toastText formats the acquisition message', () => {
  assertEqual(toastText({ text: 'ab_' }, 3), 'FRAGMENT 3/5 ACQUIRED :: "ab_"')
})

test('trail: statusLines masks unfound fragments in trail order', () => {
  const state = { found: ['konami', 'robots'], texts: { konami: 'k_' }, snakeHigh: 0 }
  const robots = fragmentById('robots').text
  assertDeepEqual(statusLines(state), ['  1. ????', '  2. ????', '  3. ????', '  4. k_', `  5. ${robots}`])
})

test('trail: statusLines masks a found secret fragment whose text was never stored', () => {
  const state = { found: ['cursor'], texts: {}, snakeHigh: 0 }
  assertEqual(statusLines(state)[1], '  2. ????')
})

test('trail: markFound stores the server-provided text with the find', () => {
  const { state } = markFound(emptyState(), 'cursor', 'c_')
  assertDeepEqual(state.texts, { cursor: 'c_' })
  assertDeepEqual(markFound(emptyState(), 'comment').state.texts, {})
})

test('trail: nextHint points at the first unfound fragment in trail order', () => {
  const state = { found: ['console', 'comment'], texts: {}, snakeHigh: 0 }
  assertEqual(nextHint(state), fragmentById('cursor').hint)
})

test('trail: nextHint is null once everything is found', () => {
  const state = { found: FRAGMENTS.map(f => f.id), texts: {}, snakeHigh: 0 }
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

test('trail: unlockAttempt words a granted unlock', () => {
  const result = unlockAttempt(true, 2)
  assert(result.ok)
  assertEqual(result.failures, 2)
  assertEqual(result.lines[0], 'ACCESS GRANTED')
})

test('trail: unlockAttempt counts failures and hints on every third', () => {
  const first = unlockAttempt(false, 0)
  assert(!first.ok)
  assertDeepEqual(first.lines, ['ACCESS DENIED [1]'])
  const third = unlockAttempt(false, 2)
  assertEqual(third.failures, 3)
  assertEqual(third.lines.length, 2)
  assert(third.lines[1].startsWith('hint:'))
})
