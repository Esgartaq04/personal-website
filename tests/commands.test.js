import { test, assert, assertEqual, assertDeepEqual } from './harness.js'
import { createStore } from '../hunt/state.js'
import { createContext, execute, helpLines, registerBuiltins } from '../shell/core.js'
import { FORTUNES, PAGES, RESUME_URL, cowsay, counts, formatDate, formatDuration, globToRegExp, parseCount, registerExtras } from '../shell/commands.js'
import { matrixCommand } from '../shell/matrix.js'

const HOME_DIR = '/home/esteban'
const BOOT = Date.UTC(2026, 9, 1, 12, 0, 0) // Thu Oct 1 2026, 12:00:00 UTC

const file = content => ({ type: 'file', content })
const TREE = {
  type: 'dir',
  children: {
    home: {
      type: 'dir',
      children: {
        esteban: {
          type: 'dir',
          children: {
            'notes.txt': file('one\ntwo\nthree'),
            'contact.txt': file('github    https://github.com/Esgartaq04'),
            '.secret': file('shh'),
            projects: {
              type: 'dir',
              children: {
                'bot.md': file('# Bot\nPython, Docker'),
                'web.md': file('# Web\nReact, TypeScript\nreact native'),
              },
            },
          },
        },
      },
    },
  },
}

function shell({ now = BOOT, rng = () => 0, store = null } = {}) {
  let clock = now
  const ctx = createContext({ tree: TREE, home: HOME_DIR, store, now: () => clock, rng })
  registerBuiltins(ctx)
  registerExtras(ctx)
  ctx.advance = ms => {
    clock += ms
  }
  return ctx
}

const run = (ctx, line) => execute(ctx, line).out

// --- core additions ---

test('commands: ls -l prints a long listing with sizes and directory markers', () => {
  assertDeepEqual(run(shell(), 'ls -l'), [
    'total 3',
    '-r--r--r-- 1 visitor visitor    39 Oct  1  2026 contact.txt',
    '-r--r--r-- 1 visitor visitor    13 Oct  1  2026 notes.txt',
    'dr-xr-xr-x 1 visitor visitor  4096 Oct  1  2026 projects/',
  ])
})

test('commands: ls -la and -al both combine flags', () => {
  const ctx = shell()
  assertEqual(run(ctx, 'ls -la')[1].endsWith('.secret'), true)
  assertDeepEqual(run(ctx, 'ls -al'), run(ctx, 'ls -la'))
})

test('commands: ls -l on a file prints one long entry', () => {
  assertDeepEqual(run(shell(), 'ls -l notes.txt'), ['-r--r--r-- 1 visitor visitor    13 Oct  1  2026 notes.txt'])
})

test('commands: !! repeats the last command and echoes it', () => {
  const ctx = shell()
  run(ctx, 'pwd')
  assertDeepEqual(run(ctx, '!!'), ['pwd', HOME_DIR])
  assertEqual(ctx.history[ctx.history.length - 1], 'pwd')
})

test('commands: !! expands inside a line, and fails on empty history', () => {
  const ctx = shell()
  assertDeepEqual(run(ctx, '!!'), ['bash: !!: event not found'])
  assertEqual(ctx.history.length, 0)
  run(ctx, 'whoami')
  assertDeepEqual(run(ctx, 'sudo !!'), ['sudo whoami', 'visitor is not in the sudoers file. This incident will be reported.'])
})

// --- filesystem ---

test('commands: tree draws the directory with a summary', () => {
  assertDeepEqual(run(shell(), 'tree'), [
    '.',
    '├── contact.txt',
    '├── notes.txt',
    '└── projects',
    '    ├── bot.md',
    '    └── web.md',
    '',
    '1 directory, 4 files',
  ])
})

test('commands: tree -a shows dotfiles; tree reports missing paths', () => {
  assert(run(shell(), 'tree -a').includes('├── .secret'))
  assertDeepEqual(run(shell(), 'tree nope'), ['tree: nope: No such file or directory'])
})

test('commands: head and tail take -n N, -nN, and -N', () => {
  const ctx = shell()
  assertDeepEqual(run(ctx, 'head -n 2 notes.txt'), ['one', 'two'])
  assertDeepEqual(run(ctx, 'tail -n1 notes.txt'), ['three'])
  assertDeepEqual(run(ctx, 'tail -2 notes.txt'), ['two', 'three'])
  assertDeepEqual(run(ctx, 'tail -n 0 notes.txt'), [])
  assertDeepEqual(run(ctx, 'head notes.txt'), ['one', 'two', 'three'])
})

test('commands: head reports bad counts, no operand, directories, and missing files', () => {
  const ctx = shell()
  assertDeepEqual(run(ctx, 'head -n x notes.txt'), ['head: invalid number of lines'])
  assertDeepEqual(run(ctx, 'head'), ['head: missing operand'])
  assertDeepEqual(run(ctx, 'head projects'), ['head: projects: Is a directory'])
  assertDeepEqual(run(ctx, 'tail nope'), ["tail: cannot open 'nope' for reading: No such file or directory"])
})

test('commands: head labels each file when given several', () => {
  assertDeepEqual(run(shell(), 'head -n 1 notes.txt projects/bot.md'), ['==> notes.txt <==', 'one', '==> projects/bot.md <==', '# Bot'])
})

test('commands: parseCount handles every flag form', () => {
  assertDeepEqual(parseCount(['-n', '3', 'f']), { count: 3, rest: ['f'] })
  assertDeepEqual(parseCount(['-n7']), { count: 7, rest: [] })
  assertDeepEqual(parseCount(['-4', 'a', 'b']), { count: 4, rest: ['a', 'b'] })
  assertDeepEqual(parseCount(['f']), { count: 10, rest: ['f'] })
})

test('commands: wc counts lines, words, chars, with a total for several files', () => {
  assertDeepEqual(counts('one two\nthree'), { lines: 2, words: 3, chars: 13 })
  const out = run(shell(), 'wc notes.txt projects/bot.md')
  assertEqual(out.length, 3)
  assertEqual(out[0], '   3     3     13 notes.txt')
  assertEqual(out[2], '   5     7     33 total')
  assertDeepEqual(run(shell(), 'wc'), ['wc: missing operand'])
})

test('commands: grep finds lines in one file without a prefix', () => {
  assertDeepEqual(run(shell(), 'grep two notes.txt'), ['two'])
})

test('commands: grep -r walks directories and prefixes matches; -i ignores case', () => {
  assertDeepEqual(run(shell(), 'grep -r React projects'), ['projects/web.md:React, TypeScript'])
  assertDeepEqual(run(shell(), 'grep -ri react projects/'), ['projects/web.md:React, TypeScript', 'projects/web.md:react native'])
})

test('commands: grep errors on directories without -r, missing files, and missing operands', () => {
  assertDeepEqual(run(shell(), 'grep x projects'), ['grep: projects: Is a directory'])
  assertDeepEqual(run(shell(), 'grep x nope'), ['grep: nope: No such file or directory'])
  assertDeepEqual(run(shell(), 'grep x'), ['usage: grep [-i] [-r] text path...'])
})

test('commands: find lists everything below a directory, or only -name matches', () => {
  assertDeepEqual(run(shell(), 'find projects'), ['projects', 'projects/bot.md', 'projects/web.md'])
  assertDeepEqual(run(shell(), 'find ~ -name "*.md"'), ['~/projects/bot.md', '~/projects/web.md'])
  assertDeepEqual(run(shell(), 'find -name notes.???'), ['./notes.txt'])
})

test('commands: find reports missing paths, bad predicates, and a bare -name', () => {
  assertDeepEqual(run(shell(), 'find nope'), ["find: 'nope': No such file or directory"])
  assertDeepEqual(run(shell(), 'find -type f'), ["find: unknown predicate `-type'"])
  assertDeepEqual(run(shell(), 'find -name'), ["find: missing argument to `-name'"])
})

test('commands: globToRegExp escapes regex characters', () => {
  assert(globToRegExp('a.b*').test('a.bcd'))
  assert(!globToRegExp('a.b').test('axb'))
})

test('commands: echo prints, and redirects hit the read-only filesystem', () => {
  assertDeepEqual(run(shell(), 'echo hello   "big world"'), ['hello big world'])
  assertDeepEqual(run(shell(), 'echo hi > notes.txt'), ['bash: notes.txt: Read-only file system'])
  assertDeepEqual(run(shell(), 'echo hi >'), ["bash: syntax error near unexpected token `newline'"])
})

// --- system ---

test('commands: uname, hostname, id', () => {
  assertDeepEqual(run(shell(), 'uname'), ['Linux'])
  assert(run(shell(), 'uname -a')[0].includes('GNU/Linux'))
  assertDeepEqual(run(shell(), 'hostname'), ['egt'])
  assert(run(shell(), 'id')[0].startsWith('uid=1000(visitor)'))
})

test('commands: date prints UTC from the injected clock', () => {
  assertEqual(formatDate(BOOT), 'Thu Oct  1 12:00:00 UTC 2026')
  assertDeepEqual(run(shell(), 'date'), ['Thu Oct  1 12:00:00 UTC 2026'])
})

test('commands: uptime counts from when the shell started', () => {
  const ctx = shell()
  ctx.advance(5 * 60 * 1000)
  assertEqual(run(ctx, 'uptime')[0], ' 12:05:00 up 5 min,  1 user,  load average: 0.00, 0.01, 0.05')
  assertEqual(formatDuration(42 * 1000), '42 sec')
  assertEqual(formatDuration((2 * 3600 + 7 * 60) * 1000), '2:07')
})

test('commands: neofetch shows the logo beside the info, with the snake score', () => {
  const store = createStore(null)
  store.update(state => ({ ...state, snakeHigh: 12 }))
  const out = run(shell({ store }), 'neofetch')
  assert(out[0].endsWith('visitor@egt'))
  assert(out.some(line => line.includes('Name: Esteban Garcia Taquez')))
  assert(out.some(line => line.endsWith('Snake: high score 12')))
  assert(run(shell(), 'neofetch').some(line => line.endsWith('Snake: unplayed')))
})

test('commands: man prints name and synopsis, and refuses unknown and hidden commands', () => {
  assertDeepEqual(run(shell(), 'man tail'), ['NAME', '    tail - print the last lines of a file', '', 'SYNOPSIS', '    tail [-n N] file'])
  assertDeepEqual(run(shell(), 'man vim'), ['No manual entry for vim'])
  assertDeepEqual(run(shell(), 'man nope'), ['No manual entry for nope'])
  assertEqual(run(shell(), 'man')[0], 'What manual page do you want?')
})

test('commands: every visible command has a manual entry', () => {
  const ctx = shell()
  ctx.registry.set('matrix', matrixCommand)
  for (const [name, command] of ctx.registry) {
    if (command.hidden) continue
    assert(typeof command.usage === 'string' && command.usage.length > 0, `${name} has no usage`)
  }
})

// --- site ---

test('commands: open navigates to known pages, with or without a slash or .html', () => {
  for (const [page, href] of Object.entries(PAGES)) {
    assertEqual(execute(shell(), `open ${page}`).navigate, href)
  }
  assertEqual(execute(shell(), 'open /about').navigate, 'about.html')
  assertEqual(execute(shell(), 'open contact.html').navigate, 'contact.html')
})

test('commands: open rejects unknown pages and needs an argument', () => {
  const unknown = execute(shell(), 'open root')
  assertEqual(unknown.navigate, undefined)
  assert(unknown.out[0].startsWith('open: no such page: root'))
  assert(run(shell(), 'open')[0].startsWith('usage: open'))
})

test('commands: resume asks the page to download the PDF', () => {
  const result = execute(shell(), 'resume')
  assertEqual(result.download, RESUME_URL)
  assert(result.out.some(line => line.includes('Resume-current.pdf')))
})

test('commands: contact prints the contact file from anywhere', () => {
  const ctx = shell()
  run(ctx, 'cd projects')
  assertDeepEqual(run(ctx, 'contact'), ['github    https://github.com/Esgartaq04'])
})

// --- fun ---

test('commands: fortune picks with the injected rng', () => {
  assertDeepEqual(run(shell({ rng: () => 0 }), 'fortune'), [FORTUNES[0]])
  assertDeepEqual(run(shell({ rng: () => 0.9999 }), 'fortune'), [FORTUNES[FORTUNES.length - 1]])
})

test('commands: cowsay draws one-line and wrapped bubbles', () => {
  assertDeepEqual(cowsay('hi').slice(0, 3), [' ____', '< hi >', ' ----'])
  const wrapped = cowsay('aaaa bbbb cccc', 9)
  assertDeepEqual(wrapped.slice(1, 3), ['/ aaaa bbbb \\', '\\ cccc      /'])
  assertDeepEqual(run(shell(), 'cowsay')[1], '< moo >')
})

test('commands: cowsay splits words longer than the bubble', () => {
  assertDeepEqual(cowsay('abcdefgh', 4).slice(1, 3), ['/ abcd \\', '\\ efgh /'])
})

test('commands: hiscore reads the snake score from the store', () => {
  assertDeepEqual(run(shell(), 'hiscore'), ['no snake high score yet. try: snake'])
  const store = createStore(null)
  store.update(state => ({ ...state, snakeHigh: 5 }))
  assertDeepEqual(run(shell({ store }), 'hiscore'), ['snake high score: 5'])
})

test('commands: hidden jokes answer but stay out of help', () => {
  const ctx = shell()
  assert(run(ctx, 'vim')[0].startsWith('vim:'))
  assert(run(ctx, 'ssh')[0].includes('air-gapped'))
  assert(run(ctx, 'hack')[0].startsWith('hack:'))
  const help = helpLines(ctx).join('\n')
  for (const name of ['vim', 'nano', 'emacs', 'ping', 'ssh', 'curl', 'wget', 'hack']) {
    assert(!new RegExp(`^  ${name} `, 'm').test(help), `${name} should be hidden`)
  }
  assert(/^ {2}neofetch /m.test(help))
})
