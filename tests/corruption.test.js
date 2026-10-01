import { test, assert, assertEqual, assertDeepEqual } from './harness.js'
import { emptyState } from '../hunt/state.js'
import { FRAGMENTS } from '../hunt/trail.js'
import { GLYPHS } from '../hunt/rain.js'
import {
  ALL_CLASSES,
  ROOT,
  STAGES,
  classesFor,
  configFor,
  corruptText,
  glitchLabel,
  nextDelay,
  pick,
  scrambleFrames,
  stageFor,
} from '../hunt/corruption.js'

const found = n => ({ ...emptyState(), found: FRAGMENTS.slice(0, n).map(f => f.id) })

// A repeating sequence, so tests can steer exactly which characters get corrupted.
function seq(...values) {
  let i = 0
  return () => values[i++ % values.length]
}

test('corruption: stage follows the number of fragments found', () => {
  for (let n = 0; n <= 5; n++) assertEqual(stageFor(found(n)), n)
})

test('corruption: a confirmed /root unlock is the rooted stage', () => {
  assertEqual(stageFor(found(5), true), ROOT)
  assertEqual(stageFor(found(0), true), ROOT)
})

test('corruption: fx off wins over everything, including rooted', () => {
  assertEqual(stageFor({ ...found(5), fx: 'off' }), 0)
  assertEqual(stageFor({ ...found(5), fx: 'off' }, true), 0)
})

test('corruption: stage 0 has no config and no classes, so the site is untouched', () => {
  assertEqual(configFor(0), null)
  assertDeepEqual(classesFor(0), [])
})

test('corruption: classes are cumulative, and rooted keeps only the base rain class', () => {
  assertDeepEqual(classesFor(1), ['fx', 'fx-1'])
  assertDeepEqual(classesFor(4), ['fx', 'fx-1', 'fx-2', 'fx-3', 'fx-4'])
  assertDeepEqual(classesFor(ROOT), ['fx', 'fx-1', 'fx-root'])
  for (const stage of [1, 2, 3, 4, 5, ROOT]) {
    for (const name of classesFor(stage)) assert(ALL_CLASSES.includes(name), `${name} missing from ALL_CLASSES`)
  }
})

test('corruption: intensity never drops as fragments are found', () => {
  for (let n = 2; n <= 5; n++) {
    const prev = STAGES[n - 1]
    const next = STAGES[n]
    assert(next.rain.density >= prev.rain.density, `density drops at ${n}`)
    assert(next.rain.opacity >= prev.rain.opacity, `opacity drops at ${n}`)
    assert(next.transition.corrupt >= prev.transition.corrupt, `corrupt chance drops at ${n}`)
    for (const kind of prev.kinds) assert(next.kinds.includes(kind), `${kind} disappears at ${n}`)
  }
})

test('corruption: content stays readable at the peak', () => {
  for (const stage of [1, 2, 3, 4, 5, ROOT]) {
    assert(STAGES[stage].rain.opacity <= 0.25, `stage ${stage} rain too strong`)
    if (STAGES[stage].bursts) assert(STAGES[stage].bursts[0] >= 20000, `stage ${stage} bursts too frequent`)
  }
})

test('corruption: red and the breach prompt arrive only at stage 5, and rooted calms down', () => {
  for (let n = 1; n <= 4; n++) {
    assertEqual(STAGES[n].rain.red, 0)
    assertEqual(STAGES[n].breach, false)
  }
  assert(STAGES[5].rain.red > 0 && STAGES[5].breach && STAGES[5].transition.panic)
  const root = STAGES[ROOT]
  assertEqual(root.rain.red, 0)
  assertEqual(root.breach, false)
  assertEqual(root.bursts, null)
  assert(root.rain.fps < STAGES[5].rain.fps, 'rooted rain should be slower')
})

test('corruption: every burst kind a stage names is one fx.js knows', () => {
  const known = ['flicker', 'split', 'decode', 'nav', 'typo']
  for (const stage of [1, 2, 3, 4, 5, ROOT]) {
    for (const kind of STAGES[stage].kinds) assert(known.includes(kind), `unknown burst ${kind}`)
  }
})

test('corruptText keeps length and whitespace, and uses look-alikes', () => {
  const out = corruptText('ACCESS GRANTED', 1, () => 0)
  assertEqual(out.length, 'ACCESS GRANTED'.length)
  assertEqual(out[6], ' ')
  // A, E, S, G, T have look-alikes; C, R, N, D fall back to a glyph (GLYPHS[0] with this rng).
  assertEqual(out, `4${GLYPHS[0]}${GLYPHS[0]}355 9${GLYPHS[0]}4${GLYPHS[0]}73${GLYPHS[0]}`)
})

test('corruptText at zero intensity is the identity', () => {
  assertEqual(corruptText('hello world', 0, () => 0.5), 'hello world')
})

test('corruptText only touches characters the rng selects', () => {
  // rng: first char selected (0 < 0.5), second not (0.9), and so on.
  assertEqual(corruptText('oooo', 0.5, seq(0, 0.9)), '0o0o')
})

test('scrambleFrames starts scrambled, keeps spaces, and ends on the real text', () => {
  const frames = scrambleFrames('ab cd', 4, () => 0)
  assertEqual(frames.length, 5)
  assertEqual(frames[0], `${GLYPHS[0]}${GLYPHS[0]} ${GLYPHS[0]}${GLYPHS[0]}`)
  assertEqual(frames[4], 'ab cd')
  assert(frames.every(frame => frame.length === 5 && frame[2] === ' '))
})

test('glitchLabel changes exactly one character, preferring look-alikes', () => {
  assertEqual(glitchLabel('/home', () => 0), '/h0me')
  assertEqual(glitchLabel('/home', () => 0.99), '/hom3')
  const changed = [...'/xyz'].filter((ch, i) => ch !== glitchLabel('/xyz', () => 0)[i]).length
  assertEqual(changed, 1)
  assertEqual(glitchLabel('', () => 0), '')
})

test('nextDelay and pick stay in range', () => {
  assertEqual(nextDelay([1000, 2000], () => 0), 1000)
  assertEqual(nextDelay([1000, 2000], () => 0.5), 1500)
  assertEqual(pick(['a', 'b', 'c'], () => 0.99), 'c')
})
