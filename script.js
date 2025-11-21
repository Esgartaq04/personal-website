const ENV = {
  EMAILJS_PUBLIC_KEY: "YOUR_PUBLIC_KEY",
  EMAILJS_SERVICE_ID: "YOUR_SERVICE_ID",
  EMAILJS_TEMPLATE_ID: "YOUR_TEMPLATE_ID",
};

document.addEventListener("DOMContentLoaded", () => {
  // 1. Initialize EmailJS
  emailjs.init(ENV.EMAILJS_PUBLIC_KEY);

  // 2. Typewriter for Home
  function startTypewriter() {
    const text = "Penetrating firewalls... access gained.";
    const target = document.getElementById("typewriter");
    if (!target) return;
    target.innerHTML = "";
    let i = 0;
    function type() {
      if (i < text.length) {
        target.innerHTML += text.charAt(i);
        i++;
        setTimeout(type, Math.random() * 50 + 50);
      }
    }
    type();
  }
  startTypewriter();

  // 3. HACKER TRANSITION LOGIC
  const navLinks = document.querySelectorAll(".nav-link");
  const overlay = document.getElementById("hack-overlay");
  const matrixText = document.getElementById("matrix-text");
  const accessMsg = document.getElementById("access-msg");
  let currentPage = "home";

  // Random chars for matrix effect
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*()_+-=[]{}|;':,./<>?";

  navLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      const targetId = link.getAttribute("data-target");
      if (targetId === currentPage) return;

      // Update Nav UI
      navLinks.forEach((l) => l.classList.remove("active"));
      link.classList.add("active");

      // Execute Hack Transition
      runHackTransition(currentPage, targetId);
      currentPage = targetId;
    });
  });

  function runHackTransition(fromId, toId) {
    const fromPage = document.getElementById(fromId);
    const toPage = document.getElementById(toId);

    // GSAP Timeline
    const tl = gsap.timeline();

    // 1. Activate Overlay
    tl.set(overlay, { display: "flex", pointerEvents: "all" }).to(overlay, {
      opacity: 1,
      duration: 0.1,
    });

    // 2. Run Matrix Text Loop
    let interval;
    tl.call(() => {
      let counter = 0;
      interval = setInterval(() => {
        // Generate 10 lines of random junk code
        let output = "";
        for (let i = 0; i < 15; i++) {
          let line = "";
          for (let j = 0; j < 40; j++) {
            line += chars.charAt(Math.floor(Math.random() * chars.length));
          }
          output += `> ${line} <br>`;
        }
        matrixText.innerHTML = output;
        counter++;
      }, 50);
    });

    // 3. Wait 1 second (simulating brute force)
    tl.to({}, { duration: 0.8 });

    // 4. Stop Matrix, Show "Access Granted"
    tl.call(() => {
      clearInterval(interval);
      matrixText.innerHTML = "";
      accessMsg.style.display = "block";
    });

    // 5. Flash Access Granted
    tl.fromTo(
      accessMsg,
      { opacity: 0 },
      { opacity: 1, duration: 0.2, yoyo: true, repeat: 3 }
    );

    // 6. Switch Page Content (Behind the scenes)
    tl.call(() => {
      fromPage.classList.remove("active");
      toPage.classList.add("active");

      // If going home, restart typewriter
      if (toId === "home") startTypewriter();
    });

    // 7. Fade out overlay
    tl.to(overlay, {
      opacity: 0,
      duration: 0.5,
      onComplete: () => {
        overlay.style.display = "none";
        accessMsg.style.display = "none";
        overlay.style.pointerEvents = "none";
      },
    });
  }

  // 4. Contact Form Logic
  const contactForm = document.getElementById("contact-form");
  if (contactForm) {
    contactForm.addEventListener("submit", function (event) {
      event.preventDefault();
      const btn = document.getElementById("submit-btn");
      const originalText = btn.innerText;
      btn.innerText = "UPLOADING_PACKET...";

      emailjs
        .sendForm(ENV.EMAILJS_SERVICE_ID, ENV.EMAILJS_TEMPLATE_ID, this)
        .then(
          () => {
            document.getElementById("status-msg").innerText =
              "> UPLOAD COMPLETE.";
            btn.innerText = originalText;
            contactForm.reset();
          },
          (err) => {
            document.getElementById("status-msg").innerText =
              "> ERROR: FIREWALL BLOCK.";
            console.error(err);
            btn.innerText = "RETRY";
          }
        );
    });
  }
});
