import { test, assert, assertEqual, assertDeepEqual } from './harness.js'
import { complete, createContext, execute, register } from '../cli/engine.js'

function ctxWith(commands) {
  const ctx = createContext()
  for (const [name, command] of Object.entries(commands)) register(ctx, name, { desc: name, ...command })
  return ctx
}

test('engine: createContext starts at home with empty history and registry', () => {
  const ctx = createContext({ home: '/x', now: () => 5 })
  assertEqual(ctx.cwd, '/x')
  assertDeepEqual(ctx.history, [])
  assertEqual(ctx.registry.size, 0)
  assertEqual(ctx.bootedAt, 5)
})

test('engine: execute passes an async result through', async () => {
  const ctx = ctxWith({ ping: { run: async () => ({ out: ['pong'], navigate: 'x.html' }) } })
  const pending = execute(ctx, 'ping')
  assertEqual(typeof pending.then, 'function')
  assertDeepEqual(await pending, { out: ['pong'], navigate: 'x.html' })
  assertDeepEqual(ctx.history, ['ping'])
})

test('engine: !! echoes before an async result, after it resolves', async () => {
  const ctx = ctxWith({ ping: { run: async () => ({ out: ['pong'] }) } })
  await execute(ctx, 'ping')
  assertDeepEqual((await execute(ctx, '!!')).out, ['ping', 'pong'])
})

test('engine: a rejected async command is reported in character, not thrown', async () => {
  const ctx = ctxWith({ boom: { run: async () => Promise.reject(new Error('kaput')) } })
  assertDeepEqual(await execute(ctx, 'boom'), { out: ['bash: boom: kaput'] })
})

test('engine: prompt results pass through untouched', () => {
  const submit = () => ({ out: [] })
  const ctx = ctxWith({ ask: { run: () => ({ out: [], prompt: { label: 'Password: ', secret: true, submit } }) } })
  const result = execute(ctx, 'ask')
  assertEqual(result.prompt.submit, submit)
  assertEqual(result.prompt.secret, true)
})

test('engine: complete finishes command names, and arguments only through the hook', () => {
  const ctx = ctxWith({ hunt: { run: () => ({ out: [] }) }, hint: { run: () => ({ out: [] }) } })
  assertDeepEqual(complete(ctx, 'hu'), { line: 'hunt ', options: [] })
  assertDeepEqual(complete(ctx, 'h'), { line: 'h', options: ['hint', 'hunt'] })
  assertDeepEqual(complete(ctx, 'hunt a'), { line: 'hunt a', options: [] })
  assertDeepEqual(complete(ctx, 'hunt a', () => ['abc']), { line: 'hunt abc ', options: [] })
})

test('engine: the shell still re-exports the engine', async () => {
  const core = await import('../shell/core.js')
  assertEqual(core.execute, execute)
  assert(typeof core.tokenize === 'function' && typeof core.historyNav === 'function')
})
