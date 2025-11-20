// --- Configuration ---
const ENV = {
    EMAILJS_PUBLIC_KEY: "YOUR_PUBLIC_KEY",
    EMAILJS_SERVICE_ID: "YOUR_SERVICE_ID",
    EMAILJS_TEMPLATE_ID: "YOUR_TEMPLATE_ID"
};

document.addEventListener("DOMContentLoaded", () => {
    
    // 1. Init Global Libs
    emailjs.init(ENV.EMAILJS_PUBLIC_KEY);

    // 2. Initial Page Load Setup
    initPageScripts(); 
    updateActiveNav();

    // 3. INTERCEPT CLICKS FOR SPA NAVIGATION
    document.body.addEventListener('click', (e) => {
        const link = e.target.closest('a.nav-link');
        if (link) {
            e.preventDefault();
            const href = link.getAttribute('href');
            const currentPath = window.location.pathname.split('/').pop() || 'index.html';
            
            // Don't reload if clicking same page
            if(href === currentPath) return;

            handleNavigation(href);
        }
    });

    // Handle Browser Back Button
    window.addEventListener('popstate', () => {
        // For simplicity in this demo, we just reload to ensure state is clean
        // In a full framework, we would fetch the previous state
        window.location.reload(); 
    });
});

// --- NAVIGATION CORE ---
function handleNavigation(url) {
    const overlay = document.getElementById('hack-overlay');
    const matrixText = document.getElementById('matrix-text');
    const accessMsg = document.getElementById('access-msg');
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*()_+-=[]{}|;':,./<>?";
    
    // GSAP Timeline for Transition
    const tl = gsap.timeline();

    // A. Start Overlay
    tl.set(overlay, { display: 'flex', pointerEvents: 'all' })
      .to(overlay, { opacity: 1, duration: 0.1 });

    // B. Matrix Effect Loop
    let interval;
    tl.call(() => {
        interval = setInterval(() => {
            let output = "";
            for(let i=0; i<15; i++) {
                let line = "";
                for(let j=0; j<40; j++) line += chars.charAt(Math.floor(Math.random() * chars.length));
                output += `> ${line} <br>`;
            }
            matrixText.innerHTML = output;
        }, 50);
    });

    // C. Fetch New Content WHILE animating
    fetch(url)
        .then(response => response.text())
        .then(html => {
            // Create a fake DOM to parse the new HTML
            const parser = new DOMParser();
            const newDoc = parser.parseFromString(html, 'text/html');
            const newContent = newDoc.querySelector('main').innerHTML;
            const newTitle = newDoc.title;

            // Wait a bit for the "Brute force" effect to feel real (800ms)
            setTimeout(() => {
                // Stop Matrix
                clearInterval(interval);
                matrixText.innerHTML = "";
                accessMsg.style.display = "block";

                // Flash Success
                gsap.fromTo(accessMsg, { opacity: 0 }, { 
                    opacity: 1, 
                    duration: 0.2, 
                    yoyo: true, 
                    repeat: 3,
                    onComplete: () => {
                        // D. SWAP CONTENT
                        document.querySelector('main').innerHTML = newContent;
                        document.title = newTitle;
                        
                        // Update Browser URL
                        window.history.pushState({}, "", url);
                        
                        // Update Nav Active State
                        updateActiveNav();

                        // Re-initialize page specific scripts (Forms, Typewriters)
                        initPageScripts();

                        // E. Fade Out
                        gsap.to(overlay, { 
                            opacity: 0, 
                            duration: 0.5, 
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
        .catch(err => {
            console.error("Load failed", err);
            clearInterval(interval);
            matrixText.innerText = "CONNECTION FAILED.";
            // Optional: Reload page or show error
        });
}

// --- HELPER FUNCTIONS ---

function updateActiveNav() {
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('nav a').forEach(link => {
        const linkHref = link.getAttribute('href');
        if(linkHref === currentPath) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

function initPageScripts() {
    // 1. Typewriter (Only on Home)
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

    // 2. Contact Form (Only on Contact)
    const contactForm = document.getElementById('contact-form');
    if(contactForm) {
        contactForm.addEventListener('submit', function(event) {
            event.preventDefault();
            const btn = document.getElementById('submit-btn');
            const originalText = btn.innerText;
            btn.innerText = "UPLOADING_PACKET...";
            
            emailjs.sendForm(ENV.EMAILJS_SERVICE_ID, ENV.EMAILJS_TEMPLATE_ID, this)
                .then(() => {
                    document.getElementById('status-msg').innerText = "> UPLOAD COMPLETE.";
                    btn.innerText = originalText;
                    contactForm.reset();
                }, (err) => {
                    document.getElementById('status-msg').innerText = "> ERROR: FIREWALL BLOCK.";
                    console.error(err);
                    btn.innerText = "RETRY";
                });
        });
    }
}