# Easter Egg Hunt and Hidden Shell — Design

**Date:** 2026-08-27
**Status:** Approved for planning
**Repo:** `personal-website` (static site, no build step)

## Goal

Make the site rewarding to poke at. A five-fragment scavenger hunt hidden across the existing pages assembles into a passphrase that unlocks `/root`, an interactive fake shell containing a playable Snake.

Success means a curious visitor discovers a hunt exists without being told, and a persistent one reaches a payoff worth the effort — a linkable URL that can be shown deliberately, not just stumbled into.

## Non-goals

- **This is not access control.** Anyone can read `eggs.js` and skip the hunt. Obfuscation would buy nothing.
- **No mobile parity.** Triggers are keyboard and mouse driven. On touch devices nothing fires and nothing teases.
- **No build step, no dependencies.** The project is vanilla HTML/CSS/JS and stays that way.
- **No second game.** The command registry makes one cheap to add later; this spec ships one.

## Architecture

**No existing JavaScript is modified.** New files:

```
eggs.js       Trail manifest, trigger engine, progress state    all 6 pages
shell.js      REPL, virtual filesystem, command registry, Snake  root.html only
root.html     Hidden destination, absent from nav                —
robots.txt    Carries the fragment 5 breadcrumb                  —
sys_dump.txt  The file that breadcrumb points to                 —
tests.html    Dependency-free unit test harness                  —
```

Existing files that change:

- **All five current pages** gain one `<script src="eggs.js" defer></script>` tag.
- **`about.html`** gains the fragment 3 HTML comment.
- **`style.css`** gains rules for the toast, the progress indicator, and the shell.

Removing the script tags returns the site to its current behavior exactly; the feature is additive and independently removable.

### Document-level delegation

`script.js` swaps only `<main>`'s innerHTML during navigation and re-runs `initPageScripts()`. Any listener bound to an element inside `<main>` dies on swap, and any init hook that re-binds creates duplicates — this is precisely why the contact form needs the clone-node workaround at `script.js:169`.

`eggs.js` therefore binds **every listener once, to `document`**, and matches targets by selector at event time. `document` survives the swap. There is nothing to re-register and no duplicate-firing bug class, and `script.js` needs no integration hook.

### State

One `localStorage` key, `egt.eggs`:

```json
{ "found": ["console", "cursor", "comment"], "unlocked": false, "snakeHigh": 42 }
```

All reads and writes wrapped in `try/catch`, falling back to an in-memory object. A disabled or throwing `localStorage` must never break the page. Corrupt JSON resets to empty rather than throwing on load.

## The trail

Five fragments concatenate, in order, to `kernel_panic_at_0x00`.

| # | ID | Location | Trigger | Fragment |
|---|----|----------|---------|----------|
| 1 | `console` | Any page | ASCII banner logged on load, hands the fragment over outright | `kern` |
| 2 | `cursor` | `/home` | Click the blinking `.cursor` span three times | `el_pa` |
| 3 | `comment` | `/about` | HTML comment visible only in view-source | `nic_` |
| 4 | `konami` | Any page | Konami code | `at_` |
| 5 | `robots` | `robots.txt` | A `# Disallow: /sys_dump.txt` comment; that file exists and holds the fragment | `0x00` |

Two deliberate choices here. The file uses a normal path rather than a dotfile — Vercel's static handling of dotfiles is not worth depending on for a puzzle step. And its name is unrelated to the fragment it contains, so reading `robots.txt` reveals only where to look, not the answer.

### Why fragments rather than a completion flag

The pieces form a passphrase the user types at `/root`. `localStorage` only records which fragments have been *found* — a convenience, never the key. Clearing storage does not destroy the payoff for anyone who wrote the phrase down, and a solver can hand the passphrase to someone else, which is how this kind of thing spreads.

### Feedback and the progress indicator

Each find shows a brief glitch toast: `FRAGMENT 3/5 ACQUIRED :: "nic_"`, styled from the existing overlay vocabulary rather than new visual language.

The progress counter `[3/5]` appears in the brand line **only after the first fragment is found**. Before that the site looks exactly as it does today. This is what makes the difficulty curve work: the trail advertises itself only to people who have already demonstrated they are looking.

Fragment 1 is free deliberately. It teaches the mechanic and guarantees that anyone who opens devtools learns a hunt exists, giving the remaining four a reason to be hunted.

## The shell

### Locked state

`root.html` always loads. Unsolved, it renders a passphrase prompt with an `ACCESS DENIED` counter on wrong guesses. Correct entry unlocks, persists `unlocked: true`, and reveals the shell. A visitor who guesses the URL without solving anything gets a terminal that hints at the trail rather than a 404.

### Virtual filesystem

A nested object literal mapping paths to contents — **data, not code**. Holds real material (resume bullets, contact details, project notes) and flavor files (`notes.txt`, `.secret`). Adding files later means editing the object; the REPL is untouched.

### Commands

`help`, `ls`, `cat`, `cd`, `pwd`, `whoami`, `clear`, `history`, `exit`, plus joke handlers for `sudo` and `rm -rf /`. Arrow keys walk history. **Tab completion is included** despite being an obvious cut — it is roughly fifteen lines and is the single detail separating "fake terminal" from "terminal." Pipes, redirection, and a real parser are all cut.

Errors stay in character:

```
bash: foo: command not found
cat: notes: Is a directory
```

### Command registry

Commands are registry entries: a name mapped to a handler receiving argv and returning output lines. A handler may take over the screen until it exits, which is how games work. Adding a second game means one registry entry plus its own file, with the REPL unchanged. This interface is the entire justification for choosing a shell over a standalone game, so it must genuinely hold.

### Snake

Registered as the `snake` command. Rendered as a **character grid inside a `<pre>`, not canvas** — it inherits Fira Code and the green-on-dark palette for free, needs no retina or resize handling, and a canvas element would read as a foreign object dropped into a terminal. Arrow keys, live score, high score persisted to `localStorage`. Game over returns to the prompt.

### Navigation

`root.html` has **no nav at all**. It is a terminal; `exit` leaves via a normal full page load to `index.html`. This keeps it in character and sidesteps the nav-consistency rule — there is no sixth nav entry to keep synchronized across files.

## Failure modes

| Mode | Handling |
|---|---|
| `localStorage` disabled or throwing | All access wrapped; in-memory fallback |
| Corrupt stored JSON | `try/catch` parse, reset to empty |
| Keystroke triggers firing while typing | All keyboard triggers ignore events targeting `input`, `textarea`, or contenteditable. **Most likely real bug in the feature** — without this, typing into the contact form can fire the Konami listener |
| Storage cleared mid-hunt | Passphrase still works if recorded; fragments are re-findable |
| Tampered state | Accepted. Not access control |
| Mobile | Triggers never fire, indicator never appears, `/root` shows a plain desktop-only message |

## Testing

No toolchain is added. Logic worth testing is kept **pure** and covered by a dependency-free `tests.html` that runs assertions in the browser and prints pass/fail — roughly forty lines of harness, matching how the project already works. If a build step ever arrives, the same pure functions move to `node --test` unchanged.

Unit-tested pure functions:

- Passphrase validation
- VFS path resolution (including `..`, trailing slashes, missing paths)
- Command tokenizing
- Snake step function — grid state in, grid state out
- Progress state serialization, including the corrupt-input path

The event and DOM layer gets a written manual checklist covering each trigger, the toast, the indicator, unlock flow, and behavior across an SPA navigation.

## Out of scope, deliberately

Sound effects, achievements, a leaderboard, additional games, an overlay summon for the shell from other pages, and server-side anything. The overlay summon is the most plausible future addition and the registry does not preclude it.

## Known interaction

`script.js` logs six debug lines on every page load, including the EmailJS public key. The console banner will land in that noise. Cleaning it up is correct but modifies `script.js`, which this design deliberately avoids — it belongs in a separate commit.
