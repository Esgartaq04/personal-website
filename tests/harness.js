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
