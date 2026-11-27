# Widgets

Every widget is a value that a function of `web` makes: a dictionary with a `Kind`, which the page's runtime mounts,
lays out and draws. Each example below is a whole page run on the headless back-end, which draws without a window, and
shows the page's semantics tree, what a screen reader reads, each widget at its place in pixels. The headless text is
7 pixels a character and 21 a line at the size 14, so the places can be checked by hand.

The pictures are these widgets in Chrome, compiled to WebAssembly, after the steps they say; `tools/docshots.sh`
takes them all again.

```cesia
use deps/www-celestial/ceres/src/web
use deps/www-celestial/ceres/src/headless
use std/plot

(* A page of one widget, opened in a window of 600 by 300 pixels. *)
one(w) = headless.Open(web.App([web.Route("/", _ -> w)]), width = 600, height = 300)
```

## Signals

A *signal* is a value that changes, as in SolidJS: `web.Signal(v)` makes one, `web.Get(s)` reads it, `web.Set(s, v)`
changes it. A function given where a widget goes is a *live part*: the runtime runs it once, notes the signals it read,
and runs it again, it alone, when one of them changes. Nothing else of the page is looked at again, and nothing runs at
all while nothing changes: there is no virtual DOM to compare.

![A page of three widgets: a title, a live part that shows n, and a button. At its first run the live part reads the signal n, which notes it; a click on the button calls web.Set(n, 2), and the live part runs again, it alone, while the title and the button are not looked at again.](images/widgets-signals.svg)

```cesia
n = web.Signal(1)
page = one(web.Stack([() -> web.Text("n is $(web.Get(n))")]))
web.Set(n, 2)
headless.Tree(web.Update(page)) -->
```

`web.Memo(f)` is a signal computed from others, before the live parts that read it, so that a part never sees it older
than its signals (a *glitch*, in the words of Bainomugisha et al., 2013). `web.IsSignal(x)` tells a signal from a
value.

```cesia
price = web.Signal(10)
taxed = web.Memo(() -> web.Get(price) * 1.2)
web.Get(taxed) --> 12.0
web.IsSignal(taxed) --> true
```

## Text and Title

`web.Text(x)` shows a value, a signal as it changes, or a live function. A long text breaks between words. Numbers and
amounts are in the code font, whose figures line up; `font` gives "body", "strong" or "code". `web.Title` is a strong,
larger text: a heading.

```cesia
headless.Tree(one(web.Stack([web.Title("Invoices"), web.Text(42), web.Text("unpaid", font = "strong")]))) -->
```

![The title Invoices, larger and strong, then 42 in the code font and unpaid in the strong font, one under the other.](images/widgets-text.png)

## Stack, Row, Grow, Spacer, Divider

`web.Stack` puts widgets one under the other, `web.Row` side by side; `gap` is the space between them, `pad` the space
inside. In a row each child is as wide as it needs, and those that `web.Grow` marks share what is left; `web.Spacer()`
is such a share, empty. `web.Divider()` is a thin line across.

```cesia
headless.Tree(one(web.Row([web.Text("Total"), web.Spacer(), web.Text(12.5)]))) -->
```

![A stack of two rows split by a divider: Total at the left and 12.5 pushed to the right by a spacer; then Client, a field that grows to fill the row with Brun typed in it, and the button Find.](images/widgets-layout.png)

## Button

A plain button, its label in an edge of one pixel. `key` gives it a key of its own, "C-s" for Ctrl and s: the button
shows it beside its label, the band of keys lists it, and the key presses it from anywhere in the page.

```cesia
saved = web.Signal(0)
page = one(web.Button("Save", () -> web.Set(saved, web.Get(saved) + 1), key = "C-s"))
page = headless.Press("s", page)
web.Get(saved) --> 0
page = web.Handle({Kind: "key", Key: "s", Ctrl: true, Alt: false, Shift: false}, page)
web.Get(saved) --> 1
```

![The button Save with its key C-s beside its label, and Saved 2 times after Ctrl-S was pressed twice; the band of keys at the bottom lists C-s Save.](images/widgets-button.png)

## Input

A field of one line, bound to a signal of a text: typing changes the signal, and a change of the signal shows. Its text
is in the code font. `onEnter` runs on Enter; `invalid` draws it as wrong, as a form does.

```cesia
name = web.Signal("")
page = headless.Type("Ana", headless.ClickOn("Name", one(web.Input(name, label = "Name"))))
web.Get(name) --> "Ana"
```

`unit`, a short text as `€`, stands muted at its right: the unit of the amount typed. `secret = true` makes it the field
of a password: it shows a dot for each character, the tree of semantics (what a
screen reader and a test read) holds the dots only, and in a browser its hidden input is of the type `password`, which
the browser's manager of passwords fills.

```cesia
pass = web.Signal("")
page = headless.Type("hunter2", headless.ClickOn("Password", one(web.Input(pass, label = "Password", secret = true))))
web.Get(pass) --> "hunter2"
```

![Two fields: Name holds Ana; Password, in focus with its blue edge and its caret, shows a dot for each of the 7 characters typed.](images/widgets-input.png)

## Select

A choice among options, a list or a signal of rows: the signal it is bound to holds the key of the chosen one. A click
opens the list under it; Up and Down change the choice while it has the focus.

```cesia
city = web.Signal(missing)
cities = [{Id: 1, Name: "Lyon"}, {Id: 2, Name: "Nice"}]
page = one(web.Select(city, cities, c -> c.Id, c -> c.Name, name = "City"))
page = headless.Press("down", headless.Press("down", headless.Press("escape", headless.ClickOn("City", page))))
web.Get(city) --> 2
```

![The select City open after a click, its list under it: Down twice chose Nice, which is shown in the field and marked in the list.](images/widgets-select.png)

## DateInput

A day chosen in a calendar, bound to a signal of a text `YYYY-MM-DD` (`""` for none). A click, or Enter, Space or Down
while it has the focus, opens the month of its day under it (today's when it holds none): the days of a week from
Monday, as ISO 8601 counts them, today ringed, the day chosen in the accent. A click on a day chooses it and closes the
calendar; while it is open the arrows move the day (Up and Down a week), Page Up and Page Down a month, Enter and Esc
close it; Delete clears the field. `say` gives the names of the months and days in the page's language, `show` the text
the field shows of a day (`13/11/2026` in French). A screen reader reads it as a combobox, its days as buttons named by
their day.

```cesia
due = web.Signal("2026-11-13")
page = headless.ClickOn("Due", one(web.DateInput(due, label = "Due")))
page = headless.Press("pagedown", headless.Press("right", page))
web.Get(due) --> "2026-12-14"
```

![The field Due open after a click: the calendar of November 2026 under it, the days of the week from Mo to Su, the 14th chosen in the accent after Right.](images/widgets-date.png)

## Each

A list that follows a signal of rows, a widget for each row. Rows are told apart by their key: when the rows change, the
widgets of the rows that stay are kept, those of new rows are made, those of rows gone are dropped.

```cesia
rows = web.Signal([{Id: 1, Name: "Ana"}, {Id: 2, Name: "Bo"}])
page = one(web.Each(rows, r -> r.Id, r -> web.Text(r.Name)))
web.Set(rows, [{Id: 2, Name: "Bo"}, {Id: 3, Name: "Cy"}])
headless.Tree(web.Update(page)) -->
```

![Before and after: the list Ana, Bo; a click on Change the rows sets the signal to Bo, Cy, and the list shows Bo, Cy, the widget of Bo kept.](images/widgets-each.png)

## Table and Column

A big table: only the rows in sight are drawn, so 100,000 rows cost as 30. The rows come from a list or a signal of a
list, sorted here, or from the app a window at a time with `web.Pages` (the chapter [Live data](live.md)). A click on
the title of a column with `sort` sorts by it; numbers and amounts go to the right of their column.

```cesia
rows = [{Number: "F-$k", Total: k * 10} for k in 1..100000]
table = web.Table(rows, [web.Column("Number", r -> r.Number, sort = "Number"), web.Column("Total", r -> web.Money(r.Total))], height = 120, label = "Invoices")
page = headless.Wheel(100, 60, -1000, one(table))
headless.Tree(page) -->
```

![A table of 100,000 invoices sorted by a click on the title Client, which shows ^: the rows of Atelier Brun come first, F-1, F-7, F-13 and on; the totals are amounts at the right of their column, and a scroll bar at the right.](images/widgets-table.png)

## Plot

A graph of std/plot, drawn by Ceres: `web.Plot` takes a function that gives one, a live part, drawn again when a signal
it read changes. M4 (Jugel et al., VLDB 2014), which std/plot applies to long lines, keeps a line of a million points
as a few points for each column of pixels.

```cesia
months = web.Signal([{Month: "Oct", Total: 340}, {Month: "Nov", Total: 80}])
graph = web.Plot(() -> plot.Of([plot.Bars([m.Month for m in web.Get(months)], [m.Total for m in web.Get(months)])], title = "Unpaid by month"), height = 200)
headless.Tree(one(graph)) -->
```

![A graph of bars, Unpaid by month: Jul 120, Aug 260, Sep 190, Oct 340 and Nov 80, its axis of amounts at the left.](images/widgets-plot.png)

## Money and Grouped

`web.Money(x)` is an amount as a text widget in the code font, two digits after the point, its thousands apart, as a
French page writes it; `web.Grouped` gives the text alone.

```cesia
web.Money(1234.5).Text --> "1 234,50 €"
web.Grouped(1234.5, decimal = ".", group = ",") --> "1,234.50"
```

![Bread 3,20 €, Rent 1 234,50 € and, under a divider, Total 1 237,70 €: the amounts in the code font at the right, their figures lined up.](images/widgets-money.png)

## Link, routes and Go

An app is its routes, `web.Route(pattern, page)`: a part of the path written `:name` goes into `p.Params`. `web.Link`
goes to another route, as `web.Go(path, p)` does from code.

```cesia
home = p -> web.Link("Invoice 42", "/invoices/42")
invoice = p -> web.Title("Invoice $(p.Params.id)")
app = web.App([web.Route("/", home), web.Route("/invoices/:id", invoice)])
headless.Tree(headless.ClickOn("Invoice 42", headless.Open(app))) -->
```

![Before and after: the link Invoice 42, underlined; a click on it shows the route /invoices/:id, the title Invoice 42.](images/widgets-link.png)

In a browser, the address holds the route shown after a `#`, as `page.html#/invoices/42`, the way a web site gives each
page its address: each route the app goes to is a new entry of the browser's history, so Back and Forward bring the
pages back; an address kept in a bookmark or sent to someone opens on its route; a link pressed with Ctrl (Cmd on a
Mac) or the middle button opens in a new tab, and its element of the hidden DOM is a real `<a href="#/invoices/42">`,
which a screen reader announces as a link. The `#` needs nothing from the server: any server of files serves the
page, and the route never leaves the browser. In a window, Alt+Left and Alt+Right go back and forward, as in a file
manager.

A view comes back as it was left. A table shown again in its route, by Back, by a link or because a live part made the
page again, has its order, its scroll and its row chosen of before (a table is known by its route, its label and the
titles of its columns: two tables alike in one route share them), and the page is scrolled to where it was.
`web.Path(page)` gives the route shown.

```cesia
app = web.App([web.Route("/", p -> web.Link("Invoice 42", "/invoices/42")), web.Route("/invoices/:id", p -> web.Title("Invoice $(p.Params.id)"))])
page = headless.ClickOn("Invoice 42", headless.Open(app))
web.Path(page) --> "/invoices/42"
back = web.Handle({Kind: "key", Key: "left", Ctrl: false, Shift: false, Alt: true}, page)
web.Path(back) --> "/"
```

### Changes not saved

`web.Unsaved(p, changed, save)` says that the view of the page `p` holds changes that aren't saved while `changed()`
is true (a function, or a signal of true or false). Going to another route then asks first, in the band at the bottom
of the window: save and leave (Ctrl+S, which runs `save()`), leave without saving (Ctrl+D) or stay (Esc); the band is an
alert with its three buttons for a screen reader. It asks the same for a link, for `web.Go`, for Back and Forward and
for a new address typed in the browser, whose address then shows the view that stays; and in a browser, closing the
tab or loading another page makes the browser ask too. A page calls it as it makes its widgets: it gives nothing to
show.

```cesia
name = web.Signal("Ada")
edit = p -> web.Stack([web.Unsaved(p, () -> web.Get(name) != "Ada"), web.Input(name, label = "Name"), web.Link("Home", "/")])
app = web.App([web.Route("/", p -> web.Title("Home")), web.Route("/edit", edit)])
page = headless.Type(" Lovelace", headless.ClickOn("Name", headless.Open(app, path = "/edit")))
asked = headless.ClickOn("Home", page)
web.Path(asked) --> "/edit"
web.Guarded(asked) --> true
web.Path(web.Handle({Kind: "key", Key: "d", Ctrl: true, Shift: false, Alt: false}, asked)) --> "/"
```

## The band of keys

Every action is in sight with its key: at the bottom of the window, a band lists the keys of the widget in focus and
those of the buttons that have one. `web.Keys(page)` gives them; `web.Theme` with `Keys: false` hides the band.

```cesia
page = headless.ClickOn("Name", one(web.Input(web.Signal(""), label = "Name")))
web.Keys(page) -->
```

![The field Name in focus with Ana typed, and the button Save; the band at the bottom lists Tab S-Tab next field, previous, Left Right Home End move, and C-s Save.](images/widgets-keys.png)
