// Navigation: owns nav clicks, the fetch, the <main> swap and history, and plays each page change as a
// typed terminal command timed by the real fetch (rules in nav/rules.js). Everything injected here lives
// outside <main>, so the swap never touches it. Reduced motion, a hidden tab or a missing GSAP swap
// instantly. Every animated phase has a timer fallback, so nothing waits on a frame that never comes.

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
  transitionFor,
  typingDelays,
} from './nav/rules.js'

const { gsap, ScrambleTextPlugin, CustomEase } = window
const animate = Boolean(gsap)
const CLIPPED = 'inset(0% 100% 0% 0%)' // four values each, so GSAP can interpolate between them
// A left-to-right stepped wipe. lazy: false clips at once: GSAP would otherwise wait for its next frame,
// and freshly swapped content would paint unclipped for one frame.
const WIPE = { clipPath: 'inset(0% 0% 0% 0%)', ease: 'steps(10)', lazy: false }
const SCROLL_MS = 240
const FAIL_PAUSE = 600 // ms the error line stays up before the full page load

if (animate && ScrambleTextPlugin && CustomEase) {
  gsap.registerPlugin(ScrambleTextPlugin, CustomEase)
  // The CRT power cycle's curves.
  CustomEase.create('crtCollapse', '0.7,0,0.9,0.5')
  CustomEase.create('crtOpen', '0.2,0.8,0.3,1')
}

let afterSwap = () => {}
let current = null // the running transition: { fast, finishers, done }
let latest = null // the newest navigation's request, so a slower instant response never lands over it
let prompt = null

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
}

export function updateActiveNav(page = pageOf(location.pathname)) {
  document.querySelectorAll('nav a').forEach(link => {
    link.classList.toggle('active', link.getAttribute('href') === page)
  })
}

async function navigate(page, trigger) {
  const request = load(page)
  latest = request
  const kind = transitionFor(trigger, {
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    hidden: document.hidden,
    animate,
  })
  try {
    if (kind === 'instant') await instant(page, request)
    else await run(kind, () => command(page, request))
  } catch (error) {
    // A broken transition must never strand the page half-swapped; a real load always works.
    console.error(error)
    location.href = page
  }
}

// Settles to the parsed page, or to { ok: false, reason } on a network error, an HTTP error, or a
// response with no <main>. Never rejects.
async function load(page) {
  const start = performance.now()
  try {
    const response = await fetch(page)
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
    return { ok: false, reason: 'connection reset' }
  }
}

async function instant(page, request) {
  const result = await request
  if (request !== latest) return // a newer click already took over
  if (!result.ok) {
    location.href = page
    return
  }
  swap(page, result)
  afterSwap()
}

function swap(page, result) {
  const main = document.querySelector('main')
  main.innerHTML = result.main.innerHTML
  main.scrollTop = 0
  document.title = result.title
  history.pushState({ page }, '', page)
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
  if (!result.ok) {
    await print(root, [{ text: errorLine(page, result.reason), kind: 'alert' }])
    await pause(FAIL_PAUSE)
    location.href = page
    return
  }
  await print(root, outputLines({ status: statusLine({ page, ...result.stats }), stage: currentStage() }))
  const main = document.querySelector('main')
  await scrollOut(main)
  swap(page, result)
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
  prompt.ps1.textContent = promptFor(currentStage())
  prompt.cmd.textContent = ''
  prompt.cmd.after(prompt.cursor)
  prompt.root.classList.add('show')
  return prompt
}

function hidePrompt() {
  prompt.root.classList.remove('show')
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
  const tl = gsap.timeline().fromTo(
    visible,
    { clipPath: CLIPPED },
    { ...WIPE, duration: wipe / 1000, stagger: stagger / 1000 },
  )
  await play(tl, stagger * (visible.length - 1) + wipe + 500)
  gsap.set(visible, { clearProps: 'clipPath,transform' })
  visible.forEach(block => block.getAttribute('style') === '' && block.removeAttribute('style'))
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
  emit(kind, 'start')
  const done = (async () => {
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
