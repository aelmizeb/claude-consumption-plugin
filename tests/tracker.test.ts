import { expect, test } from 'claude-code/testing'
import { near } from './fake-host'
import { LoopTracker } from '../src/tracker'
import { totalTokens } from '../src/types'

const usage = (input: number, output: number, cacheRead = 0, cacheWrite = 0, oneHour = 0) => ({
  input_tokens: input,
  output_tokens: output,
  cache_read_input_tokens: cacheRead,
  cache_creation_input_tokens: cacheWrite,
  cache_creation: { ephemeral_1h_input_tokens: oneHour, ephemeral_5m_input_tokens: cacheWrite - oneHour },
})

const assistant = (id: string, content: unknown[], u: ReturnType<typeof usage>, stop = 'tool_use', at = '2026-10-28T10:00:00.000Z') =>
  JSON.stringify({ type: 'assistant', timestamp: at, message: { id, model: 'claude-fable-5-1', content, usage: u, stop_reason: stop } })

const user = (content: unknown, extra: Record<string, unknown> = {}, at = '2026-10-28T10:00:01.000Z') =>
  JSON.stringify({ type: 'user', timestamp: at, message: { role: 'user', content }, ...extra })

test('lines that repeat the same message.id count as a single request', () => {
  const tracker = new LoopTracker()

  tracker.apply(user('Hello'))
  tracker.apply(assistant('msg_1', [{ type: 'thinking', thinking: '' }], usage(2, 450, 30516, 18946, 18946)))
  tracker.apply(assistant('msg_1', [{ type: 'text', text: 'ok' }], usage(2, 450, 30516, 18946, 18946)))
  tracker.apply(assistant('msg_1', [{ type: 'tool_use', id: 'toolu_1', name: 'Bash', input: {} }], usage(2, 450, 30516, 18946, 18946)))

  expect(tracker.steps).toBe(1)
  expect(totalTokens(tracker.usage)).toBe(2 + 450 + 30516 + 18946)
  expect(tracker.status).toBe('running')
  expect(tracker.tool).toBe('Bash')
  expect(tracker.contextTokens).toBe(2 + 30516 + 18946)
})

test('a tool result releases the tool, end_turn puts the loop to idle', () => {
  const tracker = new LoopTracker()

  tracker.apply(assistant('msg_1', [{ type: 'tool_use', id: 'toolu_1', name: 'Grep', input: {} }], usage(1, 1)))
  tracker.apply(user([{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'x' }]))
  expect(tracker.tool).toBeUndefined()
  expect(tracker.status).toBe('running')

  tracker.apply(assistant('msg_2', [{ type: 'text', text: 'done' }], usage(1, 1), 'end_turn'))
  expect(tracker.status).toBe('idle')
  expect(tracker.steps).toBe(2)
  expect(tracker.sawEndTurn).toBe(true)
})

test('the Agent tool records the sub-agent with its description and type', () => {
  const tracker = new LoopTracker()

  tracker.apply(assistant('msg_1', [{ type: 'tool_use', id: 'toolu_9', name: 'Agent', input: { description: 'Explore', subagent_type: 'Explore', prompt: '…' } }], usage(1, 1)))
  tracker.apply(user([{ type: 'tool_result', tool_use_id: 'toolu_9', content: 'launched' }], { toolUseResult: { isAsync: true, agentId: 'a1', description: 'Explore', resolvedModel: 'claude-haiku-5-5' } }))

  const spawn = tracker.agents.get('a1')
  if (!spawn) throw new Error('missing sub-agent')
  expect(spawn.type).toBe('Explore')
  expect(spawn.description).toBe('Explore')
  expect(spawn.model).toBe('claude-haiku-5-5')
})

test('the cost follows cost-state then estimates what follows; without cost-state everything is estimated', () => {
  const tracker = new LoopTracker()

  tracker.apply(assistant('msg_1', [{ type: 'text', text: 'a' }], usage(1_000_000, 0)))
  expect(tracker.cost()).toEqual({ usd: 10, estimated: true })

  tracker.apply(JSON.stringify({ type: 'cost-state', totalCostUSD: 7.5 }))
  expect(tracker.cost()).toEqual({ usd: 7.5, estimated: false })

  tracker.apply(assistant('msg_2', [{ type: 'text', text: 'b' }], usage(0, 1_000_000)))
  const after = tracker.cost()
  expect(after.estimated).toBe(false)
  near(after.usd, 57.5, 1e-9)
})

test('compaction sets the context size', () => {
  const tracker = new LoopTracker()

  tracker.apply(JSON.stringify({ type: 'system', subtype: 'compact_boundary', compactMetadata: { preTokens: 967332, postTokens: 19204 } }))
  expect(tracker.contextTokens).toBe(19204)
})
