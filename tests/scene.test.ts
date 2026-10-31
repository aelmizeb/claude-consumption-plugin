import { expect, test } from 'claude-code/testing'
import { hudRows, ratio, scene } from '../src/scene'
import type { FleetLoop, FleetMemory } from '../src/types'

const memory: FleetMemory = { entries: ['a', 'b'], readAt: 0 }
const main: FleetLoop = {
  id: 'main',
  type: 'main',
  description: '',
  status: 'running',
  startedAt: 0,
  steps: 3,
  usage: { input: 10, output: 20, cacheRead: 30, cacheWrite: 40, cacheWrite1h: 40 },
  tool: 'Bash',
}

test('the comparison row only shows when a comparison label is given, and the scene grows by one row', () => {
  const plain = scene([main], memory, { sessionUsd: 12.4 }, 2.5)
  const compared = scene([main], memory, { sessionUsd: 12.4, compareLabel: 'DEEPSEEK', compareSessionUsd: 0.31, compareWeekUsd: 2.6, compareMonthUsd: 24 }, 2.5)

  expect(plain.includes('DEEPSEEK')).toBe(false)
  expect(compared.includes('DEEPSEEK SESSION')).toBe(true)
  expect(compared.includes('CLAUDE / DEEPSEEK')).toBe(true)
  expect(compared.includes('×40')).toBe(true)
  expect(plain.includes('viewBox="0 0 192 77"')).toBe(true)
  expect(compared.includes('viewBox="0 0 192 95"')).toBe(true)
})

test('the ratio reads ×n, with one decimal below ten', () => {
  expect(ratio(12.4, 0.31)).toBe('×40')
  expect(ratio(2, 0.8)).toBe('×2.5')
  expect(ratio(2, 0)).toBe('--')
  expect(ratio(undefined, 1)).toBe('--')
})

test('the HUD turns red past 80 % of the context or the weekly quota, and marks estimates', () => {
  const rows = hudRows([main], 2, { contextPercent: 85, sevenDayPercent: 90, weekUsd: 3, periodsEstimated: 1, monthUsd: 4, unpriced: 2 })

  expect(rows[0]?.[3]?.color).toBe('#ff3b3b')
  expect(rows[1]?.[3]?.color).toBe('#ff3b3b')
  expect(rows[1]?.[1]?.value).toBe('≈$3.00')
  expect(rows[1]?.[2]?.value).toBe('≈$4.00 +2?')
})

test('a full scene fits what an Svg element takes', () => {
  const drones = Array.from({ length: 40 }, (_, i): FleetLoop => ({ ...main, id: `a${i}`, type: 'general-purpose', description: 'A long description of the task', parentId: 'main' }))

  expect(scene([main, ...drones], memory, {}, 1.4).length).toBeLessThan(131_072)
})
