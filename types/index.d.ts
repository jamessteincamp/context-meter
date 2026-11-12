export type Limit = { kind: string; percentUsed: number }

export type Reading = { tokens?: number; window: number; percent?: number; limits: Limit[] }

declare module 'claude-code' {
  interface PluginState {
    'context-meter': {
      reading: Reading | null
    }
  }
}
