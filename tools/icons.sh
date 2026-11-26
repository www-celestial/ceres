#!/bin/sh
# The icons of Ceres made again from Codicons (https://github.com/microsoft/vscode-codicons, (c) Microsoft, CC BY 4.0):
# the font of the icons cut down to those that web.Icons names (src/web/theme.ce), as src/sdl/fonts/Codicons.ttf for
# SDL and as web/icons.js for the browser (a WOFF in base64, which the page adds to its fonts). Run it after a change of
# web.Icons. CODICONS names the folder dist of the package @vscode/codicons (npm pack @vscode/codicons, then tar -xzf);
# pyftsubset comes with fontTools (pip install fonttools).
set -e
cd "$(dirname "$0")/.."
dist=${CODICONS:?set CODICONS to the folder dist of @vscode/codicons}
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
# the code points of the table of web.Icons, as pyftsubset takes them
sed -n '/^iconCodes = \[/,/^\]/p' src/web/theme.ce | grep -o ':[0-9a-f]\{4\}' | sed 's/^:/U+/' | paste -sd, - > "$tmp/unicodes"
count=$(tr ',' '\n' < "$tmp/unicodes" | wc -l)
pyftsubset "$dist/codicon.ttf" --unicodes-file="$tmp/unicodes" --output-file=src/sdl/fonts/Codicons.ttf --no-hinting --name-IDs='*' 2> /dev/null
pyftsubset "$dist/codicon.ttf" --unicodes-file="$tmp/unicodes" --output-file="$tmp/icons.woff" --flavor=woff --no-hinting --name-IDs='*' 2> /dev/null
version=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$dist/../package.json" | head -1)
{
  echo "Codicons $version, the icons of Visual Studio Code: https://github.com/microsoft/vscode-codicons"
  echo "Copyright (c) Microsoft Corporation. Licensed under the Creative Commons Attribution 4.0 International License"
  echo "(CC BY 4.0), https://creativecommons.org/licenses/by/4.0/. Ceres keeps $count of its icons, those that web.Icons names,"
  echo "in Codicons.ttf (for SDL) and web/icons.js (for the browser), cut from codicon.ttf by tools/icons.sh; nothing else"
  echo "was changed. The text of the licence follows."
  echo
  cat "$dist/../LICENSE"
} > src/sdl/fonts/Codicons-CC-BY-4.0.txt
{
  echo "// icons.js: the font of Ceres's icons for the browser: $count icons of Codicons $version (https://github.com/microsoft/"
  echo "// vscode-codicons, (c) Microsoft, CC BY 4.0, src/sdl/fonts/Codicons-CC-BY-4.0.txt), those that web.Icons names, as a"
  echo "// WOFF in base64. tools/icons.sh writes this file. Load, as the page starts, makes the font known to ceres.js, which"
  echo "// adds it to the document's fonts as ceres-icons the first time the page draws an icon (a page without icons decodes"
  echo "// nothing); once it is ready it says so on window (the event ceres-icons), and ceres.js paints again the icons it had"
  echo "// to leave out."
  printf "const WOFF = '%s'\n" "$(base64 -w0 "$tmp/icons.woff")"
  cat <<'JS'
export function Load() {
  if (typeof document !== 'object' || globalThis.ceresIcons) return
  globalThis.ceresIcons = 'known'
  globalThis.ceresIconsLoad = () => {
    globalThis.ceresIcons = 'loading'
    const face = new FontFace('ceres-icons', Uint8Array.from(atob(WOFF), c => c.charCodeAt(0)))
    document.fonts.add(face)
    face.load().then(() => { globalThis.ceresIcons = 'ready'; dispatchEvent(new Event('ceres-icons')) }, () => { globalThis.ceresIcons = 'failed' })
  }
}
JS
} > web/icons.js
ls -l src/sdl/fonts/Codicons.ttf web/icons.js | awk '{print $5, $9}'
