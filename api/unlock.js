// POST /api/unlock {passphrase} -> 200 with the signed unlock cookie, or 401.
import { handleUnlock } from '../lib/hunt.js'

export function POST(request) {
  return handleUnlock(request, process.env)
}
