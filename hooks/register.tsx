import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import type { FleetSnapshot } from '../types'
import { createHost } from '../src/host'
import { Monitor } from '../src/monitor'
import { STATUS_COLOR, STATUS_LABEL, formatTokens, hudRows, scene, sceneAlt } from '../src/scene'
import { statusText } from '../src/status'
import { cityCells } from '../src/terminal'
import { type FleetLoop, MAIN, isOver, totalTokens } from '../src/types'

const PANE = 'consumption'
const TITLE = 'Consumption'
const COMMAND = 'consumption'
const CITY = 'city'
const FRAME_MS = 400
const SCAN_EVERY_MS = 5 * 60_000
const MAX_AGENT_ROWS = 6
const MIN_CITY_ROWS = 4
const MAX_CITY_ROWS = 10

const snapshot = atom({ plugin: 'consumption-hud', key: 'snapshot' } as const, null, { shape: 'snapshot-1' })

function agentRows(loops: readonly FleetLoop[]) {
  const agents = loops.filter(one => one.id !== MAIN)
  const working = agents.filter(one => !isOver(one.status))
  const done = agents.filter(one => isOver(one.status))

  return [...working, ...done.slice(-MAX_AGENT_ROWS)].slice(0, MAX_AGENT_ROWS)
}

let monitor: Monitor | undefined
/** The Raster on screen, for the blits between two drawings; none on the other surfaces. */
let city: { columns: number; rows: number } | undefined
let latest: FleetSnapshot | null = null
let frame = 0
let isStarted = false

function ensureMonitor($: EngineInterface, options: PluginOptions) {
  monitor ??= new Monitor(
    createHost($),
    { idleAfterSeconds: Number(options.idle_after_seconds ?? 600), compareWithDeepSeek: options.compare_with_deepseek === true },
    next => publish($, next),
  )

  return monitor
}

async function publish($: EngineInterface, next: FleetSnapshot) {
  latest = next
  await update($, snapshot, () => next)
}

/** Moves the terminal's city on while something works; the SVG surfaces animate by themselves. */
function animate($: EngineInterface) {
  const loops = latest?.loops ?? []

  if (!city || !loops.some(one => one.status === 'running' || one.status === 'waiting')) return

  frame += 1
  $.ui.blit({ requestId: PANE, key: CITY, cells: cityCells(city.columns, city.rows, loops, frame) }).catch(() => {
    city = undefined
  })
}

/** Starts the timers, once per load: a surface may attach long after the session started. */
function start($: EngineInterface, options: PluginOptions) {
  if (isStarted) return

  isStarted = true

  const running = ensureMonitor($, options)
  const pollMs = Math.max(1, Number(options.poll_seconds ?? 2)) * 1000

  $.clock.every(pollMs, () => void running.tick())
  $.clock.after(1000, () => void running.rescanCosts())
  $.clock.every(SCAN_EVERY_MS, () => void running.rescanCosts())
  $.clock.every(FRAME_MS, () => animate($))
  if (options.open_at_start !== false) void $.ui.open({ id: PANE, title: TITLE })
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Open the consumption pane',
      argumentHint: '[refresh|rescan]',
    })

    // The editor and the desktop app host a session through the SDK: not interactive, a surface all the same.
    if (e.isInteractive || (await $.session.surfaces()).length > 0) start($, options)

    return next(e)
  })

  on('session.attach', ($, e, next) => {
    start($, options)

    return next(e)
  })

  on('session.measure', ($, e, next) => {
    if (options.status_line === true) $.ui.status(statusText(e))

    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const running = ensureMonitor($, options)
    const action = e.args.trim()

    if ((await $.session.surfaces()).length > 0) start($, options)

    if (action === 'rescan') await running.rescanCosts()
    else await running.refresh()

    const opened = await $.ui.open({ id: PANE, title: TITLE })
    const shown = await read($, snapshot)
    const summary = shown ? sceneAlt(shown.loops, shown.memory, shown.figures) : 'No figures yet.'

    return { text: opened.isPlaced ? `Consumption pane opened: ${summary}.` : `${summary}. The pane is not shown here: ${opened.reason}` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const shown = await read($, snapshot)
    const { Box, Text } = $.ui.resolve(e)

    if (!shown) return <Text dimColor>Waiting for a Claude Code session…</Text>

    const { loops, memory, figures } = shown
    const agents = agentRows(loops).map(loop => (
      <Text>
        <Text color={STATUS_COLOR[loop.status]}>{STATUS_LABEL[loop.status].padEnd(10)}</Text>
        {`${loop.type} ${loop.tool ?? ''} ${formatTokens(totalTokens(loop.usage))}`}
        <Text dimColor>{loop.description ? ` ${loop.description}` : ''}</Text>
      </Text>
    ))

    if (e.surface !== 'terminal') {
      const { Svg } = $.ui.resolve(e)
      const { bodyColumns, scroll } = e.props
      const aspect = Math.max(1.4, bodyColumns / Math.max(1, scroll.bodyRows * 2))

      return (
        <Box flexDirection="column">
          <Svg source={scene(loops, memory, figures, aspect)} alt={sceneAlt(loops, memory, figures)} isInteractive />
          {agents}
        </Box>
      )
    }

    const { Raster } = $.ui.resolve(e)
    const hud = hudRows(loops, memory.entries.length, figures)
    const room = e.props.scroll.bodyRows - hud.length - agents.length
    const columns = Math.max(1, Math.min(512, e.props.bodyColumns))
    const rows = Math.max(MIN_CITY_ROWS, Math.min(e.props.placement === 'inline' ? MIN_CITY_ROWS + 2 : MAX_CITY_ROWS, room))

    city = { columns, rows }

    return (
      <Box flexDirection="column">
        <Raster key={CITY} columns={columns} rows={rows} cells={cityCells(columns, rows, loops, frame)} />
        {hud.map(row => (
          <Text>
            {row.map(cell => (
              <Text>
                <Text dimColor>{cell.title} </Text>
                <Text color={cell.color} bold>
                  {cell.value}
                </Text>
                {'  '}
              </Text>
            ))}
          </Text>
        ))}
        {agents}
      </Box>
    )
  })
}
