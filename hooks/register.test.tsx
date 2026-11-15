import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

// Each `on` here stands for the engine beneath the mod; each `$.<noun>.<verb>`
// call raises that event through the mod's hooks.

const SURFACES = ['terminal', 'desktop', 'mobile'] as const
const PROPS = { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} }
const BAND = { plugin: 'context-meter', component: 'AbovePrompt', props: PROPS } as const

type Limit = { kind: string; percentUsed: number; resetsAt?: string }
type Context = { tokens?: number; window: number; percent?: number }

// The engine as every test needs it: a session that starts, an empty band
// beneath the mod, no figures at start, and measurements echoed back.
function stubEngine(on: On) {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] } }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
}

function fill(percent: number, window = 200_000): Context {
  return { tokens: (window * percent) / 100, window, percent }
}

function measure(context: Context, limits: Limit[] = []) {
  return { context, rateLimits: limits, changed: [] }
}

for (const surface of SURFACES) {
  test(`draws the line with labels and figures (${surface})`, async ($, on) => {
    stubEngine(on)
    await $.session.start({ cwd: '/', surface, isInteractive: true })

    await $.session.measure(
      measure(fill(42), [
        { kind: 'five_hour', percentUsed: 37.4 },
        { kind: 'seven_day', percentUsed: 12 },
        { kind: 'spend_limit', percentUsed: 90 },
      ]),
    )
    const ui = await $.ui.mount({ ...BAND, surface })
    const line = await ui.find({ type: 'Text', text: /^Chat 42% full/ })

    expect(line?.text, 'the whole line').toBe('Chat 42% full (84K of 200K) · Five-hour 37% · Week 12%')
    expect(await ui.find({ type: 'Text', text: /spend/ }), 'a limit with no label is left out').toBeUndefined()
    await ui.unmount()
  })
}

test('nothing is drawn before the first measurement has tokens', async ($, on) => {
  stubEngine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Chat/ })).toBeUndefined()
  await ui.unmount()
})

test('with no chat figure, as after a compaction, the line starts at the limits', async ($, on) => {
  stubEngine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure(
    measure({ window: 200_000 }, [
      { kind: 'five_hour', percentUsed: 37 },
      { kind: 'seven_day', percentUsed: 12 },
    ]),
  )

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const line = await ui.find({ type: 'Text', text: /^Five-hour/ })

  expect(line?.text, 'no chat part and no leading separator').toBe('Five-hour 37% · Week 12%')
  await ui.unmount()
})

test('a survey above the prompt hides the line', async ($, on) => {
  stubEngine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure(measure(fill(50)))

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: { ...PROPS, hasSurvey: true } })
  expect(await ui.find({ type: 'Text', text: /Chat/ })).toBeUndefined()
  await ui.unmount()
})

// Token counts as the line writes them: whole numbers under a thousand, K up
// to where rounding would reach 1000K, then M with one decimal and no `.0`.
const SIZES: [Context, string][] = [
  [{ tokens: 450, window: 200_000, percent: 0 }, 'Chat 0% full (450 of 200K)'],
  [{ tokens: 999_499, window: 1_000_000, percent: 100 }, 'Chat 100% full (999K of 1M)'],
  [{ tokens: 999_600, window: 1_000_000, percent: 100 }, 'Chat 100% full (1M of 1M)'],
  [{ tokens: 1_240_000, window: 2_000_000, percent: 62 }, 'Chat 62% full (1.2M of 2M)'],
  [{ tokens: 1_150_000, window: 2_000_000, percent: 58 }, 'Chat 58% full (1.2M of 2M)'],
  [{ tokens: 1_950_000, window: 2_000_000, percent: 98 }, 'Chat 98% full (2M of 2M)'],
]

for (const [context, expected] of SIZES) {
  test(`writes ${expected}`, async ($, on) => {
    stubEngine(on)
    await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
    await $.session.measure(measure(context))

    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    expect((await ui.find({ type: 'Text', text: /^Chat/ }))?.text).toBe(expected)
    await ui.unmount()
  })
}

test('with tokens but no percent, the percent is worked out from the window', async ($, on) => {
  stubEngine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure(measure({ tokens: 84_000, window: 200_000 }))

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /^Chat/ }))?.text).toBe('Chat 42% full (84K of 200K)')
  await ui.unmount()
})

test('with tokens, no percent and no window, the chat part is left out', async ($, on) => {
  stubEngine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure(measure({ tokens: 5_000, window: 0 }, [{ kind: 'five_hour', percentUsed: 10 }]))

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Chat/ }), 'no NaN% or Infinity%').toBeUndefined()
  expect((await ui.find({ type: 'Text', text: /^Five-hour/ }))?.text).toBe('Five-hour 10%')
  await ui.unmount()
})

// The colour bands: green below 30, amber (the theme's `warning`) from 30,
// red from 50, red and bold from 80.
const BANDS: [number, string, boolean][] = [
  [0, 'success', false],
  [29, 'success', false],
  [30, 'warning', false],
  [49, 'warning', false],
  [50, 'error', false],
  [79, 'error', false],
  [80, 'error', true],
  [100, 'error', true],
]

for (const [percent, color, bold] of BANDS) {
  test(`${percent}% is drawn ${color}${bold ? ' and bold' : ''}`, async ($, on) => {
    stubEngine(on)
    await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
    await $.session.measure(measure(fill(percent), [{ kind: 'five_hour', percentUsed: percent }, { kind: 'seven_day', percentUsed: percent }]))

    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    const figures = await ui.findAll({ type: 'Text', text: new RegExp(`^${percent}%$`) })

    expect(figures, 'chat, five-hour and week figures').toHaveLength(3)
    for (const figure of figures) {
      expect(figure.props.color).toBe(color)
      expect(figure.props.bold === true).toBe(bold)
    }
    await ui.unmount()
  })
}

test('display only: a prompt and a tool call pass through unchanged', async ($, on) => {
  const prompts: string[] = []
  const commands: string[] = []
  stubEngine(on)
  on('prompt.submit', (_, e) => {
    prompts.push(e.text)
    return { text: e.text }
  })
  on('tool.call', (_, e) => {
    if (e.tool === 'Bash') commands.push(e.command)
    return { result: {} }
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  await $.prompt.submit({ text: 'hello there', wait: false, origin: { kind: 'composer' } })
  await $.tool.call({ tool: 'Bash', command: 'ls -la' })

  expect(prompts).toEqual(['hello there'])
  expect(commands).toEqual(['ls -la'])
})
