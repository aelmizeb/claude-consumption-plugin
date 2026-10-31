import type { SessionUsage } from 'claude-code'

export type FileEntry = { name: string; kind: 'file' | 'dir' | 'other'; size: number; mtimeMs: number }

/**
 * Everything the monitor needs from outside the module, which has no Node and no file system of its
 * own: the hooks module answers it through the engine, the tests from memory.
 */
export type Host = {
  /** This session's transcript, as Claude Code last named it; none before its first event. */
  transcript(): Promise<string | undefined>
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
