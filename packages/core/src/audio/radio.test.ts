import { describe, expect, test } from "bun:test";

import { createRadio, estimateSpeechSeconds, type RadioDef } from "./radio";
import { createRadioPlayback, type RadioAudioSink } from "./radioPlayback";

function def(overrides: Partial<RadioDef> = {}): RadioDef {
  return {
    seed: "test",
    initial: "wave",
    stations: [
      {
        id: "wave",
        name: "Wave",
        frequency: "94.7",
        kind: "music",
        voice: "dj",
        pattern: ["song", "dj", "song", "ad"],
        segments: [
          { id: "s1", kind: "song", title: "One", theme: "t1", seconds: 20 },
          { id: "s2", kind: "song", title: "Two", theme: "t2", seconds: 20 },
          { id: "s3", kind: "song", title: "Three", theme: "t3", seconds: 20 },
          { id: "d1", kind: "dj", title: "Link", lines: ["You are listening to Wave."] },
          { id: "a1", kind: "ad", title: "Pawn", lines: [{ text: "Gold for cash.", voice: "ad" }] },
        ],
      },
      {
        id: "news",
        name: "News",
        frequency: "101.1",
        kind: "news",
        bed: "sting",
        bulletins: { intro: ["This just in."], breakIn: 3 },
        segments: [{ id: "n1", kind: "news", title: "Weather", lines: ["Sunny all week.", "Back after this."] }],
      },
      {
        id: "quiet",
        name: "Quiet",
        frequency: "88.1",
        kind: "music",
        bulletins: false,
        segments: [{ id: "q1", kind: "song", title: "Hush", theme: "t4", seconds: 15 }],
      },
    ],
    ...overrides,
  };
}

function run(radio: ReturnType<typeof createRadio>, seconds: number, step = 0.25) {
  const cues = [];
  for (let t = 0; t < seconds; t += step) cues.push(...radio.tick(step));
  return cues;
}

describe("createRadio", () => {
  test("follows the running order by kind and never repeats a song back to back", () => {
    const radio = createRadio(def());
    const kinds: string[] = [];
    const songs: string[] = [];
    for (const cue of run(radio, 600)) {
      if (cue.kind !== "segment" || cue.station !== "wave") continue;
      kinds.push(cue.segment.kind);
      if (cue.segment.kind === "song") songs.push(cue.segment.id);
    }
    expect(kinds.length).toBeGreaterThan(8);
    // The pattern song, dj, song, ad repeats, whatever offset the station started at.
    for (let i = 0; i + 1 < kinds.length; i++) {
      if (kinds[i] === "dj" || kinds[i] === "ad") expect(kinds[i + 1]).toBe("song");
    }
    for (let i = 0; i + 1 < songs.length; i++) expect(songs[i]).not.toBe(songs[i + 1]);
    expect(new Set(songs).size).toBe(3);
  });

  test("untuned stations keep broadcasting, so tuning back lands mid-programme", () => {
    const radio = createRadio(def());
    radio.tick(0);
    const before = radio.station("news")!;
    run(radio, 7);
    const after = radio.station("news")!;
    expect(after.segment.id !== before.segment.id || after.elapsed > before.elapsed).toBe(true);
    radio.tune("news");
    const [cue] = radio.tick(0);
    expect(cue?.kind).toBe("segment");
    if (cue?.kind === "segment") {
      expect(cue.station).toBe("news");
      expect(cue.offset).toBeCloseTo(radio.station("news")!.elapsed, 5);
    }
  });

  test("lines are cued once each, only for the station being listened to", () => {
    const radio = createRadio(def({ initial: "news" }));
    const lines = run(radio, 60).filter((cue) => cue.kind === "line");
    const texts = lines.map((cue) => (cue.kind === "line" ? cue.line.text : ""));
    expect(texts.every((text) => text === "Sunny all week." || text === "Back after this.")).toBe(true);
    expect(lines.every((cue) => cue.kind === "line" && cue.station === "news")).toBe(true);
    const counts = new Map<string, number>();
    for (const text of texts) counts.set(text, (counts.get(text) ?? 0) + 1);
    expect(Math.abs((counts.get("Sunny all week.") ?? 0) - (counts.get("Back after this.") ?? 0))).toBeLessThanOrEqual(1);
  });

  test("bulletins queue by priority, honour topic cooldowns and skip stations that refuse news", () => {
    const radio = createRadio(def());
    expect(radio.report({ topic: "shots", priority: 1, lines: ["Shots fired."] })).toBe(true);
    expect(radio.report({ topic: "shots", priority: 1, lines: ["More shots."] })).toBe(false);
    expect(radio.cooldown("shots")).toBe(60);
    expect(radio.report({ topic: "turf", priority: 2, lines: ["Turf lost."], byStation: { wave: ["DJ: the Marina changed hands!"] } })).toBe(true);
    expect(radio.queued("wave")).toBe(2);
    expect(radio.queued("quiet")).toBe(0);
    const bulletins = run(radio, 120)
      .filter((cue) => cue.kind === "segment" && cue.station === "wave" && cue.segment.kind === "bulletin")
      .map((cue) => (cue.kind === "segment" ? cue.segment : null)!);
    expect(bulletins.map((segment) => segment.topic)).toEqual(["turf", "shots"]);
    expect(bulletins[0]!.lines.map((line) => line.text)).toEqual(["DJ: the Marina changed hands!"]);
    expect(radio.cooldown("shots")).toBe(0);
    expect(radio.report({ topic: "shots", lines: ["Shots again."] })).toBe(true);
  });

  test("a high-priority bulletin breaks in on a station that allows it", () => {
    const radio = createRadio(def({ initial: "news" }));
    radio.tick(0.1);
    radio.report({ topic: "chase", priority: 3, title: "Breaking", lines: ["Five-star chase downtown."] });
    const cues = radio.tick(0);
    expect(cues[0]).toMatchObject({ kind: "segment", station: "news", offset: 0 });
    expect(cues[1]).toMatchObject({ kind: "line", line: { text: "This just in." } });
    expect(radio.nowPlaying()).toMatchObject({ segment: { kind: "bulletin", title: "Breaking" }, line: "This just in." });
    // Wave does not allow break-in, so it reads the same story at its next boundary.
    expect(radio.station("wave")!.segment.kind).not.toBe("bulletin");
    expect(radio.queued("wave")).toBe(1);
  });

  test("stale bulletins expire unread and the queue is bounded", () => {
    const radio = createRadio(def({ bulletinTtl: 5 }));
    radio.tune("quiet");
    for (let i = 0; i < 6; i++) radio.report({ topic: `t${i}`, priority: i, lines: ["x"], cooldown: 0 });
    expect(radio.queued("wave")).toBe(4);
    radio.tick(6);
    expect(radio.queued("wave")).toBe(0);
  });

  test("dial steps wrap, power off keeps the station and the now-playing view follows", () => {
    const radio = createRadio(def());
    expect(radio.step(1)).toBe("news");
    expect(radio.step(1)).toBe("quiet");
    expect(radio.step(1)).toBe("wave");
    expect(radio.step(-1)).toBe("quiet");
    radio.tick(0);
    radio.power(false);
    expect(radio.tick(0)).toEqual([{ kind: "off" }]);
    expect(radio.tuned()).toBeNull();
    expect(radio.nowPlaying()).toBeNull();
    expect(radio.dial()).toBe("quiet");
    radio.power(true);
    expect(radio.tick(0)[0]).toMatchObject({ kind: "segment", station: "quiet" });
    expect(radio.nowPlaying()!.station).toEqual({ id: "quiet", name: "Quiet", frequency: "88.1", kind: "music" });
  });

  test("snapshot and restore resume the exact broadcast", () => {
    const a = createRadio(def());
    run(a, 33);
    a.report({ topic: "shots", lines: ["Shots fired."] });
    a.tune("news");
    a.tick(0);
    const saved = JSON.parse(JSON.stringify(a.snapshot()));
    const b = createRadio(def());
    b.restore(saved);
    expect(b.tuned()).toBe("news");
    expect(b.cooldown("shots")).toBe(a.cooldown("shots"));
    const ra = run(a, 90).map((cue) => JSON.stringify(cue));
    const rb = run(b, 90).map((cue) => JSON.stringify(cue));
    expect(rb).toEqual(ra);
  });

  test("retune changes how long new lines take", () => {
    const radio = createRadio(def());
    expect(estimateSpeechSeconds("one two three four five six", 2)).toBe(3);
    radio.retune({ wordsPerSecond: 1, lineGap: 0 });
    radio.report({ topic: "x", lines: ["one two three four"] });
    const bulletin = run(radio, 120).find((cue) => cue.kind === "segment" && cue.station === "wave" && cue.segment.kind === "bulletin");
    expect(bulletin?.kind === "segment" ? bulletin.segment.seconds : 0).toBe(4);
  });

  test("rejects an empty dial", () => {
    expect(() => createRadio({ stations: [] })).toThrow();
  });
});

describe("createRadioPlayback", () => {
  function sink() {
    const calls: string[] = [];
    const audio: RadioAudioSink = {
      music: (theme, transpose, options) => calls.push(`music ${theme} ${transpose ?? 0} ${options?.offset?.toFixed(1) ?? "-"}`),
      speak: (text, options) => calls.push(`speak ${text} ${options?.voiceKey ?? "-"} ${options?.pitch ?? 1}`),
      stopSpeech: () => calls.push("hush"),
    };
    return { calls, audio };
  }

  test("plays songs at the station offset and speaks lines in mapped voices", () => {
    const radio = createRadio(def({ initial: "news" }));
    const { calls, audio } = sink();
    const playback = createRadioPlayback(radio, audio, { voices: { ad: { pitch: 1.4 } } });
    radio.cueCurrent();
    playback.tick(0);
    expect(calls[0]).toBe("hush");
    expect(calls[1]).toMatch(/^music sting 0 \d+\.\d$/);
    calls.length = 0;
    for (let i = 0; i < 400; i++) playback.tick(0.1);
    expect(calls.some((call) => call.startsWith("speak Sunny all week."))).toBe(true);
    expect(playback.spoken()).toBeGreaterThan(0);
    radio.tune("wave");
    calls.length = 0;
    for (let i = 0; i < 1200; i++) playback.tick(0.1);
    expect(calls.some((call) => call === "speak Gold for cash. ad 1.4")).toBe(true);
    expect(calls.some((call) => /^music t[123] 0/.test(call))).toBe(true);
  });

  test("pause silences without moving the clock and resume re-cues mid-segment", () => {
    const radio = createRadio(def());
    const { calls, audio } = sink();
    const playback = createRadioPlayback(radio, audio);
    playback.tick(1);
    const at = radio.nowPlaying()!.elapsed;
    playback.pause();
    expect(calls.slice(-2)).toEqual(["hush", "music null 0 -"]);
    playback.tick(5);
    expect(radio.nowPlaying()!.elapsed).toBe(at);
    calls.length = 0;
    playback.resume();
    const segment = radio.nowPlaying()!;
    expect(calls).toContain("hush");
    if (segment.segment.kind === "song") expect(calls).toContain(`music t${segment.segment.id.slice(1)} 0 ${at.toFixed(1)}`);
  });

  test("power off stops music and speech", () => {
    const radio = createRadio(def());
    const { calls, audio } = sink();
    const playback = createRadioPlayback(radio, audio);
    playback.tick(0.1);
    calls.length = 0;
    radio.power(false);
    playback.tick(0.1);
    expect(calls).toEqual(["hush", "music null 0 -"]);
    expect(playback.last()).toEqual({ kind: "off" });
  });
  test("snapshot and restore carry pause and the spoken count, and an unpaused restore re-cues", () => {
    const radio = createRadio(def({ initial: "news" }));
    const { calls, audio } = sink();
    const playback = createRadioPlayback(radio, audio);
    for (let i = 0; i < 400; i++) playback.tick(0.1);
    playback.pause();
    const saved = playback.snapshot();
    expect(saved.paused).toBe(true);
    expect(saved.spoken).toBeGreaterThan(0);
    expect(JSON.parse(JSON.stringify(saved))).toEqual(saved);

    const copy = createRadioPlayback(radio, sink().audio);
    copy.restore(saved);
    expect(copy.paused()).toBe(true);
    expect(copy.spoken()).toBe(saved.spoken);

    calls.length = 0;
    playback.restore({ paused: false, spoken: 2 });
    expect(playback.paused()).toBe(false);
    expect(playback.spoken()).toBeGreaterThanOrEqual(2);
    expect(calls.slice(0, 2)).toEqual(["hush", "music null 0 -"]);
    expect(calls.length).toBeGreaterThan(2);
  });
});
