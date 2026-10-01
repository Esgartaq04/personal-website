// Command-line engine shared by the site console (site-console.js, served to everyone) and the /root
// shell (shell/core.js, served only after unlock): tokenizing, the command registry, execution,
// history, and tab completion. No DOM; the UI layers render whatever these return.
//
// A command is { desc, usage?, hidden?, run(args, ctx) } and returns a result, or a Promise of one,
// for commands that call the server. A result is { out, ...fields the UI acts on }. Common fields:
// clear, exit, navigate, download, takeover, fx, and prompt: { label, secret, submit(value) }, which
// sends the UI's next line to submit() instead of execute(), masked when secret and never in history.
//
// A context may also carry resolveCommand(name, ctx), consulted when name is not registered. The /root
// shell uses it to run programs by path (./tetris); the site console has none.

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
export function createContext({ home = '/', store = null, now = () => Date.now(), rng = Math.random } = {}) {
  return { home, cwd: home, history: [], registry: new Map(), store, now, rng, bootedAt: now() }
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
  const command = ctx.registry.get(name) ?? ctx.resolveCommand?.(name, ctx)
  if (!command) return { out: [...echo, `bash: ${name}: command not found`] }
  const failed = error => ({ out: [...echo, `bash: ${name}: ${error.message}`] })
  const withEcho = result => (echo.length ? { ...result, out: [...echo, ...result.out] } : result)
  try {
    const result = command.run(args, ctx)
    if (result && typeof result.then === 'function') return result.then(withEcho, failed)
    return withEcho(result)
  } catch (error) {
    return failed(error)
  }
}

// Completes the last whitespace-separated word: a command name in first position, otherwise whatever
// argCandidates(ctx, partial) offers (the shell passes filesystem paths). Works on raw text rather than
// tokens, so a quote in the line cannot throw off where the word starts.
export function complete(ctx, line, argCandidates = () => []) {
  const start = line.search(/\S*$/)
  const prefix = line.slice(0, start)
  const partial = line.slice(start)
  const candidates = prefix.trim() === '' ? commandCandidates(ctx, partial) : argCandidates(ctx, partial)
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
