import { useEffect, useState, type CSSProperties } from "react";

/** Optional raster-backed materials for shared HUD chrome. */
export interface HudSkinMaterial {
  image: string;
  slice: [number, number, number, number];
  scale?: number;
  fill?: boolean;
}

/** A game-authored visual skin layered over a {@link HudTheme}. */
export interface HudSkin {
  frame?: HudSkinMaterial;
  slot?: HudSkinMaterial;
  bar?: { fill: string; track: string; cap?: string };
  font?: { family: string; src: string; weight?: number; pixel?: boolean };
  cursor?: string;
}

/** Converts a skin into the CSS variables consumed by shared HUD components. */
export function hudSkinVars(skin?: HudSkin): CSSProperties {
  if (!skin) return {};
  const vars: Record<string, string> = {};
  const material = (prefix: string, value?: HudSkinMaterial) => {
    if (!value) return;
    vars[`--jg-${prefix}-image`] = `url(${value.image})`;
    vars[`--jg-${prefix}-slice`] = value.slice.join(" ");
    if (value.scale !== undefined) vars[`--jg-${prefix}-scale`] = String(value.scale);
    if (value.fill !== undefined) vars[`--jg-${prefix}-fill`] = value.fill ? "fill" : "";
  };
  material("frame", skin.frame);
  material("slot", skin.slot);
  if (skin.bar) {
    vars["--jg-bar-skin-fill"] = skin.bar.fill;
    vars["--jg-bar-skin-track"] = skin.bar.track;
    if (skin.bar.cap) vars["--jg-bar-skin-cap"] = `url(${skin.bar.cap})`;
  }
  if (skin.font) {
    vars["--jg-skin-font"] = skin.font.family;
    if (skin.font.pixel) vars["--jg-skin-font-rendering"] = "pixelated";
  }
  if (skin.cursor) vars["--jg-skin-cursor"] = `url(${skin.cursor}), auto`;
  return vars as CSSProperties;
}

/** Loads a skin font in browsers and reports when it is available. */
export function useHudFont(skin?: HudSkin): boolean {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!skin?.font || typeof FontFace === "undefined") { setLoaded(!skin?.font); return; }
    const font = new FontFace(skin.font.family, `url(${skin.font.src})`, { weight: String(skin.font.weight ?? 400) });
    let active = true;
    font.load().then((face) => { document.fonts.add(face); if (active) setLoaded(true); }).catch(() => { if (active) setLoaded(false); });
    return () => { active = false; };
  }, [skin?.font?.family, skin?.font?.src, skin?.font?.weight]);
  return loaded;
}
