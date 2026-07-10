import { describe, expect, test } from "bun:test";
import { SAMPLE_RATE, renderTones, synthWavDataUri, wavBytes } from "./synth";

describe("audio synth", () => {
  test("renders the requested duration", () => {
    const samples = renderTones([{ seconds: 0.5, startFreq: 440 }]);
    expect(samples.length).toBe(Math.ceil(0.5 * SAMPLE_RATE));
  });

  test("layers with offsets extend the buffer", () => {
    const samples = renderTones([
      { seconds: 0.1, startFreq: 440 },
      { seconds: 0.1, startFreq: 660, at: 0.2 },
    ]);
    expect(samples.length).toBe(Math.ceil(0.3 * SAMPLE_RATE));
  });

  test("wav bytes carry a valid RIFF/WAVE header", () => {
    const bytes = wavBytes(renderTones([{ seconds: 0.1, startFreq: 440 }]));
    const ascii = (start: number, length: number) =>
      String.fromCharCode(...bytes.slice(start, start + length));
    expect(ascii(0, 4)).toBe("RIFF");
    expect(ascii(8, 4)).toBe("WAVE");
    expect(ascii(36, 4)).toBe("data");
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(24, true)).toBe(SAMPLE_RATE);
    expect(view.getUint16(22, true)).toBe(1);
  });

  test("data uri is deterministic and browser-decodable shape", () => {
    const a = synthWavDataUri([{ seconds: 0.05, startFreq: 300, wave: "noise" }]);
    const b = synthWavDataUri([{ seconds: 0.05, startFreq: 300, wave: "noise" }]);
    expect(a).toBe(b);
    expect(a.startsWith("data:audio/wav;base64,")).toBe(true);
    const decoded = Buffer.from(a.slice("data:audio/wav;base64,".length), "base64");
    expect(decoded.subarray(0, 4).toString("ascii")).toBe("RIFF");
  });

  test("samples stay clamped to [-1, 1]", () => {
    const samples = renderTones([
      { seconds: 0.05, startFreq: 200, gain: 3 },
      { seconds: 0.05, startFreq: 210, gain: 3 },
    ]);
    for (const value of samples) {
      expect(value).toBeLessThanOrEqual(1);
      expect(value).toBeGreaterThanOrEqual(-1);
    }
  });
});
