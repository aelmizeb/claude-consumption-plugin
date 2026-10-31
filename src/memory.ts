import type { Host } from './host'
import { dirname, memoryIndexFor } from './paths'
import type { FleetMemory } from './types'

/** Reads the MEMORY.md index of the first folder that has one: one entry per `- [Title](file)` line. */
export async function readMemory(host: Host, root: string, folders: readonly string[], now: number): Promise<FleetMemory> {
  for (const folder of folders) {
    const index = await memoryIndexFor(host, root, folder)

    if (!index) continue

    try {
      const text = await host.readText(index)
      const entries = text
        .split('\n')
        .map(line => /^\s*-\s*\[([^\]]+)\]/.exec(line)?.[1]?.trim())
        .filter((title): title is string => Boolean(title))

      return { entries, path: dirname(index), readAt: now }
    } catch {
      // Unreadable index: try the next folder.
    }
  }

  return { entries: [], readAt: now }
}
