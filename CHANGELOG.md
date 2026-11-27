# Changelog

## Unreleased

### Pages of a web app

- `web.Shell`, the layout of a web app: the pages in a side bar (`web.Nav`, `web.Group`, `web.Item` with `to`, `count`
  and `tone`), a top bar with the buttons of the palette, of the density and of the theme, the page that scrolls by
  itself and keeps its place for each view, the details of a thing in a `web.Sheet` beside the page from 1280 pixels,
  over it under, the whole window on a phone, where the side bar is a drawer and the rows of a table cards; `tabs` keeps
  the views opened as tabs. `web.App(frame = ...)` makes what stands around every page once. The chapter Pages of a web
  app and `examples/pages`.
- The palette of Ctrl+K (`web.Command`), `web.Toast`, `web.CopyLink` (the address of the view in the clipboard, on a
  back-end that has one: `web.Start`'s `clip`), `web.Asked` (a change not saved asked in the sheet, inline),
  `web.Header`, `web.Spread`, `web.Wide`, `web.Chips` and `web.Chip`, `web.Bulk`, `web.Strip`, `web.Metric` (graphs that
  share a crosshair) and `web.Steps`.
- `web.Table` takes `checks` and `key` (a box to check each row), `open` and `picked` (a row opened at its address), and
  `height = missing` (as tall as its rows); `web.Pill(word, tone)` in a cell. `web.Button(style = ...)` (primary,
  ghost, danger, field) and `web.IconButton`; `web.Input(icon, hint)`, the key / of search; `web.Row(wrap = true)`.
- `web.Dark` and `web.Light` are made of `web.Tokens.Desktop` (tokens.md) on every platform, at three densities
  (`web.Densities`); `web.App(density = ...)`, `web.SetLook` and `web.LookOf`, the person's choice kept on his machine.
  An app that names no theme keeps `web.Theme`, its look of before.

### Like a desktop tool

- `web.Dock`, the layout of a desktop tool that fills the window: panels with tabs (`web.Panel`) docked left, center,
  right and bottom, splitters the mouse drags, a tab dragged to another area moves its panel, the layout kept on the
  machine with `key`; `web.Toolbar`, `web.StatusBar`, the outliner `web.Tree` of `web.Item`, the details
  `web.Inspector` of `web.Section` and `web.Property`, and `web.Tabs`, `web.Split`, `web.Scroll` alone; `web.Icon`
  and `web.Icons`. A page that makes none of them holds none of their code. The chapter Layout like a desktop tool.
- `web.Dark` and `web.Light`, the themes of a desktop tool, and `web.System()`, which follows the system;
  `web.App(..., theme = ...)`; a color is a number or the name of a role of the theme. An app that names no theme
  keeps `web.Theme`, its look of before. `web.Contrast` measures two colors as WCAG 2.2 does.
- `web.Tokens`: the values of the design of a look by name, `Desktop` dark and light, carried by the themes as
  `Tokens`; `Web`, the look of a web page, to come.
- `web.Empty`, what a place with nothing in it yet shows: a title, what goes here, the button that fills it with its
  key. The bottom panels of a dock fold to their tabs while they have only that to show, and open when something
  comes; Ctrl+J, the arrow of their strip, Enter on their tabs fold or open them by hand, which the layout keeps.
- The keyboard of a dock: F6 and Shift+F6 from area to area, Alt+Shift and an arrow on the tabs of an area move its
  panel to that side; the band of keys lists them.
- Every text in the middle of its line and of its box, in the browser and in SDL, as CSS centers it (the box of the
  font, its ascent and descent, centered), an icon in the middle of its square; checked from the pixels.

### Routes as a web site's pages

- In a browser the address holds the route shown after a `#` (`page.html#/invoices/42`): each route the app goes to is
  an entry of the browser's history, Back and Forward bring its page back, an address kept or shared opens its route,
  a link (and a row of `web.Tree` made with `to`) opens in a new tab with Ctrl or the middle button, and its element of
  the hidden DOM is an `<a href>`. In a window, Alt+Left and Alt+Right go back and forward. `web.Path(page)`.
- A view comes back as it was left: a table shown again in its route has its order, its scroll and its row chosen of
  before, and the page its scroll.
- `web.Unsaved(p, changed, save)`: going to another route while a view holds changes not saved asks first, in the
  band at the bottom of the window (save and leave Ctrl+S, leave without saving Ctrl+D, stay Esc), for a screen reader
  an alert and its buttons; in a browser, closing the tab asks too. `web.Guarded(page)`.

### When the connection drops

- A page carries on through a break of its connection, without a reload: it comes back by itself (full jitter from
  `ReconnectFirst` to `ReconnectMax`, at once on the browser's `online` and a tab shown again, a heartbeat that sees a
  silent network, `PingEvery` and `DeadAfter`), to the screen its app kept (every change of the break once) or to a
  new one whose answers replace the rows. std/live's protocol, version 2: `{Hello: 2}`, the token, `Seq`, `Got`,
  `Heard`, `Bye`; an app of version 1 is still spoken to.
- `web.Act` keeps an action asked while the page is away, in order, with its key, and sends it once the page is back;
  bounded (`OutboxCount`, `OutboxBytes`, `OutboxWait`); never sent under another account; `base`, `mine` and `read`.
  It used to refuse an action asked after a break, and to fail the actions in flight.
- `web.Connection`, the line that says the state of the connection; `web.Conflicts`, the actions refused because what
  they change changed meanwhile, with Keep mine and Take theirs (`web.Resolve`); `web.Again`; `screen.Status` and
  `screen.Conflicts`; `web.Connect`'s `net` and `settings`; `web.Start`'s `net`; `ceres.js`'s `Start(events, form,
  net)` passes the browser's `online`, `offline` and a tab shown again.

### Added

- `web.App(routes, say = f)`: Ceres's own texts, the band of keys and the page of a path that no route takes, in the
  language of the page: `f` gives the text shown for each English text, already filled in (`"No page of this app is
  at /x."`); without it they stay in English. Centauri's admin pages pass their French catalogue.

### Speed

- A frame of a page in a browser costs what changed in it. Measured on a table of 100,000 rows kept in the page
  (`bench/web/table.ce`) and on the invoices page, in Chrome without a GPU and in Firefox, the frame's own work, from
  the browser's call to the hidden DOM written and laid out: on a notch of the wheel over the table, 7.2 to 8.4 ms p50
  before and 2.6 to 2.8 now in Chrome, 6.3 to 6.5 and 3.2 to 3.3 in Firefox; a key typed, 2.3 to 3.2 and 0.8, 3.1 to 4.0
  and 0.7 to 0.8; on the invoices page, a notch 4.8 to 4.9 and 2.1 to 2.2, 3.6 to 3.9 and 2.0 to 2.1; in Centauri's
  admin over 100,005 clients, a notch p99 9.6 and 6.0 ms in Chrome, 9.4 and 8.0 in Firefox
  ([Speed](docs/book/speed.md)).
- The semantics tree goes to the hidden DOM a patch at a time: `web.Patch(page)` gives the nodes that came, moved or
  changed since the last patch and the lists of kids that changed, as JSON, `""` when nothing did. Each box keeps what
  was sent of it and when it was laid out, so the walk doesn't go into a box that wasn't laid out and didn't move; a
  table keeps its rows by their index and sends the rows that came, with their cells, and the places of those that
  moved. `ceres.js` writes only those elements, attributes and places: a key typed sends one node, a notch of the wheel
  the rows. The whole tree and its JSON were made and read again at each frame.
- `web.Encoded(page)` gives the bytes of the frame, which paint what `web.Encode(web.Frame(page))` paints, made again
  only for the boxes laid out since: each box keeps its bytes and its parent copies them whole, its texts written as 9s,
  a text whose bytes follow those of the 9 before it, so that bytes hold no place of their texts; a table's rows keep
  the bytes of their items while they stay in sight.
- The painter of `ceres.js` draws the texts that a frame shows for the first time into one strip, side by side, and
  sends it to the atlas once, where each text had its canvas resized and sent alone (a third of a ms each in Chrome
  without a GPU); it reads the numbers of the draw list where they are and writes its vertices into a buffer it keeps,
  nothing made for an item; and the clips are boxes in the vertices, cut by the shader as a scissor does: one draw call
  a frame, where each clip cost one. Each text is measured once for each font and size.
- A table keeps the items of each row in sight while the row, its values, the widths and the choice stay the same, and
  moves them all with the scroll: a notch of the wheel makes the rows that came.
- `ceres.js` sends the events to `src/browser` as lists, which it reads without JSON (`Start(events, "lists")`; JSON
  stays the default).
- A box laid out is written once, where each of its fields was written apart; a child that stays where it is isn't
  written.
- Sorting the 100,000 rows of a table in a page by a click took a third to half a second of the page's own work, Cesia's
  merge sort written in Cesia: Cesia now compiles `list.Order` and `SortBy` to its runtime's own merge sort, a click
  that sorts them now takes 30 to 49 ms where it took 361 to 416.

### Fixes

- The hidden DOM put a node that has a node above it with a width (the rows of a table, the items of a list) at its
  place in the window, inside the element of that node, so twice as far; it is now at its place from that node, as the
  tree places it. Rows that came above while scrolling up went at the end; an `aria-label` or an `aria-invalid` that
  went away stayed; the browser's ring of focus of the hidden field showed over the canvas.

### Tests

- `headless.Contrasts(page)`: the contrast of each text a page draws with what is painted under it;
  tests/contrast.test.ce reads a whole dock in both themes. tests/route.test.ce and tests/web/route.html (in Chrome, by
  tools/webshot.sh) go through routes by links, the history and the address; tests/empty.test.ce folds and opens.
- `tests/patch.test.ce`: a mirror written in Cesia applies each patch of `web.Patch` and holds `web.Semantics` after
  each of 25 steps on a page of every kind of node; a key typed sends its field alone, a notch its rows.
- `tests/encode.test.ce`: the bytes of `web.Encoded`, read as a painter reads them, are those of
  `web.Encode(web.Frame)`.
- A test page whose address holds `?ceres-check` checks the hidden DOM after every frame (`tests/web/check.js`): the
  tree it keeps is `web.Semantics`, and each element says what its node says.
- `bench/web/table.ce` and `tests/web/table.html` measure a table of 100,000 rows in a browser (`cesia do webtable`).

### Docs

- The chapter Layout like a desktop tool (docs/book/desk.md), its pictures drawn by SDL (tools/docshots/desk.ce); the
  routes in the address, Back and Forward, the views kept and the changes not saved in Widgets.

- A picture of each widget in the book, taken in Chrome from the page compiled to WebAssembly after the steps it says
  (a table sorted by a click, a field with its error, a select open, the band of keys); the tutorial's page in a window
  of SDL3; the line of the connection as the network drops and comes back, and a conflict; drawings of a signal and its
  live part, of the protocol of a live screen and of the loop of a page in the browser. `tools/docshots.sh` takes them
  all again.
