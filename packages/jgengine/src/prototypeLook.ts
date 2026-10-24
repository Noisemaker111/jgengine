/**
 * "Prototype look" detector — flags a 3D game still on primitive meshes + flat
 * lighting (the pre-#773 default). Used by `jgengine doctor` and scaffold checks.
 */

export interface PrototypeLookSignals {
  /** Explicit `look: "flat"`. */
  flatLook: boolean;
  /** Has entityModels / objectModels / scatterModels wiring. */
  hasModelSeams: boolean;
  /** Custom renderEntity / renderObject (not primitive fallback). */
  hasCustomRender: boolean;
  /** presentation: "hud" or no world — not a 3D scene game. */
  hudOnly: boolean;
  /** `defineGame({ editorLayers })` — the shell auto-mounts the authored scene's placed content. */
  hasAuthoredScene: boolean;
  /** Explicit lighting or postProcessing config present. */
  hasAuthoredGraphics: boolean;
  /** No `look` preset named; the engine then renders the unstyled "neutral" look. */
  lookUnset: boolean;
  /** Explicit `postProcessing` config present. */
  hasPostProcessing: boolean;
}

export interface PrototypeLookVerdict {
  /** True when the game still reads as boxes-and-flat-light. */
  isPrototype: boolean;
  signals: PrototypeLookSignals;
  reasons: string[];
  fix?: string;
}

/**
 * Scan game source text for prototype-look signals. Pass game.config.ts plus
 * any models/assets modules the config imports.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

export function assessPrototypeLook(sources: readonly string[]): PrototypeLookVerdict {
  const text = stripComments(sources.join("\n"));

  const flatLook = /\blook\s*:\s*["']flat["']/.test(text);
  const lookUnset = !/\blook\s*:\s*["'](?:neutral|photoreal|toon|comic|retro|cinematic|flat)["']/.test(text);
  const hasPostProcessing = /\bpostProcessing\s*:/.test(text);
  const hasModelSeams =
    /\bentityModels\b/.test(text) ||
    /\bobjectModels\b/.test(text) ||
    /\bscatterModels\b/.test(text) ||
    /\basset:[a-z0-9_]+\b/.test(text);
  const hasCustomRender =
    /\brenderEntity\b/.test(text) ||
    /\brenderObject\b/.test(text) ||
    /\bWorldOverlay\b/.test(text);
  const hudOnly =
    /\bpresentation\s*:\s*["']hud["']/.test(text) ||
    (!/\bworld\b/.test(text) && /\bcamera\s*:\s*\{\s*followEntityId\s*:\s*null/.test(text));
  const hasAuthoredGraphics =
    /\blighting\s*:/.test(text) ||
    /\bpostProcessing\s*:/.test(text) ||
    /\bbackdrop\s*:/.test(text);
  const hasAuthoredScene = /\beditorLayers\s*[,:]/.test(text);

  const signals: PrototypeLookSignals = {
    flatLook,
    hasModelSeams,
    hasCustomRender,
    hudOnly,
    hasAuthoredGraphics,
    hasAuthoredScene,
    lookUnset,
    hasPostProcessing,
  };

  if (hudOnly) {
    return { isPrototype: false, signals, reasons: [] };
  }

  const flagFlat = flatLook && !hasAuthoredGraphics;
  const flagBoxes = !hasModelSeams && !hasCustomRender && !hasAuthoredScene;
  const flagUnstyled = lookUnset && !hasPostProcessing;
  const isPrototype = flagFlat || flagBoxes || flagUnstyled;

  const reasons: string[] = [];
  if (flagFlat) {
    reasons.push('look: "flat" without authored lighting/post — scene reads as programmer art');
  }
  if (flagBoxes) {
    reasons.push(
      "no model seams or custom entity/object renderer — 3D entities render as primitive boxes",
    );
  }

  if (flagUnstyled) {
    reasons.push(
      'no look preset or postProcessing — the scene renders with the unstyled "neutral" look (no tone-map grade, AO or bloom)',
    );
  }

  return {
    isPrototype,
    signals,
    reasons,
    fix: isPrototype
      ? 'wire entityModels/objectModels (e.g. entityModels: { player: "asset:person_casual" }) and choose a look for the art direction (look: "cinematic" | "photoreal" | "toon" | ..., or an explicit postProcessing stack), plus a mood for the light (mood: "day" | "bright" | "golden" | "dusk" | "overcast" | "night"). Write look: "neutral" only when unstyled output is deliberate.'
      : undefined,
  };
}
