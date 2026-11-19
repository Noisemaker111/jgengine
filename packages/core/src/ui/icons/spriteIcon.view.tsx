/** @jsxImportSource @jgengine/core/ui/jsx */
import type { CSSProperties } from "@jgengine/core/ui/jsx";

import { resolveAssetBaseUrl } from "../../assets/assetBase";
import { memoView } from "../memoView.view";

export interface SpriteIconProps {
  src: string;
  /** Edge length in px. Default 24. */
  size?: number;
  /** Fill colour. Default `currentColor`, so the icon follows the surrounding text colour. */
  color?: string;
  title?: string;
  /**
   * How the file becomes a shape: `luminance` (default) keeps light pixels, for icons drawn white on
   * black like game-icons.net; `alpha` keeps opaque pixels, for icons on a transparent background.
   */
  mode?: "luminance" | "alpha";
  className?: string;
  style?: CSSProperties;
}

/** @internal */
export function spriteIconMask(src: string, mode: "luminance" | "alpha" = "luminance"): CSSProperties {
  const image = `url("${resolveAssetBaseUrl(src).replace(/"/g, "%22")}")`;
  return {
    maskImage: image,
    WebkitMaskImage: image,
    maskMode: mode,
    maskSize: "contain",
    WebkitMaskSize: "contain",
    maskRepeat: "no-repeat",
    WebkitMaskRepeat: "no-repeat",
    maskPosition: "center",
    WebkitMaskPosition: "center",
  };
}

/** @capability sprite-icon draw a served one-colour icon (game-icons.net SVG) tinted to the HUD theme */
export const SpriteIcon = memoView("SpriteIcon", function SpriteIcon({ src, size = 24, color = "currentColor", title, mode = "luminance", className, style }: SpriteIconProps) {
  return (
    <span
      role={title === undefined ? undefined : "img"}
      aria-label={title}
      aria-hidden={title === undefined ? true : undefined}
      data-sprite-icon={src}
      className={className}
      style={{ display: "inline-block", width: size, height: size, flexShrink: 0, backgroundColor: color, ...spriteIconMask(src, mode), ...style }}
    />
  );
});
