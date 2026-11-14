# Cleanup on Aisle 9 — plan

Physics racing in shopping carts through a mega-store at closing time (package id stays `drift-foundry`).

## Handoff

Done (committed):
- Content ids renamed to store vocabulary (tracks → departments, rivals, events, mods, hazard kinds).
- `src/game/cart/`: goods + 5 power-ups, basket load handling (heavy = momentum, light = twitchy),
  4 chassis (cart corral) with squeaky-wheel wobble, style meter (drift/end-cap/air/back-bar ride/mop
  swat, combos), self-checkout receipt + best receipts, shelf grab spots per department.
- Session integration: grabs, power-up use (F/Q), back-bar ride (C), marbles/mop stuns, Officer Dale
  (blocker rival on Lights Out / Closing Time, tackles), checkout pays 25% of cart value; parked runs
  keep the basket. New `value` event metric (Cart Stuffer).
- Re-themed tracks, zones, events, shifts (PA announcements), career, UI (HUD basket/pop, receipt,
  cart corral pane), look (bright interior, vivid-pop LUT, Lilita One/Nunito), procedural art in
  `scripts/author-models.mjs` (carts, shoppers, mods, products, fixtures, shutter+scrubber).
- Tests updated + new `cart/cart.test.ts`, `cart/session.cart.test.ts`; last full run 220/220 green.

In progress (WIP commit): editor scene re-authored via `scripts/author-{corridor,yard,ambience}.ts`
(shelving runs, end-caps, freezer fog, scrubber suds, pigeons) and `ambience.test.ts` updated.

Next steps:
1. `bun run test games/drift-foundry` and `bun --cwd=games/drift-foundry run check-types`.
2. Boot + screenshot: `bun run shoot drift-foundry --mode play --draft --inspect`; fix visual defects
   (indoor sky/fog, shelving scale, ceiling-light heights, HUD layout on phone).
3. Rewrite `README.md` (design checklist) and `src/art-direction.md`, `ASSETS.md`, CREDITS for the store;
   update `games/CONTENT-PROVENANCE.md` row and `apps/web/.../HomeHero.tsx` idea text.
4. `bun run gen`, `bun run verify:fast`; commit (no push/lane:close).
