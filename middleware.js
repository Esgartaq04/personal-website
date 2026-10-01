// Vercel Routing Middleware. Only runs on the paths in config.matcher; everything else is plain static hosting.
// /root's lock screen (root.html, lock.js) stays public. The shell behind it is served only with a valid
// unlock cookie, so its code cannot be read or run by skipping the hunt.
import { next } from '@vercel/functions'
import { gate } from './lib/hunt.js'

export const config = {
  runtime: 'nodejs',
  matcher: ['/shell.js', '/shell/:path*', '/node_modules/:path*', '/package.json', '/package-lock.json'],
}

export default function middleware(request) {
  return gate(request, process.env) ?? next()
}
