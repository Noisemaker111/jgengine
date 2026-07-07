import { describe, expect, test } from "bun:test";

import { computeVoiceGain, createVoiceChannelRouter, type VoiceChannelDef } from "./voiceChannel";

const proximity: VoiceChannelDef = {
  id: "proximity",
  positional: true,
  falloff: { minDistance: 1, maxDistance: 10, curve: "linear" },
};

const walkie: VoiceChannelDef = { id: "walkie", positional: false };

describe("computeVoiceGain", () => {
  test("positional channel attenuates by distance", () => {
    expect(computeVoiceGain(proximity, 0)).toBe(1);
    expect(computeVoiceGain(proximity, 10)).toBe(0);
    expect(computeVoiceGain(proximity, 5.5)).toBeCloseTo(0.5, 5);
  });

  test("positional channel with no known distance is silent", () => {
    expect(computeVoiceGain(proximity, null)).toBe(0);
  });

  test("non-positional channel ignores distance entirely", () => {
    expect(computeVoiceGain(walkie, null)).toBe(1);
    expect(computeVoiceGain(walkie, 500)).toBe(1);
  });

  test("channel gain multiplier scales the result", () => {
    expect(computeVoiceGain({ ...walkie, gain: 0.5 }, null)).toBe(0.5);
  });
});

describe("createVoiceChannelRouter — proximity falloff", () => {
  test("resolves gain from shared positional channel distance", () => {
    const router = createVoiceChannelRouter([proximity]);
    router.join("alice", "proximity");
    router.join("bob", "proximity");
    router.updatePosition("alice", { x: 0, y: 0, z: 0 });
    router.updatePosition("bob", { x: 5.5, y: 0, z: 0 });

    const routes = router.resolveRoutes("alice");
    expect(routes).toEqual([{ fromUserId: "bob", channelId: "proximity", gain: 0.5 }]);
  });

  test("members outside the channel radius still resolve, just silent", () => {
    const router = createVoiceChannelRouter([proximity]);
    router.join("alice", "proximity");
    router.join("bob", "proximity");
    router.updatePosition("alice", { x: 0, y: 0, z: 0 });
    router.updatePosition("bob", { x: 100, y: 0, z: 0 });

    expect(router.resolveRoutes("alice")).toEqual([{ fromUserId: "bob", channelId: "proximity", gain: 0 }]);
  });

  test("never routes the listener's own voice back to them", () => {
    const router = createVoiceChannelRouter([proximity]);
    router.join("alice", "proximity");
    router.updatePosition("alice", { x: 0, y: 0, z: 0 });
    expect(router.resolveRoutes("alice")).toEqual([]);
  });

  test("a speaker not sharing any channel with the listener is not routed", () => {
    const router = createVoiceChannelRouter([proximity, walkie]);
    router.join("alice", "proximity");
    router.join("bob", "walkie");
    router.updatePosition("alice", { x: 0, y: 0, z: 0 });
    router.updatePosition("bob", { x: 0, y: 0, z: 0 });
    expect(router.resolveRoutes("alice")).toEqual([]);
  });
});

describe("createVoiceChannelRouter — simultaneous non-positional channels", () => {
  test("a crew channel and a proximity channel are both active at once, as independent routes", () => {
    const router = createVoiceChannelRouter([proximity, walkie]);
    router.join("alice", "proximity");
    router.join("alice", "walkie");
    router.join("bob", "proximity");
    router.join("bob", "walkie");
    router.updatePosition("alice", { x: 0, y: 0, z: 0 });
    router.updatePosition("bob", { x: 100, y: 0, z: 0 });

    const routes = router.resolveRoutes("alice");
    expect(routes).toHaveLength(2);
    expect(routes).toContainEqual({ fromUserId: "bob", channelId: "proximity", gain: 0 });
    expect(routes).toContainEqual({ fromUserId: "bob", channelId: "walkie", gain: 1 });
  });

  test("leaving a channel drops only that channel's route", () => {
    const router = createVoiceChannelRouter([proximity, walkie]);
    router.join("alice", "proximity");
    router.join("alice", "walkie");
    router.join("bob", "proximity");
    router.join("bob", "walkie");
    router.updatePosition("alice", { x: 0, y: 0, z: 0 });
    router.updatePosition("bob", { x: 0, y: 0, z: 0 });

    router.leave("bob", "walkie");
    const routes = router.resolveRoutes("alice");
    expect(routes).toEqual([{ fromUserId: "bob", channelId: "proximity", gain: 1 }]);
  });

  test("muting a speaker silences every channel route from them", () => {
    const router = createVoiceChannelRouter([proximity, walkie]);
    router.join("alice", "proximity");
    router.join("bob", "proximity");
    router.updatePosition("alice", { x: 0, y: 0, z: 0 });
    router.updatePosition("bob", { x: 0, y: 0, z: 0 });
    router.setMuted("bob", true);

    expect(router.resolveRoutes("alice")).toEqual([]);
  });

  test("leaveAll removes every membership for a user", () => {
    const router = createVoiceChannelRouter([proximity, walkie]);
    router.join("bob", "proximity");
    router.join("bob", "walkie");
    router.leaveAll("bob");
    expect(router.channelsOf("bob")).toEqual([]);
  });

  test("registerChannel can add channels after construction", () => {
    const router = createVoiceChannelRouter();
    router.registerChannel(walkie);
    router.join("alice", "walkie");
    router.join("bob", "walkie");
    expect(router.resolveRoutes("alice")).toEqual([{ fromUserId: "bob", channelId: "walkie", gain: 1 }]);
  });
});
