import { cartridge, type CartridgeConfig } from "@jgengine/shell/cartridge";
import { building, environment, grass, rain, terrain } from "@jgengine/core/world/features";
import { standardCartridgePanels } from "@/components/ui/cartridge-panels";

import { assets, entitySprites } from "./game/assets";

export const config: CartridgeConfig = {
  name: "Swarm Survivor",
  seed: "swarm-survivor",
  panels: standardCartridgePanels,
  assets,
  entitySprites,

  player: { kind: "outrider", health: 100, walkSpeed: 6.4 },

  enemies: {
    skitterling: { label: "Skitterling", health: 12, walkSpeed: 4.6, xp: 1, contact: { damage: 5, intervalSeconds: 0.6 } },
    husk: { label: "Husk", health: 32, walkSpeed: 3.1, xp: 3, contact: { damage: 9, intervalSeconds: 0.7 } },
    bloatling: { label: "Bloatling", health: 70, walkSpeed: 2.0, xp: 6, contact: { damage: 14, intervalSeconds: 0.85 } },
    warden: { label: "Warden", health: 260, walkSpeed: 2.5, xp: 24, contact: { damage: 24, intervalSeconds: 0.9 } },
  },
  combat: { contactRadius: 1.05 },

  spawning: {
    director: {
      waves: [
        { budget: 10, duration: 25, entries: [{ id: "skitterling", cost: 1, weight: 6 }] },
        {
          budget: 16,
          duration: 30,
          budgetPerSecond: 0.6,
          entries: [
            { id: "skitterling", cost: 1, weight: 6 },
            { id: "husk", cost: 3, weight: 3, minWave: 1 },
          ],
        },
        {
          budget: 24,
          duration: 35,
          budgetPerSecond: 0.9,
          entries: [
            { id: "skitterling", cost: 1, weight: 5 },
            { id: "husk", cost: 3, weight: 4 },
            { id: "bloatling", cost: 6, weight: 2, minWave: 2 },
          ],
        },
        {
          budget: 36,
          duration: 40,
          budgetPerSecond: 1.2,
          entries: [
            { id: "husk", cost: 3, weight: 4 },
            { id: "bloatling", cost: 6, weight: 3 },
            { id: "warden", cost: 24, weight: 1, minWave: 3 },
          ],
        },
        {
          budget: 50,
          budgetPerSecond: 1.6,
          entries: [
            { id: "husk", cost: 3, weight: 3 },
            { id: "bloatling", cost: 6, weight: 3 },
            { id: "warden", cost: 24, weight: 2 },
          ],
        },
      ],
      maxAlive: 90,
      escalationPerSecond: 0.05,
      maxSpawnsPerTick: 12,
      seed: 1337,
    },
    placement: { kind: "ring", radius: 26 },
  },

  weapons: {
    pulseLance: {
      kind: "projectile",
      label: "Pulse Lance",
      damage: { base: 9, perLevel: 3.2 },
      cooldownMs: { base: 900, perLevel: -70, min: 320 },
      maxLevel: 8,
      range: 16,
      speed: 24,
      fxColor: "#8be9f0",
      fxEmissive: "#2fb7c4",
    },
    rotorBlades: {
      kind: "orbit",
      label: "Rotor Blades",
      damage: { base: 5, perLevel: 1.6 },
      cooldownMs: { base: 340, perLevel: -22, min: 150 },
      maxLevel: 8,
      blades: { table: [2, 2, 3, 3, 4, 4, 5, 5] },
      radius: { base: 2.1, perLevel: 0.12 },
      hitRadius: 1.1,
      angularSpeed: 3.4,
      fxColor: "#dfe9ea",
      fxEmissive: "#2fb7c4",
    },
    quakePulse: {
      kind: "pulse",
      label: "Quake Pulse",
      damage: { base: 16, perLevel: 5.5 },
      cooldownMs: { base: 3400, perLevel: -190, min: 1800 },
      maxLevel: 8,
      radius: { base: 4.2, perLevel: 0.35 },
      durationSeconds: 0.55,
      fxColor: "#a566d9",
    },
  },

  progression: {
    xp: { kind: "geometric", base: 18, ratio: 1.24, round: "ceil" },
    maxLevel: 40,
    draft: {
      choices: 3,
      upgrades: [
        { id: "focus_pulse_lance", label: "Lance Focus", weight: 5, maxStacks: 7, effect: { kind: "weaponLevel", weapon: "pulseLance" } },
        { id: "overdrive_rotor", label: "Rotor Overdrive", weight: 5, maxStacks: 7, effect: { kind: "weaponLevel", weapon: "rotorBlades" } },
        { id: "amplify_quake", label: "Quake Amplifier", weight: 5, maxStacks: 7, effect: { kind: "weaponLevel", weapon: "quakePulse" } },
        { id: "vital_plating", label: "Vital Plating", weight: 4, maxStacks: 6, effect: { kind: "statBonus", stat: "health", amount: 16 } },
        { id: "magnetic_core", label: "Magnetic Core", weight: 3, maxStacks: 5, effect: { kind: "fieldAdd", field: "magnetRadius", amount: 1.6 } },
        { id: "adrenal_surge", label: "Adrenal Surge", weight: 3, maxStacks: 5, effect: { kind: "fieldMultiply", field: "damageMultiplier", factor: 1.12 } },
      ],
    },
  },
  fields: { magnetRadius: 4.5, damageMultiplier: 1 },

  xpGems: {
    collectRadius: 0.7,
    pullSpeed: 15,
    rarityThresholds: [
      [20, "epic"],
      [6, "rare"],
      [3, "uncommon"],
    ],
    defaultRarity: "common",
  },

  rules: {
    win: { kind: "survive", seconds: 180 },
    lose: { kind: "playerDeath" },
    killLeaderboardStat: "kills",
  },

  world: environment({
    terrain: terrain({
      bounds: { w: 96, d: 96 },
      height: 2.2,
      seed: "swarm-arena",
      frequency: 0.045,
      octaves: 3,
      ridged: true,
      baseHeight: -0.2,
    }),
    vegetation: grass({
      area: { w: 90, d: 90 },
      density: 5,
      bladeHeight: [0.3, 1.1],
      colors: ["#274a1f", "#3c7a2b", "#5aa23c"],
      seed: "swarm-grass",
    }),
    weather: rain({
      area: { w: 100, d: 100, h: 60 },
      density: 0.4,
      speed: 22,
      color: "#7fae7a",
    }),
    structures: building({
      count: 5,
      footprint: { w: 7, d: 7 },
      stories: [1, 2],
      storyHeight: 3,
      spacing: 10,
      style: "ruin",
      seed: "swarm-ruins",
    }),
  }),
  physics: { gravity: -20 },
  camera: {
    rig: "topDown",
    topDown: { height: 24, pitch: 1.08, yaw: 0.78, followSmoothing: 9 },
  },
  worldItem: {
    rarityStyle: {
      common: { color: "#a566d9" },
      uncommon: { color: "#7fb84a", beam: true },
      rare: { color: "#4a86d8", beam: true },
      epic: { color: "#e0862e", beam: true, label: "Warden Essence" },
    },
    pickupRadius: 0.7,
  },

  theme: {
    "--jg-accent": "#7fe36b",
    "--jg-accent-glow": "rgba(127, 227, 107, 0.5)",
    "--jg-accent-deep": "#2f7d38",
    "--jg-surface": "#0f1810",
    "--jg-surface-deep": "#070c08",
    "--jg-edge": "#2a3f27",
    "--jg-edge-bright": "#4c6a45",
    "--jg-text": "#e8f5e2",
    "--jg-text-dim": "#8fa688",
    "--jg-health": "#e0483e",
    "--jg-health-deep": "#6e211c",
    "--jg-mana": "#4a86d8",
    "--jg-mana-deep": "#20406f",
    "--jg-stamina": "#d9c33f",
    "--jg-stamina-deep": "#6e621c",
    "--jg-xp": "#a566d9",
    "--jg-xp-deep": "#4e2c6e",
    "--jg-shield": "#9fb9c9",
    "--jg-shield-deep": "#48606e",
    "--jg-danger": "#e0483e",
    "--jg-warning": "#e8a33d",
    "--jg-success": "#7fe36b",
    "--jg-hostile": "#e0483e",
    "--jg-friendly": "#2fb7c4",
    "--jg-neutral": "#d9c33f",
    "--jg-rarity-common": "#b4b2a8",
    "--jg-rarity-uncommon": "#7fb84a",
    "--jg-rarity-rare": "#4a86d8",
    "--jg-rarity-epic": "#a04fd0",
    "--jg-rarity-legendary": "#e0862e",
    "--jg-font-display": '"Segoe UI", system-ui, sans-serif',
    "--jg-font-numeric": 'Consolas, "Cascadia Mono", "SF Mono", "Roboto Mono", monospace',
    "--jg-font-body": '"Segoe UI", system-ui, sans-serif',
  },
  hud: {
    storageKey: "swarm-survivor",
    panels: [
      { id: "health", anchor: "top-left", inset: { x: 18, y: 18 }, items: [{ kind: "vital", stat: "health", label: "Hull", width: 220 }] },
      { id: "timer", anchor: "top", inset: { x: 0, y: 18 }, items: [{ kind: "timer", label: "Survive" }, { kind: "xp", width: 220 }] },
      { id: "score", anchor: "top-right", inset: { x: 18, y: 18 }, items: [{ kind: "score", source: "kills", label: "Kills", digits: 3 }] },
      { id: "weapon-bar", anchor: "bottom", inset: { x: 0, y: 24 }, items: [{ kind: "abilityBar", icons: { pulseLance: "spear", rotorBlades: "sword", quakePulse: "lightning" } }] },
    ],
  },
  screens: {
    win: {
      title: "Extraction Successful",
      lines: [
        { label: "Survived", value: "180s", accent: true },
        { label: "Kills", source: "kills" },
        { label: "Level", source: "level" },
      ],
    },
    lose: { title: "Overrun", subtitle: "The swarm closed in." },
  },
};

export const game = cartridge(config);
