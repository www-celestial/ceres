# Back-ends

Ceres lays a page out and draws it itself, into a *draw list*: rectangles, frames, texts, lines, filled triangles, and
groups that move and clip them. Every back-end paints that list, and nothing else: so a page has the same pixels in a
window, in a test and, once Cesia compiles to WebAssembly, in a browser. Beside it, the *semantics tree* says what each
widget is for a screen reader: its role, its name, its value, its place, the focus.

A back-end keeps the page's state and calls four functions of `web`:

- `web.Start(app, width, height, measure, origin = ..., path = ...)` mounts the app, its texts measured by
  `measure`, `{Width: (text, size, font) -> pixels, Line: size -> pixels}`;
- `web.Handle(event, page)` for each event: `{Kind: "mouse", Action, X, Y, Amount}`, `{Kind: "key", Key, Ctrl, Alt,
  Shift}`, `{Kind: "text", Text}`, `{Kind: "resize", Width, Height}`;
- `web.Update(page)` once each turn of its loop: it takes in what the live screen pushed and runs the live parts whose
  signals changed;
- `web.Frame(page)`, the draw list, only when `web.Changed(page)`; then `web.Painted(page)`.

`web.Semantics(page)` gives the tree, `web.Keys(page)` the keys of the band.

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

## The browser: web/ceres.js

In the browser, the page's code, Ceres's and the app's, runs in WebAssembly, compiled by Cesia (the job that makes
that compiler is under way). What WebAssembly can't reach, the canvas, WebGL2, the events, the WebSocket and the DOM,
goes through `web/ceres.js`: 314 lines written by hand, no dependency, 16.3 KB as written and 5.5 KB in brotli. It
never decides anything about the page:

- it paints the bytes of `web.Encode(web.Frame(page))` with WebGL2, in one buffer of vertices and one draw call for
  each clip: one shader, whose rounded corners are a distance function; texts are drawn once by the browser's own text
  engine into an atlas, a texture that the GPU copies, so no font is downloaded;
- it keeps the hidden DOM of `web.Semantics(page)`, an element for each node, kept by its `Id`, transparent, over the
  canvas: screen readers read it, Cmd-F finds its texts, and each field is a real `<input>`, where typing, IME, paste
  and autofill happen, the text going to the page as it comes;
- it sends the events, measures the texts with the browser's fonts, and carries the WebSocket of the live screen;
- it asks for a frame only when the page has one: nothing runs while nothing changes.

The bytes of the draw list: two u32, the count of f32 numbers and of bytes of text, the numbers, then the texts in
UTF-8. Each item is a code and its numbers: 1 rect and 2 frame (X Y W H Color Alpha Radius), 3 text (X Y Size Color
Alpha Font Start Length Angle), 4 line (n Width Color Alpha, then n points), 5 tris (n Color Alpha, then n points), 6 a
group (X Y W H Clip) whose items follow up to 7, its end.

The page plugs into it through a *host*: `start(canvas, host)` takes `host.event(e)`, `host.frame()` (the bytes, or
null when nothing changed), `host.semantics()` (the tree as JSON, or null) and `host.message(id, text)`,
`host.closed(id)` for the WebSocket; it gives the host `measure(text, size, font)`, `line(size)`, `open(url)`,
`send(id, text)`, `close(id)` and `wake()`. Once Cesia compiles Ceres, the host is the compiled page: its exports
called through this interface, a few lines that follow the compiler's way of passing texts.

`tools/webshot.sh` tests the glue today without WebAssembly: Chrome without a window paints the draw list that Ceres
made natively for the invoices page, keeps its hidden DOM, types a text and two keys in its first field, and writes
`shots/invoices-webgl.png`. It prints what the host got:

```text
done 17 rows, 2 inputs, typed Brun, keys backspace, input left "", painted again true, measure 54
```

![The same page painted by web/ceres.js with WebGL2 in Chrome, from the draw list that Ceres made natively.](images/invoices-webgl.png)
