# Outpost Zero

Push out from the base. Break every hive camp. Get paid. First generated from the idea: "third person shooter clearing alien outposts". Start it with `bun --cwd=games/outpost-zero run dev` from the repository root.

## Design checklist

Every word, price and model below lives in `src/game/idea.ts`; the base, outposts and guard posts live in `src/editor.scene.json`.

- **Core loop.** Leave the forward base with the Carbine, walk a trail to an outpost held by the Hive,
  shoot its garrison (they shoot back when they see you), collect credits per kill and for the whole camp, spend it, go again.
- **Progression.**
  - 4 outposts with growing garrisons: Drill Site (3 guards, 150), Crater Nest (4 guards, 250), Relay Hive (5 guards, 400), Queen's Spire (6 guards, 700).
  - Guns to buy (digit keys): Scattergun 300, Marksman 650, Pulse LMG 1200.
  - Upgrades in stages: Armor +25% armor per stage, Rounds +20% damage per stage.
  - A 4-beat story from Command, one beat per outpost.
- **Failure states.** You have 150 health; at 0 you go down and go back to the last save (every outpost cleared saves).
- **Minute 5 -> hour 5.** At 5:00 the first outpost is down and a second gun is in reach. Later camps bring tougher guards, so the guns and upgrades decide whether you clear them.
- **References it is chasing.**
  - *Ghost Recon Wildlands* - feel: open ground, camps to clear in any order; UI: a small HUD and the reticle.
  - *Gears of War* - feel: the shoulder camera and aim-down-sights; density: cover piled around every camp.
- **Gap to target.** No crouch or snap-to-cover yet; guards hold their posts rather than flanking.

Loop proof: outpost-zero-loop
