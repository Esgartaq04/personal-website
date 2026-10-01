// /root's lock screen. This file is public; the shell it opens is not. The passphrase is checked by
// /api/unlock, which answers with a signed HttpOnly cookie, and middleware.js only serves shell.js and
// shell/ to requests carrying that cookie. Nothing in localStorage can open the shell.

import { fetchRooted, setRooted } from './fx.js'
import { isTouchOnly, unlockAttempt } from './hunt/trail.js'
import { input, inputLine, print, setPrompt, term } from './term.js'

const PROMPT = 'passphrase: '

// 'booting' | 'locked' | 'verifying' | 'open'
let mode = 'booting'
let failures = 0

if (isTouchOnly(window.matchMedia ? query => window.matchMedia(query) : undefined)) {
  inputLine.hidden = true
  print(['/root needs a keyboard. come back on a desktop.'])
} else {
  boot()
}

async function boot() {
  term.addEventListener('click', () => input.focus())
  input.addEventListener('keydown', onKey)
  input.focus()
  if (await fetchRooted()) {
    openShell(['session restored. type `help` to look around.', ''])
    return
  }
  print(['egt.agency secure terminal', 'authorization required.', ''])
  setPrompt(PROMPT)
  mode = 'locked'
}

function onKey(event) {
  if (event.key === 'Tab') {
    event.preventDefault()
    return
  }
  if (event.key !== 'Enter') return
  event.preventDefault()
  if (mode !== 'locked') return
  const value = input.value
  input.value = ''
  submit(value)
}

async function submit(value) {
  // Echo masked, and never through the shell, so a guess cannot land in history.
  print([PROMPT + '*'.repeat(value.length)])
  mode = 'verifying'
  setPrompt('')
  print(['verifying...'])

  let status = 0
  try {
    const response = await fetch('/api/unlock', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ passphrase: value }),
    })
    status = response.status
  } catch {
    // Network failure: status stays 0.
  }

  if (status === 200 || status === 401) {
    const result = unlockAttempt(status === 200, failures)
    failures = result.failures
    if (result.ok) {
      openShell([...result.lines, ''])
      return
    }
    print(result.lines, 'term-error')
  } else {
    print(['connection refused. try again.'], 'term-error')
  }
  setPrompt(PROMPT)
  mode = 'locked'
}

async function openShell(lines) {
  mode = 'open'
  setRooted(true) // The site settles into its "rooted" look; a no-op where eggs.js did not start fx.
  input.removeEventListener('keydown', onKey)
  try {
    const { start } = await import('./shell.js')
    start(lines)
  } catch {
    print(['shell failed to load. reload the page.'], 'term-error')
  }
}
