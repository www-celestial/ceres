# Back-ends

Ceres lays a page out and draws it itself, into a *draw list*: rectangles, frames, texts, lines, filled triangles, and
groups that move and clip them. Every back-end paints that list, and nothing else: so a page has the same pixels in a
window, in a test and in a browser, compiled to WebAssembly. Beside it, the *semantics tree* says what each
widget is for a screen reader: its role, its name, its value, its place, the focus.

A back-end keeps the page's state and calls four functions of `web`:

- `web.Start(app, width, height, measure, origin = ..., path = ...)` mounts the app, its texts measured by
  `measure`, `{Width: (text, size, font) -> pixels, Line: size -> pixels}`;
- `web.Handle(event, page)` for each event: `{Kind: "mouse", Action, X, Y, Amount}`, `{Kind: "key", Key, Ctrl, Alt,
  Shift}`, `{Kind: "text", Text}`, `{Kind: "resize", Width, Height}`;
- `web.Update(page)` once each turn of its loop: it takes in what the live screen pushed and runs the live parts whose
  signals changed;
- `web.Frame(page)`, the draw list, only when `web.Changed(page)`; then `web.Painted(page)`.

`web.Semantics(page)` gives the tree, `web.Keys(page)` the keys of the band. A back-end that keeps what it painted
and what it mirrored takes only what changed, as the browser's does: `web.Encoded(page)` gives the bytes of the frame,
which paint what `web.Encode(web.Frame(page))` paints, made again only for the boxes laid out since the last frame, and
`web.Patch(page)` the nodes of the tree that came, moved or changed since the last patch; each gives the page back, as
`{Ui, Bytes}` and `{Ui, Text}`, to give to the next one.

## Headless, for tests

`src/headless` runs a page without a window. Its text is 7 pixels a character and 21 a line at the size 14, so every
place is known in advance. `headless.Draw(page)` gives the draw list as text, a line for each item, the groups out of
sight left out; `headless.Tree(page)` the semantics tree; `test.Snapshot` keeps either beside the test.

```cesia
use deps/www-celestial/ceres/src/web
use deps/www-celestial/ceres/src/headless

n = web.Signal(0)
page = p -> web.Row([web.Button("Add", () -> web.Set(n, web.Get(n) + 1)), () -> web.Text("Count: $(web.Get(n))")])
s = headless.ClickOn("Add", headless.ClickOn("Add", headless.Open(web.App([web.Route("/", page)]), width = 400, height = 120)))
headless.Draw(s) -->
```

`headless.Click(x, y, page)`, `headless.ClickOn(name, page)`, `headless.Press(key, page)`, `headless.Type(text, page)`,
`headless.Wheel(x, y, notches, page)` and `headless.Drag(x, y, x2, y2, page)` send the events a person would;
`headless.Settle(page, until = ...)` lets the live screen bring what the app pushed.

## SDL3, a window on the desktop

`src/sdl` paints the draw list with SDL3's renderer and SDL3_ttf, found at run time, as Cemacs draws: on Linux, Windows
and macOS. `sdl.Run(app, origin = ...)` opens a window and runs the app until it is closed; it needs
`--allow ffi=SDL3,ffi=SDL3_ttf` and `read=` for the fonts, Adwaita Sans, Noto Sans Medium and JetBrains Mono in
`src/sdl/fonts`, all under the SIL Open Font License. A still page sleeps in SDL until an event comes: no frame is
drawn while nothing changes. It wakes every 50 ms when it has a live screen, to take in what the app pushed, and every
250 ms without one. Closing the window ends `sdl.Run`, and so do TERM and INT, as in Cemacs: under `cesia run --watch`,
a change of the code closes the window and opens it again. `driver = "dummy"` runs it without a screen, and
`hidden = true` in a window of the screen's own driver, drawn by its GPU, that the screen doesn't show: the measures of
[Speed](speed.md) are taken so.

```cesia norun
use deps/www-celestial/ceres/src/sdl
use deps/www-celestial/ceres/src/web

sdl.Run(web.App([web.Route("/", p -> web.Title("Hello"))]), width = 400, height = 200)
```

`sdl.Shot(app, path, ...)` draws a page into a PNG under SDL's dummy driver, without a screen: `cesia do shots` makes
the pictures of `shots/` so. `cesia do demo` opens the invoices page of `examples/invoices`, live from its app served
in the same program, where an accountant pays an invoice elsewhere every 4 seconds.

![The invoices page in a window of SDL3: the form, the unpaid invoices live, the graph of the unpaid sum by month, and the table of 100,000 invoices.](images/invoices.png)

## The browser: src/browser and web/ceres.js

In the browser, the page's code, Ceres's and the app's, runs in WebAssembly, compiled by `cesia build --target wasm`:
[Ceres in a web page](web.md) is the tutorial. `browser.Run(app, origin = ..., path = ...)` is the loop of a window,
its window the page's first `<canvas>`: it paints the page's first frame as soon as the page is laid out, before what
its live screen brings, then waits for the page's events on a channel, handles them, and paints at the browser's next
frame when the page changed. Its live screen opens at the page's own origin unless `origin` names
another, and its first route is the canvas's `data-path`, or `/`.

What WebAssembly can't reach, the canvas, WebGL2, the events and the DOM, goes through `web/ceres.js`: 500 lines
written by hand, no dependency, 9.3 KB in brotli, which `cesia build` copies beside the page's module. It never decides
anything about the page. The page calls it by `js.Call("../../web/ceres.js", name, args)` of `std/js`:

- `Start(events, form)` sets the canvas up and sends each event on `events`, a channel of `std/fiber`, as the JSON of
  what `web.Handle` takes, `{Kind: "mouse", Action, X, Y, Button, Amount}`, `{Kind: "key", Key, Ctrl, Alt, Shift}`,
  `{Kind: "text", Text}` or `{Kind: "resize", Width, Height}`, or, with `form` `"lists"`, as the list of its fields,
  `["mouse", Action, X, Y, Button, Amount]`, `["key", Key, Ctrl, Alt, Shift]`, `["text", Text]`, `["resize", Width,
  Height]`, which the page reads without JSON (`src/browser` does); it gives `[width, height, origin, path, check]`;
- `Measure(text, size, font)` and `Line(size)`, the width of a text in whole pixels and the height of a line, by the
  browser's own fonts, each text measured once for each font and size;
- `Paint(bytes)` paints the bytes of `web.Encoded(page)`, or of `web.Encode(web.Frame(page))`, with WebGL2, in one
  buffer of vertices and one draw call for the whole frame: one shader, whose rounded corners are a distance function
  and whose clips are a box in each vertex, which the shader cuts as a scissor would; texts are drawn once by the
  browser's own text engine into an atlas, a texture that the GPU copies, so no font is downloaded: the texts that a
  frame shows for the first time go into one strip, side by side, which goes up to the atlas once. It reads the numbers
  where they are and writes the vertices into a buffer it keeps: nothing is made for an item;
- `Patch(json)` keeps the hidden DOM of the semantics tree, an element for each node, kept by its `Id`, transparent,
  over the canvas: screen readers read it, Cmd-F finds its texts, and each field is a real `<input>`, where typing, IME,
  paste and autofill happen, the text going to the page as it comes. It takes what `web.Patch(page)` gives, the nodes
  that came, moved or changed and the lists of kids that changed, and writes only those elements, attributes and
  places: a notch of the wheel over a table moves the rows that stay, adds those that come and drops those that go.
  An element is placed in the element of its node above (a node of a width), as the tree places it. `Mirror(json)`
  takes the whole tree, `web.Semantics(page)` as JSON, the same way;
- `Wake()` sends `"frame"` on the channel at the browser's next frame, the time to paint;
- `Begin()` says that the page paints a frame at once, not at the browser's next frame: its first, whose time in
  `Stats()` counts from there;
- `Check(json)`, in a page whose address holds `ceres-check`, where `Start` gives `check` true: `src/browser` sends the
  whole tree after each frame, and `tests/web/check.js` checks the hidden DOM against it (below).

![A form compiled to WebAssembly in Chrome, the elements of its hidden DOM outlined in orange for the picture: each label, field, message and button of the canvas has an element at its place, transparent, which a screen reader reads; the fields Client and Amount are a combobox and a real input.](images/backends-hidden-dom.png)

The bytes of the draw list: two u32, the count of f32 numbers and of bytes of text, the numbers, then the texts in
UTF-8. Each item is a code and its numbers: 1 rect and 2 frame (X Y W H Color Alpha Radius), 3 text (X Y Size Color
Alpha Font Start Length Angle), 4 line (n Width Color Alpha, then n points), 5 tris (n Color Alpha, then n points), 6 a
group (X Y W H Clip) whose items follow up to 7, its end, and 9 a text whose bytes follow those of the 9 before it, the
first at 0 (X Y Size Color Alpha Font Length Angle). `web.Encoded` writes its texts as 9s: the bytes of a box hold no
place of their texts, so it copies those of a box that didn't change whole into those of its parent, and the rows of a
table keep the bytes of their items while they stay in sight.

A patch of the semantics tree is the JSON of `[nodes, kids]`. A node is `[Id, Role, Name, Value, X, Y, W, H, Focused,
Extra]`, Extra its other fields, `{Href}` for a link, `{Invalid, Secret}` for a textbox, `{Expanded}` for a combobox,
`{Count}` for a table, `{Index}` for a row, or `null`; X and Y are those of the tree less those of the nearest node
above that has a width, or as they are when W is 0. A list of kids is `[Id, [Ids]]`, in order: a kid that leaves it
leaves the tree, with its own. Each box keeps what was sent of it and when it was laid out: a box not laid out since the
last patch and at the same place from its node above gives the same nodes, and the walk doesn't go into it. A table
sends the rows that came, with their cells, and the places of those that moved; a key typed in a field sends that field.

The live screen is a WebSocket of the page: `std/websocket`, in a program compiled to WebAssembly, is the browser's. It
wakes the loop when it brings something (`web.Start(..., wake = events)`), so a still page runs nothing.

`tools/webshot.sh` tests it all in Chrome without a window: it builds the invoices page, serves it live, plays a person
in `tests/web/page.html`, and prints what the page showed:

```text
done 17 rows, 2 inputs, field Bru, input left "", painted again true, measure 54
```

With `?ceres-check` in its address, `page.html?ceres-check` or `table.html?ceres-check`, a test page checks the hidden
DOM after every frame (`tests/web/check.js`): the tree that the hidden DOM keeps must be `web.Semantics(page)`, and each
element must say what its node says, its tag, role, name, text, attributes, place, size, kids in their order and the
focus; the title then ends with the frames checked and those with a mistake, `checks {"frames":93,"bad":0,"first":[]}`.
`tests/patch.test.ce` does the same without a browser: a mirror written in Cesia applies each patch and must hold the
tree after each of 25 steps, and `tests/encode.test.ce` reads the bytes of `web.Encoded` as a painter does and finds
those of `web.Encode(web.Frame(page))`.

![The invoices page compiled from Cesia to WebAssembly, painted by web/ceres.js with WebGL2 in Chrome.](images/invoices-webgl.png)

### What a page tells its app

When the settings of its live screen ask for it (Centauri's `APP_TELEMETRY_CLIENT`, on by default there), a page in
the browser tells its app what it sees of each visit, and nothing when they don't. `web/telemetry.js` observes what
only the browser can tell, by its `PerformanceObserver` and its events: the Web Vitals (LCP, INP, CLS, FCP, TTFB, as
Google's `web-vitals` counts them), the navigation, the resources, the long tasks, the frames that `web/ceres.js`
painted, the errors (a Cesia error with its place in the `.ce`, which the loader tells as the event `cesia-error`, a
trap of WebAssembly, an exception, a rejected promise, a refusal of the Content-Security-Policy, a file that didn't
load), and the device: browser and major version, system and mobile by the low-entropy client hints only, screen,
window, density, color scheme, reduced motion, language, the clock's offset from UTC, cores, memory, network. It reads
nothing that would tell one browser from another (no canvas, no fonts, no audio). `src/browser/telemetry.ce`, the
fiber `browser.Telemetry` that `browser.Run` starts, adds what Ceres knows: the time to the live screen and its breaks,
each action from its click to its answer with the `traceparent` it sent and the server's trace it got back, and each
view by its route (`web.RouteOf`, `/invoices/:id`, never the path). The page masks its texts (addresses of mail, long
numbers, tokens, the query of an address), sends a batch to its own app every `Every` seconds, and the rest by the
browser's beacon when the tab is hidden or closes.

A page of Ceres draws in a canvas, which the browser never counts for LCP: its first paint, from `web/ceres.js`, is its
measure of the same. The app's banner of consent, if any, tells the page by an event of the window, and a visitor can
object (or his browser's Global Privacy Control does): then nothing is measured nor sent.

```js
dispatchEvent(new CustomEvent('ceres-consent', { detail: true }))   // yes; false: the measure only; 'off': nothing
```

It adds 6.7 KB with Brotli to a page: `telemetry.js`, 3.7 KB, and 3.0 KB of WebAssembly. What Centauri keeps of it,
and what the law lets it keep, is in Centauri's chapter
[Telemetry](https://github.com/www-celestial/centauri/blob/main/docs/book/telemetry.md).
