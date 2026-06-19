import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Parse hex values straight out of app/tokens.css so the AAA assertions track
// the real tokens and fail loudly if the era palette ever drifts (Story 10.5
// AC-3 / NFR40). Sampling the source file mirrors the TimelineRow NFR26 guard.
const tokensCss = readFileSync(resolve(process.cwd(), 'app/tokens.css'), 'utf8')

function readHex(name: string): string {
  const match = tokensCss.match(new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})`))
  if (match === null) throw new Error(`token ${name} not found in tokens.css`)
  return match[1]
}

const BODY = readHex('--color-phosphor-cream')

const ERA_GROUND_TOKENS = [
  '--color-ground-pre-1980',
  '--color-ground-1980s',
  '--color-ground-1990s',
  '--color-ground-2000s',
  '--color-ground-2010s',
  '--color-ground-2020s',
] as const

function channels(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

function toLinear(channel: number): number {
  const s = channel / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = channels(hex)
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}

describe('era ground contrast (AC-3, NFR40)', () => {
  it('every era ground hex clears the 7:1 AAA floor against the cream body text', () => {
    for (const token of ERA_GROUND_TOKENS) {
      const ratio = contrastRatio(readHex(token), BODY)
      expect(ratio).toBeGreaterThanOrEqual(7)
    }
  })

  it('measures against the documented cream body color', () => {
    expect(BODY.toUpperCase()).toBe('#EFE6D4')
  })

  it('exposes every era hex through the --ground-* alias the runtime reads', () => {
    // EraGroundTint.resolveEraHex reads the --ground-* alias layer via
    // getComputedStyle, not the --color-ground-* source measured above. Pin the
    // indirection so a drifted alias or a non-var literal is caught here instead
    // of silently no-opping every ramp with this suite still green.
    const aliases = [
      ['--ground-pre-1980', '--color-ground-pre-1980'],
      ['--ground-1980s', '--color-ground-1980s'],
      ['--ground-1990s', '--color-ground-1990s'],
      ['--ground-2000s', '--color-ground-2000s'],
      ['--ground-2010s', '--color-ground-2010s'],
      ['--ground-2020s', '--color-ground-2020s'],
    ] as const
    for (const [alias, source] of aliases) {
      expect(tokensCss).toMatch(new RegExp(`${alias}:\\s*var\\(${source}\\)`))
    }
  })
})
