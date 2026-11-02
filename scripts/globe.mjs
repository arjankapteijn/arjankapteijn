// Generates globe.svg: a neofetch-style terminal with a spinning ASCII earth.
// Land mask: assets/landmask.raw (360x180, 8-bit gray, water = light), taken
// from the specular map of arjankapteijn.com's earth texture.
import { readFileSync, writeFileSync } from 'node:fs'

const MASK_W = 360
const MASK_H = 180
const mask = readFileSync(new URL('../assets/landmask.raw', import.meta.url))

const FRAMES = 72
const DURATION = 14.4 // seconds per revolution
const COLS = 72 // globe canvas, including orbit
const ROWS = 31
const R_X = 25 // globe radius in columns
const R_Y = 12.5 // ...and in rows (cells are ~2x as tall as wide)
const CX = COLS / 2
const CY = ROWS / 2
const TILT = (23.4 * Math.PI) / 180
const LIGHT = normalize([-0.4, -0.3, 0.87])

const CELL_W = 8.4
const LINE_H = 17
const PAD = 24
const TITLE_H = 34
const INFO_X = PAD + COLS * CELL_W + 28
const WIDTH = 940

const LAND_RAMP = '-=+*#%'
const SEA_RAMP = '  .·'

const info = [
  ['arjan@ak-01', null],
  ['-----------', null],
  ['Name', 'Arjan Kapteijn'],
  ['Location', 'Harderwijk, NL'],
  ['Work', '@contactcare'],
  ['Web', 'arjankapteijn.com'],
  ['Stack', 'PHP / Laravel'],
  ['Infra', 'Docker · TrueNAS · AWS'],
  ['Altitude', '±420 km'],
  ['Velocity', '±27,500 km/h'],
  ['Uptime', 'since launch'],
  ['Gravity', 'n/a'],
]

function normalize([x, y, z]) {
  const l = Math.hypot(x, y, z)
  return [x / l, y / l, z / l]
}

function isLand(lat, lon) {
  const u = Math.floor(((lon / (2 * Math.PI) + 0.5) % 1 + 1) % 1 * MASK_W) % MASK_W
  const v = Math.min(MASK_H - 1, Math.floor((0.5 - lat / Math.PI) * MASK_H))
  return mask[v * MASK_W + u] < 128
}

function renderFrame(f) {
  const spin = (-f / FRAMES) * 2 * Math.PI
  const land = Array.from({ length: ROWS }, () => Array(COLS).fill(' '))
  const sea = Array.from({ length: ROWS }, () => Array(COLS).fill(' '))

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const x = (col + 0.5 - CX) / R_X
      const y = (row + 0.5 - CY) / R_Y
      const d = x * x + y * y
      if (d > 1) continue
      const z = Math.sqrt(1 - d)
      // undo the axial tilt (tilted sideways, north to the upper right)
      const xt = x * Math.cos(TILT) - y * Math.sin(TILT)
      const yt = x * Math.sin(TILT) + y * Math.cos(TILT)
      const lat = Math.asin(-yt)
      const lon = Math.atan2(xt, z) + spin
      const light = x * LIGHT[0] + y * LIGHT[1] + z * LIGHT[2]
      const b = Math.max(0, Math.min(0.999, light * 0.9 + 0.12))
      if (isLand(lat, lon)) {
        land[row][col] = light < 0 ? '.' : LAND_RAMP[Math.floor(b * LAND_RAMP.length)]
      } else if (light > -0.15) {
        sea[row][col] = SEA_RAMP[Math.floor(b * SEA_RAMP.length)]
      } else if (d > 0.9) {
        sea[row][col] = '.'
      }
    }
  }

  // the MacBook orbits twice per revolution, hidden while behind the earth
  // and blanking the earth beneath it while in front
  const o = orbit((f / FRAMES) * 2 * Math.PI * 2)
  const sat = o.z < 0 && o.inDisc ? null : o
  if (sat && sat.inDisc) {
    const r = Math.round(sat.row - 1)
    for (const row of [r, r + 1]) {
      for (let c = Math.round(sat.col) - 4; c <= Math.round(sat.col) + 3; c++) {
        if (land[row]?.[c] !== undefined) land[row][c] = sea[row][c] = ' '
      }
    }
  }

  return { land: land.map((r) => r.join('')), sea: sea.map((r) => r.join('')), sat }
}

function orbit(a) {
  const x = Math.cos(a) * (R_X + 8)
  const y = -Math.sin(a) * 3.4 + Math.cos(a) * 1.6
  return { col: CX + x, row: CY + y, z: Math.sin(a), inDisc: (x / R_X) ** 2 + (y / R_Y) ** 2 < 1.12 }
}

// static, dotted orbit path; the parts in front of or behind the earth are left out
const orbitRows = Array.from({ length: ROWS }, () => Array(COLS).fill(' '))
for (let i = 0; i < 160; i++) {
  const o = orbit((i / 160) * 2 * Math.PI)
  if (o.inDisc) continue
  orbitRows[Math.round(o.row - 0.5)][Math.round(o.col - 0.5)] = '·'
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const globeTop = PAD + TITLE_H + LINE_H * 1.6
const height = Math.round(globeTop + ROWS * LINE_H + PAD)
const rowY = (r) => (globeTop + (r + 0.8) * LINE_H).toFixed(1)
const rowW = (COLS * CELL_W).toFixed(1)

const frames = []
for (let f = 0; f < FRAMES; f++) {
  const { land, sea, sat } = renderFrame(f)
  const lines = []
  for (let r = 0; r < ROWS; r++) {
    for (const [cls, s] of [['s', sea[r]], ['l', land[r]]]) {
      if (!s.trim()) continue
      lines.push(`<text class="${cls}" x="${PAD}" y="${rowY(r)}" textLength="${rowW}">${esc(s)}</text>`)
    }
  }
  if (sat) {
    const x = (PAD + (sat.col - 0.5) * CELL_W).toFixed(1)
    const y = (globeTop + (Math.round(sat.row - 1) + 1) * LINE_H).toFixed(1)
    lines.push(`<use href="#mbp" x="${x}" y="${y}"/>`)
  }
  // offset by half a frame, so a paused or snapshotted image shows exactly one frame
  const delay = ((f - FRAMES + 0.5) * DURATION) / FRAMES
  frames.push(`<g style="animation-delay:${delay.toFixed(2)}s">${lines.join('')}</g>`)
}

const infoLines = info.map(([k, v], i) => {
  const y = (globeTop + (i + 9) * LINE_H).toFixed(1)
  if (v === null) return `<text class="${i ? 'd' : 'p'}" x="${INFO_X}" y="${y}">${esc(k)}</text>`
  return `<text x="${INFO_X}" y="${y}"><tspan class="k">${esc(k)}</tspan><tspan class="v">: ${esc(v)}</tspan></text>`
})

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" role="img" aria-label="Spinning ASCII earth with a MacBook in orbit, next to neofetch output for arjan@ak-01">
<style>
text{font-family:'SF Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace;font-size:14px;white-space:pre}
.l{fill:#7ee787}.s{fill:#79c0ff;opacity:.5}.o{fill:#d6e4d6;opacity:.3}
.p{fill:#7ee787;font-weight:700}.d{fill:#d6e4d6;opacity:.55}.k{fill:#79c0ff;font-weight:700}.v{fill:#e8eaf2}.c{fill:#fff}.t{fill:#d6e4d6;opacity:.6;font-size:12px}
.f g{visibility:hidden;animation:spin ${DURATION}s step-end infinite}
@keyframes spin{0%{visibility:visible}${(100 / FRAMES).toFixed(4)}%{visibility:hidden}}
.cur{animation:blink 1.1s step-end infinite}@keyframes blink{50%{opacity:0}}
@media (prefers-reduced-motion:reduce){.f g{animation:none}.f g:first-child{visibility:visible}.cur{animation:none}}
</style>
<defs><g id="mbp"><rect x="-11" y="-15" width="22" height="14" rx="2" fill="#0b1230" stroke="#cfd6e4" stroke-width="2"/><rect x="-7" y="-11" width="14" height="6" fill="#79c0ff" opacity=".7"/><path d="M-15 0h30l-2 3h-26z" fill="#cfd6e4"/></g></defs>
<rect x="1" y="1" width="${WIDTH - 2}" height="${height - 2}" rx="12" fill="#04060d" stroke="#1a2440" stroke-width="2"/>
<circle cx="${PAD + 4}" cy="${PAD + 4}" r="6" fill="#ff5f57"/><circle cx="${PAD + 24}" cy="${PAD + 4}" r="6" fill="#febc2e"/><circle cx="${PAD + 44}" cy="${PAD + 4}" r="6" fill="#28c840"/>
<text class="t" x="${WIDTH / 2}" y="${PAD + 8}" text-anchor="middle">arjan@ak-01: ~ — zsh</text>
<text x="${PAD}" y="${PAD + TITLE_H + 10}"><tspan class="p">arjan@ak-01 ~ % </tspan><tspan class="c">neofetch</tspan><tspan class="c cur">▌</tspan></text>
${orbitRows
  .map((s, r) => (s.join('').trim() ? `<text class="o" x="${PAD}" y="${rowY(r)}" textLength="${rowW}">${s.join('')}</text>` : ''))
  .join('')}
<g class="f">${frames.join('\n')}</g>
${infoLines.join('\n')}
</svg>
`

writeFileSync(new URL('../globe.svg', import.meta.url), svg)
console.log(`globe.svg: ${FRAMES} frames, ${(svg.length / 1024).toFixed(0)} KB`)
