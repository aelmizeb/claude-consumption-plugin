import type { SessionUsage } from 'claude-code'
import { expect } from 'claude-code/testing'
import type { FileEntry, Host } from '../src/host'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** The kit has no `toBeCloseTo`. */
export function near(value: number | null | undefined, target: number, tolerance: number) {
  expect(Math.abs((value ?? Number.NaN) - target)).toBeLessThan(tolerance)
}

/** How much of a file one `tail` hands over here, small enough to exercise the cut. */
export const TAIL_CHUNK = 64

/** A file system and an engine in memory: the tests run where the module runs, with neither. */
export class FakeHost implements Host {
  files = new Map<string, { bytes: Uint8Array; mtimeMs: number }>()
  store = new Map<string, unknown>()
  logs: string[] = []
  transcriptFile: string | undefined = '/home/.claude/projects/-proj/sess-1.jsonl'
  cwd = '/proj'
  measures: SessionUsage = { startedAt: 0, context: { window: 1_000_000, tokens: 200_000, percent: 20 }, rateLimits: [], cost: { usd: 1.5 } }

  write(path: string, text: string, mtimeMs = Date.now()) {
    this.files.set(path, { bytes: encoder.encode(text), mtimeMs })
  }

  append(path: string, text: string, mtimeMs = Date.now()) {
    const known = this.files.get(path)?.bytes ?? new Uint8Array()
    this.files.set(path, { bytes: new Uint8Array([...known, ...encoder.encode(text)]), mtimeMs })
  }

  private file(path: string) {
    const file = this.files.get(path)

    if (!file) throw new Error(`ENOENT: ${path}`)

    return file
  }

  transcript = () => this.transcriptFile
  folders = async () => [this.cwd, this.cwd]
  usage = async () => this.measures
  exists = async (path: string) => this.files.has(path)
  readBytes = async (path: string) => this.file(path).bytes
  readText = async (path: string) => decoder.decode(this.file(path).bytes)
  load = async (key: string) => this.store.get(key)
  log = (line: string) => void this.logs.push(line)

  save = async (key: string, value: unknown) => {
    this.store.set(key, value)
  }

  stat = async (path: string) => {
    const file = this.file(path)

    return { size: file.bytes.length, mtimeMs: file.mtimeMs }
  }

  list = async (path: string) => {
    const entries = new Map<string, FileEntry>()

    for (const [name, file] of this.files) {
      if (!name.startsWith(`${path}/`)) continue

      const [first, ...rest] = name.slice(path.length + 1).split('/')

      if (first) entries.set(first, { name: first, kind: rest.length > 0 ? 'dir' : 'file', size: file.bytes.length, mtimeMs: file.mtimeMs })
    }

    if (entries.size === 0) throw new Error(`ENOENT: ${path}`)

    return [...entries.values()]
  }

  tail = async (path: string, offset: number) => {
    const rest = this.file(path).bytes.subarray(offset)

    return { text: decoder.decode(rest.subarray(0, TAIL_CHUNK)), isCut: rest.length > TAIL_CHUNK }
  }
}
