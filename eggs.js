// Easter egg hunt: wires hunt/trail.js to the page.
// Every listener binds once to document. script.js swaps <main> on navigation and document survives
// that swap, so nothing here ever needs re-binding and nothing can fire twice.

import { createStore, safeStorage } from './hunt/state.js'
import {
  bannerText,
  countFound,
  fragmentById,
  fragmentByText,
  fragmentText,
  isTouchOnly,
  markFound,
  nextHint,
  progressLabel,
  pushKey,
  registerClick,
  shouldIgnoreKeyTarget,
  statusLines,
  toastText,
} from './hunt/trail.js'

const STYLE = 'color:#00ff41;font-family:monospace'
const store = createStore(safeStorage())
const pending = new Set()
let toastTimer = null

if (!isTouchOnly(window.matchMedia ? query => window.matchMedia(query) : undefined)) {
  start()
}

function start() {
  console.log(`%c${bannerText()}`, STYLE)
  window.hunt = hunt
  renderIndicator()

  let keyBuffer = []
  document.addEventListener('keydown', event => {
    if (shouldIgnoreKeyTarget(event.target)) return
    const result = pushKey(keyBuffer, event.key)
    keyBuffer = result.buffer
    if (result.complete) claim('konami')
  })

  let cursorClicks = []
  document.addEventListener('click', event => {
    if (typeof event.target.closest !== 'function' || !event.target.closest('.cursor')) return
    const result = registerClick(cursorClicks, Date.now())
    cursorClicks = result.times
    if (result.triggered) claim('cursor')
  })
}

// Secret fragments have no text in the page's code; the server hands it over once the trigger fires.
async function claim(id) {
  if (pending.has(id) || !markFound(store.get(), id).isNew) return false
  const fragment = fragmentById(id)
  let text = fragmentText(fragment)
  if (text === null) {
    pending.add(id)
    text = await fetchFragment(id)
    pending.delete(id)
    if (text === null) {
      console.log('%c> signal lost. that fragment did not come through. try again.', STYLE)
      return false
    }
  }
  const result = markFound(store.get(), id, text)
  if (!result.isNew) return false
  const state = store.update(() => result.state)
  showToast(toastText({ ...fragment, text }, countFound(state)))
  renderIndicator()
  return true
}

async function fetchFragment(id) {
  try {
    const response = await fetch('/api/fragment', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (!response.ok) return null
    const body = await response.json()
    return typeof body.text === 'string' ? body.text : null
  } catch {
    return null
  }
}

// Calling hunt() at all proves the console was found, so every call claims fragment 1 first.
// Returns nothing, so the console prints the report rather than a pending promise.
function hunt(text) {
  runHunt(text)
}

async function runHunt(text) {
  await claim('console')
  if (text !== undefined) {
    const fragment = fragmentByText(text, store.get().texts)
    if (!fragment) {
      console.log('%c> unknown fragment. keep digging.', STYLE)
      return
    }
    await claim(fragment.id)
  }
  const state = store.get()
  const hint = nextHint(state)
  const report = [`> ${progressLabel(state)} fragments recovered`, ...statusLines(state)]
  report.push(hint ? `> next lead: ${hint}` : '> all fragments recovered. assemble them in order and visit /root.')
  console.log(`%c${report.join('\n')}`, STYLE)
}

// The brand line sits in the header, outside <main>, so the badge survives SPA navigation.
function renderIndicator() {
  const state = store.get()
  const visible = countFound(state) > 0
  document.querySelectorAll('.brand').forEach(brand => {
    let badge = brand.querySelector('.egg-progress')
    if (!visible) {
      if (badge) badge.remove()
      return
    }
    if (!badge) {
      badge = document.createElement('span')
      badge.className = 'egg-progress'
      brand.appendChild(badge)
    }
    badge.textContent = ` ${progressLabel(state)}`
  })
}

function showToast(message) {
  let toast = document.getElementById('egg-toast')
  if (!toast) {
    toast = document.createElement('div')
    toast.id = 'egg-toast'
    toast.className = 'egg-toast'
    toast.setAttribute('role', 'status')
    document.body.appendChild(toast)
  }
  toast.textContent = message
  toast.classList.remove('show')
  void toast.offsetWidth // Force a reflow so back-to-back finds replay the glitch animation.
  toast.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3500)
}
