# Apex Nights

Win races. Tune the car. Own the night. Made with `bun run games:new` from: "arcade street racer: win night races, earn cash, upgrade your car". Start it with `bun --cwd=games/apex-nights run dev` from the repository root.

## Design checklist

Every word, price and model below lives in `src/game/idea.ts`; the circuit, districts and woods live in `src/editor.scene.json`.

- **Core loop.** Pick a race in the garage, line up against 3 rivals, drive the gates
  in order for the laps, finish, get paid, spend it on the car, race again.
- **Progression.** 3 races unlock in order and pay 220 / 380 / 700 cash;
  Engine (5 levels from 150), Tyres (5 levels from 120), Nitro (4 levels from 180) make the car faster each level.
- **Failure states.** Finish outside the top three and the race pays nothing; the next race stays locked.
- **Minute 5 -> hour 5.** At 5:00 the first race is won and one upgrade is on the car. The later races
  bring more rivals and laps, and the upgrades are what lets you keep up. The sun sets over the first race and the career runs into the night.
- **References it is chasing.**
  - *Need for Speed: Underground* - feel: night streets and a car you tune; UI: a garage between races.
  - *Burnout* - feel: speed you feel through the camera; density: rivals close enough to trade paint.
- **Gap to target.** One circuit and no traffic yet; rivals follow the racing line rather than racing you.

Loop proof: apex-nights-loop
