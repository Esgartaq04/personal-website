// Node runner: `node tests/run.mjs` from the repo root. Exits 1 on any failure.
import { run } from './harness.js'
import './all.js'
import './server.js'

const { fail } = await run()
process.exit(fail ? 1 : 0)
