# Page Transitions Refactor — Design

**Date:** 2026-10-20
**Status:** Approved for planning.
**Repo:** `personal-website` (static site, no build step)
**Branch:** `page-transitions`, off `origin/main` (the arcade PR #6 is already merged there)

## Context

Clicking the nav plays a "hacking" overlay. It's a black screen with random characters strobing every 50ms,
a fixed 800ms wait whatever the load time, and `ACCESS GRANTED` blinking four times. Then the new `<main>` is
revealed under a fade. Esteban finds it fake and wants the page changes to feel like a **real terminal / CRT**.
After seeing three playable prototypes he wanted all three, each placed where it fits the site best. He
considered Motion and Anime.js and settled on **staying with GSAP**, which is already loaded and now free
including ScrambleText, SplitText, and CustomEase.

"Complete refactor" also means cleaning up `script.js`, which today is a self-described debug version that
logs the EmailJS key.

## Goals

- Every transition reads as real terminal or real hardware behaviour, not a canned effect.
- Navigation tells the truth: the timing shown is the real fetch, and a fast load feels fast. The nav
  transition takes about 1.2s on a fast load, down from about 2.2s today.
- Back/Forward animate instead of reloading.
- The corruption stages (`hunt/corruption.js`) keep their meaning on the new transitions.
- Fix the existing bugs:
  - a fetch failure leaves the overlay up forever;
  - a hidden tab never swaps content (README gotcha);
  - a second nav click mid-transition starts a parallel transition.

## Non-goals

- Moving to Motion or Anime.js, or adding a build step.
- Changing page content or layout, the site console slide, toasts, fx bursts and rain, the shell games, or
  the `/root` lock-screen unlock flow.
- Redesigning the contact form's Pepe success overlay. It only has to keep working on the upgraded GSAP.

## Anti-goals (a failure even if it technically works)

- Navigation that feels slower or more tedious than today. People clicking through a portfolio must not wait
  on theatre.
- Lost markup. The swapped `<main>` must be the fetched DOM exactly: forms, links, images, and the about-page
  HTML comment all intact. Text effects always restore the exact original, the rule fx.js already follows.
- A page stuck hidden or blank (failed boot, failed fetch, hidden tab, JS error).
- Breaking the hunt: eggs.js listeners, the stage visuals, and `fsck` as the off switch.
- Motion for people who ask for reduced motion.

## The three transitions and where they go (decided with Esteban)

### B · Run the command → nav clicks between the five pages
1. On click, start the fetch right away, in parallel with the animation.
2. A prompt appears at the bottom of the terminal pane. Its text is `(esteban@portfolio)-[~]$`, or
   `(root@egt)-[~]#` when rooted.
   - It is shown **only during the change** (decided with Esteban).
   - It floats over the bottom of the content pane together with its output lines, then disappears once
     the new page is in.
   - The pane's layout and size never change, and pages look the same as today when idle.
3. A short command built from the nav label, e.g. `cd /about`, types at a fast human cadence: about 30–45ms
   per character with jitter, then a short pause before Enter.
4. Output lines print:
   - `GET /about.html  200 OK  4.6 kB  38 ms`, using the **real** elapsed time and response size.
   - Then `ACCESS GRANTED` (or `ROOT ACCESS` when rooted).
   - If the fetch is still pending when typing ends, the cursor waits until it resolves.
5. The main pane clears and the new page reveals top-down in quick stepped wipes. The stagger is capped so the
   reveal stays at about 0.4s however long the page is; content below the fold appears at once.
6. Then `initPageScripts()` runs: typewriter, contact form.

### C · Decrypt in place → Back/Forward (popstate)
- No prompt, since nobody typed anything. Fetch the page for the new location.
- The old page's plain-text elements scramble to noise. A single scan line sweeps down.
- The new DOM goes in, and its plain-text elements decrypt into their real text with a short stagger,
  using the ScrambleText plugin.
- Elements with mixed markup (links, cards, forms, images) wipe in instead of scrambling, so markup is never
  flattened. This is the same "only elements whose children are all text nodes" filter fx.js uses for its
  `decode` burst.
- A brief `:: access granted` status appears next to the brand. Total is about 1s or less.
- Needs `history.replaceState` on first load and state on every `pushState`.

### A · CRT power cycle → entering /root, plus a boot on first visit
- **Power-off:** the terminal collapses vertically into a bright line, then horizontally into a dot, the
  phosphor afterglow fades, then the browser navigates. Triggers:
  - the `#fx-breach` link;
  - the site console's `su root` success and "already root" redirects (`site-console.js:154`);
  - the shell's `exit` (`shell.js:87`) (Claude's call, for symmetry).
- **Power-on:** a dot expands to a line, then to the full screen with a slight overshoot, a brightness flash,
  and a short flicker or roll. It plays:
  - on the page reached after a power-off (`root.html`, or the site after `exit`);
  - as a one-time **boot** on the first page load of a browser session (proposed by Claude, accepted by Esteban: once per visit,
    not every refresh).
- **Budgets** (Claude's call):
  - The boot is the power-on animation only, with no boot text. Content is readable within about 0.8s, and
    any key press or click skips it.
  - Power-off takes about 1s and replaces the existing navigate delays (700ms in the site console, 400ms in
    the shell).
- **How power-on runs** (Claude's call): as a black CRT overlay on top of content that has **already painted**.
  Content is never hidden or scaled to zero, so first-visit LCP and Speed Insights stay honest. A tiny inline
  `<head>` script shows the overlay before first paint, and only when power-on will actually run. The overlay
  must remove itself even if the module fails, for example through a CSS animation fallback or a timeout.

### All three
- **Reduced motion** (`prefers-reduced-motion: reduce`): every transition becomes an instant swap or
  navigation. No boot, no power cycle.
- **Hidden tab:** if `document.hidden`, swap with no animation. The swap or navigation must never depend only
  on an animation completing; keep a safety timeout.
- **Rapid clicks:** a nav click during a running transition fast-forwards it to the end, then starts the new
  one if the target differs. Clicking the current page still does nothing.
- **Fetch failure** (Claude's call): B prints a red error line such as `cd: /about: connection reset`, then falls
  back to a full page load of the URL.

## Corruption integration

The stage table's meaning is unchanged. Only the hook changes.

- While a transition runs, set `<html data-transition="command|decrypt|power">` and dispatch
  `egt:transition` on `document` with `{ kind, phase: 'start' | 'end' }`. Remove the attribute at the end.
- **fx.js:** drop the `MutationObserver` on `#access-msg` (`fx.js:279`). Instead, corrupt the `ACCESS GRANTED`
  / `ROOT ACCESS` output line with the existing `corruptText` and `config.transition.corrupt` chance. Keep the
  220ms correction.
- **style.css:** replace the `#hack-overlay[style*="pointer-events: all"]` selectors (`style.css:549`, `:561`,
  `:616`) with `html[data-transition]` ones.
  - Stage 2+: RGB split and tearing on the prompt row and main pane while any transition runs.
  - Stage 5: an extra red `kernel panic - not syncing: VFS: unable to mount /home/esteban` output line in B.
  - Rooted: the root prompt and `ROOT ACCESS`, with calmer timing.
- **Stage 0:** no corruption classes and no fx work, exactly as today.

## Code shape

Follow the repo's split: pure rules with unit tests (like `hunt/`, `cli/`) and a thin DOM controller (like
`fx.js`, `site-console.js`).

- **Pure module** (name left to the builder, e.g. `nav/`):
  - command text from an href;
  - status-line formatting (bytes → kB, ms);
  - which transition a trigger gets;
  - the timing plan: per-character delays from an injected random function, and the reveal stagger capped by
    a total budget;
  - output lines per stage, from `configFor(stage).transition` and rooted state.
  - Tests go in `tests/<name>.test.js`, registered in `tests/all.js`.
- **DOM/GSAP controller** (public file, not under `shell/`, which `middleware.js` gates):
  - owns navigation: intercepting `a.nav-link`, fetch, swap, history, popstate, and calling
    `updateActiveNav` / `initPageScripts`;
  - runs the three choreographies as GSAP timelines;
  - exposes `powerOffTo(url)` for site-console.js and shell.js, so they stop setting `location.href` on their
    own timers.
- **`script.js`:**
  - becomes `type="module"` (Claude's call). It keeps the EmailJS init, `initPageScripts`, and the contact form.
  - All debug `console.log`s go, including the one that prints the EmailJS public key. Tick that README open
    item.
  - Fix the debug behaviour too (Claude's call):
    - A failed send no longer shows the "PACKET SENT" Pepe overlay. It prints a real failure message in
      `#status-msg` and resets the button.
    - A missing `ENV` no longer leaves the button stuck on "TRANSMITTING...".
    - `showSuccessOverlay` keeps working on the new GSAP, for real successes only.
- **HTML** (index, about, experience, projects, contact, plus root.html):
  - GSAP **3.15.0** pinned exactly from cdnjs (`gsap.min.js`, `ScrambleTextPlugin.min.js`,
    `CustomEase.min.js`), all verified to exist. `root.html` gains these too.
  - Remove the `#hack-overlay` markup; the old transition goes away entirely.
  - Add the pre-paint boot script.
  - Nav markup stays identical across pages. The prompt row is injected by JS outside `<main>`, so it doesn't
    break the "identical nav / content only in `<main>`" rules.
- **Reuse:**
  - `corruptText`, `configFor`, `stageFor`, `ROOT` from `hunt/corruption.js`;
  - `isRooted()` from `fx.js`;
  - `safeStorage` from `hunt/state.js` (or a sessionStorage twin) for the boot and power-on flags. Every
    storage access is guarded.
  - `updateActiveNav` and `initPageScripts` from `script.js`.
- **Docs:**
  - README: Stack row, "How navigation works" (Back no longer reloads, the rAF gotcha is resolved), the
    corruption table wording for stages 2 and 5 and root, and open items.
  - `tests/MANUAL.md`: a new transitions section.

## Reference values from the prototypes Esteban saw

These are starting points, not specs. B must be faster than the prototype was.

- **A:**
  - Collapse: 380ms with `cubic-bezier(.7,0,.9,.5)`; scaleY goes to 0.005 by 65%, then scaleX to 0. A
    pale-green flash overlay rises to full opacity at the same time.
  - Afterglow: an 8px dot that fades and shrinks over 600ms.
  - Dark gap: 120ms.
  - Power-on: 520ms with `cubic-bezier(.2,.8,.3,1)`; the line expands by 30%, overshoots to scaleY 1.03 by
    75%, and the flash fades out.
  - Settle: 280ms of `steps(5)` flicker and vertical jitter.
- **B:**
  - Each output line wipes in with `clip-path: inset(0 100% 0 0)` → `inset(0)`, 90ms, `steps(10)`, 55–100ms
    apart.
  - The old content scrolls out with `translateY(-110%)` in `steps(8)` over 240ms.
  - The prototype typed `cd /about && cat about_me.txt` at 35–110ms per character. Too slow; see the budget
    above.
- **C:**
  - Old lines turn to noise for 160ms each, 30ms apart.
  - New lines scramble in over 220ms + 5ms per character, 70ms apart.
  - One 2px green scan line sweeps the pane in 600ms, linear.

## Left to the builder

- Exact timings, easings (CustomEase curves), and command wording, within the budgets above.
- Module and file names.
- How the reveal picks blocks.
- Whether Back restores the main pane's scroll position.
- How the boot fallback un-hides the page.

## Verification

- `npm test`: every existing test plus the new pure-module tests pass.
- `npm run serve` with the README's `.env.local` test values, driven in the built-in browser:
  - Nav through all five pages (B): real ms and kB in the status line, total about 1.2s, typewriter and
    contact form work after the swap.
  - Double-click two links fast: one clean transition each, no overlap.
  - Back/Forward (C): no document reload, and markup intact (the about comment is present in the DOM).
  - New tab: the boot plays once; refresh doesn't replay it.
  - Breach link, `su root`, and shell `exit`: power-off, then power-on on arrival.
  - Block the fetch with devtools offline: error line, then a full load.
- Stages: set `egt.eggs` to stage 0, 2, 5, and rooted states and check them against the table. `fsck` turns
  everything off.
- Reduced-motion emulation: instant swaps, no boot or power cycle.
- Console: no errors (apart from the known Speed Insights 404) and no debug logs.
- Walk the updated `tests/MANUAL.md`.
