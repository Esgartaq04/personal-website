// The CRT power cycle. Power-on: a dot stretches into a line, then the full screen, under a fading flash,
// and the picture flickers as it settles. It plays on the first page of a session and on the page a
// power-off leads to. Power-off: the screen collapses to a line, then a dot whose afterglow fades, then
// the browser navigates; it is how /root is entered and left. Touches the DOM: it lays #crt over the page
// (a black mask with .crt-window cut out of it) and jitters .terminal-container. The content underneath
// is never hidden or scaled, only covered.
//
// Power-on: DOT_MS + OPEN_MS = 580ms until the page is readable, plus SETTLE_MS = 860ms in all.
// Power-off: COLLAPSE_MS + AFTERGLOW_MS = 980ms, then the navigation.

import { POWER_ON_DEADLINE } from './rules.js'
import { element } from './dom.js'
import { finishNow, kindFor, play, run } from './runner.js'

const { gsap } = window
const DOT = 8 // px: the dot the screen starts from and ends in
const LINE = 2 // px: the line's height
const DOT_MS = 60 // ms the dot shows before it stretches
const OPEN_MS = 520 // ms from the dot to the full screen...
const OPEN_LINE = 0.3 // ...with a full-width line by this fraction of it
const SETTLE_MS = 280 // ms of flicker and jitter once open
const COLLAPSE_MS = 380 // ms from the full screen to the dot...
const COLLAPSE_LINE = 0.65 // ...with a line by this fraction of it
const AFTERGLOW_MS = 600 // ms the dot takes to fade and shrink away
const POWER_OFF_DEADLINE = 1500 // ms after which a power-off navigates whatever the animation is doing
const UNCOVER_MS = 3000 // ms after navigating that a page still here gets its screen back
const FLICKER = [0.55, 1, 0.7, 1, 0.85] // the terminal's opacity at each of the settle's five steps

// Runs once, as nav.js loads. The head script sets html.power-on, whose CSS cover is black from first
// paint, only when the screen should power on. Too late, or nothing to animate with, and the cover just
// goes. Should this never run at all, the CSS clears the cover after 1.2s by itself.
export function powerOn() {
  const html = document.documentElement
  if (!html.classList.contains('power-on')) return
  if (kindFor('root') === 'instant' || performance.now() >= POWER_ON_DEADLINE) {
    html.classList.remove('power-on')
    return
  }
  // A key or click skips it. The signal drops both listeners when it ends, so a later key press never
  // fast-forwards some other transition.
  const skip = new AbortController()
  const options = { once: true, signal: skip.signal }
  window.addEventListener('keydown', () => finishNow(), options)
  window.addEventListener('pointerdown', () => finishNow(), options)
  run('power', async () => {
    const { crt, win, width, height } = mount()
    try {
      gsap.set(win, { width: DOT, height: DOT, borderRadius: '50%', '--crt-flash': 1 })
      html.classList.remove('power-on') // the mask takes over from the cover in this same frame
      const line = (OPEN_MS * OPEN_LINE) / 1000
      const flash = { '--crt-flash': 0, duration: OPEN_MS / 1000, ease: 'none', immediateRender: false }
      const open = gsap
        .timeline()
        .to(win, { width, height: LINE, borderRadius: 0, duration: line, ease: 'crtOpen' }, DOT_MS / 1000)
        .to(win, { height, duration: OPEN_MS / 1000 - line, ease: 'crtOpen' })
        .fromTo(win, { '--crt-flash': 0.9 }, flash, DOT_MS / 1000)
      await play(open, DOT_MS + OPEN_MS + 500)
    } finally {
      crt.remove()
    }
    await settle()
  })
    .catch(error => console.error(error))
    .finally(() => {
      skip.abort()
      html.classList.remove('power-on')
    })
}

// Powers the screen off, then navigates to url, whose page powers on as it loads. It always navigates:
// at once when there is nothing to animate, else as the afterglow ends, or at POWER_OFF_DEADLINE
// whatever the animation is doing.
export async function powerOffTo(url) {
  let crt = null
  let gone = false
  const go = () => {
    if (gone) return
    gone = true
    if (crt) uncoverIfStillHere(crt)
    location.href = url
  }
  if (kindFor('root') === 'instant') {
    go()
    return
  }
  const deadline = setTimeout(go, POWER_OFF_DEADLINE)
  try {
    await run('power', async () => {
      try {
        sessionStorage.setItem('egt.poweroff', '1') // tells the next page's head script to power on
      } catch {}
      const mounted = mount()
      crt = mounted.crt
      const { win, width, height } = mounted
      const line = (COLLAPSE_MS * COLLAPSE_LINE) / 1000
      const dot = { width: DOT, height: DOT, borderRadius: '50%', duration: COLLAPSE_MS / 1000 - line }
      const flash = { '--crt-flash': 1, duration: COLLAPSE_MS / 1000, ease: 'crtCollapse' }
      const collapse = gsap
        .timeline()
        .fromTo(win, { width, height }, { height: LINE, duration: line, ease: 'crtCollapse' })
        .to(win, { ...dot, ease: 'crtCollapse' })
        .fromTo(win, { '--crt-flash': 0 }, flash, 0)
      await play(collapse, COLLAPSE_MS + 500)
      const fade = { width: 0, height: 0, '--crt-flash': 0, ease: 'power2.out' }
      await play(gsap.timeline().to(win, { ...fade, duration: AFTERGLOW_MS / 1000 }), AFTERGLOW_MS + 500)
    })
  } catch (error) {
    console.error(error)
  } finally {
    clearTimeout(deadline)
    go()
  }
}

// After a power-off navigates, the black stays up until the next page paints over it. Should this page
// stay or come back instead (Back while the next one loads, the back/forward cache, or Stop or Esc,
// which fire nothing here), it is uncovered: on pageshow, popstate, a key or click, or after UNCOVER_MS,
// whichever comes first, which drops the rest. No later page powers on for the one that never came.
function uncoverIfStillHere(crt) {
  const done = new AbortController()
  const uncover = () => {
    done.abort()
    crt.remove()
    try {
      sessionStorage.removeItem('egt.poweroff')
    } catch {}
  }
  const timer = setTimeout(uncover, UNCOVER_MS)
  done.signal.addEventListener('abort', () => clearTimeout(timer))
  for (const type of ['pageshow', 'popstate', 'keydown', 'pointerdown']) {
    window.addEventListener(type, uncover, { signal: done.signal })
  }
}

// #crt: black over the whole page except for .crt-window in its middle (the black is the window's
// box-shadow, see style.css). The cycle only ever resizes the window.
function mount() {
  const crt = document.createElement('div')
  crt.id = 'crt'
  crt.setAttribute('aria-hidden', 'true')
  const win = element('div', 'crt-window')
  crt.append(win)
  document.body.append(crt)
  return { crt, win, width: crt.clientWidth, height: crt.clientHeight }
}

// The picture settles: the terminal flickers and jumps 2-4px up or down in five steps (a steps(5)
// flicker), then its inline styles go.
function settle() {
  const container = document.querySelector('.terminal-container')
  if (!container) return Promise.resolve()
  const step = SETTLE_MS / FLICKER.length / 1000
  const tl = gsap.timeline()
  FLICKER.forEach((opacity, i) => {
    const jitter = (i % 2 ? -1 : 1) * (2 + Math.round(Math.random() * 2))
    tl.set(container, { opacity, y: jitter }, i * step)
  })
  tl.set(container, { clearProps: 'opacity,transform' }, SETTLE_MS / 1000)
  return play(tl, SETTLE_MS + 500)
}
