# Page Transitions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fake "hacking" overlay with three terminal/CRT transitions:
- **B · command** on nav clicks;
- **C · decrypt** on Back/Forward;
- **A · power cycle** on entering and leaving `/root`, plus a one-time boot.

Clean up `script.js` along the way.

**Architecture:**
- Pure rules (`nav/rules.js`, unit-tested) decide text, timing, and which transition runs.
- A DOM controller (`nav.js`, public, ES module) owns navigation and runs the choreographies as GSAP timelines.
- `fx.js` hooks the corruption stages onto an `egt:transition` event and an `html[data-transition]` attribute,
  replacing its old MutationObserver and the inline-style CSS selectors.

**Tech Stack:**
- Vanilla HTML/CSS/ES modules, no build step.
- GSAP 3.15.0 with ScrambleTextPlugin and CustomEase from cdnjs, as UMD globals.
- Node 22+ test harness (`npm test`).

**Spec:** `docs/superpowers/specs/2026-10-20-page-transitions-design.md`

## Global Constraints

- **No build step, no new npm dependency.** GSAP loads from cdnjs, pinned exactly:
  - `https://cdnjs.cloudflare.com/ajax/libs/gsap/3.15.0/gsap.min.js`
  - `.../3.15.0/ScrambleTextPlugin.min.js`
  - `.../3.15.0/CustomEase.min.js`
- **`<main>` and nav markup:**
  - Nav markup stays identical on every page.
  - Page content stays inside `<main>`.
  - Anything injected (prompt, CRT overlay, scan line) goes outside `<main>`.
  - The swapped `<main>` is the fetched DOM exactly. Text effects always restore the exact original.
- **Nothing new under `shell/`.** It is gated by `middleware.js`, and every page needs `nav.js` / `nav/`.
- **Transition budgets:**
  - B: about 1.2s on a fast load.
  - C: 1s or less.
  - Boot or power-on: readable within about 0.8s, skippable by any key or click.
  - Power-off: about 1s.
- **Instant transitions** (swap or navigate with no animation) when:
  - `prefers-reduced-motion: reduce`;
  - `document.hidden`;
  - GSAP failed to load.
- **No step may depend only on an animation completing.** Every animated phase has a timer fallback.
- **Every storage access is wrapped in try/catch.**
- **Corruption:**
  - Stage 0 adds no classes and does no fx work.
  - `fsck` (`fx: 'off'`) turns every stage effect off, including the root prompt and `ROOT ACCESS`.
- **Exact copy:**
  - Prompt: `(esteban@portfolio)-[~]$`; rooted: `(root@egt)-[~]#`.
  - Access line: `ACCESS GRANTED` / `ROOT ACCESS`.
  - Panic line: `kernel panic - not syncing: VFS: unable to mount /home/esteban`.
  - Decrypt status: ` :: access granted`.
- **Commit style:** sentence-case imperative ("Add …"), ending with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **GSAP fails to load** (cdnjs blocked, offline). Nav and Back still swap content instantly, and a
   fresh-session page is visible within about 1.2s. *(Task 1 test + Task 2 and Task 5 manual items.)*
2. **A nav click or Back press while a transition is still running.** The running one finishes instantly,
   then exactly one new one runs. No doubled prompt lines, no half-wiped or half-scrambled content left
   behind. *(Task 2 and Task 4 manual items.)*
3. **Real-world responses:**
   - Over HTTP/2, `response.statusText` is `''`, and the status line must still read `200 OK`.
   - A 404/500 or an offline fetch prints the error line, then falls back to a full load.

   *(Task 1 tests + Task 2 manual item.)*
4. **Long or scrolled pages** (experience page, pane scrolled to the bottom). The prompt is visible at the
   bottom of the pane, and the reveal still takes about 0.4s. *(Task 1 `revealPlan` test + Task 2 manual
   item.)*
5. **Hidden tabs.** A tab hidden mid-transition, or a page first opened in a background tab, still swaps or
   navigates. The boot never plays while hidden and its cover never sticks. *(Task 1 test + Task 2 and Task 5
   manual items.)*

---

### Task 1: Pure navigation rules

**Files:**
- Create: `nav/rules.js`
- Create: `tests/nav.test.js`
- Modify: `tests/all.js` (add `import './nav.test.js'`)

**Interfaces:**
- **Consumes:** `ROOT`, `configFor` from `hunt/corruption.js`.
- **Produces** (all named exports of `nav/rules.js`):
  - `pageOf(pathname: string) -> string`: last path segment, `''` → `'index.html'`.
  - `labelOf(page: string) -> string`: `'index.html'` → `'/home'`; `'about.html'` → `'/about'`.
  - `commandFor(page: string) -> string`: `` `cd ${labelOf(page)}` ``.
  - `promptFor(stage) -> string`.
  - `formatSize(bytes: number) -> string`: `` `${(bytes / 1000).toFixed(1)} kB` ``.
  - `reasonFor(status: number, statusText: string) -> string`: `'404 Not Found'`. Fills an empty
    `statusText`, which is what HTTP/2 gives.
  - `statusLine({ page, status, statusText, bytes, ms }) -> string`.
  - `errorLine(page: string, reason = 'connection reset') -> string`.
  - `outputLines({ status: string, stage }) -> Array<{ text: string, kind: 'dim' | 'access' | 'alert' }>`.
  - `typingDelays(text: string, rng: () => number) -> number[]`.
  - `outputGap(rng) -> number`.
  - `revealPlan(count: number, opts?) -> { stagger: number, wipe: number }`.
  - `transitionFor(trigger: 'nav' | 'history' | 'root', env: { reducedMotion: boolean, hidden: boolean, animate: boolean }) -> 'command' | 'decrypt' | 'power' | 'instant'`.
  - `isPlainText(el) -> boolean`.
  - Constants: `PROMPT`, `ROOT_PROMPT`, `ACCESS_TEXT`, `ROOT_ACCESS_TEXT`, `PANIC_TEXT`, `DECRYPT_STATUS`,
    `ENTER_PAUSE = 120`, `REVEAL_BUDGET = 400`, `WIPE_MS = 90`, `MAX_STAGGER = 60`,
    `POWER_ON_DEADLINE = 1000`.

- [ ] **Step 1: Write the failing tests** in `tests/nav.test.js`, using the harness pattern from
  `tests/corruption.test.js` and its `seq(...)` helper for deterministic rng.

```js
import { test, assert, assertEqual, assertDeepEqual } from './harness.js'
import { ROOT } from '../hunt/corruption.js'
import { pageOf, labelOf, commandFor, promptFor, statusLine, reasonFor, errorLine, outputLines,
  typingDelays, outputGap, revealPlan, transitionFor, isPlainText } from '../nav/rules.js'

test('nav: pageOf maps paths to page files', () => {
  assertEqual(pageOf('/'), 'index.html')
  assertEqual(pageOf(''), 'index.html')
  assertEqual(pageOf('/about.html'), 'about.html')
  assertEqual(pageOf('/root'), 'root')
})
test('nav: command and label follow the nav labels', () => {
  assertEqual(labelOf('index.html'), '/home')
  assertEqual(commandFor('about.html'), 'cd /about')
  assertEqual(commandFor('experience.html'), 'cd /experience')
})
test('nav: prompt is rooted only on the rooted stage', () => {
  assertEqual(promptFor(0), '(esteban@portfolio)-[~]$')
  assertEqual(promptFor(5), '(esteban@portfolio)-[~]$')
  assertEqual(promptFor(ROOT), '(root@egt)-[~]#')
})
test('nav: status line uses real size and time', () => {
  assertEqual(
    statusLine({ page: 'about.html', status: 200, statusText: 'OK', bytes: 4600, ms: 37.6 }),
    'GET /about.html  200 OK  4.6 kB  38 ms',
  )
})
test('nav: status line fills in the reason phrase HTTP/2 leaves empty', () => {
  assert(statusLine({ page: 'about.html', status: 200, statusText: '', bytes: 4600, ms: 38 }).includes('200 OK'))
  assert(statusLine({ page: 'x.html', status: 404, statusText: '', bytes: 0, ms: 5 }).includes('404 Not Found'))
  assertEqual(reasonFor(500, ''), '500 Internal Server Error')
  assertEqual(reasonFor(200, 'OK'), '200 OK')
})
test('nav: error line names the label', () => {
  assertEqual(errorLine('about.html'), 'cd: /about: connection reset')
  assertEqual(errorLine('about.html', '404 Not Found'), 'cd: /about: 404 Not Found')
})
test('nav: output lines per stage', () => {
  const s = 'GET /about.html  200 OK  4.6 kB  38 ms'
  assertDeepEqual(outputLines({ status: s, stage: 0 }), [{ text: s, kind: 'dim' }, { text: 'ACCESS GRANTED', kind: 'access' }])
  assertEqual(outputLines({ status: s, stage: 4 }).length, 2)
  assertDeepEqual(outputLines({ status: s, stage: 5 })[2], { text: 'kernel panic - not syncing: VFS: unable to mount /home/esteban', kind: 'alert' })
  assertEqual(outputLines({ status: s, stage: ROOT })[1].text, 'ROOT ACCESS')
})
test('nav: typing delays stay in the 30-45ms band', () => {
  assertDeepEqual(typingDelays('cd', seq(0, 1)), [30, 45])
  assert(typingDelays('cd /experience', Math.random).every(d => d >= 30 && d <= 45))
})
test('nav: output gap stays in the 55-100ms band', () => {
  assertEqual(outputGap(() => 0), 55)
  assertEqual(outputGap(() => 1), 100)
})
test('nav: reveal never exceeds its budget', () => {
  assertDeepEqual(revealPlan(1), { stagger: 0, wipe: 90 })
  assertDeepEqual(revealPlan(3), { stagger: 60, wipe: 90 })
  for (const n of [2, 10, 50, 200]) {
    const { stagger, wipe } = revealPlan(n)
    assert((n - 1) * stagger + wipe <= 400, `over budget at ${n}`)
  }
})
test('nav: transition picks by trigger, instant when it cannot animate', () => {
  const ok = { reducedMotion: false, hidden: false, animate: true }
  assertEqual(transitionFor('nav', ok), 'command')
  assertEqual(transitionFor('history', ok), 'decrypt')
  assertEqual(transitionFor('root', ok), 'power')
  assertEqual(transitionFor('nav', { ...ok, reducedMotion: true }), 'instant')
  assertEqual(transitionFor('root', { ...ok, hidden: true }), 'instant')
  assertEqual(transitionFor('history', { ...ok, animate: false }), 'instant')
})
test('nav: plain text means text-node children only, not empty', () => {
  const text = t => ({ nodeType: 3, textContent: t })
  const el = (...childNodes) => ({ childNodes, textContent: childNodes.map(n => n.textContent ?? '').join('') })
  assert(isPlainText(el(text('IDENTITY CONFIRMED.'))))
  assert(!isPlainText(el(text('a'), { nodeType: 1, textContent: 'b' })))
  assert(!isPlainText(el(text('a'), { nodeType: 8, textContent: '' }))) // an HTML comment, like about.html's fragment
  assert(!isPlainText(el(text('   '))))
  assert(!isPlainText(el()))
})
```

- [ ] **Step 2: Run the tests to verify they fail.**
  Run: `npm test`
  Expected: the import of `../nav/rules.js` fails (module not found).

- [ ] **Step 3: Implement `nav/rules.js` with the signatures above.**
  - Open it with a header comment in the style of `hunt/corruption.js`: pure rules, applied by `nav.js`.
  - `reasonFor` fills an empty `statusText` from a small map `{ 200: 'OK', 304: 'Not Modified', 404: 'Not Found', 500: 'Internal Server Error' }`.
    `statusLine` uses it.
  - `isPlainText` compares `nodeType` to the literal `3`, because the Node runner has no `Node` global.
  - `outputLines`:
    - access text is `ROOT ACCESS` iff `stage === ROOT`;
    - add the panic line iff `configFor(stage)?.transition.panic`.
  - `typingDelays`: `Math.round(30 + rng() * 15)` per character.
  - `outputGap`: `Math.round(55 + rng() * 45)`.
  - `revealPlan(count, { budget = REVEAL_BUDGET, wipe = WIPE_MS, maxStagger = MAX_STAGGER } = {})`:
    stagger is `0` when `count <= 1`, else `Math.min(maxStagger, Math.floor((budget - wipe) / (count - 1)))`.

- [ ] **Step 4: Run the tests to verify they pass.**
  Run: `npm test`
  Expected: `... passed, 0 failed`, including every `nav:` test.

- [ ] **Step 5: Commit.**

```bash
git add nav/rules.js tests/nav.test.js tests/all.js
git commit -m "Add pure rules for the terminal page transitions"
```

---

### Task 2: Command transition on nav clicks

Replaces today's overlay transition. Corruption visuals on transitions are missing between this task and
Task 3; nothing breaks in between.

**Files:**
- Create: `nav.js`
- Modify: `script.js`
- Modify: `fx.js` (add one export)
- Modify: `style.css`
  - remove `#hack-overlay`, `.hack-text`, `.access-granted` base rules (≈46–62, 97–112);
  - add the prompt rules.
- Modify: `index.html`, `about.html`, `experience.html`, `projects.html`, `contact.html`
- Modify: `README.md` (Stack table, Layout list, "How navigation works", gotchas)
- Modify: `tests/MANUAL.md`

**Interfaces:**
- **Consumes:** everything from Task 1.
- **Produces:**
  - `fx.js`: `export function currentStage()` → the current `stage` (0 before `initFx`).
  - `nav.js` exports:
    - `initNavigation({ afterSwap: () => void })`;
    - `updateActiveNav(page = pageOf(location.pathname))`.
  - `nav.js` internals that later tasks extend:
    - `run(kind, work)`: tracks the single running transition and sets/clears `html[data-transition]`;
    - `finishNow()`: makes the running transition and all its remaining phases run at zero duration; it
      still swaps;
    - `play(timeline, maxMs) -> Promise`: resolves on complete or after `maxMs`, then forces
      `timeline.progress(1)`;
    - `emit(kind, phase, extra)`: dispatches `egt:transition` on `document` with
      `detail = { kind, phase, ...extra }`.
    - Phases: `'start'`, `'access'` (B only, `target` = the access line element), `'end'`.

- [ ] **Step 1: Update the five page heads and bodies.**
  - Replace the GSAP 3.12.2 tag with the three pinned 3.15.0 tags (Global Constraints), each with `defer`,
    placed before the module scripts.
  - Change `<script src="script.js" defer>` to `<script type="module" src="script.js">`.
  - Delete the `#hack-overlay` block, and in `contact.html` its comment.
  - Leave the nav markup untouched.

- [ ] **Step 2: Add `currentStage()` to `fx.js`.** One line returning `stage`.

- [ ] **Step 3: Write `nav.js`.**
  - Header comment: owns navigation; injected elements live outside `<main>`.
  - Register plugins when GSAP is present: `gsap.registerPlugin(ScrambleTextPlugin, CustomEase)`.
    `animate = Boolean(window.gsap)`.
  - Define `CustomEase.create('crtCollapse', '0.7,0,0.9,0.5')` and
    `CustomEase.create('crtOpen', '0.2,0.8,0.3,1')` for Task 5.
  - **`initNavigation`:**
    - `history.replaceState({ page }, '')`;
    - one delegated `click` listener on `document` for `a.nav-link`: `preventDefault`; ignore the current
      page if nothing is running; if a transition is running, call `finishNow()`, await it, then go;
    - calls `navigate(page, 'nav')`.
  - **`navigate`:**
    - Start `fetch(page)` at once, timing it with `performance.now()`.
    - Size is `new TextEncoder().encode(html).length`.
    - The result counts as a failure on a network error, `!response.ok`, or a parsed document with no
      `<main>`. The reason is `connection reset`, `reasonFor(status, statusText)`, or
      `malformed response`.
    - Then branch on `transitionFor('nav', { reducedMotion, hidden: document.hidden, animate })`.
      Read `reducedMotion` from `matchMedia('(prefers-reduced-motion: reduce)').matches` at call time.
  - **`instant`:** await the fetch. On success, swap. On failure, `location.href = page`.
  - **Swap:**
    - `main.innerHTML = newMain.innerHTML`, `main.scrollTop = 0`, `document.title`;
    - `history.pushState({ page }, '', page)`;
    - `updateActiveNav(page)`;
    - after the reveal, `afterSwap()`.
  - **`command`**, in order:
    1. Show `.nav-prompt` and type `commandFor(page)` with `typingDelays`. The prompt is a lazily created
       `<div class="nav-prompt" aria-hidden="true">` appended to `.terminal-container` once, holding
       `.nav-line` with `.nav-ps1` (`promptFor(currentStage())`), `.nav-cmd`, and a blinking `.nav-cursor`.
    2. Pause for `ENTER_PAUSE`, remove the cursor, and call `updateActiveNav(page)`.
    3. Await the fetch.
    4. On failure:
       - print `errorLine` as `kind: 'alert'`;
       - after 600ms, `location.href = page`.
    5. On success:
       - print each `outputLines({ status: statusLine(...), stage: currentStage() })` entry as
         `.nav-out.nav-<kind>`;
       - lines are `outputGap` apart, each wiping in with `clip-path: inset(0 100% 0 0)` → `inset(0)`
         over `WIPE_MS`, `steps(10)`;
       - right after the access line is in the DOM, `emit('command', 'access', { target })`.
    6. Scroll the old content out: `main`'s element children get `y: -(main.clientHeight * 1.1)` over
       240ms, `steps(8)`.
    7. Swap.
    8. Reveal top-down. Choosing blocks is the builder's call; wipes only, never text edits.
       - Blocks whose top is within `main.clientHeight` wipe with `revealPlan(visible.length)`.
       - The rest appear at once.
       - Afterwards, `clearProps: 'clipPath,transform'`.
    9. Hide the prompt and clear its lines, then `afterSwap()`.
  - `run(...)` wraps the work:
    - sets `data-transition`, emits `'start'` / `'end'`, and removes the attribute at the end, even on
      failure;
    - registers a `visibilitychange` handler that calls `finishNow()` when the page becomes hidden.
  - Every animated phase goes through `play(tl, durationMs + 500)`. The swap happens in plain async code,
    never in an `onComplete`.

- [ ] **Step 4: Refactor `script.js` into a module.**
  - Import `initNavigation`, `updateActiveNav` from `./nav.js`.
  - Delete `handleNavigation`, the local `updateActiveNav`, the click interception, the `popstate` reload,
    the `DOMContentLoaded` wrapper (modules run after parsing), and every `console.log`/`console.error`
    debug line, including the one printing `ENV.EMAILJS_PUBLIC_KEY`.
  - Top level: EmailJS init (guarded on `ENV` and `emailjs`), `updateActiveNav()`, `initPageScripts()`,
    `initNavigation({ afterSwap: initPageScripts })`.
  - `initPageScripts` and `showSuccessOverlay` otherwise stay as they are; Task 6 touches the form.

- [ ] **Step 5: Add the prompt CSS to `style.css`.**
  - `.nav-prompt`: absolute, `left/right/bottom: 20px` inside `.terminal-container`, `z-index: 20`,
    `background: var(--bg-color)`, `border-top: 1px solid var(--term-dim)`, hidden unless `.show`.
  - `.nav-dim` uses `var(--term-dim)`, `.nav-alert` uses `var(--term-alert)`, and `.nav-access` is bold
    green.
  - `.nav-cursor` uses the existing `blink` keyframes.

- [ ] **Step 6: Update the docs.**
  - **README:**
    - Stack row: "GSAP 3.15 (CDN) with ScrambleText and CustomEase | Page transitions".
    - Layout entries for `nav.js` and `nav/`.
    - "How navigation works": `nav.js` intercepts clicks and plays the command transition with real fetch
      timing; reduced motion, hidden tabs, and a missing GSAP swap instantly.
    - Delete the rAF gotcha bullet.
  - **`tests/MANUAL.md`:** add a `## Transitions` section with these items:
    - [ ] Click through all five pages. Each shows a typed `cd /<page>` and a `GET` line with real kB and ms
      (it varies between clicks), then the page wipes in. Takes about 1.2s locally.
    - [ ] Scroll the experience page to the bottom and click `/about`. The prompt shows at the bottom of
      the pane, the pane doesn't resize, and the reveal is quick.
    - [ ] Click `/about` then `/projects` within half a second. The first transition finishes instantly,
      then one `/projects` transition runs. There's one prompt and no leftover lines.
    - [ ] Devtools offline, then click a nav link. A red `cd: /<page>: connection reset` line appears, then
      a full page load is attempted.
    - [ ] Block `cdnjs.cloudflare.com` in devtools and reload. Nav clicks still swap pages instantly, with
      no console errors from `nav.js`.
    - [ ] Reduced motion (rendering emulation): nav clicks swap instantly, with no prompt.
    - [ ] Start a nav click, then switch tabs at once. Coming back, the new page is in place.
  - Remove the "Needs a real, visible browser tab" note on the existing cursor-trigger item.

- [ ] **Step 7: Run the unit tests.**
  Run: `npm test`
  Expected: `... passed, 0 failed`.

- [ ] **Step 8: Walk the new Transitions items, plus the home typewriter and the contact form after a swap.**
  - Run: `npm run serve` and open `http://localhost:8765/index.html`.
  - Expected: every item behaves as written, and the console shows nothing but the known
    `/_vercel/speed-insights/script.js` 404.

- [ ] **Step 9: Commit.**

```bash
git add nav.js script.js fx.js style.css index.html about.html experience.html projects.html contact.html README.md tests/MANUAL.md
git commit -m "Play nav clicks as a typed terminal command"
```

---

### Task 3: Corruption on the new transitions

**Files:**
- Modify: `fx.js`
  - remove `updateOverlay`, `accessObserver`, `ACCESS_TEXT`, `ROOT_TEXT`, and `onAccessShown`'s text choice;
  - update the header comment.
- Modify: `style.css`, the corruption block (≈547–669)
- Modify: `README.md` (corruption table rows 2, 5, root; "Everything hangs off" rule)
- Modify: `tests/MANUAL.md` (stage items)

**Interfaces:**
- **Consumes:** the `egt:transition` event (`detail.phase === 'access'`, `detail.target`) and
  `html[data-transition]` from Task 2.
- **Produces:** nothing new for later tasks.

- [ ] **Step 1: Wire `fx.js` to the event.**
  - In `initFx`, add `document.addEventListener('egt:transition', onTransition)`.
  - On `phase === 'access'`:
    - the real text is `target.textContent`, which `nav.js` already set;
    - with probability `config.transition.corrupt`, and not under reduced motion, show
      `corruptText(real, 0.45, Math.random)`, then restore `real` after 220ms.
  - At stage 0 `config` is null, so nothing happens.
  - Delete `updateOverlay()` and its call in `refreshFx`.

- [ ] **Step 2: Retarget the CSS.**
  - Replace `.fx-2 #hack-overlay[style*="pointer-events: all"] .hack-text, .fx-2 .access-granted` with
    `html.fx-2[data-transition] .nav-prompt, html.fx-2[data-transition] main` for the `fx-rgb` animation.
  - Replace the tear `::after` selector with `html.fx-2[data-transition] .terminal-container::after`.
  - Delete the `.fx-5 #hack-overlay ...::before` panic rule; the panic is now an output line.
  - Change `.fx-5 .access-granted` and `.fx-root .access-granted` to `.nav-access`.
  - Update the comment above the block.
  - In the reduced-motion block, swap the old selectors for the new ones.

- [ ] **Step 3: Update the docs.**
  - **README corruption table:**
    - stage 2 "Nav transitions glitch: RGB split, tearing, `ACCESS GRANTED` lands corrupted";
    - stage 5 "a kernel-panic line in the transition output";
    - root "`(root@egt)-[~]#` prompt and `ROOT ACCESS`".
  - **`tests/MANUAL.md`:** amend the stage 2 and stage 5 items to the new wording, and the rooted item to
    "the transition prompt is `(root@egt)-[~]#` and the access line reads `ROOT ACCESS`".
  - **`tests/MANUAL.md`:** add "After `fsck`, transitions show the normal prompt and `ACCESS GRANTED`,
    with no glitching."

- [ ] **Step 4: Run the unit tests.**
  Run: `npm test`
  Expected: `... passed, 0 failed`. `tests/corruption.test.js` is unchanged and still passes.

- [ ] **Step 5: Walk the stage items** at stage 0, 2, 5, and rooted (set `egt.eggs` as `tests/MANUAL.md`
  describes) and after `fsck`.
  Expected:
  - stage 0: plain;
  - stage 2: RGB split and tearing only while the prompt is up;
  - stage 5: a red panic line;
  - rooted: root prompt and `ROOT ACCESS`, no glitch;
  - after `fsck`: plain.

- [ ] **Step 6: Commit.**

```bash
git add fx.js style.css README.md tests/MANUAL.md
git commit -m "Drive transition corruption from the transition event"
```

---

### Task 4: Decrypt on Back/Forward

**Files:**
- Modify: `nav.js` (popstate path)
- Modify: `fx.js`: the `decode` burst's filter becomes `!el.dataset.fxBusy && isPlainText(el)`.
- Modify: `style.css` (`.nav-scanline`, `.brand-status`)
- Modify: `README.md` ("How navigation works")
- Modify: `tests/MANUAL.md`

**Interfaces:**
- **Consumes:**
  - from Task 2: `run`, `finishNow`, `play`, `emit`, swap, `updateActiveNav`;
  - from Task 1: `isPlainText`, `revealPlan`, `transitionFor`, `pageOf`, `DECRYPT_STATUS`;
  - `GLYPHS` from `hunt/rain.js`;
  - `corruptText` from `hunt/corruption.js`.
- **Produces:** nothing new.

- [ ] **Step 1: Handle `popstate` in `initNavigation`.**
  - Compute `page = pageOf(location.pathname)`. If a transition is running, `finishNow()` and await it.
  - Fetch as in Task 2.
  - Branch on `transitionFor('history', ...)`. `instant` swaps without `pushState`.
  - On failure, `location.reload()`.
  - `main.scrollTop = 0` on swap (decision: no scroll restore).

- [ ] **Step 2: Implement the `decrypt` choreography,** at most about 1s in total.
  1. Sweep a lazily created `.nav-scanline` (2px, `rgba(0,255,65,.55)`, outside `<main>`) down the pane
     over 600ms, linear, without awaiting it.
  2. Old content: the visible plain-text leaves of `main` (`querySelectorAll('*')` filtered by
     `isPlainText` and inside `main`'s visible box) show glyph noise for 160ms, staggered by
     `revealPlan(n, { wipe: 0, maxStagger: 30 }).stagger`.
  3. Swap with no `pushState`.
  4. New content:
     - Each visible plain-text leaf keeps `original = el.textContent` and starts as
       `corruptText(original, 1, Math.random)`.
     - It then tweens `scrambleText: { text: original, chars: GLYPHS }` over
       `Math.min(600, 220 + 5 * original.length)` ms, staggered by
       `revealPlan(n, { wipe: 0, maxStagger: 70 }).stagger`.
     - Elements with no plain-text leaf inside (img, input, textarea) wipe in with clip-path.
     - At the end, and on `finishNow`, every touched leaf gets `textContent = original`.
  5. Append `<span class="brand-status">` with `DECRYPT_STATUS` to the first `.brand`. Fade it in and out
     over 1.4s and remove it, without awaiting.
  6. `afterSwap()`.

- [ ] **Step 3: Update the docs.**
  - **README:** "Back/Forward decrypt the page in place instead of reloading."
  - **`tests/MANUAL.md`:**
    - [ ] Back/Forward after a few nav clicks: no reload (Network shows a `fetch`, not a document load),
      text decrypts in place in 1s or less, and ` :: access granted` flashes by the brand.
    - [ ] Back to `/about`: the DOM still contains the `[recovered fragment]` comment, and project cards,
      links, and the contact form are intact and work.
    - [ ] Press Back three times quickly. You land on the right page with no doubled or scrambled text
      left over.
    - [ ] Back to the very first page of the session works; there's no reload loop.

- [ ] **Step 4: Run the unit tests.**
  Run: `npm test`
  Expected: `... passed, 0 failed`.

- [ ] **Step 5: Walk the new items, and one `decode` burst at stage 3+** via
  `import('/fx.js').then(fx => fx.runBurst('decode'))`.
  Expected: as written; the burst still decodes a heading and restores it.

- [ ] **Step 6: Commit.**

```bash
git add nav.js fx.js style.css README.md tests/MANUAL.md
git commit -m "Decrypt pages in place on Back and Forward"
```

---

### Task 5: CRT power cycle and boot

**Files:**
- Modify: `nav.js`
  - add `powerOn()`, run at module evaluation;
  - add exported `powerOffTo(url)`;
  - add the delegated `#fx-breach` click.
- Modify: `site-console.js:150-155`: replace the 700ms `setTimeout` with `powerOffTo(result.navigate)`.
- Modify: `shell.js:83-89`: replace the 400ms `setTimeout` with `powerOffTo(result.navigate || 'index.html')`.
  Keep `mode = 'exiting'` and `inputLine.hidden = true`.
- Modify: `index.html`, `about.html`, `experience.html`, `projects.html`, `contact.html`, `root.html`
  - add the inline boot script to all six;
  - in `root.html`, also add the three GSAP tags (`defer`) and `<script type="module" src="nav.js">`.
- Modify: `style.css` (`#crt`, `.crt-window`, `html.power-on` cover + fallback)
- Modify: `README.md`, `tests/MANUAL.md`

**Interfaces:**
- **Consumes:**
  - from Task 2: `run`, `play`, `emit`, the `crtCollapse` / `crtOpen` eases, `animate`;
  - `POWER_ON_DEADLINE` and `transitionFor` from Task 1.
- **Produces:** `export function powerOffTo(url: string) -> Promise<void>`, which always ends in
  `location.href = url`.

- [ ] **Step 1: Add the inline boot script** to each of the six heads, right after the `style.css` link.
  This is the exact code; it's the only pre-paint decider.

```html
<script>
  try {
    var s = sessionStorage, h = document.documentElement, p = s.getItem('egt.poweroff')
    s.removeItem('egt.poweroff')
    if (!document.hidden && !matchMedia('(prefers-reduced-motion: reduce)').matches && (p || !s.getItem('egt.booted'))) h.classList.add('power-on')
    s.setItem('egt.booted', '1')
  } catch (e) {}
</script>
```

- [ ] **Step 2: Add the CRT CSS to `style.css`.**
  - The cover, with its fallback timing:

```css
html.power-on body::after { content: ""; position: fixed; inset: 0; z-index: 9700; background: #000; animation: crt-fallback 0s linear 1.2s forwards; }
@keyframes crt-fallback { to { visibility: hidden; } }
```

  - `#crt`: fixed, `inset: 0`, `z-index: 9700`, `pointer-events: none`, `overflow: hidden`.
  - `.crt-window`: centred, `box-shadow: 0 0 0 100vmax #000`, background `rgba(214,255,224,0)` for the
    flash.
  - The window opens by animating `width`/`height`, never `transform`, because the 100vmax spread would
    scale with it. Content underneath is never hidden or scaled to zero.

- [ ] **Step 3: Implement `powerOn()` in `nav.js`.**
  - It only runs if `html.power-on` is set and `performance.now() < POWER_ON_DEADLINE`. Otherwise it just
    removes the class.
  - Create `#crt`, then remove `power-on`. The black window takes over from the cover in the same frame.
  - Choreography, within the about 0.8s budget, all under `run('power', …)`:
    1. An 8px glowing dot.
    2. A full-width 2px line by 30%.
    3. The full viewport over 520ms with `crtOpen`, while the flash fades from 0.9 to 0.
    4. Remove `#crt`.
    5. 280ms of `steps(5)` flicker and 2–4px vertical jitter on `.terminal-container`, then `clearProps`.
  - A `keydown` or `pointerdown` during it calls `finishNow()` (once, `{ once: true }`).
  - Without GSAP, remove `power-on` and stop.

- [ ] **Step 4: Implement `powerOffTo(url)`.**
  - If `transitionFor('root', ...)` is `instant`, set `location.href = url`.
  - Otherwise, under `run('power', …)`:
    1. Set `sessionStorage['egt.poweroff'] = '1'` (guarded).
    2. Create `#crt` at full size.
    3. Collapse to a 2px line by 65%, then to an 8px dot, over 380ms with `crtCollapse`, while the flash
       rises to 1.
    4. The afterglow dot fades and shrinks over 600ms.
    5. `location.href = url`.
  - A 1500ms timer navigates regardless.
  - In `initNavigation`'s click listener, `a#fx-breach` gets `preventDefault` and then
    `powerOffTo(link.getAttribute('href'))`. `root.html` never calls `initNavigation`.

- [ ] **Step 5: Switch `site-console.js` and `shell.js` to `powerOffTo`.**
  - `import { powerOffTo } from './nav.js'` in both.
  - The output (`ACCESS GRANTED`, `switching to /root...`) stays visible while the screen collapses.

- [ ] **Step 6: Update the docs.**
  - **README:** add to "How navigation works":
    - entering or leaving `/root` power-cycles the screen;
    - the first page of a browser session boots once;
    - the inline head script decides, and the CSS cover clears itself after 1.2s whatever happens.
  - **`tests/MANUAL.md`:**
    - [ ] New tab on any page: the screen powers on from a dot within about 0.8s; a key press skips it.
      Reload: no boot.
    - [ ] Block `cdnjs.cloudflare.com` and open a fresh tab. The page is visible within about 1.2s and is
      never stuck black.
    - [ ] At stage 5, click `> /root awaits_`. The site collapses to a line, then a dot that fades, and
      `/root` powers on.
    - [ ] `su root` with the right passphrase: the same power cycle into `/root` (`session restored`).
    - [ ] `exit` in the `/root` shell: the shell powers off and the home page powers on.
    - [ ] Reduced motion: no boot, and `/root` entry and exit navigate instantly.
    - [ ] Open the site in a background tab (middle-click) and switch to it later. There's no boot stuck
      on screen.

- [ ] **Step 7: Run the unit tests.**
  Run: `npm test`
  Expected: `... passed, 0 failed`.

- [ ] **Step 8: Walk the new items** with `npm run serve` and the README's `.env.local` test values (needed
  for `su root`).
  Expected: as written.

- [ ] **Step 9: Commit.**

```bash
git add nav.js site-console.js shell.js style.css index.html about.html experience.html projects.html contact.html root.html README.md tests/MANUAL.md
git commit -m "Power-cycle the screen into and out of /root"
```

---

### Task 6: Honest contact form failures

**Files:**
- Modify: `script.js` (`initPageScripts` contact-form block)
- Modify: `README.md` (Open items: tick "Console noise")
- Modify: `tests/MANUAL.md`

**Interfaces:**
- **Consumes:** `showSuccessOverlay()` (unchanged).
- **Produces:** nothing.

- [ ] **Step 1: Fix the failure paths.**
  - **`ENV` missing at submit:** set `#status-msg` to `> ERROR: mail relay offline.` and restore the button
    text. Don't call `emailjs`.
  - **Send rejected:** no `showSuccessOverlay()`. Set `#status-msg` to `> TRANSMISSION FAILED. Try again.`
    and the button to `RETRY`.
  - **Success:** unchanged (`showSuccessOverlay()`, reset, `> UPLOAD COMPLETE.`).
  - Clear `#status-msg` at the start of each submit.

- [ ] **Step 2: Update the docs.**
  - **README:** tick the "Console noise" open item. Task 2 removed the logs; reword it as done.
  - **`tests/MANUAL.md`:**
    - [ ] Contact form with a bad EmailJS service ID in `config.js`: no Pepe overlay, status reads
      `> TRANSMISSION FAILED. Try again.`, button reads `RETRY`.
    - [ ] Contact form with a real send: Pepe overlay, `> UPLOAD COMPLETE.`.
    - [ ] The console shows no debug lines on any page load.

- [ ] **Step 3: Walk the new items.**
  - Run: `npm run serve` and open `http://localhost:8765/contact.html`.
  - Expected: as written. Restore `config.js` afterwards.

- [ ] **Step 4: Commit.**

```bash
git add script.js README.md tests/MANUAL.md
git commit -m "Show contact form failures instead of a false success"
```

---

### Task 7: End-to-end check

- [ ] **Step 1: Run the unit tests.**
  Run: `npm test`
  Expected: `... passed, 0 failed`.
- [ ] **Step 2: Run the browser test page.**
  - Run `npm run serve`, then open `http://localhost:8765/tests.html`.
  - Expected: the title reads `PASS (n)`.
- [ ] **Step 3: Walk all of `tests/MANUAL.md`, Hunt and Transitions sections included,** on a fresh state
  (reset as its header says).
  Expected: every item passes. Note any failure with the step and what happened, and fix it before the
  branch goes up for review.
