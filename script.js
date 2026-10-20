// Page scripts: EmailJS, the home typewriter and the contact form. nav.js owns navigation and runs
// initPageScripts again after every <main> swap.

import { initNavigation, updateActiveNav } from './nav.js'

if (typeof ENV !== 'undefined' && typeof emailjs !== 'undefined') emailjs.init(ENV.EMAILJS_PUBLIC_KEY)

updateActiveNav()
initPageScripts()
initNavigation({ afterSwap: initPageScripts })

function initPageScripts() {
  // Typewriter
  const typewriterTarget = document.getElementById('typewriter')
  if (typewriterTarget) {
    const text = 'Penetrating firewalls... access gained.'
    typewriterTarget.innerHTML = ''
    let i = 0
    function type() {
      if (i < text.length) {
        typewriterTarget.innerHTML += text.charAt(i)
        i++
        setTimeout(type, Math.random() * 50 + 50)
      }
    }
    type()
  }

  // Contact Form
  const contactForm = document.getElementById('contact-form')
  if (contactForm) {
    // REMOVE any existing listeners (clone node trick) to prevent duplicates
    const newForm = contactForm.cloneNode(true)
    contactForm.parentNode.replaceChild(newForm, contactForm)

    // The button's resting label, read once. Reading it per submit would pick up "RETRY" after a failed
    // send and put that back as the "original" once a later send succeeds.
    const idleLabel = newForm.querySelector('#submit-btn').textContent.trim()

    newForm.addEventListener('submit', function (event) {
      event.preventDefault() // STOP RELOAD

      const btn = document.getElementById('submit-btn')
      const status = document.getElementById('status-msg')
      status.innerText = ''
      btn.innerText = 'TRANSMITTING...'

      // Without the config (or the EmailJS script) there is nothing to send with. Say so, and don't touch emailjs.
      if (typeof ENV === 'undefined' || typeof emailjs === 'undefined') {
        status.innerText = '> ERROR: mail relay offline.'
        btn.innerText = idleLabel
        return
      }

      emailjs.sendForm(ENV.EMAILJS_SERVICE_ID, ENV.EMAILJS_TEMPLATE_ID, this).then(
        () => {
          btn.innerText = idleLabel
          newForm.reset()
          status.innerText = '> UPLOAD COMPLETE.'
          // Last, so the form is already back to normal even if the overlay can't run (GSAP blocked).
          showSuccessOverlay()
        },
        () => {
          status.innerText = '> TRANSMISSION FAILED. Try again.'
          btn.innerText = 'RETRY'
        },
      )
    })
  }
}

function showSuccessOverlay() {
  const successOverlay = document.getElementById('success-overlay')
  if (!successOverlay) {
    return
  }
  gsap.set(successOverlay, { display: 'flex', opacity: 0 })
  gsap.to(successOverlay, { opacity: 1, duration: 0.3 })
  setTimeout(() => {
    gsap.to(successOverlay, {
      opacity: 0,
      duration: 0.5,
      onComplete: () => {
        successOverlay.style.display = 'none'
      },
    })
  }, 3000)
}
