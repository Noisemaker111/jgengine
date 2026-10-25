import { cn } from "@/components/ui/cn";

export const BUILDER_ICON_IDS = [
  "select",
  "wall",
  "place",
  "paint",
  "floor",
  "wall-surface",
  "ceiling",
  "delete",
  "library",
  "generate-ai",
  "send",
  "save",
  "copy",
  "group",
  "ungroup",
  "grid-snap",
] as const;

export type BuilderIconId = (typeof BUILDER_ICON_IDS)[number];

const BUILDER_ICON_SRC: Record<BuilderIconId, string> = {
  select: "/icons/builder/select.png",
  wall: "/icons/builder/wall.png",
  place: "/icons/builder/place.png",
  paint: "/icons/builder/paint.png",
  floor: "/icons/builder/floor.png",
  "wall-surface": "/icons/builder/wall-surface.png",
  ceiling: "/icons/builder/ceiling.png",
  delete: "/icons/builder/delete.png",
  library: "/icons/builder/library.png",
  "generate-ai": "/icons/builder/generate-ai.png",
  send: "/icons/builder/send.png",
  save: "/icons/builder/save.png",
  copy: "/icons/builder/copy.png",
  group: "/icons/builder/group.png",
  ungroup: "/icons/builder/ungroup.png",
  "grid-snap": "/icons/builder/grid-snap.png",
};

export function builderIconSrc(id: BuilderIconId): string {
  return BUILDER_ICON_SRC[id];
}

export function BuilderIcon({
  id,
  active = false,
  className,
  size = "md",
}: {
  id: BuilderIconId;
  active?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClass = size === "sm" ? "h-3.5 w-3.5" : size === "lg" ? "h-5 w-5" : "h-4 w-4";

  return (
    <img
      src={builderIconSrc(id)}
      alt=""
      aria-hidden
      draggable={false}
      className={cn(
        sizeClass,
        "shrink-0 object-contain",
        active && "drop-shadow-[0_0_6px_rgba(95,194,168,0.6)]",
        className,
      )}
    />
  );
}