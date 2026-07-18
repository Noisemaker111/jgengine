import type { SVGProps } from "react";

/**
 * Internal editor icon set: compact 16px stroke glyphs drawn in-repo so the shell has one
 * consistent icon language without adding a dependency. Every glyph is original geometry.
 */
export type IconName =
  | "cursor"
  | "move"
  | "rotate"
  | "scale"
  | "terrain"
  | "brush"
  | "grid"
  | "magnet"
  | "frame"
  | "camera"
  | "eye"
  | "eyeOff"
  | "lock"
  | "unlock"
  | "search"
  | "filter"
  | "plus"
  | "folder"
  | "folderOpen"
  | "cube"
  | "pin"
  | "sphere"
  | "spline"
  | "note"
  | "play"
  | "pause"
  | "step"
  | "stop"
  | "undo"
  | "redo"
  | "save"
  | "import"
  | "export"
  | "settings"
  | "help"
  | "close"
  | "chevronRight"
  | "chevronDown"
  | "layers"
  | "sparkle"
  | "terminal"
  | "gauge"
  | "film"
  | "image"
  | "audio"
  | "script"
  | "network"
  | "bulb"
  | "walk"
  | "panel"
  | "copy"
  | "list"
  | "gridView"
  | "trash"
  | "target"
  | "clock"
  | "warning"
  | "info"
  | "error"
  | "command";

const PATHS: Record<IconName, string> = {
  cursor: "M4 2l8 7-3.5.5L10 13l-2 1-1.5-3.5L4 12z",
  move: "M8 1v14M1 8h14M8 1L6 3m2-2l2 2M8 15l-2-2m2 2l2-2M1 8l2-2m-2 2l2 2M15 8l-2-2m2 2l-2 2",
  rotate: "M13.5 8a5.5 5.5 0 1 1-2-4.2M13.5 1.5v3h-3",
  scale: "M2 9v5h5M14 7V2H9M2 14l4.5-4.5M14 2L9.5 6.5",
  terrain: "M1 13L5.5 5l3 5 2-3L15 13zM10 4.5l.5-1",
  brush: "M10.5 2.5l3 3L7 12l-4 1 1-4zM9 4l3 3",
  grid: "M2 2h12v12H2zM2 6.7h12M2 11.3h12M6.7 2v12M11.3 2v12",
  magnet: "M5 2v5a3 3 0 0 0 6 0V2M5 2h2.5v3H5zM8.5 2H11v3H8.5zM5 10.5L4 13m8-2.5l1 2.5",
  frame: "M2 5V2h3M11 2h3v3M14 11v3h-3M5 14H2v-3M8 6.5A1.5 1.5 0 1 1 8 9.5 1.5 1.5 0 0 1 8 6.5",
  camera: "M2 5.5h3l1.5-2h3L11 5.5h3v7H2zM8 7a2.2 2.2 0 1 1 0 4.4A2.2 2.2 0 0 1 8 7",
  eye: "M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8zM8 6.2A1.8 1.8 0 1 1 8 9.8 1.8 1.8 0 0 1 8 6.2",
  eyeOff: "M3 3l10 10M6.3 4.2C6.8 4 7.4 3.9 8 3.9c4 0 6.5 4.1 6.5 4.1a11 11 0 0 1-2.1 2.4M4 5.6A11.4 11.4 0 0 0 1.5 8S4 12.1 8 12.1c.7 0 1.4-.1 2-.4",
  lock: "M4 7.5V5.5a4 4 0 0 1 8 0v2M3.5 7.5h9V14h-9zM8 10v1.8",
  unlock: "M4 7.5V5.5a4 4 0 0 1 7.8-1.2M3.5 7.5h9V14h-9zM8 10v1.8",
  search: "M7 2.5A4.5 4.5 0 1 1 7 11.5 4.5 4.5 0 0 1 7 2.5M10.5 10.5L14 14",
  filter: "M2 3h12L9.5 8.5V13l-3 1.5v-6z",
  plus: "M8 3v10M3 8h10",
  folder: "M1.5 4a1 1 0 0 1 1-1H6l1.5 1.5h6a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H2.5a1 1 0 0 1-1-1z",
  folderOpen: "M1.5 4a1 1 0 0 1 1-1H6l1.5 1.5h5.5a1 1 0 0 1 1 1V7M1.5 13l1.7-6h11.6l-1.7 6z",
  cube: "M8 1.5l6 3v7l-6 3-6-3v-7zM2 4.5l6 3 6-3M8 7.5V14.5",
  pin: "M8 1.5A4.2 4.2 0 0 1 12.2 5.7C12.2 9 8 14.5 8 14.5S3.8 9 3.8 5.7A4.2 4.2 0 0 1 8 1.5M8 4.3a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8",
  sphere: "M8 1.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13M1.5 8h13M8 1.5c2 1.8 2 11.2 0 13M8 1.5c-2 1.8-2 11.2 0 13",
  spline: "M2 13c0-5 3-2 6-6s2-5 6-5M2 13a1 1 0 1 0 .01 0M14 2a1 1 0 1 0 .01 0",
  note: "M3 2h8l2 2v10H3zM11 2v2h2M5.5 7h5M5.5 10h5",
  play: "M4.5 2.5l9 5.5-9 5.5z",
  pause: "M4 2.5h2.8v11H4zM9.2 2.5H12v11H9.2z",
  step: "M3 2.5l7 5.5-7 5.5zM12 2.5h1.5v11H12z",
  stop: "M3.5 3.5h9v9h-9z",
  undo: "M6 3L2.5 6.5 6 10M2.5 6.5H10a3.5 3.5 0 0 1 0 7H7",
  redo: "M10 3l3.5 3.5L10 10M13.5 6.5H6a3.5 3.5 0 0 0 0 7h3",
  save: "M2.5 2.5h9L13.5 4.5v9h-11zM5 2.5V6h5V2.5M5 13.5V9.5h6v4",
  import: "M8 2v8M8 10l-3-3M8 10l3-3M2.5 12v1.5h11V12",
  export: "M8 10V2M8 2L5 5M8 2l3 3M2.5 12v1.5h11V12",
  settings:
    "M8 6a2 2 0 1 1 0 4 2 2 0 0 1 0-4M8 1.5l.6 1.8 1.9-.5 1 1.7 1.8.6-.5 1.9 1.2 1.5-1.2 1.5.5 1.9-1.8.6-1 1.7-1.9-.5-.6 1.8-.6-1.8-1.9.5-1-1.7-1.8-.6.5-1.9L1.5 8l1.2-1.5-.5-1.9 1.8-.6 1-1.7 1.9.5z",
  help: "M5.5 6a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.7M8 12.5v.1",
  close: "M3.5 3.5l9 9M12.5 3.5l-9 9",
  chevronRight: "M6 3.5L10.5 8 6 12.5",
  chevronDown: "M3.5 6L8 10.5 12.5 6",
  layers: "M8 1.5l6.5 3.5L8 8.5 1.5 5zM2.5 8L8 11l5.5-3M2.5 11L8 14l5.5-3",
  sparkle: "M8 1.5L9.3 6 14 7.5 9.3 9 8 13.5 6.7 9 2 7.5 6.7 6zM12.8 11.5l.5 1.7 1.7.5-1.7.5-.5 1.7-.5-1.7-1.7-.5 1.7-.5z",
  terminal: "M2 3h12v10H2zM4.5 6l2.5 2-2.5 2M8.5 10.5h3",
  gauge: "M2 12.5a6 6 0 1 1 12 0M8 12.5L11 7M8 12a.5.5 0 1 0 .01 0",
  film: "M2 2.5h12v11H2zM2 5.5h12M2 10.5h12M5.5 2.5v11M10.5 2.5v11",
  image: "M2 2.5h12v11H2zM2 10.5l3.5-3.5 3 3 2-2 3.5 3.5M10.5 5a1 1 0 1 1 0 2 1 1 0 0 1 0-2",
  audio: "M2.5 6h2.5L9 3v10L5 10H2.5zM11.5 5.5a4 4 0 0 1 0 5M13 3.5a6.5 6.5 0 0 1 0 9",
  script: "M5.5 4L2 8l3.5 4M10.5 4L14 8l-3.5 4",
  network: "M8 2a1.8 1.8 0 1 1 0 3.6A1.8 1.8 0 0 1 8 2M3 10.5a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6M13 10.5a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6M7 5.3L4 10.6M9 5.3l3 5.3M4.8 12.3h6.4",
  bulb: "M5 6.5a3 3 0 1 1 6 0c0 1.6-1 2.1-1.3 3.2H6.3C6 8.6 5 8.1 5 6.5zM6.5 11.5h3M7 13.5h2",
  walk: "M8 2a1.3 1.3 0 1 1 0 2.6A1.3 1.3 0 0 1 8 2M8 5v4M8 9l-2 5M8 9l2.5 2 .5 3M8 6l-2.5 1.5L5 10M8 6l2.5 1 1 2.5",
  panel: "M2 2.5h12v11H2zM2 5.5h12M10.5 5.5v8",
  copy: "M5.5 5.5h8v8h-8zM3 10.5h-.5v-8h8V3",
  list: "M5.5 4h8M5.5 8h8M5.5 12h8M2.5 4h.01M2.5 8h.01M2.5 12h.01",
  gridView: "M2.5 2.5h4.5v4.5H2.5zM9 2.5h4.5v4.5H9zM2.5 9h4.5v4.5H2.5zM9 9h4.5v4.5H9z",
  trash: "M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4M6.7 6.7v4.6M9.3 6.7v4.6",
  target: "M8 2.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11M8 5.7a2.3 2.3 0 1 1 0 4.6 2.3 2.3 0 0 1 0-4.6M8 1v2M8 13v2M1 8h2M13 8h2",
  clock: "M8 2a6 6 0 1 1 0 12A6 6 0 0 1 8 2M8 4.5V8l2.5 1.5",
  warning: "M8 2l6.5 11.5h-13zM8 6.5v3.5M8 12.2v.1",
  info: "M8 2a6 6 0 1 1 0 12A6 6 0 0 1 8 2M8 7.5v4M8 5v.1",
  error: "M8 2a6 6 0 1 1 0 12A6 6 0 0 1 8 2M6 6l4 4M10 6l-4 4",
  command: "M6 6h4v4H6zM6 6H4.5A1.5 1.5 0 1 1 6 4.5zM10 6h1.5A1.5 1.5 0 1 0 10 4.5zM6 10H4.5A1.5 1.5 0 1 0 6 11.5zM10 10h1.5a1.5 1.5 0 1 1-1.5 1.5z",
};

/** One 16px stroke icon from the shell's internal set; sized via the `size` prop. */
export function Icon({
  name,
  size = 14,
  ...rest
}: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/** Icon assigned to a scene-object kind for hierarchy rows and inspector headers. */
export function kindIcon(kind: string): IconName {
  if (kind === "note") return "note";
  if (kind.includes("spawn") || kind.includes("start") || kind.includes("marker")) return "pin";
  if (kind.includes("road") || kind.includes("route") || kind.includes("path") || kind.includes("line")) return "spline";
  if (kind.includes("zone") || kind.includes("aggro") || kind.includes("leash") || kind.includes("capture") || kind.includes("discover")) return "sphere";
  if (kind.includes("vegetation") || kind.includes("scatter") || kind.includes("grass") || kind.includes("tree") || kind.includes("field")) return "terrain";
  if (kind.includes("water") || kind.includes("pond") || kind.includes("soil")) return "layers";
  if (kind.includes("city") || kind.includes("prop") || kind.includes("building")) return "cube";
  return "cube";
}
