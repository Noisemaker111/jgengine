/** @jsxImportSource @jgengine/core/ui/jsx */
import type { ComponentType } from "@jgengine/core/ui/jsx";

import type { GeneratorDefinition, GeneratorVariant } from "@jgengine/core/generator/generator";

export interface GeneratorPreviewProps {
  definition: GeneratorDefinition;
  variant: GeneratorVariant;
}

/** Where a preview camera looks and how far back it sits, in the preview's own metres. */
export interface GeneratorPreviewFrame {
  target: readonly [x: number, y: number, z: number];
  distance: number;
}

export interface GeneratorPreview {
  Component: ComponentType<GeneratorPreviewProps>;
  frame(props: GeneratorPreviewProps): GeneratorPreviewFrame;
}

const previews = new Map<string, GeneratorPreview>();

export function registerGeneratorPreview(output: string, preview: GeneratorPreview): void {
  previews.set(output, preview);
}

/** The preview registered for an output family, or undefined when that family has none. */
export function getGeneratorPreview(output: string): GeneratorPreview | undefined {
  return previews.get(output);
}
