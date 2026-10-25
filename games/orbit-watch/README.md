# Orbit Watch

Hold the relay. Lasers on the pads, the swarm on the lanes. Made with `bun run games:new` from: "orbital tower defense". Start it with `bun --cwd=games/orbit-watch run dev` from the repository root.

## Design checklist

Every word, cost and model below lives in `src/game/idea.ts`; lanes, pads and the core live in `src/editor.scene.json`.

- **Core loop.** Aliens march down the lanes at orbital relay; pick a tower (number keys or the build bar) and click near an empty pad to build it.
  Towers: Pulse turret (70 credits), Rail cannon (110 credits), Cryo array (90 credits), Plasma mortar (140 credits). Every kill pays credits; every leak costs lives.
- **Progression.**
  - [x] 12 waves, bigger and faster each time; tougher kinds join, a boss every fifth.
  - [x] Towers unlock by wave and upgrade to level 3 (U); sell (X) for 60% back.
  - [x] Calling a wave early (N) pays for the calm left over.
  - [x] A 5-beat story from Commander Vey, ending when the last wave is held.
- **Failure states.** 20 lives; at zero the run ends with a result card and a retry.
- **Minute 5 -> hour 5.** At 5:00 a handful of towers ring the middle where the lane doubles back; later it is about where the splash and slow towers go, and when to upgrade instead of build.
- **References it is chasing.**
  - *Kingdom Rush* - feel: fixed pads along a winding road, call the next wave early.
  - *Bloons TD* - pressure: waves that ramp faster than your income unless you place well.
  - *Defense Grid* - progression: a few tower kinds whose roles combine (slow + splash).
- **Gap to target.** No tower abilities or heroes, no flying lanes, no range ring when placing.

Loop proof: orbit-watch-loop
