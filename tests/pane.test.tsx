import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

const PANE = {
  plugin: 'consumption-hud',
  component: 'Pane',
  requestId: 'consumption',
  props: {
    title: 'Consumption',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 24 },
    view: {},
  },
} as const

const usage = { input: 1000, output: 2000, cacheRead: 3000, cacheWrite: 0, cacheWrite1h: 0 }
const SNAPSHOT = {
  loops: [
    { id: 'main', type: 'main', description: '', status: 'running', startedAt: 0, steps: 1, usage, tool: 'Bash' },
    { id: 'a1', type: 'Explore', description: 'Find the reader', status: 'running', startedAt: 0, steps: 1, usage, tool: 'Grep', parentId: 'main' },
  ],
  memory: { entries: ['a'], readAt: 0 },
  figures: { contextPercent: 42, sessionUsd: 1.25, fiveHourPercent: 10, sevenDayPercent: 90 },
  sessionId: 'sess',
  project: 'p',
}

const stored = () => ({ value: { value: { shape: 'snapshot-1', value: SNAPSHOT }, version: 1 } })

test('before the first snapshot the pane says so, on every surface', async $ => {
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })

    expect((await ui.find({ type: 'Text' }))?.text).toBe('Waiting for a Claude Code session…')
    await ui.unmount()
  }
})

test('the surfaces that draw SVG get the scene and the agents below it', async ($, on) => {
  on('state.get', stored)

  for (const surface of ['desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })

    expect(await ui.find({ type: 'Svg' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Explore Grep 6\.0k/ })).toBeDefined()
    await ui.unmount()
  }
})

test('the terminal gets the raster and the figures as text', async ($, on) => {
  on('state.get', stored)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  expect(await ui.find({ key: 'city' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /CONTEXT 42%/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /SESSION COST \$1\.25/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Find the reader/ })).toBeDefined()
  await ui.unmount()
})

test('a snapshot stored by an earlier version is declined', async ($, on) => {
  on('state.get', () => ({ value: { value: { loops: 'old' }, version: 1 } }))

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  expect((await ui.find({ type: 'Text' }))?.text).toBe('Waiting for a Claude Code session…')
  await ui.unmount()
})

const hostedSession = (on: Parameters<TestBody>[1], surfaces: readonly ('vscode' | 'desktop')[]) => {
  const opened: string[] = []

  on('command.register', () => ({ value: { command: 'consumption' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.attach', (_, e) => ({ clientId: e.clientId }))
  on('session.surfaces', () => ({ value: surfaces }))
  on('ui.open', (_, e) => {
    opened.push(e.id)

    return { value: { isPlaced: true } }
  })

  return opened
}

test('a session the editor hosts is not interactive, and the pane opens all the same', async ($, on) => {
  const opened = hostedSession(on, ['vscode'])

  await $.session.start({ cwd: '/', surface: null, isInteractive: false })

  expect(opened).toEqual(['consumption'])
})

test('a surface attaching after the start opens the pane, once', async ($, on) => {
  const opened = hostedSession(on, [])

  await $.session.start({ cwd: '/', surface: null, isInteractive: false })
  expect(opened).toEqual([])

  await $.session.attach({ surface: 'vscode', clientId: 'vscode:default' })
  await $.session.attach({ surface: 'desktop', clientId: 'desktop:default' })
  expect(opened).toEqual(['consumption'])
})

test('a run with no surface starts nothing', async ($, on) => {
  const opened = hostedSession(on, [])

  await $.session.start({ cwd: '/', surface: null, isInteractive: false })

  expect(opened).toEqual([])
})

test('a session already running learns its transcript at the end of a turn', async ($, on) => {
  const written: unknown[] = []

  on('classic.Stop', () => ({}))
  on('state.get', () => ({ value: { value: undefined, version: 1 } }))
  on('state.set', (_, e) => {
    written.push(e)

    return { value: { isSet: true, version: 2 } }
  })

  await $.classic.Stop({ stop_hook_active: false, transcript_path: '/home/.claude/projects/p/s.jsonl' })

  expect(JSON.stringify(written)).toContain('/home/.claude/projects/p/s.jsonl')
})
