#!/bin/sh
# The pictures of the book, taken again, into docs/book/images:
# - in a browser, the widgets of docs/book/widgets.md and forms.md, the page of examples/hello and the hidden DOM of a
#   form: the pages of tools/docshots/gallery compiled to WebAssembly (tools/docshots/page.ce), played by Chrome
#   without a window and cut to the widget (tools/docshots/shoot.ce);
# - in a window of SDL3 under SDL's dummy driver, the page of the tutorial live from a server of its own
#   (tools/docshots/window.ce), the line of the connection as the network drops and comes back, and a conflict
#   (tools/docshots/connection.ce), and the page of examples/desk laid out as a desktop tool, dark and light, and a
#   dock whose bottom panels have nothing yet (tools/docshots/desk.ce);
# - the drawings of a mechanism, as SVG (tools/docshots/figures.ce).
# ImageMagick, when here, puts the steps of a widget side by side and makes each picture a PNG of 64 colors without its
# metadata. CHROME names the browser, a Chrome or a chrome-headless-shell (chrome by default); PROFILE the folder of
# its profile.
#   CHROME=chrome-headless-shell tools/docshots.sh
set -e
cd "$(dirname "$0")/.."
chrome=${CHROME:-chrome}
command -v "$chrome" > /dev/null || { echo "docshots: no browser $chrome; set CHROME to a Chrome or a chrome-headless-shell" >&2; exit 1; }
profile=${PROFILE:-${TMPDIR:-/tmp}/ceres-docshots}
out=docs/book/images
mkdir -p "$profile"
cesia build --target wasm tools/docshots/page.ce
cesia build --target wasm examples/hello/hello.ce
CHROME="$chrome" PROFILE="$profile" OUT="$out" cesia run --allow "net=127.0.0.1,read=tools/docshots,read=examples/hello,exec,env=CHROME,env=OUT,env=PROFILE,env=ONLY,read=$profile,write=$profile,write=$out" tools/docshots/shoot.ce
sdl="ffi=SDL3,ffi=SDL3_ttf,read=src/sdl/fonts,net=127.0.0.1,env=OUT,write=$out"
OUT="$out" cesia run --allow "$sdl" tools/docshots/window.ce
OUT="$out" cesia run --allow "$sdl" tools/docshots/connection.ce
OUT="$out" cesia run --allow "$sdl" tools/docshots/desk.ce
OUT="$out" cesia run --allow "env=OUT,write=$out" tools/docshots/figures.ce
if command -v magick > /dev/null; then
  line=#cfcfcf
  # the two steps of a widget, before and after, side by side, a line between them
  for w in each link; do
    a=$out/widgets-$w-before.png b=$out/widgets-$w-after.png
    for f in "$a" "$b"; do magick "$f" -trim +repage -bordercolor white -border 8 "$f"; done
    h=$(magick identify -format '%h\n' "$a" "$b" | sort -n | tail -1)
    magick \( "$a" -background white -gravity east -splice 16x0 \) \( -size "1x$h" xc:$line \) \( "$b" -background white -gravity west -splice 16x0 \) \
      -background white -gravity north +append "$out/widgets-$w.png"
    rm -f "$a" "$b"
  done
  # the line of the connection in its three states, one under the other, each cut to what the page shows, without the
  # band of keys
  for s in live offline back conflict; do magick "$out/live-$s.png" -gravity south -chop 0x26 -trim +repage -bordercolor white -border 8 "$out/live-$s.png"; done
  w=$(magick identify -format '%w\n' "$out/live-live.png" "$out/live-offline.png" "$out/live-back.png" | sort -n | tail -1)
  magick "$out/live-live.png" \( -size "${w}x1" xc:$line \) "$out/live-offline.png" \( -size "${w}x1" xc:$line \) "$out/live-back.png" \
    -background white -gravity west -append "$out/live-connection.png"
  rm -f "$out/live-live.png" "$out/live-offline.png" "$out/live-back.png"
  for f in "$out"/widgets-*.png "$out"/forms-*.png "$out"/guide-*.png "$out"/web-*.png "$out"/backends-*.png "$out"/live-*.png; do
    magick "$f" -strip -colors 64 "PNG8:$f"
  done
fi
du -cb "$out"/widgets-* "$out"/forms-* "$out"/guide-* "$out"/web-* "$out"/backends-* "$out"/live-* | tail -1
