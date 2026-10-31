import { expect, test } from 'claude-code/testing'
import { Session } from '../src/session'
import { FakeHost } from './fake-host'

const line = (object: unknown) => JSON.stringify(object) + '\n'
const usage = { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

test('a session reads its transcript incrementally and discovers its sub-agents', async () => {
  const host = new FakeHost()
  const dir = '/projects/p'
  const id = 'sess-1'
  const file = `${dir}/${id}.jsonl`
  const at = new Date().toISOString()

  host.write(file, line({ type: 'user', timestamp: at, message: { role: 'user', content: 'Go' } }))
  const session = new Session(host, id, file, 'p')
  expect(await session.refresh()).toBe(true)

  let loops = session.loops(Date.now(), 600_000)
  expect(loops.length).toBe(1)
  expect(loops[0]?.status).toBe('running')

  // The Agent tool is called, then its transcript shows up.
  host.append(
    file,
    line({ type: 'assistant', timestamp: at, message: { id: 'm1', model: 'claude-fable-5-1', content: [{ type: 'tool_use', id: 't1', name: 'Agent', input: { description: 'Explore', subagent_type: 'Explore' } }], usage } }) +
      line({ type: 'user', timestamp: at, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] }, toolUseResult: { agentId: 'abc', description: 'Explore' } }),
  )
  await session.refresh()
  loops = session.loops(Date.now(), 600_000)
  expect(loops.length).toBe(2)
  expect(loops[1]?.status).toBe('pending')
  expect(loops[1]?.type).toBe('Explore')

  const sub = `${dir}/${id}/subagents`
  host.write(
    `${sub}/agent-abc.jsonl`,
    line({ type: 'user', isSidechain: true, agentId: 'abc', timestamp: at, message: { role: 'user', content: 'prompt' } }) +
      line({ type: 'assistant', isSidechain: true, agentId: 'abc', timestamp: at, message: { id: 'a1', model: 'claude-haiku-5-5', content: [{ type: 'tool_use', id: 't2', name: 'Grep', input: {} }], usage } }),
    1000,
  )
  await session.refresh()
  loops = session.loops(Date.now(), 600_000)
  expect(loops[1]?.status).toBe('running')
  expect(loops[1]?.tool).toBe('Grep')
  expect(loops[1]?.usage.output).toBe(20)

  host.write(`${sub}/agent-abc.meta.json`, JSON.stringify({ agentType: 'Explore', description: 'Explore the repository', finished: true }), 1001)
  host.append(`${sub}/agent-abc.jsonl`, line({ type: 'assistant', isSidechain: true, agentId: 'abc', timestamp: at, message: { id: 'a2', model: 'claude-haiku-5-5', content: [{ type: 'text', text: 'done' }], usage, stop_reason: 'end_turn' } }), 1002)
  await session.refresh()
  loops = session.loops(Date.now(), 600_000)
  expect(loops[1]?.status).toBe('completed')
  expect(loops[1]?.description).toBe('Explore the repository')
  expect(loops[1]?.steps).toBe(2)
})
