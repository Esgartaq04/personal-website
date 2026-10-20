// The transition runner: GSAP setup, and run / finishNow / play / emit around whichever transition is
// running. Touches the DOM (<html data-transition>, the egt:transition event, visibilitychange). Every
// choreography (nav.js, nav/decrypt.js, nav/crt.js) plays through it, so a fast-forward reaches all of them.

import { transitionFor } from './rules.js'

const { gsap, ScrambleTextPlugin, CustomEase } = window
// The transitions use all three, so without any one of them every page change is instant.
export const animate = Boolean(gsap && ScrambleTextPlugin && CustomEase)

if (animate) {
  gsap.registerPlugin(ScrambleTextPlugin, CustomEase)
  // The CRT power cycle's curves.
  CustomEase.create('crtCollapse', '0.7,0,0.9,0.5')
  CustomEase.create('crtOpen', '0.2,0.8,0.3,1')
}

// The running transition: { fast, finishers, done }, or null. Importers read it as a live binding.
export let current = null

// The transition a trigger ('nav', 'history' or 'root') gets right now: 'instant' under reduced motion,
// in a hidden tab, or without GSAP.
export function kindFor(trigger) {
  return transitionFor(trigger, {
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    hidden: document.hidden,
    animate,
  })
}

// Runs one transition: marks <html data-transition>, announces start and end, and clears both even if
// the work throws. Hiding the tab mid-way fast-forwards it, so the swap never waits on a hidden tab.
export function run(kind, work) {
  const transition = { fast: false, finishers: new Set() }
  const html = document.documentElement
  const onVisibility = () => {
    if (document.hidden) finishNow()
  }
  current = transition
  html.dataset.transition = kind
  document.addEventListener('visibilitychange', onVisibility)
  const done = (async () => {
    await null // the work starts after the start event below, which already sees transition.done
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
  emit(kind, 'start') // a listener that calls finishNow() here gets a real promise, and a fast transition
  return done
}

// The running transition and all its remaining phases run at zero duration. It still awaits the fetch
// and still swaps. Resolves when it has ended, and never rejects.
export function finishNow() {
  if (!current) return Promise.resolve()
  current.fast = true
  current.finishers.forEach(finish => finish())
  return current.done
}

// Resolves when the timeline completes, or after maxMs if it never ticks (a hidden tab), and always
// leaves it at its end state. Under finishNow it ends at once.
export function play(timeline, maxMs) {
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

export function emit(kind, phase, extra) {
  document.dispatchEvent(new CustomEvent('egt:transition', { detail: { kind, phase, ...extra } }))
}
