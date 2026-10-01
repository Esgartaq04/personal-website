// Corruption effects: the site degrades as the hunt progresses (rules in hunt/corruption.js).
// Everything here lives outside <main> (classes on <html>, a canvas and a link on <body>, observers on
// the transition overlay), so script.js's <main> swap never orphans it and script.js is untouched.
// Stage 0 creates nothing and starts nothing.

import {
  ALL_CLASSES,
  ROOT,
  classesFor,
  configFor,
  corruptText,
  glitchLabel,
  nextDelay,
  pick,
  scrambleFrames,
  stageFor,
} from './hunt/corruption.js'
import { createRain, glyphAt, stepRain } from './hunt/rain.js'

const CELL = 16 // px per rain column and row
const TRAIL = 14 // rows in each falling streak
const ACCESS_TEXT = 'ACCESS GRANTED'
const ROOT_TEXT = 'ROOT ACCESS'
const ROOT_BRAND = '(root@egt)-[~]#'

let store = null
let rooted = false
let stage = 0
let config = null
let reducedMotion = false
let rain = null
let burstTimer = null
let accessObserver = null

export function initFx(progressStore, { rooted: startRooted = false } = {}) {
  if (store) return
  store = progressStore
  rooted = startRooted
  const motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null
  reducedMotion = Boolean(motion && motion.matches)
  if (motion && motion.addEventListener) {
    motion.addEventListener('change', event => {
      reducedMotion = event.matches
      refreshFx(true)
    })
  }
  // The shell's fsck / corrupt commands change the setting, then fire this.
  document.addEventListener('egt:fx', () => refreshFx())
  refreshFx(true)
}

export function setRooted(value) {
  rooted = value
  if (store) refreshFx()
}

// GET /api/session. Only players call it (eggs.js checks once they have a fragment), never plain visitors.
export async function fetchRooted() {
  try {
    const response = await fetch('/api/session', { cache: 'no-store' })
    return response.ok && (await response.json()).unlocked === true
  } catch {
    return false
  }
}

// For eggs.js's toasts.
export function toastWarning() {
  return Boolean(config && config.toastWarning)
}

export function refreshFx(force = false) {
  if (!store) return
  const next = stageFor(store.get(), rooted)
  if (next === stage && !force) return
  stage = next
  config = configFor(stage)
  const html = document.documentElement
  html.classList.remove(...ALL_CLASSES)
  html.classList.add(...classesFor(stage))
  updateRain()
  updateBursts()
  updateOverlay()
  updateBreach()
  updateBrand()
}

// --- background rain ---

function updateRain() {
  if (!config || !config.rain) {
    stopRain()
    return
  }
  if (!rain) startRain()
  rain.settings = config.rain
  rain.canvas.style.opacity = String(config.rain.opacity)
  layoutRain()
  if (reducedMotion) {
    cancelAnimationFrame(rain.raf)
    rain.raf = 0
    drawRain() // One still frame; layoutRain already put the streaks on screen.
  } else {
    drawRain()
    if (!rain.raf) rain.raf = requestAnimationFrame(loop)
  }
}

function startRain() {
  const canvas = document.createElement('canvas')
  canvas.id = 'fx-rain'
  canvas.setAttribute('aria-hidden', 'true')
  document.body.prepend(canvas)
  rain = { canvas, ctx: canvas.getContext('2d'), raf: 0, last: 0, onResize: () => layoutRain() }
  window.addEventListener('resize', rain.onResize)
}

function stopRain() {
  if (!rain) return
  cancelAnimationFrame(rain.raf)
  window.removeEventListener('resize', rain.onResize)
  rain.canvas.remove()
  rain = null
}

function layoutRain() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2)
  const width = window.innerWidth
  const height = window.innerHeight
  rain.canvas.width = Math.floor(width * ratio)
  rain.canvas.height = Math.floor(height * ratio)
  rain.ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  rain.width = width
  rain.height = height
  rain.rows = Math.ceil(height / CELL)
  const columns = Math.floor(width / CELL)
  rain.xs = []
  for (let x = 0; x < columns; x++) if (Math.random() < rain.settings.density) rain.xs.push(x)
  rain.red = rain.xs.map(() => Math.random() < rain.settings.red)
  rain.model = createRain(rain.xs.length, rain.rows, Math.random)
  // Pre-warm so streaks are already on screen, rather than every drop starting above the top edge.
  for (let i = 0; i < rain.rows; i++) rain.model = stepRain(rain.model, Math.random, TRAIL)
  const styles = getComputedStyle(document.documentElement)
  rain.green = styles.getPropertyValue('--term-green').trim() || '#00ff41'
  rain.alert = styles.getPropertyValue('--term-alert').trim() || '#ff3333'
}

function loop(now) {
  rain.raf = requestAnimationFrame(loop)
  if (document.hidden || now - rain.last < 1000 / rain.settings.fps) return
  rain.last = now
  rain.model = stepRain(rain.model, Math.random, TRAIL)
  drawRain()
}

function drawRain() {
  const { ctx, model } = rain
  ctx.clearRect(0, 0, rain.width, rain.height)
  ctx.font = `14px "Fira Code", monospace`
  ctx.textBaseline = 'top'
  model.drops.forEach((drop, i) => {
    const column = rain.xs[i]
    for (let k = 0; k < TRAIL; k++) {
      const row = drop.y - k
      if (row < 0 || row >= rain.rows) continue
      ctx.globalAlpha = k === 0 ? 1 : 0.85 * (1 - k / TRAIL)
      ctx.fillStyle = rain.red[i] ? rain.alert : k === 0 ? '#b3ffcc' : rain.green
      // Glyphs change every few ticks, not every frame, so the stream flows rather than strobes.
      ctx.fillText(glyphAt(column, row, Math.floor(model.tick / 3)), column * CELL, row * CELL)
    }
  })
  ctx.globalAlpha = 1
}

// --- brief glitches ---

function updateBursts() {
  clearTimeout(burstTimer)
  burstTimer = null
  if (!config || !config.bursts || reducedMotion) return
  scheduleBurst()
}

function scheduleBurst() {
  burstTimer = setTimeout(() => {
    runBurst(pick(config.kinds, Math.random))
    scheduleBurst()
  }, nextDelay(config.bursts, Math.random))
}

// Fires one glitch now. The scheduler uses it; it is exported so a glitch can be tried on demand.
export function runBurst(kind) {
  if (BURSTS[kind]) BURSTS[kind]()
}

function flash(element, className, ms) {
  if (!element) return
  element.classList.add(className)
  setTimeout(() => element.classList.remove(className), ms)
}

const BURSTS = {
  flicker() {
    flash(document.querySelector('.brand'), 'fx-flicker', 400)
  },
  split() {
    flash(document.querySelector('main'), 'fx-split', 200)
  },
  // A heading scrambles and decodes back to itself. Only plain-text headings, so markup is never lost.
  decode() {
    const headings = [...document.querySelectorAll('main h2, main h3, main .exp-role')].filter(
      el => !el.dataset.fxBusy && [...el.childNodes].every(node => node.nodeType === Node.TEXT_NODE),
    )
    if (headings.length === 0) return
    const el = pick(headings, Math.random)
    const original = el.textContent
    const frames = scrambleFrames(original, 10, Math.random)
    el.dataset.fxBusy = '1'
    frames.forEach((frame, i) => {
      setTimeout(() => {
        el.textContent = frame
        if (i === frames.length - 1) {
          el.textContent = original
          delete el.dataset.fxBusy
        }
      }, i * 45)
    })
  },
  nav() {
    const links = [...document.querySelectorAll('nav a.nav-link')].filter(el => !el.dataset.fxBusy)
    if (links.length === 0) return
    const link = pick(links, Math.random)
    const original = link.textContent
    link.dataset.fxBusy = '1'
    link.textContent = glitchLabel(original, Math.random)
    setTimeout(() => {
      link.textContent = original
      delete link.dataset.fxBusy
    }, 280)
  },
  // The home typewriter "mistypes" and corrects itself. script.js appends to it while typing, so only
  // touch it once its text has stopped changing.
  typo() {
    const target = document.getElementById('typewriter')
    if (!target || target.dataset.fxBusy) return
    const before = target.textContent
    setTimeout(() => {
      if (!before || target.textContent !== before || !target.isConnected) return
      target.dataset.fxBusy = '1'
      target.textContent = corruptText(before, 0.3, Math.random)
      setTimeout(() => {
        target.textContent = before
        delete target.dataset.fxBusy
      }, 350)
    }, 250)
  },
}

// --- transition overlay ---
// script.js shows #access-msg by setting style.display and never touches its text, so swapping the
// text here cannot fight it. The tearing and RGB split are pure CSS on the fx-* classes.

function updateOverlay() {
  const message = document.getElementById('access-msg')
  if (!message) return
  if (stage === 0) {
    if (accessObserver) {
      accessObserver.disconnect()
      accessObserver = null
      message.textContent = ACCESS_TEXT
    }
    return
  }
  if (!accessObserver) {
    accessObserver = new MutationObserver(() => {
      if (message.style.display === 'block') onAccessShown(message)
    })
    accessObserver.observe(message, { attributes: true, attributeFilter: ['style'] })
  }
}

function onAccessShown(message) {
  const real = stage === ROOT ? ROOT_TEXT : ACCESS_TEXT
  const chance = config ? config.transition.corrupt : 0
  if (!reducedMotion && Math.random() < chance) {
    message.textContent = corruptText(real, 0.45, Math.random)
    setTimeout(() => {
      message.textContent = real
    }, 220)
  } else {
    message.textContent = real
  }
}

// --- breach prompt and rooted brand ---

function updateBreach() {
  let link = document.getElementById('fx-breach')
  const onRoot = /\/root(\.html)?$/.test(window.location.pathname)
  if (!config || !config.breach || onRoot) {
    if (link) link.remove()
    return
  }
  if (!link) {
    link = document.createElement('a')
    link.id = 'fx-breach'
    link.href = 'root.html'
    link.textContent = '> /root awaits_'
    document.body.appendChild(link)
  }
}

function updateBrand() {
  document.querySelectorAll('.brand').forEach(brand => {
    const text = [...brand.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim())
    if (!text) return
    if (stage === ROOT) {
      if (brand.dataset.fxOriginal === undefined) brand.dataset.fxOriginal = text.textContent
      text.textContent = ROOT_BRAND
    } else if (brand.dataset.fxOriginal !== undefined) {
      text.textContent = brand.dataset.fxOriginal
    }
  })
}
