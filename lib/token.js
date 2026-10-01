// Signed tokens for the /root unlock cookie. Server-only: imported by api/ and middleware.js.
// Format: base64url(JSON payload) + '.' + base64url(HMAC-SHA256(payload, secret)).

import { createHmac, timingSafeEqual } from 'node:crypto'

export const COOKIE_NAME = 'egt_root'
export const MAX_AGE_SECONDS = 60 * 60 * 24 * 30

function mac(body, secret) {
  return createHmac('sha256', secret).update(body).digest('base64url')
}

export function sign(payload, secret) {
  if (!secret) throw new Error('missing signing secret')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${mac(body, secret)}`
}

// Returns the payload, or null for anything malformed, tampered with, or expired.
export function verify(token, secret, now = Date.now()) {
  if (!secret || typeof token !== 'string') return null
  const dot = token.indexOf('.')
  if (dot <= 0 || dot !== token.lastIndexOf('.')) return null
  const body = token.slice(0, dot)
  const given = Buffer.from(token.slice(dot + 1))
  const expected = Buffer.from(mac(body, secret))
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  let payload
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (!payload || typeof payload !== 'object' || typeof payload.exp !== 'number' || payload.exp <= now) return null
  return payload
}

export function unlockToken(secret, now = Date.now()) {
  return sign({ root: true, exp: now + MAX_AGE_SECONDS * 1000 }, secret)
}

export function readCookie(request, name = COOKIE_NAME) {
  const header = request.headers.get('cookie') || ''
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq !== -1 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim()
  }
  return null
}

export function isUnlocked(request, secret, now = Date.now()) {
  const payload = verify(readCookie(request), secret, now)
  return payload !== null && payload.root === true
}

export function unlockCookie(token) {
  return `${COOKIE_NAME}=${token}; Path=/; Max-Age=${MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Strict`
}
