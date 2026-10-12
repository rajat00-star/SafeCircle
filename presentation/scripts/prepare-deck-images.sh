#!/usr/bin/env bash
# Converts the captured PNGs (app screenshots and 3D site stills) to JPEG for the deck (macOS sips).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p deck/img
for f in assets/app/*.png assets/site/*.png; do
  sips -s format jpeg -s formatOptions 84 -Z 2000 "$f" --out "deck/img/$(basename "${f%.png}").jpg" >/dev/null
done
ls deck/img
