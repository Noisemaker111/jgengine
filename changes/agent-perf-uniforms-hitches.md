uniform and streamed-draw garbage and hitches come down at the engine seam

Engine seam: packages/core render and visibility warmup

### Fixed

- three.js uniform uploads no longer allocate per call: vector and matrix uniforms authored as plain arrays were handed to `uniform*fv` as JS arrays, and Blink's sequence binding allocated a temporary vector per uniform per frame; the engine now routes all fifteen uniform vector entry points through pooled typed arrays once, at renderer setup
- content that streams into view mid-game no longer stalls a frame on its GPU uploads: the play deferral holds a drawable whose material still owes texture uploads, reports it to the shader warmup, and the warmup spends a per-frame budget on a few links, single-texture uploads and scratch-target first draws, so a chunk appears over frames instead of inside one
- `lane:close` splices its generated change note into a managed PR-body block instead of replacing the body, so detailed evidence survives re-lands
