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

function size(n: number) {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${Math.round(n / 1000)}K`

  return `${(n / 1_000_000).toFixed(1)}M`
}

// The colour of a percentage figure: green under 30, orange under 50, red
// under 80, red and bold from 80 up. Green and red are theme keys, so they
// follow light and dark mode; the theme has no orange, so that one is hex.
const ORANGE = '#E8811C'

function figureStyle(percent: number): { color: string; bold: boolean } {
  if (percent < 30) return { color: 'success', bold: false }
  if (percent < 50) return { color: ORANGE, bold: false }
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
    const beneath = await next(e)
    if (e.props.hasSurvey) return beneath

    const meter = await read($, reading)
    if (meter === null) return beneath

    const { Box, Text } = $.ui.resolve(e)
    const parts = []

    if (meter.tokens !== undefined) {
      const percent = meter.percent ?? Math.round((meter.tokens / meter.window) * 100)
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
    if (parts.length === 0) return beneath

    return (
      <Box flexDirection="column">
        {beneath}
        <Text wrap="truncate-end">
          {parts.flatMap((part, i) => (i === 0 ? [part] : [<Text dimColor> · </Text>, part]))}
        </Text>
      </Box>
    )
  })
}
