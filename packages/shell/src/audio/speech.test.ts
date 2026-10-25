import { describe, expect, test } from "bun:test";

import { createSpeechChannel, pickSpeechVoice, type SpeechUtteranceLike, type SpeechVoiceLike } from "./speech";

const voices: SpeechVoiceLike[] = [
  { name: "Daniel", lang: "en-GB" },
  { name: "Samantha", lang: "en-US" },
  { name: "Alex", lang: "en-US" },
  { name: "Amelie", lang: "fr-FR" },
];

function backend(list: SpeechVoiceLike[]) {
  const spoken: SpeechUtteranceLike[] = [];
  let cancels = 0;
  class Utterance implements SpeechUtteranceLike {
    voice: SpeechVoiceLike | null = null;
    volume = 1;
    pitch = 1;
    rate = 1;
    lang = "";
    constructor(public text: string) {}
  }
  return {
    spoken,
    cancels: () => cancels,
    backend: {
      synth: { speak: (u: SpeechUtteranceLike) => spoken.push(u), cancel: () => { cancels += 1; }, getVoices: () => list },
      Utterance,
    },
  };
}

describe("speech channel", () => {
  test("a name hint wins, otherwise a voice key keeps the same voice in the language", () => {
    expect(pickSpeechVoice(voices, { name: "dan" })?.name).toBe("Daniel");
    const first = pickSpeechVoice(voices, { voiceKey: "dj-luna" });
    expect(pickSpeechVoice(voices, { voiceKey: "dj-luna" })).toBe(first);
    expect(first?.lang.startsWith("en")).toBe(true);
    expect(pickSpeechVoice(voices, { lang: "fr" })?.name).toBe("Amelie");
    expect(pickSpeechVoice([], {})).toBeNull();
  });

  test("speaks at the given volume with clamped pitch and rate, and stop cancels", () => {
    const fake = backend(voices);
    const channel = createSpeechChannel(fake.backend);
    channel.speak("Traffic on Canal Row.", { voiceKey: "news", pitch: 5, rate: 0.9 }, 0.4);
    expect(fake.spoken).toHaveLength(1);
    expect(fake.spoken[0]).toMatchObject({ text: "Traffic on Canal Row.", volume: 0.4, pitch: 2, rate: 0.9 });
    channel.stop();
    expect(fake.cancels()).toBe(1);
    expect(channel.stats()).toMatchObject({ available: true, voices: 4, spoken: 1, dropped: 0, last: "Traffic on Canal Row." });
  });

  test("falls back to silence with no synthesiser, no voice or a muted bus", () => {
    const none = createSpeechChannel(null);
    none.speak("Hello", undefined, 1);
    none.stop();
    expect(none.stats()).toMatchObject({ available: false, spoken: 0, dropped: 1, last: "Hello" });
    const empty = backend([]);
    const voiceless = createSpeechChannel(empty.backend);
    voiceless.speak("Hello", undefined, 1);
    expect(empty.spoken).toHaveLength(0);
    const muted = backend(voices);
    const quiet = createSpeechChannel(muted.backend);
    quiet.speak("Hello", undefined, 0);
    expect(muted.spoken).toHaveLength(0);
    expect(quiet.stats().dropped).toBe(1);
  });
});
