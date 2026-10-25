import { describe, expect, test } from "bun:test";

import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { createDrivingAudio, type DrivingAudioParams } from "./driving";

function recorder() {
  const loops = new Map<string, { gain?: number; rate?: number }>();
  const played: string[] = [];
  const ctx = {
    game: {
      audio: {
        loop: () => {},
        setLoop: (id: string, params: { gain?: number; rate?: number }) => void loops.set(id, params),
        play: (id: string) => void played.push(id),
        stopLoop: (id: string) => void loops.delete(id),
      },
    },
  } as unknown as GameContext;
  return { ctx, loops, played };
}

const AT: DrivingAudioParams = { position: [0, 0, 0], throttle: 1, normRpm: 0.5, slip: 0, wheelspin: false, speed: 20, gear: 2 };

describe("harbor-heat driving audio", () => {
  test("the squeal stays silent on grip and fades in as the tyres slide", () => {
    const { ctx, loops } = recorder();
    const audio = createDrivingAudio();
    audio.tick(ctx, { ...AT, slip: 0.3 });
    expect(loops.get("vi_squeal")!.gain).toBe(0);
    audio.tick(ctx, { ...AT, slip: 0.8 });
    const mid = loops.get("vi_squeal")!.gain!;
    expect(mid).toBeGreaterThan(0);
    audio.tick(ctx, { ...AT, slip: 1 });
    expect(loops.get("vi_squeal")!.gain).toBeGreaterThan(mid);
  });

  test("a gear change clicks once, and the engine pitch climbs with rpm", () => {
    const { ctx, loops, played } = recorder();
    const audio = createDrivingAudio();
    audio.tick(ctx, { ...AT, normRpm: 0.2 });
    const low = loops.get("vi_engine")!.rate!;
    audio.tick(ctx, { ...AT, normRpm: 0.9 });
    expect(loops.get("vi_engine")!.rate!).toBeGreaterThan(low);
    expect(played).toEqual([]);
    audio.tick(ctx, { ...AT, gear: 3 });
    expect(played).toEqual(["shift_click"]);
  });
});
