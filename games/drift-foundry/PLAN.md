# Cleanup on Aisle 9 — plan

Physics racing in shopping carts through a mega-store at closing time (package id stays `drift-foundry`).
The design and what the build runs now are in `README.md`; the look in `src/art-direction.md`.

## State

- Built: carts with weight-driven handling, shelf grabs, five power-ups, style meter, self-checkout
  receipt, six departments (five under a warehouse roof with back walls, the Garden Centre outdoors),
  late-shopper rivals with lines, pennants and Officer Dale, shutters + floor scrubber, cart corral,
  12 mods, onboarding tips folded into one banner, juice, world-save fallback, original procedural art.
- Proven: 223 unit tests, 17/17 game-suite proofs, boot capability probe, screenshots of every
  department (swiftshader, medium tier).

## Next

1. Per-department lighting: the key, fill and exposure are one rig for the whole store. The engine
   has per-band sky and fog samplers, but an explicit `rendering.lighting`/`mood` overrides them, so
   Electronics cannot be dimmer than Aisle 9. An engine option for band-scaled explicit lights would
   let Electronics go properly dark.
2. Band weather follows the camera everywhere, so the Garden Centre has no rain (it would fall
   indoors). An engine option to gate band weather to its band's z range would bring it back.
3. A mid-run reload flow for the basket (`proofs/flows/mid-run-reload.flow.ts` checks mods only).
