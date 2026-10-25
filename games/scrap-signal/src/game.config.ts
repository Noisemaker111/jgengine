import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { PositionedPrompt } from "@jgengine/core/interaction/proximityPrompt";
import type { RarityStyle } from "@jgengine/core/game/worldItem";
import { defineGame } from "@jgengine/shell/defineGame";
import { findEditorMarker } from "@jgengine/core/editor/document";
import { buildScrapSignalEditorLayers } from "./editorLayers";
import { MAST_BOARD } from "./game/mast";

import { assets } from "./game/assets";
import { audio, objectSounds } from "./game/audio/catalog";
import { audioProbe } from "./game/audio/drive";
import { frontProbe } from "./game/encounters/front";
import { reserveProbe } from "./game/handroll/reserve";
import { content } from "./game/content";
import { inventories } from "./game/inventories";
import { keybinds } from "./game/keybinds";
import { RARITY_COLORS } from "./game/palette";
import { session } from "./game/session";
import { RELAY } from "./game/relay";
import { FRONT_SITE } from "./game/encounters/front";
import { GameUI } from "./game/ui/GameUI";
import { scrapTheme } from "./game/ui/theme";
import { entityModels, objectModels } from "./game/world/models";
import { FerralonWorldOverlay } from "./game/world/Viewmodel";
import { NPC_PLACEMENTS } from "./game/world/level";
import { AMMO_CHESTS, RED_CHESTS } from "./game/world/setup";
import {
  BLACK_MARKET_POS,
  BOLT_POS,
  RIGG_VENDOR_POS,
  TRAVEL_STATIONS,
  SPARX_VENDOR_POS,
} from "./game/world/sites";
import { loop } from "./loop";
import { CLIMB_SLOPE_LIMIT, physics, terrainField, world } from "./world";

const rarityStyle: Record<string, RarityStyle> = {
  common: { color: RARITY_COLORS.common, label: "Common" },
  uncommon: { color: RARITY_COLORS.uncommon, beam: true, label: "Uncommon" },
  rare: { color: RARITY_COLORS.rare, beam: true, label: "Rare" },
  epic: { color: RARITY_COLORS.epic, beam: true, label: "Epic" },
  legendary: { color: RARITY_COLORS.legendary, beam: true, label: "Legendary" },
};

const sceneDoc = buildScrapSignalEditorLayers();
const boardMarker = findEditorMarker(sceneDoc, MAST_BOARD);
if (boardMarker === undefined) throw new Error(`editor.scene.json: missing marker "${MAST_BOARD}"`);
const mastBoardPosition = { x: boardMarker.position.x, z: boardMarker.position.z };

const staticPrompts: readonly PositionedPrompt[] = [
  { id: "relay:dead-air", position: { x: RELAY.x, z: RELAY.z }, priority: 2,
    prompt: { radius: 3.8, display: { kind: "keybind", actionId: "interact" }, invoke: { name: "relay.start", input: undefined } } },
  {
    id: "rift:wreck",
    position: { x: FRONT_SITE.x, z: FRONT_SITE.z },
    priority: 2,
    prompt: { radius: 4.5, display: { kind: "keybind", actionId: "interact" }, invoke: { name: "rift.open", input: undefined } },
  },
  {
    id: "mast:board",
    position: mastBoardPosition,
    priority: 2,
    prompt: {
      radius: 5,
      display: { kind: "keybind", actionId: "interact" },
      invoke: { name: "mast.start", input: undefined },
    },
  },
  {
    id: "vendor:rigg",
    position: { x: RIGG_VENDOR_POS[0], z: RIGG_VENDOR_POS[2] },
    prompt: {
      radius: 3.2,
      display: { kind: "keybind", actionId: "interact"},
      invoke: { name: "vendor.open", input: { vendor: "rigg" } },
    },
  },
  {
    id: "vendor:sparx",
    position: { x: SPARX_VENDOR_POS[0], z: SPARX_VENDOR_POS[2] },
    prompt: {
      radius: 3.2,
      display: { kind: "keybind", actionId: "interact"},
      invoke: { name: "vendor.open", input: { vendor: "sparx" } },
    },
  },
  {
    id: "npc:bolt",
    position: { x: BOLT_POS[0], z: BOLT_POS[2] },
    prompt: {
      radius: 3,
      display: { kind: "keybind", actionId: "interact"},
      invoke: { name: "vendor.open", input: { vendor: "bolt" } },
    },
  },
  ...NPC_PLACEMENTS.map((npc) => ({
    id: `npc:${npc.name}`,
    position: { x: npc.x, z: npc.z },
    prompt: {
      radius: 3,
      display: { kind: "keybind", actionId: "interact" } as const,
      invoke:
        npc.name === "gauge"
          ? { name: "npc.gauge", input: undefined }
          : { name: "vendor.open", input: { vendor: npc.name === "dr_sparx" ? "sparx" : "rigg" } },
    },
  })),
  {
    id: "vendor:blackmarket",
    position: { x: BLACK_MARKET_POS[0], z: BLACK_MARKET_POS[2] },
    prompt: {
      radius: 3.2,
      display: { kind: "keybind", actionId: "interact" },
      invoke: { name: "blackmarket.open", input: undefined },
    },
  },
  ...TRAVEL_STATIONS.map((station) => ({
    id: `travel:${station.zoneId}`,
    position: { x: station.x, z: station.z },
    prompt: {
      radius: 3.4,
      display: { kind: "keybind", actionId: "interact" } as const,
      invoke: { name: "travel.open", input: undefined },
    },
  })),
  ...RED_CHESTS.map((chest, index) => ({
    id: `chest:red:${index}`,
    position: { x: chest.x, z: chest.z },
    prompt: {
      radius: 2.8,
      display: { kind: "keybind", actionId: "interact"} as const,
      invoke: { name: "chest.openRed", input: { instanceId: `red_chest_${index}` } },
    },
  })),
  ...AMMO_CHESTS.map((chest, index) => ({
    id: `chest:ammo:${index}`,
    position: { x: chest.x, z: chest.z },
    prompt: {
      radius: 2.8,
      display: { kind: "keybind", actionId: "interact"} as const,
      invoke: { name: "chest.openAmmo", input: { instanceId: `ammo_chest_${index}` } },
    },
  })),
];

function prompts(ctx: GameContext): readonly PositionedPrompt[] {
  const playerEntity = ctx.scene.entity.get(ctx.player.userId);
  if (playerEntity === null) return staticPrompts;
  const nearestId = ctx.scene.worldItem.nearestInRadius(playerEntity.position, 2.8);
  if (nearestId === null) return staticPrompts;
  const itemEntity = ctx.scene.entity.get(nearestId);
  if (itemEntity === null) return staticPrompts;
  return [
    ...staticPrompts,
    {
      id: `pickup:${nearestId}`,
      position: { x: itemEntity.position[0], z: itemEntity.position[2] },
      priority: 1,
      prompt: {
        radius: 2.8,
        display: { kind: "keybind", actionId: "interact" },
        invoke: { name: "pickup", input: undefined },
      },
    },
  ];
}

export const game = defineGame({
  capture: {
    play: [{ name: "character.pick", input: { characterId: "gunk" } }],
    states: {
      title: [],
      menu: [{ name: "menu.run", input: { characterId: "gunk", name: "Mara Vell" } }, "run.save", "menu.title"],
      "menu-new": ["menu.title"],
      // The boss shot: pick a character, then open the front's last wave with the Foreman one shot
      // above its second phase. The phase change itself is the next real hit.
      boss: [{ name: "character.pick", input: { characterId: "gunk" } }, "front.capture"],
      // The Overdrive console at the wreck with seven tiers cleared, and a tier-8 run live on the field.
      overdrive: [{ name: "character.pick", input: { characterId: "gunk" } }, { name: "rift.capture", input: { tier: 8, mode: "terminal" } }],
      "overdrive-run": [{ name: "character.pick", input: { characterId: "gunk" } }, { name: "rift.capture", input: { tier: 8 } }],
      // The opening wave already on the field: both crews spawned and converging, so a fight shot
      // does not have to walk to the wreck and wait for the meeting. `front.capture` is dev-only.
      "front-fight": [
        { name: "character.pick", input: { characterId: "gunk" } },
        { name: "front.capture", input: { mode: "fight" } },
      ],
      // The relay contract's first ambush, so a flow can prove the session opens in the real game
      // without a two-minute walk from the crash site.
      "dead-air": [{ name: "character.pick", input: { characterId: "gunk" } }, { name: "relay.capture", input: { mode: "upload" } }],
      // The Emergency Reserve window itself: the chassis is dropped to its last point of health so
      // the game's own downed tick opens the real 12 s window, banner, prompt and reconstruct fee.
      downed: [{ name: "character.pick", input: { characterId: "gunk" } }, "reserve.capture"],
    },
    probe: (ctx) => ({ ...audioProbe(ctx), ...frontProbe(ctx), ...reserveProbe(ctx) }),
    // Ferralon's opening view carries the terrain shader, the scrub field, and a settlement's worth
    // of streamed GLB materials, and every one of those programs compiles on the first drawn frame.
    // On a software renderer that is seconds of work after readiness reports done, and the default
    // 2.5 s wait was landing the capture before anything had been rasterised at all.
    settleMs: 9000,
    views: {
      menu: { description: "Boot menu over the wastes, Continue highlighted", state: "menu", settleMs: 1800 },
      menuNew: { description: "New run pane with the reclaimer roster", state: "menu-new", settleMs: 1200 },
      convoy: {
        description: "The wrecked hauler landmark that gives the opening view its midground.",
        look: "@marker:rustflat_convoy_hauler",
        lookFrom: "24,9,0.6",
        settleMs: 20000,
      },
      front: {
        description: "The Rustflat Front — both crews converging on the convoy wreck.",
        look: "@marker:front_rustflat_center",
        lookFrom: "30,12,0.5",
        settleMs: 16000,
      },
    },
  },
  name: "Scrap Signal",
  features: { quest: true, trade: true },
  assets,
  audio,
  objectSounds,
  world,
  editorLayers: sceneDoc,
  scenePlacement: false,
  scenePathKinds: [],
  physics,
  // Fixed 60 Hz: enemy AI, recoil, reloads and shots are per-tick math, so the same input has to
  // produce the same run on a slow and a fast machine.
  simulation: { hz: 60 },
  inventories,
  input: keybinds,
  // The context-specific relay button lives beside its stakes and progress.
  touch: { hidden: ["relay.overclock", "rift.callWave"] },
  server: { mode: "campaign" },
  save: "none",
  persist: true,
  content,
  loop,
  GameUI,
  hudTheme: scrapTheme,
  entityModels,
  objectModels,
  WorldOverlay: FerralonWorldOverlay,
  // Bars are a screen-space overlay, so without `occlude` an enemy behind a shack still shows its
  // health through the wall.
  worldHealthBars: { roles: ["enemy"], occlude: true },
  // Direct-fire guns want the muzzle→impact tracer; grenades/launchers are ballistic and
  // skip it automatically (they arc, so a straight line would be a fake beam).
  presentationEffects: { tracers: true },
  worldItem: { rarityStyle, pickupRadius: 2.8 },
  prompts,
  hotbarSelection: () => session.selectedSlot(),
  // No `backdrop.fog`: the world's sky owns the single fog config, so the two cannot drift apart.
  // Fill was bright enough to erase the shadow side of everything, which is why silhouettes looked
  // pasted onto the ground. Sun up, ambient/hemisphere down, and a cool bounce from the sky so
  // shadowed metal goes blue-grey instead of muddy brown.
  lighting: {
    // Warm grey, not cool: the hemisphere already supplies the cold sky bounce that keeps machines
    // blue in shade, and stacking a second cool fill on top of it turned every shadowed hillside
    // olive-green in a world whose whole rule is that the ground stays warm.
    ambient: { color: "#b3a693", intensity: 0.2 },
    // Sky bounce desaturated from #7fa9c8: a saturated cyan fill times warm tan albedo lands on
    // olive — the whole desert's shadow side was reading green. A greyer blue keeps machines cool
    // in shade without repainting the ground.
    hemisphere: { skyColor: "#9aa8b8", groundColor: "#6b4a30", intensity: 0.4 },
    // Mid-afternoon, not noon. The old key was almost overhead, so nothing cast a shadow long
    // enough to describe its own shape and every object read as a sticker on flat sand.
    // 2.5, not 2.6: the terrain's dirt grain multiplies albedo up to ~1.5x where the map is bright,
    // so sunlit sand was arriving at the tone-mapper above 1.0 and clipping to white on the sun side.
    directional: [
      {
        color: "#ffe0b0",
        // 2.35, not 2.5: at 2.5 the sun-side dune faces still summed past 1.0 with the dirt-grain
        // albedo boost and clipped to one white field across the whole right of frame.
        intensity: 2.35,
        position: [64, 46, -52],
        castShadow: true,
        // The playfield sits over a kilometre from the origin — only camera-following
        // cascades put these long afternoon shadows where the player actually is.
        cascades: 3,
        shadowMaxFar: 240,
        shadowMapSize: 2048,
      },
      { color: "#6d90b4", intensity: 0.5, position: [-40, 26, 30] },
    ],
  },
  // GTAO was dropped here after perf profiling: it re-renders the whole scene
  // for depth/normals and doubled the frame's draw calls/triangles for a subtle
  // contact-shadow gain this bright, fogged desert barely shows.
  postProcessing: {
    toneMapping: "aces",
    // The whole exposure chain rides on this rather than on the key light, so the sun/shade ratio
    // that makes the afternoon dramatic survives while the sun-facing sand stops clipping to paper.
    exposure: 0.8,
    // Bloom runs on the raw HDR *before* exposure, so a threshold under 1.0 was picking up lit sand
    // and smearing a white veil over the sun side of every frame. Above 1.0 only emissives — optics,
    // hazard trim, element cells, muzzle flash — cross it, which is the glow that was wanted.
    bloom: { strength: 0.3, radius: 0.62, threshold: 1.1 },
    // Cool lift + warm gain splits shadow and highlight so the flats stop sitting in one mid-tone
    // band. Saturation carries the warmth rather than a red-heavy gain: ACES desaturates hard as it
    // approaches white, so a gain that pushes red is the channel that clips first.
    // Saturation eased off 1.3: that boost was amplifying every residual hue error — olive shadow
    // sides, cyan haze — faster than it warmed the sand.
    grade: {
      vignette: 0.32,
      saturation: 1.15,
      gamma: 0.93,
      lift: [0.002, 0.008, 0.024],
      gain: [1.02, 1.0, 0.96],
    },
  },
  movement: {
    collideObjects: true,
    beforeCommit: (frame) => {
      const currentGround = terrainField.sampleHeight(frame.current[0], frame.current[2]);
      const tooSteep = (x: number, z: number) => {
        const distance = Math.hypot(x - frame.current[0], z - frame.current[2]);
        if (distance < 0.0001) return false;
        return (terrainField.sampleHeight(x, z) - currentGround) / distance > CLIMB_SLOPE_LIMIT;
      };
      if (!tooSteep(frame.next[0], frame.next[2])) return undefined;
      if (!tooSteep(frame.next[0], frame.current[2])) return [frame.next[0], frame.next[1], frame.current[2]];
      if (!tooSteep(frame.current[0], frame.next[2])) return [frame.current[0], frame.next[1], frame.next[2]];
      return [frame.current[0], frame.next[1], frame.current[2]];
    },
  },
  camera: {
    perspective: "first",
    firstPerson: { eyeHeight: 1.62, sensitivity: 0.0023, reticle: true, viewmodel: false },
    frustum: { far: 4200 },
  },
  orientation: "landscape",
});



