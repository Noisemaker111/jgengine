import { leveling } from "@jgengine/core/progression/leveling";
import { emit, saveAccess } from "./myWorld";

const track = leveling({
  xpForLevel: { kind: "power", base: 80, exponent: 1.35, round: "floor" },
  maxLevel: 20,
});

// saveAccess reads and writes save.players[id].xp and .level: your data, your store.
export const onKill = () => track.grantXp(saveAccess, "p1", 60, (level) => emit("level-up", { level }));
