import { expect, test } from 'claude-code/testing'
import { periodStarts, readTranscriptCost, scanPeriodCosts } from '../src/costs'
import { FakeHost, near } from './fake-host'

const line = (object: unknown) => JSON.stringify(object) + '\n'
const assistant = (id: string, output: number) =>
  line({ type: 'assistant', message: { id, model: 'claude-fable-5-1', content: [{ type: 'text', text: 'x' }], usage: { input_tokens: 0, output_tokens: output, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } })

test('the week starts on Monday, the month on the first', () => {
  // Wednesday, October 28, 2026 at noon.
  const starts = periodStarts(new Date(2026, 9, 28, 12).getTime())
  expect(new Date(starts.week).getDate()).toBe(26)
  expect(new Date(starts.month).getDate()).toBe(1)
})

test('a transcript is worth its last cost-state plus an estimate of what follows', async () => {
  const host = new FakeHost()
  const file = '/dir/a.jsonl'

  host.write(file, assistant('m1', 1_000_000) + line({ type: 'cost-state', totalCostUSD: 3 }) + assistant('m2', 1_000_000) + assistant('m2', 1_000_000))
  const read = await readTranscriptCost(host, file)
  expect(read.estimated).toBe(false)
  near(read.usd, 53, 1e-9)
  expect(read.usage.output).toBe(2_000_000)

  host.write(file, assistant('m1', 1_000_000))
  const estimated = await readTranscriptCost(host, file)
  expect(estimated.usd).toBe(50)
  expect(estimated.estimated).toBe(true)

  host.write(file, line({ type: 'user', message: {} }))
  const unpriced = await readTranscriptCost(host, file)
  expect(unpriced.usd).toBeNull()
  expect(unpriced.usage.output).toBe(0)
})

test('sub-agent transcripts count in the tokens, and in the estimate when there is no cost-state', async () => {
  const host = new FakeHost()
  const file = '/dir/s.jsonl'

  host.write(file, assistant('m1', 1_000_000))
  host.write('/dir/s/subagents/agent-x.jsonl', assistant('a1', 1_000_000))

  const read = await readTranscriptCost(host, file)
  expect(read.usage.output).toBe(2_000_000)
  expect(read.usd).toBe(100)

  // With a cost-state line, the sub-agent is already inside the cost: only its tokens are added.
  host.write(file, assistant('m1', 1_000_000) + line({ type: 'cost-state', totalCostUSD: 60 }))
  const priced = await readTranscriptCost(host, file)
  expect(priced.usd).toBe(60)
  expect(priced.usage.output).toBe(2_000_000)
})

test('the scan sums the sessions of the period, except the one followed live', async () => {
  const host = new FakeHost()
  const root = '/home/.claude'
  const project = `${root}/projects/c--proj`

  host.write(`${project}/a.jsonl`, line({ type: 'cost-state', totalCostUSD: 3 }))
  host.write(`${project}/b.jsonl`, assistant('m1', 100_000)) // $5 estimated
  host.write(`${project}/c.jsonl`, line({ type: 'user', message: {} })) // unpriced
  host.write(`${project}/live.jsonl`, line({ type: 'cost-state', totalCostUSD: 999 }))

  const now = Date.now()
  const first = await scanPeriodCosts(host, root, new Set(['live']), {}, now)
  near(first.periods.week, 8, 1e-9)
  near(first.periods.month, 8, 1e-9)
  expect(first.periods.unpriced).toBe(1)
  expect(first.periods.estimated).toBe(1)
  expect(Object.keys(first.cache).length).toBe(3)
  // 100k output tokens on deepseek-v4-pro at peak rates: $0.396.
  near(first.periods.compareMonth, 0.396, 1e-9)

  // Second scan: nothing changed, the cache is reused and gives the same total.
  host.files.delete(`${project}/a.jsonl`.replace('a.jsonl', 'nothing'))
  const reads: string[] = []
  const stat = host.stat
  host.stat = async path => (reads.push(path), stat(path))
  const second = await scanPeriodCosts(host, root, new Set(['live']), first.cache, now)
  near(second.periods.month, 8, 1e-9)
  expect(reads).toEqual([])
})

test('a transcript that cannot be read counts as unpriced and the scan goes on', async () => {
  const host = new FakeHost()
  const root = '/home/.claude'
  const project = `${root}/projects/p`

  host.write(`${project}/bad.jsonl`, assistant('m1', 1))
  host.write(`${project}/good.jsonl`, line({ type: 'cost-state', totalCostUSD: 2 }))
  const read = host.readBytes
  host.readBytes = async path => {
    if (path.endsWith('bad.jsonl')) throw new Error('no tail on this machine')

    return read(path)
  }

  const scan = await scanPeriodCosts(host, root, new Set(), {}, Date.now())
  near(scan.periods.month, 2, 1e-9)
  expect(scan.periods.unpriced).toBe(1)
  expect(scan.failed.length).toBe(1)
})
