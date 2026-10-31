import { expect, test } from 'claude-code/testing'
import { near } from './fake-host'
import { compareUsd, estimateUsd, normalizeModel } from '../src/pricing'

test('the DeepSeek equivalent bills cache reads as hits, cache writes as misses', () => {
  // 1M of each: 1.32 (input) + 1.32 (cache write, a miss) + 0.044 (cache read, a hit) + 3.96 (output).
  const usd = compareUsd({ input: 1_000_000, output: 1_000_000, cacheRead: 1_000_000, cacheWrite: 1_000_000, cacheWrite1h: 1_000_000 })
  near(usd, 6.644, 1e-9)
})

test('the estimate reproduces the costUSD Claude Code writes (1h cache billed twice the input price)', () => {
  // Taken from a real cost-state line: claude-fable-5-1, $13.098226.
  const fable = estimateUsd({ input: 2480, output: 72381, cacheRead: 17_429_985, cacheWrite: 254_844, cacheWrite1h: 254_844 }, 'claude-fable-5-1')
  near(fable, 13.098226, 1e-4)

  const haiku = estimateUsd({ input: 1195, output: 143, cacheRead: 0, cacheWrite: 0, cacheWrite1h: 0 }, 'claude-haiku-5-5')
  near(haiku, 0.000191, 1e-7)
})

test('an unknown model has no price', () => {
  expect(estimateUsd({ input: 1, output: 1, cacheRead: 0, cacheWrite: 0, cacheWrite1h: 0 }, 'claude-opus-4-5')).toBeUndefined()
  expect(estimateUsd({ input: 1, output: 1, cacheRead: 0, cacheWrite: 0, cacheWrite1h: 0 }, undefined)).toBeUndefined()
})

test('model names are reduced to their pricing key', () => {
  expect(normalizeModel('claude-fable-5-1[1m]')).toBe('claude-fable-5-1')
  expect(normalizeModel('us.anthropic.claude-opus-5-5-20260401')).toBe('claude-opus-5-5')
  expect(normalizeModel('claude-sonnet-5-5@20260301')).toBe('claude-sonnet-5-5')
})
