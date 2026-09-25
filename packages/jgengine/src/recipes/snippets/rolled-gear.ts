import { seededRng } from "@jgengine/shell/gameKit";
import { createAffixRoller, type ItemBaseDef } from "@jgengine/core/item/affix";

// The joint: one roller turns a base item into a rolled one. A weighted rarity tier
// multiplies the base stats (`statScale`) and draws affixes from the base's pools;
// affix name parts build the display name. Pass a seeded rng (ctx.rng in a game) so a
// drop re-rolls identically on the host, its replicas and a reload.
const roller = createAffixRoller({
  rarities: [
    { id: "common", weight: 70, affixCount: 0 },
    { id: "rare", weight: 25, affixCount: 1, statScale: 1.15, namePart: "Rare" },
    { id: "legendary", weight: 5, affixCount: [2, 3], statScale: 1.4, namePart: "Legendary" },
  ],
  pools: [
    {
      id: "gun",
      affixes: [
        { id: "hot", stat: "fireDamage", op: "add", roll: [4, 9], weight: 3, namePart: { position: "prefix", text: "Blazing" } },
        { id: "fast", stat: "fireRate", op: "mul", roll: [1.1, 1.3], weight: 4, namePart: { position: "prefix", text: "Rapid" } },
        { id: "deep", stat: "magazine", op: "add", roll: [4, 12], weight: 3, namePart: { position: "suffix", text: "of Plenty" } },
      ],
    },
  ],
});

const RIFLE: ItemBaseDef = {
  id: "rifle",
  name: "Rifle",
  baseStats: { damage: 12, fireRate: 8, magazine: 24 },
  pools: ["gun"],
};

export function rollGun(seed: string) {
  return roller.rollRandom(RIFLE, seededRng(seed));
}
// rollGun("drop-42") → { rarity, name: "Legendary Blazing Rifle of Plenty", stats, affixes }.
// Drop it with a rarity beam: `recipe world-drops` (item catalog `rarity` = the rolled rarity).
