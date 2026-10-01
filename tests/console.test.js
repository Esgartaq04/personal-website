import { test, assert, assertEqual, assertDeepEqual } from './harness.js'
import { createContext, execute, helpLines } from '../cli/engine.js'
import { createStore } from '../hunt/state.js'
import { FRAGMENTS, fragmentById, markFound } from '../hunt/trail.js'
import { SIGNAL_LOST, registerConsole, reportLines } from '../hunt/console.js'

const comment = fragmentById('comment').text
const robots = fragmentById('robots').text

// Fake deps: claim marks fragments found in a real store, with server text for secret ids.
function setup({ unlockAnswers = [], claimFails = [], rooted = false } = {}) {
  const store = createStore(null)
  const calls = { claims: [], unlocks: [] }
  const deps = {
    store,
    async claim(id) {
      calls.claims.push(id)
      if (claimFails.includes(id)) return 'failed'
      const fragment = fragmentById(id)
      const result = markFound(store.get(), id, fragment.text ?? `${id}_text`)
      if (!result.isNew) return 'known'
      store.update(() => result.state)
      return 'new'
    },
    async unlock(passphrase) {
      calls.unlocks.push(passphrase)
      return unlockAnswers.shift() ?? 'denied'
    },
    isRooted: () => rooted,
  }
  const ctx = createContext({ store })
  registerConsole(ctx, deps)
  return { ctx, store, deps, calls }
}

test('console: help lists the hunt commands and hides the jokes', () => {
  const { ctx } = setup()
  const help = helpLines(ctx).join('\n')
  for (const name of ['hunt', 'hint', 'su', 'whoami', 'clear', 'exit', 'help']) assert(help.includes(`  ${name}`), `${name} missing`)
  for (const name of ['sudo', 'ls', 'cd']) assert(!new RegExp(`^  ${name} `, 'm').test(help), `${name} should be hidden`)
})

test('console: the first hunt claims the console fragment and reports progress', async () => {
  const { ctx, store, calls } = setup()
  const { out } = await execute(ctx, 'hunt')
  assertDeepEqual(calls.claims, ['console'])
  assertDeepEqual(store.get().found, ['console'])
  assertEqual(out[0], '> [1/5] fragments recovered')
  assertEqual(out[1], '  1. console_text')
  assert(out[out.length - 1].startsWith('> next lead: '), 'ends with the next lead')
})

test('console: hunt <text> claims public fragments by their text', async () => {
  const { ctx, store } = setup()
  const { out } = await execute(ctx, `hunt ${comment}`)
  assertDeepEqual(store.get().found, ['console', 'comment'])
  assertEqual(out[0], '> [2/5] fragments recovered')
  assertEqual(out[3], `  3. ${comment}`)
})

test('console: hunt <text> rejects unknown text without claiming it', async () => {
  const { ctx, store } = setup()
  const { out } = await execute(ctx, 'hunt nope')
  assertEqual(out[out.length - 1], '> unknown fragment. keep digging.')
  assertDeepEqual(store.get().found, ['console'], 'only the console fragment')
})

test('console: hunt reports a lost signal but still shows progress', async () => {
  const { ctx } = setup({ claimFails: ['console'] })
  const { out } = await execute(ctx, 'hunt')
  assertEqual(out[0], SIGNAL_LOST)
  assertEqual(out[1], '> [0/5] fragments recovered')
})

test('console: with everything found, the report points at su root', async () => {
  const { ctx, deps } = setup()
  for (const fragment of FRAGMENTS) await deps.claim(fragment.id)
  const { out } = await execute(ctx, 'hunt')
  assertEqual(out[0], '> [5/5] fragments recovered')
  assertEqual(out[out.length - 1], '> all fragments recovered. assemble them in order, then: su root')
})

test('console: hint shows only the next lead', async () => {
  const { ctx } = setup()
  assertDeepEqual(execute(ctx, 'hint').out, [`> next lead: ${fragmentById('console').hint}`])
})

test('console: su asks for a masked password and never records it', async () => {
  const { ctx, calls } = setup({ unlockAnswers: ['ok'] })
  const asked = execute(ctx, 'su root')
  assertEqual(asked.prompt.label, 'Password: ')
  assertEqual(asked.prompt.secret, true)
  const done = await asked.prompt.submit('the-passphrase')
  assertDeepEqual(calls.unlocks, ['the-passphrase'])
  assertEqual(done.out[0], 'ACCESS GRANTED')
  assertEqual(done.navigate, 'root.html')
  assertDeepEqual(ctx.history, ['su root'], 'the password is not in history')
})

test('console: su with no user means root; other users do not exist', () => {
  const { ctx } = setup()
  assert(execute(ctx, 'su').prompt)
  const other = execute(ctx, 'su esteban')
  assertEqual(other.prompt, undefined)
  assert(other.out[0].startsWith('su: user esteban does not exist'))
})

test('console: a wrong password fails in red, with a hint on every third failure', async () => {
  const { ctx } = setup({ unlockAnswers: ['denied', 'denied', 'denied'] })
  const first = await execute(ctx, 'su').prompt.submit('a')
  assertDeepEqual(first.out, ['su: Authentication failure'])
  assertEqual(first.error, true)
  await execute(ctx, 'su').prompt.submit('b')
  const third = await execute(ctx, 'su').prompt.submit('c')
  assertEqual(third.out.length, 2)
  assert(third.out[1].startsWith('hint:'))
})

test('console: an unreachable server is a connection error, not a failed guess', async () => {
  const { ctx } = setup({ unlockAnswers: ['error'] })
  const result = await execute(ctx, 'su').prompt.submit('x')
  assertDeepEqual(result.out, ['su: connection refused. try again.'])
  assertEqual(ctx.suFailures, 0)
})

test('console: once rooted, su goes straight to /root and whoami says root', () => {
  const { ctx } = setup({ rooted: true })
  const result = execute(ctx, 'su root')
  assertEqual(result.prompt, undefined)
  assertEqual(result.navigate, 'root.html')
  assertDeepEqual(execute(ctx, 'whoami').out, ['root'])
  assertDeepEqual(execute(setup().ctx, 'whoami').out, ['guest'])
})

test('console: clear, exit, and the hidden jokes', () => {
  const { ctx } = setup()
  assertEqual(execute(ctx, 'clear').clear, true)
  assertEqual(execute(ctx, 'exit').exit, true)
  assert(execute(ctx, 'ls').out[0].includes('somewhere deeper'))
  assert(execute(ctx, 'sudo').out[0].includes('sudoers'))
  assertDeepEqual(execute(ctx, 'rm').out, ['bash: rm: command not found'])
})

test('console: report lines name the passphrase route only when complete', () => {
  const store = createStore(null)
  assert(reportLines(store.get()).slice(-1)[0].startsWith('> next lead:'))
  assert(!reportLines(store.get()).join('\n').includes(robots), 'unfound text stays masked')
})
