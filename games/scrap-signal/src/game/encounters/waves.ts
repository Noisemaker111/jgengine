import type { BossPhase } from "@jgengine/core/ai/director/boss";
import type { EncounterDefinition } from "@jgengine/core/ai/director/encounter";
import type { PressureRule } from "@jgengine/core/ai/director/pressure";

/**
 * The Rustflat Front, authored as data.
 *
 * Two crews tear at the convoy wreck the player spawns beside: the Scrapjack salvage line, which
 * holds range and shoots from cover, and a Ripper pack, which closes and comes around the shoulder.
 * The waves name *who arrives and from where*; `encounters/front.ts` reads the live squad and hands
 * out duties, so nothing here scripts a single enemy's behaviour.
 */
export const FRONT_ID = "rustflat_front";
export const FRONT_SEED = 4097;

/** Entries and the wreck are authored markers in `editor.scene.json`. */
export const FRONT_MARKERS = {
  center: "front_rustflat_center",
  scrapjack: "front_rustflat_scrapjack",
  ripper: "front_rustflat_ripper",
  foreman: "front_rustflat_foreman",
} as const;

/** How close the player must come for the wreck to wake, and how far they can walk before it holds. */
export const FRONT_ACTIVATION_RADIUS = 40;
export const FRONT_LEAVE_RADIUS = 72;
/** Seconds between a cleared wave and the next one coming in. */
export const FRONT_WAVE_GAP_SECONDS = 2.5;
/** Seconds between squad duty passes. */
export const FRONT_ROLE_INTERVAL = 1.6;

export const FRONT_WAVES: EncounterDefinition = {
  id: FRONT_ID,
  waves: [
    {
      id: "probe",
      label: "Probe",
      groups: [
        { unit: "husk", entry: FRONT_MARKERS.scrapjack, count: 2 },
        { unit: "ripper_pup", entry: FRONT_MARKERS.ripper, count: 3, at: 1, jitterSeconds: 0.5 },
        { unit: "elite_husk", entry: FRONT_MARKERS.scrapjack, count: 1, at: 3 },
      ],
    },
    {
      id: "line",
      label: "The Line",
      groups: [
        { unit: "marauder", entry: FRONT_MARKERS.scrapjack, count: 2 },
        { unit: "husk", entry: FRONT_MARKERS.scrapjack, count: 2, at: 1.5, escalates: true },
        { unit: "bruiser", entry: FRONT_MARKERS.ripper, count: 2, at: 0.5 },
        { unit: "ripper", entry: FRONT_MARKERS.ripper, count: 2, at: 2, escalates: true },
      ],
    },
    {
      id: "elite",
      label: "The Elite",
      groups: [
        { unit: "marauder", entry: FRONT_MARKERS.scrapjack, count: 2 },
        { unit: "elite_husk", entry: FRONT_MARKERS.scrapjack, count: 1, at: 2 },
        { unit: "ripper", entry: FRONT_MARKERS.ripper, count: 3, at: 0.5, escalates: true },
        { unit: "bruiser", entry: FRONT_MARKERS.ripper, count: 2, at: 3 },
      ],
    },
    {
      id: "foreman",
      label: "The Foreman",
      groups: [
        { unit: "husk", entry: FRONT_MARKERS.scrapjack, count: 2 },
        { unit: "marauder", entry: FRONT_MARKERS.scrapjack, count: 2, at: 1, escalates: true },
        { unit: "foreman_maw", entry: FRONT_MARKERS.foreman, count: 1, at: 3 },
      ],
    },
  ],
};

export const FRONT_WAVE_COUNT = FRONT_WAVES.waves.length;

/**
 * How hard the front leans on the player. A healthy player who has cleared waves gets the thicker
 * composition; a player already losing gets the authored one. `maxTier` caps every derived effect,
 * so the front cannot grow past two extra units a group and two elite slots.
 */
export const FRONT_PRESSURE: PressureRule = {
  healthWeight: 1,
  progressWeight: 1,
  timeWeight: 0.4,
  timeFloorSeconds: 60,
  timeWindowSeconds: 360,
  maxTier: 2,
};

/** The Ripper pack's alpha: a convoy-fed maw that leads the front's last wave. */
export const FOREMAN_ID = "foreman_maw";

/**
 * Three authored phases. Thresholds, monotone order and the tell fire are the engine's; what each
 * phase *does* is the stance table below, which is this game's content.
 */
export const FOREMAN_PHASES: readonly BossPhase[] = [
  {
    id: "stoke",
    atHealth: 1,
    behaviour: { preferredRange: 3.2, discipline: { fireInterval: 1.4 } },
    tell: { id: "wake", telegraphSeconds: 2.2 },
  },
  {
    id: "stampede",
    atHealth: 0.6,
    behaviour: { preferredRange: 2.8, discipline: { fireInterval: 1.1 } },
    tell: { id: "lunge", telegraphSeconds: 2.2 },
  },
  {
    id: "starving",
    atHealth: 0.25,
    behaviour: { preferredRange: 2.4, discipline: { fireInterval: 0.8 } },
    tell: { id: "starve", telegraphSeconds: 2.2 },
  },
];

/** What a phase looks like on the ground: how fast the frame walks and what the HUD calls it. */
export const FOREMAN_STANCE: Record<string, { speedScale: number; label: string }> = {
  stoke: { speedScale: 1, label: "Stoking" },
  stampede: { speedScale: 1.5, label: "Stampede" },
  starving: { speedScale: 1.9, label: "Starving" },
};

/** One line per tell, shown while the player has time to answer it. */
export const FOREMAN_TELL_TEXT: Record<string, string> = {
  wake: "THE FOREMAN WAKES — it shrugs off the wreck",
  lunge: "THE FOREMAN LUNGES — it is faster now",
  starve: "THE FOREMAN IS STARVING — it will not slow",
};

/** The elite that walks with the third wave, and the wind-up that announces it. */
export const ELITE_TELL = {
  unit: "elite_husk",
  text: "ELITE HUSK — SHIELD BREAKER WINDING UP",
  windupMs: 1400,
  radius: 4.2,
  damage: 20,
} as const;

/** A shot's hearing weight by gun family; a shotgun carries further than a pistol. */
export const SHOT_LOUDNESS: Record<string, number> = {
  pistol: 1.1,
  smg: 1,
  shotgun: 1.5,
  rifle: 1.3,
  sniper: 1.6,
  launcher: 1.8,
};
