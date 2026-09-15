// Easter egg hunt: wires hunt/trail.js to the page.
// Every listener binds once to document. script.js swaps <main> on navigation and document survives
// that swap, so nothing here ever needs re-binding and nothing can fire twice.

import { createStore, safeStorage } from './hunt/state.js'
import {
  bannerText,
  countFound,
  fragmentById,
  fragmentByText,
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

function claim(id) {
  if (!markFound(store.get(), id).isNew) return false
  const state = store.update(current => markFound(current, id).state)
  showToast(toastText(fragmentById(id), countFound(state)))
  renderIndicator()
  return true
}

// Calling hunt() at all proves the console was found, so every call claims fragment 1 first.
function hunt(text) {
  claim('console')
  if (text !== undefined) {
    const fragment = fragmentByText(text)
    if (!fragment) {
      console.log('%c> unknown fragment. keep digging.', STYLE)
      return
    }
    claim(fragment.id)
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
