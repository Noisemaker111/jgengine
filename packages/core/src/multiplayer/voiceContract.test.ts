import { describe, expect, test } from "bun:test";

import { createLocalVoiceTransport, createPushToTalk } from "./voiceContract";

describe("createPushToTalk", () => {
  test("hold mode transmits only while the key is down", () => {
    const ptt = createPushToTalk();
    expect(ptt.status()).toBe("idle");
    expect(ptt.transmitting()).toBe(false);
    ptt.keyDown();
    expect(ptt.status()).toBe("keyed");
    expect(ptt.transmitting()).toBe(true);
    ptt.keyUp();
    expect(ptt.transmitting()).toBe(false);
  });

  test("toggle mode flips on keyDown and ignores keyUp", () => {
    const ptt = createPushToTalk({ mode: "toggle" });
    ptt.keyDown();
    ptt.keyUp();
    expect(ptt.transmitting()).toBe(true);
    ptt.keyDown();
    expect(ptt.transmitting()).toBe(false);
  });

  test("open mic is always transmitting unless muted", () => {
    const ptt = createPushToTalk({ mode: "openMic" });
    expect(ptt.status()).toBe("open");
    expect(ptt.transmitting()).toBe(true);
    ptt.setMuted(true);
    expect(ptt.transmitting()).toBe(false);
    expect(ptt.muted()).toBe(true);
    ptt.setMuted(false);
    expect(ptt.transmitting()).toBe(true);
  });

  test("mode switches reset keyed state and onChange fires on transitions only", () => {
    const transitions: boolean[] = [];
    const ptt = createPushToTalk({ onChange: (transmitting) => void transitions.push(transmitting) });
    ptt.keyDown();
    ptt.keyDown();
    ptt.setMode("toggle");
    expect(ptt.transmitting()).toBe(false);
    ptt.keyDown();
    ptt.setMode("openMic");
    expect(transitions).toEqual([true, false, true]);
    expect(ptt.transmitting()).toBe(true);
  });

  test("mute gates hold transmission without losing the keyed state", () => {
    const ptt = createPushToTalk();
    ptt.keyDown();
    ptt.setMuted(true);
    expect(ptt.status()).toBe("keyed");
    expect(ptt.transmitting()).toBe(false);
    ptt.setMuted(false);
    expect(ptt.transmitting()).toBe(true);
  });
});

describe("createLocalVoiceTransport", () => {
  test("join, publish, and leave drive the channel roster", async () => {
    const { transport } = createLocalVoiceTransport({ userId: "alice" });
    const rosters: string[][] = [];
    const unsubscribe = transport.subscribers("crew", (participants) =>
      void rosters.push(participants.map((participant) => participant.streamId ?? participant.userId)),
    );
    expect(rosters).toEqual([[]]);

    await transport.join("crew");
    await transport.publish("crew", "stream_1");
    await transport.leave("crew");
    expect(rosters).toEqual([[], ["alice"], ["stream_1"], []]);

    unsubscribe();
    await transport.join("crew", "stream_2");
    expect(rosters).toHaveLength(4);
  });

  test("publish before join is a no-op and channels are isolated", async () => {
    const { transport, participants } = createLocalVoiceTransport();
    await transport.publish("crew", "stream_1");
    expect(participants("crew")).toEqual([]);
    await transport.join("proximity", "stream_2");
    expect(participants("crew")).toEqual([]);
    expect(participants("proximity")).toEqual([{ userId: "local", streamId: "stream_2" }]);
  });
});
