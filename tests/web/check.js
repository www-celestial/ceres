// The check of the hidden DOM, for a test page whose address holds ceres-check: after every frame the page sends its
// whole semantics tree (web.Semantics, by ceres.js Check, as an event 'ceres-check' of the window), and here the tree
// that the hidden DOM keeps (ceres.js Tree) must be it, and each element of the hidden DOM must say what its node says:
// its tag, its role, its name, its text, its attributes, its place and size, its kids in their order, the focus.
// window.ceresChecks counts the frames checked, those that had a mistake, and keeps the first mistakes.
import { Tree } from '/ceres.js'
const TAGS = { heading: 'h2', button: 'button', link: 'a', textbox: 'input', list: 'ul', listitem: 'li' }
const NAMED = { text: true, heading: true, cell: true, columnheader: true }
const checks = globalThis.ceresChecks = { frames: 0, bad: 0, first: [] }
const same = (a, b) => a === b || (a && b && typeof a === 'object' && typeof b === 'object' &&
  Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => same(a[k], b[k])))
function mistakes(tree) {
  const bad = [], layer = document.querySelector('canvas').parentNode.querySelector(':scope > div'), l = layer.getBoundingClientRect()
  let focus = null
  const walk = (n, el) => {
    const say = m => bad.push(n.Id + ' ' + n.Role + ': ' + m)
    if (n.Id !== 0) {
      const tag = TAGS[n.Role] || 'div', r = el.getAttribute('role')
      if (el.tagName.toLowerCase() !== tag) say('tag ' + el.tagName)
      if ((!TAGS[n.Role] && n.Role !== 'text') ? r !== n.Role : r !== null) say('role ' + r)
      if ((el.getAttribute('aria-label') || '') !== (n.Name || '')) say('label ' + el.getAttribute('aria-label'))
      if (NAMED[n.Role] && el.textContent !== n.Name) say('text ' + el.textContent)
      if (n.Role === 'link' && el.getAttribute('href') !== n.Href) say('href ' + el.getAttribute('href'))
      if ((n.Expanded === undefined ? null : String(n.Expanded)) !== el.getAttribute('aria-expanded')) say('expanded')
      if ((n.Invalid ? 'true' : null) !== el.getAttribute('aria-invalid')) say('invalid')
      if (tag === 'input' && el.type !== (n.Secret ? 'password' : 'text')) say('type ' + el.type)
      if ((n.Index ? String(n.Index) : null) !== el.getAttribute('aria-rowindex')) say('rowindex')
      if ((n.Count === undefined ? null : String(n.Count)) !== el.getAttribute('aria-rowcount')) say('rowcount')
      if (n.W > 0) {
        const b = el.getBoundingClientRect()
        if (Math.abs(b.left - l.left - n.X) > 0.5 || Math.abs(b.top - l.top - n.Y) > 0.5 || Math.abs(b.width - n.W) > 0.5 || Math.abs(b.height - n.H) > 0.5)
          say('box ' + [b.left - l.left, b.top - l.top, b.width, b.height].join(',') + ' for ' + [n.X, n.Y, n.W, n.H].join(','))
      }
      if (n.Focused) focus = el
    }
    const els = Array.from(el.children)
    if (els.length !== n.Kids.length) say(els.length + ' elements for ' + n.Kids.length + ' kids')
    n.Kids.forEach((k, i) => els[i] && walk(k, els[i]))
  }
  walk(tree, layer)
  // An element that the browser can't focus (a table's) leaves the focus where it was.
  if (focus && document.activeElement !== focus && focus.matches('input, button, a[href]')) bad.push('focus not on ' + focus.getAttribute('aria-label'))
  return bad
}
addEventListener('ceres-check', ev => {
  const want = JSON.parse(ev.detail), got = JSON.parse(Tree())
  const bad = same(want, got) ? mistakes(got) : ['the kept tree differs from the tree']
  checks.frames++
  if (bad.length) { checks.bad++; if (!checks.first.length) checks.first = bad.slice(0, 5) }
})
