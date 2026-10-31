import type { SessionContextUsage, SessionCost, SessionRateLimit } from 'claude-code'

type Measure = { context: SessionContextUsage; rateLimits: readonly SessionRateLimit[]; cost?: SessionCost }

/** The share of a subscription window used, by its name (`five_hour`, `seven_day`). */
export function windowPercent(limits: readonly SessionRateLimit[], kind: string): number | undefined {
  return limits.find(limit => limit.kind === kind)?.percentUsed
}

/** The line pinned under the prompt: context, cost, quota. */
export function statusText({ context, rateLimits, cost }: Measure): string {
  const parts: string[] = []
  const five = windowPercent(rateLimits, 'five_hour')
  const seven = windowPercent(rateLimits, 'seven_day')

  if (context.percent !== undefined) parts.push(`ctx ${Math.round(context.percent)}%`)
  if (cost) parts.push(`$${cost.usd.toFixed(2)}`)
  if (five !== undefined || seven !== undefined) {
    parts.push(`quota ${five === undefined ? '--' : Math.round(five) + '%'} / ${seven === undefined ? '--' : Math.round(seven) + '%'}`)
  }

  return parts.join(' · ')
}
