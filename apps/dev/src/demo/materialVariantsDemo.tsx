import { useMemo, useState } from "react";

import { generatorVariants, untypedGenerator, type GeneratorVariant } from "@jgengine/core/generator/generator";
import { GeneratorVariantGrid } from "@jgengine/core/generator/GeneratorVariantGrid.draw";
import { SURFACE_MATERIAL_GENERATOR, SURFACE_MATERIAL_SCHEMA, surfaceMaterialMeta } from "@jgengine/core/material/surfaceMaterialGenerator";
import { registerSurfaceMaterialDraw } from "@jgengine/core/material/surfaceMaterialPreview.draw";
import type { PlayableGame } from "@jgengine/shell/registry";

import { demoGame } from "./demoGame";

registerSurfaceMaterialDraw();

const definition = untypedGenerator(SURFACE_MATERIAL_GENERATOR);
/** Tiles bake at 256 so a grid of twenty stays quick; the terrain bakes at 512. */
const TILE_RESOLUTION = "256";

/** `?preset=cliff` shows twenty seeded variants of one look; no preset shows every preset side by side. */
function pagePreset(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return new URLSearchParams(window.location.search).get("preset") ?? undefined;
}

function VariantPanel() {
  const preset = useMemo(pagePreset, []);
  const [base, setBase] = useState<Record<string, unknown> | undefined>(() =>
    preset === undefined ? undefined : surfaceMaterialMeta({ preset, params: { resolution: TILE_RESOLUTION } }),
  );
  const variants = useMemo<GeneratorVariant[]>(() => {
    if (base !== undefined) return generatorVariants(definition, base, { count: 20, explore: 0.5 });
    const presets = (SURFACE_MATERIAL_SCHEMA.presets ?? []).map((entry) => surfaceMaterialMeta({ preset: entry.id, params: { resolution: TILE_RESOLUTION } }));
    return generatorVariants(definition, presets[0], { count: presets.length, keep: presets });
  }, [base]);
  const title = base === undefined ? "every preset" : `${String(base["kind"])} · 20 seeded variants · click one to evolve from it`;
  return (
    <div style={{ position: "absolute", inset: 0, padding: 16, background: "#12161b", color: "#e8e8e8", fontFamily: "sans-serif", overflow: "auto" }}>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Surface materials · {title}</div>
      <GeneratorVariantGrid
        definition={definition}
        variants={variants}
        selected={0}
        onPick={(variant) => setBase({ ...variant.meta })}
        actions={(variant) => <span style={{ fontSize: 11, opacity: 0.7 }}>{String(variant.meta["seed"])}</span>}
        columns={5}
      />
    </div>
  );
}

/** The surface material generator's variant grid: every preset, or one look's seeded variants. */
export const materialVariantsGame: PlayableGame = {
  ...demoGame,
  game: { ...demoGame.game, name: "material-variants" },
  scene: {
    renderEntity: () => <group />,
    renderObject: () => <group />,
    environment: () => <group />,
  },
  loop: { ...demoGame.loop, onTick: () => {} },
  GameUI: () => <VariantPanel />,
};
