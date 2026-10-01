// POST /api/fragment {id} -> {id, text} for a secret fragment whose trigger fired in the browser.
import { handleFragment } from '../lib/hunt.js'

export function POST(request) {
  return handleFragment(request, process.env)
}
