// DOM helpers the page transitions share: building an element, the left-to-right wipe, and putting a
// style attribute back exactly. Touches the DOM, unlike nav/rules.js, so it has no unit tests.

export const CLIPPED = 'inset(0% 100% 0% 0%)' // four values each, so GSAP can interpolate between them
// A left-to-right stepped wipe. lazy: false clips at once: GSAP would otherwise wait for its next frame,
// and freshly swapped content would paint unclipped for one frame.
export const WIPE = { clipPath: 'inset(0% 0% 0% 0%)', ease: 'steps(10)', lazy: false }

export function element(tag, className, text = '') {
  const node = document.createElement(tag)
  node.className = className
  node.textContent = text
  return node
}

// Each element's style attribute as the page had it. Clearing the clip through the CSSOM would leave
// the attribute reformatted, so unclip() puts the original string back instead.
export function keepStyles(elements) {
  return elements.map(el => ({ el, style: el.getAttribute('style') }))
}

export function unclip(kept) {
  kept.forEach(({ el, style }) => {
    // Set first even when removing: a bare removeAttribute after GSAP's writes is undone by Chrome's
    // lazily synced inline style, which puts back an empty style="".
    el.setAttribute('style', style ?? '')
    if (style === null) el.removeAttribute('style')
  })
}
