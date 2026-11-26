// ceres.js: the browser's glue of Ceres, hand-written, no dependency. The page's code, Ceres's and the app's, runs in
// WebAssembly, compiled from Cesia by cesia build --target wasm; this paints its draw list with WebGL2 in one pass,
// measures texts with the browser's own fonts, sends it the events, and keeps the hidden DOM of its semantics tree for
// screen readers, typing (IME, autofill) and Cmd-F. It never decides anything about the page.
//
// The page calls it by js.Call("./ceres.js", name, args), from src/browser (docs/book/backends.md); a text comes as the
// Uint8Array of its bytes, a channel as a handle whose send(value) gives the page a value:
//   Start(events, form)      the canvas of the page set up, each event sent on events as JSON text, {Kind: 'mouse'|
//                            'key'|'text'|'resize', ...} as web.Handle takes it, or with form "lists" as a list of its
//                            fields: ['mouse', Action, X, Y, Button, Amount], ['key', Key, Ctrl, Alt, Shift], ['text',
//                            Text], ['resize', Width, Height], which the page reads with no JSON; gives [width, height,
//                            origin, path, check], check true when the page's address holds ceres-check
//   Measure(text, size, font)  the width of a text in pixels, font 'body', 'strong' or 'code'; Line(size) a line's height
//   Paint(bytes)             paints the bytes of a draw list, web.Encode's or web.Encoded's
//   Mirror(json)             the hidden DOM of the semantics tree, as JSON text (web.Semantics)
//   Patch(json)              the hidden DOM changed as a patch of the tree says, the JSON text of web.Patch
//   Check(json)              in a page whose address holds ceres-check: the whole tree, for a test (tests/web/check.js)
//   Wake()                   sends "frame" on events at the browser's next frame: the page paints then
// Nothing is drawn while nothing changes: a frame is asked only by Wake.

const FONTS = ['system-ui, sans-serif', '600 system-ui, sans-serif', 'ui-monospace, Menlo, Consolas, monospace']
// A vertex: its place p, its color c, its place in the atlas t, the box b of its rectangle (center, half sizes), r its
// corner's radius and whether it is an edge (r.x -1 for a text), k the clip in pixels of the canvas (x, y from its
// bottom, width, height): what a scissor would cut, so that a whole frame is one draw call.
const VS = `#version 300 es
in vec2 p; in vec4 c; in vec2 t; in vec4 b; in vec2 r; in vec4 k;
uniform vec2 s;
out vec4 vc; out vec2 vt; out vec4 vb; out vec2 vr; out vec2 vp; flat out highp vec4 vk;
void main() { vc = c; vt = t; vb = b; vr = r; vp = p; vk = k; gl_Position = vec4(p.x / s.x * 2.0 - 1.0, 1.0 - p.y / s.y * 2.0, 0.0, 1.0); }`
const FS = `#version 300 es
precision mediump float;
in vec4 vc; in vec2 vt; in vec4 vb; in vec2 vr; in vec2 vp; flat in highp vec4 vk;
uniform sampler2D a;
out vec4 o;
void main() {
  highp vec2 f = gl_FragCoord.xy;
  if (f.x < vk.x || f.y < vk.y || f.x >= vk.x + vk.z || f.y >= vk.y + vk.w) discard;
  if (vr.x < 0.0) { o = vec4(vc.rgb, vc.a * texture(a, vt).a); return; }
  vec2 q = abs(vp - vb.xy) - vb.zw + vr.x;
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - vr.x;
  float k = clamp(0.5 - d, 0.0, 1.0);
  if (vr.y > 0.0) k *= clamp(d + vr.y + 0.5, 0.0, 1.0);
  o = vec4(vc.rgb, vc.a * k);
}`
const STRIDE = 18 // floats a vertex: p 2, c 4, t 2, b 4, r 2, k 4
const ATLAS = 2048

export function painter(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false })
  if (!gl) throw new Error('Ceres needs WebGL2.')
  const prog = gl.createProgram()
  for (const [kind, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, FS]]) {
    const sh = gl.createShader(kind)
    gl.shaderSource(sh, src)
    gl.compileShader(sh)
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh))
    gl.attachShader(prog, sh)
  }
  gl.linkProgram(prog)
  gl.useProgram(prog)
  const vbo = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
  let off = 0
  for (const [name, n] of [['p', 2], ['c', 4], ['t', 2], ['b', 4], ['r', 2], ['k', 4]]) {
    const at = gl.getAttribLocation(prog, name)
    gl.enableVertexAttribArray(at)
    gl.vertexAttribPointer(at, n, gl.FLOAT, false, STRIDE * 4, off * 4)
    off += n
  }
  const uS = gl.getUniformLocation(prog, 's')
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
  const tex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, ATLAS, ATLAS, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  // The texts of a frame that aren't in the atlas yet are drawn by the browser's own text engine, side by side, into a
  // strip of the width of the atlas that holds the shelf being filled, a canvas in memory never resized for a text;
  // the part drawn goes up to the atlas once, before the frame's next draw call.
  const strip = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  strip.canvas.width = ATLAS
  strip.canvas.height = 64
  let stripFont = '', due0 = ATLAS, due1 = 0, dueH = 0
  const meter = document.createElement('canvas').getContext('2d')
  let meterFont = ''
  let runs = [new Map(), new Map(), new Map()], shelfX = 0, shelfY = 0, shelfH = 0 // per font, size -> text -> run
  let widths = [new Map(), new Map(), new Map()], measured = 0 // per font, size -> text -> width
  let verts = new Float32Array(65536), n = 0, dpr = 1, width = 0, height = 0
  const css = [new Map(), new Map(), new Map()] // per font, size in px -> the CSS font
  function font(f, size) {
    let s = css[f].get(size)
    if (s === undefined) { s = FONTS[f].replace(/^(\d+ )?/, m => m + size + 'px '); css[f].set(size, s) }
    return s
  }
  function restart() { runs = [new Map(), new Map(), new Map()]; shelfX = shelfY = shelfH = 0; due0 = ATLAS; due1 = dueH = 0; strip.clearRect(0, 0, ATLAS, strip.canvas.height) }

  // The part of the strip drawn since the last upload, into the atlas at the shelf.
  function upload() {
    if (due1 <= due0) return
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, ATLAS)
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, due0)
    gl.texSubImage2D(gl.TEXTURE_2D, 0, due0, shelfY, due1 - due0, dueH, gl.RGBA, gl.UNSIGNED_BYTE, strip.canvas)
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0)
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0)
    due0 = ATLAS; due1 = dueH = 0
  }

  // A text run in the atlas, drawn once by the browser's own text engine: {u0, v0, u1, v1, w, h} in css pixels.
  function run(text, size, f) {
    let bySize = runs[f].get(size)
    if (bySize === undefined) { bySize = new Map(); runs[f].set(size, bySize) }
    let e = bySize.get(text)
    if (e !== undefined) return e
    const c = font(f, size * dpr)
    if (stripFont !== c) { strip.font = c; stripFont = c }
    const w = Math.min(ATLAS, Math.ceil(strip.measureText(text).width) + 2), h = Math.ceil(size * dpr * 1.4) + 2
    if (shelfX + w > ATLAS) { upload(); strip.clearRect(0, 0, ATLAS, strip.canvas.height); shelfX = 0; shelfY += shelfH; shelfH = 0 }
    if (shelfY + h > ATLAS) { flush(); restart(); return run(text, size, f) } // full: what is drawn so far is painted, then it starts again, as Cemacs does
    if (h > strip.canvas.height) { upload(); strip.canvas.height = h; stripFont = ''; return run(text, size, f) }
    strip.textBaseline = 'top'
    strip.fillStyle = '#fff'
    strip.fillText(text, shelfX + 1, 1)
    if (shelfX < due0) due0 = shelfX
    if (shelfX + w > due1) due1 = shelfX + w
    if (h > dueH) dueH = h
    e = { u0: shelfX / ATLAS, v0: shelfY / ATLAS, u1: (shelfX + w) / ATLAS, v1: (shelfY + h) / ATLAS, w: w / dpr, h: h / dpr }
    bySize.set(text, e)
    shelfX += w; shelfH = Math.max(shelfH, h)
    return e
  }

  function grow(more) {
    const v = new Float32Array(Math.max(verts.length * 2, n + more))
    v.set(verts.subarray(0, n)); verts = v
  }
  // The color, the box, the corners and the clip of the vertices that put writes: set by the item that is drawn and
  // by the group it is in.
  let cr = 0, cg = 0, cb = 0, ca = 0, bx = 0, by = 0, bw = 0, bh = 0, br = 0, be = 0, k0 = 0, k1 = 0, k2 = 0, k3 = 0
  function put(x, y, u, v) {
    const a = verts
    a[n] = x; a[n + 1] = y; a[n + 2] = cr; a[n + 3] = cg; a[n + 4] = cb; a[n + 5] = ca; a[n + 6] = u; a[n + 7] = v
    a[n + 8] = bx; a[n + 9] = by; a[n + 10] = bw; a[n + 11] = bh; a[n + 12] = br; a[n + 13] = be
    a[n + 14] = k0; a[n + 15] = k1; a[n + 16] = k2; a[n + 17] = k3
    n += STRIDE
  }
  function color(c, a) { cr = ((c >> 16) & 255) / 255; cg = ((c >> 8) & 255) / 255; cb = (c & 255) / 255; ca = a / 255 }
  // A rectangle, round at its corners with rad, its edge only with edge 1; or, with rad -1, the run at u0 v0 u1 v1.
  function quad(x, y, w, h, rad, edge, u0, v0, u1, v1) {
    if (n + 6 * STRIDE > verts.length) grow(6 * STRIDE)
    bx = x + w / 2; by = y + h / 2; bw = w / 2; bh = h / 2; br = rad; be = edge
    put(x, y, u0, v0); put(x + w, y, u1, v0); put(x + w, y + h, u1, v1)
    put(x, y, u0, v0); put(x + w, y + h, u1, v1); put(x, y + h, u0, v1)
  }
  function point(x, y) { bx = x; by = y; put(x, y, 0, 0) } // a vertex of a filled triangle
  function flush() {
    upload()
    if (n === 0) return
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STREAM_DRAW, 0, n)
    gl.drawArrays(gl.TRIANGLES, 0, n / STRIDE)
    n = 0
  }
  // The groups of the draw list: at each depth, its offset, the start of its texts, and its clip if it has one, else
  // the one above.
  let ox = [0], oy = [0], tx = [0], has = [false], kx = [0], ky = [0], kw = [0], kh = [0], own = [false], depth = 0
  // The clip of the vertices that follow: that of the group at depth, in pixels of the canvas as a scissor takes it.
  function scissor() {
    if (!has[depth]) { k0 = k1 = -1e9; k2 = k3 = 4e9; return }
    k0 = Math.floor(kx[depth] * dpr); k1 = Math.floor((height - ky[depth] - kh[depth]) * dpr); k2 = Math.ceil(kw[depth] * dpr); k3 = Math.ceil(kh[depth] * dpr)
  }
  // A byte offset into the texts -> the place of its character in their string, for the texts of one frame, decoded
  // at once; texts that aren't all UTF-8 are decoded one by one.
  let place = new Int32Array(4096)
  const dec = new TextDecoder()

  // Paints the bytes of a draw list, web.Encode's or web.Encoded's: one buffer of vertices and one draw call, the clips
  // in the vertices. Nothing is made for an item: its numbers are read where they are, its vertices written into a
  // buffer kept from frame to frame.
  function paint(bytes) {
    const head = new Uint32Array(bytes.buffer, bytes.byteOffset, 2)
    const f = new Float32Array(bytes.buffer, bytes.byteOffset + 8, head[0])
    const tb = new Uint8Array(bytes.buffer, bytes.byteOffset + 8 + head[0] * 4, head[1])
    const all = dec.decode(tb)
    if (place.length < tb.length + 1) place = new Int32Array(tb.length * 2 + 1)
    for (let i = 0, j = 0; i <= tb.length; i++) { place[i] = j; const b = tb[i]; if ((b & 0xc0) !== 0x80) j += b >= 0xf0 ? 2 : 1 }
    const whole = place[tb.length] === all.length
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.uniform2f(uS, width, height)
    gl.clearColor(1, 1, 1, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
    depth = 0; ox[0] = 0; oy[0] = 0; tx[0] = 0; has[0] = false; own[0] = false
    scissor()
    let k = 0
    while (k < f.length) {
      const op = f[k], dx = ox[depth], dy = oy[depth]
      if (op === 1 || op === 2) {
        color(f[k + 5], f[k + 6])
        quad(f[k + 1] + dx, f[k + 2] + dy, f[k + 3], f[k + 4], f[k + 7], op === 2 ? 1 : 0, 0, 0, 0, 0)
        k += 8
      } else if (op === 3) {
        const start = f[k + 7] + tx[depth], text = whole ? all.substring(place[start], place[start + f[k + 8]]) : dec.decode(tb.subarray(start, start + f[k + 8]))
        const e = run(text, f[k + 3], f[k + 6])
        color(f[k + 4], f[k + 5])
        quad(f[k + 1] + dx - 1 / dpr, f[k + 2] + dy - 1 / dpr, e.w, e.h, -1, 0, e.u0, e.v0, e.u1, e.v1)
        k += 10
      } else if (op === 4) {
        const m = f[k + 1], lw = f[k + 2] / 2, p = k + 5
        color(f[k + 3], f[k + 4])
        br = 0; be = 0; bw = 1e6; bh = 1e6
        for (let j = 0; j + 3 < 2 * m; j += 2) {
          const x1 = f[p + j] + dx, y1 = f[p + j + 1] + dy, x2 = f[p + j + 2] + dx, y2 = f[p + j + 3] + dy, l = Math.hypot(x2 - x1, y2 - y1)
          if (l === 0) continue
          const nx = -(y2 - y1) / l * lw, ny = (x2 - x1) / l * lw
          if (n + 6 * STRIDE > verts.length) grow(6 * STRIDE)
          point(x1 + nx, y1 + ny); point(x2 + nx, y2 + ny); point(x2 - nx, y2 - ny)
          point(x1 + nx, y1 + ny); point(x2 - nx, y2 - ny); point(x1 - nx, y1 - ny)
        }
        k += 5 + 2 * m
      } else if (op === 5) {
        const m = f[k + 1], p = k + 4
        color(f[k + 2], f[k + 3])
        br = 0; be = 0; bw = 1e6; bh = 1e6
        if (n + m * STRIDE > verts.length) grow(m * STRIDE)
        for (let j = 0; j < 2 * m; j += 2) point(f[p + j] + dx, f[p + j + 1] + dy)
        k += 4 + 2 * m
      } else if (op === 6) {
        const x = f[k + 1] + dx, y = f[k + 2] + dy, d = depth + 1
        depth = d; ox[d] = x; oy[d] = y; tx[d] = tx[d - 1]
        if (f[k + 5]) {
          let x0 = x, y0 = y, w = f[k + 3], h = f[k + 4]
          if (has[d - 1]) {
            const px = kx[d - 1], py = ky[d - 1]
            w = Math.max(0, Math.min(px + kw[d - 1], x0 + w) - Math.max(px, x0)); h = Math.max(0, Math.min(py + kh[d - 1], y0 + h) - Math.max(py, y0))
            x0 = Math.max(px, x0); y0 = Math.max(py, y0)
          }
          has[d] = true; kx[d] = x0; ky[d] = y0; kw[d] = w; kh[d] = h; own[d] = true
          scissor()
        } else { has[d] = has[d - 1]; kx[d] = kx[d - 1]; ky[d] = ky[d - 1]; kw[d] = kw[d - 1]; kh[d] = kh[d - 1]; own[d] = false }
        k += 6
      } else if (op === 7) {
        const mine = own[depth]
        depth--
        if (mine) scissor()
        k += 1
      } else if (op === 8) {
        tx[depth] = (depth > 0 ? tx[depth - 1] : 0) + f[k + 1]
        k += 2
      } else throw new Error('Ceres: no draw item ' + op)
    }
    flush()
  }

  function resize(w, h, ratio) {
    width = w; height = h
    if (ratio !== dpr) { dpr = ratio; restart() }
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr)
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px'
  }
  // The width of a text, measured once for each font and size: whole pixels, as SDL3_ttf measures, which the layout
  // divides.
  function measure(text, size, name) {
    const f = name === 'strong' ? 1 : name === 'code' ? 2 : 0
    let bySize = widths[f].get(size)
    if (bySize === undefined) { bySize = new Map(); widths[f].set(size, bySize) }
    let w = bySize.get(text)
    if (w !== undefined) return w
    const c = font(f, size)
    if (meterFont !== c) { meter.font = c; meterFont = c }
    w = Math.ceil(meter.measureText(text).width)
    if (++measured > 65536) { widths = [new Map(), new Map(), new Map()]; measured = 0; bySize = new Map(); widths[f].set(size, bySize) }
    bySize.set(text, w)
    return w
  }
  return { paint, resize, measure, line: size => Math.ceil(size * 1.4) }
}

// The hidden DOM: one element for each node of the semantics tree, kept by its Id, at its place over the canvas,
// transparent, without the browser's ring of focus (the page draws its own); a textbox is a real <input>, where the
// browser's typing, IME, paste and autofill happen. It takes the tree whole (update(json)) or only what changed in it
// (update.patch(json), web.Patch's), and writes only the elements, the attributes and the places that changed: a frame
// that moves rows moves their elements, and the rest of the DOM stays as it is. A node of the patch is [Id, Role, Name,
// Value, X, Y, W, H, Focused, Extra], Extra its other fields ({Href}, {Invalid, Secret}, {Expanded}, {Count}, {Index})
// or null, X and Y those of the tree less those of the nearest node above it that has a width (an element sits in the
// element of that node), as they are when W is 0; a list of kids is [Id, [Ids of its kids, in order]], and a kid that
// leaves it leaves the tree, with its own kids.
const TAGS = { heading: 'h2', button: 'button', link: 'a', textbox: 'input', list: 'ul', listitem: 'li' }
const NAMED = { text: true, heading: true, cell: true, columnheader: true } // roles whose element holds its name as text
const EXTRAS = ['Href', 'Invalid', 'Secret', 'Expanded', 'Count', 'Index']
const NONE = [undefined, undefined, undefined, undefined, undefined, undefined, 0, undefined, false, null]
const field = (e, name) => e[9] ? e[9][name] : undefined
export function mirror(layer, host) {
  const kept = new Map() // Id -> {e: its node, el, tag, kids: [Ids], up: the kept node above}
  const root = { e: [0, 'page', '', null, 0, 0, 0, 0, false, null], el: layer, tag: null, kids: [], up: null }
  kept.set(0, root)
  let focus = null // the kept node in focus
  const protos = {} // an element of each tag, its style set once, that new ones are copies of
  function element(tag) {
    let proto = protos[tag]
    if (!proto) {
      proto = protos[tag] = document.createElement(tag)
      proto.style.cssText = 'position:absolute;margin:0;padding:0;border:0;outline:none;color:transparent;background:none;caret-color:transparent;font-size:1px'
    }
    const el = proto.cloneNode(false)
    if (tag === 'input') {
      // Typed text, a paste or an autofill lands in the input, goes to the page and leaves it empty; while an IME
      // composes, the input keeps the text and the page gets it whole at the end.
      const take = () => { if (el.value) host.event({ Kind: 'text', Text: el.value }); el.value = '' }
      el.addEventListener('input', ev => { if (!ev.isComposing) take() })
      el.addEventListener('compositionend', take)
      el.addEventListener('keydown', ev => { const k = keyName(ev, true); if (k && !ev.isComposing) { ev.preventDefault(); host.event(keyOf(k, ev)) } })
    }
    return el
  }
  // The node e given to its kept node k: only what differs from its last node is written.
  function put(k, e) {
    if (k === root) { root.e = e; return }
    const role = e[1], tag = TAGS[role] || 'div'
    let o = k.e || NONE, el = k.el
    if (k.tag !== tag) {
      const made = element(tag)
      if (el) { while (el.firstChild) made.appendChild(el.firstChild); el.replaceWith(made) }
      el = k.el = made; k.tag = tag; o = NONE
    }
    if (o[1] !== role) { if (!TAGS[role] && role !== 'text') el.setAttribute('role', role); else el.removeAttribute('role') }
    if (o[2] !== e[2] || o[1] !== role) {
      if (e[2]) el.setAttribute('aria-label', e[2]); else el.removeAttribute('aria-label')
      if (NAMED[role]) el.textContent = e[2]
    }
    if (e[9] || o[9]) {
      const href = field(e, 'Href'), expanded = field(e, 'Expanded'), invalid = field(e, 'Invalid'), index = field(e, 'Index'), count = field(e, 'Count')
      if (role === 'link' && href !== field(o, 'Href')) el.href = href
      if (expanded !== field(o, 'Expanded')) { if (expanded !== undefined) el.setAttribute('aria-expanded', expanded); else el.removeAttribute('aria-expanded') }
      if (!invalid !== !field(o, 'Invalid')) { if (invalid) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid') }
      if (index !== field(o, 'Index')) { if (index) el.setAttribute('aria-rowindex', index); else el.removeAttribute('aria-rowindex') }
      if (count !== field(o, 'Count')) { if (count !== undefined) el.setAttribute('aria-rowcount', count); else el.removeAttribute('aria-rowcount') }
    }
    if (tag === 'input') { const type = field(e, 'Secret') ? 'password' : 'text'; if (el.type !== type) el.type = type }
    if (e[6] > 0) {
      const was = o[6] > 0, s = el.style
      if (!was || o[4] !== e[4]) s.left = e[4] + 'px'
      if (!was || o[5] !== e[5]) s.top = e[5] + 'px'
      if (!was || o[6] !== e[6]) s.width = e[6] + 'px'
      if (!was || o[7] !== e[7]) s.height = e[7] + 'px'
    }
    k.e = e
    if (e[8]) focus = k
    else if (focus === k) focus = null
  }
  // A kept node and all those under it leave the tree; its element leaves the DOM with theirs inside it.
  function forget(k) {
    for (const id of k.kids) { const c = kept.get(id); if (c && c.up === k) forget(c) }
    kept.delete(k.e[0])
    if (focus === k) focus = null
  }
  function drop(k) { forget(k); k.el.remove() }
  // The kids of a kept node, in order: their elements are put in its element where they aren't yet, those that left
  // are dropped.
  function place(k, ids) {
    if (k.kids.length) {
      const now = new Set(ids)
      for (const id of k.kids) { const c = kept.get(id); if (!now.has(id) && c && c.up === k) drop(c) }
    }
    let prev = null
    for (const id of ids) {
      const c = kept.get(id)
      if (!c) continue
      c.up = k
      const want = prev ? prev.nextSibling : k.el.firstChild
      if (c.el !== want) k.el.insertBefore(c.el, want)
      prev = c.el
    }
    k.kids = ids
  }
  function patch(p) {
    for (const e of p[0]) { let k = kept.get(e[0]); if (!k) { k = { e: null, el: null, tag: null, kids: [], up: null }; kept.set(e[0], k) } put(k, e) }
    for (const [id, ids] of p[1]) { const k = kept.get(id); if (k) place(k, ids) }
    if (focus && document.activeElement !== focus.el) focus.el.focus({ preventScroll: true })
  }
  // The whole tree, as web.Semantics gives it, as a patch of all its nodes.
  function whole(t) {
    const nodes = [], kids = []
    const walk = (n, ax, ay) => {
      const w = n.W > 0, extra = {}
      let any = false
      for (const f of EXTRAS) if (n[f] !== undefined) { extra[f] = n[f]; any = true }
      nodes.push([n.Id, n.Role, n.Name, n.Value === undefined ? null : n.Value, w ? n.X - ax : n.X, w ? n.Y - ay : n.Y, n.W, n.H, n.Focused, any ? extra : null])
      kids.push([n.Id, n.Kids.map(c => c.Id)])
      for (const c of n.Kids) walk(c, w ? n.X : ax, w ? n.Y : ay)
    }
    walk(t, 0, 0)
    patch([nodes, kids])
  }
  // The tree as web.Semantics gives it, from the kept nodes.
  function tree(k = root, ax = 0, ay = 0) {
    const e = k.e, w = e[6] > 0, x = w ? e[4] + ax : e[4], y = w ? e[5] + ay : e[5]
    const n = { Id: e[0], Role: e[1], Name: e[2], Value: e[3], X: x, Y: y, W: e[6], H: e[7], Focused: e[8] }
    if (e[9]) Object.assign(n, e[9])
    n.Kids = k.kids.map(id => tree(kept.get(id), w ? x : ax, w ? y : ay))
    return n
  }
  const update = json => whole(JSON.parse(json))
  update.patch = json => patch(JSON.parse(json))
  update.tree = () => tree()
  return update
}

const KEYS = { Enter: 'enter', Escape: 'escape', Backspace: 'backspace', Tab: 'tab', ' ': 'space', Delete: 'delete', Home: 'home', End: 'end', PageUp: 'pageup', PageDown: 'pagedown', ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }
const keyOf = (k, ev) => ({ Kind: 'key', Key: k, Ctrl: ev.ctrlKey || ev.metaKey, Alt: ev.altKey, Shift: ev.shiftKey })
// The name of a key as Ceres takes it ('enter', 'f5', 's' with Ctrl...), or null for a key that types. In an input the
// space types, and Ctrl-C, Ctrl-V and Ctrl-X stay the browser's; AltGr types too.
function keyName(ev, typing) {
  if (ev.key === ' ' && typing) return null
  if (KEYS[ev.key]) return KEYS[ev.key]
  if (/^F\d\d?$/.test(ev.key)) return ev.key.toLowerCase()
  if (ev.key.length !== 1 || ev.getModifierState('AltGraph') || !(ev.ctrlKey || ev.metaKey || ev.altKey)) return null
  const k = ev.key.toLowerCase()
  return typing && (ev.ctrlKey || ev.metaKey) && 'cvx'.includes(k) ? null : k
}

// The glue of the page: one canvas, its painter, its hidden DOM, and the channel of the page's events.
let glue = null

// The painter of the page's canvas, made as this module loads: the loader imports it while the page's WebAssembly
// compiles, so that the browser sets up WebGL meanwhile, the longest part of a first paint in Chrome without a GPU.
// Start makes it if it couldn't be made here, and says why.
const early = (() => {
  const canvas = typeof document === 'object' ? document.querySelector('canvas') : null
  try { return canvas ? { canvas, p: painter(canvas) } : null } catch (e) { return null }
})()
const dec = new TextDecoder()
const text = b => typeof b === 'string' ? b : dec.decode(b)

// Sets up the canvas of the page (the first <canvas> of the document): it fills its parent, the events go to the page
// on events, as JSON text or, with form "lists", as lists. Gives the page its width, height, origin and first path.
const listed = e => e.Kind === 'mouse' ? ['mouse', e.Action, e.X, e.Y, e.Button, e.Amount] : e.Kind === 'key' ? ['key', e.Key, e.Ctrl, e.Alt, e.Shift]
  : e.Kind === 'text' ? ['text', e.Text] : ['resize', e.Width, e.Height]
export function Start(events, form) {
  const canvas = document.querySelector('canvas')
  canvas.style.display = 'block'
  const p = early && early.canvas === canvas ? early.p : painter(canvas)
  const layer = document.createElement('div')
  layer.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;overflow:hidden'
  canvas.parentNode.style.position = 'relative'
  canvas.parentNode.appendChild(layer)
  const send = form !== undefined && text(form) === 'lists' ? e => events.send(listed(e)) : e => events.send(JSON.stringify(e))
  const mirrored = mirror(layer, { event: send })
  let asked = false
  const r = canvas.parentNode.getBoundingClientRect()
  glue = { p, mirrored, events, asked: 0, called: 0, wake () { if (!asked) { asked = true; requestAnimationFrame(t => { asked = false; glue.asked = t; glue.called = performance.now(); events.send('frame') }) } } }
  p.resize(r.width, r.height, window.devicePixelRatio || 1)
  Object.assign(layer.style, { width: r.width + 'px', height: r.height + 'px' })
  let first = true
  new ResizeObserver(() => {
    if (first) { first = false; return }
    const r = canvas.parentNode.getBoundingClientRect()
    p.resize(r.width, r.height, window.devicePixelRatio || 1)
    Object.assign(layer.style, { width: r.width + 'px', height: r.height + 'px' })
    send({ Kind: 'resize', Width: r.width, Height: r.height })
  }).observe(canvas.parentNode)
  const at = ev => { const r = canvas.getBoundingClientRect(); return [Math.floor(ev.clientX - r.left), Math.floor(ev.clientY - r.top)] }
  canvas.addEventListener('mousedown', ev => ev.preventDefault()) // the input in focus keeps it: the page moves focus
  for (const [name, action] of [['pointerdown', 'down'], ['pointerup', 'up'], ['pointermove', 'move']])
    canvas.addEventListener(name, ev => { const [x, y] = at(ev); send({ Kind: 'mouse', Action: action, X: x, Y: y, Button: ev.button + 1, Amount: 0 }) })
  canvas.addEventListener('wheel', ev => { ev.preventDefault(); const [x, y] = at(ev); send({ Kind: 'mouse', Action: 'wheel', X: x, Y: y, Button: 0, Amount: -Math.sign(ev.deltaY) }) }, { passive: false })
  window.addEventListener('keydown', ev => {
    if (ev.target.tagName === 'INPUT') return
    const k = keyName(ev, false)
    if (k) { ev.preventDefault(); send(keyOf(k, ev)) }
  })
  return [Math.floor(r.width), Math.floor(r.height), location.origin, canvas.dataset.path || '/', /[?&]ceres-check\b/.test(location.search)]
}

export const Measure = (t, size, font) => glue.p.measure(text(t), size, text(font))
export const Line = size => glue.p.line(size)
let shown = false
export const Mirror = json => { glue.mirrored(text(json)); shown = true }
export const Patch = json => {
  glue.mirrored.patch(text(json))
  shown = true
  if (glue.painted === glue.asked) stats.frames[stats.frames.length - 1] = performance.now() - glue.asked // the frame's work ends here
}
// In a page whose address holds ceres-check: the whole tree after every frame, as the event 'ceres-check' of the window,
// for a test that checks the hidden DOM against it (tests/web/check.js).
export const Check = json => dispatchEvent(new CustomEvent('ceres-check', { detail: text(json) }))
export const Wake = () => glue.wake()
export function Paint(bytes) {
  const start = performance.now()
  glue.p.paint(bytes)
  const now = performance.now()
  if (stats.firstPaint === null) stats.firstPaint = now
  stats.frames.push(now - glue.asked)
  glue.painted = glue.asked
  stats.waits.push(glue.called - glue.asked)
  stats.paints.push(now - start)
  if (stats.frames.length > 1000) { stats.frames.shift(); stats.waits.shift(); stats.paints.shift() }
}

// What a test reads: the semantics tree that the hidden DOM keeps, as JSON text, and the times of the frames:
// firstPaint, the time from the page's start, frames, for each, the time from the browser's frame to the page painted
// and its hidden DOM changed, waits, the part of it before the browser called the page (the time of
// requestAnimationFrame's callback is the frame's start, which Chrome takes before it runs the frame), and paints, the
// part that WebGL took, in ms.
const stats = { firstPaint: null, frames: [], waits: [], paints: [] }
export const Tree = () => shown ? JSON.stringify(glue.mirrored.tree()) : null
export const Stats = () => stats
