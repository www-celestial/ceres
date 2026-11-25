#!/bin/sh
# The test of the browser's glue, web/ceres.js, without WebAssembly: Chrome without a window paints the draw list that
# Ceres made natively for the invoices page (cesia do webframe), with WebGL2, and keeps its hidden DOM. Writes
# shots/invoices-webgl.png and prints the title of the page, which counts the rows and fields of the hidden DOM.
# CHROME names the browser, chrome by default; PORT the free port of the page's server, 18765 by default.
set -e
cd "$(dirname "$0")/.."
chrome=${CHROME:-chrome}
command -v "$chrome" > /dev/null || { echo "webshot: no browser $chrome; set CHROME to a Chrome or a chrome-headless-shell" >&2; exit 1; }
cesia do webframe > /dev/null 2>&1
port=${PORT:-18765}
python3 -m http.server "$port" --bind 127.0.0.1 > /dev/null 2>&1 &
server=$!
trap 'kill $server 2> /dev/null || true' EXIT
sleep 1
"$chrome" --headless=new --no-sandbox --use-angle=swiftshader --enable-unsafe-swiftshader --window-size=1100,860 \
  --virtual-time-budget=3000 --screenshot="$PWD/shots/invoices-webgl.png" --dump-dom "http://127.0.0.1:$port/tests/web/page.html" 2> /dev/null \
  | grep -o '<title>[^<]*' | sed 's/<title>//'
