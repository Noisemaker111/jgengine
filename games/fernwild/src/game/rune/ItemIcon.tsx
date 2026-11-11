/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect, useState, type ReactNode } from "@jgengine/core/ui/jsx";
import { libraryIconUrl } from "@jgengine/assets/library/libraryIcons";
import { resolveAssetBaseUrl } from "@jgengine/core/assets/assetBase";
import { RuneGlyph, RuneLabel, RuneView } from "@jgengine/core/ui/rune/primitives.view";

import { itemDef, itemLabel } from "../data/items";
import { itemIconKey } from "../data/itemIcons";

/** Our own item tiles: a colour per kind under a game-icons.net glyph (ARK's painted icons are theirs). */
const KIND_COLOR: Record<string, string> = {
  resource: "#8a6a3c",
  consumable: "#a33b4a",
  tool: "#5f6f7f",
  structure: "#a07a2c",
  armor: "#4f7a52",
  saddle: "#6f4a2f",
  ammo: "#555555",
};

const RESOURCE_COLOR: Record<string, string> = {
  thatch: "#b49a4c",
  wood: "#7a5230",
  stone: "#8d8d88",
  flint: "#5d6670",
  fiber: "#7fa24a",
  hide: "#9b6e4e",
  mejoberry: "#5a4bb0",
  amarberry: "#c0392b",
  azulberry: "#2e6fd0",
  tintoberry: "#d4b21e",
  narcoberry: "#3b2b55",
  stimberry: "#9b2fae",
};

export function itemColor(itemId: string): string {
  return RESOURCE_COLOR[itemId] ?? KIND_COLOR[itemDef(itemId)?.kind ?? "resource"] ?? "#666666";
}

function initials(label: string): string {
  const words = label.split(" ");
  return words.length === 1 ? label.slice(0, 2) : words.map((word) => word[0]).join("").slice(0, 3);
}

/**
 * game-icons.net files are a black 512 square with the glyph in white paths. The native glyph takes the
 * white paths alone, scaled into its 24-unit view and tinted with `currentColor`.
 */
export function glyphArtwork(svg: string): string | null {
  const paths = [...svg.matchAll(/<path\b[^>]*\bd="([^"]+)"[^>]*>/g)].filter((match) => /fill="#fff(?:fff)?"/i.test(match[0])).map((match) => match[1]);
  if (paths.length === 0) return null;
  return `<g transform="scale(.046875)" fill="currentColor">${paths.map((d) => `<path d="${d}"/>`).join("")}</g>`;
}

const artwork = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();

function loadArtwork(url: string): Promise<string | null> {
  const started = pending.get(url);
  if (started !== undefined) return started;
  const load = fetch(resolveAssetBaseUrl(url))
    .then((response) => (response.ok ? response.text() : Promise.reject(new Error(`${response.status} ${url}`))))
    .then(glyphArtwork)
    .catch((error: unknown) => {
      console.warn(`degraded: item icon ${url} did not load (${String(error)}); its initials show instead`);
      return null;
    })
    .then((art) => {
      artwork.set(url, art);
      return art;
    });
  pending.set(url, load);
  return load;
}

/** One item as a tinted tile with its glyph, or its initials until (or unless) the glyph loads. */
export function ItemIcon({ itemId, size }: { itemId: string; size: number }): ReactNode {
  const key = itemIconKey(itemId);
  const url = key === null ? null : libraryIconUrl(key);
  const [art, setArt] = useState<string | null>(() => (url === null ? null : (artwork.get(url) ?? null)));
  useEffect(() => {
    if (url === null || typeof location === "undefined") return;
    if (artwork.has(url)) {
      setArt(artwork.get(url) ?? null);
      return;
    }
    let live = true;
    void loadArtwork(url).then((loaded) => {
      if (live) setArt(loaded);
    });
    return () => {
      live = false;
    };
  }, [url]);
  const color = itemColor(itemId);
  return (
    <RuneView width={size} height={size} radius={Math.max(3, size / 8)} justify="center" items="center" radial={{ center: [0.35, 0.3], radius: [0.8, 0.8], stops: [[0, `${color}ee`], [1, `${color}88`]] }}>
      {art === null ? <RuneLabel value={initials(itemLabel(itemId))} size={Math.max(9, size * 0.3)} weight={700} color="#f4efe2" /> : <RuneGlyph artwork={art} size={size * 0.74} color="#f4efe2" />}
    </RuneView>
  );
}
