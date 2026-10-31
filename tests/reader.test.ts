import { expect, test } from 'claude-code/testing'
import { LineReader, WHOLE_READ_LIMIT } from '../src/reader'
import { FakeHost } from './fake-host'

const FILE = '/f.jsonl'
const collect = async (reader: LineReader) => {
  const lines: string[] = []

  await reader.read(line => lines.push(line))

  return lines
}

test('only complete lines come out, each once, as the file grows', async () => {
  const host = new FakeHost()
  const reader = new LineReader(host, FILE)

  host.write(FILE, 'é one\ntwo\npart')
  expect(await collect(reader)).toEqual(['é one', 'two'])
  expect(await collect(reader)).toEqual([])

  host.append(FILE, 'ial\nthree\n')
  expect(await collect(reader)).toEqual(['partial', 'three'])
})

test('a file that shrank is read from the start', async () => {
  const host = new FakeHost()
  const reader = new LineReader(host, FILE)

  host.write(FILE, 'a long first line\n')
  await collect(reader)
  host.write(FILE, 'b\n')
  expect(await collect(reader)).toEqual(['b'])
})

test('past the limit the file is read with tail, across its cuts, byte offsets included', async () => {
  const host = new FakeHost()
  const reader = new LineReader(host, FILE)
  const line = 'é'.repeat(10)
  const count = Math.ceil(WHOLE_READ_LIMIT / 21) + 1

  host.write(FILE, `${line}\n`.repeat(count))
  const lines = await collect(reader)

  expect(lines.length).toBe(count)
  expect(lines.every(one => one === line)).toBe(true)

  host.append(FILE, 'after\n')
  expect(await collect(reader)).toEqual(['after'])
})

test('a line longer than one read is stepped over', async () => {
  const host = new FakeHost()
  const reader = new LineReader(host, FILE)
  const padding = 'p\n'.repeat(WHOLE_READ_LIMIT / 2)

  host.write(FILE, `${padding}${'x'.repeat(1000)}\nlast\n`)
  const lines = await collect(reader)

  expect(lines.length).toBe(WHOLE_READ_LIMIT / 2 + 1)
  expect(lines.at(-1)).toBe('last')
  expect(lines.some(one => one.includes('x'))).toBe(false)
})
