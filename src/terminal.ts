import { BUILDINGS, NEON, STATUS_COLOR, noise } from './scene'
import { type FleetLoop, MAIN, isOver } from './types'

/**
 * The city for the terminal, which draws no SVG: a grid of half blocks, each cell two pixels stacked
 * (`▀`, its foreground the upper pixel and its background the lower one). Nothing here is animated by
 * itself: every frame is computed from `frame`, which the pane moves on while something works.
 */

const HALF_BLOCK = 0x2580
const SKY: readonly (readonly [number, number, number])[] = [
  [0x1c, 0x16, 0x56],
  [0x43, 0x2a, 0x86],
  [0x8a, 0x3f, 0xae],
]

function rgb(hex: string) {
  return Number.parseInt(hex.slice(1), 16)
}

function skyAt(t: number) {
  const span = t * (SKY.length - 1)
  const from = Math.min(SKY.length - 2, Math.floor(span))
  const low = SKY[from] ?? [0, 0, 0]
  const high = SKY[from + 1] ?? low
  const mix = (i: 0 | 1 | 2) => Math.round(low[i] + (high[i] - low[i]) * (span - from))

  return (mix(0) << 16) | (mix(1) << 8) | mix(2)
}

/** The picture, `width` by `height` pixels, as one 0xRRGGBB value per pixel. */
export function cityPixels(width: number, height: number, list: readonly FleetLoop[], frame: number): Uint32Array {
  const pixels = new Uint32Array(width * height)
  const ground = height - 1
  const sx = width / 192
  const set = (x: number, y: number, color: number) => {
    const px = Math.round(x)
    const py = Math.round(y)

    if (px >= 0 && px < width && py >= 0 && py < height) pixels[py * width + px] = color
  }
  const box = (x: number, y: number, w: number, h: number, color: number) => {
    for (let py = 0; py < h; py += 1) for (let px = 0; px < w; px += 1) set(x + px, y + py, color)
  }

  for (let y = 0; y < height; y += 1) box(0, y, width, 1, skyAt(y / Math.max(1, ground)))

  // Stars twinkle one after the other.
  for (let i = 0; i < 16; i += 1) {
    if (noise(i * 31 + Math.floor(frame / 2)) > 0.3) set(noise(i) * width, noise(i + 100) * ground * 0.5, 0xcfd8ff)
  }

  const radius = Math.max(2, Math.round(Math.min(ground * 0.4, 22 * sx)))
  const sunY = ground - radius + 1

  for (let y = -radius; y <= radius; y += 1) {
    const half = Math.round(Math.sqrt(radius * radius - y * y))
    const banded = y > 0 && y % 2 === 0

    if (!banded) box(width / 2 - half, sunY + y, half * 2, 1, y < 0 ? rgb(NEON.yellow) : rgb(NEON.magenta))
  }

  BUILDINGS.forEach(([x, tall, wide], b) => {
    const h = Math.max(2, Math.round((tall / 70) * ground))
    const left = Math.round(x * sx)
    const w = Math.max(2, Math.round(wide * sx))

    box(left, ground - h, w, h, 0x2a2270)

    for (let y = ground - h + 1; y < ground; y += 2) {
      for (let wx = left + 1; wx < left + w - 1; wx += 2) {
        const r = noise(b * 1000 + y * 7 + wx)

        if (r > 0.45) set(wx, y, r > 0.85 ? rgb(NEON.magenta) : r > 0.7 ? rgb(NEON.yellow) : rgb(NEON.cyan))
      }
    }
  })

  const main = list.find(one => one.id === MAIN)
  const tower = Math.max(3, Math.round(Math.min(ground * 0.35, width * 0.1)) | 1)
  const towerX = Math.round((width - tower) / 2)
  const core = Math.round(ground / 2)
  const isWorking = main?.status === 'running' || main?.status === 'waiting'
  const color = main ? rgb(STATUS_COLOR[main.status]) : rgb(NEON.dim)

  box(towerX, 1, tower, ground - 1, 0x33288a)
  set(width / 2, 0, frame % 4 < 2 ? rgb(NEON.red) : 0x33288a)
  // The heart beats while the loop works.
  box(width / 2 - 1, core - 1, 3, 3, isWorking && frame % 2 === 1 ? 0x33288a : color)
  set(width / 2, core, color)

  box(0, ground, width, 1, rgb(NEON.cyan))

  const agents = list.filter(one => one.id !== MAIN).slice(-Math.max(2, Math.floor((width - tower) / 6)))
  const perSide = Math.ceil(agents.length / 2)
  const spacing = Math.max(5, Math.floor((width - tower) / 2 / (perSide + 1)))

  agents.forEach((loop, index) => {
    const side = index % 2 === 0 ? -1 : 1
    const slot = Math.floor(index / 2) + 1
    const x = width / 2 + side * (tower / 2 + slot * spacing)
    const over = isOver(loop.status)
    const bob = !over && (frame + index) % 2 === 1 ? 1 : 0
    const y = over ? ground - 2 : 1 + (index % 3) * Math.max(1, Math.floor(ground / 6)) + bob
    const hull = rgb(STATUS_COLOR[loop.status])

    box(x - 1, y, 3, 2, hull)
    if (!over) {
      set(x - 1, y - 1, frame % 2 === 0 ? 0x9fb3ff : 0x1c1656)
      set(x + 1, y - 1, frame % 2 === 0 ? 0x1c1656 : 0x9fb3ff)
    }
  })

  return pixels
}

/** The cells of a `Raster` showing the city, `columns` by `rows`. */
export function cityCells(columns: number, rows: number, list: readonly FleetLoop[], frame: number): string {
  const pixels = cityPixels(columns, rows * 2, list, frame)
  const words = new Uint32Array(columns * rows * 3)

  for (let i = 0; i < columns * rows; i += 1) {
    const row = Math.floor(i / columns)
    const column = i % columns

    words[i * 3] = HALF_BLOCK
    words[i * 3 + 1] = pixels[row * 2 * columns + column] ?? 0
    words[i * 3 + 2] = pixels[(row * 2 + 1) * columns + column] ?? 0
  }

  return new Uint8Array(words.buffer).toBase64()
}
