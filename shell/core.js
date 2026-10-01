// Shell engine: tokenizing, the command registry, built-in commands, and tab completion.
// No DOM. shell.js renders whatever these return.
//
// A command is { desc, usage?, hidden?, run(args, ctx) } and returns
// { out, clear?, exit?, takeover?, navigate?, download?, fx? }. navigate and download are URLs shell.js
// acts on; fx means the corruption setting changed and the page should re-apply it.
// A takeover is handed a host { draw(text), onKey(handler), finish(lines) } and owns the screen
// until it calls finish. That is the whole interface a game needs.

import { HOME, getNode, listDir, readFile, resolvePath } from './vfs.js'

export function tokenize(line) {
  const tokens = []
  let current = ''
  let quote = null
  let started = false
  for (const ch of line) {
    if (quote) {
      if (ch === quote) quote = null
      else current += ch
    } else if (ch === '"' || ch === "'") {
      quote = ch
      started = true
    } else if (/\s/.test(ch)) {
      if (started) {
        tokens.push(current)
        current = ''
        started = false
      }
    } else {
      current += ch
      started = true
    }
  }
  if (started) tokens.push(current)
  return tokens
}

// now and rng are injectable so clock- and dice-driven commands stay testable.
export function createContext({ tree, home = HOME, store = null, now = () => Date.now(), rng = Math.random }) {
  return { tree, home, cwd: home, history: [], registry: new Map(), store, now, rng, bootedAt: now() }
}

export function register(ctx, name, command) {
  ctx.registry.set(name, command)
}

export function helpLines(ctx) {
  const visible = [...ctx.registry.entries()].filter(([, command]) => !command.hidden)
  const width = Math.max(0, ...visible.map(([name]) => name.length))
  return visible
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, command]) => `  ${name.padEnd(width)}  ${command.desc}`)
}

export function execute(ctx, line) {
  let trimmed = line.trim()
  if (!trimmed) return { out: [] }
  // Like bash, !! expands to the previous command and the expanded line is echoed before it runs.
  let echo = []
  if (trimmed.includes('!!')) {
    const previous = ctx.history[ctx.history.length - 1]
    if (previous === undefined) return { out: ['bash: !!: event not found'] }
    trimmed = trimmed.replaceAll('!!', previous)
    echo = [trimmed]
  }
  ctx.history.push(trimmed)
  const [name = '', ...args] = tokenize(trimmed)
  const command = ctx.registry.get(name)
  if (!command) return { out: [...echo, `bash: ${name}: command not found`] }
  try {
    const result = command.run(args, ctx)
    return echo.length ? { ...result, out: [...echo, ...result.out] } : result
  } catch (error) {
    return { out: [...echo, `bash: ${name}: ${error.message}`] }
  }
}

export function registerBuiltins(ctx) {
  register(ctx, 'help', { desc: 'list available commands', usage: 'help', run: (args, c) => ({ out: helpLines(c) }) })
  register(ctx, 'ls', {
    desc: 'list directory contents (-a hidden, -l long)',
    usage: 'ls [-a] [-l] [path...]',
    run: ls,
  })
  register(ctx, 'cd', { desc: 'change directory', usage: 'cd [path]   (no path goes home)', run: cd })
  register(ctx, 'pwd', { desc: 'print working directory', usage: 'pwd', run: (args, c) => ({ out: [c.cwd] }) })
  register(ctx, 'cat', { desc: 'print file contents', usage: 'cat file...', run: cat })
  register(ctx, 'whoami', { desc: 'print current user', usage: 'whoami', run: () => ({ out: ['visitor'] }) })
  register(ctx, 'clear', { desc: 'clear the screen', usage: 'clear', run: () => ({ out: [], clear: true }) })
  register(ctx, 'history', {
    desc: 'show command history',
    usage: 'history   (!! repeats the last command)',
    run: (args, c) => ({ out: c.history.map((entry, i) => `${String(i + 1).padStart(4)}  ${entry}`) }),
  })
  register(ctx, 'exit', { desc: 'log out', usage: 'exit', run: () => ({ out: ['logout'], exit: true }) })
  register(ctx, 'sudo', {
    desc: '',
    hidden: true,
    run: () => ({ out: ['visitor is not in the sudoers file. This incident will be reported.'] }),
  })
  register(ctx, 'rm', { desc: '', hidden: true, run: rm })
}

function ls(args, ctx) {
  const flags = args.filter(arg => arg.startsWith('-')).join('')
  const all = flags.includes('a')
  const long = flags.includes('l')
  const targets = args.filter(arg => !arg.startsWith('-'))
  if (targets.length === 0) targets.push('.')
  const out = []
  for (const target of targets) {
    const path = resolvePath(ctx.cwd, target, ctx.home)
    const result = listDir(ctx.tree, path, { all })
    if (result.ok) {
      if (targets.length > 1) out.push(`${target}:`)
      if (long) {
        out.push(`total ${result.names.length}`)
        for (const name of result.names) {
          const bare = name.replace(/\/$/, '')
          out.push(longEntry(getNode(ctx.tree, `${path === '/' ? '' : path}/${bare}`), name))
        }
      } else if (result.names.length > 0) {
        out.push(result.names.join('  '))
      }
    } else if (result.error === 'ENOTDIR') {
      out.push(long ? longEntry(getNode(ctx.tree, path), target) : target)
    } else {
      out.push(`ls: cannot access '${target}': No such file or directory`)
    }
  }
  return { out }
}

// The filesystem is read-only and frozen in time, so every entry gets the same owner and date.
export function longEntry(node, name) {
  const isDir = node.type === 'dir'
  const size = isDir ? 4096 : node.content.length
  return `${isDir ? 'dr-xr-xr-x' : '-r--r--r--'} 1 visitor visitor ${String(size).padStart(5)} Oct  1  2026 ${name}`
}

function cd(args, ctx) {
  const target = args[0] ?? '~'
  const path = resolvePath(ctx.cwd, target, ctx.home)
  const node = getNode(ctx.tree, path)
  if (!node) return { out: [`cd: ${target}: No such file or directory`] }
  if (node.type !== 'dir') return { out: [`cd: ${target}: Not a directory`] }
  ctx.cwd = path
  return { out: [] }
}

function cat(args, ctx) {
  if (args.length === 0) return { out: ['cat: missing operand'] }
  const out = []
  for (const target of args) {
    const result = readFile(ctx.tree, resolvePath(ctx.cwd, target, ctx.home))
    if (result.ok) out.push(...result.content.split('\n'))
    else if (result.error === 'EISDIR') out.push(`cat: ${target}: Is a directory`)
    else out.push(`cat: ${target}: No such file or directory`)
  }
  return { out }
}

function rm(args) {
  const flags = args.filter(arg => arg.startsWith('-')).join('')
  const targets = args.filter(arg => !arg.startsWith('-'))
  if (flags.includes('r') && flags.includes('f') && targets.some(t => t === '/' || t === '/*')) {
    return { out: ["rm: it is dangerous to operate recursively on '/'", 'rm: nice try.'] }
  }
  if (targets.length === 0) return { out: ['rm: missing operand'] }
  return { out: [`rm: cannot remove '${targets[0]}': Read-only file system`] }
}

// Completes the last whitespace-separated word. Works on raw text rather than tokens,
// so a quote in the line cannot throw off where the word starts.
export function complete(ctx, line) {
  const start = line.search(/\S*$/)
  const prefix = line.slice(0, start)
  const partial = line.slice(start)
  const candidates = prefix.trim() === '' ? commandCandidates(ctx, partial) : pathCandidates(ctx, partial)
  if (candidates.length === 0) return { line, options: [] }
  if (candidates.length === 1) {
    const only = candidates[0]
    return { line: prefix + only + (only.endsWith('/') ? '' : ' '), options: [] }
  }
  return {
    line: prefix + commonPrefix(candidates),
    options: candidates.map(c => c.slice(c.lastIndexOf('/', c.length - 2) + 1)),
  }
}

function commandCandidates(ctx, partial) {
  return [...ctx.registry.entries()]
    .filter(([name, command]) => !command.hidden && name.startsWith(partial))
    .map(([name]) => name)
    .sort()
}

function pathCandidates(ctx, partial) {
  const slash = partial.lastIndexOf('/')
  const dirPart = slash === -1 ? '' : partial.slice(0, slash + 1)
  const basePart = partial.slice(slash + 1)
  const listing = listDir(ctx.tree, resolvePath(ctx.cwd, dirPart, ctx.home), { all: basePart.startsWith('.') })
  if (!listing.ok) return []
  return listing.names.filter(name => name.startsWith(basePart)).map(name => dirPart + name)
}

function commonPrefix(strings) {
  let prefix = strings[0]
  for (const s of strings.slice(1)) {
    while (!s.startsWith(prefix)) prefix = prefix.slice(0, -1)
  }
  return prefix
}

export function historyNav(history, index, direction) {
  const next = direction === 'up' ? Math.max(0, index - 1) : Math.min(history.length, index + 1)
  return { index: next, value: next === history.length ? '' : history[next] }
}
