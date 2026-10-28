import type { CSSProperties } from "react";

import { resolveAssetBaseUrl } from "../../assets/assetBase";

/** Props for {@link SpriteIcon}. */
export interface SpriteIconProps {
  /** The served SVG or PNG (`libraryIconUrl("gameicons:lorc/broadsword")` from `@jgengine/assets/library/libraryIcons`). */
  src: string;
  /** Edge length in px. Default 24. */
  size?: number;
  /** Fill colour. Default `currentColor`, so the icon follows the surrounding text colour. */
  color?: string;
  /** Accessible name; omitted, the icon is decorative. */
  title?: string;
  /**
   * How the file becomes a shape: `luminance` (default) keeps light pixels, for icons drawn white on
   * black like game-icons.net; `alpha` keeps opaque pixels, for icons on a transparent background.
   */
  mode?: "luminance" | "alpha";
  className?: string;
  style?: CSSProperties;
}

/**
 * The mask style that cuts {@link SpriteIcon}'s fill to the icon's shape; a root-absolute `src` resolves like a model URL.
 *
 * @internal
 */
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

/**
 * A one-colour icon from a served SVG or PNG, tinted by `color` (or the text colour): game-icons.net
 * item icons in place of two-letter text tiles. Pass it as an `IconTreatment` glyph, an
 * `InventoryGrid` `itemIcon`, or an `ActionBar` `renderIcon`.
 *
 * @capability sprite-icon draw a served one-colour icon (game-icons.net SVG) tinted to the HUD theme
 */
export function SpriteIcon({ src, size = 24, color = "currentColor", title, mode = "luminance", className, style }: SpriteIconProps) {
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
}
