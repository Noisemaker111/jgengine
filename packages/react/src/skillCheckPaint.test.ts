import { describe, expect, test } from "bun:test";

import type { SkillCheckConfig } from "@jgengine/core/interaction/skillCheck";
import { evaluateSkillCheck } from "@jgengine/core/interaction/skillCheck";
import type { QteStep } from "@jgengine/core/interaction/qte";
import { paintQteStepDom, paintSkillCheckDom } from "./skillCheckPaint";

function fakeElement(): HTMLElement {
  const style: Record<string, string> = {};
  const dataset: Record<string, string> = {};
  return {
    style,
    dataset,
    className: "",
    removeAttribute(name: string) {
      if (name === "class") this.className = "";
    },
  } as unknown as HTMLElement;
}

describe("paintSkillCheckDom", () => {
  test("writes marker and zone styles without React setState", () => {
    const root = fakeElement();
    const zone = fakeElement();
    const marker = fakeElement();
    const config: SkillCheckConfig = {
      trackWidth: 100,
      zone: { start: 40, end: 60 },
      markerPeriod: 2,
      window: 5,
    };
    const result = evaluateSkillCheck(config, 0.5);
    paintSkillCheckDom(root, zone, marker, config, result);
    expect(zone.style.left).toBe("40%");
    expect(zone.style.width).toBe("20%");
    expect(marker.style.left.endsWith("%")).toBe(true);
    expect(root.dataset.timedOut).toBe("false");
  });
});

describe("paintQteStepDom", () => {
  test("updates active/done attributes imperatively", () => {
    const steps: QteStep[] = [
      { id: "a", action: "A", windowStart: 0, windowEnd: 1 },
      { id: "b", action: "B", windowStart: 1, windowEnd: 2 },
    ];
    const a = fakeElement();
    const b = fakeElement();
    const map = new Map<string, HTMLElement>([
      ["a", a],
      ["b", b],
    ]);
    paintQteStepDom(map, steps, 0.5, "a", "step", "active", "done");
    expect(a.dataset.active).toBe("true");
    expect(a.dataset.done).toBe("false");
    expect(a.className).toContain("active");
    paintQteStepDom(map, steps, 1.5, "b", "step", "active", "done");
    expect(a.dataset.done).toBe("true");
    expect(b.dataset.active).toBe("true");
  });
});
