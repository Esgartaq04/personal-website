import { test, assert, assertEqual } from './harness.js'
import { GLYPHS, TRAIL, createRain, glyphAt, matrixCommand, renderRain, startMatrix, stepRain } from '../shell/matrix.js'

function fakeHost() {
  const host = { frames: [], finished: null, finishCount: 0, keyHandler: null }
  host.draw = text => host.frames.push(text)
  host.onKey = handler => {
    host.keyHandler = handler
  }
  host.finish = lines => {
    host.finished = lines
    host.finishCount++
  }
  return host
}

function fakeTimers() {
  const timers = { callback: null, cleared: false }
  timers.setTimer = fn => {
    timers.callback = fn
    return 1
  }
  timers.clearTimer = () => {
    timers.cleared = true
  }
  return timers
}

test('matrix: createRain gives every column a drop above or at the top', () => {
  const rain = createRain(8, 5, () => 0.5)
  assertEqual(rain.drops.length, 8)
  assert(rain.drops.every(drop => drop.y <= 0 && drop.speed >= 1))
})

test('matrix: stepRain moves drops down by their speed and recycles ones past the bottom', () => {
  const rain = { width: 2, height: 4, tick: 0, drops: [{ y: 1, speed: 2 }, { y: 4 + TRAIL, speed: 1 }] }
  const next = stepRain(rain, () => 0)
  assertEqual(next.drops[0].y, 3)
  assertEqual(next.drops[1].y, 0)
  assertEqual(next.tick, 1)
  assertEqual(rain.drops[0].y, 1, 'stepRain must not mutate')
})

test('matrix: renderRain draws a trail behind each head and a quit hint', () => {
  const rain = { width: 3, height: 4, tick: 0, drops: [{ y: 1, speed: 1 }, { y: -5, speed: 1 }, { y: 3, speed: 1 }] }
  const lines = renderRain(rain).split('\n')
  assertEqual(lines.length, 6)
  assert(lines.slice(0, 4).every(line => line.length === 3), 'rows must be exactly the board width')
  assertEqual(lines[0][1], ' ')
  assert(lines[0][0] !== ' ' && lines[1][0] !== ' ' && lines[2][0] === ' ')
  assertEqual(lines[5], 'press q to wake up')
})

test('matrix: glyphs are single-width ASCII so columns stay aligned', () => {
  assert([...GLYPHS].every(ch => ch.charCodeAt(0) < 128))
  assert(GLYPHS.includes(glyphAt(3, 9, 77)))
})

test('matrix: startMatrix draws, ticks, and quits on q with the timer cleared', () => {
  const host = fakeHost()
  const timers = fakeTimers()
  startMatrix(host, { rng: () => 0, setTimer: timers.setTimer, clearTimer: timers.clearTimer, width: 4, height: 3 })
  assertEqual(host.frames.length, 1)
  timers.callback()
  assertEqual(host.frames.length, 2)
  host.keyHandler('x')
  assertEqual(host.finishCount, 0)
  host.keyHandler('Q')
  assert(timers.cleared)
  assertEqual(host.finished[0], 'wake up, visitor.')
  host.keyHandler('escape')
  assertEqual(host.finishCount, 1, 'finish is reported once')
})

test('matrix: the command hands the shell a takeover', () => {
  const result = matrixCommand.run([], {})
  assertEqual(typeof result.takeover, 'function')
})
