import { describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";

import { ZONES } from "../world/zones";
import { audio } from "./catalog";
import { startAmbience, tickAudio } from "./drive";

const HUB = ZONES.find((zone) => zone.id === "arid_badlands")!;

interface Captured {
  play: string[];
  loopStart: string[];
  loopSet: { id: string; gain?: number; rate?: number }[];
  music: (string | null)[];
}

function boot(): { ctx: GameContext; heard: Captured } {
  const ctx = createGameContext({
    definition: defineGameDefinition({
      name: "the-robots-audio-test",
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
  const heard: Captured = { play: [], loopStart: [], loopSet: [], music: [] };
  ctx.game.events.on("audio.play", (event) => heard.play.push(event.sound));
  ctx.game.events.on("audio.loopStart", (event) => heard.loopStart.push(event.sound));
  ctx.game.events.on("audio.loopSet", (event) => heard.loopSet.push(event));
  ctx.game.events.on("audio.music", (event) => heard.music.push(event.theme));
  return { ctx, heard };
}

function spawnPlayer(ctx: GameContext, x: number, z: number): void {
  ctx.scene.entity.spawn("reactor_hunter", { id: "p1", position: [x, 0, z], role: "player" });
}

describe("the-robots ambience", () => {
  test("every catalog id the driver plays exists in the sound catalog", () => {
    const { ctx, heard } = boot();
    spawnPlayer(ctx, HUB.center.x, HUB.center.z);
    startAmbience(ctx);
    for (let step = 0; step < 40; step += 1) tickAudio(ctx, step * 100);
    for (const id of [...heard.play, ...heard.loopStart]) expect(audio.sounds[id]).toBeDefined();
  });

  test("the wind and industry beds start once and are driven live", () => {
    const { ctx, heard } = boot();
    spawnPlayer(ctx, HUB.center.x, HUB.center.z);
    startAmbience(ctx);
    startAmbience(ctx);
    expect(heard.loopStart).toEqual(["amb_wind", "amb_industry"]);
    tickAudio(ctx, 0);
    tickAudio(ctx, 8000);
    const windGains = heard.loopSet.filter((entry) => entry.id === "wind").map((entry) => entry.gain);
    expect(windGains.length).toBe(2);
    expect(windGains[0]).not.toBe(windGains[1]);
  });

  test("zones sound different — the Blight drops the wind and raises the machinery", () => {
    const blight = ZONES.find((zone) => zone.id === "eridium_blight")!;
    const windshear = ZONES.find((zone) => zone.id === "windshear_waste")!;

    const read = (x: number, z: number) => {
      const { ctx, heard } = boot();
      spawnPlayer(ctx, x, z);
      startAmbience(ctx);
      tickAudio(ctx, 0);
      return {
        wind: heard.loopSet.find((entry) => entry.id === "wind")!,
        industry: heard.loopSet.find((entry) => entry.id === "industry")!,
      };
    };

    const gale = read(windshear.center.x, windshear.center.z);
    const reactor = read(blight.center.x, blight.center.z);
    expect(reactor.wind.gain!).toBeLessThan(gale.wind.gain!);
    expect(reactor.wind.rate!).toBeLessThan(gale.wind.rate!);
    expect(reactor.industry.gain!).toBeGreaterThan(gale.industry.gain!);
  });

  test("walking lays down footsteps and standing still does not", () => {
    const { ctx, heard } = boot();
    spawnPlayer(ctx, HUB.center.x, HUB.center.z);
    startAmbience(ctx);

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
    startAmbience(ctx);
    tickAudio(ctx, 0);
    expect(heard.music).toEqual(["wastes"]);

    for (let index = 0; index < 3; index += 1) {
      ctx.scene.entity.spawn("psycho", {
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
    startAmbience(ctx);
    tickAudio(ctx, 0);
    ctx.scene.entity.spawn("captain_rusk", { id: "boss", position: [HUB.center.x + 8, 0, HUB.center.z], role: "npc" });
    tickAudio(ctx, 500);
    expect(heard.music.at(-1)).toBe("reactor");
  });

  test("taking damage and losing a shield are audible", () => {
    const { ctx, heard } = boot();
    spawnPlayer(ctx, HUB.center.x, HUB.center.z);
    startAmbience(ctx);
    tickAudio(ctx, 0);

    ctx.scene.entity.stats.delta("p1", "health", -20);
    tickAudio(ctx, 100);
    expect(heard.play).toContain("hurt_player");

    ctx.scene.entity.stats.delta("p1", "shield", -999);
    tickAudio(ctx, 200);
    expect(heard.play).toContain("shield_break");
  });
});
