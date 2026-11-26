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
- `web.Act(name, args, p, base, mine, read)`: asks the server for the action `name`. It gives a signal of the reply:
  `missing` until it comes, then the `Ok` of what the action gave, or its `Err`. An action asked while the page is away
  from its app (before the screen first connected, during a break) waits, in order, with the key it got when it was
  asked, and goes once the page is back: the app runs it once. `base`, the values the page saw of what the action
  changes, lets the app refuse it when they changed meanwhile: an `Err` of the kind `conflict`, which `web.Conflicts`
  shows; `mine`, the values it writes when `args` doesn't hold them as fields; `read`, true for an action that only
  reads, which the line of the connection doesn't count among the changes waiting.
- `web.Connection(p, say)`: the line that tells the state of the page's connection: *Live*, *Offline — 2 actions
  waiting · next try in 4 s* with **Try now**, *Live — back after a break, nothing missed* (or *data reloaded*),
  *Signed out — sign in again, 2 actions kept*. `say` gives each text in the page's language.
- `web.Conflicts(p, say)`: the actions the app refused because what they change changed meanwhile, each field's value
  seen, value now and the page's own, with **Keep mine** (sent again over the value now) and **Take theirs**.
- `web.Again(screen)`: tries at once; after a sign-in that follows the end of the screen (a 401), the page comes back
  with the actions it kept.
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
`headless.Open(app, origin = ...)` in a test. The screen comes back by itself after a break, as `live.js` does: after a
wait drawn at random under a bound that doubles from `ReconnectFirst` (500 ms) to `ReconnectMax` (30 s), *full jitter*;
at once when the browser says it is online again or the tab is shown again (`Connect`'s `net`, which the browser's
back-end fills); and a silent network (no frame for `DeadAfter` seconds, a ping every `PingEvery`) is a break too. It
comes back to the screen the app kept, and gets every change of the break once; else to a new screen, whose answers
replace the rows. Its state is the signal `screen.Status`, `{State, Waiting, Retry, Last, Offline, Error}`, which
`web.Connection` shows. The settings come from the app with the screen, and `Connect(url, settings = {...})` sets the
page's own.

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

The page says `{Hello: 2}` once connected, or `{Hello: 2, Token, Got}` to come back to the screen it had after the
frame `Got`. The server's first frame, `[{Token, Resumed, Heard, Who, Client}]`, says whether the screen is the one
the page had and the last action it heard; its other frames are JSON lists of messages, numbered by a first `{Seq}`
and confirmed by the page's `{Got}`: `{Show, Group, Rows}`, the whole answer of a show at a group, a number that grows
with each change; `{Show, Group, Added, Removed}`, the rows that came and went; `{Ack, Ok}` or `{Ack, Err}`, the reply
to the action `{Act, Id, Args, Key, Base, Who}` of the same Id; `{Error}`, which ends the screen. The page says
`{Bye: 1}` as it goes away. Rows are kept as `live.js` keeps them, a count for each distinct row, so a row removed once
goes once. An app of the version before closes a hello 2 at once, saying nothing: after two such, the page speaks
version 1 to it. Cesia's book has the whole wire: [When the connection drops](https://github.com/www-celestial/cesia-lang/blob/main/docs/book/http.md#when-the-connection-drops).

What `std/live` doesn't have yet, and Ceres works around until it does: `live.Pages` (a live window of a sorted
question, design §6), here an action that gives a window when asked, not kept up to date.

`tests/drop.test.ce` cuts the network between such a page and its app (a proxy of `std/net`): offline, an action kept
and run once, nothing missed; an app that forgot its screens; a silent network; the outbox bounded; a conflict and its
choices.
