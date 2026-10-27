/**
 * Every live demo on the site, as a fact about the engine: its name, the engine exports it runs (so the
 * docs can offer it beside those capabilities) and how to spot that part in a game's source (so the games
 * pages can say which games use it). Pure data: the Vite config reads it at build time too.
 */
export type DemoKey =
  | "car"
  | "projectiles"
  | "keys"
  | "grass"
  | "saves"
  | "minimap"
  | "health"
  | "damage"
  | "xp"
  | "catenary"
  | "terrain";

export interface DemoPart {
  key: DemoKey;
  label: string;
  /** One sentence on what the demo shows. */
  does: string;
  /** Its section on /why, when it has a by-hand comparison there. */
  why?: string;
  /** Engine exports this demo runs. */
  symbols: readonly string[];
  /** Matches a game's source (or its editor scene) when the game uses this part. */
  source: RegExp;
}

const PART_BY_KEY: { readonly [K in DemoKey]: DemoPart & { key: K } } = {
  car: { key: "car", label: "Car physics", does: "The engine's car laps a track by itself. Press W, A, S, D on it to drive, or change the tires.", why: "car", symbols: ["createVehicleDynamics", "vehicleTuning", "VEHICLE_STYLES"], source: /@jgengine\/core\/physics\/(vehicle|drivableVehicle)/ },
  projectiles: { key: "projectiles", label: "Projectiles", does: "One weapon definition. Make it a shotgun, a rocket or a taco launcher and the engine flies every pellet.", why: "projectiles", symbols: ["createWeaponSystem", "createDamageRuntime"], source: /@jgengine\/core\/combat\/weapon/ },
  keys: { key: "keys", label: "Key bindings", does: "Actions list their keys and the controls menu comes free. Rebind one and the next press uses it.", why: "controls", symbols: ["createRebindSession", "KeybindingMenu", "applyBindingOverrides"], source: /@jgengine\/core\/input\/(rebindSession|bindingOverrides)|keybindingMenu/ },
  grass: { key: "grass", label: "Grass", does: "The engine's own grass renderer. Pick a preset or move a knob and the field is rebuilt.", why: "meadow", symbols: ["GrassStream", "readGrassLook", "resolveGrassBake", "createGrassMaterial", "GRASS_PRESETS"], source: /@jgengine\/core\/grass\/|"grass"\s*:/ },
  saves: { key: "saves", label: "Saves", does: "The whole game saves itself. Flip one switch and the same saves go to a server instead.", why: "saves", symbols: ["createSaveStore", "createConvexSaveBackend", "localSaveBackend", "remoteSaveBackend"], source: /\bpersist\s*:|@jgengine\/core\/save\// },
  minimap: { key: "minimap", label: "Minimap", does: "The engine's minimap reads your own array of units. Click the field to move the hero.", symbols: ["Minimap"], source: /@jgengine\/core\/map\/map\.view/ },
  health: { key: "health", label: "Health pools", does: "Health, shields or mana as one bounded pool over your own state. Hits come back clamped.", symbols: ["createStatPool", "applyStatPoolDelta", "changeStatPool"], source: /@jgengine\/core\/stats\/statPool/ },
  damage: { key: "damage", label: "Damage", does: "One call resolves a hit against armor and returns how it got the number.", symbols: ["resolveDamageHit"], source: /@jgengine\/core\/combat\/damage\// },
  xp: { key: "xp", label: "XP and levels", does: "XP curves and level-ups written back to your own save. Each level reached calls back once.", symbols: ["leveling"], source: /@jgengine\/core\/progression\/(leveling|xpCurve)/ },
  catenary: { key: "catenary", label: "Hanging cables", does: "Drag a pole and the cable takes the curve a real cable takes under gravity.", symbols: ["catenaryCurve"], source: /@jgengine\/core\/world\/catenary/ },
  terrain: { key: "terrain", label: "Terrain noise", does: "Hills from one seed. Change the noise and the ground rebuilds.", symbols: ["fractalNoise"], source: /@jgengine\/core\/terrain\// },
};

export const DEMO_PARTS: readonly DemoPart[] = Object.values(PART_BY_KEY);

export function demoPart(key: DemoKey): DemoPart {
  return PART_BY_KEY[key];
}

/** The demo that runs one of these exports, if any. */
export function demoForSymbols(symbols: readonly string[]): DemoPart | undefined {
  return DEMO_PARTS.find((part) => part.symbols.some((s) => symbols.includes(s)));
}
