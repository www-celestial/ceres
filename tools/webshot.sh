#!/bin/sh
# The test of the invoices page in a browser: compiled from Cesia to WebAssembly (cesia build --target wasm
# examples/invoices/browser.ce), then served with its app's live screen and played by Chrome without a window, which
# tools/webshot.ce drives (cesia do webshot). Writes shots/invoices-webgl.png and prints the title of the page, which
# says what the page showed. CHROME names the browser, chrome by default.
set -e
cd "$(dirname "$0")/.."
chrome=${CHROME:-chrome}
command -v "$chrome" > /dev/null || { echo "webshot: no browser $chrome; set CHROME to a Chrome or a chrome-headless-shell" >&2; exit 1; }
cesia build --target wasm examples/invoices/browser.ce
CHROME="$chrome" cesia do webshot
