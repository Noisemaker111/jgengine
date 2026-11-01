import { describe, expect, test } from "bun:test";

import type { LiveRoadSource, RoadEnvironmentDescriptor } from "../world/features";
import { withSwappableRoadSurface } from "./liveRoadSurface";

const scan = (name: string) => ({ maps: { color: `/${name}.jpg`, normal: `/${name}-n.jpg` }, repeat: 4, strength: 1, tint: 1 });

function sourceOf(roads: readonly RoadEnvironmentDescriptor[]): LiveRoadSource & { change(): void } {
  const listeners = new Set<() => void>();
  return {
    current: () => roads,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    change: () => listeners.forEach((listener) => listener()),
  };
}

describe("withSwappableRoadSurface", () => {
  const roads = [{ kind: "road", materials: { road: scan("dry"), sidewalk: scan("walk") } }] as unknown as readonly RoadEnvironmentDescriptor[];

  test("passes the base roads through until a surface is set, replacing only the named layer", () => {
    const wrapped = withSwappableRoadSurface(sourceOf(roads));
    expect(wrapped.current()).toBe(roads);
    wrapped.setSurface({ road: scan("wet") });
    const swapped = wrapped.current();
    expect(swapped[0]?.materials?.road?.maps.color).toBe("/wet.jpg");
    expect(swapped[0]?.materials?.sidewalk?.maps.color).toBe("/walk.jpg");
    expect(wrapped.current()).toBe(swapped);
    wrapped.setSurface(undefined);
    expect(wrapped.current()).toBe(roads);
  });

  test("tells listeners once per change and follows the base source's own changes", () => {
    const base = sourceOf(roads);
    const wrapped = withSwappableRoadSurface(base);
    let heard = 0;
    const stop = wrapped.subscribe(() => (heard += 1));
    const wet = { road: scan("wet") };
    wrapped.setSurface(wet);
    wrapped.setSurface(wet);
    expect(heard).toBe(1);
    base.change();
    expect(heard).toBe(2);
    stop();
    wrapped.setSurface(undefined);
    expect(heard).toBe(2);
  });
});
