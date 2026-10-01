// /root's shell. Served only to visitors with a valid unlock cookie (middleware.js); lock.js imports it
// after /api/unlock succeeds and calls start(). Logic lives in shell/; this file only renders.

import { createStore, safeStorage } from './hunt/state.js'
import { complete, createContext, execute, historyNav, register, registerBuiltins } from './shell/core.js'
import { registerExtras } from './shell/commands.js'
import { snakeCommand } from './shell/snake.js'
import { matrixCommand } from './shell/matrix.js'
import { registerArcade } from './shell/arcade.js'
import { TREE, displayPath } from './shell/vfs.js'
import { input, inputLine, output, print, screen, setPrompt } from './term.js'

const store = createStore(safeStorage())
const ctx = createContext({ tree: TREE, store, now: () => Date.now() })
registerBuiltins(ctx)
registerExtras(ctx)
register(ctx, 'snake', snakeCommand)
register(ctx, 'matrix', matrixCommand)
registerArcade(ctx) // After the builtins: it wraps sudo.

// 'shell' | 'takeover' | 'exiting'
let mode = 'shell'
let historyIndex = 0
let takeoverKeys = null
let takeoverKeysUp = null

export function start(lines) {
  input.addEventListener('keydown', onKey)
  input.addEventListener('keyup', onKeyUp)
  historyIndex = ctx.history.length
  print(lines)
  setPrompt(promptText())
  input.focus()
}

function promptText() {
  return `visitor@egt:${displayPath(ctx.cwd, ctx.home)}$ `
}

// The input keeps focus in every mode, including takeovers. That is also what stops typing here from
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
    const result = complete(ctx, input.value)
    if (result.options.length > 0) print([promptText() + input.value, result.options.join('  ')])
    input.value = result.line
  } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault()
    const result = historyNav(ctx.history, historyIndex, event.key === 'ArrowUp' ? 'up' : 'down')
    historyIndex = result.index
    input.value = result.value
  }
}

// Only games that track held keys (the platformer) ask for releases.
function onKeyUp(event) {
  if (mode === 'takeover' && takeoverKeysUp) takeoverKeysUp(event.key)
}

function submit(value) {
  print([promptText() + value])
  const result = execute(ctx, value)
  historyIndex = ctx.history.length
  if (result.clear) output.replaceChildren()
  print(result.out)
  if (result.download) download(result.download)
  if (result.fx) document.dispatchEvent(new Event('egt:fx')) // fx.js re-reads the setting.
  if (result.exit || result.navigate) {
    mode = 'exiting'
    inputLine.hidden = true
    setTimeout(() => {
      window.location.href = result.navigate || 'index.html'
    }, 400)
    return
  }
  setPrompt(promptText())
  if (result.takeover) startTakeover(result.takeover)
}

function download(href) {
  const link = document.createElement('a')
  link.href = href
  link.download = href.split('/').pop()
  document.body.appendChild(link)
  link.click()
  link.remove()
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
    onKey(down, up = null) {
      takeoverKeys = down
      takeoverKeysUp = up
    },
    finish(lines) {
      takeoverKeys = null
      takeoverKeysUp = null
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
