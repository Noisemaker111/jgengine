import { useMemo, useState } from "react";

import { generatorVariants, untypedGenerator, type GeneratorVariant } from "@jgengine/core/generator/generator";
import { GeneratorVariantGrid } from "@jgengine/core/generator/GeneratorVariantGrid.draw";
import { GRASS_GENERATOR, GRASS_PRESETS } from "@jgengine/core/grass/grassKind";
import { registerGrassPreview } from "@jgengine/core/grass/grassPreview.draw";
import type { PlayableGame } from "@jgengine/shell/registry";

import { demoGame } from "./demoGame";

registerGrassPreview();

const GRASS = untypedGenerator(GRASS_GENERATOR);

/** The base look a page shows, from `?preset=<id>`; defaults to the summer meadow. */
function basePreset() {
  const id = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("preset");
  return GRASS_PRESETS.find((preset) => preset.id === id) ?? GRASS_PRESETS[0];
}

function VariantPanel() {
  const preset = useMemo(basePreset, []);
  const [base, setBase] = useState<Record<string, unknown>>(() => ({ ...preset?.values, seed: preset?.id ?? "grass" }));
  const variants = useMemo(() => generatorVariants(GRASS, base, { count: 20, explore: 0.6 }), [base]);
  const pick = (variant: GeneratorVariant) => setBase({ ...variant.meta });
  return (
    <div style={{ position: "absolute", inset: 0, padding: 16, background: "#12161b", color: "#e8e8e8", fontFamily: "sans-serif", overflow: "auto" }}>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
        Grass generator · 20 seeded variants around {preset?.label ?? "the default look"} · click one to evolve from it
      </div>
      <GeneratorVariantGrid definition={GRASS} variants={variants} selected={0} onPick={pick} columns={5} />
    </div>
  );
}

/** The editor's variant grid on its own: one generator, twenty live tiles, built from the schema alone. */
export const generatorVariantsGame: PlayableGame = {
  ...demoGame,
  game: { ...demoGame.game, name: "generator-variants" },
  scene: {
    renderEntity: () => <group />,
    renderObject: () => <group />,
    environment: () => <group />,
  },
  loop: { ...demoGame.loop, onTick: () => {} },
  GameUI: () => <VariantPanel />,
};
