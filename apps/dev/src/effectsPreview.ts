import type { PlayableGame } from "@jgengine/shell/registry";
import { mergePostProcessing } from "@jgengine/core/render/lookPreset";
import type { PostProcessingConfig } from "@jgengine/core/render/postProcessing";

/** The render effects `?effects=` can switch; `softShadows` takes a light size in degrees (`softShadows:2`). */
export const PREVIEW_EFFECTS = ["ssr", "fog", "fogBanks", "motionBlur", "softShadows"] as const;

/** One effect a preview turns on (with an optional number) or off. */
export interface EffectToggle {
  effect: (typeof PREVIEW_EFFECTS)[number];
  on: boolean;
  value?: number;
}

function isPreviewEffect(name: string): name is EffectToggle["effect"] {
  return PREVIEW_EFFECTS.some((effect) => effect === name);
}

/**
 * Parse `?effects=ssr,-fog,softShadows:2`: a name turns that effect on, a leading `-` turns it off.
 * Unknown names are reported, never ignored.
 */
export function parseEffectsPreview(raw: string | null): { toggles: EffectToggle[]; unknown: string[] } {
  const toggles: EffectToggle[] = [];
  const unknown: string[] = [];
  for (const entry of (raw ?? "").split(",").map((part) => part.trim()).filter((part) => part.length > 0)) {
    const on = !entry.startsWith("-");
    const [name = "", amount] = (on ? entry : entry.slice(1)).split(":");
    if (!isPreviewEffect(name)) {
      unknown.push(entry);
      continue;
    }
    const value = amount === undefined ? undefined : Number(amount);
    toggles.push(value === undefined || !Number.isFinite(value) ? { effect: name, on } : { effect: name, on, value });
  }
  return { toggles, unknown };
}

/**
 * The game with each previewed effect forced on or off over its resolved look, for before/after
 * captures in the dev runner. A game with no post chain gets one only when an effect turns on.
 */
export function withEffectsPreview<T extends Pick<PlayableGame, "rendering">>(game: T, toggles: readonly EffectToggle[]): T {
  if (toggles.length === 0) return game;
  let post: PostProcessingConfig = {};
  let lightSize: number | false | undefined;
  for (const { effect, on, value } of toggles) {
    if (effect === "ssr") post = { ...post, ssr: on ? { intensity: value ?? 0.6 } : false };
    else if (effect === "fog") post = { ...post, atmosphere: on ? {} : false };
    else if (effect === "fogBanks") post = { ...post, atmosphere: on ? { variation: value ?? 0.7 } : { variation: 0 } };
    else if (effect === "motionBlur") post = { ...post, motionBlur: on ? { shutter: value ?? 0.5 } : false };
    else lightSize = on ? (value ?? 0.53) : false;
  }
  const rendering = game.rendering ?? {};
  const authored = rendering.postProcessing;
  const anyOn = toggles.some((toggle) => toggle.on && toggle.effect !== "softShadows");
  const postProcessing = authored === undefined && !anyOn ? undefined : mergePostProcessing(authored ?? {}, post);
  const directional = rendering.lighting?.directional;
  const lighting =
    lightSize === undefined || rendering.lighting === undefined || directional === undefined
      ? rendering.lighting
      : {
          ...rendering.lighting,
          directional: directional.map((light, index) => {
            if (index !== 0) return light;
            const { lightSize: _authored, ...rest } = light;
            return lightSize === false ? rest : { ...rest, lightSize };
          }),
        };
  return {
    ...game,
    rendering: {
      ...rendering,
      ...(postProcessing === undefined ? {} : { postProcessing }),
      ...(lighting === undefined ? {} : { lighting }),
    },
  };
}
