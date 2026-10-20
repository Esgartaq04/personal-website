// The rules behind the terminal page transitions: what the typed command and the output lines say,
// how long each step takes, and which effect plays when. Pure functions and constants with no DOM
// access, so they run under Node; nav.js applies them to the page. The command transition's timings,
// the shared wipe and the power-on deadline are tuned here; the decrypt's and the power cycle's own
// timings are in nav/decrypt.js and nav/crt.js.

import { ROOT, configFor } from '../hunt/corruption.js'

export const PROMPT = '(esteban@portfolio)-[~]$'
export const ROOT_PROMPT = '(root@egt)-[~]#'
export const ACCESS_TEXT = 'ACCESS GRANTED'
export const ROOT_ACCESS_TEXT = 'ROOT ACCESS'
export const PANIC_TEXT = 'kernel panic - not syncing: VFS: unable to mount /home/esteban'
export const DECRYPT_STATUS = ' :: access granted'

export const ENTER_PAUSE = 120 // ms between the typed command and its output
export const REVEAL_BUDGET = 400 // ms: the whole content reveal, stagger plus the last element's wipe
export const WIPE_MS = 90 // ms: one element's wipe
export const MAX_STAGGER = 60 // ms between elements, however few there are
export const POWER_ON_DEADLINE = 1000 // ms: the power-on effect gives up and shows the page

// What the server calls a status when HTTP/2 hands back an empty statusText.
const REASONS = { 200: 'OK', 304: 'Not Modified', 404: 'Not Found', 500: 'Internal Server Error' }

const TYPING_MIN = 30
const TYPING_SPAN = 15
const GAP_MIN = 55
const GAP_SPAN = 45

const TRANSITIONS = { nav: 'command', history: 'decrypt', root: 'power' }

// '/about.html' -> 'about.html', and the bare site root -> 'index.html'.
export function pageOf(pathname) {
  return pathname.split('/').pop() || 'index.html'
}

// The label the nav shows for a page: 'index.html' -> '/home', 'about.html' -> '/about'.
export function labelOf(page) {
  return page === 'index.html' ? '/home' : `/${page.replace(/\.html$/, '')}`
}

export function commandFor(page) {
  return `cd ${labelOf(page)}`
}

export function promptFor(stage) {
  return stage === ROOT ? ROOT_PROMPT : PROMPT
}

export function formatSize(bytes) {
  return `${(bytes / 1000).toFixed(1)} kB`
}

// "404 Not Found". HTTP/2 has no reason phrase, so an empty statusText is filled from REASONS.
export function reasonFor(status, statusText) {
  const text = statusText || REASONS[status]
  return text ? `${status} ${text}` : String(status)
}

export function statusLine({ page, status, statusText, bytes, ms }) {
  return `GET /${page}  ${reasonFor(status, statusText)}  ${formatSize(bytes)}  ${Math.round(ms)} ms`
}

export function errorLine(page, reason = 'connection reset') {
  return `cd: ${labelOf(page)}: ${reason}`
}

// The lines printed under the command. Rooted shows ROOT ACCESS; the panic line is the stage's call.
export function outputLines({ status, stage }) {
  const lines = [
    { text: status, kind: 'dim' },
    { text: stage === ROOT ? ROOT_ACCESS_TEXT : ACCESS_TEXT, kind: 'access' },
  ]
  if (configFor(stage)?.transition.panic) lines.push({ text: PANIC_TEXT, kind: 'alert' })
  return lines
}

// One delay per typed character, a little uneven so it reads as typing.
export function typingDelays(text, rng) {
  return Array.from(text, () => Math.round(TYPING_MIN + rng() * TYPING_SPAN))
}

export function outputGap(rng) {
  return Math.round(GAP_MIN + rng() * GAP_SPAN)
}

// Delay between elements and the length of each wipe, such that the last element finishes inside the
// budget no matter how many there are.
export function revealPlan(count, { budget = REVEAL_BUDGET, wipe = WIPE_MS, maxStagger = MAX_STAGGER } = {}) {
  const stagger = count <= 1 ? 0 : Math.min(maxStagger, Math.floor((budget - wipe) / (count - 1)))
  return { stagger, wipe }
}

export function transitionFor(trigger, { reducedMotion, hidden, animate }) {
  if (reducedMotion || hidden || !animate) return 'instant'
  return TRANSITIONS[trigger] ?? 'instant'
}

// True for an element whose children are all text nodes and which has some visible text. nodeType is
// compared to 3 (Node.TEXT_NODE) because the Node test runner has no Node global.
export function isPlainText(el) {
  const children = Array.from(el.childNodes)
  return children.length > 0 && children.every(n => n.nodeType === 3) && el.textContent.trim() !== ''
}

// True for mixed markup: an element with visible text of its own beside child elements or comments,
// like home's `> Subject: <span>…</span>`. A scramble would flatten it, so it wipes in instead.
export function isMixedText(el) {
  const own = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim() !== '')
  return own && !isPlainText(el)
}
