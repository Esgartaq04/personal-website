# Easter Egg Hunt and Hidden Shell — Design

**Date:** 2026-08-27
**Status:** Approved for planning. Revised 2026-09-10 during planning — see [Revisions](#revisions).
**Repo:** `personal-website` (static site, no build step)

## Goal

Make the site rewarding to poke at. A five-fragment scavenger hunt hidden across the existing pages assembles into a passphrase that unlocks `/root`, an interactive fake shell containing a playable Snake.

Success means a curious visitor discovers a hunt exists without being told, and a persistent one reaches a payoff worth the effort — a linkable URL that can be shown deliberately, not just stumbled into.

## Non-goals

- **This is not access control.** Anyone can read the source and skip the hunt. Obfuscation would buy nothing.
- **No mobile parity.** Triggers are keyboard and mouse driven. On touch devices nothing fires and nothing teases.
- **No build step, no dependencies.** The project is vanilla HTML/CSS/JS and stays that way.
- **No second game.** The command registry makes one cheap to add later; this spec ships one.

## Architecture

**No existing JavaScript is modified.** New files:

```
eggs.js             Wires the trail to the page (DOM layer)         5 site pages + root.html
hunt/state.js       Progress state, one localStorage key            pure
hunt/trail.js       Fragments (public text only), triggers, hints   pure
lock.js             /root lock screen; asks /api/unlock (public)    root.html only
term.js             /root terminal DOM: print, prompt (public)      root.html only
shell.js            /root REPL (DOM layer), served only unlocked    imported by lock.js
shell/vfs.js        Virtual filesystem tree and path functions      pure, served only unlocked
shell/core.js       Tokenizer, command registry, builtins, tab      pure, served only unlocked
shell/commands.js   Extra commands (tree, grep, neofetch, open...)  pure, served only unlocked
shell/snake.js      Snake rules plus its takeover controller        pure core, served only unlocked
shell/matrix.js     Falling-code screensaver takeover               pure core, served only unlocked
lib/token.js        HMAC-signed unlock cookie                       server (Node)
lib/hunt.js         Secret fragments, passphrase check, gate        server (Node)
api/*.js            /api/fragment, /api/unlock, /api/session        Vercel Functions
middleware.js       Serves shell.js and shell/ only with the cookie Vercel Routing Middleware
root.html           Hidden destination, absent from nav             —
robots.txt          Carries the fragment 5 breadcrumb               —
sys_dump.txt        The file that breadcrumb points to              —
vercel.json         Rewrites /root to /root.html                    —
tests.html          Browser test runner                             —
tests/              Harness, Node runner, unit tests, manual list   —
```

Existing files that change:

- **All five current pages** gain one `<script type="module" src="eggs.js"></script>` tag.
- **`about.html`** gains the fragment 3 HTML comment.
- **`style.css`** gains rules for the toast, the progress indicator, and the shell.

Removing the script tags returns the site to its current behavior exactly; the feature is additive and independently removable.

### ES modules

Everything new is an ES module: explicit imports instead of globals, and module scripts are deferred by default. The same files run unchanged under Node 22 (verified on v22.14.0 with no `package.json`), which is what makes a one-command test runner possible without adding a toolchain. Module scripts need HTTP, which the site already required for the contact form.

### Document-level delegation

`script.js` swaps only `<main>`'s innerHTML during navigation and re-runs `initPageScripts()`. Any listener bound to an element inside `<main>` dies on swap, and any init hook that re-binds creates duplicates — this is precisely why the contact form needs the clone-node workaround at `script.js:131`.

`eggs.js` therefore binds **every listener once, to `document`**, and matches targets by selector at event time. `document` survives the swap. There is nothing to re-register and no duplicate-firing bug class, and `script.js` needs no integration hook.

### State

One `localStorage` key, `egt.eggs`:

```json
{ "found": ["console", "cursor", "comment"], "texts": { "console": "...", "cursor": "..." }, "snakeHigh": 42 }
```

`texts` holds the secret fragments the server has handed this visitor, so `hunt()` can show them again. None of this is trusted: whether `/root` is unlocked lives only in the signed cookie (see Server half).

All reads and writes wrapped in `try/catch`, falling back to an in-memory object. A disabled or throwing `localStorage` must never break the page. Corrupt JSON resets to empty rather than throwing on load.

The store **reads through to storage on every access** rather than caching at load. `/root` loads both `eggs.js` and `shell.js`, each with its own store; a cached copy in one would overwrite the other's newer writes.

## The trail

Five fragments concatenate, in order, to the passphrase. Three of them (and so the passphrase) are
**server-held**: they live only in the `HUNT_FRAGMENTS` env var on Vercel and never appear in the repo or
the browser bundle. The other two are found by reading public files, so their text is in those files.

| # | ID | Location | How it is found | How it is logged | Fragment |
|---|----|----------|-----------------|------------------|----------|
| 1 | `console` | Any page | Console banner says to type `hunt()` | Calling `hunt()` | server-held |
| 2 | `cursor` | Home page | Click the blinking `.cursor` span three times within 1.5s | Automatic | server-held |
| 3 | `comment` | About page | HTML comment, visible only in view-source | Comment says to run `hunt("ash_")` | `ash_` |
| 4 | `konami` | Any page | Konami code | Automatic | server-held |
| 5 | `robots` | `robots.txt` | A `# Disallow: /sys_dump.txt` comment; that file holds the fragment | File says to run `hunt("0xd4")` | `0xd4` |

Two deliberate choices for fragment 5. The file uses a normal path rather than a dotfile — Vercel's static handling of dotfiles is not worth depending on for a puzzle step. And its name is unrelated to the fragment it contains, so reading `robots.txt` reveals only where to look, not the answer.

### Claiming fragments

`hunt()` is a console function. Calling it with no argument claims fragment 1; calling it with a fragment's text claims that fragment. Any call also claims fragment 1, since calling it at all proves the console was found.

Fragments 3 and 5 need this because reading a comment or a text file runs no JavaScript — there is no event to detect. A secret fragment may be claimed by text only once the server has handed it to this visitor.

When a secret fragment's trigger fires, `eggs.js` asks `POST /api/fragment {id}` for its text. That call is reachable by anyone who reads `eggs.js`, which is accepted: it turns skipping the hunt into reverse-engineering work rather than copying a string out of the source. The passphrase check and the unlock are what is actually protected.

### The hint chain

Every `hunt()` call prints progress in trail order, masking unfound fragments, followed by the hint for the first one still missing:

```
> [2/5] fragments recovered
  1. <console fragment>
  2. ????
  3. ash_
  4. ????
  5. ????
> next lead: the cursor on the home page keeps blinking at you. knock three times.
```

This is what makes the trail a trail rather than five disconnected secrets: each lead points at the next, and they grow more cryptic in the same order the fragments grow harder. Hints name pages rather than URLs, because the live site serves `/about.html`, not `/about`.

### Why fragments rather than a completion flag

The pieces form a passphrase the user types at `/root`. `localStorage` only records which fragments have been *found* — a convenience, never the key. The key is checked by `/api/unlock`, so editing storage can change the progress badge but cannot open the shell. Clearing storage does not destroy the payoff for anyone who wrote the phrase down, and a solver can hand the passphrase to someone else, which is how this kind of thing spreads.

### Feedback and the progress indicator

Each newly logged fragment shows a brief glitch toast: `FRAGMENT 3/5 ACQUIRED :: "ash_"`, where the number is how many have been found. It is styled from the existing overlay vocabulary rather than new visual language.

The progress counter `[3/5]` appears in the brand line **only after the first fragment is logged**. Before that the site looks exactly as it does today. This is what makes the difficulty curve work: the trail advertises itself only to people who have already demonstrated they are looking. The brand line lives in the header, outside `<main>`, so the counter survives SPA navigation.

Fragment 1 is free deliberately. It teaches the mechanic and guarantees that anyone who opens devtools learns a hunt exists, giving the remaining four a reason to be hunted.

## The shell

### Locked state

`root.html` always loads. Unsolved, it renders a passphrase prompt with an `ACCESS DENIED [n]` counter on wrong guesses and a hint every third failure. Guesses echo masked, are never added to command history, and are checked by `POST /api/unlock` (a `verifying...` line shows while it answers). Correct entry returns a signed `HttpOnly` cookie, after which `lock.js` imports `shell.js` and hands over the terminal. On later visits `GET /api/session` reports the cookie and the shell opens with `session restored`. A visitor who guesses the URL without solving anything gets a terminal that hints at the trail rather than a 404; requesting `/shell.js` or `/shell/*` directly without the cookie gets a 404.

### Server half

Added 2026-10-01 because every byte of the original design shipped to the browser: the passphrase sat in `hunt/trail.js`, `localStorage` `unlocked: true` opened the shell, and the repo is public.

- **Secrets.** `HUNT_FRAGMENTS` (JSON, the three secret fragment texts) and `HUNT_SECRET` (32+ chars, signs the cookie) are Vercel env vars. `lib/hunt.js` assembles the passphrase in trail order from those plus the two public fragments. Missing or malformed env makes the API answer 503 and the gate fail closed.
- **Unlock.** `/api/unlock` normalises like the old check (trim, lowercase), compares SHA-256 digests with `timingSafeEqual`, and on success sets `egt_root=<payload>.<HMAC>; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=30 days`. Wrong answers wait 500 ms before the 401.
- **Gate.** `middleware.js` runs only on `/shell.js`, `/shell/*`, and build files (`/node_modules/*`, `package*.json`, which always 404). No cookie, a forged cookie, or an expired one gets a plain 404.
- **No build step.** `package.json` has no `build` script, so Vercel still serves the project root as static files; its only dependency is `@vercel/functions` for the middleware's `next()`.

### URL

The live site does not use clean URLs: `/about` returns 404 and `/about.html` returns 200. `vercel.json` adds a single rewrite from `/root` to `/root.html` so the payoff is linkable.

Enabling `cleanUrls` site-wide would be wrong. It changes every pathname to its extensionless form, and `updateActiveNav()` in `script.js` compares `location.pathname` against `about.html` — it would break nav highlighting in a file this design does not modify.

### Virtual filesystem

A nested object literal mapping paths to contents — **data, not code**. Holds real material (resume highlights, public links, project notes) and flavor files (`notes.txt`, `.secret`). Adding files later means editing the object; the REPL is untouched. It contains nothing the public site does not already show.

### Commands

`help`, `ls` (`-a`, `-l`), `cat`, `cd`, `pwd`, `whoami`, `clear`, `history`, `!!`, `exit`, plus hidden joke handlers for `sudo` and `rm -rf /`. `shell/commands.js` adds `tree`, `head`, `tail`, `wc`, `grep` (`-i`, `-r`), `find` (`-name`), `echo`, `uname`, `date`, `uptime`, `hostname`, `id`, `neofetch`, `man`, `open <page>`, `resume`, `contact`, `fortune`, `cowsay`, `hiscore`, and hidden jokes for editors (`vim`, `nano`, `emacs`), the network (`ping`, `ssh`, `curl`, `wget`), and `hack`. `matrix` is a second takeover beside `snake`. Arrow keys walk history. **Tab completion is included** despite being an obvious cut — it is the single detail separating "fake terminal" from "terminal." Pipes, redirection, and a real parser are all cut. Double and single quotes group arguments; nothing else is interpreted.

Errors stay in character:

```
bash: foo: command not found
cat: notes: Is a directory
```

All output renders through `textContent`. The shell echoes whatever the visitor types, so `innerHTML` would be an injection hole.

### Command registry

Commands are registry entries: a name mapped to `{ desc, usage?, hidden?, run(args, ctx) }`, where `run` returns `{ out: string[], clear?, exit?, takeover?, navigate?, download? }`. `usage` feeds `man`; `navigate` and `download` are URLs `shell.js` acts on. A `takeover` is a function handed a host — `draw(text)`, `onKey(handler)`, `finish(lines)` — that owns the screen until it calls `finish`. That is how games work. Adding a second game means one registry entry plus its own file, with the REPL unchanged. This interface is the entire justification for choosing a shell over a standalone game, so it must genuinely hold.

### Snake

Registered as the `snake` command. Rendered as a **character grid inside a `<pre>`, not canvas** — it inherits Fira Code and the green-on-dark palette for free, needs no retina or resize handling, and a canvas element would read as a foreign object dropped into a terminal. Arrow keys or WASD, `q` or Escape to quit, live score, high score persisted to `localStorage`. Game over returns to the prompt.

The game ticks on `setInterval`, not `requestAnimationFrame`. The page swap in `script.js` depends on GSAP and therefore on `requestAnimationFrame`, which never fires in a pane that is not compositing; Snake should not share that fragility.

### Navigation

`root.html` has **no nav at all**. It is a terminal; `exit` leaves via a normal full page load to `index.html`. This keeps it in character and sidesteps the nav-consistency rule — there is no sixth nav entry to keep synchronized across files.

## Failure modes

| Mode | Handling |
|---|---|
| `localStorage` disabled or throwing | All access wrapped; in-memory fallback |
| Corrupt stored JSON | `try/catch` parse, reset to empty |
| Two stores on one page | Read-through on every access, so neither overwrites the other |
| Keystroke triggers firing while typing | All keyboard triggers ignore events targeting `input`, `textarea`, `select`, or contenteditable. **Most likely real bug in the feature** — without this, typing into the contact form can fire the Konami listener. It also keeps shell typing and Snake from feeding the Konami buffer, since the shell input keeps focus throughout |
| Storage cleared mid-hunt | Passphrase still works if recorded; fragments are re-findable |
| Tampered state | Accepted. Unknown IDs are ignored when counting. Not access control: the cookie is |
| API unreachable or env missing | Lock screen prints `connection refused. try again.`; the gate fails closed (404); `hunt()` logs `signal lost` for secret fragments |
| Mobile | Triggers never fire, `hunt()` is not defined, indicator never appears, `/root` shows a plain desktop-only message |
| Vercel does not serve a new file | Verified on a preview deployment before merge; see Testing |

## Testing

No toolchain is added. Logic lives in pure modules covered by a small dependency-free harness that runs two ways from one set of test files:

- `node tests/run.mjs` — exits non-zero on failure; the command every implementation step uses
- `tests.html` — the same tests in a browser

Unit-tested:

- Progress state parsing, serialization, the corrupt-input path, and storage fallbacks
- Passphrase validation, fragment claiming, hints, the Konami buffer, triple-click timing, the typing guard, and touch detection
- VFS path resolution (including `..`, `~`, trailing and duplicate slashes, missing paths)
- Command tokenizing, every builtin, the registry, and tab completion
- Snake movement, turning, eating, wall and self collision, the full-board ending, rendering, and the controller's quit and high-score paths

The event and DOM layer gets a written manual checklist in `tests/MANUAL.md` covering each trigger, the toast, the indicator, the unlock flow, the shell, and behavior across an SPA navigation.

**Deployment check.** The live site returns 404 for `README.md` even though it is committed to `main`, so this Vercel project does not serve every file, and the cause is not visible from the repo. Before merging, the preview deployment must confirm that `/root`, `/robots.txt`, and `/sys_dump.txt` return 200. The hunt cannot be completed without them.

## Out of scope, deliberately

Sound effects, achievements, a leaderboard, an overlay summon for the shell from other pages, and server-side progress tracking. The overlay summon is the most plausible future addition and the registry does not preclude it.

## Known interaction

`script.js` logs six debug lines on every page load, including the EmailJS public key. The console banner will land in that noise. Cleaning it up is correct but modifies `script.js`, which this design deliberately avoids — it belongs in a separate commit.

## Revisions

Found while planning on 2026-09-10, checked against the live site and the code:

1. **`/root` would have returned 404.** Added `vercel.json` with a single rewrite. Chose that over `cleanUrls`, which would break `updateActiveNav()` in `script.js`.
2. **Fragment 1 contradicted the indicator rule.** The original said loading any page hands over fragment 1. That would show `[1/5]` to every visitor, contradicting "indicator appears only after the first find." Fragment 1 is now logged by calling `hunt()`.
3. **Fragments 3 and 5 were undetectable.** Reading a comment or a text file fires no event, so the promised toast and progress update could never happen. Both breadcrumbs now say to run `hunt("<text>")`.
4. **The trail had no hints between steps.** The original request was for hints hidden around the site; the table listed triggers but nothing led from one to the next. `hunt()` now prints the next lead.
5. **ES modules instead of classic `defer` scripts, with logic split into `hunt/` and `shell/`.** Required for the "runs unchanged under Node" claim to be true, and it gives the test runner a single command.
6. **Stores read through to storage.** Two stores coexist on `/root`; a load-time cache would have let one silently overwrite the other.
7. **Line reference corrected.** The clone-node workaround is at `script.js:131`, not `:169`.
8. **Added a preview-deployment check.** The live site does not serve `README.md`, so file serving cannot be assumed.

Revised 2026-10-01:

9. **The answer moved server-side.** The passphrase, the unlock flag, and the shell's code were all readable or forgeable from the browser, and this file (served publicly) listed every answer. Added the Server half above, rotated every fragment, and added `.vercelignore` so `docs/`, `tests/`, `tests.html`, and `README.md` are not deployed. The pre-rotation answers in git history no longer work.
10. **More shell commands.** Added `shell/commands.js` and `shell/matrix.js`; see Commands.
