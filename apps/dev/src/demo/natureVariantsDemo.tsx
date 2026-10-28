import { useMemo, useState } from "react";

import { generatorVariants, untypedGenerator, type GeneratorVariant } from "@jgengine/core/generator/generator";
import { GeneratorVariantGrid } from "@jgengine/core/generator/GeneratorVariantGrid.draw";
import { findSchemaPreset } from "@jgengine/core/generator/paramSchema";
import { NATURE_GENERATORS, PALM_GENERATOR } from "@jgengine/core/nature/natureGenerators";
import { registerNatureDraw } from "@jgengine/core/nature/naturePreview.draw";
import type { PlayableGame } from "@jgengine/shell/registry";

import { demoGame } from "./demoGame";

registerNatureDraw();

/** The species a page shows, from `?generator=nature.palm&preset=cycad`; defaults to the palm. */
function species() {
  const params = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const definition = NATURE_GENERATORS.find((entry) => entry.id === params.get("generator")) ?? untypedGenerator(PALM_GENERATOR);
  const preset = findSchemaPreset(definition.schema, params.get("preset") ?? "");
  return { definition, preset };
}

function VariantPanel() {
  const { definition, preset } = useMemo(species, []);
  const [base, setBase] = useState<Record<string, unknown>>(() => ({ ...preset?.values, seed: preset?.id ?? definition.id }));
  const variants = useMemo(() => generatorVariants(definition, base, { count: 20, explore: 0.5 }), [definition, base]);
  const pick = (variant: GeneratorVariant) => setBase({ ...variant.meta });
  return (
    <div style={{ position: "absolute", inset: 0, padding: 16, background: "#12161b", color: "#e8e8e8", fontFamily: "sans-serif", overflow: "auto" }}>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
        {definition.label}
        {preset === undefined ? "" : ` · ${preset.label ?? preset.id}`} · 20 seeded variants · click one to evolve from it
      </div>
      <GeneratorVariantGrid definition={definition} variants={variants} selected={0} onPick={pick} columns={5} />
    </div>
  );
}

/** The nature generators' variant grid: one species, twenty live tiles, built from its schema alone. */
export const natureVariantsGame: PlayableGame = {
  ...demoGame,
  game: { ...demoGame.game, name: "nature-variants" },
  renderEntity: () => <group />,
  renderObject: () => <group />,
  loop: { ...demoGame.loop, onTick: () => {} },
  environment: () => <group />,
  GameUI: () => <VariantPanel />,
};
