import type { AudioBusDef, SoundDef } from "@jgengine/core/audio/audioFalloff";
import type { WeaponFamily } from "../items/weapons/catalog";
import { synthWavDataUri, type ToneSpec } from "./synth";

export const SOUND_IDS = {
  fire: (family: WeaponFamily) => `fire_${family}`,
  enemyBolt: "enemy_bolt",
  hitImpact: "hit_impact",
  killConfirm: "kill_confirm",
  explosion: "explosion",
  pickupWeapon: "pickup_weapon",
  pickupGear: "pickup_gear",
  medkit: "medkit_use",
  noAmmo: "no_ammo",
  mortarWarn: "mortar_warn",
  waveHorn: "wave_horn",
  levelUp: "level_up",
  victory: "victory_sting",
  defeat: "defeat_sting",
  pylonHum: "pylon_hum",
} as const;

const FIRE_LAYERS: Record<WeaponFamily, ToneSpec[]> = {
  pistol: [
    { seconds: 0.11, startFreq: 950, endFreq: 240, wave: "square", decay: 26, gain: 0.55 },
    { seconds: 0.05, startFreq: 2400, endFreq: 1200, wave: "noise", decay: 60, gain: 0.3 },
  ],
  smg: [
    { seconds: 0.07, startFreq: 720, endFreq: 320, wave: "square", decay: 34, gain: 0.45 },
    { seconds: 0.03, startFreq: 3000, wave: "noise", decay: 90, gain: 0.25 },
  ],
  shotgun: [
    { seconds: 0.2, startFreq: 400, wave: "noise", decay: 18, gain: 0.7 },
    { seconds: 0.16, startFreq: 130, endFreq: 55, wave: "sine", decay: 16, gain: 0.7 },
  ],
  rifle: [
    { seconds: 0.09, startFreq: 540, endFreq: 260, wave: "saw", decay: 30, gain: 0.5 },
    { seconds: 0.04, startFreq: 2600, wave: "noise", decay: 80, gain: 0.22 },
  ],
  dmr: [
    { seconds: 0.16, startFreq: 1500, endFreq: 190, wave: "sine", decay: 18, gain: 0.6 },
    { seconds: 0.1, startFreq: 900, wave: "noise", decay: 40, gain: 0.3 },
  ],
  beam: [
    { seconds: 0.1, startFreq: 660, endFreq: 740, wave: "triangle", decay: 22, gain: 0.5 },
    { seconds: 0.08, startFreq: 1320, endFreq: 1480, wave: "sine", decay: 26, gain: 0.25 },
  ],
  launcher: [
    { seconds: 0.26, startFreq: 210, endFreq: 70, wave: "square", decay: 12, gain: 0.6 },
    { seconds: 0.18, startFreq: 500, wave: "noise", decay: 22, gain: 0.4 },
  ],
  railgun: [
    { seconds: 0.3, startFreq: 1900, endFreq: 90, wave: "saw", decay: 11, gain: 0.55 },
    { seconds: 0.12, startFreq: 3400, endFreq: 800, wave: "noise", decay: 30, gain: 0.3 },
  ],
};

const ONE_SHOTS: Record<string, ToneSpec[]> = {
  [SOUND_IDS.enemyBolt]: [
    { seconds: 0.12, startFreq: 480, endFreq: 920, wave: "triangle", decay: 20, gain: 0.4 },
  ],
  [SOUND_IDS.hitImpact]: [
    { seconds: 0.06, startFreq: 1800, wave: "noise", decay: 70, gain: 0.4 },
    { seconds: 0.07, startFreq: 220, endFreq: 140, wave: "sine", decay: 40, gain: 0.5 },
  ],
  [SOUND_IDS.killConfirm]: [
    { seconds: 0.07, startFreq: 660, wave: "sine", decay: 20, gain: 0.4 },
    { seconds: 0.09, startFreq: 880, wave: "sine", decay: 18, gain: 0.4, at: 0.06 },
  ],
  [SOUND_IDS.explosion]: [
    { seconds: 0.55, startFreq: 900, wave: "noise", decay: 7, gain: 0.75 },
    { seconds: 0.5, startFreq: 95, endFreq: 38, wave: "sine", decay: 6, gain: 0.8 },
  ],
  [SOUND_IDS.pickupWeapon]: [
    { seconds: 0.08, startFreq: 440, wave: "triangle", decay: 16, gain: 0.4 },
    { seconds: 0.08, startFreq: 660, wave: "triangle", decay: 16, gain: 0.4, at: 0.07 },
    { seconds: 0.12, startFreq: 990, wave: "triangle", decay: 14, gain: 0.42, at: 0.14 },
  ],
  [SOUND_IDS.pickupGear]: [{ seconds: 0.06, startFreq: 980, wave: "square", decay: 40, gain: 0.3 }],
  [SOUND_IDS.medkit]: [
    { seconds: 0.24, startFreq: 520, endFreq: 780, wave: "sine", decay: 9, gain: 0.4, attack: 0.03 },
  ],
  [SOUND_IDS.noAmmo]: [{ seconds: 0.05, startFreq: 190, wave: "square", decay: 60, gain: 0.35 }],
  [SOUND_IDS.mortarWarn]: [
    { seconds: 0.5, startFreq: 320, endFreq: 640, wave: "saw", decay: 4, gain: 0.4, attack: 0.05 },
    { seconds: 0.4, startFreq: 160, endFreq: 320, wave: "sine", decay: 4, gain: 0.35, at: 0.08 },
  ],
  [SOUND_IDS.waveHorn]: [
    { seconds: 0.7, startFreq: 220, wave: "saw", decay: 3.2, gain: 0.4, attack: 0.12 },
    { seconds: 0.7, startFreq: 277, wave: "saw", decay: 3.2, gain: 0.3, attack: 0.12 },
    { seconds: 0.6, startFreq: 110, wave: "sine", decay: 3, gain: 0.4, attack: 0.1, at: 0.05 },
  ],
  [SOUND_IDS.levelUp]: [
    { seconds: 0.09, startFreq: 523, wave: "triangle", decay: 12, gain: 0.4 },
    { seconds: 0.09, startFreq: 659, wave: "triangle", decay: 12, gain: 0.4, at: 0.08 },
    { seconds: 0.09, startFreq: 784, wave: "triangle", decay: 12, gain: 0.4, at: 0.16 },
    { seconds: 0.18, startFreq: 1046, wave: "triangle", decay: 9, gain: 0.45, at: 0.24 },
  ],
  [SOUND_IDS.victory]: [
    { seconds: 0.16, startFreq: 523, wave: "triangle", decay: 6, gain: 0.42 },
    { seconds: 0.16, startFreq: 659, wave: "triangle", decay: 6, gain: 0.42, at: 0.14 },
    { seconds: 0.16, startFreq: 784, wave: "triangle", decay: 6, gain: 0.42, at: 0.28 },
    { seconds: 0.5, startFreq: 1046, wave: "triangle", decay: 4, gain: 0.5, at: 0.42 },
    { seconds: 0.5, startFreq: 523, wave: "sine", decay: 4, gain: 0.35, at: 0.42 },
  ],
  [SOUND_IDS.defeat]: [
    { seconds: 0.3, startFreq: 392, endFreq: 370, wave: "saw", decay: 5, gain: 0.4 },
    { seconds: 0.3, startFreq: 311, endFreq: 294, wave: "saw", decay: 5, gain: 0.4, at: 0.26 },
    { seconds: 0.7, startFreq: 233, endFreq: 110, wave: "saw", decay: 3, gain: 0.45, at: 0.52 },
  ],
  [SOUND_IDS.pylonHum]: [
    { seconds: 1.6, startFreq: 110, wave: "sine", decay: 0.2, gain: 0.3, attack: 0.2 },
    { seconds: 1.6, startFreq: 112.5, wave: "sine", decay: 0.2, gain: 0.25, attack: 0.2 },
  ],
};

function soundDef(id: string, layers: ToneSpec[], overrides?: Partial<SoundDef>): SoundDef {
  return { id, url: synthWavDataUri(layers), bus: "sfx", positional: false, ...overrides };
}

export function buildSounds(): Record<string, SoundDef> {
  const sounds: Record<string, SoundDef> = {};
  for (const [family, layers] of Object.entries(FIRE_LAYERS)) {
    const id = `fire_${family}`;
    sounds[id] = soundDef(id, layers, { gain: 0.8 });
  }
  for (const [id, layers] of Object.entries(ONE_SHOTS)) {
    sounds[id] = soundDef(id, layers);
  }
  sounds[SOUND_IDS.enemyBolt] = { ...sounds[SOUND_IDS.enemyBolt]!, positional: true };
  sounds[SOUND_IDS.explosion] = { ...sounds[SOUND_IDS.explosion]!, positional: true, gain: 1 };
  sounds[SOUND_IDS.waveHorn] = { ...sounds[SOUND_IDS.waveHorn]!, bus: "ui" };
  sounds[SOUND_IDS.levelUp] = { ...sounds[SOUND_IDS.levelUp]!, bus: "ui" };
  sounds[SOUND_IDS.victory] = { ...sounds[SOUND_IDS.victory]!, bus: "ui" };
  sounds[SOUND_IDS.defeat] = { ...sounds[SOUND_IDS.defeat]!, bus: "ui" };
  sounds[SOUND_IDS.pylonHum] = {
    ...sounds[SOUND_IDS.pylonHum]!,
    bus: "ambient",
    loop: true,
    positional: true,
    gain: 0.5,
  };
  return sounds;
}

export const audioBuses: Record<string, AudioBusDef> = {
  sfx: { id: "sfx", gain: 0.9 },
  ui: { id: "ui", gain: 0.85 },
  ambient: { id: "ambient", gain: 0.6 },
};

export const gameAudio = { sounds: buildSounds(), buses: audioBuses };

export const objectSounds: Record<string, string> = {
  pylon_beacon: SOUND_IDS.pylonHum,
};
