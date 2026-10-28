import type { ComponentType } from "react";

import type { GeneratorDefinition, GeneratorVariant } from "@jgengine/core/generator/generator";

/** What a preview draws: the generator and one of its variants. */
export interface GeneratorPreviewProps {
  definition: GeneratorDefinition;
  variant: GeneratorVariant;
}

/** Where a preview camera looks and how far back it sits, in the preview's own metres. */
export interface GeneratorPreviewFrame {
  target: readonly [x: number, y: number, z: number];
  distance: number;
}

/**
 * How one generator output family draws in a variant tile: a react-three-fiber component for the
 * variant and the camera frame that fits it. One preview serves every generator of that output.
 */
export interface GeneratorPreview {
  Component: ComponentType<GeneratorPreviewProps>;
  frame(props: GeneratorPreviewProps): GeneratorPreviewFrame;
}

const previews = new Map<string, GeneratorPreview>();

/** Register the preview for a generator output family (`"parts"`, `"grass-field"`, …). Replaces an earlier one. */
export function registerGeneratorPreview(output: string, preview: GeneratorPreview): void {
  previews.set(output, preview);
}

/** The preview registered for an output family, or undefined when that family has none. */
export function getGeneratorPreview(output: string): GeneratorPreview | undefined {
  return previews.get(output);
}
