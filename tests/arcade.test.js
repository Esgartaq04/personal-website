import { test, assert, assertEqual, assertDeepEqual } from './harness.js'
import { createStore } from '../hunt/state.js'
import { createContext, execute, helpLines, registerBuiltins } from '../shell/core.js'
import { registerExtras } from '../shell/commands.js'
import { registerArcade } from '../shell/arcade.js'
import { snakeCommand } from '../shell/snake.js'
import { ARCADE, TREE, getNode, withArcade } from '../shell/vfs.js'

function memoryStorage() {
  const data = {}
  return { getItem: key => (key in data ? data[key] : null), setItem: (key, value) => (data[key] = String(value)) }
}

// The real shell, wired the way shell.js does it.
function shell(store = createStore(memoryStorage())) {
  const ctx = createContext({ tree: TREE, store })
  registerBuiltins(ctx)
  registerExtras(ctx)
  ctx.registry.set('snake', snakeCommand)
  registerArcade(ctx)
  return ctx
}

const run = (ctx, line) => execute(ctx, line).out
const NOT_SUDOER = 'visitor is not in the sudoers file. This incident will be reported.'

test('arcade: hidden until sudo 42', () => {
  const ctx = shell()
  assert(!run(ctx, 'ls -a ~')[0].includes('arcade'))
  assertDeepEqual(run(ctx, 'cd ~/arcade'), ['cd: ~/arcade: No such file or directory'])
  assertDeepEqual(run(ctx, 'tetris'), ['bash: tetris: command not found'])
})

test('arcade: sudo 42 mounts ~/arcade and remembers it', () => {
  const store = createStore(memoryStorage())
  const ctx = shell(store)
  const out = run(ctx, 'sudo 42')
  assert(out.some(line => line.includes('the answer to life')))
  assert(out.some(line => line.includes('~/arcade')))
  assertEqual(store.get().arcade, true)
  assert(run(ctx, 'ls ~')[0].includes('arcade/'))
  run(ctx, 'cd ~/arcade')
  assertDeepEqual(run(ctx, 'ls'), ['README.txt  platformer  snake  tetris'])
})

test('arcade: any other sudo keeps the joke answer', () => {
  const ctx = shell()
  for (const line of ['sudo', 'sudo 41', 'sudo 42 now', 'sudo rm -rf /']) assertDeepEqual(run(ctx, line), [NOT_SUDOER])
  assertEqual(ctx.store.get().arcade, false)
})

test('arcade: a second sudo 42 says it is already granted', () => {
  const ctx = shell()
  run(ctx, 'sudo 42')
  assertDeepEqual(run(ctx, 'sudo 42'), ['sudo: already granted. the arcade is in ~/arcade'])
})

test('arcade: unlock survives a reload', () => {
  const store = createStore(memoryStorage())
  run(shell(store), 'sudo 42')
  const reloaded = shell(store)
  assert(run(reloaded, 'ls ~')[0].includes('arcade/'))
  assert(helpLines(reloaded).some(line => line.trim().startsWith('tetris')))
  assert(helpLines(reloaded).some(line => line.trim().startsWith('platformer')))
})

test('arcade: games run by name, relative path, and absolute path', () => {
  const ctx = shell()
  run(ctx, 'sudo 42')
  for (const line of ['tetris', '~/arcade/tetris', '/home/esteban/arcade/platformer', '~/arcade/snake']) {
    assertEqual(typeof execute(ctx, line).takeover, 'function', line)
  }
  run(ctx, 'cd ~/arcade')
  assertEqual(typeof execute(ctx, './tetris').takeover, 'function')
  assertEqual(typeof execute(ctx, './platformer').takeover, 'function')
})

test('arcade: running a path that is not a program answers like bash', () => {
  const ctx = shell()
  assertDeepEqual(run(ctx, './notes.txt'), ['bash: ./notes.txt: Permission denied'])
  assertDeepEqual(run(ctx, './projects'), ['bash: ./projects: Is a directory'])
  assertDeepEqual(run(ctx, './nothing'), ['bash: ./nothing: command not found'])
})

test('arcade: ls -l marks the programs executable', () => {
  const ctx = shell()
  run(ctx, 'sudo 42')
  const long = run(ctx, 'ls -l ~/arcade')
  assert(long.some(line => line.startsWith('-r-xr-xr-x') && line.endsWith(' tetris')))
  assert(long.some(line => line.startsWith('-r--r--r--') && line.endsWith(' README.txt')))
})

test('arcade: withArcade leaves the shared tree untouched', () => {
  const tree = withArcade(TREE)
  assertEqual(getNode(TREE, '/home/esteban/arcade'), null)
  assertEqual(getNode(tree, '/home/esteban/arcade'), ARCADE)
  assertEqual(getNode(tree, '/etc/motd'), getNode(TREE, '/etc/motd'))
})

test('arcade: the hints point at it', () => {
  const ctx = shell()
  assert(run(ctx, 'cat /etc/sudoers').some(line => line.includes('NOPASSWD: 42')))
  assert(run(ctx, 'cat ~/.secret').some(line => line.includes('sudo')))
})
