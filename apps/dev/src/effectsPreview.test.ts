import { expect, test } from "bun:test";

import { parseEffectsPreview, withEffectsPreview } from "./effectsPreview";

const game = {
  rendering: {
    postProcessing: { toneMapping: "aces" as const, ssr: { intensity: 0.35 } },
    lighting: { directional: [{ position: [10, 20, 5] as const, castShadow: true, lightSize: 0.53 }] },
  },
};

test("names turn effects on, a dash turns them off, unknown names are reported", () => {
  expect(parseEffectsPreview("ssr,-fog,softShadows:2,bogus")).toEqual({
    toggles: [{ effect: "ssr", on: true }, { effect: "fog", on: false }, { effect: "softShadows", on: true, value: 2 }],
    unknown: ["bogus"],
  });
  expect(parseEffectsPreview(null)).toEqual({ toggles: [], unknown: [] });
});

test("each toggle lands on the field its effect reads", () => {
  const off = withEffectsPreview(game, parseEffectsPreview("-ssr,-fog,-motionBlur,-softShadows").toggles);
  expect(off.rendering?.postProcessing).toMatchObject({ toneMapping: "aces", ssr: false, atmosphere: false, motionBlur: false });
  expect(off.rendering?.lighting?.directional?.[0]?.lightSize).toBeUndefined();
  const on = withEffectsPreview(game, parseEffectsPreview("motionBlur,fogBanks:0.5,softShadows:2").toggles);
  expect(on.rendering?.postProcessing).toMatchObject({ ssr: { intensity: 0.35 }, atmosphere: { variation: 0.5 }, motionBlur: { shutter: 0.5 } });
  expect(on.rendering?.lighting?.directional?.[0]?.lightSize).toBe(2);
  expect(withEffectsPreview(game, [])).toBe(game);
});
