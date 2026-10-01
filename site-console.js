// The site console: a drop-down terminal toggled with ctrl+` (the VS Code terminal shortcut). Commands
// live in hunt/console.js; this file only renders. It is built on first open, appended to <body> outside
// <main> (so the SPA swap never touches it), and all output goes through textContent.

import { complete, createContext, execute, historyNav } from './cli/engine.js'
import { corruptText } from './hunt/corruption.js'
import { registerConsole } from './hunt/console.js'

export function isConsoleChord(event) {
  return event.ctrlKey && !event.altKey && !event.metaKey && event.code === 'Backquote'
}

export function createSiteConsole(deps) {
  const ctx = createContext({ store: deps.store })
  registerConsole(ctx, deps)

  let panel = null
  let output = null
  let input = null
  let promptEl = null
  let pendingPrompt = null // set while su is asking for a password
  let busy = false
  let historyIndex = 0
  let returnFocus = null

  function build() {
    panel = document.createElement('div')
    panel.className = 'site-console'
    panel.setAttribute('role', 'dialog')
    panel.setAttribute('aria-label', 'site console')
    const term = document.createElement('div')
    term.className = 'term site-console-term'
    output = document.createElement('div')
    output.className = 'term-out'
    const line = document.createElement('div')
    line.className = 'term-line'
    promptEl = document.createElement('span')
    promptEl.className = 'term-prompt'
    input = document.createElement('input')
    input.className = 'term-in'
    input.type = 'text'
    input.autocomplete = 'off'
    input.spellcheck = false
    input.setAttribute('autocapitalize', 'off')
    input.setAttribute('aria-label', 'console input')
    line.append(promptEl, input)
    term.append(output, line)
    panel.append(term)
    document.body.append(panel)

    term.addEventListener('click', () => input.focus())
    input.addEventListener('keydown', onKey)

    const welcome = 'egt.agency console. type `help` to see what you can do.'
    // Late in the hunt even the console arrives a little damaged.
    const damaged = document.documentElement.classList.contains('fx-4')
    print([damaged ? corruptText(welcome, 0.12, Math.random) : welcome, ''])
    setPrompt()
  }

  function print(lines, className) {
    for (const text of lines) {
      const row = document.createElement('div')
      row.textContent = text === '' ? ' ' : text
      if (className) row.className = className
      output.append(row)
    }
    output.parentElement.scrollTop = output.parentElement.scrollHeight
  }

  function promptText() {
    return deps.isRooted() ? 'root@egt:~# ' : 'guest@egt:~$ '
  }

  function setPrompt() {
    promptEl.textContent = pendingPrompt ? pendingPrompt.label : promptText()
    input.type = pendingPrompt && pendingPrompt.secret ? 'password' : 'text'
  }

  function isOpen() {
    return Boolean(panel && panel.classList.contains('open'))
  }

  function open() {
    if (!panel) build()
    if (isOpen()) return
    returnFocus = document.activeElement
    panel.classList.add('open')
    setPrompt()
    input.focus()
  }

  function close() {
    if (!isOpen()) return
    panel.classList.remove('open')
    input.blur()
    if (returnFocus && returnFocus.isConnected && typeof returnFocus.focus === 'function') returnFocus.focus()
  }

  function toggle() {
    if (isOpen()) close()
    else open()
  }

  function onKey(event) {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (busy) return
      const value = input.value
      input.value = ''
      submit(value)
    } else if (event.key === 'Tab') {
      event.preventDefault()
      if (pendingPrompt) return
      const result = complete(ctx, input.value)
      if (result.options.length > 0) print([promptText() + input.value, result.options.join('  ')])
      input.value = result.line
    } else if (!pendingPrompt && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault()
      const result = historyNav(ctx.history, historyIndex, event.key === 'ArrowUp' ? 'up' : 'down')
      historyIndex = result.index
      input.value = result.value
    }
  }

  async function submit(value) {
    busy = true
    let result
    if (pendingPrompt) {
      // A password: echo it masked, never run it through execute(), so it never lands in history.
      const current = pendingPrompt
      pendingPrompt = null
      print([current.label + (current.secret ? '*'.repeat(value.length) : value)])
      promptEl.textContent = ''
      result = await current.submit(value)
    } else {
      print([promptText() + value])
      promptEl.textContent = ''
      result = await execute(ctx, value)
      historyIndex = ctx.history.length
    }
    busy = false
    if (result.clear) output.replaceChildren()
    print(result.out, result.error ? 'term-error' : undefined)
    if (result.prompt) pendingPrompt = result.prompt
    setPrompt()
    if (result.exit) close()
    if (result.navigate) {
      input.disabled = true
      setTimeout(() => {
        window.location.href = result.navigate
      }, 700)
    }
  }

  return { open, close, toggle, isOpen }
}
