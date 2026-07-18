import type { EditorAssetEntry } from "../AssetBrowser";
import { Icon, type IconName } from "./icons";
import { useGlbThumbnail } from "./useGlbThumbnail";

const KIND_ICON: Record<EditorAssetEntry["kind"], IconName> = {
  model: "cube",
  catalog: "layers",
  marker: "pin",
};

/**
 * Content Browser tile face: real offscreen-rendered GLB preview when a model URL
 * is available and the render succeeds; otherwise the typed kind glyph (honest
 * fallback — never a fabricated screenshot).
 * @internal
 */
export function AssetThumbnail({
  asset,
  size = 22,
  className = "",
}: {
  asset: EditorAssetEntry;
  size?: number;
  className?: string;
}) {
  const canRender = asset.kind === "model" && typeof asset.url === "string" && asset.url.length > 0;
  const thumb = useGlbThumbnail(canRender ? asset.url : undefined);

  if (thumb.status === "ready" && thumb.dataUrl !== null) {
    return (
      <img
        src={thumb.dataUrl}
        alt=""
        draggable={false}
        className={`h-full w-full object-cover ${className}`}
      />
    );
  }

  const loading = canRender && thumb.status === "loading";
  return (
    <span
      className={`flex h-full w-full items-center justify-center text-neutral-500 ${loading ? "animate-pulse" : ""} ${className}`}
      aria-hidden
    >
      <Icon name={KIND_ICON[asset.kind]} size={size} />
    </span>
  );
}
