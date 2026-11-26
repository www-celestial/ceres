# A client list with a form, live from Cepheus

In this tutorial you write the page of an app's clients: a form that adds a client, the list of the clients kept up to
date as anyone adds one, and the table of all of them, sorted by a click. The data lives in Cepheus, the app's server
asks it, and the page shows what the server pushes. You write four files: the rules of the form, the page, the server's
screen, and a test.

## 1. The project

The app takes Ceres's packages, and Cepheus's for its server:

```toml
[project]
name = "office"
cesia = "1.3"

[deps.ceres]
from = "github.com/www-celestial/ceres"
version = "v0.1.0"
take = ["src/web", "src/form", "src/serve", "src/sdl", "src/headless"]

[deps.cepheus]
from = "github.com/www-celestial/cepheus"
version = "v0.1.0"
take = ["cesia/cepheus"]
```

## 2. The rules, for both sides

`src/clients/check/check.ce` holds the rules of a new client. The page shows them as one types; the server checks them
again before it writes.

```cesia
use deps/www-celestial/ceres/src/form

Client = {
  Name: [form.Required("Give a name."), form.Length(2, 60, "From 2 to 60 letters.")],
  City: [form.Required("Give a city.")],
}
form.Checked(Client, {Name: "Atelier Brun", City: "Lyon"}).Value --> {Name: "Atelier Brun", City: "Lyon"}
form.Checked(Client, {Name: "A", City: ""}).Error.Errors --> {Name: "From 2 to 60 letters.", City: "Give a city."}
```

## 3. The page

`src/pages/clients/page.ce`: the form, the clients as they come, and the table of all of them. The page names two shows
and two actions of its screen; it writes no question.

```cesia
use deps/www-celestial/ceres/src/web

defn Page(p)
  (** /clients: add a client, the latest ones live, every client in a table. *)
  latest = web.Live("latest", p)
  draft = form.New({Name: missing, City: missing}, Client)
  web.Stack([
    web.Title("Clients"),
    form.View(draft, () -> web.Act("addClient", form.Values(draft), p), [form.Text("Name"), form.Text("City"), form.Submit("Add")]),
    web.Text("Latest", font = "strong"),
    web.Each(latest, c -> c.Id, c -> web.Row([web.Text(c.Name), web.Text(c.City)], gap = 16), gap = 2),
    web.Table(web.Pages("all", p), [web.Column("Name", c -> c.Name, sort = "Name"), web.Column("City", c -> c.City, sort = "City")], height = 300, label = "All clients"),
  ])
end

App = web.App([web.Route("/clients", Page)], live = "/live", title = "Clients")
```

## 4. The server: the screen, from Cepheus

`src/server/server.ce`, in the app's server. The questions are written here: `latest` is a `cepheus.Watch`, which gives
its answer, then each change once it is on Cepheus's disk, and `std/live` pushes it to every page that shows it. The
action `addClient` checks the fields with the same rules, then writes; the action `all` gives the table its windows.

```text
use deps/www-celestial/cepheus/cesia/cepheus
use deps/www-celestial/ceres/src/form
use deps/www-celestial/ceres/src/serve
use src/clients/check
use std/http
use std/list
use std/live
use std/result

Client = cepheus.Kind("client", {Name: cepheus.Text(), City: cepheus.Text()})

defn rows(sort, desc, limit)
  (** The question of the clients as rows {Id, Name, City}, sorted by a field, then by client, and cut to a count. *)
  defn (c, n, t)
    key = t if sort == "City" else n
    {Where: [[c, Client.Name, n], [c, Client.City, t]], Give: {Id: c, Name: n, City: t}, Sort: [cepheus.Desc(key) if desc else key, c], Limit: limit}
  end
end

defn screen(s, db)
  (** The shows of a page: the 20 latest clients, kept up to date. *)
  latest = cepheus.Watch(3, (c, n, t) -> {Where: [[c, Client.Name, n], [c, Client.City, t]], Give: {Id: c, Name: n, City: t}, Sort: [cepheus.Desc(c)], Limit: 20}, db, until = s.Ended)?
  [live.Show("latest", latest.Changes)]
end

defn window(db, sort, desc, offset, limit)
  (** A window of the table: Cepheus pages by the row a page comes after, so this asks for the rows up to the end of
      the window and keeps the last ones, which costs the depth of the window; fine for a few thousand clients. *)
  got = cepheus.Find(3, rows(sort, desc, offset + limit), db).Value
  count = cepheus.Find(2, (c, n) -> {Where: [[c, Client.Name, n]], Give: {Count: cepheus.Count()}}, db).Value[1].Count
  {Rows: list.Skip(offset, got), Count: count}
end

defn Serve(db)
  actions = {
    addClient: (s, args) -> form.Checked(check.Client, args) then result.AndThen(c -> cepheus.Insert(Client, c, db)),
    all: serve.Pages(["Name", "City"], (sort, desc, offset, limit) -> window(db, sort, desc, offset, limit)),
  }
  http.Serve(http.App() then live.Route("/live", s -> screen(s, db), actions = actions), port = 8090)
end
```

This block is shown, not checked: Ceres doesn't take Cepheus. Cepheus has no offset: a page of a question comes after a row (`After`), which costs the same at any depth. A table that
jumps to the middle of a million rows needs either an offset in Cepheus or cursors kept by the server for each window;
the server above asks for the rows up to the window, which is enough for a few thousand.

## 5. In a window

`src/main.ce` opens the page in a window of SDL3, live from the server at its address:

```cesia norun
use deps/www-celestial/ceres/src/sdl

sdl.Run(App, origin = "http://127.0.0.1:8090", path = "/clients")
```

It needs `--allow ffi=SDL3,ffi=SDL3_ttf,net=127.0.0.1` and `read=` for the fonts of Ceres, in
`deps/www-celestial/ceres/src/sdl/fonts`. The window sleeps while nothing changes, and draws a frame when the server
pushes a client or when you type: nothing else costs anything.

![The page of clients in a window of SDL3, live from its server: Cave Lemoine of Nice was typed and sent with Enter, the line of the button says Sent., the form is empty again, and Cave Lemoine came under Latest from the server; the table of all clients is sorted by City with a click on its title, Brest first.](images/guide-clients.png)

## 6. A test without a window

The page runs on the headless back-end against a server of `std/live` on a free port, whose show stands in for the
Watch: a channel that carries the answer, then a change, as Cepheus sends them. This block runs as the site is built:

```cesia allow=net=own
use deps/www-celestial/ceres/src/headless
use std/fiber
use std/http
use std/live
use std/net

latest = fiber.Channel()
added = fiber.Channel()
addClient = defn (s, args)
  fiber.Send(args, added)
  {Id: 2}
end
l = net.Listen(0).Value
fiber.Spawn(() -> http.Serve(http.App() then live.Route("/live", s -> [live.Show("latest", latest)], actions = {addClient: addClient}), listener = l))
fiber.Send({Group: 1, Rows: [{Id: 1, Name: "Atelier Brun", City: "Lyon"}]}, latest)
p = headless.Open(App, origin = "http://127.0.0.1:$(net.Port(l))", path = "/clients", height = 400)
p = headless.Type("Cave Lemoine", headless.ClickOn("Name", headless.Settle(p)))
p = headless.Type("Nice", headless.ClickOn("City", p))
p = headless.Press("enter", p)
got = fiber.Receive(added, timeout = 2).Value
got --> {Name: "Cave Lemoine", City: "Nice"}
fiber.Send({Group: 2, Added: [{Id: 2, Name: got.Name, City: got.City}], Removed: []}, latest)
p = headless.Settle(p)
headless.Tree(p) -->
```

The form was sent with its values, the server's show brought the new client, and the form is empty again. Ceres runs
the same test in `tests/clients.test.ce`.
