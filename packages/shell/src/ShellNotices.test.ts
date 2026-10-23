import { describe, expect, test } from "bun:test";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import type { LiveGameBackend } from "@jgengine/core/runtime/transport";

import { remoteCommandSink } from "./commandSink";
import { attachShellNotices } from "./ShellNotices";
import { resolvePlayableAudio } from "./audio/playableAudio";
import type { PlayableGame } from "./registry";

function gameCtx() {
  const ctx = createGameContext({
    definition: defineGameDefinition({ name: "ShellNoticeGame", multiplayer: "off" }),
    content: {},
    player: { userId: "p1", isNew: true },
  });
  ctx.game.commands.define("tower.build", {
    validate: () => ({ reason: "insufficient-gold", message: "Needs 40 more gold" }),
    apply: () => undefined,
  });
  ctx.game.commands.define("wave.release", { validate: () => ({ reason: "not-ready" }), apply: () => undefined });
  const played: string[] = [];
  ctx.game.events.on("audio.play", ({ sound }) => played.push(sound));
  return { ctx, played };
}

describe("attachShellNotices", () => {
  test("a refused command with a message becomes one deduped deny notice with the deny cue", () => {
    const { ctx, played } = gameCtx();
    const detach = attachShellNotices(ctx);
    ctx.game.commands.run("tower.build", {});
    ctx.game.commands.run("tower.build", {});
    ctx.game.commands.run("wave.release", {});
    expect(ctx.game.notices.list().map((notice) => [notice.text, notice.tone, notice.count])).toEqual([["Needs 40 more gold", "deny", 2]]);
    expect(played).toEqual(["ui.deny", "ui.deny"]);
    ctx.game.notices.push({ text: "Wave cleared", tone: "success" });
    expect(played.at(-1)).toBe("ui.confirm");
    detach();
    ctx.game.commands.run("tower.build", {});
    expect(played).toHaveLength(3);
  });

  test("a silent notice skips its cue", () => {
    const { ctx, played } = gameCtx();
    attachShellNotices(ctx);
    ctx.game.notices.push({ text: "Autosaved", silent: true });
    ctx.game.notices.push({ text: "Wave cleared", tone: "success" });
    expect(played).toEqual(["ui.confirm"]);
  });

  test("refusals and cues opt out separately", () => {
    const { ctx, played } = gameCtx();
    attachShellNotices(ctx, { refusals: false, cues: false });
    ctx.game.commands.run("tower.build", {});
    ctx.game.notices.push("Hello");
    expect(ctx.game.notices.list().map((notice) => notice.text)).toEqual(["Hello"]);
    expect(played).toEqual([]);
  });
});

describe("remoteCommandSink", () => {
  test("a host refusal with a message is announced locally", async () => {
    const { ctx } = gameCtx();
    attachShellNotices(ctx);
    const backend: Pick<LiveGameBackend, "transport"> = {
      transport: {
        joinServer: async () => ({ serverId: "s1", isNew: true }),
        leaveServer: async () => {},
        runCommand: async () => ({ ok: false, reason: "insufficient-gold", message: "Needs 40 more gold" }),
      },
    };
    remoteCommandSink(backend, "s1", ctx.game.events).run("tower.build", {});
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(ctx.game.notices.list().map((notice) => notice.text)).toEqual(["Needs 40 more gold"]);
  });
});

describe("resolvePlayableAudio", () => {
  test("merges UI cues once per playable and honours uiCues: false", () => {
    const playable = { audio: { sounds: {} } } as unknown as PlayableGame;
    expect(resolvePlayableAudio(playable)).toBe(resolvePlayableAudio(playable));
    expect(resolvePlayableAudio(playable).sounds["ui.click"]?.bus).toBe("ui");
    const silent = { audio: { sounds: {}, uiCues: false } } as unknown as PlayableGame;
    expect(Object.keys(resolvePlayableAudio(silent).sounds).some((id) => id.startsWith("ui."))).toBe(false);
  });

  test("adds the default feel reactions and honours feedbackCues: false", () => {
    const playable = { audio: { sounds: {} } } as unknown as PlayableGame;
    const resolved = resolvePlayableAudio(playable);
    expect(resolved.sounds["feel.hit"]?.bus).toBe("sfx");
    expect(resolved.sounds["feel.wave"]?.bus).toBe("sfx");
    const quiet = { audio: { sounds: {}, feedbackCues: false } } as unknown as PlayableGame;
    expect(Object.keys(resolvePlayableAudio(quiet).sounds).some((id) => id.startsWith("feel."))).toBe(false);
  });

  test("a game sound replaces a default reaction and its bus survives both merges", () => {
    const playable = {
      audio: { sounds: { "feel.hit": { id: "feel.hit", bus: "sfx", url: "own-hit.ogg" } } },
    } as unknown as PlayableGame;
    const resolved = resolvePlayableAudio(playable);
    expect(resolved.sounds["feel.hit"]?.url).toBe("own-hit.ogg");
    expect(resolved.buses?.sfx).toEqual({ id: "sfx", gain: 0.9 });
    expect(resolved.buses?.ui).toEqual({ id: "ui", gain: 0.8 });
  });
});
