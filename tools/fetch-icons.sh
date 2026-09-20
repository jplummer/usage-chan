#!/bin/sh
# Pull the icon frames out of Figma and regenerate the device and simulator
# data. One command; nothing to fit, nothing to hand-place.
#
#     FIGMA_TOKEN=figd_... tools/fetch-icons.sh            # all of them
#     FIGMA_TOKEN=figd_... tools/fetch-icons.sh wifi-hi    # just one
#
# The token is a Figma personal access token: Figma → your avatar → Settings →
# Security → Personal access tokens → "Generate new token", with at least
# "File content: read". It is yours, not the project's -- keep it out of the
# repo. Putting it in ~/.zshrc as FIGMA_TOKEN is the least annoying thing.
#
# Why a script and not a plugin: the export itself is one REST call per frame
# and lands as bytes on disk, which is the only way it stays byte-exact.
# Base64 through a chat window has arrived corrupt twice -- right length, one
# byte wrong, which zlib's checksum caught and a length check did not.
set -e
cd "$(dirname "$0")/.."

FILE_KEY=w0d1eWuZFiz0daOPWLhzb5

# slug:node-id, from the "Layouts — 1x" page. Add a line when you draw a frame.
FRAMES='
menu:27-81
wifi-hi:27-180
wifi-med:27-238
wifi-lo:27-292
wifi-out:27-100
wifi-med-alt:27-443
wifi-lo-alt:27-498
refresh-fail:27-407
'

[ -n "$FIGMA_TOKEN" ] || { echo "set FIGMA_TOKEN first -- see the top of this file"; exit 1; }

want="$1"
ids=''
for pair in $FRAMES; do
  slug=${pair%%:*}
  [ -z "$want" ] || [ "$want" = "$slug" ] || continue
  ids="${ids:+$ids,}${pair#*:}"
done
[ -n "$ids" ] || { echo "no frame matches '$want'"; exit 1; }

echo "asking Figma for $ids"
urls=$(curl -sf -H "X-Figma-Token: $FIGMA_TOKEN" \
  "https://api.figma.com/v1/images/$FILE_KEY?ids=$ids&format=png&scale=1")

for pair in $FRAMES; do
  slug=${pair%%:*}; node=${pair#*:}
  [ -z "$want" ] || [ "$want" = "$slug" ] || continue
  # The response keys node ids with a colon, not the dash the URL wants.
  key=$(echo "$node" | tr '-' ':')
  url=$(echo "$urls" | sed -n "s/.*\"$key\":\"\([^\"]*\)\".*/\1/p")
  [ -n "$url" ] || { echo "  $slug: Figma returned no image for $key"; exit 1; }
  curl -sf -o "design/icons/$slug.png" "$url"
  echo "  $slug <- $(wc -c < "design/icons/$slug.png" | tr -d ' ') bytes"
done

python3 tools/icons2c.py
node tools/verify-icons.js
