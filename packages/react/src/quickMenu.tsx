import { useMemo, useState, type CSSProperties, type ReactNode } from "react";

import type { RadialArc } from "@jgengine/core/ui/radialMenu";

import { RadialMenu, type RadialMenuOption } from "./radialMenu";

/** An entry on a {@link QuickMenu}: a leaf action, or (with `children`) a submenu. */
export interface QuickMenuItem extends RadialMenuOption {
  /** Nested items; selecting this entry drills into them instead of firing `onSelect`. */
  children?: readonly QuickMenuItem[];
  /** Optional group heading (list/grid layouts). */
  section?: string;
}

/** The forms a {@link QuickMenu} can take. */
export type QuickMenuLayout = "radial" | "arc" | "list" | "grid";

/** Props for {@link QuickMenu}. */
export interface QuickMenuProps {
  items: readonly QuickMenuItem[];
  layout?: QuickMenuLayout;
  onSelect: (id: string) => void;
  onClose?: () => void;
  title?: string;
  /** Grid columns. Default 3. */
  columns?: number;
  /** Arc span for `layout="arc"`. Default a bottom half. */
  arc?: RadialArc;
  /** Diameter for radial/arc forms. Default 300. */
  radialSize?: number;
  accent?: string;
  className?: string;
  style?: CSSProperties;
}

const PANEL: CSSProperties = {
  borderRadius: 14,
  padding: 12,
  background: "linear-gradient(160deg, rgba(20,24,32,0.94), rgba(11,14,19,0.94))",
  border: "1px solid var(--jg-ring, rgba(148,163,184,0.3))",
  color: "#e2e8f0",
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
};

function groupBySection(items: readonly QuickMenuItem[]): { section: string | undefined; items: QuickMenuItem[] }[] {
  const groups: { section: string | undefined; items: QuickMenuItem[] }[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last !== undefined && last.section === item.section) last.items.push(item);
    else groups.push({ section: item.section, items: [item] });
  }
  return groups;
}

function Badges({ item, accent }: { item: QuickMenuItem; accent: string }): ReactNode {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {item.cooldown !== undefined && item.cooldown > 0 ? (
        <span style={{ fontSize: 10, color: "rgba(148,163,184,0.85)" }}>{Math.ceil(item.cooldown * 100)}%</span>
      ) : null}
      {item.badge !== undefined ? (
        <span style={{ fontSize: 11, fontWeight: 700, color: accent, fontVariantNumeric: "tabular-nums" }}>{item.badge}</span>
      ) : null}
      {item.hotkey !== undefined ? (
        <kbd style={{ fontSize: 10, padding: "1px 5px", borderRadius: 4, border: "1px solid rgba(148,163,184,0.4)", color: "rgba(226,232,240,0.85)" }}>
          {item.hotkey}
        </kbd>
      ) : null}
      {item.children !== undefined ? <span style={{ color: "rgba(226,232,240,0.7)" }}>▸</span> : null}
    </span>
  );
}

/**
 * Versatile quick menu that takes many forms — a `radial` wheel, a partial
 * `arc`, a vertical `list`, or a `grid` — over one item model with icons,
 * labels, hotkeys, count badges, cooldowns, section headers, and nested
 * submenus (drill in / back). Radial and arc forms reuse {@link RadialMenu};
 * list and grid render sectioned rows/tiles. The game supplies content and skin.
 *
 * @capability quick-menu multi-form quick menu (radial / arc / list / grid) over one item model with hotkeys, badges, cooldowns, sections, and nested submenus
 */
export function QuickMenu({
  items,
  layout = "list",
  onSelect,
  onClose,
  title,
  columns = 3,
  arc = { startAngle: Math.PI / 2, sweep: Math.PI },
  radialSize = 300,
  accent = "var(--jg-accent, #38bdf8)",
  className,
  style,
}: QuickMenuProps): ReactNode {
  const [path, setPath] = useState<readonly string[]>([]);
  const current = useMemo(() => {
    let level: readonly QuickMenuItem[] = items;
    for (const id of path) {
      const next = level.find((item) => item.id === id)?.children;
      if (next === undefined) return level;
      level = next;
    }
    return level;
  }, [items, path]);

  const activate = (item: QuickMenuItem): void => {
    if (item.disabled === true) return;
    if (item.children !== undefined && item.children.length > 0) setPath((p) => [...p, item.id]);
    else onSelect(item.id);
  };
  const back = (): void => setPath((p) => p.slice(0, -1));

  const header =
    title !== undefined || path.length > 0 ? (
      <div data-quick-header style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        {path.length > 0 ? (
          <button type="button" data-quick-back onClick={back}
            style={{ border: "1px solid rgba(148,163,184,0.4)", borderRadius: 6, background: "transparent", color: "#e2e8f0", fontSize: 11, padding: "2px 8px", cursor: "pointer" }}>
            ‹ Back
          </button>
        ) : null}
        {title !== undefined ? (
          <span style={{ fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: "rgba(203,213,225,0.75)" }}>{title}</span>
        ) : null}
      </div>
    ) : null;

  if (layout === "radial" || layout === "arc") {
    const options: RadialMenuOption[] = current.map((item) => ({ ...item, hasSubmenu: item.children !== undefined && item.children.length > 0 }));
    return (
      <div className={className} data-quick-menu data-layout={layout} style={{ position: "relative", ...style }}>
        {header}
        <RadialMenu
          options={options}
          size={radialSize}
          accent={accent}
          {...(layout === "arc" ? { arc } : {})}
          onSelect={(id) => {
            const item = current.find((entry) => entry.id === id);
            if (item !== undefined) activate(item);
          }}
          onClose={onClose}
        />
      </div>
    );
  }

  const groups = groupBySection(current);

  if (layout === "grid") {
    return (
      <div className={className} data-quick-menu data-layout="grid" style={{ ...PANEL, width: columns * 92 + 24, ...style }}>
        {header}
        {groups.map((group, gi) => (
          <div key={group.section ?? gi} data-section={group.section}>
            {group.section !== undefined ? (
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "rgba(148,163,184,0.75)", margin: "6px 0 4px" }}>{group.section}</div>
            ) : null}
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 6 }}>
              {group.items.map((item) => (
                <button key={item.id} type="button" data-quick-item={item.id} data-disabled={item.disabled === true} onClick={() => activate(item)}
                  disabled={item.disabled === true}
                  style={{
                    position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "10px 4px",
                    borderRadius: 10, border: "1px solid rgba(148,163,184,0.25)", background: "rgba(17,22,30,0.7)", color: "#e2e8f0",
                    cursor: item.disabled === true ? "default" : "pointer", opacity: item.disabled === true ? 0.4 : 1,
                  }}>
                  <span style={{ fontSize: 22 }}>{item.icon}</span>
                  {item.label !== undefined ? <span style={{ fontSize: 10 }}>{item.label}</span> : null}
                  {item.badge !== undefined ? (
                    <span style={{ position: "absolute", top: 3, right: 5, fontSize: 10, fontWeight: 700, color: accent }}>{item.badge}</span>
                  ) : null}
                  {item.children !== undefined ? <span style={{ position: "absolute", bottom: 3, right: 5, fontSize: 10 }}>▸</span> : null}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // list
  return (
    <div className={className} data-quick-menu data-layout="list" style={{ ...PANEL, width: 240, ...style }}>
      {header}
      {groups.map((group, gi) => (
        <div key={group.section ?? gi} data-section={group.section}>
          {group.section !== undefined ? (
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, color: "rgba(148,163,184,0.75)", margin: "6px 0 4px" }}>{group.section}</div>
          ) : null}
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 2 }}>
            {group.items.map((item) => (
              <li key={item.id}>
                <button type="button" data-quick-item={item.id} data-disabled={item.disabled === true} onClick={() => activate(item)}
                  disabled={item.disabled === true}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "7px 9px", borderRadius: 8,
                    border: "1px solid transparent", background: "transparent", color: "#e2e8f0", fontSize: 13, textAlign: "left",
                    cursor: item.disabled === true ? "default" : "pointer", opacity: item.disabled === true ? 0.45 : 1,
                  }}>
                  {item.icon !== undefined ? <span style={{ width: 22, textAlign: "center", fontSize: 17 }}>{item.icon}</span> : null}
                  <span style={{ flex: 1 }}>{item.label ?? item.id}</span>
                  <Badges item={item} accent={accent} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
