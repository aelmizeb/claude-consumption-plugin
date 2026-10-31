import { expect, test } from 'claude-code/testing'
import { cityCells, cityPixels } from '../src/terminal'
import type { FleetLoop } from '../src/types'

const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cacheWrite1h: 0 }
const main: FleetLoop = { id: 'main', type: 'main', description: '', status: 'running', startedAt: 0, steps: 1, usage }
const drone: FleetLoop = { ...main, id: 'a', type: 'Explore', parentId: 'main' }

test('a raster holds one cell per column and row: a half block, then two colours', () => {
  const columns = 8
  const rows = 3
  const bytes = Uint8Array.fromBase64(cityCells(columns, rows, [main], 0))
  const words = new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4)

  expect(words.length).toBe(columns * rows * 3)
  for (let i = 0; i < words.length; i += 3) {
    expect(words[i]).toBe(0x2580)
    expect((words[i + 1] ?? 0) >>> 24).toBe(0)
    expect((words[i + 2] ?? 0) >>> 24).toBe(0)
  }
})

test('the frame moves things only while something works', () => {
  const working = (frame: number) => [...cityPixels(60, 20, [main, drone], frame)]
  const resting = (frame: number) => [...cityPixels(60, 20, [{ ...main, status: 'idle' as const }], frame)]

  expect(working(0)).not.toEqual(working(1))
  // Only the stars and the beacon go on: at most a handful of pixels.
  const moved = resting(0).filter((pixel, i) => pixel !== resting(1)[i]).length
  expect(moved).toBeLessThan(20)
})

test('it draws at the narrowest sizes without leaving the grid', () => {
  for (const [columns, rows] of [[1, 1], [2, 4], [20, 4], [512, 14]] as const) {
    expect(cityCells(columns, rows, [main, drone], 1).length).toBeGreaterThan(0)
  }
})
