import { atom, read, update } from 'claude-code'
import type { Register, SessionContextUsage, SessionRateLimit } from 'claude-code'

import type { Reading } from '../types'

// Display only. This mod hooks no prompt, tool or message event: it reads the
// numbers the session already has and draws one dim line above the prompt.

const reading = atom({ plugin: 'context-meter', key: 'reading' } as const, null)

function toReading(context: SessionContextUsage, limits: readonly SessionRateLimit[]): Reading {
  return {
    tokens: context.tokens,
    window: context.window,
    percent: context.percent,
    limits: limits.map(one => ({ kind: one.kind, percentUsed: one.percentUsed })),
  }
}

// 84K, 1.2M, 1M. The K branch stops where rounding would reach 1000K; both
// branches round half up (toFixed would turn 1.95M into 1.9M).
function size(n: number) {
  if (n < 1000) return String(n)
  if (n < 999_500) return `${Math.round(n / 1000)}K`

  return `${Math.round(n / 100_000) / 10}M`
}

// The engine sends `percent` with `tokens`, already whole. The fallback covers
// a release that sends `tokens` alone.
function chatPercent(meter: Reading): number | undefined {
  if (meter.percent !== undefined) return meter.percent
  if (meter.tokens === undefined || meter.window <= 0) return undefined

  return Math.round((meter.tokens / meter.window) * 100)
}

// The colour of a percentage figure: green under 30, amber under 50, red
// under 80, red and bold from 80 up. All three are theme keys (amber is the
// theme's `warning`), so they follow light, dark and custom themes.
function figureStyle(percent: number): { color: string; bold: boolean } {
  if (percent < 30) return { color: 'success', bold: false }
  if (percent < 50) return { color: 'warning', bold: false }
  if (percent < 80) return { color: 'error', bold: false }

  return { color: 'error', bold: true }
}

const LABELS: Record<string, string> = { five_hour: 'Five-hour', seven_day: 'Week' }

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    const usage = await $.session.usage()
    await update($, reading, () => toReading(usage.context, usage.rateLimits))

    return started
  })

  on('session.measure', async ($, e, next) => {
    await update($, reading, () => toReading(e.context, e.rateLimits))

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // This hook hears only this mod's own row, so passing means drawing nothing.
    if (e.props.hasSurvey) return next(e)

    const meter = await read($, reading)
    if (meter === null) return next(e)

    const { Text } = $.ui.resolve(e)
    const parts = []

    const percent = chatPercent(meter)
    if (meter.tokens !== undefined && percent !== undefined) {
      parts.push(
        <Text>
          <Text dimColor>Chat </Text>
          <Text {...figureStyle(percent)}>{percent}%</Text>
          <Text dimColor>
            {' '}full ({size(meter.tokens)} of {size(meter.window)})
          </Text>
        </Text>,
      )
    }
    for (const limit of meter.limits) {
      const label = LABELS[limit.kind]
      if (label === undefined) continue
      const percent = Math.round(limit.percentUsed)
      parts.push(
        <Text>
          <Text dimColor>{label} </Text>
          <Text {...figureStyle(percent)}>{percent}%</Text>
        </Text>,
      )
    }
    if (parts.length === 0) return next(e)

    return (
      <Text wrap="truncate-end">
        {parts.flatMap((part, i) => (i === 0 ? [part] : [<Text dimColor> · </Text>, part]))}
      </Text>
    )
  })
}
