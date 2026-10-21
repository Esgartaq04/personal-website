// The arcade: `sudo 42` mounts ~/arcade, which holds the extra games. Hinted at in /etc/sudoers and
// ~/.secret. The unlock is remembered in the progress store (arcade: true), which is no more trusted
// than the rest of it: it only reveals a folder inside a shell the visitor has already unlocked.

import { register } from './core.js'
import { ARCADE_DIR, displayPath, withArcade } from './vfs.js'
import { platformerCommand } from './platformer.js'
import { tetrisCommand } from './tetris.js'

// Answers `sudo 42` through the builtin sudo's ctx.sudo hook, so the order of registration does not matter.
export function registerArcade(ctx) {
  ctx.sudo = (args, c) => (args.length === 1 && args[0] === '42' ? sudo42(c) : undefined)
  if (ctx.store && ctx.store.get().arcade) unlockArcade(ctx)
}

export function isUnlocked(ctx) {
  return ctx.arcade === true
}

export function unlockArcade(ctx) {
  if (!isUnlocked(ctx)) {
    ctx.arcade = true
    ctx.tree = withArcade(ctx.tree)
    register(ctx, 'tetris', tetrisCommand)
    register(ctx, 'platformer', platformerCommand)
  }
  if (ctx.store && !ctx.store.get().arcade) ctx.store.update(state => ({ ...state, arcade: true }))
}

function sudo42(ctx) {
  const where = displayPath(ARCADE_DIR, ctx.home)
  if (isUnlocked(ctx)) return { out: [`sudo: already granted. the arcade is in ${where}`] }
  unlockArcade(ctx)
  return {
    out: [
      '[sudo] the answer to life, the universe, and everything.',
      `access granted. a new directory appeared: ${where}`,
    ],
  }
}
