import { describe, expect, test } from "bun:test";

import type { EditorDocument } from "@jgengine/core/editor/types";
import { resolveGameLook } from "@jgengine/core/render/lookPreset";
import { environment, sky } from "@jgengine/core/world/features";

import { defineGame } from "./defineGame";
import { presentationLookInput } from "./Shell3dPresentation";

function doc(environment: EditorDocument["environment"]): EditorDocument {
  return { version: 1, markers: [], volumes: [], paths: [], annotations: [], prefabs: [], collections: [], environment } as EditorDocument;
}

describe("presentationLookInput", () => {
  // The shell resolves the look a second time from what defineGame produced. If that second pass
  // lost the mood or the world's sky shape, the rendered rig, dome and grade would drift from the
  // ones defineGame resolved, which is how a mood used to come out as the sky's bare sun.
  test("the shell's second resolution lands on the light, sky and grade defineGame resolved", () => {
    const games = [
      defineGame({ name: "Park", look: "cinematic", mood: "bright", world: environment({ sky: sky({ preset: "day" }) }) }),
      defineGame({
        name: "Harbor",
        look: "cinematic",
        mood: "day",
        world: environment({ sky: sky({ preset: "day", timeOfDay: true, cloudiness: 0.3, radius: 620 }) }),
        editorLayers: doc({ preset: "day", timeOfDay: true, sunAzimuth: 104.5, sunElevation: 22.6 }),
      }),
      defineGame({ name: "Comic dusk", look: "comic", mood: { preset: "dusk", saturation: 1.2 } }),
      defineGame({ name: "Implied", look: "cinematic", world: environment({ sky: sky({ preset: "night" }) }) }),
    ];
    for (const playable of games) {
      const input = presentationLookInput(playable, playable.game.world?.kind === "environment");
      expect(input.mood).toBe(playable.mood);
      const again = resolveGameLook(input);
      expect(again.lighting).toEqual(playable.lighting);
      expect(again.backdrop?.sky).toEqual(playable.backdrop?.sky);
      expect(again.postProcessing).toEqual(playable.postProcessing);
    }
  });

  test("hands the world's sky shape through only for an environment world", () => {
    const shaped = defineGame({ name: "Shaped", look: "cinematic", world: environment({ sky: sky({ preset: "day", radius: 480 }) }) });
    expect(presentationLookInput(shaped, true).worldSky).toMatchObject({ radius: 480 });
    expect(presentationLookInput(defineGame({ name: "No world", look: "cinematic" }), false).worldSky).toBeUndefined();
  });
});
