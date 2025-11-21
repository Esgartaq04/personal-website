// --- Logic Script (Debug Version) ---

document.addEventListener("DOMContentLoaded", () => {
    console.log("1. DOM Loaded");

    // Check ENV
    if (typeof ENV === 'undefined') {
        console.error("CRITICAL: ENV is missing! config.js did not load.");
    } else {
        console.log("2. ENV found. Public Key:", ENV.EMAILJS_PUBLIC_KEY);
        if (typeof emailjs !== 'undefined') {
            emailjs.init(ENV.EMAILJS_PUBLIC_KEY);
        }
    }

    // Initialize Scripts
    initPageScripts(); 
    updateActiveNav();

    // Intercept Clicks
    document.body.addEventListener('click', (e) => {
        const link = e.target.closest('a.nav-link');
        if (link) {
            e.preventDefault();
            const href = link.getAttribute('href');
            const currentPath = window.location.pathname.split('/').pop() || 'index.html';
            if(href === currentPath) return;
            handleNavigation(href);
        }
    });

    // Browser Back Button
    window.addEventListener('popstate', () => window.location.reload());
});

// --- CORE NAVIGATION ---
function handleNavigation(url) {
    console.log("Navigating to:", url);
    const overlay = document.getElementById('hack-overlay');
    const matrixText = document.getElementById('matrix-text');
    const accessMsg = document.getElementById('access-msg');
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*()_+-=[]{}|;':,./<>?";
    
    const tl = gsap.timeline();
    tl.set(overlay, { display: 'flex', pointerEvents: 'all' })
      .to(overlay, { opacity: 1, duration: 0.1 });

    let interval;
    tl.call(() => {
        interval = setInterval(() => {
            let output = "";
            for(let i=0; i<15; i++) {
                let line = "";
                for(let j=0; j<40; j++) line += chars.charAt(Math.floor(Math.random() * chars.length));
                output += `> ${line} <br>`;
            }
            if(matrixText) matrixText.innerHTML = output;
        }, 50);
    });

    fetch(url)
        .then(response => response.text())
        .then(html => {
            const parser = new DOMParser();
            const newDoc = parser.parseFromString(html, 'text/html');
            const newContent = newDoc.querySelector('main').innerHTML;
            const newTitle = newDoc.title;

            setTimeout(() => {
                clearInterval(interval);
                if(matrixText) matrixText.innerHTML = "";
                if(accessMsg) accessMsg.style.display = "block";

                gsap.fromTo(accessMsg, { opacity: 0 }, { 
                    opacity: 1, duration: 0.2, yoyo: true, repeat: 3,
                    onComplete: () => {
                        document.querySelector('main').innerHTML = newContent;
                        document.title = newTitle;
                        window.history.pushState({}, "", url);
                        updateActiveNav();
                        initPageScripts(); // Re-attach listeners to new form

                        gsap.to(overlay, { 
                            opacity: 0, duration: 0.5, 
                            onComplete: () => {
                                overlay.style.display = 'none';
                                accessMsg.style.display = 'none';
                                overlay.style.pointerEvents = 'none';
                            }
                        });
                    }
                });
            }, 800);
        })
        .catch(err => console.error("Navigation Error:", err));
}

function updateActiveNav() {
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('nav a').forEach(link => {
        const linkHref = link.getAttribute('href');
        link.classList.toggle('active', linkHref === currentPath);
    });
}

function initPageScripts() {
    console.log("3. Initializing Page Scripts...");

    // Typewriter
    const typewriterTarget = document.getElementById('typewriter');
    if (typewriterTarget) {
        const text = "Penetrating firewalls... access gained.";
        typewriterTarget.innerHTML = "";
        let i = 0;
        function type() {
            if (i < text.length) {
                typewriterTarget.innerHTML += text.charAt(i);
                i++;
                setTimeout(type, Math.random() * 50 + 50);
            }
        }
        type();
    }

    // Contact Form
    const contactForm = document.getElementById('contact-form');
    if(contactForm) {
        console.log("4. Contact Form Found! Attaching Listener.");
        
        // REMOVE any existing listeners (clone node trick) to prevent duplicates
        const newForm = contactForm.cloneNode(true);
        contactForm.parentNode.replaceChild(newForm, contactForm);

        newForm.addEventListener('submit', function(event) {
            console.log("5. Submit Button Clicked - Intercepted!");
            event.preventDefault(); // STOP RELOAD
            
            const btn = document.getElementById('submit-btn');
            const originalText = btn.innerText;
            btn.innerText = "TRANSMITTING...";
            
            // Check if ENV is valid before sending
            if (typeof ENV === 'undefined') {
                console.error("Cannot send: ENV is missing.");
                return;
            }

            emailjs.sendForm(ENV.EMAILJS_SERVICE_ID, ENV.EMAILJS_TEMPLATE_ID, this)
                .then(() => {
                    console.log("6. Email Sent Successfully");
                    showSuccessOverlay(); 
                    btn.innerText = originalText;
                    newForm.reset();
                    document.getElementById('status-msg').innerText = "> UPLOAD COMPLETE.";
                }, (err) => {
                    console.error("6. Email Failed:", err);
                    showSuccessOverlay(); // Show pepe anyway for debugging
                    document.getElementById('status-msg').innerText = "> ERROR: Check Console.";
                    btn.innerText = "RETRY";
                });
        });
    } else {
        console.log("INFO: No contact form on this page.");
    }
}

function showSuccessOverlay() {
    console.log("7. Triggering Pepe Animation");
    const successOverlay = document.getElementById('success-overlay');
    if(!successOverlay) {
        console.error("CRITICAL: #success-overlay not found in HTML!");
        return;
    }
    gsap.set(successOverlay, { display: 'flex', opacity: 0 });
    gsap.to(successOverlay, { opacity: 1, duration: 0.3 });
    setTimeout(() => {
        gsap.to(successOverlay, { 
            opacity: 0, duration: 0.5, 
            onComplete: () => { successOverlay.style.display = 'none'; } 
        });
    }, 3000);
}