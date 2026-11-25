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
start of the page, mounted and laid out: 21.77 ms; with its live data: 52.03 ms
a look at a page where nothing changed (web.Update): 2.8 us
repaint of the invoices page (147 items painted): 200 runs, frame p50 1.86 ms p99 4.83 ms; Ceres p50 0.41 ms, SDL paint p50 1.45 ms
a live change (a row gone, the bars again): 7 runs, frame p50 1.85 ms p99 3.10 ms; Ceres p50 1.10 ms, SDL paint p50 0.79 ms
a key typed in a field (124 items painted): 100 runs, frame p50 1.50 ms p99 2.21 ms; Ceres p50 0.65 ms, SDL paint p50 0.80 ms
table from the app, one notch of the wheel (124 items painted): 300 runs, frame p50 1.20 ms p99 2.26 ms; Ceres p50 0.51 ms, SDL paint p50 0.64 ms
table from the app, a drag of its scroll bar (124 items painted): 100 runs, frame p50 0.92 ms p99 1.87 ms; Ceres p50 0.16 ms, SDL paint p50 0.75 ms
table of a list, one notch of the wheel (165 items painted): 300 runs, frame p50 1.90 ms p99 4.51 ms; Ceres p50 0.88 ms, SDL paint p50 0.98 ms
sort of the 100,000 rows of a list by Client, a click: 78.09 ms
table of a list sorted, one notch of the wheel (169 items painted): 300 runs, frame p50 1.89 ms p99 3.61 ms; Ceres p50 0.93 ms, SDL paint p50 0.94 ms
```

A screen at 60 Hz gives a frame 16.7 ms: the slowest p99 here, 4.8 ms, leaves more than two thirds of it. A table
draws only the rows in sight, whatever its length, and one from the app asks it for a window of 100 rows at a time: so
scrolling 100,000 rows costs what scrolling 100 does. Two runs of the bench differ by up to half on this machine under
load: read these numbers as orders of size.

Sorting a list of 100,000 rows in the page is the one step longer than a frame, 57 to 78 ms over two runs: a table that
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

`web.Encode` turns the draw list of the invoices page into the bytes that the glue paints: 8.9 KB, in 0.43 ms
(`cesia do webframe`). The glue, `web/ceres.js`, is 16.3 KB as written and 5.5 KB in brotli. The rest waits for the
compiler of Cesia to WebAssembly: the size of the page's module and its time in the browser are not known yet.

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
