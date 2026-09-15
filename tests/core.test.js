import { test, assert, assertEqual, assertDeepEqual } from './harness.js'
import { complete, createContext, execute, helpLines, historyNav, register, registerBuiltins, tokenize } from '../shell/core.js'

const HOME_DIR = '/home/esteban'

const TREE = {
  type: 'dir',
  children: {
    etc: { type: 'dir', children: { motd: { type: 'file', content: 'welcome' } } },
    home: {
      type: 'dir',
      children: {
        esteban: {
          type: 'dir',
          children: {
            'notes.txt': { type: 'file', content: 'line one\nline two' },
            'nested.txt': { type: 'file', content: 'n' },
            '.secret': { type: 'file', content: 'shh' },
            projects: { type: 'dir', children: { 'bot.md': { type: 'file', content: '# bot' } } },
          },
        },
      },
    },
  },
}

function shell() {
  const ctx = createContext({ tree: TREE, home: HOME_DIR })
  registerBuiltins(ctx)
  return ctx
}

const run = (ctx, line) => execute(ctx, line).out

test('core: tokenize splits on any whitespace', () => {
  assertDeepEqual(tokenize('  ls   -a\tprojects '), ['ls', '-a', 'projects'])
  assertDeepEqual(tokenize('   '), [])
})

test('core: tokenize groups quoted arguments', () => {
  assertDeepEqual(tokenize('cat "my file.txt"'), ['cat', 'my file.txt'])
  assertDeepEqual(tokenize("say 'a b'c"), ['say', 'a bc'])
})

test('core: tokenize closes an unterminated quote and keeps empty quotes', () => {
  assertDeepEqual(tokenize('cat "open'), ['cat', 'open'])
  assertDeepEqual(tokenize('x ""'), ['x', ''])
})

test('core: execute ignores a blank line without recording it', () => {
  const ctx = shell()
  assertDeepEqual(run(ctx, '   '), [])
  assertDeepEqual(ctx.history, [])
})

test('core: execute reports unknown commands in character', () => {
  assertDeepEqual(run(shell(), 'foo --bar'), ['bash: foo: command not found'])
})

test('core: execute records trimmed lines in history', () => {
  const ctx = shell()
  run(ctx, '  pwd  ')
  assertDeepEqual(ctx.history, ['pwd'])
})

test('core: execute reports a throwing command instead of crashing', () => {
  const ctx = shell()
  register(ctx, 'boom', {
    desc: 'explodes',
    run: () => {
      throw new Error('kaboom')
    },
  })
  assertDeepEqual(run(ctx, 'boom'), ['bash: boom: kaboom'])
})

test('core: registered commands get args, pass results through, and appear in help', () => {
  const ctx = shell()
  const takeover = () => {}
  register(ctx, 'game', { desc: 'a test game', run: args => ({ out: [`args:${args.join(',')}`], takeover }) })
  const result = execute(ctx, 'game one two')
  assertDeepEqual(result.out, ['args:one,two'])
  assertEqual(result.takeover, takeover)
  assert(helpLines(ctx).some(line => line.trim().startsWith('game')))
})

test('core: help lists visible commands alphabetically and hides the jokes', () => {
  const names = run(shell(), 'help').map(line => line.trim().split(/\s+/)[0])
  assertDeepEqual(names, ['cat', 'cd', 'clear', 'exit', 'help', 'history', 'ls', 'pwd', 'whoami'])
})

test('core: pwd starts in the home directory', () => {
  assertDeepEqual(run(shell(), 'pwd'), [HOME_DIR])
})

test('core: cd moves into relative directories and back out with ..', () => {
  const ctx = shell()
  assertDeepEqual(run(ctx, 'cd projects'), [])
  assertEqual(ctx.cwd, '/home/esteban/projects')
  run(ctx, 'cd ..')
  assertEqual(ctx.cwd, HOME_DIR)
})

test('core: cd accepts absolute paths and returns home with no argument', () => {
  const ctx = shell()
  run(ctx, 'cd /etc')
  assertEqual(ctx.cwd, '/etc')
  run(ctx, 'cd')
  assertEqual(ctx.cwd, HOME_DIR)
})

test('core: cd reports missing paths and files without moving', () => {
  const ctx = shell()
  assertDeepEqual(run(ctx, 'cd nope'), ['cd: nope: No such file or directory'])
  assertDeepEqual(run(ctx, 'cd notes.txt'), ['cd: notes.txt: Not a directory'])
  assertEqual(ctx.cwd, HOME_DIR)
})

test('core: ls lists the working directory without dotfiles', () => {
  assertDeepEqual(run(shell(), 'ls'), ['nested.txt  notes.txt  projects/'])
})

test('core: ls -a includes dotfiles', () => {
  assertDeepEqual(run(shell(), 'ls -a'), ['.secret  nested.txt  notes.txt  projects/'])
})

test('core: ls echoes a file name and reports missing paths', () => {
  const ctx = shell()
  assertDeepEqual(run(ctx, 'ls notes.txt'), ['notes.txt'])
  assertDeepEqual(run(ctx, 'ls nope'), ["ls: cannot access 'nope': No such file or directory"])
})

test('core: cat prints files line by line, including through ~', () => {
  const ctx = shell()
  assertDeepEqual(run(ctx, 'cat notes.txt'), ['line one', 'line two'])
  run(ctx, 'cd /etc')
  assertDeepEqual(run(ctx, 'cat ~/notes.txt'), ['line one', 'line two'])
})

test('core: cat reports directories, missing files, and no operand in character', () => {
  const ctx = shell()
  assertDeepEqual(run(ctx, 'cat projects'), ['cat: projects: Is a directory'])
  assertDeepEqual(run(ctx, 'cat nope'), ['cat: nope: No such file or directory'])
  assertDeepEqual(run(ctx, 'cat'), ['cat: missing operand'])
})

test('core: whoami, clear, and exit', () => {
  const ctx = shell()
  assertDeepEqual(run(ctx, 'whoami'), ['visitor'])
  assertEqual(execute(ctx, 'clear').clear, true)
  assertDeepEqual(execute(ctx, 'exit'), { out: ['logout'], exit: true })
})

test('core: history numbers every entry, including itself', () => {
  const ctx = shell()
  run(ctx, 'pwd')
  run(ctx, 'whoami')
  assertDeepEqual(run(ctx, 'history'), ['   1  pwd', '   2  whoami', '   3  history'])
})

test('core: sudo and rm -rf / get joke answers', () => {
  const ctx = shell()
  const rootJoke = ["rm: it is dangerous to operate recursively on '/'", 'rm: nice try.']
  assertDeepEqual(run(ctx, 'sudo rm -rf /'), ['visitor is not in the sudoers file. This incident will be reported.'])
  assertDeepEqual(run(ctx, 'rm -rf /'), rootJoke)
  assertDeepEqual(run(ctx, 'rm -fr /*'), rootJoke)
  assertDeepEqual(run(ctx, 'rm -r -f /'), rootJoke)
})

test('core: ordinary rm hits a read-only filesystem', () => {
  const ctx = shell()
  assertDeepEqual(run(ctx, 'rm notes.txt'), ["rm: cannot remove 'notes.txt': Read-only file system"])
  assertDeepEqual(run(ctx, 'rm'), ['rm: missing operand'])
})

test('core: complete finishes a unique command name and lists ambiguous ones', () => {
  const ctx = shell()
  assertDeepEqual(complete(ctx, 'he'), { line: 'help ', options: [] })
  assertDeepEqual(complete(ctx, 'h'), { line: 'h', options: ['help', 'history'] })
})

test('core: complete never offers hidden commands', () => {
  assertDeepEqual(complete(shell(), 'su'), { line: 'su', options: [] })
})

test('core: complete finishes files with a space and directories with a slash', () => {
  const ctx = shell()
  assertDeepEqual(complete(ctx, 'cat no'), { line: 'cat notes.txt ', options: [] })
  assertDeepEqual(complete(ctx, 'cd p'), { line: 'cd projects/', options: [] })
})

test('core: complete handles nested paths, ~, and dotfiles only when asked', () => {
  const ctx = shell()
  assertDeepEqual(complete(ctx, 'cat projects/b'), { line: 'cat projects/bot.md ', options: [] })
  assertDeepEqual(complete(ctx, 'cat ~/pro'), { line: 'cat ~/projects/', options: [] })
  assertDeepEqual(complete(ctx, 'cat .s'), { line: 'cat .secret ', options: [] })
  assertDeepEqual(complete(ctx, 'cat s'), { line: 'cat s', options: [] })
})

test('core: complete extends to the common prefix and lists the choices', () => {
  assertDeepEqual(complete(shell(), 'cat n'), { line: 'cat n', options: ['nested.txt', 'notes.txt'] })
})

test('core: historyNav walks up and down and clamps at both ends', () => {
  const history = ['a', 'b']
  assertDeepEqual(historyNav(history, 2, 'up'), { index: 1, value: 'b' })
  assertDeepEqual(historyNav(history, 1, 'up'), { index: 0, value: 'a' })
  assertDeepEqual(historyNav(history, 0, 'up'), { index: 0, value: 'a' })
  assertDeepEqual(historyNav(history, 0, 'down'), { index: 1, value: 'b' })
  assertDeepEqual(historyNav(history, 1, 'down'), { index: 2, value: '' })
  assertDeepEqual(historyNav(history, 2, 'down'), { index: 2, value: '' })
})

test('core: historyNav on empty history stays on the empty line', () => {
  assertDeepEqual(historyNav([], 0, 'up'), { index: 0, value: '' })
})
