import { expect, test } from 'claude-code/testing'
import { Monitor } from '../src/monitor'
import type { FleetSnapshot } from '../src/types'
import { FakeHost, near } from './fake-host'

const line = (object: unknown) => JSON.stringify(object) + '\n'
const usage = { input_tokens: 0, output_tokens: 1_000_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const assistant = (id: string) => line({ type: 'assistant', timestamp: new Date().toISOString(), message: { id, model: 'claude-fable-5-1', content: [{ type: 'text', text: 'x' }], usage, stop_reason: 'end_turn' } })
const PROJECT = '/home/.claude/projects/-proj'

function setup(compareWithDeepSeek = false) {
  const host = new FakeHost()
  const published: FleetSnapshot[] = []
  const monitor = new Monitor(host, { idleAfterSeconds: 600, compareWithDeepSeek }, snapshot => void published.push(snapshot))

  return { host, published, monitor }
}

test('the figures come from the engine, the tokens from the transcript of this session', async () => {
  const { host, published, monitor } = setup()

  host.write(`${PROJECT}/sess-1.jsonl`, assistant('m1'))
  host.write(`${PROJECT}/memory/MEMORY.md`, '- [One](one.md) — a\n- [Two](two.md) — b\nnot an entry\n')
  host.measures = {
    startedAt: 0,
    context: { window: 1_000_000, tokens: 420_000, percent: 42 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 12.5 }, { kind: 'seven_day', percentUsed: 30 }],
    cost: { usd: 2.5 },
  }

  await monitor.tick()

  const shown = published.at(-1)
  expect(shown?.sessionId).toBe('sess-1')
  expect(shown?.loops[0]?.usage.output).toBe(1_000_000)
  expect(shown?.memory.entries).toEqual(['One', 'Two'])
  expect(shown?.figures.contextPercent).toBe(42)
  expect(shown?.figures.sessionUsd).toBe(2.5)
  expect(shown?.figures.sessionEstimated).toBe(false)
  expect(shown?.figures.fiveHourPercent).toBe(12.5)
  expect(shown?.figures.sevenDayPercent).toBe(30)
})

test('nothing is published while nothing changes', async () => {
  const { host, published, monitor } = setup()

  host.write(`${PROJECT}/sess-1.jsonl`, assistant('m1'))
  await monitor.tick()
  await monitor.tick()
  expect(published.length).toBe(1)

  host.append(`${PROJECT}/sess-1.jsonl`, assistant('m2'))
  await monitor.tick()
  expect(published.length).toBe(2)
})

test('week and month add this session to the others, counted once', async () => {
  const { host, published, monitor } = setup(true)

  host.write(`${PROJECT}/sess-1.jsonl`, assistant('m1'))
  host.write(`${PROJECT}/other.jsonl`, line({ type: 'cost-state', totalCostUSD: 3 }))

  await monitor.tick()
  await monitor.rescanCosts()

  const { figures } = published.at(-1) ?? {}
  near(figures?.weekUsd, 4.5, 1e-9)
  near(figures?.monthUsd, 4.5, 1e-9)
  expect(figures?.compareLabel).toBe('DEEPSEEK')
  // A million output tokens on deepseek-v4-pro: $3.96.
  near(figures?.compareSessionUsd, 3.96, 1e-9)
  expect(host.store.size).toBe(1)
})

test('a /clear moves on to the new transcript', async () => {
  const { host, published, monitor } = setup()

  host.write(`${PROJECT}/sess-1.jsonl`, assistant('m1'))
  await monitor.tick()

  host.transcriptFile = `${PROJECT}/sess-2.jsonl`
  host.write(`${PROJECT}/sess-2.jsonl`, assistant('m2') + assistant('m3'))
  await monitor.tick()

  expect(published.at(-1)?.sessionId).toBe('sess-2')
  expect(published.at(-1)?.loops[0]?.steps).toBe(2)
})

test('a transcript that cannot be read still leaves the figures of the engine', async () => {
  const { host, published, monitor } = setup()

  host.write(`${PROJECT}/sess-1.jsonl`, assistant('m1'))
  host.readBytes = async () => {
    throw new Error('refused')
  }
  await monitor.tick()

  expect(published.at(-1)?.figures.sessionUsd).toBe(1.5)
  expect(host.logs.some(one => one.includes('Transcript unreadable'))).toBe(true)
})

test('a session with no transcript yet shows the engine figures and no loop', async () => {
  const { host, published, monitor } = setup()

  host.transcriptFile = undefined
  await monitor.tick()

  expect(published.at(-1)?.loops).toEqual([])
  expect(published.at(-1)?.figures.contextPercent).toBe(20)
})
