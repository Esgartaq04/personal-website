import { test, assert, assertEqual, assertDeepEqual } from './harness.js'
import { ROOT } from '../hunt/corruption.js'
import {
  pageOf,
  labelOf,
  commandFor,
  promptFor,
  statusLine,
  reasonFor,
  errorLine,
  outputLines,
  typingDelays,
  outputGap,
  revealPlan,
  transitionFor,
  isPlainText,
} from '../nav/rules.js'

// A repeating sequence, so tests can steer exactly what the rng returns.
function seq(...values) {
  let i = 0
  return () => values[i++ % values.length]
}

test('nav: pageOf maps paths to page files', () => {
  assertEqual(pageOf('/'), 'index.html')
  assertEqual(pageOf(''), 'index.html')
  assertEqual(pageOf('/about.html'), 'about.html')
  assertEqual(pageOf('/root'), 'root')
})

test('nav: command and label follow the nav labels', () => {
  assertEqual(labelOf('index.html'), '/home')
  assertEqual(commandFor('about.html'), 'cd /about')
  assertEqual(commandFor('experience.html'), 'cd /experience')
})

test('nav: prompt is rooted only on the rooted stage', () => {
  assertEqual(promptFor(0), '(esteban@portfolio)-[~]$')
  assertEqual(promptFor(5), '(esteban@portfolio)-[~]$')
  assertEqual(promptFor(ROOT), '(root@egt)-[~]#')
})

test('nav: status line uses real size and time', () => {
  assertEqual(
    statusLine({ page: 'about.html', status: 200, statusText: 'OK', bytes: 4600, ms: 37.6 }),
    'GET /about.html  200 OK  4.6 kB  38 ms',
  )
})

test('nav: status line fills in the reason phrase HTTP/2 leaves empty', () => {
  assert(statusLine({ page: 'about.html', status: 200, statusText: '', bytes: 4600, ms: 38 }).includes('200 OK'))
  assert(statusLine({ page: 'x.html', status: 404, statusText: '', bytes: 0, ms: 5 }).includes('404 Not Found'))
  assertEqual(reasonFor(500, ''), '500 Internal Server Error')
  assertEqual(reasonFor(200, 'OK'), '200 OK')
})

test('nav: reason keeps the bare number when the status is unknown and has no text', () => {
  assertEqual(reasonFor(418, ''), '418')
  assertEqual(reasonFor(418, "I'm a teapot"), "418 I'm a teapot")
})

test('nav: error line names the label', () => {
  assertEqual(errorLine('about.html'), 'cd: /about: connection reset')
  assertEqual(errorLine('about.html', '404 Not Found'), 'cd: /about: 404 Not Found')
})

test('nav: output lines per stage', () => {
  const s = 'GET /about.html  200 OK  4.6 kB  38 ms'
  assertDeepEqual(outputLines({ status: s, stage: 0 }), [
    { text: s, kind: 'dim' },
    { text: 'ACCESS GRANTED', kind: 'access' },
  ])
  assertEqual(outputLines({ status: s, stage: 4 }).length, 2)
  assertDeepEqual(outputLines({ status: s, stage: 5 })[2], {
    text: 'kernel panic - not syncing: VFS: unable to mount /home/esteban',
    kind: 'alert',
  })
  assertEqual(outputLines({ status: s, stage: ROOT })[1].text, 'ROOT ACCESS')
})

test('nav: typing delays stay in the 30-45ms band', () => {
  assertDeepEqual(typingDelays('cd', seq(0, 1)), [30, 45])
  assert(typingDelays('cd /experience', Math.random).every(d => d >= 30 && d <= 45))
})

test('nav: output gap stays in the 55-100ms band', () => {
  assertEqual(outputGap(() => 0), 55)
  assertEqual(outputGap(() => 1), 100)
})

test('nav: reveal never exceeds its budget', () => {
  assertDeepEqual(revealPlan(1), { stagger: 0, wipe: 90 })
  assertDeepEqual(revealPlan(3), { stagger: 60, wipe: 90 })
  for (const n of [2, 10, 50, 200]) {
    const { stagger, wipe } = revealPlan(n)
    assert((n - 1) * stagger + wipe <= 400, `over budget at ${n}`)
  }
})

test('nav: transition picks by trigger, instant when it cannot animate', () => {
  const ok = { reducedMotion: false, hidden: false, animate: true }
  assertEqual(transitionFor('nav', ok), 'command')
  assertEqual(transitionFor('history', ok), 'decrypt')
  assertEqual(transitionFor('root', ok), 'power')
  assertEqual(transitionFor('nav', { ...ok, reducedMotion: true }), 'instant')
  assertEqual(transitionFor('root', { ...ok, hidden: true }), 'instant')
  assertEqual(transitionFor('history', { ...ok, animate: false }), 'instant')
})

test('nav: plain text means text-node children only, not empty', () => {
  const text = t => ({ nodeType: 3, textContent: t })
  const el = (...childNodes) => ({ childNodes, textContent: childNodes.map(n => n.textContent ?? '').join('') })
  assert(isPlainText(el(text('IDENTITY CONFIRMED.'))))
  assert(!isPlainText(el(text('a'), { nodeType: 1, textContent: 'b' })))
  assert(!isPlainText(el(text('a'), { nodeType: 8, textContent: '' }))) // an HTML comment, like about.html's fragment
  assert(!isPlainText(el(text('   '))))
  assert(!isPlainText(el()))
})
