export type DevPreviewLayout = "fullscreen" | "document";

export const DEV_PREVIEW_LAYOUT = {
  fullscreen: "fullscreen",
  document: "document",
} as const satisfies Record<string, DevPreviewLayout>;

export interface DevPreviewLink {
  href: string;
  title: string;
  description: string;
  layout: DevPreviewLayout;
  /** When true, nav highlights only on exact path match. */
  exact?: boolean;
}

export const DEV_PREVIEW_LINKS: readonly DevPreviewLink[] = [
  {
    href: "/dev",
    title: "All previews",
    description: "Index of every dev workbench route.",
    layout: DEV_PREVIEW_LAYOUT.document,
    exact: true,
  },
  {
    href: "/dev/hud",
    title: "HUD",
    description: "Desktop monitor + mobile HUD, tablet, and economy animations.",
    layout: DEV_PREVIEW_LAYOUT.fullscreen,
  },
  {
    href: "/dev/build",
    title: "Builder 3D",
    description: "Sims-like workbench for authoring assets, rooms, grouped props, and catalog promotions.",
    layout: DEV_PREVIEW_LAYOUT.fullscreen,
    exact: true,
  },
  {
    href: "/dev/assets",
    title: "Asset slicer",
    description: "Review sprite sheets, remove backgrounds, export individual PNGs, and keep a manifest.",
    layout: DEV_PREVIEW_LAYOUT.document,
    exact: true,
  },
  {
    href: "/dev/racks",
    title: "Racks",
    description: "Rack hardware visuals and slot presentation variants.",
    layout: DEV_PREVIEW_LAYOUT.fullscreen,
  },
  {
    href: "/dev/bills",
    title: "Bills",
    description: "Billing cards, cost breakdowns, and payment states.",
    layout: DEV_PREVIEW_LAYOUT.fullscreen,
  },
  {
    href: "/dev/character",
    title: "Character",
    description: "Player character look, outfit, and animation preview states.",
    layout: DEV_PREVIEW_LAYOUT.document,
  },
] as const;

export function getDevPreviewLayout(pathname: string): DevPreviewLayout {
  const normalized = pathname.replace(/\/$/, "") || "/dev";
  let best: DevPreviewLink | undefined;
  for (const preview of DEV_PREVIEW_LINKS) {
    if (preview.href === "/dev") continue;
    const matches =
      normalized === preview.href ||
      (!preview.exact && normalized.startsWith(`${preview.href}/`));
    if (!matches) continue;
    if (!best || preview.href.length > best.href.length) {
      best = preview;
    }
  }
  return best?.layout ?? DEV_PREVIEW_LAYOUT.document;
}

export function isDevPreviewActive(pathname: string, preview: DevPreviewLink): boolean {
  const normalized = pathname.replace(/\/$/, "") || "/dev";
  if (preview.href === "/dev") {
    return normalized === "/dev";
  }
  if (preview.exact) {
    return normalized === preview.href;
  }
  return normalized === preview.href || normalized.startsWith(`${preview.href}/`);
}
