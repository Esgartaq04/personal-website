// The /root terminal's DOM. lock.js (public) and shell.js (served only after unlock) both draw through here.
// All output goes through textContent. The terminal echoes whatever the visitor types.

export const term = document.getElementById('term')
export const output = document.getElementById('term-out')
export const screen = document.getElementById('term-screen')
export const inputLine = document.getElementById('term-line')
export const promptEl = document.getElementById('term-prompt')
export const input = document.getElementById('term-in')

export function print(lines, className) {
  for (const line of lines) {
    const row = document.createElement('div')
    row.textContent = line === '' ? ' ' : line // A non-breaking space keeps blank lines from collapsing.
    if (className) row.className = className
    output.appendChild(row)
  }
  term.scrollTop = term.scrollHeight
}

export function setPrompt(text) {
  promptEl.textContent = text
}
