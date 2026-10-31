import type { Host } from './host'

export const join = (...parts: string[]) => parts.join('/')

export function dirname(file: string) {
  return file.replace(/[\\/][^\\/]*$/, '')
}

export function basename(file: string) {
  return file.replace(/^.*[\\/]/, '')
}

/** The name Claude Code gives a project's directory: its path with everything but letters and digits turned into `-`. */
export function projectSlug(folder: string): string {
  return folder.replace(/[\\/]+$/, '').replace(/[^a-zA-Z0-9]/g, '-')
}

/** The folder and its parents, from the deepest to the root. */
export function ancestors(folder: string): string[] {
  const parts = folder.replace(/[\\/]+$/, '').split(/[\\/]/)
  const out: string[] = []

  for (let n = parts.length; n >= 1; n -= 1) out.push(parts.slice(0, n).join('/'))

  return out
}

/** The session's transcript: under the folder's own project directory, or `all` of them when asked. */
export async function findTranscript(host: Host, root: string, id: string, folders: readonly string[], all: boolean): Promise<string | undefined> {
  const projects = join(root, 'projects')

  for (const folder of folders) {
    const file = join(projects, projectSlug(folder), `${id}.jsonl`)

    if (await host.exists(file)) return file
  }

  if (!all) return undefined

  try {
    for (const entry of await host.list(projects)) {
      const file = join(projects, entry.name, `${id}.jsonl`)

      if (entry.kind === 'dir' && (await host.exists(file))) return file
    }
  } catch {
    // No projects directory yet.
  }

  return undefined
}

/** The auto-memory directory of an open folder: the folder's own, or the first parent that has one. */
export async function memoryIndexFor(host: Host, root: string, folder: string): Promise<string | undefined> {
  for (const candidate of ancestors(folder)) {
    const slug = projectSlug(candidate)

    for (const name of [slug, slug.toLowerCase()]) {
      const index = join(root, 'projects', name, 'memory', 'MEMORY.md')

      if (await host.exists(index)) return index
    }
  }

  return undefined
}
