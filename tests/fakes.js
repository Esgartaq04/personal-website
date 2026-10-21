// Test doubles shared by the shell and game tests.

// A localStorage stand-in; data is exposed so tests can seed or inspect what was written.
export function memoryStorage(initial = {}) {
  const data = { ...initial }
  return {
    getItem: key => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = String(value)
    },
    data,
  }
}

// The takeover host a game is handed: records frames, its key handlers, and how it finished.
export function fakeHost() {
  const host = { frames: [], finished: null, finishCount: 0, keyHandler: null, keyUpHandler: null }
  host.draw = text => host.frames.push(text)
  host.onKey = (down, up = null) => {
    host.keyHandler = down
    host.keyUpHandler = up
  }
  host.finish = lines => {
    host.finished = lines
    host.finishCount++
  }
  return host
}

// Timers the test ticks by hand: callback is the last scheduled tick, intervals every period asked for.
export function fakeTimers() {
  const timers = { callback: null, intervals: [], cleared: 0 }
  timers.setTimer = (fn, ms) => {
    timers.callback = fn
    timers.intervals.push(ms)
    return timers.intervals.length
  }
  timers.clearTimer = () => {
    timers.cleared++
  }
  return timers
}
