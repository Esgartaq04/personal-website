// The /root shell: built-in commands over the virtual filesystem, plus path completion. The generic
// engine (tokenizer, registry, execute, history, completion) is cli/engine.js, shared with the site
// console; it is re-exported here so shell code and tests can keep importing from one place.
//
// Shell results also use: exit, takeover, navigate, download, fx. A takeover is handed a host
// { draw(text), onKey(handler), finish(lines) } and owns the screen until it calls finish. That is
// the whole interface a game needs.

import {
  complete as completeLine,
  createContext as createEngineContext,
  execute,
  helpLines,
  historyNav,
  register,
  tokenize,
} from '../cli/engine.js'
import { HOME, getNode, listDir, readFile, resolvePath } from './vfs.js'

export { execute, helpLines, historyNav, register, tokenize }

export function createContext({ tree, home = HOME, ...options }) {
  return { tree, ...createEngineContext({ home, ...options }) }
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

export function complete(ctx, line) {
  return completeLine(ctx, line, pathCandidates)
}

function pathCandidates(ctx, partial) {
  const slash = partial.lastIndexOf('/')
  const dirPart = slash === -1 ? '' : partial.slice(0, slash + 1)
  const basePart = partial.slice(slash + 1)
  const listing = listDir(ctx.tree, resolvePath(ctx.cwd, dirPart, ctx.home), { all: basePart.startsWith('.') })
  if (!listing.ok) return []
  return listing.names.filter(name => name.startsWith(basePart)).map(name => dirPart + name)
}
