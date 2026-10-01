// Server half of the hunt: lib/token.js and lib/hunt.js. Node only (node:crypto), so it is listed in
// tests/server.js, which tests/run.mjs loads and tests.html does not.
import { test, assert, assertEqual, assertDeepEqual } from './harness.js'
import { COOKIE_NAME, isUnlocked, readCookie, sign, unlockCookie, unlockToken, verify } from '../lib/token.js'
import { gate, handleFragment, handleSession, handleUnlock, loadConfig } from '../lib/hunt.js'
import { FRAGMENTS } from '../hunt/trail.js'

// Test values only. The real ones live in Vercel env vars and nowhere in the repo.
const SECRET = 'test-secret-that-is-at-least-32-characters-long'
const ENV = { HUNT_FRAGMENTS: JSON.stringify({ console: 'aa', cursor: 'bb_', konami: 'cc_' }), HUNT_SECRET: SECRET }
const comment = FRAGMENTS.find(f => f.id === 'comment').text
const robots = FRAGMENTS.find(f => f.id === 'robots').text
const PASSPHRASE = `aabb_${comment}cc_${robots}`
const noDelay = () => Promise.resolve()

function post(path, body, headers = {}) {
  return new Request(`https://egt.agency${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

function get(path, cookie) {
  return new Request(`https://egt.agency${path}`, { headers: cookie ? { cookie } : {} })
}

function cookieFrom(response) {
  return response.headers.get('set-cookie').split(';')[0]
}

// --- token ---

test('token: sign then verify returns the payload', () => {
  const payload = verify(sign({ root: true, exp: 2000 }, SECRET), SECRET, 1000)
  assertDeepEqual(payload, { root: true, exp: 2000 })
})

test('token: verify rejects a tampered payload, a wrong secret, and junk', () => {
  const token = sign({ root: true, exp: 2000 }, SECRET)
  const [, mac] = token.split('.')
  const forged = `${Buffer.from(JSON.stringify({ root: true, exp: 9e15 })).toString('base64url')}.${mac}`
  assertEqual(verify(forged, SECRET, 1000), null)
  assertEqual(verify(token, `${SECRET}x`, 1000), null)
  assertEqual(verify('nope', SECRET, 1000), null)
  assertEqual(verify('a.b.c', SECRET, 1000), null)
  assertEqual(verify(null, SECRET, 1000), null)
  assertEqual(verify(token, '', 1000), null)
})

test('token: verify rejects an expired token', () => {
  assertEqual(verify(sign({ root: true, exp: 1000 }, SECRET), SECRET, 1000), null)
})

test('token: sign refuses to run without a secret', () => {
  let threw = false
  try {
    sign({}, '')
  } catch {
    threw = true
  }
  assert(threw)
})

test('token: readCookie finds the named cookie among others', () => {
  const request = get('/', `a=1; ${COOKIE_NAME}=abc.def; b=2`)
  assertEqual(readCookie(request), 'abc.def')
  assertEqual(readCookie(get('/', 'a=1')), null)
  assertEqual(readCookie(get('/')), null)
})

test('token: unlockCookie is HttpOnly, Secure, SameSite=Strict, site-wide, and 30 days', () => {
  const cookie = unlockCookie('t.k')
  for (const part of ['egt_root=t.k', 'Path=/', 'Max-Age=2592000', 'HttpOnly', 'Secure', 'SameSite=Strict']) {
    assert(cookie.includes(part), `missing ${part}`)
  }
})

test('token: isUnlocked needs a valid root token', () => {
  assert(isUnlocked(get('/', `${COOKIE_NAME}=${unlockToken(SECRET)}`), SECRET))
  assert(!isUnlocked(get('/', `${COOKIE_NAME}=${sign({ root: false, exp: Date.now() + 1e6 }, SECRET)}`), SECRET))
  assert(!isUnlocked(get('/'), SECRET))
})

// --- config ---

test('hunt: loadConfig assembles the passphrase in trail order', () => {
  const config = loadConfig(ENV)
  assertEqual(config.passphrase, PASSPHRASE)
  assertEqual(config.texts.konami, 'cc_')
})

test('hunt: loadConfig returns null for missing, malformed, or incomplete env', () => {
  assertEqual(loadConfig({}), null)
  assertEqual(loadConfig({ ...ENV, HUNT_FRAGMENTS: '{bad' }), null)
  assertEqual(loadConfig({ ...ENV, HUNT_FRAGMENTS: JSON.stringify({ console: 'aa' }) }), null)
  assertEqual(loadConfig({ ...ENV, HUNT_SECRET: 'short' }), null)
})

// --- /api/unlock ---

test('api: unlock accepts the passphrase, normalised, and sets the cookie', async () => {
  const response = await handleUnlock(post('/api/unlock', { passphrase: `  ${PASSPHRASE.toUpperCase()}\n` }), ENV, { delay: noDelay })
  assertEqual(response.status, 200)
  assertDeepEqual(await response.json(), { ok: true })
  assert(isUnlocked(get('/', cookieFrom(response)), SECRET), 'cookie should unlock')
})

test('api: unlock rejects a wrong passphrase after the delay, without a cookie', async () => {
  let delayed = 0
  const response = await handleUnlock(post('/api/unlock', { passphrase: `${PASSPHRASE}x` }), ENV, {
    delay: ms => {
      delayed = ms
      return Promise.resolve()
    },
  })
  assertEqual(response.status, 401)
  assertEqual(response.headers.get('set-cookie'), null)
  assert(delayed > 0, 'failures should be slowed down')
})

test('api: unlock rejects a missing or non-string passphrase', async () => {
  assertEqual((await handleUnlock(post('/api/unlock', {}), ENV, { delay: noDelay })).status, 401)
  assertEqual((await handleUnlock(post('/api/unlock', { passphrase: 7 }), ENV, { delay: noDelay })).status, 401)
})

test('api: unlock rejects bad JSON, oversized bodies, and non-POST methods', async () => {
  assertEqual((await handleUnlock(post('/api/unlock', '{oops'), ENV)).status, 400)
  assertEqual((await handleUnlock(post('/api/unlock', '[1]'), ENV)).status, 400)
  assertEqual((await handleUnlock(post('/api/unlock', { passphrase: 'x'.repeat(2000) }), ENV)).status, 413)
  assertEqual((await handleUnlock(get('/api/unlock'), ENV)).status, 405)
})

test('api: unlock reports 503 when the env is not configured', async () => {
  assertEqual((await handleUnlock(post('/api/unlock', { passphrase: PASSPHRASE }), {})).status, 503)
})

// --- /api/fragment ---

test('api: fragment returns secret fragment text by id', async () => {
  const response = await handleFragment(post('/api/fragment', { id: 'cursor' }), ENV)
  assertEqual(response.status, 200)
  assertDeepEqual(await response.json(), { id: 'cursor', text: 'bb_' })
  assertEqual(response.headers.get('cache-control'), 'no-store')
})

test('api: fragment 404s for public and unknown ids', async () => {
  assertEqual((await handleFragment(post('/api/fragment', { id: 'comment' }), ENV)).status, 404)
  assertEqual((await handleFragment(post('/api/fragment', { id: 'passphrase' }), ENV)).status, 404)
  assertEqual((await handleFragment(post('/api/fragment', {}), ENV)).status, 404)
})

// --- /api/session ---

test('api: session reports whether the cookie unlocks /root', async () => {
  const unlocked = handleSession(get('/api/session', `${COOKIE_NAME}=${unlockToken(SECRET)}`), ENV)
  assertDeepEqual(await unlocked.json(), { unlocked: true })
  assertDeepEqual(await handleSession(get('/api/session'), ENV).json(), { unlocked: false })
  assertDeepEqual(await handleSession(get('/api/session', `${COOKIE_NAME}=${unlockToken(SECRET)}`), {}).json(), { unlocked: false })
})

// --- middleware gate ---

test('gate: shell files 404 without a valid cookie and pass with one', () => {
  for (const path of ['/shell.js', '/shell/vfs.js', '/shell/snake.js']) {
    assertEqual(gate(get(path), ENV).status, 404, `${path} locked`)
    assertEqual(gate(get(path, `${COOKIE_NAME}=forged.token`), ENV).status, 404, `${path} forged`)
    assertEqual(gate(get(path, `${COOKIE_NAME}=${unlockToken(SECRET)}`), ENV), null, `${path} unlocked`)
  }
})

test('gate: build files always 404, even when unlocked', () => {
  const cookie = `${COOKIE_NAME}=${unlockToken(SECRET)}`
  for (const path of ['/node_modules/@vercel/functions/index.js', '/package.json', '/package-lock.json']) {
    assertEqual(gate(get(path, cookie), ENV).status, 404, path)
  }
})

test('gate: fails closed when the env is not configured', () => {
  assertEqual(gate(get('/shell.js', `${COOKIE_NAME}=${unlockToken(SECRET)}`), {}).status, 404)
})
