import { describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";

import { ambienceBedLevel, ambienceWeights } from "@jgengine/core/audio/ambience";

import { gust } from "../world/air";
import { ZONES, zoneAt } from "../world/zones";
import { audio, windZoneId, windZones } from "./catalog";
import { tickAudio } from "./drive";

const HUB = ZONES.find((zone) => zone.id === "arid_badlands")!;

interface Captured {
  play: string[];
  loopStart: string[];
  loopSet: { id: string; gain?: number; rate?: number }[];
  zoneLevel: { id: string; level: number }[];
  music: (string | null)[];
}

function boot(): { ctx: GameContext; heard: Captured } {
  const ctx = createGameContext({
    definition: defineGameDefinition({
      name: "scrap-signal-audio-test",
      assets: createAssetCatalog(),
      multiplayer: "off",
    }),
    content: {
      entityById: (id) =>
        id === "reactor_hunter"
          ? { role: "player", movement: { walkSpeed: 4 }, stats: { health: { max: 100, min: 0 }, shield: { max: 50, min: 0 } } }
          : { role: "npc", stats: { health: { max: 40, min: 0 } } },
    },
    player: { userId: "p1", isNew: true },
  });
  const heard: Captured = { play: [], loopStart: [], loopSet: [], zoneLevel: [], music: [] };
  ctx.game.events.on("audio.play", (event) => heard.play.push(event.sound));
  ctx.game.events.on("audio.loopStart", (event) => heard.loopStart.push(event.sound));
  ctx.game.events.on("audio.loopSet", (event) => heard.loopSet.push(event));
  ctx.game.events.on("audio.zoneLevel", (event) => heard.zoneLevel.push(event));
  ctx.game.events.on("audio.music", (event) => heard.music.push(event.theme));
  return { ctx, heard };
}

function spawnPlayer(ctx: GameContext, x: number, z: number): void {
  ctx.scene.entity.spawn("reactor_hunter", { id: "p1", position: [x, 0, z], role: "player" });
}

describe("scrap-signal ambience", () => {
  test("every catalog id the driver plays exists in the sound catalog", () => {
    const { ctx, heard } = boot();
    spawnPlayer(ctx, HUB.center.x, HUB.center.z);
    for (let step = 0; step < 40; step += 1) tickAudio(ctx, step * 100);
    for (const id of [...heard.play, ...heard.loopStart]) expect(audio.sounds[id]).toBeDefined();
    for (const zone of audio.zones) expect(audio.sounds[zone.sound]).toBeDefined();
  });

  test("the wind beds are shell zone beds whose level the gust drives live", () => {
    const { ctx, heard } = boot();
    spawnPlayer(ctx, HUB.center.x, HUB.center.z);
    tickAudio(ctx, 0);
    tickAudio(ctx, 8000);
    // No game-owned wind loop is left: the shell starts and crossfades the beds.
    expect(heard.loopStart).toEqual([]);
    expect(heard.loopSet).toEqual([]);
    const windIds = windZones.map((zone) => zone.id);
    expect(heard.zoneLevel.slice(0, windIds.length).map((entry) => entry.id)).toEqual(windIds);
    const first = heard.zoneLevel[0]!.level;
    const later = heard.zoneLevel[windIds.length]!.level;
    expect(first).toBeCloseTo(gust(0));
    expect(later).toBeCloseTo(gust(8000));
    expect(first).not.toBe(later);
  });

  test("zones sound different - the Blight drops the wind and raises the machinery", () => {
    const blight = ZONES.find((zone) => zone.id === "cores_blight")!;
    const rustflat = ZONES.find((zone) => zone.id === "rustflat_waste")!;

    const read = (at: { x: number; z: number }) => {
      const levels = new Map<string, number>();
      for (const { id, weight } of ambienceWeights(audio.zones, at.x, 0, at.z)) {
        levels.set(id, ambienceBedLevel(audio.zones.find((zone) => zone.id === id)!, weight, gust(0)));
      }
      const wind = [...levels].filter(([id]) => id.startsWith("wind_")).reduce((sum, [, level]) => sum + level, 0);
      const industry = [...levels].filter(([id]) => !id.startsWith("wind_")).reduce((sum, [, level]) => sum + level, 0);
      return { wind, industry };
    };
    const pitch = (zoneId: string | null) => {
      const voice = audio.sounds[windZoneId(zoneId)]!.synth!.voices[0]!;
      return voice.kind === "noise" ? voice.filterFreq : 0;
    };

    const gale = read(rustflat.center);
    const reactor = read(blight.center);
    expect(reactor.wind).toBeLessThan(gale.wind);
    expect(pitch(blight.id)).toBeLessThan(pitch(rustflat.id));
    expect(reactor.industry).toBeGreaterThan(gale.industry);
  });

  test("the open ground between zones keeps the default wind, handed over across a zone edge", () => {
    const open = { x: 800, z: 800 };
    expect(zoneAt(open.x, open.z)).toBeNull();
    expect(ambienceWeights(windZones, open.x, 0, open.z)).toEqual([{ id: windZoneId(null), weight: 1 }]);
    // Walking from the Rustflat centre out into the open, the wind layer never drops out or doubles.
    const rustflat = ZONES.find((zone) => zone.id === "rustflat_waste")!;
    for (let x = rustflat.center.x; x >= rustflat.center.x - rustflat.radius - 60; x -= 6) {
      const total = ambienceWeights(windZones, x, 0, rustflat.center.z).reduce((sum, entry) => sum + entry.weight, 0);
      expect(total).toBeCloseTo(1);
    }
  });

  test("walking lays down footsteps and standing still does not", () => {
    const { ctx, heard } = boot();
    spawnPlayer(ctx, HUB.center.x, HUB.center.z);

    for (let step = 0; step < 12; step += 1) {
      ctx.scene.entity.setPose("p1", { position: [HUB.center.x + step * 1, 0, HUB.center.z] });
      tickAudio(ctx, step * 200);
    }
    const walked = heard.play.filter((id) => id.startsWith("foot_"));
    expect(walked.length).toBeGreaterThanOrEqual(4);
    // Both feet, not one sound on repeat.
    expect(new Set(walked).size).toBe(2);

    const before = heard.play.length;
    for (let step = 0; step < 10; step += 1) tickAudio(ctx, 5000 + step * 200);
    expect(heard.play.filter((id) => id.startsWith("foot_")).length).toBe(walked.length);
    expect(heard.play.length).toBeGreaterThanOrEqual(before);
  });

  test("music escalates when a pack closes in and settles again once it is dead", () => {
    const { ctx, heard } = boot();
    spawnPlayer(ctx, HUB.center.x, HUB.center.z);
    tickAudio(ctx, 0);
    expect(heard.music).toEqual(["wastes"]);

    for (let index = 0; index < 3; index += 1) {
      ctx.scene.entity.spawn("husk", {
        id: `bandit${index}`,
        position: [HUB.center.x + 6 + index, 0, HUB.center.z],
        role: "npc",
      });
    }
    tickAudio(ctx, 500);
    expect(heard.music).toEqual(["wastes", "skirmish"]);

    for (let index = 0; index < 3; index += 1) ctx.scene.entity.despawn(`bandit${index}`);
    // Still inside the hold window: the track must not snap back the instant the last one drops.
    tickAudio(ctx, 3000);
    expect(heard.music).toEqual(["wastes", "skirmish"]);
    tickAudio(ctx, 12000);
    expect(heard.music).toEqual(["wastes", "skirmish", "wastes"]);
  });

  test("a boss escalates past a regular pack", () => {
    const { ctx, heard } = boot();
    spawnPlayer(ctx, HUB.center.x, HUB.center.z);
    tickAudio(ctx, 0);
    ctx.scene.entity.spawn("captain_rusk", { id: "boss", position: [HUB.center.x + 8, 0, HUB.center.z], role: "npc" });
    tickAudio(ctx, 500);
    expect(heard.music.at(-1)).toBe("reactor");
  });

  test("taking damage and losing a shield are audible", () => {
    const { ctx, heard } = boot();
    spawnPlayer(ctx, HUB.center.x, HUB.center.z);
    tickAudio(ctx, 0);

    ctx.scene.entity.stats.delta("p1", "health", -20);
    tickAudio(ctx, 100);
    expect(heard.play).toContain("hurt_player");

    ctx.scene.entity.stats.delta("p1", "shield", -999);
    tickAudio(ctx, 200);
    expect(heard.play).toContain("shield_break");
  });
});
