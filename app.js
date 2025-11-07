document.addEventListener('DOMContentLoaded', () => {

    // --- GSAP PLUGIN REGISTRATION ---
    gsap.registerPlugin(ScrollTrigger);
    
    const mainHeader = document.getElementById('main-header');

    // --- PAGE LOAD ANIMATION (Day 7) ---
    // This runs ONCE when the site is first loaded.
    function pageLoadAnimation() {
        const tl = gsap.timeline();
        
        // 1. Animate header in
        tl.to(mainHeader, {
            opacity: 1,
            duration: 0.8,
            delay: 0.2,
            ease: 'power2.out'
        });
        
        // 2. Animate hero elements in (staggered)
        // This only runs if hero elements exist on the current page
        if (document.querySelectorAll('.hero-element').length > 0) {
            tl.from('.hero-element', {
                opacity: 0,
                y: 30,
                duration: 0.6,
                stagger: 0.15,
                ease: 'power2.out'
            }, '-=0.5');
        }
    }

    
    // --- SCROLLTRIGGER ANIMATIONS (Day 9) ---
    // This function needs to run every time a new page loads
    function setupScrollTriggers() {
        // Kill old ScrollTriggers first to prevent memory leaks
        ScrollTrigger.getAll().forEach(trigger => trigger.kill());

        // Select all elements you want to reveal
        const revealElements = document.querySelectorAll('.reveal-on-scroll');
        
        revealElements.forEach(el => {
            gsap.from(el, {
                opacity: 0,
                y: 50,
                duration: 0.8,
                ease: 'power2.out',
                scrollTrigger: {
                    trigger: el,
                    start: 'top 85%',
                    toggleActions: 'play none none none'
                }
            });
        });
    }

    
    // --- BARBA.JS PAGE TRANSITIONS (Day 11-12) ---
    function setupBarba() {
        barba.init({
            // debug: true, // Uncomment this to see Barba.js logs in the console
            transitions: [{
                name: 'default-transition',
                
                // --- 'LEAVE' HOOK ---
                // This runs when you click a link to leave a page
                leave(data) {
                    // 'data.current.container' is the <section> we are leaving
                    return gsap.to(data.current.container, {
                        opacity: 0,
                        y: 50, // Move down
                        duration: 0.4,
                        ease: 'power2.in'
                    });
                },
                
                // --- 'ENTER' HOOK ---
                // This runs when the new page content is ready
                enter(data) {
                    // 'data.next.container' is the <section> we are entering
                    // We set its initial state (invisible and moved up)
                    return gsap.from(data.next.container, {
                        opacity: 0,
                        y: -50, // Move in from top
                        duration: 0.4,
                        ease: 'power2.out',
                        onComplete: () => {
                            window.scrollTo(0, 0); // Scroll to top of new page
                        }
                    });
                }
            }],
            
            // --- 'HOOKS' ---
            // These run at different points in the lifecycle
            hooks: {
                // This runs ONCE after the initial page load
                afterOnce(data) {
                    pageLoadAnimation();
                    setupScrollTriggers();
                },
                // This runs AFTER every page transition
                afterEnter(data) {
                    setupScrollTriggers(); // Re-run ScrollTriggers for the new page
                }
            }
        });
    }

    // --- RUN EVERYTHING ---
    setupBarba();
    
});