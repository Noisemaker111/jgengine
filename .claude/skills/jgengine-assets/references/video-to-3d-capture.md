# Video-to-3D capture (photogrammetry-via-video)

An offline path for turning a real item or location into a game-ready asset:
film it, reconstruct it, mesh it, import it. This is a **capture/sourcing**
recipe, not a runtime feature — nothing here runs inside the engine or a
shipped game.

Adapts the reconstruction step around
[LingBot-Map](https://github.com/Robbyant/lingbot-map) (Apache-2.0) — see
`CREDITS.md`.

## Why offline

LingBot-Map is a feed-forward 3D reconstruction model: PyTorch 2.8 + CUDA
12.8, needs an NVIDIA GPU. It has no place running per-frame in a browser
game or inside `@jgengine/shell`. Treat it as a one-shot batch job: video in,
point cloud out, done — same category of tool as a photogrammetry rig, not a
package dependency.

## What it needs

- NVIDIA GPU, CUDA 12.8, Python 3.10, PyTorch 2.8.0.
- No hard VRAM floor is published, but the tool ships `--offload_to_cpu` and
  a lower `--num_scale_frames` specifically for constrained cards — an
  8–12GB consumer GPU (3060/3080) works chunked; a 16–24GB card (4090/A6000)
  runs full-speed without offload.
- No CPU-only mode.

## Cost if you rent instead of own

Spot GPU pricing (Vast.ai/RunPod-class) for a 4090 or A6000 runs roughly
**$0.35–0.80/hr**. At ~20 FPS on 518×378, a short 10–30s item/scene capture
reconstructs in well under a minute of GPU time — each asset costs pennies
to about a quarter, plus a couple minutes of environment spin-up. Cheap
enough to do per-asset, not something to batch-justify.

## Pipeline

1. **Capture** — film the item or scene as a short, steady walk-around or
   pan (good, even lighting; avoid pure reflective/transparent surfaces —
   they break most feed-forward reconstruction). 10–30s is plenty.
2. **Reconstruct** (rented or owned GPU box, outside this repo) — run
   LingBot-Map's streaming inference on the clip per its README. Output is a
   point cloud plus per-frame NPZ/depth/trajectory data, not a mesh.
3. **Mesh + clean** (local, no GPU needed) —
   `scripts/asset-pipeline/pointcloud_to_glb.py` in this repo turns an
   exported point cloud (`.ply`/`.npz`) into a Poisson-reconstructed mesh and
   writes a `.glb`. Expect to hand-clean the result (decimate, fill holes,
   fix scale/facing) in Blender before it's asset-grade — this step is a
   starting point, not a finisher.
4. **Import** — bring the cleaned `.glb` in through the editor's asset
   import flow (`jgengine-editor`) into a promoted project's `extras` array
   (`src/game/assets.ts`), same as any other authored asset. Record source
   units, pivot, canonical facing, and footprint in the catalog metadata per
   `jgengine-assets`' canonical workflow — do not hardcode the geometry or
   skip cataloging because it was scanned rather than downloaded.
5. **Credit** — LingBot-Map is Apache-2.0 (commercial use fine); keep the
   `CREDITS.md` entry current and add the specific asset's provenance to its
   catalog metadata.

## Traps

- Point clouds are not meshes and meshes are not game-ready — budget real
  cleanup time at step 3, not just format conversion.
- Scale and pivot come out of the reconstruction arbitrary; fix them once in
  catalog metadata (per `jgengine-assets`' traps), never with a per-placement
  corrective transform.
- Reflective, transparent, or textureless surfaces reconstruct badly — pick
  capture subjects accordingly, or expect heavy manual repair.
