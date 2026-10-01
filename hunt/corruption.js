// How "corrupted" the site looks at each point in the hunt. Pure rules and text transforms; fx.js
// applies them to the page. Stage 0 means nothing at all happens, so visitors who never start the
// hunt see the site exactly as it was. Tune intensities here, in one table.

import { countFound } from './trail.js'
import { GLYPHS } from './rain.js'

export const ROOT = 'root'

// rain:       background code rain. density = share of columns with a drop, opacity = canvas opacity
//             (each streak also fades along its length, so the visible strength is lower than this),
//             fps = animation rate, red = share of columns drawn in the alert colour.
// bursts:     [min, max] ms between brief glitches, or null. kinds = which glitches can fire.
// transition: page-change overlay. glitch = RGB split and tearing, corrupt = chance ACCESS GRANTED
//             lands corrupted first, panic = fake kernel panic line.
const S1 = {
  rain: { density: 0.18, opacity: 0.14, fps: 10, red: 0 },
  bursts: [30000, 60000],
  kinds: ['flicker'],
  transition: { glitch: false, corrupt: 0, panic: false },
  toastWarning: false,
  breach: false,
}
const S2 = { ...S1, transition: { glitch: true, corrupt: 0.5, panic: false } }
const S3 = {
  ...S2,
  rain: { density: 0.3, opacity: 0.18, fps: 14, red: 0 },
  bursts: [20000, 45000],
  kinds: ['flicker', 'split', 'decode'],
}
const S4 = {
  ...S3,
  rain: { density: 0.38, opacity: 0.21, fps: 16, red: 0 },
  kinds: ['flicker', 'split', 'decode', 'nav', 'typo'],
  transition: { glitch: true, corrupt: 0.8, panic: false },
  toastWarning: true,
}
const S5 = {
  ...S4,
  rain: { density: 0.45, opacity: 0.24, fps: 18, red: 0.12 },
  transition: { glitch: true, corrupt: 1, panic: true },
  breach: true,
}
// Rooted: the visitor won. Calmer than stage 5: a slow, steady stream, no red, no bursts.
const SROOT = {
  rain: { density: 0.3, opacity: 0.18, fps: 8, red: 0 },
  bursts: null,
  kinds: [],
  transition: { glitch: false, corrupt: 0, panic: false },
  toastWarning: false,
  breach: false,
}

export const STAGES = { 0: null, 1: S1, 2: S2, 3: S3, 4: S4, 5: S5, [ROOT]: SROOT }

export function stageFor(state, rooted = false) {
  if (state.fx === 'off') return 0
  if (rooted) return ROOT
  return countFound(state)
}

export function configFor(stage) {
  return STAGES[stage] ?? null
}

// Cumulative classes for <html>, so CSS can say ".fx-3 x" and mean "stage 3 or later".
export function classesFor(stage) {
  if (stage === ROOT) return ['fx', 'fx-1', 'fx-root']
  if (!stage) return []
  return ['fx', ...Array.from({ length: stage }, (_, i) => `fx-${i + 1}`)]
}

export const ALL_CLASSES = ['fx', 'fx-1', 'fx-2', 'fx-3', 'fx-4', 'fx-5', 'fx-root']

const LOOKALIKES = { a: '4', e: '3', i: '1', o: '0', s: '5', t: '7', g: '9', b: '8', l: '|' }

function lookalike(ch, rng) {
  const swap = LOOKALIKES[ch.toLowerCase()]
  return swap ?? GLYPHS[Math.floor(rng() * GLYPHS.length)]
}

// Swaps roughly `intensity` of the visible characters for look-alikes or glyphs. Whitespace is kept,
// so word shapes survive and the text stays guessable.
export function corruptText(text, intensity, rng) {
  let out = ''
  for (const ch of text) out += /\s/.test(ch) || rng() >= intensity ? ch : lookalike(ch, rng)
  return out
}

// Frames for a "decode" effect: starts fully scrambled, resolves left to right, ends on the real text.
export function scrambleFrames(text, steps, rng) {
  const chars = [...text]
  const frames = []
  for (let step = 0; step <= steps; step++) {
    const revealed = Math.round((chars.length * step) / steps)
    frames.push(
      chars
        .map((ch, i) => (i < revealed || /\s/.test(ch) ? ch : GLYPHS[Math.floor(rng() * GLYPHS.length)]))
        .join(''),
    )
  }
  return frames
}

// One wrong character, preferring a look-alike: "/home" -> "/h0me".
export function glitchLabel(label, rng) {
  const chars = [...label]
  const candidates = chars.map((ch, i) => (LOOKALIKES[ch.toLowerCase()] ? i : -1)).filter(i => i !== -1)
  const pool = candidates.length ? candidates : chars.map((ch, i) => (/\s/.test(ch) ? -1 : i)).filter(i => i !== -1)
  if (pool.length === 0) return label
  const index = pool[Math.floor(rng() * pool.length)]
  chars[index] = lookalike(chars[index], rng)
  return chars.join('')
}

export function nextDelay([min, max], rng) {
  return Math.round(min + rng() * (max - min))
}

export function pick(items, rng) {
  return items[Math.floor(rng() * items.length)]
}
