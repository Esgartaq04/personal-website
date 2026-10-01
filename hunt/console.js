// Commands for the site console (opened with ctrl+` on any page; UI in site-console.js). This is where
// the hunt is played: devtools only shows the clues. Pure apart from injected deps, so tests need no
// DOM or network:
//   store            the progress store (hunt/state.js)
//   claim(id)        Promise<'new' | 'known' | 'failed'>; fetches secret fragment text from the server
//   unlock(phrase)   Promise<'ok' | 'denied' | 'error'>; POST /api/unlock
//   isRooted()       whether /root is unlocked, for the prompt and whoami

import { helpLines, register } from '../cli/engine.js'
import { fragmentByText, nextHint, progressLabel, statusLines, unlockAttempt } from './trail.js'

export const SIGNAL_LOST = '> signal lost. that fragment did not come through. try again.'

export function reportLines(state) {
  const hint = nextHint(state)
  return [
    `> ${progressLabel(state)} fragments recovered`,
    ...statusLines(state),
    hint ? `> next lead: ${hint}` : '> all fragments recovered. assemble them in order, then: su root',
  ]
}

export function registerConsole(ctx, deps) {
  ctx.suFailures = 0
  const add = (name, desc, usage, run) => register(ctx, name, { desc, usage, run })
  const joke = (name, line) => register(ctx, name, { desc: '', hidden: true, run: () => ({ out: [line] }) })

  add('help', 'list available commands', 'help', (args, c) => ({ out: helpLines(c) }))
  add('hunt', 'recover a fragment, or show progress', 'hunt [fragment]', args => hunt(args, deps))
  add('hint', 'show the next lead', 'hint', () => {
    const hint = nextHint(deps.store.get())
    return { out: [hint ? `> next lead: ${hint}` : '> nothing left to find. su root.'] }
  })
  add('su', 'switch user', 'su [root]', (args, c) => su(args, c, deps))
  add('whoami', 'print current user', 'whoami', () => ({ out: [deps.isRooted() ? 'root' : 'guest'] }))
  add('clear', 'clear the console', 'clear', () => ({ out: [], clear: true }))
  add('exit', 'close the console', 'exit', () => ({ out: [], exit: true }))

  joke('sudo', 'guest is not in the sudoers file. This incident will be reported.')
  joke('ls', 'ls: nothing to see up here. the real filesystem is somewhere deeper.')
  joke('cd', 'cd: permission denied. you are only a guest.')
}

async function hunt(args, deps) {
  const out = []
  // Running hunt at all proves the console was found, so every call claims fragment 1 first.
  if ((await deps.claim('console')) === 'failed') out.push(SIGNAL_LOST)
  if (args.length > 0) {
    const text = args.join(' ')
    const fragment = fragmentByText(text, deps.store.get().texts)
    if (!fragment) return { out: [...out, '> unknown fragment. keep digging.'] }
    const result = await deps.claim(fragment.id)
    if (result === 'failed') out.push(SIGNAL_LOST)
  }
  return { out: [...out, ...reportLines(deps.store.get())] }
}

function su(args, ctx, deps) {
  const user = args[0] ?? 'root'
  if (user !== 'root') return { out: [`su: user ${user} does not exist or the user entry does not contain all the required fields`] }
  if (deps.isRooted()) return { out: ['you are already root. the shell is at /root.'], navigate: 'root.html' }
  return {
    out: [],
    prompt: {
      label: 'Password: ',
      secret: true,
      async submit(passphrase) {
        const status = await deps.unlock(passphrase)
        if (status === 'ok') return { out: ['ACCESS GRANTED', 'switching to /root...'], navigate: 'root.html' }
        if (status === 'denied') {
          const result = unlockAttempt(false, ctx.suFailures)
          ctx.suFailures = result.failures
          return { out: ['su: Authentication failure', ...result.lines.slice(1)], error: true }
        }
        return { out: ['su: connection refused. try again.'], error: true }
      },
    },
  }
}
