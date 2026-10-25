import { ICON_SVG } from "./iconData";

/**
 * A crisp vector glyph from the collected game-icons.net set (CC BY 3.0 — credited in CREDITS.md).
 * Colour comes from the CSS `color` of the wrapper (the paths are `fill="currentColor"`), so a slot
 * tints its icon gold, blue-when-active, or dim-when-locked with a single text-colour class.
 */
export function Icon({ name, className, shadow, shadowDy = 16 }: { name: string; className?: string; shadow?: string; shadowDy?: number }) {
  const inner = ICON_SVG[name];
  if (inner === undefined) return null;
  // `shadow` draws a darker copy `shadowDy` units (of 512) below the glyph: a drop shadow without a CSS
  // filter, which over the live battlefield would re-render every frame.
  const markup = shadow === undefined ? inner : `<g transform="translate(0 ${shadowDy})" style="color:${shadow}">${inner}</g>${inner}`;
  return (
    <svg viewBox="0 0 512 512" className={className} role="presentation" aria-hidden overflow="visible" dangerouslySetInnerHTML={{ __html: markup }} />
  );
}
