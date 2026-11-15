# Cleanup on Aisle 9 — plan

Physics racing in shopping carts through a mega-store at closing time (package id stays `drift-foundry`).
The design and what the build runs now are in `README.md`; the look in `src/art-direction.md`.

## State

- Built: carts with weight-driven handling, shelf grabs, five power-ups, style meter, self-checkout
  receipt, six departments, late-shopper rivals with lines and Officer Dale, shutters + floor scrubber,
  cart corral, 12 mods, onboarding tips, juice, world-save fallback, original procedural art.
- Proven: 223 unit tests, 17/17 game-suite proofs, boot capability probe, screenshots of Aisle 9,
  Produce, Garden Centre, Electronics and Toy Aisle (swiftshader, medium tier).

## Next

1. Department sky bands: the dome stays the global bright haze, so Electronics never gets its dark
   "lights out" sky and the Garden Centre never reads as outdoors at dusk. Needs a per-band sky on
   the engine's world sky (an upstream feature) or a per-track sky swap when the run changes track.
2. The Garden Centre's rain area warning (`[jgengine:rain] area 800x110x80`): weather is set per biome
   band and the engine sizes the volume from the band; scale it at the engine or drop weather there.
3. A mid-run reload flow for the basket (`proofs/flows/mid-run-reload.flow.ts` checks mods only).
