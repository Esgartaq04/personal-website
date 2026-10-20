// The Back/Forward decrypt's phases: a scan line down the pane, the old page's lines dissolving into
// noise, the new page's lines decrypting in place, and the brand status. Touches the DOM: it rewrites
// main's plain-text leaves (isPlainText) and adds the scan line and status outside <main>. Every line
// gets its exact text back, so markup and the about-page comment are never touched. nav.js runs the
// phases around the fetch and the swap.

import { corruptText } from '../hunt/corruption.js'
import { GLYPHS } from '../hunt/rain.js'
import { DECRYPT_STATUS, WIPE_MS, isPlainText, revealPlan } from './rules.js'
import { CLIPPED, WIPE, element, keepStyles, unclip } from './dom.js'
import { play } from './runner.js'

const { gsap } = window
// Worst case, old noise then new decrypt:
// NOISE_BUDGET + NOISE_MS + DECRYPT_BUDGET + DECRYPT_MAX = 120 + 160 + 250 + 450 = 980ms, inside 1s.
const NOISE_MS = 160 // ms each old line shows glyph noise
const NOISE_FRAME = 40 // ms between noise frames
const NOISE_BUDGET = 120 // ms from the first old line's noise to the last one's start
const NOISE_STAGGER = 30 // ms between old lines at most
const DECRYPT_BASE = 220 // ms a new line takes to decrypt, plus DECRYPT_PER_CHAR per character...
const DECRYPT_PER_CHAR = 5
const DECRYPT_MAX = 450 // ...up to this
const DECRYPT_BUDGET = 250 // ms from the first new line's decrypt to the last one's start
const DECRYPT_STAGGER = 70 // ms between new lines at most
const SWEEP_MS = 600 // ms the scan line takes down the pane
const STATUS_MS = 1400 // ms the brand status is up, fades included

let scanline = null
let sweeping = null // the scan line's sweep, so the next Back can end it first
let flashing = null // the brand status's fade, likewise

// One scan line down the pane, not awaited. It lives outside <main>, so the swap never touches it.
export function sweep(main) {
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
export async function noiseOut(main) {
  const leaves = take(onScreen(main, textLeaves(main)))
  if (leaves.length === 0) return leaves
  const { stagger } = revealPlan(leaves.length, { budget: NOISE_BUDGET, wipe: 0, maxStagger: NOISE_STAGGER })
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
export async function decryptIn(main) {
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
    const plan = { budget: DECRYPT_BUDGET, wipe: 0, maxStagger: DECRYPT_STAGGER }
    const { stagger } = revealPlan(leaves.length, plan)
    const tl = gsap.timeline()
    let slot = 0
    let end = 0
    order.forEach(({ el, text }) => {
      const at = slot * stagger
      if (text) {
        const { original } = leaves[slot++]
        const ms = Math.min(DECRYPT_MAX, DECRYPT_BASE + DECRYPT_PER_CHAR * original.length)
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
export function flashStatus() {
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

// Puts back the exact text of lines noiseOut() or decryptIn() took.
export function restore(leaves) {
  leaves.forEach(({ el, original }) => {
    el.textContent = original
    delete el.dataset.fxBusy
  })
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
