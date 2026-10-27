# Hold the Line

Scavenge by day. Fortify by dusk. Live through the night. First generated from the idea: "zombie survival: scavenge by day, fortify your safehouse, nights get harder". Start it with `bun --cwd=games/hold-the-line run dev` from the repository root.

## Design checklist

Every word, cost and model below lives in `src/game/idea.ts`; places live in `src/editor.scene.json`.

- **Core loop.** Search supply crates for scrap, Strip wrecked cars for scrap, Rummage trash cans for food, Siphon oil drums for scrap;
  build barricade, lookout, garden bed on the grid around the safehouse;
  every 75 seconds the sun sets and a night comes out of the woods for your walls, you and the safehouse.
- **Progression.**
  - Waves grow: 3 attackers on the first, three more each time, and biters from night 1, runners from night 3, brutes from night 5.
  - Buildings level up to 3 (E on a building); a level-3 lookout hits three times as hard.
  - Stray dog can be won over and fight beside you.
  - A 4-beat story from Mara ends after 7 nights held.
- **Failure states.** The safehouse has 1500 health; when it falls the run ends and you retry from the last save. You respawn 4 seconds after going down.
- **Minute 5 -> hour 5.** At 5:00 two nights are held behind a few barricade and scrap is the limit. Later nights bring bigger attackers, so levelled buildings and allies decide whether the safehouse stands.
- **References it is chasing.**
  - *7 Days to Die* - feel: scavenging by day for a defence that has to hold at night.
  - *ARK: Survival Evolved* - feel: gathering by hand into a camp that grows; tamed creatures that fight for you.
  - *They Are Billions* - density: a wave that is many bodies at once against walls you placed.
- **Gap to target.** One map and three building types; attackers only walk at you; no crafting tree yet.

Loop proof: hold-the-line-loop
