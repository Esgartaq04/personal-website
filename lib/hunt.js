// Server half of the easter egg hunt. The api/ functions and middleware.js are thin wrappers
// around these handlers, which take the env explicitly so tests can run them without Vercel.
//
// Env (Vercel project settings, never committed):
//   HUNT_FRAGMENTS  JSON object with the text of each secret fragment, keyed by id (see SECRET_IDS)
//   HUNT_SECRET     32+ character key that signs the unlock cookie

import { createHash, timingSafeEqual } from 'node:crypto'
import { FRAGMENTS, SECRET_IDS, normalizePassphrase } from '../hunt/trail.js'
import { isUnlocked, unlockCookie, unlockToken } from './token.js'

const MAX_BODY_BYTES = 1024
const FAILURE_DELAY_MS = 500

// Paths that are never content, even though the project root is served as static files.
const ALWAYS_HIDDEN = [/^\/node_modules(\/|$)/, /^\/package(-lock)?\.json$/]

export function loadConfig(env) {
  let secretTexts = null
  try {
    secretTexts = JSON.parse(env.HUNT_FRAGMENTS || '')
  } catch {
    return null
  }
  const secret = env.HUNT_SECRET
  if (!secretTexts || typeof secretTexts !== 'object' || typeof secret !== 'string' || secret.length < 32) return null
  const texts = {}
  for (const fragment of FRAGMENTS) {
    const text = fragment.text ?? secretTexts[fragment.id]
    if (typeof text !== 'string' || text === '') return null
    texts[fragment.id] = text.toLowerCase()
  }
  return { texts, passphrase: FRAGMENTS.map(f => texts[f.id]).join(''), secret }
}

function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  })
}

function notFound() {
  return new Response('Not Found', { status: 404, headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' } })
}

// Enforces the size cap before reading the body, then parses JSON. Returns { body } or { error: Response }.
async function readJson(request) {
  if (request.method !== 'POST') return { error: json(405, { error: 'method not allowed' }, { allow: 'POST' }) }
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY_BYTES) return { error: json(413, { error: 'too large' }) }
  const raw = await request.text()
  if (raw.length > MAX_BODY_BYTES) return { error: json(413, { error: 'too large' }) }
  try {
    const body = JSON.parse(raw)
    if (body && typeof body === 'object' && !Array.isArray(body)) return { body }
  } catch {
    // Falls through to the 400 below.
  }
  return { error: json(400, { error: 'bad request' }) }
}

// Hashing first gives both sides the same length, which timingSafeEqual requires.
function samePassphrase(input, expected) {
  const a = createHash('sha256').update(normalizePassphrase(input)).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

export async function handleFragment(request, env) {
  const config = loadConfig(env)
  if (!config) return json(503, { error: 'hunt offline' })
  const { body, error } = await readJson(request)
  if (error) return error
  if (!SECRET_IDS.includes(body.id)) return json(404, { error: 'unknown fragment' })
  return json(200, { id: body.id, text: config.texts[body.id] })
}

export async function handleUnlock(request, env, { delay = sleep } = {}) {
  const config = loadConfig(env)
  if (!config) return json(503, { error: 'hunt offline' })
  const { body, error } = await readJson(request)
  if (error) return error
  if (samePassphrase(body.passphrase, config.passphrase)) {
    return json(200, { ok: true }, { 'set-cookie': unlockCookie(unlockToken(config.secret)) })
  }
  await delay(FAILURE_DELAY_MS) // Slows guessing; the client shows its own ACCESS DENIED line meanwhile.
  return json(401, { ok: false })
}

export function handleSession(request, env) {
  const config = loadConfig(env)
  return json(200, { unlocked: config !== null && isUnlocked(request, config.secret) })
}

// Middleware decision: null lets the request through, a Response replaces it.
// The shell's code is served only to visitors holding a valid unlock cookie; everyone else gets the
// same 404 a missing file would, so the gate does not even confirm the files exist.
export function gate(request, env) {
  const { pathname } = new URL(request.url)
  if (ALWAYS_HIDDEN.some(pattern => pattern.test(pathname))) return notFound()
  const config = loadConfig(env)
  if (config && isUnlocked(request, config.secret)) return null
  return notFound()
}
