// Local server that behaves like the Vercel deployment: static files, the /root rewrite, the api/
// handlers, and the middleware gate. Zero dependencies, so the hunt can be tested without a Vercel login.
//
//   npm run serve            # http://localhost:8765
//   PORT=9000 npm run serve
//
// Reads HUNT_FRAGMENTS and HUNT_SECRET from the environment, then from .env.local (test values: see README).

import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gate, handleFragment, handleSession, handleUnlock } from '../lib/hunt.js'
import { config as middlewareConfig } from '../middleware.js'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const PORT = Number(process.env.PORT || 8765)

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
}

function loadEnv() {
  const env = { ...process.env }
  const file = join(ROOT, '.env.local')
  if (!existsSync(file)) return env
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!match || env[match[1]] !== undefined) continue
    let value = match[2]
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1)
    env[match[1]] = value
  }
  return env
}

const ENV = loadEnv()
const ROUTES = {
  '/api/fragment': request => handleFragment(request, ENV),
  '/api/unlock': request => handleUnlock(request, ENV),
  '/api/session': request => handleSession(request, ENV),
}

// Vercel matcher syntax used in middleware.js: exact paths, or a prefix ending in /:path*.
function matchesMiddleware(pathname) {
  return middlewareConfig.matcher.some(pattern =>
    pattern.endsWith('/:path*') ? pathname.startsWith(pattern.slice(0, -':path*'.length)) : pathname === pattern,
  )
}

async function toWebRequest(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const body = chunks.length ? Buffer.concat(chunks) : undefined
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value)
  }
  return new Request(`http://localhost:${PORT}${req.url}`, {
    method: req.method,
    headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
  })
}

async function send(res, response) {
  res.writeHead(response.status, Object.fromEntries(response.headers))
  res.end(Buffer.from(await response.arrayBuffer()))
}

async function serveStatic(pathname, res) {
  const path = normalize(join(ROOT, decodeURIComponent(pathname === '/' ? '/index.html' : pathname)))
  if (path !== ROOT && !path.startsWith(ROOT + sep)) return send(res, new Response('Not Found', { status: 404 }))
  try {
    if (!(await stat(path)).isFile()) throw new Error('not a file')
    res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream', 'cache-control': 'no-store' })
    res.end(await readFile(path))
  } catch {
    await send(res, new Response('Not Found', { status: 404, headers: { 'content-type': 'text/plain' } }))
  }
}

createServer(async (req, res) => {
  try {
    let { pathname } = new URL(req.url, 'http://localhost')
    if (pathname === '/root') pathname = '/root.html' // vercel.json rewrite
    const request = await toWebRequest(req)
    if (ROUTES[pathname]) return await send(res, await ROUTES[pathname](request))
    if (pathname.startsWith('/api/')) return await send(res, new Response('Not Found', { status: 404 }))
    if (matchesMiddleware(pathname)) {
      const blocked = gate(request, ENV)
      if (blocked) return await send(res, blocked)
    }
    await serveStatic(pathname, res)
  } catch (error) {
    console.error(error)
    res.writeHead(500).end('Internal Server Error')
  }
}).listen(PORT, () => {
  const ready = ENV.HUNT_FRAGMENTS && ENV.HUNT_SECRET
  console.log(`serving ${ROOT} at http://localhost:${PORT}`)
  if (!ready) console.log('HUNT_FRAGMENTS / HUNT_SECRET not set: /root cannot unlock. See README.')
})
