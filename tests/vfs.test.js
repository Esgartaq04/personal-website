import { test, assert, assertEqual, assertDeepEqual } from './harness.js'
import { HOME, TREE, displayPath, getNode, listDir, readFile, resolvePath } from '../shell/vfs.js'

const H = '/home/esteban'

const FIXTURE = {
  type: 'dir',
  children: {
    home: {
      type: 'dir',
      children: {
        esteban: {
          type: 'dir',
          children: {
            'notes.txt': { type: 'file', content: 'hello' },
            '.secret': { type: 'file', content: 'shh' },
            projects: { type: 'dir', children: { 'a.md': { type: 'file', content: '# a' } } },
          },
        },
      },
    },
  },
}

test('vfs: resolvePath joins relative paths onto cwd', () => {
  assertEqual(resolvePath(H, 'projects', H), '/home/esteban/projects')
})

test('vfs: resolvePath keeps absolute paths', () => {
  assertEqual(resolvePath(H, '/etc', H), '/etc')
})

test('vfs: resolvePath walks up with ..', () => {
  assertEqual(resolvePath('/home/esteban/projects', '..', H), H)
  assertEqual(resolvePath(H, '../..', H), '/')
})

test('vfs: resolvePath never climbs above root', () => {
  assertEqual(resolvePath('/', '../../..', H), '/')
})

test('vfs: resolvePath collapses repeated and trailing slashes', () => {
  assertEqual(resolvePath('/home', 'esteban//projects/', H), '/home/esteban/projects')
})

test('vfs: resolvePath skips . segments', () => {
  assertEqual(resolvePath(H, './projects/./a.md', H), '/home/esteban/projects/a.md')
})

test('vfs: resolvePath expands ~ and ~/ only', () => {
  assertEqual(resolvePath('/etc', '~', H), H)
  assertEqual(resolvePath('/etc', '~/notes.txt', H), '/home/esteban/notes.txt')
  assertEqual(resolvePath('/etc', '~x', H), '/etc/~x')
})

test('vfs: resolvePath of an empty string is cwd', () => {
  assertEqual(resolvePath(H, '', H), H)
})

test('vfs: getNode of / is the tree itself', () => {
  assertEqual(getNode(FIXTURE, '/'), FIXTURE)
})

test('vfs: getNode returns null for missing paths, paths through files, and prototype keys', () => {
  assertEqual(getNode(FIXTURE, '/nope'), null)
  assertEqual(getNode(FIXTURE, '/home/esteban/notes.txt/x'), null)
  assertEqual(getNode(FIXTURE, '/constructor'), null)
  assertEqual(getNode(FIXTURE, '/home/esteban/toString'), null)
})

test('vfs: listDir sorts, hides dotfiles, and marks directories', () => {
  assertDeepEqual(listDir(FIXTURE, H), { ok: true, names: ['notes.txt', 'projects/'] })
})

test('vfs: listDir shows dotfiles with all', () => {
  assertDeepEqual(listDir(FIXTURE, H, { all: true }), { ok: true, names: ['.secret', 'notes.txt', 'projects/'] })
})

test('vfs: listDir reports missing paths and files', () => {
  assertDeepEqual(listDir(FIXTURE, '/nope'), { ok: false, error: 'ENOENT' })
  assertDeepEqual(listDir(FIXTURE, `${H}/notes.txt`), { ok: false, error: 'ENOTDIR' })
})

test('vfs: readFile returns content and reports directories and missing paths', () => {
  assertDeepEqual(readFile(FIXTURE, `${H}/notes.txt`), { ok: true, content: 'hello' })
  assertDeepEqual(readFile(FIXTURE, `${H}/projects`), { ok: false, error: 'EISDIR' })
  assertDeepEqual(readFile(FIXTURE, '/nope'), { ok: false, error: 'ENOENT' })
})

test('vfs: displayPath abbreviates home and nothing that merely starts with it', () => {
  assertEqual(displayPath(H, H), '~')
  assertEqual(displayPath(`${H}/projects`, H), '~/projects')
  assertEqual(displayPath('/home/estebanx', H), '/home/estebanx')
  assertEqual(displayPath('/etc', H), '/etc')
})

test('vfs: the real tree has home, motd, and a hidden .secret', () => {
  assertEqual(HOME, '/home/esteban')
  assert(readFile(TREE, `${HOME}/about.txt`).ok)
  assert(readFile(TREE, '/etc/motd').ok)
  const names = listDir(TREE, HOME).names
  assert(names.includes('projects/'))
  assert(!names.includes('.secret'))
  assert(listDir(TREE, HOME, { all: true }).names.includes('.secret'))
})

test('vfs: no file in the real tree is empty', () => {
  const walk = (node, path) =>
    node.type === 'file' ? [[path, node]] : Object.entries(node.children).flatMap(([name, child]) => walk(child, `${path}/${name}`))
  for (const [path, node] of walk(TREE, '')) {
    assert(typeof node.content === 'string' && node.content.length > 0, `${path} is empty`)
  }
})
