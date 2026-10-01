// GET /api/session -> {unlocked}. Lets /root decide between the lock screen and the shell.
import { handleSession } from '../lib/hunt.js'

export function GET(request) {
  return handleSession(request, process.env)
}
