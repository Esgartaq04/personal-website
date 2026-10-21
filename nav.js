// Navigation: owns nav clicks, Back/Forward, the fetch, the <main> swap and history (rules in
// nav/rules.js). A nav click plays as a typed terminal command timed by the real fetch, built here;
// Back/Forward decrypt the page in place (nav/decrypt.js); entering or leaving /root power-cycles the
// screen (nav/crt.js), which also boots the first page of a session. Every transition plays through
// nav/runner.js. Everything injected lives outside <main>, so the swap never touches it. Reduced motion,
// a hidden tab or a missing GSAP (or plugin) swap or navigate instantly. Every animated phase has a timer
// fallback, so nothing waits on a frame that never comes.
//
// root.html loads this file too, for the power cycle alone: importing it only runs powerOn(). Clicks,
// Back/Forward and history are left alone until a page calls initNavigation().

import { currentStage } from './fx.js'
import {
  ENTER_PAUSE,
  WIPE_MS,
  commandFor,
  errorLine,
  outputGap,
  outputLines,
  pageOf,
  promptFor,
  reasonFor,
  revealPlan,
  statusLine,
  typingDelays,
} from './nav/rules.js'
import { CLIPPED, WIPE, element, keepStyles, unclip } from './nav/dom.js'
import { current, emit, finishNow, kindFor, play, run } from './nav/runner.js'
import { decryptIn, flashStatus, noiseOut, restore, sweep } from './nav/decrypt.js'
import { powerOffTo, powerOn } from './nav/crt.js'

export { powerOffTo }

const { gsap } = window
const SCROLL_MS = 240
const FAIL_PAUSE = 600 // ms the error line stays up before the full page load
const FETCH_DEADLINE = 8000 // ms before a stalled fetch counts as failed

let afterSwap = () => {}
// The newest navigation's request. Anything older never swaps, pushes or falls back over it.
let latest = null
// The page the newest navigation leads to, so a second click on it (a double-click) doesn't restart it.
let heading = null
let prompt = null

// The boot, or the power-on after a power-off: only when this page's head script asked for one.
powerOn()

export function initNavigation(options) {
  afterSwap = options.afterSwap
  history.replaceState({ page: pageOf(location.pathname) }, '')
  heading = pageOf(location.pathname)
  document.addEventListener('click', async event => {
    // Modified and non-primary clicks are the browser's (a new tab or window), on every link here.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    // The stage 5 breach link (fx.js) leads to /root, so it power-cycles like every other way in.
    const breach = event.target.closest?.('a#fx-breach')
    if (breach) {
      event.preventDefault()
      powerOffTo(breach.getAttribute('href'))
      return
    }
    const link = event.target.closest?.('a.nav-link')
    if (!link) return
    event.preventDefault()
    const page = link.getAttribute('href')
    // Already there, or already on the way (a double-click): a click mid-transition fast-forwards it, and
    // that's all.
    if (page === (current ? heading : pageOf(location.pathname))) {
      while (current) await finishNow()
      return
    }
    // Anywhere else, the fetch starts at once and this click becomes the newest, like a Back below: a
    // transition still running is fast-forwarded without swapping, pushing or falling back over it, and
    // the loop also catches one another click started. The newest click is the one that navigates.
    const request = load(page)
    latest = request
    heading = page
    while (current && request === latest) await finishNow()
    if (request === latest) navigate(page, 'nav', request)
  })
  // Back/Forward have already moved the URL; this brings <main> in line with it. The request becomes the
  // newest at once, so a transition still running sees it was overtaken and won't push over it.
  window.addEventListener('popstate', async () => {
    const page = pageOf(location.pathname)
    const request = load(page)
    latest = request
    heading = page
    while (current && request === latest) await finishNow()
    if (request === latest) navigate(page, 'history', request)
  })
  // A fallback's full load that failed, then Back: the back/forward cache brings this page back as it was
  // left, with the error line and the failed page's nav highlight still up.
  window.addEventListener('pageshow', event => {
    if (!event.persisted || current) return
    if (prompt) hidePrompt()
    updateActiveNav()
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
  const kind = kindFor(trigger)
  try {
    if (kind === 'instant') await instant(page, request, push)
    else if (kind === 'decrypt') await run(kind, () => decrypt(page, request))
    else await run(kind, () => command(page, request))
  } catch (error) {
    // A broken transition must never strand the page half-swapped; a real load always works. Unless a
    // newer navigation (a Back, say) has taken over: it swaps its own page in, so this one stands aside.
    console.error(error)
    if (request === latest) fallback(page, push)
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
  // A click back to the page the URL already shows (one that overtook a command headed elsewhere) adds
  // no second entry for it.
  if (push && page !== pageOf(location.pathname)) history.pushState({ page }, '', page)
  updateActiveNav(page)
}

// --- the command transition ---

async function command(page, request) {
  const { root, cmd, cursor } = showPrompt()
  await type(cmd, commandFor(page))
  await pause(ENTER_PAUSE)
  // A fetch still pending keeps the cursor waiting on the command line until it settles.
  const result = await request
  cursor.remove()
  if (request !== latest) {
    hidePrompt() // a newer click, or a Back or Forward, overtook this one and swaps in its place
    return
  }
  updateActiveNav(page)
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
  // the newer click or Back/Forward, whose own swap follows at once.
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
// and the new page's lines decrypt in place (the phases are in nav/decrypt.js).
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
