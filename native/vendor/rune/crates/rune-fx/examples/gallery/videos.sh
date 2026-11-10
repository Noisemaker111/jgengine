#!/bin/zsh
# Render PNG sequences for a few effects and encode them to MP4 into demo/fx (run on a build worker).
set -euo pipefail
export PATH=/opt/homebrew/bin:$PATH
cd "${0:A:h}/../.."
out=../../demo/fx
tmp=$(mktemp -d)
cargo build --release --example gallery
bin=${CARGO_TARGET_DIR:-../../target}/release/examples/gallery
for spec in "electric 0.0 2" "fire 0.0 2" "glow 0.0 2" "pulse 0.0 2" "motion 0.0 1" "distort 0.0 1.5" "extras 0.0 2"; do
  set -- ${=spec}
  $bin --frames $tmp/$1 --fps 60 --seconds $3 --start $2 --effect $1
  ffmpeg -loglevel error -y -framerate 60 -i $tmp/$1/$1_%04d.png -c:v libx264 -pix_fmt yuv420p -crf 16 $out/$1.mp4
done
# Motion blur at quarter speed so the shutter is readable.
$bin --frames $tmp/motion-slow --fps 240 --seconds 0.7 --effect motion
ffmpeg -loglevel error -y -framerate 60 -i $tmp/motion-slow/motion_%04d.png -c:v libx264 -pix_fmt yuv420p -crf 16 $out/motion-quarter-speed.mp4
rm -rf $tmp
ls -la $out
