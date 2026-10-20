// Navigation: owns nav clicks, Back/Forward, the fetch, the <main> swap and history (rules in
// nav/rules.js). A nav click plays as a typed terminal command timed by the real fetch; Back/Forward
// decrypt the page in place. Everything injected here lives outside <main>, so the swap never touches it.
// Reduced motion, a hidden tab or a missing GSAP (or plugin) swap instantly. Every animated phase has a
// timer fallback, so nothing waits on a frame that never comes.

import { currentStage } from './fx.js'
import { corruptText } from './hunt/corruption.js'
import { GLYPHS } from './hunt/rain.js'
import {
  DECRYPT_STATUS,
  ENTER_PAUSE,
  WIPE_MS,
  commandFor,
  errorLine,
  isPlainText,
  outputGap,
  outputLines,
  pageOf,
  promptFor,
  reasonFor,
  revealPlan,
  statusLine,
  transitionFor,
  typingDelays,
} from './nav/rules.js'

const { gsap, ScrambleTextPlugin, CustomEase } = window
// The transitions use all three, so without any one of them every page change is instant.
const animate = Boolean(gsap && ScrambleTextPlugin && CustomEase)
const CLIPPED = 'inset(0% 100% 0% 0%)' // four values each, so GSAP can interpolate between them
// A left-to-right stepped wipe. lazy: false clips at once: GSAP would otherwise wait for its next frame,
// and freshly swapped content would paint unclipped for one frame.
const WIPE = { clipPath: 'inset(0% 0% 0% 0%)', ease: 'steps(10)', lazy: false }
const SCROLL_MS = 240
const FAIL_PAUSE = 600 // ms the error line stays up before the full page load
const FETCH_DEADLINE = 8000 // ms before a stalled fetch counts as failed
const NOISE_MS = 160 // ms each old line shows glyph noise on Back/Forward
const NOISE_FRAME = 40 // ms between noise frames
const SWEEP_MS = 600 // ms the scan line takes down the pane
const STATUS_MS = 1400 // ms the brand status is up, fades included

if (animate) {
  gsap.registerPlugin(ScrambleTextPlugin, CustomEase)
  // The CRT power cycle's curves.
  CustomEase.create('crtCollapse', '0.7,0,0.9,0.5')
  CustomEase.create('crtOpen', '0.2,0.8,0.3,1')
}

let afterSwap = () => {}
let current = null // the running transition: { fast, finishers, done }
// The newest navigation's request. Anything older never swaps, pushes or falls back over it.
let latest = null
let prompt = null
let scanline = null
let sweeping = null // the scan line's sweep, so the next Back can end it first
let flashing = null // the brand status's fade, likewise

export function initNavigation(options) {
  afterSwap = options.afterSwap
  history.replaceState({ page: pageOf(location.pathname) }, '')
  document.addEventListener('click', async event => {
    const link = event.target.closest?.('a.nav-link')
    if (!link) return
    event.preventDefault()
    const page = link.getAttribute('href')
    // A click mid-transition fast-forwards it; the loop also catches a transition another click started.
    while (current) await finishNow()
    if (page !== pageOf(location.pathname)) navigate(page, 'nav')
  })
  // Back/Forward have already moved the URL; this brings <main> in line with it. The request becomes the
  // newest at once, so a transition still running sees it was overtaken and won't push over it.
  window.addEventListener('popstate', async () => {
    const page = pageOf(location.pathname)
    const request = load(page)
    latest = request
    while (current && request === latest) await finishNow()
    if (request === latest) navigate(page, 'history', request)
  })
}

export function updateActiveNav(page = pageOf(location.pathname)) {
  document.querySelectorAll('nav a').forEach(link => {
    link.classList.toggle('active', link.getAttribute('href') === page)
  })
}

// trigger is 'nav' (a click, which pushes history) or 'history' (Back/Forward, whose URL is already set).
async function navigate(page, trigger, request = load(page)) {
  latest = request
  const push = trigger === 'nav'
  const kind = transitionFor(trigger, {
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    hidden: document.hidden,
    animate,
  })
  try {
    if (kind === 'instant') await instant(page, request, push)
    else if (kind === 'decrypt') await run(kind, () => decrypt(page, request))
    else await run(kind, () => command(page, request))
  } catch (error) {
    // A broken transition must never strand the page half-swapped; a real load always works.
    console.error(error)
    fallback(page, push)
  }
}

// The full page load behind every failure. A history entry's URL is already the page, so it reloads.
function fallback(page, push) {
  if (push) location.href = page
  else location.reload()
}

// Settles to the parsed page, or to { ok: false, reason } on a network error, an HTTP error, a response
// with no <main>, or no response within FETCH_DEADLINE. Never rejects.
async function load(page) {
  const start = performance.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_DEADLINE)
  try {
    const response = await fetch(page, { signal: controller.signal })
    if (!response.ok) return { ok: false, reason: reasonFor(response.status, response.statusText) }
    const html = await response.text()
    const ms = performance.now() - start
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const main = doc.querySelector('main')
    if (!main) return { ok: false, reason: 'malformed response' }
    const { status, statusText } = response
    const bytes = new TextEncoder().encode(html).length
    return { ok: true, main, title: doc.title, stats: { status, statusText, bytes, ms } }
  } catch {
    return { ok: false, reason: controller.signal.aborted ? 'connection timed out' : 'connection reset' }
  } finally {
    clearTimeout(timer)
  }
}

async function instant(page, request, push) {
  const result = await request
  if (request !== latest) return // a newer navigation already took over
  if (!result.ok) {
    fallback(page, push)
    return
  }
  swap(page, result, push)
  afterSwap()
}

function swap(page, result, push) {
  const main = document.querySelector('main')
  main.innerHTML = result.main.innerHTML
  main.scrollTop = 0
  document.title = result.title
  if (push) history.pushState({ page }, '', page)
  updateActiveNav(page)
}

// --- the command transition ---

async function command(page, request) {
  const { root, cmd, cursor } = showPrompt()
  await type(cmd, commandFor(page))
  await pause(ENTER_PAUSE)
  cursor.remove()
  updateActiveNav(page)
  const result = await request
  if (request !== latest) {
    hidePrompt() // a Back or Forward overtook this one while it waited, and swaps in its place
    return
  }
  if (!result.ok) {
    await print(root, [{ text: errorLine(page, result.reason), kind: 'alert' }])
    await pause(FAIL_PAUSE)
    if (request === latest) location.href = page
    else hidePrompt()
    return
  }
  await print(root, outputLines({ status: statusLine({ page, ...result.stats }), stage: currentStage() }))
  const main = document.querySelector('main')
  await scrollOut(main)
  // Overtaken during the output, it still swaps (the old page has scrolled away) but leaves history to
  // the Back/Forward, whose own swap follows at once.
  swap(page, result, request === latest)
  await reveal(main)
  hidePrompt()
  afterSwap()
}

// The prompt row is built once, appended to .terminal-container, and shown only while a command runs.
function showPrompt() {
  if (!prompt) {
    const root = element('div', 'nav-prompt')
    root.setAttribute('aria-hidden', 'true')
    const line = element('div', 'nav-line')
    const ps1 = element('span', 'nav-ps1')
    const cmd = element('span', 'nav-cmd')
    prompt = { root, ps1, cmd, cursor: element('span', 'nav-cursor') }
    line.append(ps1, cmd)
    root.append(line)
    document.querySelector('.terminal-container').append(root)
  }
  clearOutput() // an error line left up by a fallback load that never happened
  prompt.ps1.textContent = promptFor(currentStage())
  prompt.cmd.textContent = ''
  prompt.cmd.after(prompt.cursor)
  prompt.root.classList.add('show')
  return prompt
}

function hidePrompt() {
  prompt.root.classList.remove('show')
  clearOutput()
}

function clearOutput() {
  prompt.root.querySelectorAll('.nav-out').forEach(line => line.remove())
}

function type(target, text) {
  const tl = gsap.timeline()
  let at = 0
  typingDelays(text, Math.random).forEach((delay, i) => {
    at += delay
    tl.call(() => {
      target.textContent = text.slice(0, i + 1)
    }, null, at / 1000)
  })
  return play(tl, at + 500)
}

function pause(ms) {
  return play(gsap.timeline().to({}, { duration: ms / 1000 }), ms + 500)
}

// Output lines print outputGap apart, each wiping in. The access line is announced as soon as it is in
// the DOM, for the corruption effects.
function print(root, lines) {
  const tl = gsap.timeline()
  let at = 0
  lines.forEach(({ text, kind }, i) => {
    if (i > 0) at += outputGap(Math.random)
    const line = element('div', `nav-out nav-${kind}`, text)
    tl.call(() => {
      root.append(line)
      if (kind === 'access') emit('command', 'access', { target: line })
    }, null, at / 1000)
    tl.fromTo(line, { clipPath: CLIPPED }, { ...WIPE, duration: WIPE_MS / 1000 }, at / 1000)
  })
  return play(tl, at + WIPE_MS + 500)
}

// The old content scrolls up out of the pane. Whatever was off screen is clipped away first, so a long
// page's next screenful never scrolls into view and the pane ends empty.
function scrollOut(main) {
  const children = [...main.children]
  const view = main.getBoundingClientRect()
  const bottom = view.top + main.clientHeight
  children.forEach(child => {
    const box = child.getBoundingClientRect()
    const above = Math.max(0, view.top - box.top)
    const below = Math.max(0, box.bottom - bottom)
    child.style.clipPath = `inset(${above}px 0px ${below}px 0px)`
  })
  const tl = gsap.timeline().to(children, {
    y: -(main.clientHeight * 1.1),
    duration: SCROLL_MS / 1000,
    ease: 'steps(8)',
  })
  return play(tl, SCROLL_MS + 500)
}

// The new page wipes in top-down. Blocks that start inside the pane share the reveal budget; the rest
// are simply there. Wipes only, never text edits, and the inline styles go afterwards.
async function reveal(main) {
  const top = main.getBoundingClientRect().top
  const visible = blocksOf(main).filter(block => block.getBoundingClientRect().top - top < main.clientHeight)
  if (visible.length === 0) return
  const { stagger, wipe } = revealPlan(visible.length)
  const kept = keepStyles(visible)
  const tl = gsap.timeline().fromTo(
    visible,
    { clipPath: CLIPPED },
    { ...WIPE, duration: wipe / 1000, stagger: stagger / 1000 },
  )
  await play(tl, stagger * (visible.length - 1) + wipe + 500)
  unclip(kept)
}

// Each element's style attribute as the page had it. Clearing the clip through the CSSOM would leave
// the attribute reformatted, so unclip() puts the original string back instead.
function keepStyles(elements) {
  return elements.map(el => ({ el, style: el.getAttribute('style') }))
}

function unclip(kept) {
  kept.forEach(({ el, style }) => {
    // Set first even when removing: a bare removeAttribute after GSAP's writes is undone by Chrome's
    // lazily synced inline style, which puts back an empty style="".
    el.setAttribute('style', style ?? '')
    if (style === null) el.removeAttribute('style')
  })
}

// The element children of main's sections (or of main). A block taller than the pane is split into its
// children, so a long page still reads top-down instead of wiping as one slab.
function blocksOf(main) {
  const sections = [...main.children].filter(child => child.tagName === 'SECTION')
  const blocks = sections.length ? sections.flatMap(section => [...section.children]) : [...main.children]
  return blocks.flatMap(block =>
    block.offsetHeight > main.clientHeight && block.children.length ? [...block.children] : [block],
  )
}

// --- the decrypt transition (Back/Forward) ---

// No prompt, since nobody typed. A scan line sweeps the pane, the old page's lines dissolve into noise,
// and the new page's lines decrypt in place. Only plain-text leaves (isPlainText) are ever rewritten, and
// each gets its exact text back, so markup and the about-page comment are never touched.
async function decrypt(page, request) {
  const main = document.querySelector('main')
  sweep(main)
  const old = await noiseOut(main)
  const result = await request
  if (request !== latest || !result.ok) {
    restore(old) // overtaken by a newer Back/Forward, or about to reload
    if (request === latest) fallback(page, false)
    return
  }
  swap(page, result, false)
  await decryptIn(main)
  flashStatus()
  afterSwap()
}

// One scan line down the pane, not awaited. It lives outside <main>, so the swap never touches it.
function sweep(main) {
  if (!scanline) {
    scanline = element('div', 'nav-scanline')
    scanline.setAttribute('aria-hidden', 'true')
    document.querySelector('.terminal-container').append(scanline)
  }
  sweeping?.progress(1)
  gsap.set(scanline, { top: main.offsetTop, left: main.offsetLeft, width: main.clientWidth })
  const to = { y: main.clientHeight - 2, duration: SWEEP_MS / 1000, ease: 'none', lazy: false }
  sweeping = gsap.timeline().fromTo(scanline, { y: 0, autoAlpha: 1 }, to).set(scanline, { autoAlpha: 0 })
  play(sweeping, SWEEP_MS + 500)
}

// The old page's on-screen lines turn to glyph noise top-down, and stay noise until the swap replaces
// them. Resolves to the lines it took, so a swap that doesn't happen can put them back.
async function noiseOut(main) {
  const leaves = take(onScreen(main, textLeaves(main)))
  if (leaves.length === 0) return leaves
  const { stagger } = revealPlan(leaves.length, { wipe: 0, maxStagger: 30 })
  const tl = gsap.timeline()
  leaves.forEach(({ el, original }, i) => {
    for (let at = 0; at <= NOISE_MS; at += NOISE_FRAME) {
      tl.call(() => {
        el.textContent = noise(original)
      }, null, (i * stagger + at) / 1000)
    }
  })
  await play(tl, stagger * (leaves.length - 1) + NOISE_MS + 500)
  return leaves
}

// The new page's on-screen lines start as corrupted text and decrypt into the real thing top-down.
// Whatever holds no text at all (images, inputs) wipes in at its place in the reading order. Every line
// gets its exact text back however this ends, before afterSwap() sees the page.
async function decryptIn(main) {
  const texts = textLeaves(main)
  const order = [] // in reading order: { el, text: true } decrypts, { el, text: false } wipes
  onScreen(main, [...main.querySelectorAll('*')]).forEach(el => {
    if (texts.includes(el)) order.push({ el, text: true })
    else if (!texts.some(leaf => el.contains(leaf)) && !order.some(step => step.el.contains(el))) {
      order.push({ el, text: false })
    }
  })
  if (order.length === 0) return
  const leaves = take(order.filter(step => step.text).map(step => step.el))
  const kept = keepStyles(order.filter(step => !step.text).map(step => step.el))
  try {
    const { stagger } = revealPlan(leaves.length, { wipe: 0, maxStagger: 70 })
    const tl = gsap.timeline()
    let slot = 0
    let end = 0
    order.forEach(({ el, text }) => {
      const at = slot * stagger
      if (text) {
        const { original } = leaves[slot++]
        const ms = Math.min(600, 220 + 5 * original.length)
        el.textContent = corruptText(original, 1, Math.random)
        const scrambleText = { text: original, chars: GLYPHS }
        tl.to(el, { scrambleText, duration: ms / 1000, ease: 'none', lazy: false }, at / 1000)
        end = Math.max(end, at + ms)
      } else {
        // As the next line starts to decrypt.
        tl.fromTo(el, { clipPath: CLIPPED }, { ...WIPE, duration: WIPE_MS / 1000 }, at / 1000)
        end = Math.max(end, at + WIPE_MS)
      }
    })
    await play(tl, end + 500)
  } finally {
    restore(leaves)
    unclip(kept)
  }
}

// " :: access granted" beside the brand for a moment, not awaited. A Back moments ago ends its own
// first, so there is only ever one.
function flashStatus() {
  const brand = document.querySelector('.brand')
  if (!brand) return
  flashing?.progress(1)
  const status = element('span', 'brand-status', DECRYPT_STATUS)
  status.setAttribute('aria-hidden', 'true')
  brand.append(status)
  flashing = gsap
    .timeline()
    .fromTo(status, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2, lazy: false })
    .to(status, { autoAlpha: 0, duration: 0.4 }, (STATUS_MS - 400) / 1000)
    .call(() => status.remove())
  play(flashing, STATUS_MS + 500)
}

// main's plain-text leaves, minus any an fx.js burst is rewriting right now.
function textLeaves(main) {
  return [...main.querySelectorAll('*')].filter(el => isPlainText(el) && !el.dataset.fxBusy)
}

// Takes lines for rewriting: keeps each one's exact text, and marks it busy so fx.js's bursts leave it be.
function take(elements) {
  return elements.map(el => {
    el.dataset.fxBusy = '1'
    return { el, original: el.textContent }
  })
}

function restore(leaves) {
  leaves.forEach(({ el, original }) => {
    el.textContent = original
    delete el.dataset.fxBusy
  })
}

// The elements inside main's visible pane. A display: none element has an empty box, so it drops out.
function onScreen(main, elements) {
  const top = main.getBoundingClientRect().top
  const bottom = top + main.clientHeight
  return elements.filter(el => {
    const box = el.getBoundingClientRect()
    return (box.width > 0 || box.height > 0) && box.bottom > top && box.top < bottom
  })
}

// Every visible character swapped for a random glyph; whitespace stays, so the lines keep their shape.
function noise(text) {
  return text.replace(/\S/gu, () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)])
}

function element(tag, className, text = '') {
  const node = document.createElement(tag)
  node.className = className
  node.textContent = text
  return node
}

// --- transition plumbing ---

// Runs one transition: marks <html data-transition>, announces start and end, and clears both even if
// the work throws. Hiding the tab mid-way fast-forwards it, so the swap never waits on a hidden tab.
function run(kind, work) {
  const transition = { fast: false, finishers: new Set() }
  const html = document.documentElement
  const onVisibility = () => {
    if (document.hidden) finishNow()
  }
  current = transition
  html.dataset.transition = kind
  document.addEventListener('visibilitychange', onVisibility)
  const done = (async () => {
    await null // the work starts after the start event below, which already sees transition.done
    try {
      await work()
    } finally {
      document.removeEventListener('visibilitychange', onVisibility)
      if (current === transition) {
        current = null
        delete html.dataset.transition
      }
      emit(kind, 'end')
    }
  })()
  transition.done = done.catch(() => {})
  emit(kind, 'start') // a listener that calls finishNow() here gets a real promise, and a fast transition
  return done
}

// The running transition and all its remaining phases run at zero duration. It still awaits the fetch
// and still swaps. Resolves when it has ended, and never rejects.
function finishNow() {
  if (!current) return Promise.resolve()
  current.fast = true
  current.finishers.forEach(finish => finish())
  return current.done
}

// Resolves when the timeline completes, or after maxMs if it never ticks (a hidden tab), and always
// leaves it at its end state. Under finishNow it ends at once.
function play(timeline, maxMs) {
  const owner = current
  return new Promise(resolve => {
    let ended = false
    const finish = () => {
      if (ended) return
      ended = true
      clearTimeout(timer)
      owner?.finishers.delete(finish)
      if (timeline.progress() < 1) timeline.progress(1)
      resolve()
    }
    const timer = setTimeout(finish, maxMs)
    timeline.eventCallback('onComplete', finish)
    if (owner?.fast) finish()
    else owner?.finishers.add(finish)
  })
}

function emit(kind, phase, extra) {
  document.dispatchEvent(new CustomEvent('egt:transition', { detail: { kind, phase, ...extra } }))
}
