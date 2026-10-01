// The hunt's rules: fragments, hints, and the pure trigger logic eggs.js wires to the page.

// Trail order is passphrase order and difficulty order. Hints name pages, never URLs:
// the live site serves /about.html, not /about.
//
// Only the two fragments that are found by reading public files carry their text here. The other
// three, and therefore the passphrase, exist only server-side (HUNT_FRAGMENTS, see lib/hunt.js):
// the browser gets each one from /api/fragment when its trigger fires, and /api/unlock checks the answer.
export const FRAGMENTS = [
  { id: 'console', text: null, hint: 'open the site console (ctrl+`) and type hunt.' },
  { id: 'cursor', text: null, hint: 'the cursor on the home page keeps blinking at you. knock three times.' },
  { id: 'comment', text: 'ash_', hint: 'some pages say more than they render. read the source of the about page.' },
  { id: 'konami', text: null, hint: 'an old cheat code still works here. up, up...' },
  { id: 'robots', text: '0xd4', hint: 'even robots are told where not to look. find out what they were told.' },
]

export const SECRET_IDS = FRAGMENTS.filter(f => f.text === null).map(f => f.id)

export const KONAMI = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a']

const MODIFIER_KEYS = new Set(['shift', 'control', 'alt', 'meta', 'capslock'])

export function normalizePassphrase(input) {
  return typeof input === 'string' ? input.trim().toLowerCase() : ''
}

export function fragmentById(id) {
  return FRAGMENTS.find(f => f.id === id) || null
}

// Matches public fragment text, plus secret text the visitor has already earned (state.texts).
export function fragmentByText(text, earned = {}) {
  if (typeof text !== 'string') return null
  const wanted = text.trim().toLowerCase()
  return FRAGMENTS.find(f => (f.text ?? earned[f.id]) === wanted) || null
}

export function fragmentText(fragment, earned = {}) {
  return fragment.text ?? earned[fragment.id] ?? null
}

export function countFound(state) {
  return FRAGMENTS.filter(f => state.found.includes(f.id)).length
}

// text is the server's answer for a secret fragment; it is kept so status lines and hunt(text) work offline.
export function markFound(state, id, text = null) {
  if (!fragmentById(id) || state.found.includes(id)) return { state, isNew: false }
  const texts = text ? { ...state.texts, [id]: text } : state.texts
  return { state: { ...state, found: [...state.found, id], texts }, isNew: true }
}

export function progressLabel(state) {
  return `[${countFound(state)}/${FRAGMENTS.length}]`
}

export function toastText(fragment, count) {
  return `FRAGMENT ${count}/${FRAGMENTS.length} ACQUIRED :: "${fragment.text}"`
}

export function statusLines(state) {
  return FRAGMENTS.map((f, i) => `  ${i + 1}. ${(state.found.includes(f.id) && fragmentText(f, state.texts)) || '????'}`)
}

export function nextHint(state) {
  const missing = FRAGMENTS.find(f => !state.found.includes(f.id))
  return missing ? missing.hint : null
}

export function bannerText() {
  const lines = [
    'SYSTEM NOTICE',
    '',
    '5 fragments are hidden in this system.',
    'this site has a console of its own.',
    'press ctrl+` on any page to open it,',
    'then type: hunt',
  ]
  const width = Math.max(...lines.map(line => line.length)) + 4
  const border = `+${'-'.repeat(width)}+`
  return [border, ...lines.map(line => `|  ${line.padEnd(width - 2)}|`), border].join('\n')
}

// A rolling window of the last N keys. Simpler than a matcher that tracks partial progress,
// and correct for sequences like up-up-up-down that trip naive matchers.
export function pushKey(buffer, key, sequence = KONAMI) {
  const normalized = typeof key === 'string' ? key.toLowerCase() : ''
  if (MODIFIER_KEYS.has(normalized)) return { buffer, complete: false }
  const next = [...buffer, normalized].slice(-sequence.length)
  const complete = next.length === sequence.length && next.every((k, i) => k === sequence[i])
  return { buffer: complete ? [] : next, complete }
}

export function registerClick(times, now, needed = 3, windowMs = 1500) {
  const recent = [...times, now].filter(t => now - t <= windowMs)
  if (recent.length >= needed) return { times: [], triggered: true }
  return { times: recent, triggered: false }
}

export function shouldIgnoreKeyTarget(target) {
  if (!target) return false
  if (target.isContentEditable) return true
  const tag = typeof target.tagName === 'string' ? target.tagName.toUpperCase() : ''
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

// True only when the primary pointer is coarse and no fine pointer exists at all,
// so touchscreen laptops still count as desktops.
export function isTouchOnly(matchMedia) {
  if (typeof matchMedia !== 'function') return false
  return matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches
}

// The server decides whether the passphrase is right; this only words the answer.
export function unlockAttempt(ok, failures) {
  if (ok) {
    return { ok: true, failures, lines: ['ACCESS GRANTED', 'welcome, visitor. type `help` to look around.'] }
  }
  const next = failures + 1
  const lines = [`ACCESS DENIED [${next}]`]
  if (next % 3 === 0) lines.push('hint: 5 fragments are hidden across the site. the console is a good place to start.')
  return { ok: false, failures: next, lines }
}
