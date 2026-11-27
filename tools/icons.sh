#!/bin/sh
# The icons of Ceres made again from Lucide (https://lucide.dev, (c) Lucide Icons and Contributors, ISC): the font of
# the icons cut down to those that web.Icons names (src/web/theme.ce), as src/sdl/fonts/Lucide.ttf for SDL and as
# web/icons.js for the browser (a WOFF in base64, which the page adds to its fonts). Run it after a change of web.Icons.
# LUCIDE names the folder of the package lucide-static (npm pack lucide-static, then tar -xzf: its folder package);
# python3 and pyftsubset come with fontTools (pip install fonttools).
set -e
cd "$(dirname "$0")/.."
dist=${LUCIDE:?set LUCIDE to the folder of the package lucide-static}
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
# the code points of the table of web.Icons, as pyftsubset takes them
sed -n '/^iconCodes = \[/,/^\]/p' src/web/theme.ce | grep -o ':[0-9a-f]\{4\}' | sed 's/^:/U+/' | paste -sd, - > "$tmp/unicodes"
count=$(tr ',' '\n' < "$tmp/unicodes" | wc -l)
# Lucide's font as Ceres takes it: without its table of ligatures (an icon is named by its code point, and fontTools
# can't read that table), its box the square of an icon on every system (the ascent of Windows and the gap of the lines
# as the others' are), and 240 units to the square instead of 1000: the icons are drawn on a grid of 24, so a unit is
# a tenth of a step of it, and the outlines take a fifth less room
python3 -I - "$dist/font/lucide.ttf" "$tmp/lucide.ttf" <<'PY' 2> /dev/null
import sys
from fontTools.ttLib import TTFont
from fontTools.ttLib.scaleUpem import scale_upem
font = TTFont(sys.argv[1], lazy=True)
del font["GSUB"]
os2 = font["OS/2"]
os2.usWinAscent, os2.usWinDescent, os2.sTypoLineGap = font["hhea"].ascent, -font["hhea"].descent, 0
scale_upem(font, 240)
font.save(sys.argv[2])
PY
pyftsubset "$tmp/lucide.ttf" --unicodes-file="$tmp/unicodes" --output-file=src/sdl/fonts/Lucide.ttf --no-hinting --name-IDs='*' 2> /dev/null
pyftsubset "$tmp/lucide.ttf" --unicodes-file="$tmp/unicodes" --output-file="$tmp/icons.woff" --flavor=woff --no-hinting --name-IDs='*' 2> /dev/null
version=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$dist/package.json" | head -1)
{
  echo "Lucide $version, https://lucide.dev (https://github.com/lucide-icons/lucide), its font of icons lucide-static."
  echo "Copyright (c) Lucide Icons and Contributors, under the ISC License; the icons that come from Feather, (c) Cole Bemis,"
  echo "under the MIT License, both below. Ceres keeps $count of its icons, those that web.Icons names, in Lucide.ttf (for SDL)"
  echo "and web/icons.js (for the browser), cut from lucide.ttf by tools/icons.sh, which also drops its table of ligatures,"
  echo "sets its vertical measures to the square of an icon and draws it on 240 units instead of 1000; nothing else was"
  echo "changed. The text of the licence follows."
  echo
  cat "$dist/LICENSE"
} > src/sdl/fonts/Lucide-ISC.txt
{
  echo "// icons.js: the font of Ceres's icons for the browser: $count icons of Lucide $version (https://lucide.dev, (c) Lucide"
  echo "// Icons and Contributors, ISC, src/sdl/fonts/Lucide-ISC.txt), those that web.Icons names, as a WOFF in base64."
  echo "// tools/icons.sh writes this file. ceres.js imports it the first time the page draws an icon (a page without icons"
  echo "// fetches nothing of it) and calls Load, which adds the font to the document's fonts as ceres-icons: the promise it"
  echo "// gives is kept once the font is ready."
  printf "const WOFF = '%s'\n" "$(base64 -w0 "$tmp/icons.woff")"
  cat <<'JS'
export function Load() {
  const face = new FontFace('ceres-icons', Uint8Array.from(atob(WOFF), c => c.charCodeAt(0)))
  document.fonts.add(face)
  return face.load()
}
JS
} > web/icons.js
ls -l src/sdl/fonts/Lucide.ttf web/icons.js | awk '{print $5, $9}'
