// ceres.js: the browser's glue of Ceres, hand-written, no dependency. The page's code, Ceres's and the app's, runs in
// WebAssembly; this paints its draw list with WebGL2 in one pass, measures texts with the browser's own fonts, sends
// it the events, keeps the hidden DOM of its semantics tree for screen readers, typing (IME, autofill) and Cmd-F, and
// carries its WebSocket. It never decides anything about the page.
//
// The host is what the compiled page gives (docs/book/backends.md):
//   host.event(e)        an event as web.Handle takes it: {Kind: 'mouse'|'key'|'text'|'resize', ...}
//   host.frame()         the bytes of the draw list (web.Encode), or null when nothing changed
//   host.semantics()     the semantics tree as JSON text (web.Semantics), or null when it didn't change
//   host.message(id, t)  a WebSocket message for the screen id; host.closed(id) when it closed
// and the glue gives the host: measure(text, size, font), line(size), open(url) -> id, send(id, text), close(id),
// wake() to ask for a frame. Nothing is drawn while nothing changes: a frame is asked only by wake() or an event.

const FONTS = ['system-ui, sans-serif', '600 system-ui, sans-serif', 'ui-monospace, Menlo, Consolas, monospace']
const VS = `#version 300 es
in vec2 p; in vec4 c; in vec2 t; in vec4 b; in vec2 r;
uniform vec2 s;
out vec4 vc; out vec2 vt; out vec4 vb; out vec2 vr; out vec2 vp;
void main() { vc = c; vt = t; vb = b; vr = r; vp = p; gl_Position = vec4(p.x / s.x * 2.0 - 1.0, 1.0 - p.y / s.y * 2.0, 0.0, 1.0); }`
const FS = `#version 300 es
precision mediump float;
in vec4 vc; in vec2 vt; in vec4 vb; in vec2 vr; in vec2 vp;
uniform sampler2D a;
out vec4 o;
void main() {
  if (vr.x < 0.0) { o = vec4(vc.rgb, vc.a * texture(a, vt).a); return; }
  vec2 q = abs(vp - vb.xy) - vb.zw + vr.x;
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - vr.x;
  float k = clamp(0.5 - d, 0.0, 1.0);
  if (vr.y > 0.0) k *= clamp(d + vr.y + 0.5, 0.0, 1.0);
  o = vec4(vc.rgb, vc.a * k);
}`
const STRIDE = 14 // floats a vertex: p 2, c 4, t 2, b 4, r 2
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
  for (const [name, n] of [['p', 2], ['c', 4], ['t', 2], ['b', 4], ['r', 2]]) {
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
  const scratch = document.createElement('canvas').getContext('2d', { willReadFrequently: false })
  const meter = document.createElement('canvas').getContext('2d')
  let runs = new Map(), shelfX = 0, shelfY = 0, shelfH = 0
  let verts = new Float32Array(65536), n = 0, dpr = 1, clips = [], width = 0, height = 0
  const font = (f, size) => FONTS[f].replace(/^(\d+ )?/, m => m + size + 'px ')

  // A text run in the atlas, drawn once by the browser's own text engine: {u0, v0, u1, v1, w, h} in css pixels.
  function run(text, size, f) {
    const key = f + '|' + size + '|' + text
    let e = runs.get(key)
    if (e) return e
    const css = font(f, size * dpr)
    scratch.font = css
    const w = Math.ceil(scratch.measureText(text).width) + 2, h = Math.ceil(size * dpr * 1.4) + 2
    if (shelfX + w > ATLAS) { shelfX = 0; shelfY += shelfH; shelfH = 0 }
    if (shelfY + h > ATLAS) { runs = new Map(); shelfX = shelfY = shelfH = 0 } // full: start again, as Cemacs does
    scratch.canvas.width = w; scratch.canvas.height = h
    scratch.font = css
    scratch.textBaseline = 'top'
    scratch.fillStyle = '#fff'
    scratch.fillText(text, 1, 1)
    gl.texSubImage2D(gl.TEXTURE_2D, 0, shelfX, shelfY, gl.RGBA, gl.UNSIGNED_BYTE, scratch.canvas)
    e = { u0: shelfX / ATLAS, v0: shelfY / ATLAS, u1: (shelfX + w) / ATLAS, v1: (shelfY + h) / ATLAS, w: w / dpr, h: h / dpr }
    runs.set(key, e)
    shelfX += w; shelfH = Math.max(shelfH, h)
    return e
  }

  function grow(more) {
    if (n + more <= verts.length) return
    const v = new Float32Array(Math.max(verts.length * 2, n + more))
    v.set(verts.subarray(0, n)); verts = v
  }
  function vertex(x, y, col, u, v, bx, by, bw, bh, rad, edge) {
    verts[n++] = x; verts[n++] = y
    verts[n++] = col[0]; verts[n++] = col[1]; verts[n++] = col[2]; verts[n++] = col[3]
    verts[n++] = u; verts[n++] = v
    verts[n++] = bx; verts[n++] = by; verts[n++] = bw; verts[n++] = bh
    verts[n++] = rad; verts[n++] = edge
  }
  function quad(x, y, w, h, col, rad, edge, uv) {
    grow(6 * STRIDE)
    const cx = x + w / 2, cy = y + h / 2, r = uv ? -1 : rad
    const [u0, v0, u1, v1] = uv || [0, 0, 0, 0]
    for (const [px, py, u, v] of [[x, y, u0, v0], [x + w, y, u1, v0], [x + w, y + h, u1, v1], [x, y, u0, v0], [x + w, y + h, u1, v1], [x, y + h, u0, v1]])
      vertex(px, py, col, u, v, cx, cy, w / 2, h / 2, r, edge)
  }
  function tri(pts, col) {
    grow(pts.length / 2 * STRIDE)
    for (let k = 0; k < pts.length; k += 2) vertex(pts[k], pts[k + 1], col, 0, 0, pts[k], pts[k + 1], 1e6, 1e6, 0, 0)
  }
  function flush() {
    if (n === 0) return
    gl.bufferData(gl.ARRAY_BUFFER, verts.subarray(0, n), gl.STREAM_DRAW)
    gl.drawArrays(gl.TRIANGLES, 0, n / STRIDE)
    n = 0
  }
  function scissor() {
    flush()
    const c = clips[clips.length - 1]
    if (!c) return gl.disable(gl.SCISSOR_TEST)
    gl.enable(gl.SCISSOR_TEST)
    gl.scissor(Math.floor(c[0] * dpr), Math.floor((height - c[1] - c[3]) * dpr), Math.ceil(c[2] * dpr), Math.ceil(c[3] * dpr))
  }
  const rgba = (c, a) => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255, a / 255]

  // Paints the bytes of a draw list, web.Encode's: one buffer of vertices and one draw call for each clip.
  function paint(bytes) {
    const head = new Uint32Array(bytes.buffer, bytes.byteOffset, 2)
    const f = new Float32Array(bytes.buffer, bytes.byteOffset + 8, head[0])
    const texts = new TextDecoder()
    const tbytes = new Uint8Array(bytes.buffer, bytes.byteOffset + 8 + head[0] * 4, head[1])
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.uniform2f(uS, width, height)
    gl.clearColor(1, 1, 1, 1)
    gl.disable(gl.SCISSOR_TEST)
    gl.clear(gl.COLOR_BUFFER_BIT)
    const at = [[0, 0]]
    clips = []
    let k = 0
    while (k < f.length) {
      const op = f[k], [dx, dy] = at[at.length - 1]
      if (op === 1 || op === 2) {
        const [x, y, w, h, c, a, r] = f.subarray(k + 1, k + 8)
        quad(x + dx, y + dy, w, h, rgba(c, a), r, op === 2 ? 1 : 0)
        k += 8
      } else if (op === 3) {
        const [x, y, size, c, a, fo, start, len] = f.subarray(k + 1, k + 9)
        const e = run(texts.decode(tbytes.subarray(start, start + len)), size, fo)
        quad(x + dx - 1 / dpr, y + dy - 1 / dpr, e.w, e.h, rgba(c, a), 0, 0, [e.u0, e.v0, e.u1, e.v1])
        k += 10
      } else if (op === 4) {
        const m = f[k + 1], lw = f[k + 2], col = rgba(f[k + 3], f[k + 4]), p = f.subarray(k + 5, k + 5 + 2 * m)
        for (let j = 0; j + 3 < p.length; j += 2) {
          const x1 = p[j] + dx, y1 = p[j + 1] + dy, x2 = p[j + 2] + dx, y2 = p[j + 3] + dy, l = Math.hypot(x2 - x1, y2 - y1)
          if (l === 0) continue
          const nx = -(y2 - y1) / l * lw / 2, ny = (x2 - x1) / l * lw / 2
          tri([x1 + nx, y1 + ny, x2 + nx, y2 + ny, x2 - nx, y2 - ny, x1 + nx, y1 + ny, x2 - nx, y2 - ny, x1 - nx, y1 - ny], col)
        }
        k += 5 + 2 * m
      } else if (op === 5) {
        const m = f[k + 1], col = rgba(f[k + 2], f[k + 3]), p = Array.from(f.subarray(k + 4, k + 4 + 2 * m))
        for (let j = 0; j < p.length; j += 2) { p[j] += dx; p[j + 1] += dy }
        tri(p, col)
        k += 4 + 2 * m
      } else if (op === 6) {
        const [x, y, w, h, clip] = f.subarray(k + 1, k + 6)
        at.push([x + dx, y + dy])
        if (clip) {
          const o = clips[clips.length - 1], c = [x + dx, y + dy, w, h]
          if (o) { const x0 = Math.max(o[0], c[0]), y0 = Math.max(o[1], c[1]); c[2] = Math.max(0, Math.min(o[0] + o[2], c[0] + c[2]) - x0); c[3] = Math.max(0, Math.min(o[1] + o[3], c[1] + c[3]) - y0); c[0] = x0; c[1] = y0 }
          clips.push(c); scissor()
        } else clips.push(clips[clips.length - 1])
        k += 6
      } else if (op === 7) {
        at.pop()
        const before = clips.pop()
        if (before !== clips[clips.length - 1]) scissor()
        k += 1
      } else throw new Error('Ceres: no draw item ' + op)
    }
    flush()
  }

  function resize(w, h, ratio) {
    width = w; height = h
    if (ratio !== dpr) { dpr = ratio; runs = new Map(); shelfX = shelfY = shelfH = 0 }
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr)
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px'
  }
  function measure(text, size, f) {
    meter.font = font(['body', 'strong', 'code'].indexOf(f) < 0 ? 0 : ['body', 'strong', 'code'].indexOf(f), size)
    return meter.measureText(text).width
  }
  return { paint, resize, measure, line: size => Math.ceil(size * 1.4) }
}

// The hidden DOM: one element for each node of the semantics tree, kept by its Id, at its place over the canvas,
// transparent; a textbox is a real <input>, where the browser's typing, IME, paste and autofill happen.
const TAGS = { heading: 'h2', button: 'button', link: 'a', textbox: 'input', list: 'ul', listitem: 'li' }
export function mirror(layer, host) {
  const kept = new Map()
  function element(node) {
    let el = kept.get(node.Id)
    const tag = TAGS[node.Role] || 'div'
    if (!el || el.tagName.toLowerCase() !== tag) {
      el = document.createElement(tag)
      el.style.cssText = 'position:absolute;margin:0;padding:0;border:0;color:transparent;background:none;caret-color:transparent;font-size:1px'
      if (tag === 'input') {
        // Typed text, a paste or an autofill lands in the input, goes to the page and leaves it empty; while an IME
        // composes, the input keeps the text and the page gets it whole at the end.
        const take = () => { if (el.value) host.event({ Kind: 'text', Text: el.value }); el.value = '' }
        el.addEventListener('input', ev => { if (!ev.isComposing) take() })
        el.addEventListener('compositionend', take)
        el.addEventListener('keydown', ev => { const k = keyName(ev, true); if (k && !ev.isComposing) { ev.preventDefault(); host.event(keyOf(k, ev)) } })
      }
      kept.set(node.Id, el)
    }
    if (!TAGS[node.Role] && node.Role !== 'text') el.setAttribute('role', node.Role === 'img' ? 'img' : node.Role)
    if (node.Role === 'link') el.href = node.Href
    if (node.Name) el.setAttribute('aria-label', node.Name)
    if (node.Role === 'text' || node.Role === 'heading' || node.Role === 'cell' || node.Role === 'columnheader') el.textContent = node.Name
    if (node.Expanded !== undefined) el.setAttribute('aria-expanded', node.Expanded)
    if (node.Invalid) el.setAttribute('aria-invalid', 'true')
    if (node.Index) el.setAttribute('aria-rowindex', node.Index)
    if (node.Count !== undefined) el.setAttribute('aria-rowcount', node.Count)
    if (node.W > 0) Object.assign(el.style, { left: node.X + 'px', top: node.Y + 'px', width: node.W + 'px', height: node.H + 'px' })
    return el
  }
  function place(node, parent, seen) {
    const el = node.Id === 0 ? parent : element(node)
    seen.add(node.Id)
    if (el !== parent && el.parentNode !== parent) parent.appendChild(el)
    for (const kid of node.Kids) place(kid, el, seen)
    if (node.Focused && document.activeElement !== el) el.focus({ preventScroll: true })
  }
  return function update(json) {
    const seen = new Set()
    place(JSON.parse(json), layer, seen)
    for (const [id, el] of kept) if (!seen.has(id)) { el.remove(); kept.delete(id) }
  }
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

// Starts a page: the canvas fills its parent, the events go to the host, and a frame is painted only when the host
// has one. Gives the glue's side for the host: measure, line, open, send, close, wake.
export function start(canvas, host) {
  canvas.style.display = 'block'
  const p = painter(canvas)
  const layer = document.createElement('div')
  layer.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;overflow:hidden'
  canvas.parentNode.style.position = 'relative'
  canvas.parentNode.appendChild(layer)
  let asked = false
  const draw = () => {
    asked = false
    const bytes = host.frame()
    if (bytes) p.paint(bytes)
    const tree = host.semantics()
    if (tree) mirrored(tree)
  }
  const wake = () => { if (!asked) { asked = true; requestAnimationFrame(draw) } }
  const send = e => { host.event(e); wake() }
  const mirrored = mirror(layer, { event: send })
  const fit = () => {
    const r = canvas.parentNode.getBoundingClientRect()
    p.resize(r.width, r.height, window.devicePixelRatio || 1)
    Object.assign(layer.style, { width: r.width + 'px', height: r.height + 'px' })
    send({ Kind: 'resize', Width: r.width, Height: r.height })
  }
  new ResizeObserver(fit).observe(canvas.parentNode)
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
  const sockets = new Map()
  let next = 1
  fit()
  return {
    measure: p.measure, line: p.line, wake,
    open(url) {
      const id = next++, ws = new WebSocket(new URL(url, location.href).href.replace(/^http/, 'ws'))
      ws.onmessage = e => { host.message(id, e.data); wake() }
      ws.onclose = () => { sockets.delete(id); host.closed(id); wake() }
      sockets.set(id, ws)
      return id
    },
    send(id, text) { const ws = sockets.get(id); if (ws && ws.readyState === 1) ws.send(text) },
    close(id) { const ws = sockets.get(id); if (ws) ws.close(1000) },
  }
}
