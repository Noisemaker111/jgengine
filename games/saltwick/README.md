# Saltwick

Grow a garden, cast a line, and settle into the slow life by the sea. First generated from the idea: "cozy fishing village". Start it with `bun --cwd=games/saltwick run dev` from the repository root.

## Design checklist

Every word, price and model below lives in `src/game/idea.ts`; places live in `src/editor.scene.json`.

- **Core loop.** Plant turnip, cabbage, sunflower, sea berry in the plots by the cottage (E);
  crops grow on the in-world clock (a day is 6 minutes of play) and are harvested with E when ripe;
  fish at the bay: cast with E, and when it bites press E while the marker is in the green (the engine's skill check);
  sell everything at the fish cart, then spend it at the harbor market in the harbor (number keys).
  Signposts by the cottage walk you down the road to the water and the market, and back.
- **Progression.**
  - Seeds unlock at the market: cabbage (40), sunflower (90), sea berry (150).
  - The rod has 3 upgrades (wider green, quicker bites); more land opens a row of 3 plots each, up to 12.
  - Rarer fish bite after enough casts: sardine (7), mackerel (13), sea bass (28), old whiskers (110).
  - 5 requests from the village (Nell, Old Bram, Ivy), each paying a little, ending in the festival.
- **Failure states.** None that end the run: a fish that waits too long or that you reel in early gets away, and the market closes at 20:00. Sleeping in the cottage ends the day and saves; crops keep growing overnight.
- **Minute 5 -> hour 5.** At 5:00 the first turnip are sold and the first fish is in; the rod and the second crop are the next buys. Later days are about filling 12 plots with the best crop and chasing the rare fish.
- **References it is chasing.**
  - *Stardew Valley* - feel: a day that runs out, crops that ripen overnight, a shipping bin by the door.
  - *Animal Crossing* - feel: a village of a few faces with something to say, fishing as a timing game.
  - *Harvest Moon* - density: a small farm that grows into a full one.
- **Gap to target.** No watering, seasons, gifts or animal care yet; villagers only wander and talk; one map.

Loop proof: saltwick-loop
