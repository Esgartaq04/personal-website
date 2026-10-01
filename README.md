# personal-website

Terminal-themed personal portfolio for Esteban Garcia Taquez. Live at [egt.agency](https://egt.agency).

Vanilla HTML, CSS, and JavaScript — no build step and no framework. Open a file, edit it, reload. The only server code is a few Vercel Functions and a Routing Middleware that keep the easter egg hunt honest.

## Stack

| Piece | Used for |
|---|---|
| [GSAP](https://gsap.com/) (CDN) | Page-transition animations |
| [EmailJS](https://www.emailjs.com/) (CDN) | Contact form delivery, client-side |
| Google Fonts — Fira Code | Monospace type |
| Vercel | Hosting, Speed Insights, Functions (`api/`), Routing Middleware |
| [`@vercel/functions`](https://www.npmjs.com/package/@vercel/functions) | `next()` for the middleware; the only npm dependency |

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
site-console.js               — the in-site console (ctrl+`) where the hunt is played
cli/engine.js                 — command engine shared by the site console and the /root shell
fx.js                         — "corruption" effects that grow with hunt progress
hunt/                         — hunt rules, progress state, corruption stages, rain model (public)
root.html         /root       — hidden shell; not in the nav
lock.js, term.js              — /root lock screen and terminal DOM (public)
shell.js, shell/              — the shell: filesystem, commands, Snake, matrix (served only after unlock)
api/                          — Vercel Functions: /api/fragment, /api/unlock, /api/session
lib/                          — server logic for those functions and the middleware
middleware.js                 — 404s shell.js and shell/ without a valid unlock cookie
robots.txt, sys_dump.txt      — part of the hunt
vercel.json                   — rewrites /root to root.html
.vercelignore                 — keeps docs/, tests/, scripts/, README.md off the live site
scripts/serve.mjs             — local server that mimics Vercel (static + api + middleware)
tests.html, tests/            — unit tests and the manual checklist
```

## Running locally

For the pages alone, any static file server works. The contact form and the resume download both need real HTTP, so opening `index.html` via `file://` will not fully work.

```bash
python -m http.server 8765
```

The easter egg hunt also needs `/api` and the middleware, plus `HUNT_FRAGMENTS` and `HUNT_SECRET` in a gitignored `.env.local`. The production values are stored in Vercel as **sensitive**, so they cannot be read back or pulled; use test values locally (below). Then either use the Vercel CLI:

```bash
npm i -g vercel
vercel link          # once, pick the personal-website project
vercel dev
```

or the bundled zero-dependency server, which runs the same handlers and gate and reads `.env.local`:

```bash
npm install          # @vercel/functions, which middleware.js imports
npm run serve        # http://localhost:8765
```

Test values for `.env.local`:

```
HUNT_FRAGMENTS={"console":"aa","cursor":"bb_","konami":"cc_"}
HUNT_SECRET=any-local-string-of-at-least-32-characters
```

The passphrase is then the five fragments in trail order: `aa` + `bb_` + the `about.html` comment fragment + `cc_` + the `sys_dump.txt` fragment.

### Tests

```bash
node tests/run.mjs     # or: npm test
```

Runs every unit test and exits non-zero on any failure. No install step: it needs only Node 22. The same tests, minus the Node-only server tests in `tests/server.js`, run in a browser at <http://localhost:8765/tests.html> (local only; `tests.html` is not deployed). The DOM layer has no automated tests; [tests/MANUAL.md](tests/MANUAL.md) is its checklist.

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

The site hides a scavenger hunt that ends in a playable shell at `/root`. The design is in [docs/superpowers/specs/2026-08-27-easter-eggs-design.md](docs/superpowers/specs/2026-08-27-easter-eggs-design.md). It does not contain the live answers.

The hunt follows the navigation rules above without touching `script.js`: every listener in `eggs.js` binds once to `document`, which survives the `<main>` swap, so nothing is ever orphaned or bound twice.

### The site console

Devtools is where the clues are (the console banner, page source, `robots.txt`); the playing happens in a console built into the site. **`` Ctrl+` ``** (the VS Code terminal shortcut) toggles a drop-down terminal on any page except `/root`. Nothing on the page advertises it; the devtools banner does.

| Command | Does |
|---|---|
| `hunt` | Claims the first fragment, then shows progress and the next lead |
| `hunt <text>` | Logs a fragment found in the source, e.g. the about-page comment |
| `hint` | Shows only the next lead |
| `su root` | Asks for the passphrase (masked, never in history); on success, opens `/root` |
| `whoami`, `clear`, `exit`, `help` | As you'd expect. Esc or `` Ctrl+` `` also closes |

The cursor triple-click and the Konami code still award their fragments on their own. `hunt()` in devtools is now a stub that only says to use the site console.

- **Commands:** `hunt/console.js` (pure; the store, claim and unlock are injected, so it is unit-tested without a DOM).
- **UI:** `site-console.js`. It is built on first open, so visitors who never press the chord get no extra DOM, and it lives outside `<main>`, so it stays open with its history across page transitions.
- **Engine:** `cli/engine.js` holds the tokenizer, registry, `execute` (sync or async, plus `!!`), history and completion. It was split out of `shell/core.js`, which is gated, and the shell re-exports it.
- **Key match:** the chord matches the physical key (`event.code === 'Backquote'`), so it works on non-US layouts; a plain backtick just types.

### How the hunt is protected

Everything sent to a browser can be read, so the answer is not sent:

| Piece | Where it lives |
|---|---|
| Three secret fragments | `HUNT_FRAGMENTS` env var. The browser gets each from `POST /api/fragment` when its trigger fires |
| Two public fragments | `about.html` comment and `sys_dump.txt` (finding them in source is the puzzle) |
| Passphrase check | `POST /api/unlock`, timing-safe compare, 500 ms delay on failure |
| The passphrase | Typed in the site console (`su root`) or on `/root`'s lock screen; both call `/api/unlock` |
| "Unlocked" | Signed `egt_root` cookie (HMAC with `HUNT_SECRET`), HttpOnly, Secure, SameSite=Strict, 30 days |
| The shell's code | `middleware.js` returns 404 for `/shell.js` and `/shell/*` without a valid cookie |

`localStorage` (`egt.eggs`) only holds progress for the badge and the console's `hunt` report. Editing it cannot open the shell.

The limit, by design: the cursor, Konami, and console triggers run in the browser, so someone who reads `eggs.js` can call `/api/fragment` directly. That takes deliberate reverse-engineering, unlike reading a string out of the source.

**Changing the answers:** edit `HUNT_FRAGMENTS` in Vercel (Production and Preview) and redeploy. Both variables are type *sensitive*: Vercel will not show the current value, so keep your own copy of the answers somewhere private. To rotate the public fragments, change the text in `about.html`, `sys_dump.txt`, and `hunt/trail.js` together. Rotating `HUNT_SECRET` logs everyone out of `/root`. Never commit the secret values: this repo is public.

### Corruption

The site degrades as a visitor progresses. `hunt/corruption.js` holds the stage table; `fx.js` applies it.

| Stage | When | What changes |
|---|---|---|
| 0 | no fragments | Nothing. No classes, no canvas, no timers, no extra requests |
| 1 | 1 fragment | Faint background code rain; the brand line flickers now and then |
| 2 | 2 | Page transitions glitch: RGB split, tearing, `ACCESS GRANTED` lands corrupted |
| 3 | 3 | Denser rain, heavier scanlines, brief bursts every 20–45 s (panel split, headings decode) |
| 4 | 4 | Nav labels and the home typewriter glitch; hunt toasts add `[!] integrity check failed` |
| 5 | all 5 | Red rain columns, a kernel-panic line in transitions, a `> /root awaits_` link |
| root | `/root` unlocked | Calmer: slow steady rain, `(root@egt)-[~]#` brand, `ROOT ACCESS` transitions |

Rules that keep it safe to ship on a portfolio:

- Everything hangs off `<html>` classes (`fx-1` … `fx-5`, `fx-root`) and elements outside `<main>`, so `script.js` is untouched and the SPA swap never orphans anything. Text glitches always restore the exact original.
- Content stays readable: the rain is behind `.terminal-container`, and bursts last under half a second.
- `prefers-reduced-motion` gets a still rain frame and no bursts or tearing.
- `fsck` in the `/root` shell turns it all off (`fx: 'off'` in `egt.eggs`); `corrupt` turns it back on.
- Only players (one fragment or more) call `/api/session` to check for the rooted stage, once per page load.
- The rain model lives in `hunt/rain.js` rather than `shell/`, because `shell/` is only served after unlock and every page needs the rain.

To tune intensity, edit `STAGES` in `hunt/corruption.js`. `tests/corruption.test.js` checks that intensity never drops between stages and stays within readable limits. To try a glitch in the browser console on a page at stage 1+: `import('/fx.js').then(fx => fx.runBurst('decode'))` (also `flicker`, `split`, `nav`, `typo`).

### Environment variables

| Name | Value |
|---|---|
| `HUNT_FRAGMENTS` | JSON: `{"console":"...","cursor":"...","konami":"..."}` |
| `HUNT_SECRET` | Random string, 32+ characters (`openssl rand -base64 48`) |

If either is missing, `/api/*` answers 503, the lock screen says `connection refused`, and the shell stays locked.

## Deployment

Pushes deploy through Vercel. Each page includes the Speed Insights script, which 404s locally — that is expected and harmless.

The project's framework preset is **Other** with no build command, so Vercel serves the repository root as static files, deploys `api/*.js` as Node functions, and runs `middleware.js` on the paths in its `matcher`. `package.json` deliberately has no `build` script; adding one would change that.

`vercel.json` holds a single rewrite so `/root` resolves. The rest of the site deliberately does not use clean URLs: `updateActiveNav()` in `script.js` compares the pathname against names like `about.html`.

## Open items

- [ ] **Project links.** Every card in `projects.html` except Unbounded renders `[ link pending ]` instead of a repo or live link. Each has an HTML comment marking exactly where the anchor goes.
- [ ] **Resume PDF.** The site's HTML now follows the master resume (Oct. 2026). `assets/Resume-current.pdf` is an older one-page cut and should be re-exported to match.
- [ ] **Home page role line.** `index.html` reads `Role: Software Engineer // AI & Financial Systems`. This wording was drafted, not taken from the resume — confirm or replace it.
- [ ] **`assets/Resume-previous.pdf`.** An untracked local backup of the superseded resume. Decide whether to keep it locally, commit it, or delete it.
- [ ] **Social links.** `contact.html` has a commented-out Twitter link and a `add better link later on` note.
- [ ] **Console noise.** `script.js` logs six debug lines on every page load, including the EmailJS public key, which buries the hunt's console banner. Removing them is a separate change to `script.js`.
