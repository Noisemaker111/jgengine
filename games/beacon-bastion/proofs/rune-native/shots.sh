#!/bin/sh
# Remaining Rune-native PR shots, one drive at a time. Run from the repo root.
# Software Rune can take seconds to paint a new screen, hence the long wait.
# JG_CAPTURE_GL=swiftshader forces software GL on hosts without a GPU.
OUT="$(pwd)/games/beacon-bastion/proofs/rune-native"
shoot() { # size name state [steps...]
  size=$1; name=$2; state=$3; shift 3
  [ -f "$OUT/$name-$size.png" ] && { echo "have $name-$size"; return; }
  if [ "$size" = desktop ]; then dims="--width 1280 --height 720"; else dims="--width 390 --height 844"; fi
  for attempt in 1 2; do
    bun run drive beacon-bastion --timeout 240 $dims --settle 4000 --param state=$state "$@" --wait 14000 --shot "$OUT/$name-$size.png" > "/tmp/bb-shot-$name-$size.log" 2>&1
    if [ -f "$OUT/$name-$size.png" ]; then echo "ok $name-$size"; return; fi
  done
  echo "FAILED $name-$size (log /tmp/bb-shot-$name-$size.log)"
}
for size in ${SIZES:-desktop phone}; do
  shoot $size title title
  shoot $size settings title --click Settings
  shoot $size credits title --click Credits
  shoot $size commission menu-new
  shoot $size keeps-saved menu-keeps
  shoot $size hud two-towers
  shoot $size tower inspect-tower
  shoot $size wave mid-wave
  shoot $size boss boss
  shoot $size breached breached
  shoot $size pause pause
  shoot $size memorial result
done
