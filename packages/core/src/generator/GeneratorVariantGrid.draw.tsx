/** @jsxImportSource @jgengine/core/ui/jsx */
import { useRef, type ReactNode } from "@jgengine/core/ui/jsx";
import * as THREE from "three";

import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { EngineCanvas } from "@jgengine/core/frame/engineCanvas.draw";
import { EngineSceneProvider, useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";
import { useEngineRendererFactory } from "@jgengine/core/webgpu/engineRenderer.draw";

import type { GeneratorDefinition, GeneratorVariant } from "@jgengine/core/generator/generator";
import { getGeneratorPreview } from "@jgengine/core/generator/generatorPreview.draw";
import { generatorVariantText, getGeneratorText } from "@jgengine/core/generator/generatorText";

/** Props for {@link GeneratorVariantGrid}. */
export interface GeneratorVariantGridProps {
  definition: GeneratorDefinition;
  /** The variants to show, usually `generatorVariants(definition, meta)`. */
  variants: readonly GeneratorVariant[];
  /** Index of the variant to outline as current. */
  selected?: number | undefined;
  /** Indices of kept variants, marked with a pin. */
  kept?: readonly number[] | undefined;
  /** Click on a tile. */
  onPick?: ((variant: GeneratorVariant) => void) | undefined;
  /** Extra controls under each tile (keep, place, …). */
  actions?: ((variant: GeneratorVariant) => ReactNode) | undefined;
  /** Tiles per row. Default 4. */
  columns?: number;
  /** Accent colour for the selected outline. */
  accent?: string;
}

/** One tile's own scene and camera plus the element whose rect it draws into. */
interface VariantTile {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  element: HTMLElement | null;
}

/**
 * A tile's scene and camera, matching the old drei `View` + `PerspectiveCamera`: the preview's frame
 * sets the camera, `#1c2127` is the backdrop, and the same hemisphere/key light rig lights it.
 */
function buildVariantTile(definition: GeneratorDefinition, variant: GeneratorVariant): { scene: THREE.Scene; camera: THREE.PerspectiveCamera } | null {
  const preview = getGeneratorPreview(definition.output);
  if (preview === undefined) return null;
  const frame = preview.frame({ definition, variant });
  const d = Math.max(0.05, frame.distance);
  const [tx, ty, tz] = frame.target;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#1c2127");
  scene.add(new THREE.HemisphereLight("#dfe9ff", "#4a4034", 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(d * 0.6, d * 1.4, d * 0.3);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(35, 1, Math.max(0.005, d * 0.01), d * 20);
  camera.position.set(tx + d * 0.72, ty + d * 0.42, tz + d * 0.72);
  camera.lookAt(tx, ty, tz);
  return { scene, camera };
}

/**
 * The whole grid in one canvas, the engine-side form of drei's `View` portals: a positive-priority
 * draw owns rendering and draws every tile's scene into its button's rect with scissor/viewport —
 * twenty variants still cost one WebGL context.
 */
function variantTilesDraw(getTiles: () => ReadonlyMap<string, VariantTile>): EngineDraw {
  return {
    priority: 1,
    frame(state: EngineFrameState) {
      const gl = state.gl;
      const canvasRect = gl.domElement.getBoundingClientRect();
      const autoClear = gl.autoClear;
      gl.autoClear = false;
      gl.setScissorTest(false);
      gl.setViewport(0, 0, state.size.width, state.size.height);
      gl.clear(true, true, false);
      for (const tile of getTiles().values()) {
        if (tile.element === null) continue;
        const rect = tile.element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        tile.camera.aspect = rect.width / rect.height;
        tile.camera.updateProjectionMatrix();
        const x = rect.left - canvasRect.left;
        const y = rect.top - canvasRect.top;
        gl.setViewport(x, y, rect.width, rect.height);
        gl.setScissor(x, y, rect.width, rect.height);
        gl.setScissorTest(true);
        gl.render(tile.scene, tile.camera);
      }
      gl.setScissorTest(false);
      gl.autoClear = autoClear;
    },
  };
}

function VariantTilesDraw({ tiles }: { tiles: { current: Map<string, VariantTile> } }) {
  useEngineDraw(() => variantTilesDraw(() => tiles.current), []);
  return null;
}

function VariantTile({
  definition,
  variant,
  tiles,
}: {
  definition: GeneratorDefinition;
  variant: GeneratorVariant;
  tiles: { current: Map<string, VariantTile> };
}) {
  const preview = getGeneratorPreview(definition.output);
  const signature = `${definition.id}:${variant.index}:${variant.seed}`;
  const held = useRef<{ signature: string; version: number; tile: VariantTile } | null>(null);
  if (preview !== undefined) {
    if (held.current === null || held.current.signature !== signature) {
      const built = buildVariantTile(definition, variant);
      if (built !== null) {
        held.current = { signature, version: (held.current?.version ?? 0) + 1, tile: { ...built, element: null } };
      }
    }
  }
  const tile = held.current?.tile ?? null;
  const version = held.current?.version ?? 0;
  if (tile === null || preview === undefined) return null;
  const Preview = preview.Component;
  return (
    <>
      <EngineSceneProvider key={version} parent={tile.scene}>
        <Preview definition={definition} variant={variant} />
      </EngineSceneProvider>
      <div
        ref={(element) => {
          tile.element = element;
          if (element === null) tiles.current.delete(signature);
          else tiles.current.set(signature, tile);
        }}
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      />
    </>
  );
}

/** A tile for an output family with no 3D form: the variant's text preview, one line per row, clipped to the tile. */
function VariantTextTile({ definition, variant }: { definition: GeneratorDefinition; variant: GeneratorVariant }) {
  const lines = generatorVariantText(definition, variant) ?? [];
  return (
    <div
      data-variant-text={variant.index}
      style={{ position: "absolute", inset: 0, padding: "4px 4px 14px", overflow: "hidden", textAlign: "left", fontSize: 9, lineHeight: 1.25, color: "#d7dde3" }}
    >
      {lines.map((line, row) => (
        <div key={row} style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {line}
        </div>
      ))}
    </div>
  );
}

/**
 * A grid of seeded generator variants, each drawn live in its own tile. Every tile renders through
 * one shared engine canvas via scissored viewports, so twenty variants cost one WebGL context.
 * Tiles draw through the preview registered for the generator's output family; a family with only a
 * text preview (names, loot, rolled items) prints its lines in the tile instead, and a family with
 * neither shows its index only.
 */
export function GeneratorVariantGrid({ definition, variants, selected, kept, onPick, actions, columns = 4, accent = "#7fbf4d" }: GeneratorVariantGridProps) {
  const tiles = useRef(new Map<string, VariantTile>());
  const rendererFactory = useEngineRendererFactory("webgl");
  const hasPreview = getGeneratorPreview(definition.output) !== undefined;
  const hasText = !hasPreview && getGeneratorText(definition.output) !== undefined;
  const keptSet = new Set(kept ?? []);
  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: 6 }}>
        {variants.map((variant) => (
          <div key={`${variant.index}-${variant.seed}`} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <button
              type="button"
              title={`Variant ${variant.index} · seed ${variant.seed}`}
              data-variant={variant.index}
              onClick={() => onPick?.(variant)}
              style={{
                position: "relative",
                aspectRatio: "1",
                padding: 0,
                border: `2px solid ${variant.index === selected ? accent : "transparent"}`,
                borderRadius: 6,
                background: "#1c2127",
                cursor: "pointer",
                overflow: "hidden",
              }}
            >
              {hasPreview ? (
                <VariantTile definition={definition} variant={variant} tiles={tiles} />
              ) : hasText ? (
                <VariantTextTile definition={definition} variant={variant} />
              ) : null}
              <span style={{ position: "absolute", zIndex: 2, left: 4, bottom: 2, fontSize: 10, color: "#e8e8e8", textShadow: "0 1px 2px #000" }}>
                {keptSet.has(variant.index) ? "📌 " : ""}
                {variant.index}
              </span>
            </button>
            {actions?.(variant)}
          </div>
        ))}
      </div>
      {hasPreview && rendererFactory !== null ? (
        <EngineCanvas
          rendererFactory={rendererFactory}
          dpr={[1, 1.5]}
          style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none" }}
        >
          <VariantTilesDraw tiles={tiles} />
        </EngineCanvas>
      ) : null}
    </div>
  );
}
