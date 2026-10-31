import type { Host } from './host'

/** Up to here the file is read whole through the engine; past it (the engine refuses over 4 MiB), with `tail`. */
export const WHOLE_READ_LIMIT = 4_000_000

const decoder = new TextDecoder()
const encoder = new TextEncoder()

/**
 * Reads a line-oriented file incrementally: every call only hands over the complete lines appended since
 * the previous one. A file that shrank (truncated, replaced) is read again from the start.
 */
export class LineReader {
  private offset = 0
  /** Part of a line too long for one read was passed: drop the rest of it. */
  private skipping = false

  constructor(private readonly host: Host, public readonly path: string) {}

  /** Calls `onLine` for every new complete line; returns the number of lines read. */
  async read(onLine: (line: string) => void): Promise<number> {
    const { size } = await this.host.stat(this.path)
    let count = 0

    if (size < this.offset) this.reset()

    while (this.offset < size) {
      const text = size <= WHOLE_READ_LIMIT ? await this.fromWhole() : await this.fromTail()

      if (text === undefined) break

      count += this.emit(text, onLine)
    }

    return count
  }

  reset() {
    this.offset = 0
    this.skipping = false
  }

  private async fromWhole(): Promise<string | undefined> {
    const bytes = (await this.host.readBytes(this.path)).subarray(this.offset)
    const end = bytes.lastIndexOf(10)

    if (end < 0) return undefined

    this.offset += end + 1

    return decoder.decode(bytes.subarray(0, end + 1))
  }

  private async fromTail(): Promise<string | undefined> {
    const { text, isCut } = await this.host.tail(this.path, this.offset)
    const end = text.lastIndexOf('\n')

    if (end < 0) {
      if (!isCut) return undefined

      // One line longer than a whole read (a pasted image): step over it.
      this.offset += encoder.encode(text).length
      this.skipping = true

      return ''
    }

    const complete = text.slice(0, end + 1)
    this.offset += encoder.encode(complete).length

    return complete
  }

  private emit(text: string, onLine: (line: string) => void): number {
    const parts = text.split('\n')
    let count = 0

    parts.pop()
    if (this.skipping && parts.length > 0) {
      parts.shift()
      this.skipping = false
    }

    for (const part of parts) {
      const line = part.endsWith('\r') ? part.slice(0, -1) : part

      if (line.length === 0) continue

      onLine(line)
      count += 1
    }

    return count
  }
}
