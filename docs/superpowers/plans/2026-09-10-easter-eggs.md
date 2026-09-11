# Easter Egg Hunt and Hidden Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide a five-fragment scavenger hunt across the portfolio site whose passphrase unlocks `/root`, an interactive fake shell with tab completion and a playable Snake.

**Architecture:** Pure logic lives in ES modules under `hunt/` and `shell/`, unit-tested by a zero-dependency harness that runs under both Node and a browser. Two thin DOM entry points wire that logic to pages: `eggs.js` (every page, binding all listeners once to `document` so `script.js`'s `<main>` swap never affects them) and `shell.js` (`root.html` only). No existing JavaScript changes.

**Tech Stack:** Vanilla HTML/CSS/JS, native ES modules, Node 22 (test runner only, no packages), Python `http.server` (local serving), Vercel (hosting, one rewrite).

**Spec:** `docs/superpowers/specs/2026-08-27-easter-eggs-design.md`

## Global Constraints

- No build step, no dependencies, no `package.json`. Vanilla HTML/CSS/JS.
- Do not modify `script.js`, `config.js`, or `config.ex.js`.
- New JavaScript is ES modules; pages load it with `<script type="module" src="...">`.
- `localStorage` key `egt.eggs`, shape `{ "found": [...], "unlocked": false, "snakeHigh": 0 }`. Every access wrapped in `try/catch` with an in-memory fallback.
- Passphrase `kernel_panic_at_0x00`, assembled in order from fragments `kern` (id `console`), `el_pa` (`cursor`), `nic_` (`comment`), `at_` (`konami`), `0x00` (`robots`).
- Every listener in `eggs.js` binds once, to `document`.
- Keyboard triggers ignore events targeting `input`, `textarea`, `select`, or contenteditable.
- Touch-only devices: no triggers, no `hunt()`, no indicator. `/root` shows `/root needs a keyboard. come back on a desktop.`
- The `[n/5]` indicator appears in `.brand` only after the first fragment is logged.
- Toast text: `FRAGMENT n/5 ACQUIRED :: "text"`.
- Hints name pages, never extensionless URLs — `/about` returns 404 on the live site.
- Shell errors stay in character: `bash: foo: command not found`, `cat: notes: Is a directory`.
- All shell output renders through `textContent`, never `innerHTML`.
- Snake renders as a character grid in a `<pre>` and ticks on `setInterval`.
- `root.html` has no nav. `exit` does a full page load of `index.html`.
- `/root` resolves through a single `vercel.json` rewrite. Do not enable `cleanUrls`.
- `node tests/run.mjs` exits 0 before every commit.
- Commit messages end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Working Notes

- **Branch:** `easter-eggs`, already created off `main` with the spec committed. It has no upstream yet; never run a bare `git push` until Task 8 sets one.
- **Shell:** commands below are POSIX (Git Bash on Windows). Git prints `LF will be replaced by CRLF` warnings on Windows; they are harmless.
- **Test command:** `node tests/run.mjs` from the repo root. A missing module fails the *whole* run with `ERR_MODULE_NOT_FOUND` — that is the expected red state when a task's test file lands before its implementation.
- **Serving:** `python -m http.server 8765` from the repo root. Module scripts refuse to load from `file://`, and refuse a JavaScript file served as `text/plain`. On Windows, Python reads MIME types from the registry, where some machines map `.js` to `text/plain`; the development machine (Python 3.13.2) correctly maps it to `text/javascript`. If a browser reports a module served with the wrong MIME type, serve with `python -c "import http.server as h; h.SimpleHTTPRequestHandler.extensions_map['.js'] = 'text/javascript'; h.test(HandlerClass=h.SimpleHTTPRequestHandler, port=8765)"` instead.
- **Browser automation caveat:** the site's page-transition animation waits on `requestAnimationFrame`, which never fires in a browser pane that isn't visibly compositing. SPA-navigation checks in `tests/MANUAL.md` need a real, visible tab. Everything else, including Snake, runs on timers and can be driven headlessly.

## File Structure

```
tests/harness.js     test(), assert helpers, run(report)              Task 1
tests/all.js         imports every *.test.js                          Task 1, extended each task
tests/run.mjs        Node entry: runs all tests, exit code            Task 1
tests.html           browser entry: runs all tests, sets title        Task 1
hunt/state.js        progress store over localStorage                 Task 1
hunt/trail.js        fragments, passphrase, hints, trigger rules      Task 2
eggs.js              DOM wiring for the hunt                          Task 3
robots.txt           fragment 5 breadcrumb                            Task 3
sys_dump.txt         fragment 5                                       Task 3
tests/MANUAL.md      DOM-layer checklist                              Task 3, extended Task 7
shell/vfs.js         filesystem tree + path functions                 Task 4
shell/core.js        tokenizer, registry, builtins, completion        Task 5
shell/snake.js       Snake rules + takeover controller                Task 6
shell.js             DOM wiring for /root                             Task 7
root.html            the hidden page                                  Task 7
vercel.json          /root rewrite                                    Task 7
```

Modified: `index.html`, `about.html`, `experience.html`, `projects.html`, `contact.html`, `style.css` (Task 3, Task 7), `README.md` (Task 8).

---

### Task 1: Test harness and progress state

**Files:**
- Create: `tests/harness.js`, `tests/all.js`, `tests/run.mjs`, `tests.html`, `tests/state.test.js`, `hunt/state.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `tests/harness.js`: `test(name: string, fn: () => void | Promise<void>)`, `assert(condition, message?)`, `assertEqual(actual, expected, message?)` (uses `Object.is`), `assertDeepEqual(actual, expected, message?)` (compares `JSON.stringify` — key order matters), `run(report?: (line: string, kind: 'pass'|'fail') => void) => Promise<{ pass: number, fail: number }>`
  - `hunt/state.js`: `STORAGE_KEY = 'egt.eggs'`; `emptyState() => State`; `parseState(raw: unknown) => State`; `serializeState(state: State) => string`; `safeStorage() => Storage | null`; `createStore(storage: Storage-like | null) => { get(): State, update(fn: (State) => State): State }`
  - `State` is `{ found: string[], unlocked: boolean, snakeHigh: number }`, always with keys in that order.

- [ ] **Step 1: Create the harness and both runners**

`tests/harness.js`:

```js
// Dependency-free test harness. The same test files run in Node (tests/run.mjs) and a browser (tests.html).

const tests = []

export function test(name, fn) {
  tests.push({ name, fn })
}

export function assert(condition, message = 'assertion failed') {
  if (!condition) throw new Error(message)
}

export function assertEqual(actual, expected, message) {
  if (!Object.is(actual, expected)) {
    throw new Error(`${message ? message + ': ' : ''}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

// Compares JSON, so key order matters: build expected objects in the order the code under test does.
export function assertDeepEqual(actual, expected, message) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) throw new Error(`${message ? message + ': ' : ''}expected ${e}, got ${a}`)
}

export async function run(report = line => console.log(line)) {
  let pass = 0
  let fail = 0
  for (const t of tests) {
    try {
      await t.fn()
      pass++
      report(`PASS  ${t.name}`, 'pass')
    } catch (error) {
      fail++
      report(`FAIL  ${t.name}\n      ${error.message}`, 'fail')
    }
  }
  report(`\n${pass} passed, ${fail} failed`, fail ? 'fail' : 'pass')
  return { pass, fail }
}
```

`tests/all.js`:

```js
// Every test file, imported for its side effect of registering tests. Add new test files here.
import './state.test.js'
```

`tests/run.mjs`:

```js
// Node runner: `node tests/run.mjs` from the repo root. Exits 1 on any failure.
import { run } from './harness.js'
import './all.js'

const { fail } = await run()
process.exit(fail ? 1 : 0)
```

`tests.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="robots" content="noindex">
    <title>./tests</title>
    <style>
        body { background: #0d1117; color: #b3ffcc; font-family: "Fira Code", monospace; padding: 20px; }
        pre { margin: 0; white-space: pre-wrap; }
        .pass { color: #00ff41; }
        .fail { color: #ff3333; }
    </style>
</head>
<body>
    <div id="results"></div>
    <script type="module">
        import { run } from './tests/harness.js'
        import './tests/all.js'

        const results = document.getElementById('results')
        const { pass, fail } = await run((line, kind) => {
            const row = document.createElement('pre')
            row.className = kind
            row.textContent = line
            results.appendChild(row)
        })
        document.title = fail ? `FAIL (${fail})` : `PASS (${pass})`
        window.__testResults = { pass, fail }
    </script>
</body>
</html>
```

- [ ] **Step 2: Write the failing state tests**

`tests/state.test.js`:

```js
import { test, assertEqual, assertDeepEqual } from './harness.js'
import { STORAGE_KEY, createStore, emptyState, parseState, serializeState } from '../hunt/state.js'

function memoryStorage(initial = {}) {
  const data = { ...initial }
  return {
    getItem: key => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = String(value)
    },
    data,
  }
}

function throwingStorage() {
  return {
    getItem() {
      throw new Error('SecurityError')
    },
    setItem() {
      throw new Error('QuotaExceededError')
    },
  }
}

test('state: emptyState has no progress', () => {
  assertDeepEqual(emptyState(), { found: [], unlocked: false, snakeHigh: 0 })
})

test('state: parseState round-trips serializeState', () => {
  const state = { found: ['console', 'konami'], unlocked: true, snakeHigh: 12 }
  assertDeepEqual(parseState(serializeState(state)), state)
})

test('state: parseState resets null and non-string input', () => {
  assertDeepEqual(parseState(null), emptyState())
  assertDeepEqual(parseState(undefined), emptyState())
  assertDeepEqual(parseState(42), emptyState())
})

test('state: parseState resets corrupt JSON', () => {
  assertDeepEqual(parseState('{not json'), emptyState())
})

test('state: parseState resets JSON that is not an object', () => {
  assertDeepEqual(parseState('[1,2,3]'), emptyState())
  assertDeepEqual(parseState('"hello"'), emptyState())
  assertDeepEqual(parseState('null'), emptyState())
})

test('state: parseState sanitizes wrong field types', () => {
  const raw = JSON.stringify({ found: ['console', 7, 'console', null, 'cursor'], unlocked: 'yes', snakeHigh: -3 })
  assertDeepEqual(parseState(raw), { found: ['console', 'cursor'], unlocked: false, snakeHigh: 0 })
})

test('state: parseState rejects a fractional high score', () => {
  assertEqual(parseState(JSON.stringify({ snakeHigh: 4.5 })).snakeHigh, 0)
})

test('state: createStore loads what storage holds', () => {
  const stored = serializeState({ found: ['konami'], unlocked: false, snakeHigh: 3 })
  const store = createStore(memoryStorage({ [STORAGE_KEY]: stored }))
  assertDeepEqual(store.get(), { found: ['konami'], unlocked: false, snakeHigh: 3 })
})

test('state: createStore update persists to storage', () => {
  const storage = memoryStorage()
  createStore(storage).update(state => ({ ...state, unlocked: true }))
  assertDeepEqual(parseState(storage.data[STORAGE_KEY]), { found: [], unlocked: true, snakeHigh: 0 })
})

test('state: createStore with null storage works in memory', () => {
  const store = createStore(null)
  store.update(state => ({ ...state, snakeHigh: 9 }))
  assertEqual(store.get().snakeHigh, 9)
})

test('state: createStore survives storage that throws on read and write', () => {
  const store = createStore(throwingStorage())
  assertDeepEqual(store.get(), emptyState())
  assertDeepEqual(store.update(state => ({ ...state, found: ['console'] })).found, ['console'])
  assertDeepEqual(store.get().found, ['console'])
})

// /root loads eggs.js and shell.js, each with its own store. A load-time cache would let one
// silently overwrite the other's newer writes, so stores must read through on every access.
test("state: two stores on one storage see each other's writes", () => {
  const storage = memoryStorage()
  const eggs = createStore(storage)
  const shell = createStore(storage)
  eggs.update(state => ({ ...state, found: ['comment'] }))
  shell.update(state => ({ ...state, unlocked: true }))
  assertDeepEqual(eggs.get(), { found: ['comment'], unlocked: true, snakeHigh: 0 })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node tests/run.mjs`
Expected: FAIL — `Error [ERR_MODULE_NOT_FOUND]: Cannot find module` ending in `hunt/state.js`, exit code 1.

- [ ] **Step 4: Implement the store**

`hunt/state.js`:

```js
// Progress for the easter egg hunt, kept under one localStorage key. Never throws.

export const STORAGE_KEY = 'egt.eggs'

export function emptyState() {
  return { found: [], unlocked: false, snakeHigh: 0 }
}

export function parseState(raw) {
  if (typeof raw !== 'string') return emptyState()
  let data
  try {
    data = JSON.parse(raw)
  } catch {
    return emptyState()
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return emptyState()
  const found = Array.isArray(data.found) ? [...new Set(data.found.filter(id => typeof id === 'string'))] : []
  const unlocked = data.unlocked === true
  const snakeHigh = Number.isInteger(data.snakeHigh) && data.snakeHigh > 0 ? data.snakeHigh : 0
  return { found, unlocked, snakeHigh }
}

export function serializeState(state) {
  return JSON.stringify({ found: state.found, unlocked: state.unlocked, snakeHigh: state.snakeHigh })
}

// Returns localStorage if it is usable, else null. Private browsing and blocked site data both throw.
export function safeStorage() {
  try {
    const probe = '__egt_probe__'
    localStorage.setItem(probe, probe)
    localStorage.removeItem(probe)
    return localStorage
  } catch {
    return null
  }
}

// Reads through to storage on every access so several stores on one page stay consistent.
// If storage is missing or throws, the in-memory copy carries the session.
export function createStore(storage) {
  let memory = emptyState()

  function load() {
    if (storage) {
      try {
        const raw = storage.getItem(STORAGE_KEY)
        if (raw !== null) memory = parseState(raw)
      } catch {
        // Unreadable storage: keep the in-memory copy.
      }
    }
    return memory
  }

  return {
    get: load,
    update(fn) {
      memory = fn(load())
      if (storage) {
        try {
          storage.setItem(STORAGE_KEY, serializeState(memory))
        } catch {
          // Quota or privacy mode: the in-memory copy still holds.
        }
      }
      return memory
    },
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node tests/run.mjs`
Expected: every line `PASS`, ending `12 passed, 0 failed`, exit code 0.

- [ ] **Step 6: Confirm the browser runner agrees**

Run `python -m http.server 8765` from the repo root in the background, open `http://localhost:8765/tests.html`.
Expected: 12 green `PASS` lines, the tab title reads `PASS (12)`, and `window.__testResults` is `{ pass: 12, fail: 0 }`. Stop the server afterward.

- [ ] **Step 7: Commit**

```bash
git add tests/harness.js tests/all.js tests/run.mjs tests.html tests/state.test.js hunt/state.js
git commit -F - <<'EOF'
Add test harness and hunt progress store

A dependency-free harness whose test files run both under Node
(node tests/run.mjs) and in a browser (tests.html), plus the progress
store the easter egg hunt persists to localStorage.

The store reads through to storage on every access instead of caching
at load. /root will load two stores on one page, and a cached copy in
either would silently overwrite the other's newer writes.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Trail rules

**Files:**
- Create: `hunt/trail.js`, `tests/trail.test.js`
- Modify: `tests/all.js`

**Interfaces:**
- Consumes: `State` shape from Task 1; `emptyState()` from `hunt/state.js` (tests only).
- Produces, all from `hunt/trail.js`:
  - `FRAGMENTS: { id: string, text: string, hint: string }[]` in trail order; `PASSPHRASE = 'kernel_panic_at_0x00'`; `KONAMI: string[]` (lowercased `event.key` values)
  - `isPassphrase(input: unknown) => boolean`
  - `fragmentById(id: string) => Fragment | null`; `fragmentByText(text: unknown) => Fragment | null`
  - `countFound(state) => number` (ignores unknown ids); `markFound(state, id) => { state, isNew: boolean }` (pure; returns the same state object when nothing changes)
  - `progressLabel(state) => '[n/5]'`; `toastText(fragment, count) => string`; `statusLines(state) => string[]`; `nextHint(state) => string | null`; `bannerText() => string`
  - `pushKey(buffer: string[], key: string, sequence = KONAMI) => { buffer: string[], complete: boolean }`
  - `registerClick(times: number[], now: number, needed = 3, windowMs = 1500) => { times: number[], triggered: boolean }`
  - `shouldIgnoreKeyTarget(target) => boolean`; `isTouchOnly(matchMedia?: (query) => { matches }) => boolean`
  - `unlockAttempt(input: string, failures: number) => { ok: boolean, failures: number, lines: string[] }`

- [ ] **Step 1: Register the new test file**

Replace the contents of `tests/all.js` with:

```js
// Every test file, imported for its side effect of registering tests. Add new test files here.
import './state.test.js'
import './trail.test.js'
```

- [ ] **Step 2: Write the failing trail tests**

`tests/trail.test.js`:

```js
import { test, assert, assertEqual, assertDeepEqual } from './harness.js'
import { emptyState } from '../hunt/state.js'
import {
  FRAGMENTS,
  KONAMI,
  PASSPHRASE,
  bannerText,
  countFound,
  fragmentById,
  fragmentByText,
  isPassphrase,
  isTouchOnly,
  markFound,
  nextHint,
  progressLabel,
  pushKey,
  registerClick,
  shouldIgnoreKeyTarget,
  statusLines,
  toastText,
  unlockAttempt,
} from '../hunt/trail.js'

test('trail: five fragments assemble the passphrase', () => {
  assertEqual(FRAGMENTS.length, 5)
  assertDeepEqual(FRAGMENTS.map(f => f.id), ['console', 'cursor', 'comment', 'konami', 'robots'])
  assertEqual(PASSPHRASE, 'kernel_panic_at_0x00')
})

test('trail: isPassphrase ignores case and surrounding whitespace', () => {
  assert(isPassphrase('kernel_panic_at_0x00'))
  assert(isPassphrase('  KERNEL_PANIC_AT_0X00\n'))
})

test('trail: isPassphrase rejects near misses and non-strings', () => {
  assert(!isPassphrase('kernel_panic_at_0x0'))
  assert(!isPassphrase('kernel panic at 0x00'))
  assert(!isPassphrase(''))
  assert(!isPassphrase(null))
})

test('trail: fragmentByText matches whole fragment text only', () => {
  assertEqual(fragmentByText('nic_').id, 'comment')
  assertEqual(fragmentByText(' 0X00 ').id, 'robots')
  assertEqual(fragmentByText('nic'), null)
  assertEqual(fragmentByText(undefined), null)
})

test('trail: fragmentById returns null for unknown ids', () => {
  assertEqual(fragmentById('cursor').text, 'el_pa')
  assertEqual(fragmentById('nope'), null)
})

test('trail: every fragment has a hint, and no hint uses an extensionless page URL', () => {
  for (const fragment of FRAGMENTS) {
    assert(typeof fragment.hint === 'string' && fragment.hint.length > 0, `${fragment.id} has no hint`)
    assert(!/\/(home|about|projects|contact|experience)\b/.test(fragment.hint), `${fragment.id} hint names a URL`)
  }
})

test('trail: markFound adds a new fragment once', () => {
  const first = markFound(emptyState(), 'konami')
  assert(first.isNew)
  assertDeepEqual(first.state.found, ['konami'])
  const second = markFound(first.state, 'konami')
  assert(!second.isNew)
  assertEqual(second.state, first.state, 'a repeat find returns the same state object')
})

test('trail: markFound ignores unknown ids', () => {
  const result = markFound(emptyState(), 'bogus')
  assert(!result.isNew)
  assertDeepEqual(result.state.found, [])
})

test('trail: markFound does not mutate its input', () => {
  const state = emptyState()
  markFound(state, 'console')
  assertDeepEqual(state.found, [])
})

test('trail: countFound and progressLabel ignore unknown stored ids', () => {
  const state = { found: ['console', 'tampered', 'robots'], unlocked: false, snakeHigh: 0 }
  assertEqual(countFound(state), 2)
  assertEqual(progressLabel(state), '[2/5]')
})

test('trail: toastText formats the acquisition message', () => {
  assertEqual(toastText(fragmentById('comment'), 3), 'FRAGMENT 3/5 ACQUIRED :: "nic_"')
})

test('trail: statusLines masks unfound fragments in trail order', () => {
  const state = { found: ['konami'], unlocked: false, snakeHigh: 0 }
  assertDeepEqual(statusLines(state), ['  1. ????', '  2. ????', '  3. ????', '  4. at_', '  5. ????'])
})

test('trail: nextHint points at the first unfound fragment in trail order', () => {
  const state = { found: ['console', 'comment'], unlocked: false, snakeHigh: 0 }
  assertEqual(nextHint(state), fragmentById('cursor').hint)
})

test('trail: nextHint is null once everything is found', () => {
  const state = { found: FRAGMENTS.map(f => f.id), unlocked: false, snakeHigh: 0 }
  assertEqual(nextHint(state), null)
})

test('trail: bannerText lines share one width and mention hunt()', () => {
  const lines = bannerText().split('\n')
  assert(lines.every(line => line.length === lines[0].length), 'banner lines are ragged')
  assert(bannerText().includes('hunt()'))
})

const KONAMI_KEYS = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']

function feed(keys) {
  let buffer = []
  let completions = 0
  for (const key of keys) {
    const result = pushKey(buffer, key)
    buffer = result.buffer
    if (result.complete) completions++
  }
  return completions
}

test('trail: pushKey completes on the Konami code', () => {
  assertEqual(KONAMI.length, 10)
  assertEqual(feed(KONAMI_KEYS), 1)
})

test('trail: pushKey accepts uppercase B and A', () => {
  assertEqual(feed([...KONAMI_KEYS.slice(0, 8), 'B', 'A']), 1)
})

test('trail: pushKey ignores modifier keys so Shift+B still counts', () => {
  assertEqual(feed([...KONAMI_KEYS.slice(0, 8), 'Shift', 'B', 'Shift', 'A']), 1)
})

test('trail: pushKey completes after an extra leading ArrowUp', () => {
  assertEqual(feed(['ArrowUp', ...KONAMI_KEYS]), 1)
})

test('trail: pushKey completes after unrelated keys', () => {
  assertEqual(feed(['x', 'Enter', 'ArrowDown', ...KONAMI_KEYS]), 1)
})

test('trail: pushKey does not complete on a broken sequence', () => {
  assertEqual(feed(['ArrowUp', 'ArrowUp', 'ArrowDown', 'x', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']), 0)
})

test('trail: pushKey clears its buffer on completion', () => {
  let buffer = []
  let result = null
  for (const key of KONAMI_KEYS) {
    result = pushKey(buffer, key)
    buffer = result.buffer
  }
  assert(result.complete)
  assertDeepEqual(result.buffer, [])
})

test('trail: registerClick triggers on three clicks inside the window', () => {
  let result = registerClick([], 0)
  assert(!result.triggered)
  result = registerClick(result.times, 400)
  assert(!result.triggered)
  result = registerClick(result.times, 900)
  assert(result.triggered)
  assertDeepEqual(result.times, [])
})

test('trail: registerClick forgets clicks older than the window', () => {
  let result = registerClick([], 0)
  result = registerClick(result.times, 1000)
  result = registerClick(result.times, 2600)
  assert(!result.triggered, 'the click at 0 expired before the third click')
  assertDeepEqual(result.times, [2600])
})

test('trail: shouldIgnoreKeyTarget ignores typing surfaces', () => {
  assert(shouldIgnoreKeyTarget({ tagName: 'INPUT' }))
  assert(shouldIgnoreKeyTarget({ tagName: 'textarea' }))
  assert(shouldIgnoreKeyTarget({ tagName: 'SELECT' }))
  assert(shouldIgnoreKeyTarget({ tagName: 'DIV', isContentEditable: true }))
})

test('trail: shouldIgnoreKeyTarget allows ordinary targets', () => {
  assert(!shouldIgnoreKeyTarget({ tagName: 'BODY' }))
  assert(!shouldIgnoreKeyTarget({ tagName: 'A', isContentEditable: false }))
  assert(!shouldIgnoreKeyTarget({}), 'document has no tagName')
  assert(!shouldIgnoreKeyTarget(null))
})

function fakeMatchMedia(matching) {
  return query => ({ matches: matching.includes(query) })
}

test('trail: isTouchOnly is true for a coarse pointer with no fine pointer', () => {
  assert(isTouchOnly(fakeMatchMedia(['(pointer: coarse)'])))
})

test('trail: isTouchOnly is false for laptops, touchscreen laptops, and missing matchMedia', () => {
  assert(!isTouchOnly(fakeMatchMedia(['(pointer: fine)', '(any-pointer: fine)'])))
  assert(!isTouchOnly(fakeMatchMedia(['(pointer: coarse)', '(any-pointer: fine)'])))
  assert(!isTouchOnly(undefined))
})

test('trail: unlockAttempt grants access on the passphrase', () => {
  const result = unlockAttempt('kernel_panic_at_0x00', 2)
  assert(result.ok)
  assertEqual(result.failures, 2)
  assertEqual(result.lines[0], 'ACCESS GRANTED')
})

test('trail: unlockAttempt counts failures and hints on every third', () => {
  const first = unlockAttempt('guess', 0)
  assert(!first.ok)
  assertDeepEqual(first.lines, ['ACCESS DENIED [1]'])
  const third = unlockAttempt('guess', 2)
  assertEqual(third.failures, 3)
  assertEqual(third.lines.length, 2)
  assert(third.lines[1].startsWith('hint:'))
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node tests/run.mjs`
Expected: FAIL — `ERR_MODULE_NOT_FOUND` ending in `hunt/trail.js`, exit code 1.

- [ ] **Step 4: Implement the trail rules**

`hunt/trail.js`:

```js
// The hunt's rules: fragments, passphrase, hints, and the pure trigger logic eggs.js wires to the page.

// Trail order is passphrase order and difficulty order. Hints name pages, never URLs:
// the live site serves /about.html, not /about.
export const FRAGMENTS = [
  { id: 'console', text: 'kern', hint: 'type hunt() in the console.' },
  { id: 'cursor', text: 'el_pa', hint: 'the cursor on the home page keeps blinking at you. knock three times.' },
  { id: 'comment', text: 'nic_', hint: 'some pages say more than they render. read the source of the about page.' },
  { id: 'konami', text: 'at_', hint: 'an old cheat code still works here. up, up...' },
  { id: 'robots', text: '0x00', hint: 'even robots are told where not to look. find out what they were told.' },
]

export const PASSPHRASE = FRAGMENTS.map(f => f.text).join('')

export const KONAMI = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a']

const MODIFIER_KEYS = new Set(['shift', 'control', 'alt', 'meta', 'capslock'])

export function isPassphrase(input) {
  return typeof input === 'string' && input.trim().toLowerCase() === PASSPHRASE
}

export function fragmentById(id) {
  return FRAGMENTS.find(f => f.id === id) || null
}

export function fragmentByText(text) {
  if (typeof text !== 'string') return null
  const wanted = text.trim().toLowerCase()
  return FRAGMENTS.find(f => f.text === wanted) || null
}

export function countFound(state) {
  return FRAGMENTS.filter(f => state.found.includes(f.id)).length
}

export function markFound(state, id) {
  if (!fragmentById(id) || state.found.includes(id)) return { state, isNew: false }
  return { state: { ...state, found: [...state.found, id] }, isNew: true }
}

export function progressLabel(state) {
  return `[${countFound(state)}/${FRAGMENTS.length}]`
}

export function toastText(fragment, count) {
  return `FRAGMENT ${count}/${FRAGMENTS.length} ACQUIRED :: "${fragment.text}"`
}

export function statusLines(state) {
  return FRAGMENTS.map((f, i) => `  ${i + 1}. ${state.found.includes(f.id) ? f.text : '????'}`)
}

export function nextHint(state) {
  const missing = FRAGMENTS.find(f => !state.found.includes(f.id))
  return missing ? missing.hint : null
}

export function bannerText() {
  const lines = ['SYSTEM NOTICE', '', '5 fragments are hidden in this system.', 'type hunt() to recover the first.']
  const width = Math.max(...lines.map(line => line.length)) + 4
  const border = `+${'-'.repeat(width)}+`
  return [border, ...lines.map(line => `|  ${line.padEnd(width - 2)}|`), border].join('\n')
}

// A rolling window of the last N keys. Simpler than a matcher that tracks partial progress,
// and correct for sequences like up-up-up-down that trip naive matchers.
export function pushKey(buffer, key, sequence = KONAMI) {
  const normalized = typeof key === 'string' ? key.toLowerCase() : ''
  if (MODIFIER_KEYS.has(normalized)) return { buffer, complete: false }
  const next = [...buffer, normalized].slice(-sequence.length)
  const complete = next.length === sequence.length && next.every((k, i) => k === sequence[i])
  return { buffer: complete ? [] : next, complete }
}

export function registerClick(times, now, needed = 3, windowMs = 1500) {
  const recent = [...times, now].filter(t => now - t <= windowMs)
  if (recent.length >= needed) return { times: [], triggered: true }
  return { times: recent, triggered: false }
}

export function shouldIgnoreKeyTarget(target) {
  if (!target) return false
  if (target.isContentEditable) return true
  const tag = typeof target.tagName === 'string' ? target.tagName.toUpperCase() : ''
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

// True only when the primary pointer is coarse and no fine pointer exists at all,
// so touchscreen laptops still count as desktops.
export function isTouchOnly(matchMedia) {
  if (typeof matchMedia !== 'function') return false
  return matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches
}

export function unlockAttempt(input, failures) {
  if (isPassphrase(input)) {
    return { ok: true, failures, lines: ['ACCESS GRANTED', 'welcome, visitor. type `help` to look around.'] }
  }
  const next = failures + 1
  const lines = [`ACCESS DENIED [${next}]`]
  if (next % 3 === 0) lines.push('hint: 5 fragments are hidden across the site. the console is a good place to start.')
  return { ok: false, failures: next, lines }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node tests/run.mjs`
Expected: ends `42 passed, 0 failed`, exit code 0.

- [ ] **Step 6: Commit**

```bash
git add hunt/trail.js tests/trail.test.js tests/all.js
git commit -F - <<'EOF'
Add easter egg trail rules

Fragments, passphrase, hint chain, and the pure trigger logic: Konami
key buffer, triple-click timing, the typing guard, and touch detection.

The Konami matcher keeps a rolling window of the last ten keys rather
than tracking partial progress, which is simpler and handles sequences
like up-up-up-down that naive matchers reject. Modifier keys are
skipped so Shift+B still counts.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Wire the trail into the site

**Files:**
- Create: `eggs.js`, `robots.txt`, `sys_dump.txt`, `tests/MANUAL.md`
- Modify: `index.html:15`, `about.html:15`, `about.html:44-45`, `experience.html:15`, `projects.html:15`, `contact.html:24`, `style.css:388`

**Interfaces:**
- Consumes: `createStore`, `safeStorage` from `hunt/state.js`; `bannerText`, `countFound`, `fragmentById`, `fragmentByText`, `isTouchOnly`, `markFound`, `nextHint`, `progressLabel`, `pushKey`, `registerClick`, `shouldIgnoreKeyTarget`, `statusLines`, `toastText` from `hunt/trail.js`.
- Produces: `window.hunt(text?: string) => undefined` on non-touch devices; DOM classes `.egg-progress` (inside `.brand`) and `.egg-toast` / `#egg-toast` (on `body`), styled here. Nothing later imports `eggs.js`; Task 7 loads it on `root.html`.

This task is DOM wiring. Unit tests do not cover it; the checklist in `tests/MANUAL.md` does, and the existing suite must stay green.

- [ ] **Step 1: Create `eggs.js`**

```js
// Easter egg hunt: wires hunt/trail.js to the page.
// Every listener binds once to document. script.js swaps <main> on navigation and document survives
// that swap, so nothing here ever needs re-binding and nothing can fire twice.

import { createStore, safeStorage } from './hunt/state.js'
import {
  bannerText,
  countFound,
  fragmentById,
  fragmentByText,
  isTouchOnly,
  markFound,
  nextHint,
  progressLabel,
  pushKey,
  registerClick,
  shouldIgnoreKeyTarget,
  statusLines,
  toastText,
} from './hunt/trail.js'

const STYLE = 'color:#00ff41;font-family:monospace'
const store = createStore(safeStorage())
let toastTimer = null

if (!isTouchOnly(window.matchMedia ? query => window.matchMedia(query) : undefined)) {
  start()
}

function start() {
  console.log(`%c${bannerText()}`, STYLE)
  window.hunt = hunt
  renderIndicator()

  let keyBuffer = []
  document.addEventListener('keydown', event => {
    if (shouldIgnoreKeyTarget(event.target)) return
    const result = pushKey(keyBuffer, event.key)
    keyBuffer = result.buffer
    if (result.complete) claim('konami')
  })

  let cursorClicks = []
  document.addEventListener('click', event => {
    if (typeof event.target.closest !== 'function' || !event.target.closest('.cursor')) return
    const result = registerClick(cursorClicks, Date.now())
    cursorClicks = result.times
    if (result.triggered) claim('cursor')
  })
}

function claim(id) {
  if (!markFound(store.get(), id).isNew) return false
  const state = store.update(current => markFound(current, id).state)
  showToast(toastText(fragmentById(id), countFound(state)))
  renderIndicator()
  return true
}

// Calling hunt() at all proves the console was found, so every call claims fragment 1 first.
function hunt(text) {
  claim('console')
  if (text !== undefined) {
    const fragment = fragmentByText(text)
    if (!fragment) {
      console.log('%c> unknown fragment. keep digging.', STYLE)
      return
    }
    claim(fragment.id)
  }
  const state = store.get()
  const hint = nextHint(state)
  const report = [`> ${progressLabel(state)} fragments recovered`, ...statusLines(state)]
  report.push(hint ? `> next lead: ${hint}` : '> all fragments recovered. assemble them in order and visit /root.')
  console.log(`%c${report.join('\n')}`, STYLE)
}

// The brand line sits in the header, outside <main>, so the badge survives SPA navigation.
function renderIndicator() {
  const state = store.get()
  const visible = countFound(state) > 0
  document.querySelectorAll('.brand').forEach(brand => {
    let badge = brand.querySelector('.egg-progress')
    if (!visible) {
      if (badge) badge.remove()
      return
    }
    if (!badge) {
      badge = document.createElement('span')
      badge.className = 'egg-progress'
      brand.appendChild(badge)
    }
    badge.textContent = ` ${progressLabel(state)}`
  })
}

function showToast(message) {
  let toast = document.getElementById('egg-toast')
  if (!toast) {
    toast = document.createElement('div')
    toast.id = 'egg-toast'
    toast.className = 'egg-toast'
    toast.setAttribute('role', 'status')
    document.body.appendChild(toast)
  }
  toast.textContent = message
  toast.classList.remove('show')
  void toast.offsetWidth // Force a reflow so back-to-back finds replay the glitch animation.
  toast.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3500)
}
```

- [ ] **Step 2: Load `eggs.js` on every page**

In each of `index.html`, `about.html`, `experience.html`, and `projects.html` (line 15) and `contact.html` (line 24), find:

```html
    <script src="script.js" defer></script>
```

and add one line directly after it, so it reads:

```html
    <script src="script.js" defer></script>
    <script type="module" src="eggs.js"></script>
```

Verify all five got it:

Run: `grep -c 'src="eggs.js"' index.html about.html experience.html projects.html contact.html`
Expected: each file reports `1`.

- [ ] **Step 3: Add the fragment 3 comment to `about.html`**

Find (around line 44):

```html
                <div class="content-block">
                    <p>> IDENTITY CONFIRMED.</p>
```

and change it to:

```html
                <div class="content-block">
                    <!--
                        [recovered fragment] nic_
                        log it from the console: hunt("nic_")
                    -->
                    <p>> IDENTITY CONFIRMED.</p>
```

- [ ] **Step 4: Create the fragment 5 breadcrumb files**

`robots.txt`:

```
# egt.agency
# Nothing to see here. Automated agents, please move along.

User-agent: *
Allow: /

# Disallow: /sys_dump.txt
```

`sys_dump.txt`:

```
[    0.000000] kernel: panic recovery mode engaged
[    0.000113] kernel: dumping recovered memory
[    0.000187] kernel: recovered fragment :: 0x00
[    0.000201] kernel: log it from the console on any page: hunt("0x00")
[    0.000240] kernel: fragments assemble in trail order. the result opens /root.
[    0.000305] kernel: end of dump
```

- [ ] **Step 5: Style the toast and indicator**

In `style.css`, find the line `@media (max-width: 768px) {` (line 388) and insert this block directly above it:

```css
/* Easter Egg Hunt */
.egg-progress {
  color: var(--term-dim);
  font-weight: 400;
  letter-spacing: 0;
}
.egg-toast {
  position: fixed;
  bottom: 30px;
  right: 30px;
  z-index: 9600;
  padding: 12px 18px;
  background: var(--bg-color);
  border: 1px solid var(--term-green);
  box-shadow: 0 0 15px var(--term-dim);
  color: var(--term-green);
  font-family: var(--font-stack);
  font-size: 0.9rem;
  opacity: 0;
  pointer-events: none;
  transform: translateY(10px);
  transition: opacity 0.3s, transform 0.3s;
}
.egg-toast.show {
  opacity: 1;
  transform: translateY(0);
  animation: egg-glitch 0.4s steps(2) 2;
}
@keyframes egg-glitch {
  0% {
    text-shadow: 2px 0 var(--term-alert), -2px 0 var(--term-green);
  }
  50% {
    text-shadow: -2px 0 var(--term-alert), 2px 0 var(--term-green);
  }
  100% {
    text-shadow: none;
  }
}

```

`z-index: 9600` sits above the success overlay (9500) so a find is never hidden behind it.

- [ ] **Step 6: Write the manual checklist**

`tests/MANUAL.md`:

```markdown
# Manual checklist

The DOM layer has no automated tests. Walk this list before merging anything that touches `eggs.js`, `shell.js`, `root.html`, or the breadcrumbs.

Serve the repo root over HTTP first: `python -m http.server 8765`. Module scripts do not load from `file://`.

Reset between runs by clearing progress in the console: `localStorage.removeItem('egt.eggs')`, then reload.

## Hunt

- [ ] On a fresh load of any page, the console shows the `SYSTEM NOTICE` box telling you to type `hunt()`, and no errors other than the known `/_vercel/speed-insights/script.js` 404.
- [ ] Before anything is found, no `[n/5]` appears next to the brand line.
- [ ] `hunt()` prints `[1/5]`, the masked list with slot 1 filled, and a lead about the home page cursor. The brand line now shows `[1/5]`, and a toast reads `FRAGMENT 1/5 ACQUIRED :: "kern"`.
- [ ] Calling `hunt()` again prints progress without a second toast.
- [ ] On the home page, clicking the blinking cursor three times quickly logs `el_pa` with a toast. Three slow clicks, more than 1.5s apart, do nothing.
- [ ] Navigate away from home and back using the nav, not a reload. The cursor trigger still works, and fires one toast rather than two. *Needs a real, visible browser tab: the page swap waits on `requestAnimationFrame`.*
- [ ] After that navigation, the brand line still shows the counter.
- [ ] View source on the about page: the comment above `IDENTITY CONFIRMED` shows `nic_` and `hunt("nic_")`. Running it logs fragment 3.
- [ ] On any page with nothing focused, the Konami code (up up down down left right left right B A) logs `at_`. Holding Shift for B and A still works.
- [ ] Click into the contact form's name field and type the Konami code there. Nothing is logged.
- [ ] `/robots.txt` contains `# Disallow: /sys_dump.txt`. `/sys_dump.txt` shows `0x00` and `hunt("0x00")`. Running it logs fragment 5.
- [ ] With all five found, `hunt()` says all fragments are recovered and points at `/root`.
- [ ] `hunt("nope")` prints `unknown fragment` and changes nothing.
- [ ] In mobile/touch emulation, or on a phone, reload: no banner, `typeof hunt` is `"undefined"`, and three taps on the cursor log nothing. If devtools emulation does not flip `(pointer: coarse)`, confirm on a real phone.
- [ ] With site data blocked for the origin, every page still loads and `hunt()` still works for the session.
```

- [ ] **Step 7: Verify the existing suite is still green**

Run: `node tests/run.mjs`
Expected: ends `42 passed, 0 failed`, exit code 0.

- [ ] **Step 8: Walk the Hunt checklist**

Start `python -m http.server 8765` in the background and work through every item under `## Hunt` in `tests/MANUAL.md`. Headless equivalents for a browser-automation agent, run in the page console at `http://localhost:8765/index.html`:

```js
localStorage.removeItem('egt.eggs'); location.reload()
```

```js
// Before any find: expect null
document.querySelector('.egg-progress')
```

```js
hunt(); JSON.parse(localStorage.getItem('egt.eggs')).found   // expect ["console"]
```

```js
document.querySelector('.brand .egg-progress').textContent   // expect " [1/5]"
```

```js
for (let i = 0; i < 3; i++) document.querySelector('.cursor').click()
JSON.parse(localStorage.getItem('egt.eggs')).found            // expect ["console","cursor"]
```

```js
for (const key of ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'])
  document.dispatchEvent(new KeyboardEvent('keydown', { key }))
JSON.parse(localStorage.getItem('egt.eggs')).found            // expect [..., "konami"]
```

On `http://localhost:8765/contact.html`, after `localStorage.removeItem('egt.eggs')` and a reload:

```js
const field = document.getElementById('user_name')
for (const key of ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'])
  field.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
localStorage.getItem('egt.eggs')                              // expect null: nothing was logged
```

```js
await Promise.all(['about.html', 'robots.txt', 'sys_dump.txt'].map(p => fetch(p).then(r => r.text())))
  .then(([about, robots, dump]) => [about.includes('hunt("nic_")'), robots.includes('/sys_dump.txt'), dump.includes('hunt("0x00")')])
// expect [true, true, true]
```

Mark any item you could not exercise, such as the SPA-navigation and touch items, as needing a human rather than checking it off. Stop the server afterward.

- [ ] **Step 9: Commit**

```bash
git add eggs.js robots.txt sys_dump.txt tests/MANUAL.md index.html about.html experience.html projects.html contact.html style.css
git commit -F - <<'EOF'
Wire the easter egg trail into the site

eggs.js loads on every page as a module and binds each listener once to
document. script.js swaps <main> on navigation, and document survives
the swap, so the triggers never need re-binding and cannot fire twice.
script.js itself is untouched.

Fragments 3 and 5 live in an HTML comment and a text file. Reading
either fires no event, so both tell the reader to log the fragment with
hunt("<text>"), and every hunt() call prints the next lead.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Virtual filesystem

**Files:**
- Create: `shell/vfs.js`, `tests/vfs.test.js`
- Modify: `tests/all.js`

**Interfaces:**
- Consumes: nothing.
- Produces, all from `shell/vfs.js`:
  - Node shapes: `{ type: 'dir', children: { [name]: Node } }` and `{ type: 'file', content: string }`
  - `HOME = '/home/esteban'`; `TREE: DirNode`
  - `resolvePath(cwd: string, input: string, home = HOME) => string` — absolute, normalized; `~` and `~/` expand; `.`, `..`, empty, and repeated slashes collapse; `..` stops at `/`
  - `getNode(tree, absPath) => Node | null` — own properties only
  - `listDir(tree, absPath, { all = false } = {}) => { ok: true, names: string[] } | { ok: false, error: 'ENOENT' | 'ENOTDIR' }` — sorted, dotfiles hidden unless `all`, directories suffixed `/`
  - `readFile(tree, absPath) => { ok: true, content: string } | { ok: false, error: 'ENOENT' | 'EISDIR' }`
  - `displayPath(absPath, home = HOME) => string` — `~` for home and below

- [ ] **Step 1: Register the new test file**

Replace the contents of `tests/all.js` with:

```js
// Every test file, imported for its side effect of registering tests. Add new test files here.
import './state.test.js'
import './trail.test.js'
import './vfs.test.js'
```

- [ ] **Step 2: Write the failing VFS tests**

`tests/vfs.test.js`:

```js
import { test, assert, assertEqual, assertDeepEqual } from './harness.js'
import { HOME, TREE, displayPath, getNode, listDir, readFile, resolvePath } from '../shell/vfs.js'

const H = '/home/esteban'

const FIXTURE = {
  type: 'dir',
  children: {
    home: {
      type: 'dir',
      children: {
        esteban: {
          type: 'dir',
          children: {
            'notes.txt': { type: 'file', content: 'hello' },
            '.secret': { type: 'file', content: 'shh' },
            projects: { type: 'dir', children: { 'a.md': { type: 'file', content: '# a' } } },
          },
        },
      },
    },
  },
}

test('vfs: resolvePath joins relative paths onto cwd', () => {
  assertEqual(resolvePath(H, 'projects', H), '/home/esteban/projects')
})

test('vfs: resolvePath keeps absolute paths', () => {
  assertEqual(resolvePath(H, '/etc', H), '/etc')
})

test('vfs: resolvePath walks up with ..', () => {
  assertEqual(resolvePath('/home/esteban/projects', '..', H), H)
  assertEqual(resolvePath(H, '../..', H), '/')
})

test('vfs: resolvePath never climbs above root', () => {
  assertEqual(resolvePath('/', '../../..', H), '/')
})

test('vfs: resolvePath collapses repeated and trailing slashes', () => {
  assertEqual(resolvePath('/home', 'esteban//projects/', H), '/home/esteban/projects')
})

test('vfs: resolvePath skips . segments', () => {
  assertEqual(resolvePath(H, './projects/./a.md', H), '/home/esteban/projects/a.md')
})

test('vfs: resolvePath expands ~ and ~/ only', () => {
  assertEqual(resolvePath('/etc', '~', H), H)
  assertEqual(resolvePath('/etc', '~/notes.txt', H), '/home/esteban/notes.txt')
  assertEqual(resolvePath('/etc', '~x', H), '/etc/~x')
})

test('vfs: resolvePath of an empty string is cwd', () => {
  assertEqual(resolvePath(H, '', H), H)
})

test('vfs: getNode of / is the tree itself', () => {
  assertEqual(getNode(FIXTURE, '/'), FIXTURE)
})

test('vfs: getNode returns null for missing paths, paths through files, and prototype keys', () => {
  assertEqual(getNode(FIXTURE, '/nope'), null)
  assertEqual(getNode(FIXTURE, '/home/esteban/notes.txt/x'), null)
  assertEqual(getNode(FIXTURE, '/constructor'), null)
  assertEqual(getNode(FIXTURE, '/home/esteban/toString'), null)
})

test('vfs: listDir sorts, hides dotfiles, and marks directories', () => {
  assertDeepEqual(listDir(FIXTURE, H), { ok: true, names: ['notes.txt', 'projects/'] })
})

test('vfs: listDir shows dotfiles with all', () => {
  assertDeepEqual(listDir(FIXTURE, H, { all: true }), { ok: true, names: ['.secret', 'notes.txt', 'projects/'] })
})

test('vfs: listDir reports missing paths and files', () => {
  assertDeepEqual(listDir(FIXTURE, '/nope'), { ok: false, error: 'ENOENT' })
  assertDeepEqual(listDir(FIXTURE, `${H}/notes.txt`), { ok: false, error: 'ENOTDIR' })
})

test('vfs: readFile returns content and reports directories and missing paths', () => {
  assertDeepEqual(readFile(FIXTURE, `${H}/notes.txt`), { ok: true, content: 'hello' })
  assertDeepEqual(readFile(FIXTURE, `${H}/projects`), { ok: false, error: 'EISDIR' })
  assertDeepEqual(readFile(FIXTURE, '/nope'), { ok: false, error: 'ENOENT' })
})

test('vfs: displayPath abbreviates home and nothing that merely starts with it', () => {
  assertEqual(displayPath(H, H), '~')
  assertEqual(displayPath(`${H}/projects`, H), '~/projects')
  assertEqual(displayPath('/home/estebanx', H), '/home/estebanx')
  assertEqual(displayPath('/etc', H), '/etc')
})

test('vfs: the real tree has home, motd, and a hidden .secret', () => {
  assertEqual(HOME, '/home/esteban')
  assert(readFile(TREE, `${HOME}/about.txt`).ok)
  assert(readFile(TREE, '/etc/motd').ok)
  const names = listDir(TREE, HOME).names
  assert(names.includes('projects/'))
  assert(!names.includes('.secret'))
  assert(listDir(TREE, HOME, { all: true }).names.includes('.secret'))
})

test('vfs: no file in the real tree is empty', () => {
  const walk = (node, path) =>
    node.type === 'file' ? [[path, node]] : Object.entries(node.children).flatMap(([name, child]) => walk(child, `${path}/${name}`))
  for (const [path, node] of walk(TREE, '')) {
    assert(typeof node.content === 'string' && node.content.length > 0, `${path} is empty`)
  }
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node tests/run.mjs`
Expected: FAIL — `ERR_MODULE_NOT_FOUND` ending in `shell/vfs.js`, exit code 1.

- [ ] **Step 4: Implement the filesystem**

`shell/vfs.js`:

```js
// Virtual filesystem for /root. TREE is data: add files by editing it, not the functions below.
// It holds nothing the public site does not already show — no phone number, no email.

export const HOME = '/home/esteban'

const dir = children => ({ type: 'dir', children })
const text = (...lines) => ({ type: 'file', content: lines.join('\n') })

export const TREE = dir({
  etc: dir({
    motd: text('welcome to egt.agency.', 'everything here is read-only, including your chances of breaking it.'),
  }),
  home: dir({
    esteban: dir({
      'about.txt': text(
        'Esteban Garcia Taquez',
        'Computer Science @ University of Illinois at Chicago, class of 2027',
        'Concentration in Software Engineering, Minor in Mathematics',
        '',
        'I build secure, scalable applications, and I like hackathons',
        'as much as capture the flags.',
      ),
      'contact.txt': text(
        'web       https://egt.agency',
        'github    https://github.com/Esgartaq04',
        'linkedin  https://linkedin.com/in/esteban-garcia-taquez',
        '',
        'or use the form on the contact page.',
      ),
      'notes.txt': text('todo', '[x] ship the site', '[x] hide things in it', '[x] wait for someone to find them', '[ ] add a second game'),
      '.secret': text('you found the hidden file. most people never type ls -a.', '', 'there is no deeper secret. but there is a game.', 'try: snake'),
      experience: dir({
        'morningstar.log': text(
          'Software Engineering Intern, Technology Intern Program',
          'Morningstar, Chicago IL :: Mar 2026 - Aug 2026',
          '',
          '- Shipped a self-service AI pipeline platform on AWS used by 2,000+',
          '  analysts across 5 global offices to build RAG workflows over',
          '  1,000+ financial documents.',
          '- Cut data-collection turnaround from a 5-week build-and-test cycle',
          '  to under a minute.',
          '- Reduced rule authoring from 2 weeks to 2 minutes on a production',
          '  data-validation engine (Vue, FastAPI, MySQL).',
        ),
        'uic-policy-as-code.log': text(
          'Software Engineering Intern',
          'University of Illinois at Chicago :: May 2024 - Sep 2024',
          '',
          '- Built the Python dependency-analysis engine for a Policy as Code',
          '  compliance framework over formal GDPR rule definitions.',
          '- Translated GDPR regulatory language into machine-checkable specs.',
        ),
        'tutoring.log': text(
          'Academic Tutor',
          'University of Illinois at Chicago :: Sep 2024 - Present',
          '',
          '- Tutor 50+ students a semester in algorithms, data structures,',
          '  systems programming, cryptography, and calculus.',
        ),
      }),
      projects: dir({
        'trading-bot.md': text(
          '# Algorithmic Trading Bot',
          'Python, Docker :: Apr 2026 - Jun 2026',
          '',
          'Live paper-trading bot on 15-minute bars with Kelly Criterion sizing.',
          'Grew a $10,000 simulated account to $15,000 (~50%) over 3 months.',
        ),
        'interview-prep-bot.md': text(
          '# Interview Prep Bot',
          'Python, Docker, GCP, GraphQL :: Sep 2025 - May 2026',
          '',
          'Discord bot serving 100+ commands a day and 1,000+ LeetCode problems,',
          'at 99.9% uptime across the academic year.',
        ),
        'wikiverify.md': text(
          '# WikiVerify',
          'n8n, OpenAI API, Firestore :: Apr 2026',
          '',
          'Human-augmented AI pipeline that checks Wikipedia citations against',
          'their sources. Replaced LLM claim extraction with regex parsing to',
          'remove a rate-limit bottleneck.',
        ),
        'sparkhacks-26.md': text(
          '# Content Creator Analytics Platform',
          'TypeScript, React, Express, Firebase :: Feb 2026',
          '',
          "Third place at SparkHacks '26. Built in 24 hours, load-tested to",
          '500+ concurrent users.',
        ),
      }),
    }),
  }),
})

export function resolvePath(cwd, input, home = HOME) {
  let raw = input
  if (raw === '~' || raw.startsWith('~/')) raw = home + raw.slice(1)
  const segments = raw.startsWith('/') ? raw.split('/') : [...cwd.split('/'), ...raw.split('/')]
  const parts = []
  for (const segment of segments) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') parts.pop()
    else parts.push(segment)
  }
  return '/' + parts.join('/')
}

export function getNode(tree, absPath) {
  let node = tree
  for (const segment of absPath.split('/').filter(Boolean)) {
    if (node.type !== 'dir' || !Object.hasOwn(node.children, segment)) return null
    node = node.children[segment]
  }
  return node
}

export function listDir(tree, absPath, { all = false } = {}) {
  const node = getNode(tree, absPath)
  if (!node) return { ok: false, error: 'ENOENT' }
  if (node.type !== 'dir') return { ok: false, error: 'ENOTDIR' }
  const names = Object.keys(node.children)
    .filter(name => all || !name.startsWith('.'))
    .sort()
    .map(name => (node.children[name].type === 'dir' ? `${name}/` : name))
  return { ok: true, names }
}

export function readFile(tree, absPath) {
  const node = getNode(tree, absPath)
  if (!node) return { ok: false, error: 'ENOENT' }
  if (node.type !== 'file') return { ok: false, error: 'EISDIR' }
  return { ok: true, content: node.content }
}

export function displayPath(absPath, home = HOME) {
  if (absPath === home) return '~'
  if (absPath.startsWith(home + '/')) return '~' + absPath.slice(home.length)
  return absPath
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node tests/run.mjs`
Expected: ends `59 passed, 0 failed`, exit code 0.

- [ ] **Step 6: Commit**

```bash
git add shell/vfs.js tests/vfs.test.js tests/all.js
git commit -F - <<'EOF'
Add the /root virtual filesystem

The tree is a plain object literal, so adding a file means editing data
rather than the path functions. Its contents mirror what the public
site already shows, and deliberately leave out the phone number that is
on the resume but not the site.

getNode checks own properties only, so paths like /constructor do not
resolve to Object.prototype members.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Shell engine

**Files:**
- Create: `shell/core.js`, `tests/core.test.js`
- Modify: `tests/all.js`

**Interfaces:**
- Consumes: `HOME`, `getNode`, `listDir`, `readFile`, `resolvePath` from `shell/vfs.js`.
- Produces, all from `shell/core.js`:
  - `Context` is `{ tree, home: string, cwd: string, history: string[], registry: Map<string, Command>, store }` — mutable session state
  - `Command` is `{ desc: string, hidden?: boolean, run(args: string[], ctx: Context) => Result }`
  - `Result` is `{ out: string[], clear?: boolean, exit?: boolean, takeover?: (host: Host) => void }`
  - `Host` (implemented by `shell.js` in Task 7) is `{ draw(text: string): void, onKey(handler: (key: string) => void): void, finish(lines: string[]): void }`
  - `tokenize(line: string) => string[]`
  - `createContext({ tree, home = HOME, store = null }) => Context`
  - `register(ctx, name: string, command: Command) => void`
  - `registerBuiltins(ctx) => void` — `help ls cd pwd cat whoami clear history exit`, hidden `sudo rm`
  - `helpLines(ctx) => string[]`
  - `execute(ctx, line: string) => Result`
  - `complete(ctx, line: string) => { line: string, options: string[] }`
  - `historyNav(history: string[], index: number, direction: 'up' | 'down') => { index: number, value: string }` — `index === history.length` means the live, empty line

- [ ] **Step 1: Register the new test file**

Replace the contents of `tests/all.js` with:

```js
// Every test file, imported for its side effect of registering tests. Add new test files here.
import './state.test.js'
import './trail.test.js'
import './vfs.test.js'
import './core.test.js'
```

- [ ] **Step 2: Write the failing shell engine tests**

`tests/core.test.js`:

```js
import { test, assert, assertEqual, assertDeepEqual } from './harness.js'
import { complete, createContext, execute, helpLines, historyNav, register, registerBuiltins, tokenize } from '../shell/core.js'

const HOME_DIR = '/home/esteban'

const TREE = {
  type: 'dir',
  children: {
    etc: { type: 'dir', children: { motd: { type: 'file', content: 'welcome' } } },
    home: {
      type: 'dir',
      children: {
        esteban: {
          type: 'dir',
          children: {
            'notes.txt': { type: 'file', content: 'line one\nline two' },
            'nested.txt': { type: 'file', content: 'n' },
            '.secret': { type: 'file', content: 'shh' },
            projects: { type: 'dir', children: { 'bot.md': { type: 'file', content: '# bot' } } },
          },
        },
      },
    },
  },
}

function shell() {
  const ctx = createContext({ tree: TREE, home: HOME_DIR })
  registerBuiltins(ctx)
  return ctx
}

const run = (ctx, line) => execute(ctx, line).out

test('core: tokenize splits on any whitespace', () => {
  assertDeepEqual(tokenize('  ls   -a\tprojects '), ['ls', '-a', 'projects'])
  assertDeepEqual(tokenize('   '), [])
})

test('core: tokenize groups quoted arguments', () => {
  assertDeepEqual(tokenize('cat "my file.txt"'), ['cat', 'my file.txt'])
  assertDeepEqual(tokenize("say 'a b'c"), ['say', 'a bc'])
})

test('core: tokenize closes an unterminated quote and keeps empty quotes', () => {
  assertDeepEqual(tokenize('cat "open'), ['cat', 'open'])
  assertDeepEqual(tokenize('x ""'), ['x', ''])
})

test('core: execute ignores a blank line without recording it', () => {
  const ctx = shell()
  assertDeepEqual(run(ctx, '   '), [])
  assertDeepEqual(ctx.history, [])
})

test('core: execute reports unknown commands in character', () => {
  assertDeepEqual(run(shell(), 'foo --bar'), ['bash: foo: command not found'])
})

test('core: execute records trimmed lines in history', () => {
  const ctx = shell()
  run(ctx, '  pwd  ')
  assertDeepEqual(ctx.history, ['pwd'])
})

test('core: execute reports a throwing command instead of crashing', () => {
  const ctx = shell()
  register(ctx, 'boom', {
    desc: 'explodes',
    run: () => {
      throw new Error('kaboom')
    },
  })
  assertDeepEqual(run(ctx, 'boom'), ['bash: boom: kaboom'])
})

test('core: registered commands get args, pass results through, and appear in help', () => {
  const ctx = shell()
  const takeover = () => {}
  register(ctx, 'game', { desc: 'a test game', run: args => ({ out: [`args:${args.join(',')}`], takeover }) })
  const result = execute(ctx, 'game one two')
  assertDeepEqual(result.out, ['args:one,two'])
  assertEqual(result.takeover, takeover)
  assert(helpLines(ctx).some(line => line.trim().startsWith('game')))
})

test('core: help lists visible commands alphabetically and hides the jokes', () => {
  const names = run(shell(), 'help').map(line => line.trim().split(/\s+/)[0])
  assertDeepEqual(names, ['cat', 'cd', 'clear', 'exit', 'help', 'history', 'ls', 'pwd', 'whoami'])
})

test('core: pwd starts in the home directory', () => {
  assertDeepEqual(run(shell(), 'pwd'), [HOME_DIR])
})

test('core: cd moves into relative directories and back out with ..', () => {
  const ctx = shell()
  assertDeepEqual(run(ctx, 'cd projects'), [])
  assertEqual(ctx.cwd, '/home/esteban/projects')
  run(ctx, 'cd ..')
  assertEqual(ctx.cwd, HOME_DIR)
})

test('core: cd accepts absolute paths and returns home with no argument', () => {
  const ctx = shell()
  run(ctx, 'cd /etc')
  assertEqual(ctx.cwd, '/etc')
  run(ctx, 'cd')
  assertEqual(ctx.cwd, HOME_DIR)
})

test('core: cd reports missing paths and files without moving', () => {
  const ctx = shell()
  assertDeepEqual(run(ctx, 'cd nope'), ['cd: nope: No such file or directory'])
  assertDeepEqual(run(ctx, 'cd notes.txt'), ['cd: notes.txt: Not a directory'])
  assertEqual(ctx.cwd, HOME_DIR)
})

test('core: ls lists the working directory without dotfiles', () => {
  assertDeepEqual(run(shell(), 'ls'), ['nested.txt  notes.txt  projects/'])
})

test('core: ls -a includes dotfiles', () => {
  assertDeepEqual(run(shell(), 'ls -a'), ['.secret  nested.txt  notes.txt  projects/'])
})

test('core: ls echoes a file name and reports missing paths', () => {
  const ctx = shell()
  assertDeepEqual(run(ctx, 'ls notes.txt'), ['notes.txt'])
  assertDeepEqual(run(ctx, 'ls nope'), ["ls: cannot access 'nope': No such file or directory"])
})

test('core: cat prints files line by line, including through ~', () => {
  const ctx = shell()
  assertDeepEqual(run(ctx, 'cat notes.txt'), ['line one', 'line two'])
  run(ctx, 'cd /etc')
  assertDeepEqual(run(ctx, 'cat ~/notes.txt'), ['line one', 'line two'])
})

test('core: cat reports directories, missing files, and no operand in character', () => {
  const ctx = shell()
  assertDeepEqual(run(ctx, 'cat projects'), ['cat: projects: Is a directory'])
  assertDeepEqual(run(ctx, 'cat nope'), ['cat: nope: No such file or directory'])
  assertDeepEqual(run(ctx, 'cat'), ['cat: missing operand'])
})

test('core: whoami, clear, and exit', () => {
  const ctx = shell()
  assertDeepEqual(run(ctx, 'whoami'), ['visitor'])
  assertEqual(execute(ctx, 'clear').clear, true)
  assertDeepEqual(execute(ctx, 'exit'), { out: ['logout'], exit: true })
})

test('core: history numbers every entry, including itself', () => {
  const ctx = shell()
  run(ctx, 'pwd')
  run(ctx, 'whoami')
  assertDeepEqual(run(ctx, 'history'), ['   1  pwd', '   2  whoami', '   3  history'])
})

test('core: sudo and rm -rf / get joke answers', () => {
  const ctx = shell()
  const rootJoke = ["rm: it is dangerous to operate recursively on '/'", 'rm: nice try.']
  assertDeepEqual(run(ctx, 'sudo rm -rf /'), ['visitor is not in the sudoers file. This incident will be reported.'])
  assertDeepEqual(run(ctx, 'rm -rf /'), rootJoke)
  assertDeepEqual(run(ctx, 'rm -fr /*'), rootJoke)
  assertDeepEqual(run(ctx, 'rm -r -f /'), rootJoke)
})

test('core: ordinary rm hits a read-only filesystem', () => {
  const ctx = shell()
  assertDeepEqual(run(ctx, 'rm notes.txt'), ["rm: cannot remove 'notes.txt': Read-only file system"])
  assertDeepEqual(run(ctx, 'rm'), ['rm: missing operand'])
})

test('core: complete finishes a unique command name and lists ambiguous ones', () => {
  const ctx = shell()
  assertDeepEqual(complete(ctx, 'he'), { line: 'help ', options: [] })
  assertDeepEqual(complete(ctx, 'h'), { line: 'h', options: ['help', 'history'] })
})

test('core: complete never offers hidden commands', () => {
  assertDeepEqual(complete(shell(), 'su'), { line: 'su', options: [] })
})

test('core: complete finishes files with a space and directories with a slash', () => {
  const ctx = shell()
  assertDeepEqual(complete(ctx, 'cat no'), { line: 'cat notes.txt ', options: [] })
  assertDeepEqual(complete(ctx, 'cd p'), { line: 'cd projects/', options: [] })
})

test('core: complete handles nested paths, ~, and dotfiles only when asked', () => {
  const ctx = shell()
  assertDeepEqual(complete(ctx, 'cat projects/b'), { line: 'cat projects/bot.md ', options: [] })
  assertDeepEqual(complete(ctx, 'cat ~/pro'), { line: 'cat ~/projects/', options: [] })
  assertDeepEqual(complete(ctx, 'cat .s'), { line: 'cat .secret ', options: [] })
  assertDeepEqual(complete(ctx, 'cat s'), { line: 'cat s', options: [] })
})

test('core: complete extends to the common prefix and lists the choices', () => {
  assertDeepEqual(complete(shell(), 'cat n'), { line: 'cat n', options: ['nested.txt', 'notes.txt'] })
})

test('core: historyNav walks up and down and clamps at both ends', () => {
  const history = ['a', 'b']
  assertDeepEqual(historyNav(history, 2, 'up'), { index: 1, value: 'b' })
  assertDeepEqual(historyNav(history, 1, 'up'), { index: 0, value: 'a' })
  assertDeepEqual(historyNav(history, 0, 'up'), { index: 0, value: 'a' })
  assertDeepEqual(historyNav(history, 0, 'down'), { index: 1, value: 'b' })
  assertDeepEqual(historyNav(history, 1, 'down'), { index: 2, value: '' })
  assertDeepEqual(historyNav(history, 2, 'down'), { index: 2, value: '' })
})

test('core: historyNav on empty history stays on the empty line', () => {
  assertDeepEqual(historyNav([], 0, 'up'), { index: 0, value: '' })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node tests/run.mjs`
Expected: FAIL — `ERR_MODULE_NOT_FOUND` ending in `shell/core.js`, exit code 1.

- [ ] **Step 4: Implement the shell engine**

`shell/core.js`:

```js
// Shell engine: tokenizing, the command registry, built-in commands, and tab completion.
// No DOM. shell.js renders whatever these return.
//
// A command is { desc, hidden?, run(args, ctx) } and returns { out, clear?, exit?, takeover? }.
// A takeover is handed a host { draw(text), onKey(handler), finish(lines) } and owns the screen
// until it calls finish. That is the whole interface a game needs.

import { HOME, getNode, listDir, readFile, resolvePath } from './vfs.js'

export function tokenize(line) {
  const tokens = []
  let current = ''
  let quote = null
  let started = false
  for (const ch of line) {
    if (quote) {
      if (ch === quote) quote = null
      else current += ch
    } else if (ch === '"' || ch === "'") {
      quote = ch
      started = true
    } else if (/\s/.test(ch)) {
      if (started) {
        tokens.push(current)
        current = ''
        started = false
      }
    } else {
      current += ch
      started = true
    }
  }
  if (started) tokens.push(current)
  return tokens
}

export function createContext({ tree, home = HOME, store = null }) {
  return { tree, home, cwd: home, history: [], registry: new Map(), store }
}

export function register(ctx, name, command) {
  ctx.registry.set(name, command)
}

export function helpLines(ctx) {
  const visible = [...ctx.registry.entries()].filter(([, command]) => !command.hidden)
  const width = Math.max(0, ...visible.map(([name]) => name.length))
  return visible
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, command]) => `  ${name.padEnd(width)}  ${command.desc}`)
}

export function execute(ctx, line) {
  const trimmed = line.trim()
  if (!trimmed) return { out: [] }
  ctx.history.push(trimmed)
  const [name = '', ...args] = tokenize(trimmed)
  const command = ctx.registry.get(name)
  if (!command) return { out: [`bash: ${name}: command not found`] }
  try {
    return command.run(args, ctx)
  } catch (error) {
    return { out: [`bash: ${name}: ${error.message}`] }
  }
}

export function registerBuiltins(ctx) {
  register(ctx, 'help', { desc: 'list available commands', run: (args, c) => ({ out: helpLines(c) }) })
  register(ctx, 'ls', { desc: 'list directory contents (-a shows hidden files)', run: ls })
  register(ctx, 'cd', { desc: 'change directory', run: cd })
  register(ctx, 'pwd', { desc: 'print working directory', run: (args, c) => ({ out: [c.cwd] }) })
  register(ctx, 'cat', { desc: 'print file contents', run: cat })
  register(ctx, 'whoami', { desc: 'print current user', run: () => ({ out: ['visitor'] }) })
  register(ctx, 'clear', { desc: 'clear the screen', run: () => ({ out: [], clear: true }) })
  register(ctx, 'history', {
    desc: 'show command history',
    run: (args, c) => ({ out: c.history.map((entry, i) => `${String(i + 1).padStart(4)}  ${entry}`) }),
  })
  register(ctx, 'exit', { desc: 'log out', run: () => ({ out: ['logout'], exit: true }) })
  register(ctx, 'sudo', {
    desc: '',
    hidden: true,
    run: () => ({ out: ['visitor is not in the sudoers file. This incident will be reported.'] }),
  })
  register(ctx, 'rm', { desc: '', hidden: true, run: rm })
}

function ls(args, ctx) {
  const all = args.includes('-a')
  const targets = args.filter(arg => !arg.startsWith('-'))
  if (targets.length === 0) targets.push('.')
  const out = []
  for (const target of targets) {
    const result = listDir(ctx.tree, resolvePath(ctx.cwd, target, ctx.home), { all })
    if (result.ok) {
      if (targets.length > 1) out.push(`${target}:`)
      if (result.names.length > 0) out.push(result.names.join('  '))
    } else if (result.error === 'ENOTDIR') {
      out.push(target)
    } else {
      out.push(`ls: cannot access '${target}': No such file or directory`)
    }
  }
  return { out }
}

function cd(args, ctx) {
  const target = args[0] ?? '~'
  const path = resolvePath(ctx.cwd, target, ctx.home)
  const node = getNode(ctx.tree, path)
  if (!node) return { out: [`cd: ${target}: No such file or directory`] }
  if (node.type !== 'dir') return { out: [`cd: ${target}: Not a directory`] }
  ctx.cwd = path
  return { out: [] }
}

function cat(args, ctx) {
  if (args.length === 0) return { out: ['cat: missing operand'] }
  const out = []
  for (const target of args) {
    const result = readFile(ctx.tree, resolvePath(ctx.cwd, target, ctx.home))
    if (result.ok) out.push(...result.content.split('\n'))
    else if (result.error === 'EISDIR') out.push(`cat: ${target}: Is a directory`)
    else out.push(`cat: ${target}: No such file or directory`)
  }
  return { out }
}

function rm(args) {
  const flags = args.filter(arg => arg.startsWith('-')).join('')
  const targets = args.filter(arg => !arg.startsWith('-'))
  if (flags.includes('r') && flags.includes('f') && targets.some(t => t === '/' || t === '/*')) {
    return { out: ["rm: it is dangerous to operate recursively on '/'", 'rm: nice try.'] }
  }
  if (targets.length === 0) return { out: ['rm: missing operand'] }
  return { out: [`rm: cannot remove '${targets[0]}': Read-only file system`] }
}

// Completes the last whitespace-separated word. Works on raw text rather than tokens,
// so a quote in the line cannot throw off where the word starts.
export function complete(ctx, line) {
  const start = line.search(/\S*$/)
  const prefix = line.slice(0, start)
  const partial = line.slice(start)
  const candidates = prefix.trim() === '' ? commandCandidates(ctx, partial) : pathCandidates(ctx, partial)
  if (candidates.length === 0) return { line, options: [] }
  if (candidates.length === 1) {
    const only = candidates[0]
    return { line: prefix + only + (only.endsWith('/') ? '' : ' '), options: [] }
  }
  return {
    line: prefix + commonPrefix(candidates),
    options: candidates.map(c => c.slice(c.lastIndexOf('/', c.length - 2) + 1)),
  }
}

function commandCandidates(ctx, partial) {
  return [...ctx.registry.entries()]
    .filter(([name, command]) => !command.hidden && name.startsWith(partial))
    .map(([name]) => name)
    .sort()
}

function pathCandidates(ctx, partial) {
  const slash = partial.lastIndexOf('/')
  const dirPart = slash === -1 ? '' : partial.slice(0, slash + 1)
  const basePart = partial.slice(slash + 1)
  const listing = listDir(ctx.tree, resolvePath(ctx.cwd, dirPart, ctx.home), { all: basePart.startsWith('.') })
  if (!listing.ok) return []
  return listing.names.filter(name => name.startsWith(basePart)).map(name => dirPart + name)
}

function commonPrefix(strings) {
  let prefix = strings[0]
  for (const s of strings.slice(1)) {
    while (!s.startsWith(prefix)) prefix = prefix.slice(0, -1)
  }
  return prefix
}

export function historyNav(history, index, direction) {
  const next = direction === 'up' ? Math.max(0, index - 1) : Math.min(history.length, index + 1)
  return { index: next, value: next === history.length ? '' : history[next] }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node tests/run.mjs`
Expected: ends `88 passed, 0 failed`, exit code 0.

- [ ] **Step 6: Commit**

```bash
git add shell/core.js tests/core.test.js tests/all.js
git commit -F - <<'EOF'
Add the /root shell engine

Tokenizer, command registry, builtins, tab completion, and history
navigation, with no DOM dependency.

Commands are registry entries returning plain results. A result may
carry a takeover function that owns the screen until it calls finish,
which is the entire interface a game needs; Snake plugs in through it
next without touching this file.

Completion works on the raw last word rather than tokens, so a quote
elsewhere in the line cannot misplace where the word starts.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Snake

**Files:**
- Create: `shell/snake.js`, `tests/snake.test.js`
- Modify: `tests/all.js`

**Interfaces:**
- Consumes: `Command`, `Result`, and `Host` shapes from Task 5; `createStore` from `hunt/state.js` (tests only); a store's `get()` / `update(fn)` from Task 1.
- Produces, all from `shell/snake.js`:
  - `Game` is `{ width, height, snake: {x, y}[] (head first), dir, nextDir, food: {x, y} | null, score, over }`
  - `DIRECTIONS`, `WIDTH = 30`, `HEIGHT = 15`, `TICK_MS = 110`
  - `createGame(width, height, rng: () => number) => Game`
  - `placeFood(game, rng) => {x, y} | null`
  - `turn(game, dir: string) => Game` — ignores reversals and unknown names
  - `step(game, rng) => Game`
  - `render(game, high = 0) => string`
  - `keyToAction(key: string) => 'up' | 'down' | 'left' | 'right' | 'quit' | null`
  - `startSnake(host: Host, store | null, options?: { rng, setTimer, clearTimer, width, height }) => void`
  - `snakeCommand: Command` — registered as `snake` by Task 7

- [ ] **Step 1: Register the new test file**

Replace the contents of `tests/all.js` with:

```js
// Every test file, imported for its side effect of registering tests. Add new test files here.
import './state.test.js'
import './trail.test.js'
import './vfs.test.js'
import './core.test.js'
import './snake.test.js'
```

- [ ] **Step 2: Write the failing Snake tests**

`tests/snake.test.js`:

```js
import { test, assert, assertEqual, assertDeepEqual } from './harness.js'
import { createStore } from '../hunt/state.js'
import { createGame, keyToAction, placeFood, render, snakeCommand, startSnake, step, turn } from '../shell/snake.js'

const zero = () => 0

function game(overrides = {}) {
  return {
    width: 10,
    height: 5,
    snake: [{ x: 5, y: 2 }, { x: 4, y: 2 }, { x: 3, y: 2 }],
    dir: 'right',
    nextDir: 'right',
    food: { x: 0, y: 0 },
    score: 0,
    over: false,
    ...overrides,
  }
}

function fakeHost() {
  const host = { frames: [], finished: null, finishCount: 0, keyHandler: null }
  host.draw = text => host.frames.push(text)
  host.onKey = handler => {
    host.keyHandler = handler
  }
  host.finish = lines => {
    host.finished = lines
    host.finishCount++
  }
  return host
}

function fakeTimers() {
  const timers = { callback: null, cleared: false }
  timers.setTimer = fn => {
    timers.callback = fn
    return 1
  }
  timers.clearTimer = () => {
    timers.cleared = true
  }
  return timers
}

test('snake: createGame centers a three-cell snake heading right', () => {
  const g = createGame(10, 5, zero)
  assertDeepEqual(g.snake, [{ x: 5, y: 2 }, { x: 4, y: 2 }, { x: 3, y: 2 }])
  assertEqual(g.dir, 'right')
  assertEqual(g.score, 0)
  assertEqual(g.over, false)
})

test('snake: placeFood picks free cells deterministically from rng', () => {
  const g = createGame(10, 5, zero)
  assertDeepEqual(g.food, { x: 0, y: 0 })
  assertDeepEqual(placeFood(g, () => 0.9999), { x: 9, y: 4 })
})

test('snake: placeFood returns null when the board is full', () => {
  assertEqual(placeFood({ width: 2, height: 1, snake: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }, zero), null)
})

test('snake: step moves the head forward and drops the tail', () => {
  const next = step(game(), zero)
  assertDeepEqual(next.snake, [{ x: 6, y: 2 }, { x: 5, y: 2 }, { x: 4, y: 2 }])
  assertEqual(next.over, false)
})

test('snake: turn ignores reversing into the body', () => {
  assertEqual(turn(game(), 'left').nextDir, 'right')
})

test('snake: turn accepts a perpendicular direction and step applies it', () => {
  const next = step(turn(game(), 'up'), zero)
  assertDeepEqual(next.snake[0], { x: 5, y: 1 })
  assertEqual(next.dir, 'up')
})

test('snake: turn ignores unknown directions', () => {
  const state = game()
  assertEqual(turn(state, 'sideways'), state)
})

test('snake: eating grows the snake, scores, and moves the food', () => {
  const next = step(game({ food: { x: 6, y: 2 } }), zero)
  assertEqual(next.snake.length, 4)
  assertEqual(next.score, 1)
  assertDeepEqual(next.food, { x: 0, y: 0 })
})

test('snake: hitting a wall ends the game', () => {
  assertEqual(step(game({ snake: [{ x: 9, y: 2 }, { x: 8, y: 2 }] }), zero).over, true)
})

test('snake: running into the body ends the game', () => {
  const snake = [{ x: 2, y: 2 }, { x: 2, y: 3 }, { x: 1, y: 3 }, { x: 1, y: 2 }, { x: 1, y: 1 }, { x: 0, y: 1 }]
  assertEqual(step(game({ snake, dir: 'up', nextDir: 'left' }), zero).over, true)
})

test('snake: moving into the cell the tail is leaving is allowed', () => {
  const snake = [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 1, y: 2 }]
  const next = step(game({ snake, dir: 'left', nextDir: 'down' }), zero)
  assertEqual(next.over, false)
  assertDeepEqual(next.snake[0], { x: 1, y: 2 })
})

test('snake: step does nothing once the game is over', () => {
  const over = game({ over: true })
  assertEqual(step(over, zero), over)
})

test('snake: filling the board ends the game after the final bite', () => {
  const next = step(game({ width: 3, height: 1, snake: [{ x: 1, y: 0 }, { x: 0, y: 0 }], food: { x: 2, y: 0 } }), zero)
  assertEqual(next.score, 1)
  assertEqual(next.food, null)
  assertEqual(next.over, true)
})

test('snake: render draws a bordered grid with head, body, food, and score', () => {
  const state = game({ width: 4, height: 2, snake: [{ x: 1, y: 0 }, { x: 0, y: 0 }], food: { x: 3, y: 1 }, score: 2 })
  const rows = render(state, 5).split('\n')
  assertDeepEqual(rows.slice(0, 4), ['+----+', '|o@  |', '|   *|', '+----+'])
  assert(rows[4].startsWith('score 2   high 5'))
})

test('snake: keyToAction maps arrows, wasd, and quit keys', () => {
  assertEqual(keyToAction('ArrowUp'), 'up')
  assertEqual(keyToAction('S'), 'down')
  assertEqual(keyToAction('a'), 'left')
  assertEqual(keyToAction('ArrowRight'), 'right')
  assertEqual(keyToAction('Escape'), 'quit')
  assertEqual(keyToAction('q'), 'quit')
  assertEqual(keyToAction('x'), null)
})

test('snake: snakeCommand hands the shell a takeover', () => {
  const result = snakeCommand.run([], { store: null })
  assertDeepEqual(result.out, [])
  assertEqual(typeof result.takeover, 'function')
})

test('snake: startSnake quits on q and stops the timer', () => {
  const host = fakeHost()
  const timers = fakeTimers()
  startSnake(host, createStore(null), { rng: zero, setTimer: timers.setTimer, clearTimer: timers.clearTimer })
  assertEqual(host.frames.length, 1)
  host.keyHandler('q')
  assert(timers.cleared)
  assertDeepEqual(host.finished, ['game over. score 0, high score 0.'])
})

// On a 4x1 board the snake fills three cells, so the only free cell holds the food and the first tick eats it.
test('snake: startSnake records a new high score when the game ends', () => {
  const store = createStore(null)
  const host = fakeHost()
  const timers = fakeTimers()
  startSnake(host, store, { rng: zero, setTimer: timers.setTimer, clearTimer: timers.clearTimer, width: 4, height: 1 })
  timers.callback()
  assertDeepEqual(host.finished, ['game over. score 1, high score 1.'])
  assertEqual(store.get().snakeHigh, 1)
})

test('snake: finish is reported once even if quit follows game over', () => {
  const host = fakeHost()
  const timers = fakeTimers()
  startSnake(host, createStore(null), { rng: zero, setTimer: timers.setTimer, clearTimer: timers.clearTimer, width: 4, height: 1 })
  timers.callback()
  host.keyHandler('q')
  assertEqual(host.finishCount, 1)
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node tests/run.mjs`
Expected: FAIL — `ERR_MODULE_NOT_FOUND` ending in `shell/snake.js`, exit code 1.

- [ ] **Step 4: Implement Snake**

`shell/snake.js`:

```js
// Snake for /root. The rules are pure; startSnake drives them through the shell's takeover host.
// Ticks run on setInterval, not requestAnimationFrame, so the game never depends on the page compositing.

export const DIRECTIONS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' }

export const WIDTH = 30
export const HEIGHT = 15
export const TICK_MS = 110

export function createGame(width, height, rng) {
  const x = Math.floor(width / 2)
  const y = Math.floor(height / 2)
  const base = {
    width,
    height,
    snake: [{ x, y }, { x: x - 1, y }, { x: x - 2, y }],
    dir: 'right',
    nextDir: 'right',
    food: null,
    score: 0,
    over: false,
  }
  return { ...base, food: placeFood(base, rng) }
}

export function placeFood(game, rng) {
  const free = []
  for (let y = 0; y < game.height; y++) {
    for (let x = 0; x < game.width; x++) {
      if (!game.snake.some(p => p.x === x && p.y === y)) free.push({ x, y })
    }
  }
  if (free.length === 0) return null
  return free[Math.floor(rng() * free.length)]
}

// Compares against the direction last moved, not the queued one, so two fast
// key presses between ticks cannot reverse the snake into itself.
export function turn(game, dir) {
  if (!DIRECTIONS[dir] || dir === OPPOSITE[game.dir]) return game
  return { ...game, nextDir: dir }
}

export function step(game, rng) {
  if (game.over) return game
  const dir = game.nextDir
  const head = game.snake[0]
  const next = { x: head.x + DIRECTIONS[dir].x, y: head.y + DIRECTIONS[dir].y }
  const eating = game.food !== null && next.x === game.food.x && next.y === game.food.y
  // Unless it is eating, the tail moves away this tick, so its cell is safe to enter.
  const body = eating ? game.snake : game.snake.slice(0, -1)
  const hitWall = next.x < 0 || next.y < 0 || next.x >= game.width || next.y >= game.height
  const hitSelf = body.some(p => p.x === next.x && p.y === next.y)
  if (hitWall || hitSelf) return { ...game, dir, over: true }
  const snake = [next, ...body]
  if (!eating) return { ...game, dir, snake }
  const grown = { ...game, dir, snake, score: game.score + 1 }
  const food = placeFood(grown, rng)
  return { ...grown, food, over: food === null }
}

export function render(game, high = 0) {
  const border = `+${'-'.repeat(game.width)}+`
  const rows = [border]
  for (let y = 0; y < game.height; y++) {
    let row = '|'
    for (let x = 0; x < game.width; x++) {
      const index = game.snake.findIndex(p => p.x === x && p.y === y)
      if (index === 0) row += '@'
      else if (index > 0) row += 'o'
      else if (game.food && game.food.x === x && game.food.y === y) row += '*'
      else row += ' '
    }
    rows.push(`${row}|`)
  }
  rows.push(border)
  rows.push(`score ${game.score}   high ${Math.max(high, game.score)}   arrows/wasd to move, q to quit`)
  return rows.join('\n')
}

export function keyToAction(key) {
  const k = typeof key === 'string' ? key.toLowerCase() : ''
  if (k === 'arrowup' || k === 'w') return 'up'
  if (k === 'arrowdown' || k === 's') return 'down'
  if (k === 'arrowleft' || k === 'a') return 'left'
  if (k === 'arrowright' || k === 'd') return 'right'
  if (k === 'q' || k === 'escape') return 'quit'
  return null
}

export function startSnake(host, store, options = {}) {
  const {
    rng = Math.random,
    setTimer = (fn, ms) => setInterval(fn, ms),
    clearTimer = id => clearInterval(id),
    width = WIDTH,
    height = HEIGHT,
  } = options
  const high = store ? store.get().snakeHigh : 0
  let game = createGame(width, height, rng)
  let ended = false

  host.draw(render(game, high))

  const timer = setTimer(() => {
    game = step(game, rng)
    host.draw(render(game, high))
    if (game.over) end()
  }, TICK_MS)

  host.onKey(key => {
    const action = keyToAction(key)
    if (action === 'quit') end()
    else if (action) game = turn(game, action)
  })

  function end() {
    if (ended) return
    ended = true
    clearTimer(timer)
    if (store && game.score > high) store.update(state => ({ ...state, snakeHigh: game.score }))
    host.finish([`game over. score ${game.score}, high score ${Math.max(high, game.score)}.`])
  }
}

export const snakeCommand = {
  desc: 'play snake',
  run: (args, ctx) => ({ out: [], takeover: host => startSnake(host, ctx.store) }),
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node tests/run.mjs`
Expected: ends `107 passed, 0 failed`, exit code 0.

- [ ] **Step 6: Commit**

```bash
git add shell/snake.js tests/snake.test.js tests/all.js
git commit -F - <<'EOF'
Add Snake for the /root shell

Pure rules (movement, turning, eating, collisions, rendering) plus a
controller that drives them through the shell's takeover host, with the
timer and random source injectable so the whole game loop is testable.

It ticks on setInterval rather than requestAnimationFrame, so it keeps
running in contexts that are not compositing frames, unlike the site's
page transitions.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 7: The /root page

**Files:**
- Create: `shell.js`, `root.html`, `vercel.json`
- Modify: `style.css:388` (above the media query, below Task 3's block), `tests/MANUAL.md` (append)

**Interfaces:**
- Consumes: `createStore`, `safeStorage` (Task 1); `isTouchOnly`, `unlockAttempt` (Task 2); `TREE`, `displayPath` (Task 4); `complete`, `createContext`, `execute`, `historyNav`, `register`, `registerBuiltins`, and the `Result`/`Host` shapes (Task 5); `snakeCommand` (Task 6).
- Produces: the `/root` page. `shell.js` implements `Host` as `{ draw, onKey, finish }`. Element ids `term`, `term-out`, `term-screen`, `term-line`, `term-prompt`, `term-in`; classes `.term-error`, `.term-line-hidden`.

This task is DOM wiring. Unit tests do not cover it; the Shell section of `tests/MANUAL.md` does.

- [ ] **Step 1: Create `root.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex">
    <title>./root</title>
    <link rel="icon" type="image/png" href="assets/favicon.png">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@300;400;600&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="style.css">
    <script type="module" src="eggs.js"></script>
    <script type="module" src="shell.js"></script>
</head>
<body>
    <div class="terminal-container">
        <div id="term" class="term">
            <div id="term-out" class="term-out"></div>
            <pre id="term-screen" class="term-screen" hidden></pre>
            <div id="term-line" class="term-line">
                <span id="term-prompt" class="term-prompt"></span>
                <input id="term-in" class="term-in" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="terminal input">
            </div>
        </div>
    </div>
</body>
</html>
```

No nav, no `script.js`, no GSAP or EmailJS: this page never takes part in SPA navigation. `eggs.js` still loads so `hunt()` works for someone who guessed the URL and opened the console.

- [ ] **Step 2: Create `shell.js`**

```js
// /root: the lock screen, then the shell. Logic lives in hunt/ and shell/; this file only renders.
// All output goes through textContent. The shell echoes whatever the visitor types.

import { createStore, safeStorage } from './hunt/state.js'
import { isTouchOnly, unlockAttempt } from './hunt/trail.js'
import { complete, createContext, execute, historyNav, register, registerBuiltins } from './shell/core.js'
import { snakeCommand } from './shell/snake.js'
import { TREE, displayPath } from './shell/vfs.js'

const store = createStore(safeStorage())
const ctx = createContext({ tree: TREE, store })
registerBuiltins(ctx)
register(ctx, 'snake', snakeCommand)

const term = document.getElementById('term')
const output = document.getElementById('term-out')
const screen = document.getElementById('term-screen')
const inputLine = document.getElementById('term-line')
const promptEl = document.getElementById('term-prompt')
const input = document.getElementById('term-in')

// 'locked' | 'shell' | 'takeover' | 'exiting'
let mode = 'locked'
let failures = 0
let historyIndex = 0
let takeoverKeys = null

if (isTouchOnly(window.matchMedia ? query => window.matchMedia(query) : undefined)) {
  inputLine.hidden = true
  print(['/root needs a keyboard. come back on a desktop.'])
} else {
  boot()
}

function boot() {
  term.addEventListener('click', () => input.focus())
  input.addEventListener('keydown', onKey)
  if (store.get().unlocked) {
    enterShell(['session restored. type `help` to look around.', ''])
  } else {
    print(['egt.agency secure terminal', 'authorization required.', ''])
    setPrompt('passphrase: ')
  }
  input.focus()
}

function enterShell(lines) {
  mode = 'shell'
  historyIndex = ctx.history.length
  print(lines)
  setPrompt(promptText())
}

function promptText() {
  return `visitor@egt:${displayPath(ctx.cwd, ctx.home)}$ `
}

function setPrompt(text) {
  promptEl.textContent = text
}

function print(lines, className) {
  for (const line of lines) {
    const row = document.createElement('div')
    row.textContent = line === '' ? ' ' : line // A non-breaking space keeps blank lines from collapsing.
    if (className) row.className = className
    output.appendChild(row)
  }
  term.scrollTop = term.scrollHeight
}

// The input keeps focus in every mode, including Snake. That is also what stops typing here from
// feeding eggs.js's Konami buffer: its keyboard listener ignores events whose target is an input.
function onKey(event) {
  if (mode === 'exiting') {
    event.preventDefault()
    return
  }
  if (mode === 'takeover') {
    event.preventDefault()
    if (takeoverKeys) takeoverKeys(event.key)
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    const value = input.value
    input.value = ''
    submit(value)
  } else if (event.key === 'Tab') {
    event.preventDefault()
    if (mode !== 'shell') return
    const result = complete(ctx, input.value)
    if (result.options.length > 0) print([promptText() + input.value, result.options.join('  ')])
    input.value = result.line
  } else if (mode === 'shell' && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
    event.preventDefault()
    const result = historyNav(ctx.history, historyIndex, event.key === 'ArrowUp' ? 'up' : 'down')
    historyIndex = result.index
    input.value = result.value
  }
}

function submit(value) {
  if (mode === 'locked') {
    // Echo masked, and never through execute(), so a guess cannot land in history.
    print(['passphrase: ' + '*'.repeat(value.length)])
    const result = unlockAttempt(value, failures)
    failures = result.failures
    if (result.ok) {
      store.update(state => ({ ...state, unlocked: true }))
      enterShell([...result.lines, ''])
    } else {
      print(result.lines, 'term-error')
    }
    return
  }

  print([promptText() + value])
  const result = execute(ctx, value)
  historyIndex = ctx.history.length
  if (result.clear) output.replaceChildren()
  print(result.out)
  if (result.exit) {
    mode = 'exiting'
    inputLine.hidden = true
    setTimeout(() => {
      window.location.href = 'index.html'
    }, 400)
    return
  }
  setPrompt(promptText())
  if (result.takeover) startTakeover(result.takeover)
}

function startTakeover(takeover) {
  mode = 'takeover'
  output.hidden = true
  inputLine.classList.add('term-line-hidden')
  screen.hidden = false
  takeover({
    draw(text) {
      screen.textContent = text
    },
    onKey(handler) {
      takeoverKeys = handler
    },
    finish(lines) {
      takeoverKeys = null
      screen.hidden = true
      screen.textContent = ''
      output.hidden = false
      inputLine.classList.remove('term-line-hidden')
      mode = 'shell'
      print(lines)
      input.focus()
    },
  })
}
```

- [ ] **Step 3: Style the shell**

In `style.css`, find the line `@media (max-width: 768px) {` and insert this block directly above it, below the `/* Easter Egg Hunt */` block from Task 3:

```css
/* Hidden Shell (/root) */
.term {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 10px;
  color: #b3ffcc;
  line-height: 1.5;
  cursor: text;
}
/* Author display rules such as .term-line's flex would otherwise beat the browser's [hidden] rule. */
.term [hidden] {
  display: none !important;
}
.term-out div {
  white-space: pre-wrap;
  word-break: break-word;
}
.term-error {
  color: var(--term-alert);
}
.term-screen {
  margin: 0;
  color: var(--term-green);
  font-family: var(--font-stack);
  line-height: 1.15;
}
.term-line {
  display: flex;
}
/* Collapsed rather than hidden: a display:none input cannot hold focus, and Snake needs the keys. */
.term-line-hidden {
  opacity: 0;
  height: 0;
  overflow: hidden;
}
.term-prompt {
  color: var(--term-green);
  white-space: pre;
}
.term-in {
  flex: 1;
  min-width: 0;
  border: none;
  padding: 0;
  background: transparent;
  color: #b3ffcc;
  font-size: inherit;
  line-height: inherit;
  caret-color: var(--term-green);
}
.term-in:focus {
  border: none;
  box-shadow: none;
}

```

`.term-in` and `.term-in:focus` override the site's global `input` and `input:focus` rules by specificity.

- [ ] **Step 4: Add the Vercel rewrite**

`vercel.json`:

```json
{
  "rewrites": [
    { "source": "/root", "destination": "/root.html" }
  ]
}
```

Do not add `cleanUrls`. It would change every pathname to its extensionless form, and `updateActiveNav()` in `script.js` compares `location.pathname` against names like `about.html`.

Validate the JSON:

Run: `node -e "console.log(JSON.parse(require('fs').readFileSync('vercel.json','utf8')).rewrites[0].destination)"`
Expected: prints `/root.html`.

- [ ] **Step 5: Append the Shell checklist**

Append to the end of `tests/MANUAL.md`:

```markdown

## Shell

Locally the page is `/root.html`; the `/root` rewrite only exists on Vercel.

- [ ] With progress cleared, `/root.html` shows `authorization required.` and a `passphrase:` prompt, with no nav and no console errors.
- [ ] A wrong guess echoes as asterisks and prints `ACCESS DENIED [1]` in red. The third wrong guess adds a `hint:` line.
- [ ] `kernel_panic_at_0x00` prints `ACCESS GRANTED`, and the prompt becomes `visitor@egt:~$`.
- [ ] Reloading goes straight to `session restored.`
- [ ] `help` lists `cat cd clear exit help history ls pwd snake whoami`, and not `sudo` or `rm`.
- [ ] `ls` hides `.secret`; `ls -a` shows it. Directories end in `/`.
- [ ] `cat .secret`, `cd projects`, `ls`, `cat trading-bot.md`, `cd ..`, and `pwd` all behave, and the prompt shows `~/projects` while inside it.
- [ ] `cat projects` prints `cat: projects: Is a directory`. `foo` prints `bash: foo: command not found`.
- [ ] Tab: `he` completes to `help `; `cd pr` completes to `cd projects/`; `h` lists `help  history` and leaves the line alone.
- [ ] Up and Down walk history; Down past the newest entry clears the line. The passphrase never appears in `history`.
- [ ] `sudo`, `rm -rf /`, and `whoami` give their joke answers and `visitor`.
- [ ] Typing `<img src=x onerror=alert(1)>` and pressing Enter prints that text literally, with no alert.
- [ ] `snake` replaces the output with a bordered grid; arrows and WASD steer; eating raises the score; hitting a wall returns to the prompt with `game over. score N, high score M.`
- [ ] A new high score survives a reload and shows in the next game's status line.
- [ ] `q` or Escape quits mid-game back to the prompt.
- [ ] Typing the Konami code into the shell, or steering Snake with those keys, logs no fragment.
- [ ] `clear` empties the screen. `exit` prints `logout` and lands on the home page.
- [ ] In mobile/touch emulation, `/root.html` shows only `/root needs a keyboard. come back on a desktop.`
```

- [ ] **Step 6: Verify the suite is still green**

Run: `node tests/run.mjs`
Expected: ends `107 passed, 0 failed`, exit code 0.

- [ ] **Step 7: Walk the Shell checklist**

Start `python -m http.server 8765` in the background and work through every item under `## Shell` in `tests/MANUAL.md` at `http://localhost:8765/root.html`. Headless equivalents for a browser-automation agent:

```js
// Type a line into the shell and press Enter
function type(line) {
  const input = document.getElementById('term-in')
  input.value = line
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
}
const out = () => [...document.querySelectorAll('#term-out div')].map(d => d.textContent)
```

```js
localStorage.removeItem('egt.eggs'); location.reload()
```

```js
type('guess'); out().at(-1)                                     // expect "ACCESS DENIED [1]"
```

```js
type('kernel_panic_at_0x00'); document.getElementById('term-prompt').textContent   // expect "visitor@egt:~$ "
```

```js
type('<img src=x onerror=alert(1)>'); document.querySelector('#term-out img')     // expect null
```

```js
const input = document.getElementById('term-in')
input.value = 'cd pr'
input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
input.value                                                     // expect "cd projects/"
```

```js
type('snake')
await new Promise(r => setTimeout(r, 600))
document.getElementById('term-screen').textContent.includes('@') // expect true: frames render on setInterval
document.getElementById('term-in').dispatchEvent(new KeyboardEvent('keydown', { key: 'q', bubbles: true }))
out().at(-1)                                                     // expect a line starting "game over." (the score depends on where the food spawned)
```

Mark any item you could not exercise, such as touch emulation or visual styling, as needing a human rather than checking it off. Stop the server afterward.

- [ ] **Step 8: Commit**

```bash
git add root.html shell.js vercel.json style.css tests/MANUAL.md
git commit -F - <<'EOF'
Add the /root hidden shell page

A passphrase lock screen that opens into the shell, with Snake
registered as a command. shell.js only renders: every decision lives in
the tested modules under hunt/ and shell/, and all output goes through
textContent because the shell echoes whatever the visitor types.

vercel.json rewrites /root to /root.html so the payoff is linkable. The
live site does not use clean URLs, and enabling cleanUrls instead would
break updateActiveNav() in script.js, which compares against names like
about.html.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 8: Document, verify end to end, and ship

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: every file from Tasks 1–7.
- Produces: an up-to-date README, a pushed `easter-eggs` branch, and a PR whose preview deployment has been checked.

- [ ] **Step 1: Update the README layout**

In `README.md`, find this line in the `## Layout` code block:

```
assets/                       — favicon, resume PDF, success GIF
```

and add these lines directly after it, inside the same code block:

```
eggs.js                       — easter egg hunt, loaded on every page
hunt/                         — hunt rules and progress state
root.html         /root       — hidden shell; not in the nav
shell.js                      — renders the shell for root.html
shell/                        — filesystem, commands, Snake
robots.txt, sys_dump.txt      — part of the hunt
vercel.json                   — rewrites /root to root.html
tests.html, tests/            — unit tests and the manual checklist
```

- [ ] **Step 2: Document the tests**

In `README.md`, find the line `Then visit <http://localhost:8765>.` and insert this directly after it:

~~~markdown

### Tests

```bash
node tests/run.mjs
```

Runs every unit test and exits non-zero on any failure. No install step: it needs only Node 22. The same tests run in a browser at <http://localhost:8765/tests.html>. The DOM layer has no automated tests; [tests/MANUAL.md](tests/MANUAL.md) is its checklist.
~~~

- [ ] **Step 3: Add the easter egg section and deployment note**

In `README.md`, find the line `## Deployment` and insert this directly above it:

```markdown
## Easter eggs

The site hides a scavenger hunt that ends in a playable shell at `/root`. The full design, including every answer, is in [docs/superpowers/specs/2026-08-27-easter-eggs-design.md](docs/superpowers/specs/2026-08-27-easter-eggs-design.md) — skip it if you would rather play.

The hunt follows the navigation rules above without touching `script.js`: every listener in `eggs.js` binds once to `document`, which survives the `<main>` swap, so nothing is ever orphaned or bound twice.

```

Then find the line that begins `Pushes deploy through Vercel.` and add this paragraph directly after it:

```markdown

`vercel.json` holds a single rewrite so `/root` resolves. The rest of the site deliberately does not use clean URLs: `updateActiveNav()` in `script.js` compares the pathname against names like `about.html`.
```

- [ ] **Step 4: Record the known console noise**

In `README.md`, find the last item under `## Open items`, the one beginning `- [ ] **Social links.**`, and add this directly after it:

```markdown
- [ ] **Console noise.** `script.js` logs six debug lines on every page load, including the EmailJS public key, which buries the hunt's console banner. Removing them is a separate change to `script.js`.
```

- [ ] **Step 5: Run the full suite both ways**

Run: `node tests/run.mjs`
Expected: ends `107 passed, 0 failed`, exit code 0.

Then serve with `python -m http.server 8765` and open `http://localhost:8765/tests.html`.
Expected: tab title `PASS (107)`.

- [ ] **Step 6: Walk the whole manual checklist once more**

Work through `tests/MANUAL.md` top to bottom on a fresh `localStorage`, completing the hunt for real: find every fragment through its intended trigger, then unlock `/root.html` using the passphrase assembled from `hunt()`'s output, not one typed from this plan. This is the only end-to-end proof that the hint chain actually leads somewhere. List any item that needs a human, and stop the server afterward.

- [ ] **Step 7: Commit**

```bash
git add README.md
git commit -F - <<'EOF'
Document the easter egg hunt, tests, and /root rewrite

Adds the new files to the layout, how to run the tests under Node or in
a browser, a spoiler-free pointer to the hunt's design, and why
vercel.json rewrites only /root instead of enabling clean URLs.

Also records the script.js debug logging that buries the hunt's console
banner, as an open item for its own change.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 8: Ask before pushing**

Pushing and opening a PR are outward-facing. **Stop and ask the user for a yes** before running either. On a yes:

```bash
git push -u origin easter-eggs
```

```bash
gh pr create --base main --head easter-eggs --title "Add easter egg hunt and hidden /root shell" --body-file - <<'EOF'
## What this adds

A five-fragment scavenger hunt hidden across the site. The fragments assemble into a passphrase that unlocks `/root`, a fake shell with tab completion, a small filesystem, and a playable Snake.

Design: `docs/superpowers/specs/2026-08-27-easter-eggs-design.md` (contains every answer). Plan: `docs/superpowers/plans/2026-09-10-easter-eggs.md`.

## Reviewer notes

- **`script.js` is untouched.** `eggs.js` binds every listener once to `document`, which survives the `<main>` swap, so SPA navigation can neither orphan nor duplicate a trigger.
- **Logic is separated from the DOM.** Everything in `hunt/` and `shell/` is pure and unit-tested. `eggs.js` and `shell.js` only render, and are covered by `tests/MANUAL.md`.
- **`vercel.json` adds a single rewrite, not `cleanUrls`.** Clean URLs would break `updateActiveNav()`, which compares the pathname against `about.html`-style names.
- **All shell output uses `textContent`.** The shell echoes visitor input.
- **`tests.html` is publicly reachable once deployed.** It is harmless, since the passphrase already ships in `hunt/trail.js`; this is not access control.

## Testing

- `node tests/run.mjs`: 107 passed, 0 failed
- `tests.html`: PASS (107)
- `tests/MANUAL.md` walked end to end, including completing the hunt through its own hints

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
```

Replace the Testing bullets with what actually happened, including any manual items left for a human.

- [ ] **Step 9: Verify the preview deployment serves the hunt**

The live site returns 404 for `README.md` even though it is committed, so do not assume Vercel serves every new file. Find the preview URL in the Vercel bot's PR comment:

Run: `gh pr view --comments`

Set `PREVIEW` to that URL, with no trailing slash, then:

```bash
for p in /root /root.html /robots.txt /sys_dump.txt /eggs.js /hunt/trail.js /shell/core.js /tests.html; do printf "%-16s " "$p"; curl -s -o /dev/null -w "%{http_code}\n" "$PREVIEW$p"; done
```

Expected: `200` for every path except `/tests.html`, which is informational. If any of the others is not `200`, the hunt cannot be completed in production — report it to the user before merging rather than working around it. If every path returns `401`, the preview has Vercel deployment protection; tell the user, and re-run the same loop against `https://egt.agency` after merge instead.
