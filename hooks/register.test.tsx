import { expect, test } from 'claude-code/testing'

// Each `on` here stands for the engine beneath the mod; each `$.<noun>.<verb>`
// call raises that event through the mod's hooks.

const SURFACES = ['terminal', 'desktop'] as const
const PROPS = { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} }
const BAND = { plugin: 'context-meter', component: 'AbovePrompt', props: PROPS } as const

type Limit = { kind: string; percentUsed: number; resetsAt?: string }

function measure(percent: number, limits: Limit[] = []) {
  const window = 200_000
  return { context: { tokens: (window * percent) / 100, window, percent }, rateLimits: limits, changed: [] }
}

for (const surface of SURFACES) {
  test(`draws the line with labels and figures (${surface})`, async ($, on) => {
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
      const { Box } = $.ui.resolve(e)
      return <Box />
    })
    on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] } }))
    on('session.measure', (_, e) => ({ changed: e.changed }))
    await $.session.start({ cwd: '/', surface, isInteractive: true })

    await $.session.measure(
      measure(42, [
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
  on('session.start', (_, e) => ({ cwd: e.cwd }))
    on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
      const { Box } = $.ui.resolve(e)
      return <Box />
    })
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] } }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Chat/ })).toBeUndefined()
  await ui.unmount()
})

test('a survey above the prompt hides the line', async ($, on) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
    on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
      const { Box } = $.ui.resolve(e)
      return <Box />
    })
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] } }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure(measure(50))

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: { ...PROPS, hasSurvey: true } })
  expect(await ui.find({ type: 'Text', text: /Chat/ })).toBeUndefined()
  await ui.unmount()
})

// The colour bands: green below 30, orange from 30, red from 50, red and bold from 80.
const BANDS: [number, string, boolean][] = [
  [0, 'success', false],
  [29, 'success', false],
  [30, '#E8811C', false],
  [49, '#E8811C', false],
  [50, 'error', false],
  [79, 'error', false],
  [80, 'error', true],
  [100, 'error', true],
]

for (const [percent, color, bold] of BANDS) {
  test(`${percent}% is drawn ${color}${bold ? ' and bold' : ''}`, async ($, on) => {
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
      const { Box } = $.ui.resolve(e)
      return <Box />
    })
    on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] } }))
    on('session.measure', (_, e) => ({ changed: e.changed }))
    await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
    await $.session.measure(measure(percent, [{ kind: 'five_hour', percentUsed: percent }, { kind: 'seven_day', percentUsed: percent }]))

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
  on('session.start', (_, e) => ({ cwd: e.cwd }))
    on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
      const { Box } = $.ui.resolve(e)
      return <Box />
    })
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] } }))
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
