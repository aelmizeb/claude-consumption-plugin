import { type TranscriptCache, scanPeriodCosts } from './costs'
import type { Host } from './host'
import { readMemory } from './memory'
import { basename, configDirOf, dirname } from './paths'
import { COMPARE_LABEL, compareUsd } from './pricing'
import { Session } from './session'
import { windowPercent } from './status'
import { type Figures, type FleetMemory, type FleetPeriods, type FleetSnapshot, isRecord } from './types'

// The suffix changes when the cache's shape changes: entries from an older version are ignored.
const CACHE_KEY = 'transcriptCache-1'
const EMPTY_PERIODS: FleetPeriods = { week: 0, month: 0, unpriced: 0, estimated: 0, compareWeek: 0, compareMonth: 0, scannedAt: 0 }
const MEMORY_EVERY_MS = 60_000

const sessionIdOf = (file: string) => basename(file).replace(/\.jsonl$/, '')

export type MonitorOptions = { idleAfterSeconds: number; compareWithDeepSeek: boolean }

/**
 * The monitor: it follows the session it runs in, re-reads its transcripts at a regular interval, reads
 * the project's memory, collects the other sessions' costs and publishes a snapshot on every change.
 * Context, cost and quota come from the engine; tokens, agents and tools from the transcripts.
 */
export class Monitor {
  private session?: Session
  private memory: FleetMemory = { entries: [], readAt: 0 }
  private periods: FleetPeriods = EMPTY_PERIODS
  private lastJson = ''
  private ticking = false
  private scanning = false

  constructor(
    private readonly host: Host,
    private readonly options: MonitorOptions,
    private readonly publish: (snapshot: FleetSnapshot) => void | Promise<void>,
  ) {}

  async refresh() {
    this.lastJson = ''
    this.memory = { entries: [], readAt: 0 }
    await this.tick()
  }

  async rescanCosts() {
    const file = await this.host.transcript()

    if (this.scanning || !file) return

    this.scanning = true

    try {
      const stored = await this.host.load(CACHE_KEY)
      const started = Date.now()
      const result = await scanPeriodCosts(this.host, configDirOf(file), new Set([sessionIdOf(file)]), isRecord(stored) ? (stored as TranscriptCache) : {}, started)

      this.periods = result.periods
      await this.host.save(CACHE_KEY, result.cache).catch(error => this.host.log(`Cost cache not saved: ${String(error)}`))
      this.host.log(
        `Cost scan in ${Date.now() - started} ms: week $${result.periods.week.toFixed(2)}, month $${result.periods.month.toFixed(2)}` +
          ` (${result.periods.estimated} estimated, ${result.periods.unpriced} unpriced)${result.failed.length ? '; failures: ' + result.failed.slice(0, 5).join(' | ') : ''}`,
      )
      this.lastJson = ''
      await this.tick()
    } catch (error) {
      this.host.log(`Cost scan failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      this.scanning = false
    }
  }

  async tick() {
    if (this.ticking) return

    this.ticking = true

    try {
      const now = Date.now()
      const file = await this.host.transcript()

      if (file) {
        await this.follow(file)
        if (now - this.memory.readAt >= MEMORY_EVERY_MS) this.memory = await readMemory(this.host, configDirOf(file), await this.host.folders(), now)
      }

      const snapshot = await this.snapshot(now)
      const json = JSON.stringify(snapshot)

      if (json !== this.lastJson) {
        this.lastJson = json
        await this.publish(snapshot)
      }
    } catch (error) {
      this.host.log(`Read failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      this.ticking = false
    }
  }

  /** Keeps `session` on the transcript Claude Code names: a /clear starts a new one, and the old one joins the others. */
  private async follow(file: string) {
    if (this.session?.file !== file) {
      this.session = new Session(this.host, sessionIdOf(file), file, basename(dirname(file)))
      this.host.log(`Following session ${this.session.id} (${file})`)
      void this.rescanCosts()
    }

    try {
      await this.session.refresh()
    } catch (error) {
      // The figures the engine gives still stand: only the tokens stop moving.
      this.host.log(`Transcript unreadable: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async snapshot(now: number): Promise<FleetSnapshot> {
    const usage = await this.host.usage()
    const session = this.session
    const loops = session ? session.loops(now, Math.max(30, this.options.idleAfterSeconds) * 1000) : []
    const estimate = session?.main.cost()
    // The engine's ledger counts every request of the session, sub-agents included.
    const sessionUsd = usage.cost?.usd ?? estimate?.usd
    const scanned = this.periods.scannedAt > 0
    const figures: Figures = {
      contextPercent: usage.context.percent,
      sessionUsd,
      sessionEstimated: usage.cost ? false : estimate?.estimated,
      weekUsd: scanned ? this.periods.week + (sessionUsd ?? 0) : undefined,
      monthUsd: scanned ? this.periods.month + (sessionUsd ?? 0) : undefined,
      periodsEstimated: this.periods.estimated,
      unpriced: this.periods.unpriced,
      fiveHourPercent: windowPercent(usage.rateLimits, 'five_hour'),
      sevenDayPercent: windowPercent(usage.rateLimits, 'seven_day'),
    }

    if (this.options.compareWithDeepSeek) {
      const sessionCompare = session ? compareUsd(session.totalUsage()) : undefined

      figures.compareLabel = COMPARE_LABEL
      figures.compareSessionUsd = sessionCompare
      figures.compareWeekUsd = scanned ? this.periods.compareWeek + (sessionCompare ?? 0) : undefined
      figures.compareMonthUsd = scanned ? this.periods.compareMonth + (sessionCompare ?? 0) : undefined
    }

    return { loops, memory: this.memory, figures, sessionId: session?.id, project: session?.project }
  }
}
