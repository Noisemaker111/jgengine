import { describe, expect, test } from "bun:test";

import { feedbackCueSoundId } from "@jgengine/core/audio/feedbackCues";
import { ACCESSIBILITY_SETTING_IDS, readAccessibilitySettings } from "@jgengine/core/settings/accessibilitySettings";
import { createSettingsStore } from "@jgengine/core/settings/settingsModel";
import { createGameEvents, type GameEventMap } from "@jgengine/core/game/events";
import type { WaveRunner } from "@jgengine/core/ai/waveRunner";

import {
  attachEventFeedback,
  attachWaveFeedback,
  createEventFeedback,
  DEFAULT_FEEDBACK_BINDINGS,
  type EventFeedback,
  type FeedbackDeps,
} from "./eventFeedback";
import { createHapticsRoute } from "./hapticsRoute";

function harness(overrides: Partial<FeedbackDeps> = {}) {
  let t = 0;
  const played: string[] = [];
  const positions: (readonly [number, number, number] | undefined)[] = [];
  const shakes: number[] = [];
  const pulses: { strong: number; weak: number; ms: number }[] = [];
  const captions: string[] = [];
  const deps: FeedbackDeps = {
    play: (sound, position) => {
      played.push(sound);
      positions.push(position);
    },
    shake: (amount) => shakes.push(amount),
    haptics: (pulse) => pulses.push(pulse),
    caption: (text) => captions.push(text),
    localUserId: () => "me",
    localEntityId: () => "me",
    motionScale: () => 1,
    now: () => t,
    ...overrides,
  };
  return { deps, played, positions, shakes, pulses, captions, advance: (ms: number) => { t += ms; } };
}

const damage = (target: string, amount: number): GameEventMap["combat.damage"] => ({
  target,
  type: "kinetic",
  amount,
  absorbed: 0,
  remaining: 100 - amount,
  lethal: false,
});

const died = (instanceId: string, displayName?: string): GameEventMap["entity.died"] => ({
  instanceId,
  catalogId: "raider",
  displayName,
  reason: { kind: "player_kill", killerUserId: "me" },
  position: [0, 0, 0],
});

describe("event feedback mapping", () => {
  test("damage to the local player reads as hurt, damage elsewhere as a hit", () => {
    const h = harness();
    const feedback = createEventFeedback(h.deps);
    expect(feedback.handle("combat.damage", damage("me", 12))).toBe("hurt");
    h.advance(200);
    expect(feedback.handle("combat.damage", damage("raider-1", 7))).toBe("hit");
    expect(h.played).toEqual([feedbackCueSoundId("hurt"), feedbackCueSoundId("hit")]);
    expect(h.captions[0]).toBe("Hurt 12");
    expect(h.captions[1]).toBe("Hit 7");
  });

  test("death, pickup, objective, level and refusal each reach their default cue", () => {
    const h = harness();
    const feedback = createEventFeedback(h.deps);
    h.advance(200);
    expect(feedback.handle("entity.died", died("raider-1", "Raider"))).toBe("kill");
    h.advance(200);
    expect(feedback.handle("worldItem.picked_up", { instanceId: "drop", userId: "me", itemId: "iron", rarity: "common", count: 2 })).toBe("pickup");
    h.advance(600);
    expect(feedback.handle("quest.completed", { userId: "me", questId: "intro" })).toBe("objective");
    h.advance(600);
    expect(feedback.handle("stat.levelUp", { userId: "me", stat: "mining", level: 3 })).toBe("objective");
    h.advance(600);
    expect(feedback.handle("command.refused", { command: "build", reason: "no-gold", message: "Needs 40 gold", actor: null })).toBe("deny");
    expect(h.played).toEqual([
      feedbackCueSoundId("kill"),
      feedbackCueSoundId("pickup"),
      feedbackCueSoundId("objective"),
      feedbackCueSoundId("objective"),
      feedbackCueSoundId("deny"),
    ]);
    expect(h.captions).toContain("Enemy down Raider");
    expect(h.captions).toContain("Picked up iron x2");
    expect(h.captions).toContain("Not possible Needs 40 gold");
  });

  test("another player's pickup and quest do not react on the local player's behalf", () => {
    const h = harness();
    const feedback = createEventFeedback(h.deps);
    expect(feedback.handle("worldItem.picked_up", { instanceId: "drop", userId: "them", itemId: "iron", rarity: "common", count: 1 })).toBeNull();
    expect(feedback.handle("quest.completed", { userId: "them", questId: "intro" })).toBeNull();
    expect(h.played).toEqual([]);
  });

  test("a burst inside one cooldown plays once and counts the rest", () => {
    const h = harness();
    const feedback = createEventFeedback(h.deps);
    for (let index = 0; index < 4; index += 1) {
      feedback.handle("combat.damage", damage("raider-1", 3));
      h.advance(10);
    }
    expect(h.played).toHaveLength(1);
    expect(feedback.suppressed("hit")).toBe(3);
    h.advance(200);
    feedback.handle("combat.damage", damage("raider-1", 3));
    expect(h.played).toHaveLength(2);
  });

  test("maps an event to the same pooled reaction object every time - no per-event allocation", () => {
    const h = harness();
    const feedback = createEventFeedback(h.deps);
    const event = damage("raider-1", 9);
    const first = feedback.resolve("combat.damage", event);
    expect(first).not.toBeNull();
    for (let index = 0; index < 500; index += 1) {
      expect(feedback.resolve("combat.damage", event)).toBe(first);
    }
    expect(first!.sound).toBe(feedbackCueSoundId("hit"));
    expect(feedback.resolve("quest.completed", { userId: "them", questId: "other" })).toBeNull();
  });

  test("the mapping is data a game can replace", () => {
    const h = harness();
    const feedback = createEventFeedback(h.deps, {
      bindings: [{ event: "entity.died", cue: "deny", caption: "That one got away" }, ...DEFAULT_FEEDBACK_BINDINGS],
      reactions: { deny: { sound: "game.custom-deny", caption: "Nope" } },
    });
    expect(feedback.handle("entity.died", died("raider-1"))).toBe("deny");
    expect(h.played).toEqual(["game.custom-deny"]);
    expect(h.captions).toEqual(["That one got away"]);
  });

  test("reduced motion keeps the sound and the rumble but drops the camera kick", () => {
    const h = harness();
    const feedback = createEventFeedback(h.deps);
    expect(feedback.handle("combat.damage", damage("me", 10))).toBe("hurt");
    expect(h.shakes).toHaveLength(1);
    feedback.reset();
    const still = harness({ motionScale: () => 0 });
    createEventFeedback(still.deps).handle("combat.damage", damage("me", 10));
    expect(still.played).toHaveLength(1);
    expect(still.pulses).toHaveLength(1);
    expect(still.shakes).toHaveLength(0);
  });
});

describe("spatial cues and haptics routing", () => {
  test("a positioned damage event plays its cue at that spot; one without a position plays centred", () => {
    const h = harness();
    const feedback = createEventFeedback(h.deps);
    feedback.handle("combat.damage", { ...damage("raider-1", 8), position: [7, 1, -3] });
    h.advance(200);
    feedback.handle("combat.damage", damage("raider-1", 8));
    expect(h.played).toEqual([feedbackCueSoundId("hit"), feedbackCueSoundId("hit")]);
    expect(h.positions).toEqual([[7, 1, -3], undefined]);
  });

  test("a connected gamepad takes the pulse and the phone stays quiet", () => {
    const pads = [{ connected: true, vibrationActuator: {} }] as unknown as ArrayLike<Gamepad | null>;
    const delivered: string[] = [];
    const vibrations: number[] = [];
    const route = createHapticsRoute(
      (pulse) => delivered.push(`pad:${pulse.ms}`),
      { gamepads: () => pads, vibrate: (ms) => vibrations.push(ms), events: null },
    );
    const h = harness({ haptics: (pulse) => { route.deliver(pulse); } });
    createEventFeedback(h.deps).handle("combat.damage", damage("me", 10));
    expect(delivered).toEqual(["pad:140"]);
    expect(vibrations).toEqual([]);
    expect(h.played).toEqual([feedbackCueSoundId("hurt")]);
  });

  test("a phone with no gamepad vibrates, and reduced motion drops the shake but not the sound", () => {
    const vibrations: number[] = [];
    const route = createHapticsRoute(
      () => { throw new Error("no pad should take the pulse"); },
      { gamepads: () => [], vibrate: (ms) => vibrations.push(ms), events: null },
    );
    const h = harness({ haptics: (pulse) => { route.deliver(pulse); }, motionScale: () => 0 });
    expect(createEventFeedback(h.deps).handle("combat.damage", damage("me", 10))).toBe("hurt");
    expect(vibrations).toEqual([140]);
    expect(h.played).toEqual([feedbackCueSoundId("hurt")]);
    expect(h.shakes).toEqual([]);
  });

  test("a pad that connects later takes the pulse from the phone", () => {
    let pads: Gamepad[] = [];
    const listeners = new Map<string, () => void>();
    const events = {
      addEventListener: (name: string, listener: () => void) => listeners.set(name, listener),
      removeEventListener: (name: string) => listeners.delete(name),
    };
    const delivered: string[] = [];
    const vibrations: number[] = [];
    const route = createHapticsRoute(
      (pulse) => delivered.push(`pad:${pulse.ms}`),
      { gamepads: () => pads, vibrate: (ms) => vibrations.push(ms), events },
    );
    const pulse = { strong: 0.2, weak: 0.3, ms: 70 };
    expect(route.deliver(pulse)).toBe("vibration");
    pads = [{ connected: true, vibrationActuator: {} } as unknown as Gamepad];
    listeners.get("gamepadconnected")?.();
    expect(route.deliver(pulse)).toBe("gamepad");
    expect(delivered).toEqual(["pad:70"]);
    expect(vibrations).toEqual([70]);
    route.dispose();
    expect(listeners.size).toBe(0);
  });

  test("a device with neither a pad nor a vibration motor does nothing and does not throw", () => {
    const route = createHapticsRoute(
      () => { throw new Error("unreachable"); },
      { gamepads: () => [], vibrate: null, events: null },
    );
    expect(route.deliver({ strong: 0.4, weak: 0.2, ms: 90 })).toBe("none");
  });
});

describe("captions follow the accessibility setting", () => {  test("off by default, on when the setting turns on, quiet again when it turns off", () => {
    const store = createSettingsStore(null);
    const h = harness();
    const feedback = createEventFeedback(h.deps, { captions: readAccessibilitySettings(store).state.captions });

    feedback.handle("combat.damage", damage("raider-1", 5));
    expect(h.captions).toEqual([]);

    store.set(ACCESSIBILITY_SETTING_IDS.captions, true);
    feedback.retune({ captions: readAccessibilitySettings(store).state.captions });
    h.advance(200);
    feedback.handle("combat.damage", damage("raider-1", 5));
    expect(h.captions).toEqual(["Hit 5"]);

    store.set(ACCESSIBILITY_SETTING_IDS.captions, false);
    feedback.retune({ captions: readAccessibilitySettings(store).state.captions });
    h.advance(200);
    feedback.handle("combat.damage", damage("raider-1", 5));
    expect(h.captions).toEqual(["Hit 5"]);
    expect(h.played).toHaveLength(3);
  });
});

describe("attachEventFeedback and attachWaveFeedback", () => {
  test("subscribes to announced events and detaches cleanly", () => {
    const events = createGameEvents();
    const h = harness();
    const detach = attachEventFeedback(events, createEventFeedback(h.deps));
    events.emit("combat.damage", damage("raider-1", 4));
    expect(h.played).toEqual([feedbackCueSoundId("hit")]);
    detach();
    h.advance(200);
    events.emit("combat.damage", damage("raider-1", 4));
    expect(h.played).toHaveLength(1);
  });

  test("a wave boundary announces the wave cue once per crossing", () => {
    const h = harness();
    const feedback = createEventFeedback(h.deps);
    let wave = 0;
    const listeners = new Set<() => void>();
    const runner = {
      state: () => ({ wave }) as ReturnType<WaveRunner["state"]>,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    const detach = attachWaveFeedback(runner, { cue: (cue, caption) => feedback.notify(cue, caption) });
    for (const listener of listeners) listener();
    expect(h.played).toEqual([]);

    wave = 1;
    for (const listener of listeners) listener();
    h.advance(2000);
    wave = 2;
    for (const listener of listeners) listener();
    expect(h.played).toEqual([feedbackCueSoundId("wave"), feedbackCueSoundId("wave")]);
    expect(h.captions).toEqual(["Wave 2", "Wave 3"]);
    detach();
    expect(listeners.size).toBe(0);
  });

  test("a game announces its own moment through notify", () => {
    const h = harness();
    const feedback: EventFeedback = createEventFeedback(h.deps);
    expect(feedback.notify("wave", "WAVE 3")).toBe(true);
    expect(h.captions).toEqual(["WAVE 3"]);
    expect(feedback.notify("wave", "WAVE 4")).toBe(false);
    expect(feedback.suppressed("wave")).toBe(1);
  });
});
