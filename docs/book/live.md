# Live data

A page of Ceres takes its data from the app's server through `std/live`, the live screens of Cesia: the page names the
*shows* it wants, the server writes the questions, with the values of the user its session names, and pushes their
changes over a WebSocket. The page never writes a question, so no user can ask for the facts of another: the question
isn't in the page at all. Ceres speaks the protocol of `live.js` (the page's side that `std/live` serves), rewritten in
Cesia: it is the same on every platform, in a window of SDL3 and in WebAssembly in the browser, where its WebSocket is
the browser's ([Ceres in a web page](web.md)).

## The page: Live, Act, Pages

`web.App(routes, live = "/live")` gives the app a live screen at that path of its server. Its pages then use:

- `web.Live(name, p)`: the rows of the show `name`, a signal kept up to date as the server pushes its changes, the
  answer of a `cepheus.Watch` for instance. An empty list until the first answer.
- `web.Act(name, args, p)`: asks the server for the action `name`. It gives a signal of the reply: `missing` until it
  comes, then the `Ok` of what the action gave, or its `Err`. An action asked before the screen first connected, as a
  page asks what it shows when it opens, waits for the connection; one asked after a break gets an `Err` at once.
- `web.Pages(name, p)`: the rows of a big table, which the server gives a window at a time, through the action `name`.

```cesia norun
use deps/www-celestial/ceres/src/web

defn Page(p)
  unpaid = web.Live("unpaid", p)
  reply = web.Signal(missing)
  web.Stack([
    web.Each(unpaid, i -> i.Id, i -> web.Row([web.Text(i.Number), web.Money(i.Total)])),
    web.Button("Pay F-2", () -> web.Set(reply, web.Act("pay", {Id: 2}, p))),
    web.Table(web.Pages("all", p), [web.Column("Number", i -> i.Number, sort = "Number")]),
  ])
end
```

A back-end opens the screen at the app's origin: `sdl.Run(app, origin = "http://127.0.0.1:8090")` in a window,
`headless.Open(app, origin = ...)` in a test. The screen comes back by itself after a break, from 0.25 to 8 seconds
later with jitter, as `live.js` does; the shows then get their whole answer again.

## The server: live.Route and serve.Pages

The server is the app's own, with `std/live`: `screen(s)` gives the shows of a screen, each a name and a channel of
std/fiber that carries the answer, then its changes; the actions are functions of the screen and of what the page sent.
`serve.Pages(sorts, rows)` makes the action of a big table: it checks what the page asks, an order among `sorts`, an
offset and a count of at most 500, and calls `rows(sort, desc, offset, limit)`, which gives `{Rows, Count}`.

```cesia norun
use deps/www-celestial/ceres/src/serve
use std/fiber
use std/http
use std/live

changes = fiber.Channel()
fiber.Send({Group: 1, Rows: [{Id: 1, Number: "F-1", Total: 10}, {Id: 2, Number: "F-2", Total: 20}]}, changes)
all = [{Number: "F-$k"} for k in 1..100000]
actions = {
  pay: (s, args) -> {Paid: args.Id},
  all: serve.Pages(["Number"], (sort, desc, offset, limit) -> {Rows: all[(offset + 1)..(offset + limit)], Count: 100000}),
}
http.Serve(http.App() then live.Route("/live", s -> [live.Show("unpaid", changes)], actions = actions), port = 8090)
```

`tests/live.test.ce` runs this page and this server together, on a free port: the rows of the show as they change, and
the action with its reply.

## What the protocol carries

The page says `{Hello: 1}` once connected. The server's frames are JSON lists of messages: `{Show, Group, Rows}`, the
whole answer of a show at a group, a number that grows with each change; `{Show, Group, Added, Removed}`, the rows that
came and went; `{Ack, Ok}` or `{Ack, Err}`, the reply to the action `{Act, Id, Args}` of the same Id; `{Error}`, which
ends the screen. Rows are kept as `live.js` keeps them, a count for each distinct row, so a row removed once goes once.

What `std/live` doesn't have yet, and Ceres works around until it does: `live.Pages` (a live window of a sorted
question, design §6), here an action that gives a window when asked, not kept up to date; `Hello: 2` and the resumption
from a group; the bounds of a screen.
