import { describe, expect, it } from "bun:test";

import { MOOD_PRESETS, resolveMood } from "./lookMood";

const DEG = 180 / Math.PI;

function bearingOf(position: readonly [number, number, number]): { azimuth: number; elevation: number } {
  const [x, y, z] = position;
  const azimuth = (Math.atan2(x, -z) * DEG + 360) % 360;
  return { azimuth, elevation: Math.atan2(y, Math.hypot(x, z)) * DEG };
}

describe("resolveMood", () => {
  it("every preset lights a scene: a shadowed key that agrees with the dome's sun, fill, haze and grade", () => {
    for (const preset of MOOD_PRESETS) {
      const mood = resolveMood(preset);
      const key = mood.lighting.directional?.[0];
      expect(key?.castShadow).toBe(true);
      expect(key?.cascades).toBe(3);
      const bearing = bearingOf(key!.position!);
      expect(bearing.azimuth).toBeCloseTo(mood.sky.sun!.azimuth!, 5);
      expect(bearing.elevation).toBeCloseTo(mood.sky.sun!.elevation!, 5);
      expect(mood.sky.sunColor).toBe(key!.color);
      expect(mood.lighting.hemisphere?.intensity).toBeGreaterThan(0);
      expect(mood.fog?.color).toBe(mood.sky.fogColor);
      expect(mood.postProcessing.grade).toBeDefined();
    }
  });

  it("night uses the night dome; the rest paint a day dome", () => {
    expect(resolveMood("night").sky.preset).toBe("night");
    expect(resolveMood("dusk").sky.preset).toBe("day");
  });

  it("tokens override the preset", () => {
    const mood = resolveMood({ preset: "golden", sun: { azimuth: 90, intensity: 4 }, skyColor: "#112233", horizonColor: "#445566", groundColor: "#778899", fog: { far: 300 }, exposure: 0.7, saturation: 1.4 });
    const key = mood.lighting.directional![0]!;
    expect(key.intensity).toBe(4);
    expect(bearingOf(key.position!).azimuth).toBeCloseTo(90, 5);
    expect(mood.sky).toMatchObject({ zenithColor: "#112233", horizonColor: "#445566", fogColor: "#445566" });
    expect(mood.lighting.hemisphere).toMatchObject({ skyColor: "#112233", groundColor: "#778899" });
    expect(mood.fog).toMatchObject({ color: "#445566", far: 300 });
    expect(mood.fog!.near).toBe(resolveMood("golden").fog!.near);
    expect(mood.postProcessing.exposure).toBe(0.7);
    expect(mood.postProcessing.grade).toMatchObject({ saturation: 1.4 });
  });

  it("fog false clears the air and shadows false drops the cascades", () => {
    const mood = resolveMood({ preset: "day", fog: false, shadows: false });
    expect(mood.fog).toBeUndefined();
    expect(mood.sky.fog?.near).toBeGreaterThan(10_000);
    expect(mood.lighting.directional![0]).toMatchObject({ castShadow: false });
    expect(mood.lighting.directional![0]!.cascades).toBeUndefined();
  });

  it("overcast and night have no bounce light; sunny moods add a shadowless one opposite the sun", () => {
    expect(resolveMood("overcast").lighting.directional).toHaveLength(1);
    expect(resolveMood("night").lighting.directional).toHaveLength(1);
    const day = resolveMood("day").lighting.directional!;
    expect(day).toHaveLength(2);
    expect(day[1]!.castShadow).toBeUndefined();
    const opposite = (bearingOf(day[0]!.position!).azimuth + 180) % 360;
    expect(bearingOf(day[1]!.position!).azimuth).toBeCloseTo(opposite, 5);
  });
});
