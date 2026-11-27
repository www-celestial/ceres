#!/bin/sh
# The test of the pages in a browser: the invoices page and the page of tests/web/align.ce compiled from Cesia to
# WebAssembly, then served (the invoices with their app's live screen) and played by Chrome without a window, which
# tools/webshot.ce drives (cesia do webshot): the invoices page as a person uses it, then the texts of the widgets in
# the middle of their boxes, read from the pixels, dark and light. Writes shots/invoices-webgl.png and prints the title
# of each page, which says what it showed. CHROME names the browser, chrome by default.
set -e
cd "$(dirname "$0")/.."
chrome=${CHROME:-chrome}
command -v "$chrome" > /dev/null || { echo "webshot: no browser $chrome; set CHROME to a Chrome or a chrome-headless-shell" >&2; exit 1; }
cesia build --target wasm examples/invoices/browser.ce
cesia build --target wasm tests/web/align.ce
cesia build --target wasm tests/web/route.ce
CHROME="$chrome" cesia do webshot
