# personal-website

Terminal-themed personal portfolio for Esteban Garcia Taquez. Live at [egt.agency](https://egt.agency).

Vanilla HTML, CSS, and JavaScript — no build step, no framework, no package manager. Open a file, edit it, reload.

## Stack

| Piece | Used for |
|---|---|
| [GSAP](https://gsap.com/) (CDN) | Page-transition animations |
| [EmailJS](https://www.emailjs.com/) (CDN) | Contact form delivery, client-side |
| Google Fonts — Fira Code | Monospace type |
| Vercel | Hosting and Speed Insights |

## Layout

```
index.html        /home       — landing, typewriter hero
about.html        /about      — bio and capabilities
experience.html   /experience — employment, leadership, education
projects.html     /projects   — project cards
contact.html      /contact    — resume download, contact form, socials
script.js                     — navigation, typewriter, form handling
style.css                     — all styling; CSS variables at :root
config.ex.js                  — EmailJS config template
config.js                     — EmailJS config, actually loaded
assets/                       — favicon, resume PDF, success GIF
eggs.js                       — easter egg hunt, loaded on every page
hunt/                         — hunt rules and progress state
root.html         /root       — hidden shell; not in the nav
shell.js                      — renders the shell for root.html
shell/                        — filesystem, commands, Snake
robots.txt, sys_dump.txt      — part of the hunt
vercel.json                   — rewrites /root to root.html
tests.html, tests/            — unit tests and the manual checklist
```

## Running locally

Any static file server works. The contact form and the resume download both need real HTTP, so opening `index.html` via `file://` will not fully work.

```bash
python -m http.server 8765
```

Then visit <http://localhost:8765>.

### Tests

```bash
node tests/run.mjs
```

Runs every unit test and exits non-zero on any failure. No install step: it needs only Node 22. The same tests run in a browser at <http://localhost:8765/tests.html>. The DOM layer has no automated tests; [tests/MANUAL.md](tests/MANUAL.md) is its checklist.

## EmailJS configuration

`script.js` expects a global `ENV` object, loaded from `config.js` before `script.js` runs. To set up a fresh clone:

```bash
cp config.ex.js config.js
```

Then fill in your public key, service ID, and template ID from the EmailJS dashboard.

These three values are client-side by nature — they ship to every visitor's browser and are readable from the deployed site, so they are not secrets. They are still worth protecting from quota abuse by restricting your EmailJS account to an allowed domain list.

> Note: `config.js` is currently tracked in git despite `config.ex.js` existing as its template. If you would rather keep it out of the repo, add it to `.gitignore` and untrack it.

## How navigation works

Nav clicks do **not** cause a full page load. `script.js` intercepts any `a.nav-link` click, plays the "hacking" overlay, `fetch`es the target page, and swaps in only its `<main>` innerHTML, then updates `document.title` and pushes history state.

Two rules follow from this, and breaking either fails quietly rather than loudly:

1. **Every page's nav markup must be identical.** The nav is never re-rendered from the fetched page — whichever page loaded first supplies it for the whole session. A page that adds a nav item without the others adding it too will show a stale nav after any transition.
2. **All page content must live inside `<main>`.** Anything outside it is dropped during a transition and only appears on a hard load.

Adding a page therefore means: create the file with content inside `<main>`, and add the nav entry to *all* other pages.

### Other gotchas

- `body` has `overflow: hidden`; `main` scrolls internally. Long pages scroll within the content pane, not the window.
- The animated swap runs inside a GSAP `onComplete`, so it depends on `requestAnimationFrame`. In environments that do not composite frames (headless capture, a hidden tab), the transition never completes and content will not swap. This is not a bug in normal browser use.
- `script.js` re-runs `initPageScripts()` after every swap and clones the contact form to drop stale listeners.

## Easter eggs

The site hides a scavenger hunt that ends in a playable shell at `/root`. The full design, including every answer, is in [docs/superpowers/specs/2026-08-27-easter-eggs-design.md](docs/superpowers/specs/2026-08-27-easter-eggs-design.md) — skip it if you would rather play.

The hunt follows the navigation rules above without touching `script.js`: every listener in `eggs.js` binds once to `document`, which survives the `<main>` swap, so nothing is ever orphaned or bound twice.

## Deployment

Pushes deploy through Vercel. Each page includes the Speed Insights script, which 404s locally — that is expected and harmless.

`vercel.json` holds a single rewrite so `/root` resolves. The rest of the site deliberately does not use clean URLs: `updateActiveNav()` in `script.js` compares the pathname against names like `about.html`.

## Open items

- [ ] **Project links.** The four newest cards in `projects.html` (Algorithmic Trading Bot, Interview Prep Bot, WikiVerify, Content Creator Analytics Platform) render `[ link pending ]` instead of a repo link. Each has an HTML comment marking exactly where the anchor goes.
- [ ] **Resume PDF.** `assets/Resume-current.pdf` was compiled before a LaTeX fix to the trading-bot bullet. The site's HTML uses the corrected figures; the downloadable PDF should be re-exported to match.
- [ ] **Home page role line.** `index.html` reads `Role: Software Engineer // AI & Financial Systems`. This wording was drafted, not taken from the resume — confirm or replace it.
- [ ] **`assets/Resume-previous.pdf`.** An untracked local backup of the superseded resume. Decide whether to keep it locally, commit it, or delete it.
- [ ] **Social links.** `contact.html` has a commented-out Twitter link and a `add better link later on` note.
- [ ] **Console noise.** `script.js` logs six debug lines on every page load, including the EmailJS public key, which buries the hunt's console banner. Removing them is a separate change to `script.js`.
