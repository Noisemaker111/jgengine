# Fernwild

Tame the wild. Raise a camp. Outlast the hunt. Made with `bun run games:new` from: "ARK-like dinosaur survival: tame dinos, build a base, craft and survive". Start it with `bun --cwd=games/fernwild run dev` from the repository root.

## Design checklist

Every word, cost and model below lives in `src/game/idea.ts`; places live in `src/editor.scene.json`.

- **Core loop.** Chop trees for wood, Chop pines for wood, Mine rocks for stone, Pick berry bushs for berries;
  build palisade, fire ward, berry patch on the grid around the camp;
  every 80 seconds the sun sets and a hunt comes out of the woods for your walls, you and the camp.
- **Progression.**
  - [x] Waves grow: 3 attackers on the first, three more each time, and stalkers from hunt 3, tyrants from hunt 5.
  - [x] Buildings level up to 3 (E on a building); a level-3 fire ward hits three times as hard.
  - [x] Stag, Boar, Aurochs can be won over and fight beside you.
  - [x] A 4-beat story from Ka-Ren ends after 7 hunts held.
- **Failure states.** The camp has 1400 health; when it falls the run ends and you retry from the last save. You respawn 4 seconds after going down.
- **Minute 5 -> hour 5.** At 5:00 two hunts are held behind a few palisade and wood is the limit. Later hunts bring bigger attackers, so levelled buildings and allies decide whether the camp stands.
- **References it is chasing.**
  - *7 Days to Die* - feel: scavenging by day for a defence that has to hold at night.
  - *ARK: Survival Evolved* - feel: gathering by hand into a camp that grows; tamed creatures that fight for you.
  - *They Are Billions* - density: a wave that is many bodies at once against walls you placed.
- **Gap to target.** One map and three building types; attackers only walk at you; no crafting tree yet.

Loop proof: fernwild-loop
