import type { EngineInterface, SessionUsage } from 'claude-code'

export type FileEntry = { name: string; kind: 'file' | 'dir' | 'other'; size: number; mtimeMs: number }

/**
 * Everything the monitor needs from outside the module, which has no Node and no file system of its
 * own: `createHost` answers it through the engine, the tests from memory.
 */
export type Host = {
  /** The Claude Code configuration directory. */
  configDir(): Promise<string>
  sessionId(): Promise<string>
  /** The folders of this session: where it runs and its project root. */
  folders(): Promise<string[]>
  usage(): Promise<SessionUsage>
  stat(path: string): Promise<{ size: number; mtimeMs: number }>
  list(path: string): Promise<FileEntry[]>
  exists(path: string): Promise<boolean>
  readText(path: string): Promise<string>
  readBytes(path: string): Promise<Uint8Array>
  /** The file from byte `offset` on, as far as one read goes; `isCut` says there is more. */
  tail(path: string, offset: number): Promise<{ text: string; isCut: boolean }>
  load(key: string): Promise<unknown>
  save(key: string, value: unknown): Promise<void>
  log(line: string): void
}

export function createHost($: EngineInterface): Host {
  return {
    async configDir() {
      const custom = ((await $.env.get('CLAUDE_CONFIG_DIR')) ?? '').trim()

      if (custom) return custom.replace(/[\\/]+$/, '')

      const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE')) ?? ''

      return `${home.replace(/[\\/]+$/, '')}/.claude`
    },
    sessionId: () => $.session.id(),
    folders: async () => [await $.session.cwd(), await $.session.root()],
    usage: () => $.session.usage(),
    stat: path => $.fs.stat(path),
    list: async path => [...(await $.fs.list(path))],
    exists: path => $.fs.exists(path),
    readText: path => $.fs.read(path),
    readBytes: async path => Uint8Array.fromBase64((await $.fs.read(path, { as: 'bytes' })).base64),
    async tail(path, offset) {
      const { exitCode, stdout, stderr, isStdoutTruncated } = await $.process.run(['tail', '-c', `+${offset + 1}`, path], { timeoutMs: 60_000 })

      if (exitCode !== 0) throw new Error(`tail exited with ${exitCode}: ${stderr.slice(0, 200)}`)

      return { text: stdout, isCut: isStdoutTruncated === true }
    },
    load: key => $.store.get(key),
    save: (key, value) => $.store.set(key, value),
    log: line => void $.ui.log(line, { to: 'debug' }),
  }
}
