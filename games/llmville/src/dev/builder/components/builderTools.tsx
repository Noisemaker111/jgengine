import type { BuilderIconId } from "@/dev/builder/components/builderIcons";
import { BuilderIcon } from "@/dev/builder/components/builderIcons";

export type BuilderTool = "select" | "wall" | "primitive" | "material" | "delete";
export type BuilderToolId = BuilderTool;

export interface BuilderToolDef {
  id: BuilderToolId;
  label: string;
  shortcut: string;
  description: string;
  icon: BuilderIconId;
}

export const BUILDER_TOOLS: readonly BuilderToolDef[] = [
  {
    id: "select",
    label: "Select",
    shortcut: "V",
    description: "Pick & move things. Drag edge arrows to resize.",
    icon: "select",
  },
  {
    id: "wall",
    label: "Wall",
    shortcut: "W",
    description: "Click two floor points to draw a wall.",
    icon: "wall",
  },
  {
    id: "primitive",
    label: "Place",
    shortcut: "P",
    description: "Click floor to drop a primitive or catalog item.",
    icon: "place",
  },
  {
    id: "material",
    label: "Paint",
    shortcut: "M",
    description: "Click a part to apply the active material.",
    icon: "paint",
  },
  {
    id: "delete",
    label: "Delete",
    shortcut: "X",
    description: "Click a part to remove it.",
    icon: "delete",
  },
] as const;

export const BUILDER_RAIL_TOOLS = {
  library: {
    label: "Library",
    icon: "library",
  },
  generate: {
    label: "Generate",
    icon: "generate-ai",
  },
  save: {
    label: "Save",
    icon: "save",
  },
  copy: {
    label: "Copy JSON",
    icon: "copy",
  },
  scene: {
    label: "Scene",
    icon: "place",
  },
  group: {
    label: "Group",
    icon: "group",
  },
  grid: {
    label: "Grid",
    icon: "grid-snap",
  },
  room: {
    label: "Room",
    icon: "ceiling",
  },
} as const satisfies Record<string, { label: string; icon: BuilderIconId }>;

export function BuilderRailIcon({
  icon,
  active = false,
  className,
  size = "md",
}: {
  icon: BuilderIconId;
  active?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  return <BuilderIcon id={icon} active={active} className={className} size={size} />;
}