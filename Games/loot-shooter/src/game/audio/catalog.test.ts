import { describe, expect, test } from "bun:test";
import { WEAPON_BASES } from "../items/weapons/catalog";
import { SOUND_IDS, audioBuses, buildSounds, objectSounds } from "./catalog";

describe("audio catalog", () => {
  const sounds = buildSounds();

  test("every weapon family has a distinct fire sound", () => {
    const urls = new Set<string>();
    for (const base of WEAPON_BASES) {
      const sound = sounds[SOUND_IDS.fire(base.family)];
      expect(sound).toBeDefined();
      urls.add(sound!.url);
    }
    expect(urls.size).toBe(WEAPON_BASES.length);
  });

  test("every named one-shot resolves", () => {
    const ids = [
      SOUND_IDS.enemyBolt,
      SOUND_IDS.hitImpact,
      SOUND_IDS.killConfirm,
      SOUND_IDS.explosion,
      SOUND_IDS.pickupWeapon,
      SOUND_IDS.pickupGear,
      SOUND_IDS.medkit,
      SOUND_IDS.noAmmo,
      SOUND_IDS.mortarWarn,
      SOUND_IDS.waveHorn,
      SOUND_IDS.levelUp,
      SOUND_IDS.victory,
      SOUND_IDS.defeat,
      SOUND_IDS.pylonHum,
    ];
    for (const id of ids) {
      expect(sounds[id]).toBeDefined();
      expect(sounds[id]!.url.startsWith("data:audio/wav;base64,")).toBe(true);
    }
  });

  test("every sound routes to a declared bus", () => {
    for (const sound of Object.values(sounds)) {
      expect(audioBuses[sound.bus]).toBeDefined();
    }
  });

  test("pylon hum loops positionally for object emitters", () => {
    const hum = sounds[SOUND_IDS.pylonHum]!;
    expect(hum.loop).toBe(true);
    expect(hum.positional).toBe(true);
    expect(objectSounds.pylon_beacon).toBe(SOUND_IDS.pylonHum);
  });
});
