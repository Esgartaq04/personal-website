// /root: the lock screen, then the shell. Logic lives in hunt/ and shell/; this file only renders.
// All output goes through textContent. The shell echoes whatever the visitor types.

import { createStore, safeStorage } from './hunt/state.js'
import { isTouchOnly, unlockAttempt } from './hunt/trail.js'
import { complete, createContext, execute, historyNav, register, registerBuiltins } from './shell/core.js'
import { snakeCommand } from './shell/snake.js'
import { TREE, displayPath } from './shell/vfs.js'

const store = createStore(safeStorage())
const ctx = createContext({ tree: TREE, store })
registerBuiltins(ctx)
register(ctx, 'snake', snakeCommand)

const term = document.getElementById('term')
const output = document.getElementById('term-out')
const screen = document.getElementById('term-screen')
const inputLine = document.getElementById('term-line')
const promptEl = document.getElementById('term-prompt')
const input = document.getElementById('term-in')

// 'locked' | 'shell' | 'takeover' | 'exiting'
let mode = 'locked'
let failures = 0
let historyIndex = 0
let takeoverKeys = null

if (isTouchOnly(window.matchMedia ? query => window.matchMedia(query) : undefined)) {
  inputLine.hidden = true
  print(['/root needs a keyboard. come back on a desktop.'])
} else {
  boot()
}

function boot() {
  term.addEventListener('click', () => input.focus())
  input.addEventListener('keydown', onKey)
  if (store.get().unlocked) {
    enterShell(['session restored. type `help` to look around.', ''])
  } else {
    print(['egt.agency secure terminal', 'authorization required.', ''])
    setPrompt('passphrase: ')
  }
  input.focus()
}

function enterShell(lines) {
  mode = 'shell'
  historyIndex = ctx.history.length
  print(lines)
  setPrompt(promptText())
}

function promptText() {
  return `visitor@egt:${displayPath(ctx.cwd, ctx.home)}$ `
}

function setPrompt(text) {
  promptEl.textContent = text
}

function print(lines, className) {
  for (const line of lines) {
    const row = document.createElement('div')
    row.textContent = line === '' ? '\u00a0' : line // A non-breaking space keeps blank lines from collapsing.
    if (className) row.className = className
    output.appendChild(row)
  }
  term.scrollTop = term.scrollHeight
}

// The input keeps focus in every mode, including Snake. That is also what stops typing here from
// feeding eggs.js's Konami buffer: its keyboard listener ignores events whose target is an input.
function onKey(event) {
  if (mode === 'exiting') {
    event.preventDefault()
    return
  }
  if (mode === 'takeover') {
    event.preventDefault()
    if (takeoverKeys) takeoverKeys(event.key)
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    const value = input.value
    input.value = ''
    submit(value)
  } else if (event.key === 'Tab') {
    event.preventDefault()
    if (mode !== 'shell') return
    const result = complete(ctx, input.value)
    if (result.options.length > 0) print([promptText() + input.value, result.options.join('  ')])
    input.value = result.line
  } else if (mode === 'shell' && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
    event.preventDefault()
    const result = historyNav(ctx.history, historyIndex, event.key === 'ArrowUp' ? 'up' : 'down')
    historyIndex = result.index
    input.value = result.value
  }
}

function submit(value) {
  if (mode === 'locked') {
    // Echo masked, and never through execute(), so a guess cannot land in history.
    print(['passphrase: ' + '*'.repeat(value.length)])
    const result = unlockAttempt(value, failures)
    failures = result.failures
    if (result.ok) {
      store.update(state => ({ ...state, unlocked: true }))
      enterShell([...result.lines, ''])
    } else {
      print(result.lines, 'term-error')
    }
    return
  }

  print([promptText() + value])
  const result = execute(ctx, value)
  historyIndex = ctx.history.length
  if (result.clear) output.replaceChildren()
  print(result.out)
  if (result.exit) {
    mode = 'exiting'
    inputLine.hidden = true
    setTimeout(() => {
      window.location.href = 'index.html'
    }, 400)
    return
  }
  setPrompt(promptText())
  if (result.takeover) startTakeover(result.takeover)
}

function startTakeover(takeover) {
  mode = 'takeover'
  output.hidden = true
  inputLine.classList.add('term-line-hidden')
  screen.hidden = false
  takeover({
    draw(text) {
      screen.textContent = text
    },
    onKey(handler) {
      takeoverKeys = handler
    },
    finish(lines) {
      takeoverKeys = null
      screen.hidden = true
      screen.textContent = ''
      output.hidden = false
      inputLine.classList.remove('term-line-hidden')
      mode = 'shell'
      print(lines)
      input.focus()
    },
  })
}
