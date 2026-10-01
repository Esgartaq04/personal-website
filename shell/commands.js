// Extra /root commands, layered on the built-ins in core.js. Same contract: pure functions over ctx
// that return { out, ... }. Time and randomness come from ctx.now and ctx.rng so tests can pin them.

import { getNode, readFile, resolvePath } from './vfs.js'
import { register } from './core.js'

export const PAGES = {
  home: 'index.html',
  about: 'about.html',
  experience: 'experience.html',
  projects: 'projects.html',
  contact: 'contact.html',
}

export const RESUME_URL = '/assets/Resume-current.pdf'

export const FORTUNES = [
  'There are two hard problems in computer science: cache invalidation, naming things, and off-by-one errors.',
  'It works on my machine. -- every developer, once',
  'Security is a process, not a product. -- Bruce Schneier',
  'Talk is cheap. Show me the code. -- Linus Torvalds',
  'The best error message is the one that never shows up. -- Thomas Fuchs',
  'Premature optimization is the root of all evil. -- Donald Knuth',
  'Weeks of coding can save you hours of planning.',
  'There is no cloud. It is just someone else\'s computer.',
  'A good programmer looks both ways before crossing a one-way street.',
  'rm -rf / is not a backup strategy.',
]

const LOGO = [
  '  _____ ____ _____ ',
  ' | ____/ ___|_   _|',
  ' |  _|| |  _  | |  ',
  ' | |__| |_| | | |  ',
  ' |_____\\____| |_|  ',
  '                   ',
]

export function registerExtras(ctx) {
  const add = (name, desc, usage, run) => register(ctx, name, { desc, usage, run })
  const joke = (name, line) => register(ctx, name, { desc: '', hidden: true, run: () => ({ out: [line] }) })

  // Filesystem
  add('tree', 'show a directory as a tree', 'tree [-a] [dir]', tree)
  add('head', 'print the first lines of a file', 'head [-n N] file', (args, c) => slice(args, c, 'head'))
  add('tail', 'print the last lines of a file', 'tail [-n N] file', (args, c) => slice(args, c, 'tail'))
  add('wc', 'count lines, words, and characters', 'wc file...', wc)
  add('grep', 'search files for text', 'grep [-i] [-r] text path...', grep)
  add('find', 'list files below a directory', 'find [dir] [-name pattern]   (* and ? wildcards)', find)
  add('echo', 'print text', 'echo [text...]', echo)

  // System
  add('uname', 'print system information', 'uname [-a]', args => ({
    out: [args.includes('-a') ? 'Linux egt 6.1.0-portfolio #1 SMP PREEMPT x86_64 GNU/Linux' : 'Linux'],
  }))
  add('date', 'print the date and time', 'date', (args, c) => ({ out: [formatDate(c.now())] }))
  add('uptime', 'how long this session has been up', 'uptime', (args, c) => ({ out: [uptimeLine(c)] }))
  add('hostname', 'print the host name', 'hostname', () => ({ out: ['egt'] }))
  add('id', 'print user and group ids', 'id', () => ({
    out: ['uid=1000(visitor) gid=1000(visitor) groups=1000(visitor),27(hunters)'],
  }))
  add('neofetch', 'system info, with a logo', 'neofetch', (args, c) => ({ out: neofetch(c) }))
  add('man', 'show the manual for a command', 'man command', man)

  // Site
  add('open', 'go to a page of the site', `open ${Object.keys(PAGES).join('|')}`, open)
  add('resume', 'download the resume', 'resume', () => ({
    out: ['Esteban Garcia Taquez :: Software Engineer', 'B.S. Computer Science, UIC, May 2027', '', 'downloading Resume-current.pdf...'],
    download: RESUME_URL,
  }))
  add('contact', 'how to reach me', 'contact', (args, c) => {
    const file = readFile(c.tree, resolvePath(c.cwd, '~/contact.txt', c.home))
    return { out: file.ok ? file.content.split('\n') : ['contact: no contact file'] }
  })

  // Fun
  add('fortune', 'print a random quote', 'fortune', (args, c) => ({
    out: [FORTUNES[Math.floor(c.rng() * FORTUNES.length) % FORTUNES.length]],
  }))
  add('cowsay', 'a cow says something', 'cowsay [text...]', args => ({ out: cowsay(args.join(' ') || 'moo') }))
  add('fsck', 'repair the filesystem (turns the corruption off)', 'fsck', fsck)
  add('corrupt', 'let the corruption back in', 'corrupt', corrupt)
  add('hiscore', 'show the snake high score', 'hiscore', (args, c) => {
    const high = c.store ? c.store.get().snakeHigh : 0
    return { out: [high > 0 ? `snake high score: ${high}` : 'no snake high score yet. try: snake'] }
  })

  // Hidden
  for (const editor of ['vim', 'nano', 'emacs']) {
    joke(editor, `${editor}: you can check out any time you like, but you can never leave. (read-only system, so no.)`)
  }
  for (const net of ['ping', 'ssh', 'curl', 'wget']) {
    joke(net, `${net}: network unreachable: this box is air-gapped.`)
  }
  joke('hack', 'hack: already in. you did that part yourself.')
}

// --- filesystem helpers ---

function childPath(dir, name) {
  return `${dir === '/' ? '' : dir}/${name}`
}

function tree(args, ctx) {
  const all = args.includes('-a')
  const target = args.find(arg => !arg.startsWith('-')) ?? '.'
  const root = resolvePath(ctx.cwd, target, ctx.home)
  const node = getNode(ctx.tree, root)
  if (!node) return { out: [`tree: ${target}: No such file or directory`] }
  if (node.type !== 'dir') return { out: [target] }
  const out = [target]
  const counts = { dirs: 0, files: 0 }
  walkTree(node, '', all, out, counts)
  out.push('', `${counts.dirs} director${counts.dirs === 1 ? 'y' : 'ies'}, ${counts.files} file${counts.files === 1 ? '' : 's'}`)
  return { out }
}

function walkTree(node, prefix, all, out, counts) {
  const names = Object.keys(node.children)
    .filter(name => all || !name.startsWith('.'))
    .sort()
  names.forEach((name, i) => {
    const last = i === names.length - 1
    const child = node.children[name]
    out.push(`${prefix}${last ? '└── ' : '├── '}${name}`)
    if (child.type === 'dir') {
      counts.dirs++
      walkTree(child, prefix + (last ? '    ' : '│   '), all, out, counts)
    } else {
      counts.files++
    }
  })
}

// Accepts -n N, -nN, and -N, like the real tools.
export function parseCount(args, fallback = 10) {
  let count = fallback
  const rest = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '-n') {
      count = Number(args[++i])
    } else if (/^-n\d+$/.test(arg)) {
      count = Number(arg.slice(2))
    } else if (/^-\d+$/.test(arg)) {
      count = Number(arg.slice(1))
    } else {
      rest.push(arg)
    }
  }
  return { count, rest }
}

function readText(ctx, name, target) {
  const result = readFile(ctx.tree, resolvePath(ctx.cwd, target, ctx.home))
  if (result.ok) return { lines: result.content.split('\n'), content: result.content }
  if (result.error === 'EISDIR') return { error: `${name}: ${target}: Is a directory` }
  return { error: `${name}: cannot open '${target}' for reading: No such file or directory` }
}

function slice(args, ctx, name) {
  const { count, rest } = parseCount(args)
  if (!Number.isInteger(count) || count < 0) return { out: [`${name}: invalid number of lines`] }
  if (rest.length === 0) return { out: [`${name}: missing operand`] }
  const out = []
  for (const target of rest) {
    const file = readText(ctx, name, target)
    if (file.error) {
      out.push(file.error)
      continue
    }
    if (rest.length > 1) out.push(`==> ${target} <==`)
    out.push(...(name === 'head' ? file.lines.slice(0, count) : count === 0 ? [] : file.lines.slice(-count)))
  }
  return { out }
}

export function counts(content) {
  const words = content.split(/\s+/).filter(Boolean).length
  return { lines: content.split('\n').length, words, chars: content.length }
}

function wc(args, ctx) {
  if (args.length === 0) return { out: ['wc: missing operand'] }
  const out = []
  const total = { lines: 0, words: 0, chars: 0 }
  const row = (c, label) => `${String(c.lines).padStart(4)} ${String(c.words).padStart(5)} ${String(c.chars).padStart(6)} ${label}`
  for (const target of args) {
    const file = readText(ctx, 'wc', target)
    if (file.error) {
      out.push(file.error)
      continue
    }
    const c = counts(file.content)
    total.lines += c.lines
    total.words += c.words
    total.chars += c.chars
    out.push(row(c, target))
  }
  if (args.length > 1) out.push(row(total, 'total'))
  return { out }
}

function grep(args, ctx) {
  const flags = args.filter(arg => arg.startsWith('-')).join('')
  const [pattern, ...targets] = args.filter(arg => !arg.startsWith('-'))
  if (pattern === undefined || targets.length === 0) return { out: ['usage: grep [-i] [-r] text path...'] }
  const ignoreCase = flags.includes('i')
  const recursive = flags.includes('r')
  const needle = ignoreCase ? pattern.toLowerCase() : pattern
  const files = []
  const out = []
  for (const target of targets) {
    const path = resolvePath(ctx.cwd, target, ctx.home)
    const node = getNode(ctx.tree, path)
    if (!node) out.push(`grep: ${target}: No such file or directory`)
    else if (node.type === 'file') files.push({ label: target, node })
    else if (!recursive) out.push(`grep: ${target}: Is a directory`)
    else collectFiles(node, target.replace(/\/$/, ''), files)
  }
  const prefix = files.length > 1 || recursive
  for (const { label, node } of files) {
    for (const line of node.content.split('\n')) {
      const haystack = ignoreCase ? line.toLowerCase() : line
      if (haystack.includes(needle)) out.push(prefix ? `${label}:${line}` : line)
    }
  }
  return { out }
}

function collectFiles(node, label, files) {
  for (const name of Object.keys(node.children).sort()) {
    const child = node.children[name]
    const childLabel = `${label}/${name}`
    if (child.type === 'dir') collectFiles(child, childLabel, files)
    else files.push({ label: childLabel, node: child })
  }
}

export function globToRegExp(glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')
  return new RegExp(`^${escaped}$`)
}

function find(args, ctx) {
  let target = '.'
  let pattern = null
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-name') {
      pattern = args[++i]
      if (pattern === undefined) return { out: ['find: missing argument to `-name\''] }
    } else if (args[i].startsWith('-')) {
      return { out: [`find: unknown predicate \`${args[i]}'`] }
    } else {
      target = args[i]
    }
  }
  const root = resolvePath(ctx.cwd, target, ctx.home)
  const node = getNode(ctx.tree, root)
  if (!node) return { out: [`find: '${target}': No such file or directory`] }
  const matcher = pattern === null ? null : globToRegExp(pattern)
  const out = []
  const visit = (current, label, name) => {
    if (!matcher || matcher.test(name)) out.push(label)
    if (current.type !== 'dir') return
    for (const childName of Object.keys(current.children).sort()) {
      visit(current.children[childName], `${label.replace(/\/$/, '')}/${childName}`, childName)
    }
  }
  visit(node, target, root.split('/').pop() || '/')
  return { out }
}

function echo(args) {
  const redirect = args.findIndex(arg => arg === '>' || arg === '>>')
  if (redirect !== -1) {
    const file = args[redirect + 1]
    return { out: [file ? `bash: ${file}: Read-only file system` : 'bash: syntax error near unexpected token `newline\''] }
  }
  return { out: [args.join(' ')] }
}

// --- system helpers ---

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad = n => String(n).padStart(2, '0')

// UTC, so the output does not depend on the visitor's time zone (or the test machine's).
export function formatDate(ms) {
  const d = new Date(ms)
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  return `${DAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2)} ${time} UTC ${d.getUTCFullYear()}`
}

export function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  if (hours > 0) return `${hours}:${pad(minutes)}`
  if (minutes > 0) return `${minutes} min`
  return `${seconds} sec`
}

function uptimeLine(ctx) {
  const d = new Date(ctx.now())
  const clock = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  return ` ${clock} up ${formatDuration(ctx.now() - ctx.bootedAt)},  1 user,  load average: 0.00, 0.01, 0.05`
}

function neofetch(ctx) {
  const high = ctx.store ? ctx.store.get().snakeHigh : 0
  const info = [
    'visitor@egt',
    '-----------',
    'OS: egt.agency (static HTML/CSS/JS)',
    'Host: Vercel',
    'Kernel: 6.1.0-portfolio',
    `Uptime: ${formatDuration(ctx.now() - ctx.bootedAt)}`,
    'Shell: egt-sh',
    'Name: Esteban Garcia Taquez',
    'Role: Software Engineer',
    "School: UIC, B.S. Computer Science '27",
    'Stack: Python, TypeScript, React, FastAPI',
    'Cloud: GCP, AWS, Terraform, Docker',
    `Snake: ${high > 0 ? `high score ${high}` : 'unplayed'}`,
  ]
  if (ctx.store && ctx.store.get().arcade) {
    const tetris = ctx.store.get().tetrisHigh
    info.push(`Tetris: ${tetris > 0 ? `high score ${tetris}` : 'unplayed'}`)
  }
  const rows = Math.max(LOGO.length, info.length)
  const width = LOGO[0].length
  return Array.from({ length: rows }, (_, i) => `${(LOGO[i] ?? '').padEnd(width)}   ${info[i] ?? ''}`.trimEnd())
}

function man(args, ctx) {
  const name = args[0]
  if (!name) return { out: ['What manual page do you want?', 'For example, try \'man ls\'.'] }
  const command = ctx.registry.get(name)
  if (!command || command.hidden) return { out: [`No manual entry for ${name}`] }
  return {
    out: ['NAME', `    ${name} - ${command.desc}`, '', 'SYNOPSIS', `    ${command.usage ?? name}`],
  }
}

// --- corruption switch ---
// The page effects (fx.js) read `fx` from the progress store. `fx: true` in the result tells shell.js
// to nudge the page so the change shows immediately.

function fsck(args, ctx) {
  if (!ctx.store) return { out: ['fsck: /dev/egt0: no filesystem to check'] }
  if (ctx.store.get().fx === 'off') return { out: ['fsck from util-linux 2.39', '/dev/egt0: clean, 0 errors'] }
  ctx.store.update(state => ({ ...state, fx: 'off' }))
  return {
    out: [
      'fsck from util-linux 2.39',
      '/dev/egt0: 23 corrupted inodes found',
      'repairing........ done',
      'site restored. run `corrupt` to undo.',
    ],
    fx: true,
  }
}

function corrupt(args, ctx) {
  if (!ctx.store) return { out: ['corrupt: nothing to corrupt'] }
  if (ctx.store.get().fx !== 'off') return { out: ['corrupt: already compromised.'] }
  ctx.store.update(state => ({ ...state, fx: 'on' }))
  return { out: ['injecting payload... done', 'the system remembers what you found.'], fx: true }
}

// --- site and fun ---

function open(args) {
  const page = (args[0] ?? '').replace(/^\//, '').replace(/\.html$/, '')
  if (!page) return { out: [`usage: open ${Object.keys(PAGES).join('|')}`] }
  if (!Object.hasOwn(PAGES, page)) return { out: [`open: no such page: ${args[0]} (try: ${Object.keys(PAGES).join(', ')})`] }
  return { out: [`opening /${page}...`], navigate: PAGES[page] }
}

export function cowsay(text, width = 40) {
  const words = text.split(/\s+/).filter(Boolean)
  const lines = []
  let current = ''
  for (const word of words) {
    for (const piece of word.match(new RegExp(`.{1,${width}}`, 'g'))) {
      if (current && current.length + 1 + piece.length > width) {
        lines.push(current)
        current = piece
      } else {
        current = current ? `${current} ${piece}` : piece
      }
    }
  }
  if (current) lines.push(current)
  const inner = Math.max(...lines.map(line => line.length))
  const bubble =
    lines.length === 1
      ? [`< ${lines[0]} >`]
      : lines.map((line, i) => {
          const [l, r] = i === 0 ? ['/', '\\'] : i === lines.length - 1 ? ['\\', '/'] : ['|', '|']
          return `${l} ${line.padEnd(inner)} ${r}`
        })
  return [
    ` ${'_'.repeat(inner + 2)}`,
    ...bubble,
    ` ${'-'.repeat(inner + 2)}`,
    '        \\   ^__^',
    '         \\  (oo)\\_______',
    '            (__)\\       )\\/\\',
    '                ||----w |',
    '                ||     ||',
  ]
}
