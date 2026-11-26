# Speed

A page costs what changes in it: a live part runs again when a signal it read changes, and only it; then the page is
laid out again where a size changed, its draw list made, and painted. While nothing changes, no frame is made. These
measures are taken on the invoices page of the guide, a form, a live list, a graph and a table of 100,000 invoices, live
from its app served in the same program, and on a table of 100,000 rows kept in the page.

The machine: an Intel Core i7-4720HQ of 2015 (4 cores, 8 threads), its Intel HD 4600 graphics, 11 GB, Linux under
Wayland, SDL 3.4.20 and SDL3_ttf 3.2.2, Cesia 1.3; other programs were running (a load of about 5). Each measure is a
p50, the time that half the runs stay under, and a p99, the time that 99 runs of 100 stay under.

## Frames

`cesia do bench` runs `bench/frames.ce` in a window of SDL3 with vsync off, hidden: drawn by the GPU as a shown one,
but out of the screen. A frame is the work of Ceres (the event, the live parts, the layout and the draw list) and the
painting of SDL, which includes the copy to the window:

```text
start of the page, mounted and laid out: 15.21 ms; with its live data: 41.12 ms
a look at a page where nothing changed (web.Update): 1.7 us
repaint of the invoices page (147 items painted): 200 runs, frame p50 0.84 ms p99 3.14 ms; Ceres p50 0.16 ms, SDL paint p50 0.67 ms
a live change (a row gone, the bars again): 7 runs, frame p50 1.88 ms p99 2.20 ms; Ceres p50 1.10 ms, SDL paint p50 0.78 ms
a key typed in a field (124 items painted): 100 runs, frame p50 1.00 ms p99 1.89 ms; Ceres p50 0.41 ms, SDL paint p50 0.59 ms
table from the app, one notch of the wheel (124 items painted): 300 runs, frame p50 0.87 ms p99 1.58 ms; Ceres p50 0.34 ms, SDL paint p50 0.52 ms
table from the app, a drag of its scroll bar (124 items painted): 100 runs, frame p50 0.76 ms p99 1.89 ms; Ceres p50 0.13 ms, SDL paint p50 0.62 ms
table of a list, one notch of the wheel (165 items painted): 300 runs, frame p50 1.15 ms p99 2.10 ms; Ceres p50 0.40 ms, SDL paint p50 0.75 ms
sort of the 100,000 rows of a list by Client, a click: 36.43 ms
table of a list sorted, one notch of the wheel (169 items painted): 300 runs, frame p50 1.17 ms p99 1.92 ms; Ceres p50 0.44 ms, SDL paint p50 0.73 ms
```

A screen at 60 Hz gives a frame 16.7 ms: the slowest p99 here, 3.1 ms, leaves more than four fifths of it. A table
draws only the rows in sight, whatever its length, and one from the app asks it for a window of 100 rows at a time: so
scrolling 100,000 rows costs what scrolling 100 does; and a table keeps the items of each row that stays in sight, so a
notch makes the rows that came: Ceres's part of a notch over a table of a list went from 0.67 to 0.40 ms p50, sorted
from 0.59 to 0.44, a key typed from 0.49 to 0.41, the rest the same (the code before and now, one run each, one after
the other, load 3). Two runs of the bench differ by up to half on this machine under load: read these numbers as orders
of size.

Sorting a list of 100,000 rows in the page is the one step longer than a frame, 32 to 78 ms over the runs: a table that
large is better sorted by the app, which `web.Pages` asks for.

## At rest

`cesia do still` runs the invoices page in `sdl.Run`, in a hidden window, live from its app, and reads the CPU time of
the process over 20 seconds while nothing changes:

```text
at rest: 0.040 s of CPU in 20.0 s, 0.20 % of a core; memory 131.0 MB, peak 131.0 MB
```

No frame is drawn at rest. The 0.2 % is the wait: a page with a live screen wakes 20 times a second, every 50 ms, to
take in what the app pushed; a look at a page where nothing changed costs 2.8 µs, and the rest is SDL's own look at its
events. A page without a live screen wakes 4 times a second. The 50 ms are also the longest a push waits before it is
drawn.

## Memory

What the bench reads in `/proc/self/status`, part after part:

```text
memory: Cesia 10.7 MB, + the app's 100,000 invoices 38.9 MB, + SDL and its renderer 68.7 MB, + the page live 9.0 MB
```

The page itself, with its signals, its boxes, its live client and the text objects of SDL3_ttf, takes 9 MB; the
renderer of SDL, with the GPU's driver, most of the rest. The app's invoices are in the same program here only because
the example serves its app itself.

## In the browser

Two pages compiled to WebAssembly ([Ceres in a web page](web.md)), on the machine above, in chrome-headless-shell 153,
which draws WebGL without a GPU (SwiftShader), as headless Chrome does, and in Firefox 160, each run a new browser, the
code of before and of now one after the other, 3 rounds (load 1 to 4):

- the invoices page, live from its app, by `tests/web/frames.html`: 200 notches of the wheel over its table of 100,000
  invoices from the app, one every 16 ms, then 30 letters typed in a field;
- a table of 100,000 rows kept in the page, 8 columns, as Centauri's admin shows the clients of an office
  (`bench/web/table.ce`, served by `cesia do webtable`), by `tests/web/table.html`: 120 notches, each in a frame of its
  own, a click on a title that sorts the 100,000 rows, 30 letters typed.

A frame is the page's own work from the browser's call: the bytes of the draw list (`web.Encoded`), their paint by
WebGL, what changed in the semantics tree (`web.Patch`) and the hidden DOM's elements written; then the browser lays out
and paints its hidden DOM. To see each part, a copy of `src/browser`'s loop marks each step with the clock of the page,
and the hidden DOM's layout is forced right after its writes, so that it counts in the frame (`?prof`, `prof.js`).
Before, a frame made the whole semantics tree, its JSON, and wrote every element of the hidden DOM again.

The table of 100,000 rows, a notch of the wheel, p50 in ms (the ranges of the rounds):

| | Chrome, before | Chrome, now | Firefox, before | Firefox, now |
|---|---|---|---|---|
| The event: the wheel, the table laid out | 0.8 to 0.9 | 0.5 | 1.1 to 1.3 | 0.6 |
| The bytes of the draw list | 0.4 | 0.4 | 0.4 to 0.6 | 0.6 |
| Their paint by WebGL | 3.7 to 3.9 | 0.9 | 2.0 to 2.5 | 1.1 |
| The semantics tree: whole and its JSON, now a patch | 0.5 | 0.2 | 0.3 | 0.2 |
| The hidden DOM written | 1.4 to 1.5 | 0.4 | 1.3 to 1.6 | 0.5 |
| The hidden DOM laid out | 1.1 | 0.8 | 1.2 to 1.5 | 0.7 |
| The frame, p50 / p99 | 7.2 to 8.4 / 12.6 to 18 | 2.6 to 2.8 / 8.4 to 10.7 | 6.3 to 6.5 / 9.0 to 10.9 | 3.2 to 3.3 / 7.4 to 11.9 |
| A key typed in the field, the frame, p50 / p99 | 2.3 to 3.2 / 4.8 to 11.9 | 0.8 / 1.0 to 3.0 | 3.1 to 4.0 / 6.3 to 10.5 | 0.7 to 0.8 / 2.4 |
| A sort of the 100,000 rows: the click | 377 to 401 | 30 to 49 | 361 to 416 | 40 to 46 |
| Then its frame | 16.8 to 18.5 | 6.7 to 6.8 | 10.9 to 13.9 | 6.6 to 8.8 |

The invoices page, p50 / p99 in ms:

| | Chrome, before | Chrome, now | Firefox, before | Firefox, now |
|---|---|---|---|---|
| A notch: the event | 0.8 | 0.5 | 0.7 to 0.8 | 0.4 to 0.5 |
| A notch: the frame | 4.8 to 4.9 / 10.7 to 11.5 | 2.1 to 2.2 / 6.1 to 7.4 | 3.6 to 3.9 / 5.9 to 7.9 | 2.0 to 2.1 / 4.5 to 5.9 |
| A key typed: the frame | 2.2 to 2.3 / 3.9 to 5.9 | 0.8 / 1.6 to 4.4 | 3.0 to 3.6 / 5.5 to 7.9 | 0.9 / 1.6 to 2.6 |

One round of the code of now in the table, during which another program loaded the machine (its sort took 87 and 121
ms), is left out. With 60 frames a run, the p99 of the table is its slowest frame: a collection of the engine's memory,
or a notch that brings a row of texts never drawn before.

Centauri's admin pages, a data browser of 100,005 clients, 120 notches and a sort by a click (its `admin-bench`, one run
each, the code of before and of now; the frame there is `ceres.js`'s `Stats()`, from the browser's call to the frame
painted, and now to the hidden DOM written too, so it counts more of the work than before): in Chrome without a GPU, a
notch p50 3.8 ms before, 2.4 now, p99 9.6 and 6.0, the slowest 19.4 and 6.1; a click that sorts, to the rows sorted on
screen, 493 ms and 126; in Firefox, a notch p50 2.9 and 2.3, p99 9.4 and 8.0, the sort 582 ms and 121.

Where the time went:

- **The paint.** Each text that a frame showed for the first time had its own canvas, resized for it, drawn by the
  browser and sent alone to the GPU's atlas: 0.34 ms a text in Chrome without a GPU, and a notch over a table brings 16.
  Now they are drawn side by side into one strip, sent once a frame as bytes (Firefox took 0.6 ms to send a part of a
  canvas). The painter reads the numbers of the draw list where they are and writes its vertices into a buffer it keeps,
  where it made arrays for each item, and the clips are boxes in the vertices that the shader cuts: one draw call a
  frame, where each clip was one.
- **The semantics tree.** A frame made the whole tree, then its JSON, which the glue read and wrote back into every
  element of the hidden DOM, its text and its attributes again. Now `web.Patch` walks only the boxes laid out since the
  last frame or moved, and sends the nodes that came, moved or changed: a key typed sends its field, a notch the rows of
  the table that came and the places of those that moved. The glue writes only those elements, attributes and places.
- **The table.** A row that stays in sight keeps its items and their bytes; a group moves them all with the scroll.
- **The sort.** `list.SortBy` of 100,000 rows took the merge sort of Cesia's standard library, written in Cesia; it is
  now the runtime's own, the interpreter's merge sort written in WebAssembly: 30 to 49 ms for the click, where it held
  the page for a third of a second.
- **The events** come to the page as lists of their fields, which it reads without parsing JSON in WebAssembly.

What the browser does with its hidden DOM after a notch, from a trace of Chrome: style 0.16 ms, layout 0.26, the paint's
preparation 0.26, the paint 0.45 and its commit 0.25, a frame. At rest, the page runs nothing: in 10 seconds of the
table page left alone, no frame, no layout, no style, 0.01 ms of script, and the memory of its engine 2.3 KB more, the
measure's own (`Performance.getMetrics` of Chrome's DevTools protocol).

The page's wait for the browser's call is apart: Chrome stamps a frame with its start, before it runs it, and without a
GPU it draws with SwiftShader, whose compositor backs up, so its frames waited 6 to 7 ms before the page was called in
Chrome 158 (1 ms in chrome-headless-shell above), and with the GPU 0.3 ms, as in Firefox. A first paint in Chrome
without a GPU is mostly the setting up of WebGL, 117 to 431 ms, which `ceres.js` starts as it loads, while the module
compiles. What the browser loads for the invoices page: the module, 408,215 bytes, 108,746 in brotli (389,745 and
103,486 before: the patch, the bytes kept per box and the rows kept per table are the 5 KB more); its loader, 3.8 KB in
brotli; `ceres.js`, 9.3 KB in brotli (6.1 before). The chapter Compiling to WebAssembly of Cesia's book weighs each
part, beside the frameworks of JavaScript. The window of SDL3 does a frame in 0.8 to 1.9 ms.

## Beside Flutter and SolidJS

These are not measured on this machine: what follows is what each does by design, not a race.

- **At rest**, Flutter and SolidJS wake for nothing: an event or a message wakes them. Ceres wakes 20 times a second
  with a live screen, 0.2 % of a core, because a Cesia program can't yet wait for SDL's events and for its socket in
  one call.
- **Text**: Flutter shapes text with HarfBuzz and lays out every script, right to left and mixed, in its paragraph
  engine; in SolidJS, the browser does. Ceres draws each run with SDL3_ttf, and its layout breaks lines between words,
  left to right only.
- **Access and typing**: SolidJS has the DOM itself: screen readers, selection, find, translation, autofill and IME, all
  native. Flutter gives its semantics tree to the accessibility of each platform. Ceres mirrors its semantics tree in a
  hidden DOM in the browser; on the desktop, it gives it to no screen reader yet.
- **The first page in a browser**: SolidJS sends a few KB of JavaScript and shows the page as soon as it runs. Ceres,
  like Flutter on the web, sends a WebAssembly module and draws everything itself: the first page waits for the module.
- **Where Ceres stands**: one draw list for every platform, so the same pixels everywhere; no virtual DOM and no work at
  rest beyond the wait; the whole page tested without a browser and without a window, as the examples of this book are.
