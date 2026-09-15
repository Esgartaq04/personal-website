// The hunt's rules: fragments, passphrase, hints, and the pure trigger logic eggs.js wires to the page.

// Trail order is passphrase order and difficulty order. Hints name pages, never URLs:
// the live site serves /about.html, not /about.
export const FRAGMENTS = [
  { id: 'console', text: 'kern', hint: 'type hunt() in the console.' },
  { id: 'cursor', text: 'el_pa', hint: 'the cursor on the home page keeps blinking at you. knock three times.' },
  { id: 'comment', text: 'nic_', hint: 'some pages say more than they render. read the source of the about page.' },
  { id: 'konami', text: 'at_', hint: 'an old cheat code still works here. up, up...' },
  { id: 'robots', text: '0x00', hint: 'even robots are told where not to look. find out what they were told.' },
]

export const PASSPHRASE = FRAGMENTS.map(f => f.text).join('')

export const KONAMI = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a']

const MODIFIER_KEYS = new Set(['shift', 'control', 'alt', 'meta', 'capslock'])

export function isPassphrase(input) {
  return typeof input === 'string' && input.trim().toLowerCase() === PASSPHRASE
}

export function fragmentById(id) {
  return FRAGMENTS.find(f => f.id === id) || null
}

export function fragmentByText(text) {
  if (typeof text !== 'string') return null
  const wanted = text.trim().toLowerCase()
  return FRAGMENTS.find(f => f.text === wanted) || null
}

export function countFound(state) {
  return FRAGMENTS.filter(f => state.found.includes(f.id)).length
}

export function markFound(state, id) {
  if (!fragmentById(id) || state.found.includes(id)) return { state, isNew: false }
  return { state: { ...state, found: [...state.found, id] }, isNew: true }
}

export function progressLabel(state) {
  return `[${countFound(state)}/${FRAGMENTS.length}]`
}

export function toastText(fragment, count) {
  return `FRAGMENT ${count}/${FRAGMENTS.length} ACQUIRED :: "${fragment.text}"`
}

export function statusLines(state) {
  return FRAGMENTS.map((f, i) => `  ${i + 1}. ${state.found.includes(f.id) ? f.text : '????'}`)
}

export function nextHint(state) {
  const missing = FRAGMENTS.find(f => !state.found.includes(f.id))
  return missing ? missing.hint : null
}

export function bannerText() {
  const lines = ['SYSTEM NOTICE', '', '5 fragments are hidden in this system.', 'type hunt() to recover the first.']
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

export function unlockAttempt(input, failures) {
  if (isPassphrase(input)) {
    return { ok: true, failures, lines: ['ACCESS GRANTED', 'welcome, visitor. type `help` to look around.'] }
  }
  const next = failures + 1
  const lines = [`ACCESS DENIED [${next}]`]
  if (next % 3 === 0) lines.push('hint: 5 fragments are hidden across the site. the console is a good place to start.')
  return { ok: false, failures: next, lines }
}
