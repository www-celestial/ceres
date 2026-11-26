// The check that every text is in the middle of its box, from the pixels of the canvas, as src/sdl/align.test.ce
// checks it in a window of SDL: each run of ink of a box (a text, an icon), found between the columns that hold none,
// two pixels in from its edges (a column inked from top to bottom is an edge or a grid line and is left aside), its
// top its first row of ink, its bottom the last row that holds a quarter of the ink of its fullest one (the tail of a
// comma or of a g, under the line, left aside), must have its middle that of the box within a pixel. The canvas must keep what it drew (a page
// whose address holds ceres-check). offs(tree, boxes) gives what is off, as texts: tree is the semantics tree (ceres.js Tree), boxes the
// boxes to check, each {name, x, y, w, h}, or {name, role, label, index, focused} for the node of that role, name,
// index in its table and focus (a field in focus shows its caret, which is ink too).
export function pixels() {
  const canvas = document.querySelector('canvas'), c = document.createElement('canvas')
  c.width = canvas.width; c.height = canvas.height
  const g = c.getContext('2d', { willReadFrequently: true })
  g.drawImage(canvas, 0, 0)
  const scale = canvas.width / canvas.getBoundingClientRect().width
  return { data: g.getImageData(0, 0, c.width, c.height).data, width: c.width, scale }
}

const luma = (d, i) => (299 * d[i] + 587 * d[i + 1] + 114 * d[i + 2]) / 1000

export function inks(px, bx, by, bw, bh) {
  const s = px.scale, x0 = Math.round((bx + 2) * s), y0 = Math.round((by + 2) * s), w = Math.round((bw - 4) * s), h = Math.round((bh - 4) * s)
  const seen = new Map()
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const i = (y * px.width + x) * 4, k = (px.data[i] << 16) | (px.data[i + 1] << 8) | px.data[i + 2]
    seen.set(k, (seen.get(k) || 0) + 1)
  }
  let bg = 0, most = -1
  for (const [k, n] of seen) if (n > most) { bg = k; most = n }
  const bgl = (299 * (bg >> 16) + 587 * ((bg >> 8) & 255) + 114 * (bg & 255)) / 1000
  const ink = (x, y) => Math.abs(luma(px.data, (y * px.width + x) * 4) - bgl) > 56
  // the columns with ink, an edge or a grid line (inked from top to bottom) left aside, in runs across gaps under 4 px
  const runs = []
  let run = null, gap = 0
  for (let x = x0; x < x0 + w; x++) {
    let count = 0
    for (let y = y0; y < y0 + h; y++) if (ink(x, y)) count++
    if (count > 0 && count < h - 1) {
      if (run && gap < 4 * s) run.x1 = x; else { run = { x0: x, x1: x }; runs.push(run) }
      gap = 0
    } else gap++
  }
  // each run's top, its first row of ink, and its bottom, the last row that holds a quarter of the ink of its fullest
  // one: the baseline, so that the tail of a comma or of a g, under it, doesn't move it
  return runs.map(r => {
    const rows = []
    for (let y = y0; y < y0 + h; y++) { let n = 0; for (let x = r.x0; x <= r.x1; x++) if (ink(x, y)) n++; rows.push(n) }
    const most = Math.max(...rows), top = rows.findIndex(n => n > 0), bottom = rows.length - 1 - [...rows].reverse().findIndex(n => n * 4 >= most)
    return { x0: r.x0 / s, x1: r.x1 / s, top: (y0 + top) / s, bottom: (y0 + bottom + 1) / s, middle: (2 * y0 + top + bottom + 1) / 2 / s }
  })
}

const find = (n, f) => f(n) ? n : (n.Kids || []).map(k => find(k, f)).find(Boolean)

export function offs(tree, boxes) {
  const px = pixels(), bad = []
  for (const b of boxes) {
    const n = b.role ? find(tree, n => n.Role === b.role && (b.label === undefined || n.Name === b.label) && (b.index === undefined || n.Index === b.index) && (b.focused === undefined || n.Focused === b.focused)) : b
    if (!n) { bad.push(b.name + ': not found'); continue }
    const x = n.X ?? n.x, y = n.Y ?? n.y, w = n.W ?? n.w, h = n.H ?? n.h, rs = inks(px, x, y, w, h), want = y + h / 2
    if (!rs.length) bad.push(b.name + ': no ink')
    for (const r of rs) if (Math.abs(r.middle - want) > 1) bad.push(`${b.name}: ink ${Math.round(r.x0)}-${Math.round(r.x1)} at ${r.middle}, box at ${want}`)
  }
  return bad
}

// The box of a color over the canvas, in css pixels: a tile that a test finds by its fill.
export function boxOf(color) {
  const px = pixels(), r = color >> 16, g = (color >> 8) & 255, b = color & 255
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1
  for (let i = 0; i < px.data.length; i += 4) if (px.data[i] === r && px.data[i + 1] === g && px.data[i + 2] === b) {
    const k = i / 4, x = k % px.width, y = Math.floor(k / px.width)
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y)
  }
  return { x: x0 / px.scale, y: y0 / px.scale, w: (x1 - x0 + 1) / px.scale, h: (y1 - y0 + 1) / px.scale }
}
