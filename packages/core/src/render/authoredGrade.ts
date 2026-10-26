import type { DocumentColorGrade } from "@jgengine/core/editor/environment";
import type { ResolvedGameLook } from "@jgengine/core/render/lookPreset";
import type { PostProcessingConfig } from "@jgengine/core/render/postProcessing";

/**
 * Folds a scene document's authored grade into the resolved look. The document is the authoring
 * source, so its baked LUT and exposure range win over the game's static post config, and everything
 * the document left unauthored stays exactly as the game or look preset set it. With no authored
 * grade the look comes back untouched (same identity), so an ungraded game mounts the pipeline it
 * always mounted.
 * @internal
 */
export function withAuthoredGrade(look: ResolvedGameLook, grade: DocumentColorGrade | undefined): ResolvedGameLook {
  if (grade === undefined) return look;
  const post: PostProcessingConfig = look.postProcessing ?? { toneMapping: "agx", bloom: false };
  const graded: PostProcessingConfig = grade.lut === undefined
    ? post
    : { ...post, grade: { ...(typeof post.grade === "object" ? post.grade : {}), lut: { cube: grade.lut } } };
  if (grade.autoExposure === undefined) {
    return { ...look, postProcessing: graded };
  }
  return {
    ...look,
    postProcessing: {
      ...graded,
      autoExposure: { ...(typeof graded.autoExposure === "object" ? graded.autoExposure : {}), ...grade.autoExposure },
    },
  };
}
