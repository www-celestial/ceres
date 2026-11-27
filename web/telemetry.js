// telemetry.js: what a page of Ceres learns of its visit for its app, where only the browser can tell it: its speed
// (Web Vitals, the timings of its navigation and its resources, its long tasks), its errors, its device and its
// context. Hand-written, no dependency; the page's WebAssembly (src/browser/telemetry.ce) decides what is kept, adds
// what Ceres knows itself, and sends it to the app's own address. Nothing here reads a form, a cookie or a storage of
// another site, nor asks the browser anything that would tell this browser from another (no canvas, no fonts, no
// audio, only the low-entropy client hints).
//
// The page calls it by js.Call("../../web/telemetry.js", name, args):
//   Start(json)  starts observing with the page's settings {Path, Every}: gives the context of the visit as JSON text
//   Take()       the records seen since the last call, as JSON text of a list
//   Send(json)   a batch sent to Path: by sendBeacon, which the browser sends even while the page closes
//   Ready(json)  the head of the batches, which the last one, sent here, takes
// When the tab is hidden or closes, what is left goes at once with the last values of the Web Vitals. The app's banner
// of consent, if it has one, says yes or no by the event ceres-consent of the window, its detail true or false: each
// batch then says Consent, and the app adds what its settings keep for that case (APP_TELEMETRY_CONSENT). A visitor
// who objects, by the detail "off" (kept in this site's localStorage, a choice the law lets a site keep) or by his
// browser's Global Privacy Control, sends nothing at all: Start says Off.
import { Stats } from './ceres.js'

let on = null, consent = false, pending = [], vitals = {}, inp = 0, cls = 0, win = 0, winStart = 0, winLast = 0, longs = { N: 0, Ms: 0, Max: 0 }
const t0 = performance.timeOrigin
const round = x => Math.round(x * 10) / 10
const push = r => { if (pending.length < 200) pending.push(r) }

// A text kept for the app: its emails, long numbers and tokens masked, the query and fragment of its addresses cut, 500
// bytes at most; the app masks it again, the page being anybody's.
export function scrub (s) {
  return String(s).replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email>').replace(/\b(https?:\/\/[^\s?#'"]+)[?#][^\s'"]*/g, '$1')
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, '<token>').replace(/\d{6,}/g, '<number>').slice(0, 500)
}

function observe (type, f, more) {
  try { new PerformanceObserver(l => l.getEntries().forEach(f)).observe(Object.assign({ type, buffered: true }, more)) } catch (e) {}
}

function context () {
  const n = navigator, ua = n.userAgentData, c = n.connection, m = q => matchMedia(q).matches
  const brand = ua ? (ua.brands.find(b => !/Not.?A.?Brand|Chromium/.test(b.brand)) || ua.brands[0] || {}) : null
  const nav = performance.getEntriesByType('navigation')[0] || {}
  const u = new URL(location.href), utm = {}
  for (const k of ['source', 'medium', 'campaign', 'term', 'content']) { const v = u.searchParams.get('utm_' + k); if (v) utm[k] = scrub(v).slice(0, 100) }
  const ref = document.referrer ? new URL(document.referrer) : null
  const wasm = performance.getEntriesByType('resource').find(r => /\.wasm$/.test(new URL(r.name).pathname))
  let session = ''
  try { session = sessionStorage.getItem('ceres-session') || ''; if (!session) { session = hex(); sessionStorage.setItem('ceres-session', session) } } catch (e) { session = hex() }
  return {
    Session: session, Path: location.pathname,
    Browser: brand ? brand.brand : browserOf(n.userAgent), Version: brand ? brand.version : versionOf(n.userAgent), Os: ua ? ua.platform : osOf(n.userAgent),
    Mobile: ua ? ua.mobile : /Mobi/.test(n.userAgent), Screen: [screen.width, screen.height], Viewport: [innerWidth, innerHeight], Dpr: devicePixelRatio,
    Dark: m('(prefers-color-scheme: dark)'), Motion: m('(prefers-reduced-motion: reduce)'), Lang: n.language, Zone: zone(),
    Cores: n.hardwareConcurrency, Memory: n.deviceMemory, Net: c ? c.effectiveType : undefined, Rtt: c ? c.rtt : undefined, Down: c ? c.downlink : undefined,
    Save: c ? c.saveData : undefined, Online: n.onLine,
    Ref: !ref ? '' : ref.origin === location.origin ? 'same' : ref.origin, Utm: utm,
    Nav: { Type: nav.type, Proto: nav.nextHopProtocol, Ttfb: round(nav.responseStart - nav.requestStart), Dns: round(nav.domainLookupEnd - nav.domainLookupStart),
      Tcp: round(nav.connectEnd - nav.connectStart), Dom: round(nav.domContentLoadedEventEnd), Bytes: nav.transferSize,
      Trace: ((nav.serverTiming || []).find(s => s.name === 'traceparent') || {}).description },
    Wasm: wasm ? { Fetch: round(wasm.responseEnd - wasm.startTime), Bytes: wasm.transferSize, Start: round(performance.now()) } : { Start: round(performance.now()) }
  }
}
// The offset of the visitor's clock, as UTC+01:00: coarser than the name of his zone, and the name costs 12 ms at the
// first call (Intl.DateTimeFormat), on the page's main thread as it loads.
const zone = () => { const m = -new Date().getTimezoneOffset(), a = Math.abs(m); return 'UTC' + (m < 0 ? '-' : '+') + String(Math.floor(a / 60)).padStart(2, '0') + ':' + String(a % 60).padStart(2, '0') }
// A random id of 64 bits, as hex: a tab's session, kept in its sessionStorage only, which no other tab nor site reads.
const hex = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join('')
// Without client hints (Firefox, Safari): the name and major version of the browser, the system, from the user agent.
const browserOf = s => /Firefox\//.test(s) ? 'Firefox' : /Edg\//.test(s) ? 'Edge' : /Chrome\//.test(s) ? 'Chrome' : /Safari\//.test(s) ? 'Safari' : 'other'
const versionOf = s => ((s.match(/(?:Firefox|Edg|Chrome|Version)\/(\d+)/) || [])[1]) || ''
const osOf = s => /Android/.test(s) ? 'Android' : /iPhone|iPad/.test(s) ? 'iOS' : /Windows/.test(s) ? 'Windows' : /Mac OS/.test(s) ? 'macOS' : /Linux/.test(s) ? 'Linux' : 'other'

const objected = () => { try { if (localStorage.getItem('ceres-telemetry') === 'off') return true } catch (e) {} return navigator.globalPrivacyControl === true }

export function Start (json) {
  on = JSON.parse(typeof json === 'string' ? json : new TextDecoder().decode(json))
  addEventListener('ceres-consent', e => {
    consent = e.detail === true
    if (e.detail === 'off' || e.detail === 'on') try { if (e.detail === 'off') localStorage.setItem('ceres-telemetry', 'off'); else localStorage.removeItem('ceres-telemetry') } catch (x) {}
    if (e.detail === 'off') { on.Off = true; pending = [] }
  })
  if (objected()) { on.Off = true; return JSON.stringify({ Off: true }) }
  observe('paint', e => { if (e.name === 'first-contentful-paint') vitals.Fcp = round(e.startTime) })
  observe('largest-contentful-paint', e => { vitals.Lcp = round(e.startTime) })
  // CLS as web-vitals counts it: the largest sum of shifts not caused by an input, in windows of 5 s with gaps under 1 s
  observe('layout-shift', e => {
    if (e.hadRecentInput) return
    if (e.startTime - winLast > 1000 || e.startTime - winStart > 5000) { win = 0; winStart = e.startTime }
    win += e.value; winLast = e.startTime; cls = Math.max(cls, win); vitals.Cls = Math.round(cls * 1000) / 1000
  })
  // INP: the slowest interaction, past 40 ms (the browser's own threshold of event timing)
  observe('event', e => { if (e.interactionId && e.duration > inp) { inp = e.duration; vitals.Inp = inp } }, { durationThreshold: 40 })
  observe('longtask', e => { longs.N++; longs.Ms += e.duration; longs.Max = Math.max(longs.Max, e.duration) })
  const nav = performance.getEntriesByType('navigation')[0]
  if (nav) vitals.Ttfb = round(nav.responseStart)
  addEventListener('error', e => {
    const t = e.target
    if (t && t !== window && (t.src || t.href)) push({ K: 'error', Type: 'resource', Message: scrub(t.tagName + ' ' + new URL(t.src || t.href, location.href).pathname) })
    else push({ K: 'error', Type: /RuntimeError/.test(String(e.error && e.error.name)) ? 'trap' : 'error', Message: scrub(e.message), Stack: scrub(e.error && e.error.stack || ''), Source: scrub(String(e.filename).replace(location.origin, '') + ':' + e.lineno) })
  }, true)
  addEventListener('unhandledrejection', e => push({ K: 'error', Type: 'rejection', Message: scrub(e.reason && e.reason.message || e.reason), Stack: scrub(e.reason && e.reason.stack || '') }))
  addEventListener('securitypolicyviolation', e => push({ K: 'error', Type: 'csp', Message: scrub(e.violatedDirective + ' ' + (e.blockedURI || '')), Source: scrub(String(e.sourceFile).replace(location.origin, '') + ':' + e.lineNumber) }))
  addEventListener('cesia-error', e => push({ K: 'error', Type: 'cesia', Message: scrub(String(e.detail).split('\n')[0]), Stack: scrub(e.detail) }))
  addEventListener('online', () => push({ K: 'net', Online: true, At: round(performance.now()) }))
  addEventListener('offline', () => push({ K: 'net', Online: false, At: round(performance.now()) }))
  const last = () => { if (document.visibilityState === 'hidden') flush() }
  addEventListener('visibilitychange', last)
  addEventListener('pagehide', flush)
  return JSON.stringify(context())
}

// What the glue alone knows now: the vitals so far, the long tasks, the resources, the frames of Ceres.
function summary () {
  const rs = performance.getEntriesByType('resource')
  const failed = rs.filter(r => r.responseStatus >= 400 || (r.transferSize === 0 && r.decodedBodySize === 0 && r.duration > 0 && r.responseStatus === 0)).length
  const slow = rs.reduce((a, r) => r.duration > (a ? a.duration : 0) ? r : a, null)
  const s = Stats(), f = s.frames.slice().sort((a, b) => a - b), at = p => f.length ? round(f[Math.min(f.length - 1, Math.floor(p * f.length))]) : undefined
  return [{ K: 'vitals', ...vitals }, { K: 'long', ...longs }, { K: 'res', N: rs.length, Bytes: rs.reduce((n, r) => n + (r.transferSize || 0), 0), Failed: failed,
    Slowest: slow ? { Path: scrub(new URL(slow.name).pathname), Ms: round(slow.duration) } : undefined },
    { K: 'frames', N: f.length, P50: at(0.5), P95: at(0.95), Max: f.length ? round(f[f.length - 1]) : undefined, First: s.firstPaint === null ? undefined : round(s.firstPaint) }]
}

export function Take () { const out = pending.concat(summary()); pending = []; return JSON.stringify(out) }

export function Send (json) {
  if (on.Off) return false
  const b = JSON.parse(typeof json === 'string' ? json : new TextDecoder().decode(json))
  b.Consent = consent
  const body = JSON.stringify(b)
  try { if (navigator.sendBeacon(on.Path, new Blob([body], { type: 'application/json' }))) return true } catch (e) {}
  fetch(on.Path, { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true, credentials: 'same-origin' }).catch(() => {})
  return true
}

// The tab hidden or closed: the last values go now, by the browser's beacon, with the batch the page last made.
function flush () {
  if (!on || !on.Batch || on.Off) return
  const b = Object.assign({}, on.Batch, { Items: pending.concat(summary()), End: true })
  pending = []
  Send(JSON.stringify(b))
}

// The page's own part of the next batch: the beacon at the end sends it with what is left (src/browser/telemetry.ce).
export function Ready (json) { on.Batch = JSON.parse(typeof json === 'string' ? json : new TextDecoder().decode(json)) }
