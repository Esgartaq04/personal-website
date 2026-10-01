// Easter egg hunt: wires hunt/trail.js to the page. Devtools shows the clues (this banner, page
// source, sys_dump.txt); the playing happens in the site console, opened with ctrl+` (site-console.js).
// Every listener binds once to document. script.js swaps <main> on navigation and document survives
// that swap, so nothing here ever needs re-binding and nothing can fire twice.

import { createStore, safeStorage } from './hunt/state.js'
import {
  bannerText,
  countFound,
  fragmentById,
  fragmentText,
  isTouchOnly,
  markFound,
  progressLabel,
  pushKey,
  registerClick,
  shouldIgnoreKeyTarget,
  toastText,
} from './hunt/trail.js'
import { fetchRooted, initFx, isRooted, refreshFx, setRooted, toastWarning } from './fx.js'
import { SIGNAL_LOST } from './hunt/console.js'
import { createSiteConsole, isConsoleChord } from './site-console.js'

const STYLE = 'color:#00ff41;font-family:monospace'
const store = createStore(safeStorage())
const pending = new Set()
let toastTimer = null

if (!isTouchOnly(window.matchMedia ? query => window.matchMedia(query) : undefined)) {
  start()
}

function start() {
  console.log(`%c${bannerText()}`, STYLE)
  // The hunt used to be played here in devtools. It moved to the site console; this only points the way.
  window.hunt = () => console.log('%c> wrong console. press ctrl+` on the page.', STYLE)
  renderIndicator()
  startFx()

  // /root has its own terminal, which owns the keyboard there.
  if (!/\/root(\.html)?$/.test(window.location.pathname)) {
    const siteConsole = createSiteConsole({ store, claim, unlock, isRooted })
    document.addEventListener('keydown', event => {
      if (!isConsoleChord(event)) return
      event.preventDefault()
      siteConsole.toggle()
    })
  }

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

// The corruption effects scale with progress. Only players (one fragment or more) ask the server whether
// /root is unlocked, so a visitor who never starts the hunt makes no extra request and sees no effects.
async function startFx() {
  const rooted = countFound(store.get()) > 0 ? await fetchRooted() : false
  initFx(store, { rooted })
}

// Secret fragments have no text in the page's code; the server hands it over once the trigger fires.
// Resolves to 'new', 'known' (already found, or a claim already in flight), or 'failed'.
async function claim(id) {
  if (pending.has(id) || !markFound(store.get(), id).isNew) return 'known'
  const fragment = fragmentById(id)
  let text = fragmentText(fragment)
  if (text === null) {
    pending.add(id)
    text = await fetchFragment(id)
    pending.delete(id)
    if (text === null) {
      console.log(`%c${SIGNAL_LOST}`, STYLE)
      return 'failed'
    }
  }
  const result = markFound(store.get(), id, text)
  if (!result.isNew) return 'known'
  const state = store.update(() => result.state)
  refreshFx()
  showToast(toastText({ ...fragment, text }, countFound(state)))
  renderIndicator()
  return 'new'
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

// For `su root` in the site console. Same endpoint and cookie as /root's lock screen (lock.js).
async function unlock(passphrase) {
  try {
    const response = await fetch('/api/unlock', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ passphrase }),
    })
    if (response.status === 200) {
      setRooted(true)
      return 'ok'
    }
    return response.status === 401 ? 'denied' : 'error'
  } catch {
    return 'error'
  }
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
  if (toastWarning()) {
    const warning = document.createElement('div')
    warning.className = 'egg-toast-warn'
    warning.textContent = '[!] integrity check failed'
    toast.appendChild(warning)
  }
  toast.classList.remove('show')
  void toast.offsetWidth // Force a reflow so back-to-back finds replay the glitch animation.
  toast.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3500)
}
