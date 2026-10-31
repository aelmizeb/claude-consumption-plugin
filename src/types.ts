import type { FleetLoop, FleetMemory, FleetPeriods, FleetSnapshot, FleetStatus, FleetUsage, Figures } from '../types'

export type { FleetLoop, FleetMemory, FleetPeriods, FleetSnapshot, FleetStatus, FleetUsage, Figures }

export const MAIN = 'main'

export function emptyUsage(): FleetUsage {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cacheWrite1h: 0 }
}

export function addUsage(a: FleetUsage, b: FleetUsage): FleetUsage {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    cacheWrite1h: a.cacheWrite1h + b.cacheWrite1h,
  }
}

export function totalTokens(usage: FleetUsage) {
  return usage.input + usage.output + usage.cacheRead + usage.cacheWrite
}

export function isOver(status: FleetStatus) {
  return status === 'completed' || status === 'failed' || status === 'killed'
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
