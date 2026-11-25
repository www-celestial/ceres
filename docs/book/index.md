# Ceres

Ceres is the user interface of an app in Cesia: one API for every platform, a page drawn pixel by pixel by Ceres itself,
the way Flutter draws, its data live from the app's server. A page is a function that gives widgets; data that changes
lives in *signals*, and a function given where a widget goes is a *live part*, run again when a signal it read changes,
and only it. There is no virtual DOM, and no work at all while nothing changes.

Its look is plain on purpose: ink on paper, edges of one pixel, dense rows, tables with real edges, labels beside their
fields, every action a button or a key in sight, numbers at the right in the code font, errors in plain words beside
what they concern. The theme changes all of it.

1. [A client list with a form, live from Cepheus](guide.md): the tutorial, from the project to its test.
2. [Widgets](widgets.md): signals and live parts, then each widget with a page that uses it.
3. [Forms](forms.md): one set of rules for the page and for the app.
4. [Live data](live.md): shows, actions and big tables from the app's server, over `std/live`.
5. [Ceres in a web page](web.md): a page compiled to WebAssembly, in Chrome and Firefox, then the invoices page live.
6. [Back-ends](backends.md): the draw list and the semantics tree; headless for tests, SDL3 in a window, and the
   browser.
7. [Speed](speed.md): what a frame costs, a live change, a table of 100,000 rows, the memory and the time at rest, in a
   window and in a browser, beside Flutter and SolidJS.

The reference of the packages, every public name with its parameters, is under [Reference](ref/index.html).
