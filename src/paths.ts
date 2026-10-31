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

/** The configuration directory a transcript lives in: `<config>/projects/<project>/<session>.jsonl`. */
export function configDirOf(transcript: string) {
  return dirname(dirname(dirname(transcript)))
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
