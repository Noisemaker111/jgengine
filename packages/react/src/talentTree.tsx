import { type CSSProperties, type ReactNode } from "react";

import type { TalentNodeDef, TalentTree as TalentTreeModel } from "@jgengine/core/game/talents";
import {
  talentTreeView,
  type TalentNodeState,
  type TalentNodeView,
  type TalentTreeView,
} from "@jgengine/core/game/talentTreeView";

import { GameIcon, iconForAction, iconForItemId, isGameIconName, type GameIconName } from "./gameIcons";
import { HudFrame, type HudFrameVariation } from "./hudFrame";

/** How a node id resolves to display art: a built-in {@link GameIconName}, any node, or `null` for the default. */
export type TalentIcon = GameIconName | ReactNode | null;

/** Props for {@link TalentTree}. */
export interface TalentTreeProps<TStat extends string = string> {
  /**
   * A precomputed render view (from `talentTreeView` or `talentTreeViewFrom`). Supply this to drive the
   * widget from *any* unlock rule — a currency threshold, a level, a quest flag — not just point-spend.
   * When given, `nodes`/`tree` are ignored. Otherwise pass `nodes` + `tree` for the point-spend path.
   */
  view?: TalentTreeView;
  /** The tree's node definitions — the same array passed to `createTalentTree`. Used when `view` is omitted. */
  nodes?: readonly TalentNodeDef<TStat>[];
  /** The live talent-tree instance whose ranks/points drive node state. Used when `view` is omitted. */
  tree?: TalentTreeModel<TStat>;
  /** Fired with a node id when the player clicks a node that is currently allocatable. Wire it to your unlock/allocate effect (e.g. `tree.allocate`, or spend cash, or set a flag). */
  onLearn?: (nodeId: string) => void;
  /** Show the points-remaining badge in the frame header. Default `true`; pass `false` for trees with no point currency. */
  showPoints?: boolean;
  /** Resolve a node id to its icon. Default: keyword-match the id, else the node's initials. */
  icon?: (nodeId: string) => TalentIcon;
  /** Resolve a node id to a human label (tooltip title + accessible name). Default: the id. */
  label?: (nodeId: string) => ReactNode;
  /** Resolve a branch key to a column header. Default: the branch string (blank branch → no header). */
  branchLabel?: (branch: string) => ReactNode;
  /** Frame title. Default `Talents`. Pass `null` to render without a frame header. */
  title?: ReactNode;
  /** {@link HudFrame} skin. Default `themed`. */
  variation?: HudFrameVariation;
  /** Node tile diameter in px. Default 54. */
  nodeSize?: number;
  /** Horizontal gap between node columns in px. Default 30. */
  columnGap?: number;
  /** Vertical gap between tiers in px. Default 46. */
  tierGap?: number;
  className?: string;
  style?: CSSProperties;
}

const STATE_STYLE: Record<TalentNodeState, { border: string; bg: string; opacity: number; glow: string }> = {
  locked: {
    border: "1px solid rgba(148,163,184,0.28)",
    bg: "var(--jg-slot-bg, rgba(12,14,20,0.72))",
    opacity: 0.42,
    glow: "none",
  },
  available: {
    border: "2px solid var(--jg-accent, #38bdf8)",
    bg: "var(--jg-slot-bg, rgba(12,14,20,0.72))",
    opacity: 1,
    glow: "0 0 0 3px color-mix(in srgb, var(--jg-accent, #38bdf8) 22%, transparent)",
  },
  learned: {
    border: "2px solid var(--jg-accent, #38bdf8)",
    bg: "color-mix(in srgb, var(--jg-accent, #38bdf8) 18%, rgba(12,14,20,0.8))",
    opacity: 1,
    glow: "0 0 10px color-mix(in srgb, var(--jg-accent, #38bdf8) 30%, transparent)",
  },
  maxed: {
    border: "2px solid var(--jg-accent, #38bdf8)",
    bg: "color-mix(in srgb, var(--jg-accent, #38bdf8) 34%, rgba(12,14,20,0.85))",
    opacity: 1,
    glow: "0 0 14px color-mix(in srgb, var(--jg-accent, #38bdf8) 45%, transparent)",
  },
};

/** @internal Default icon: keyword-resolve the id through the shared game-icon rules, else render initials. */
function DefaultNodeGlyph({ id, size }: { id: string; size: number }): ReactNode {
  const resolved = iconForItemId(id) ?? iconForAction(id);
  if (resolved !== null) return <GameIcon name={resolved} size={size} />;
  const initials = id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase() || "?";
  return <span style={{ fontSize: size * 0.5, fontWeight: 800, letterSpacing: 0.5 }}>{initials}</span>;
}

/** @internal Placement of every node in a shared pixel grid, plus overall extents. */
interface Placement {
  x: Map<string, number>;
  y: Map<string, number>;
  width: number;
  height: number;
  /** Branch header anchors: label + center x + top y. */
  headers: { branch: string; cx: number; top: number }[];
}

const BRANCH_GAP = 34;
const HEADER_H = 22;

/** @internal Assign each node a grid cell by branch column and tier row, then resolve to pixel centers. */
function place(
  view: ReturnType<typeof talentTreeView>,
  nodeSize: number,
  columnGap: number,
  tierGap: number,
): Placement {
  const cellW = nodeSize + columnGap;
  const cellH = nodeSize + tierGap;

  // Bucket nodes by branch, then by tier, to size each branch and slot nodes within a tier row.
  const perBranch = new Map<string, TalentNodeView[]>();
  for (const branch of view.branches) perBranch.set(branch, []);
  for (const node of view.nodes) perBranch.get(node.branch)!.push(node);

  const x = new Map<string, number>();
  const y = new Map<string, number>();
  const headers: { branch: string; cx: number; top: number }[] = [];
  const padX = columnGap / 2;
  const padY = HEADER_H;
  let colCursor = 0; // running column index across all branches
  let branchIndex = 0;

  for (const branch of view.branches) {
    const branchNodes = perBranch.get(branch)!;
    const byTier = new Map<number, TalentNodeView[]>();
    for (const node of branchNodes) {
      const bucket = byTier.get(node.tier) ?? [];
      bucket.push(node);
      byTier.set(node.tier, bucket);
    }
    const branchWidth = Math.max(1, ...[...byTier.values()].map((b) => b.length));
    const branchBaseX = padX + colCursor * cellW + branchIndex * BRANCH_GAP;

    for (const [tier, bucket] of byTier) {
      // Center this tier's nodes within the branch's column span.
      const offset = (branchWidth - bucket.length) / 2;
      bucket.forEach((node, i) => {
        const cx = branchBaseX + (offset + i) * cellW + nodeSize / 2;
        const cy = padY + tier * cellH + nodeSize / 2;
        x.set(node.id, cx);
        y.set(node.id, cy);
      });
    }

    const cx = branchBaseX + (branchWidth * cellW) / 2;
    headers.push({ branch, cx, top: 0 });
    colCursor += branchWidth;
    branchIndex += 1;
  }

  const totalCols = colCursor;
  const width = padX * 2 + totalCols * cellW + Math.max(0, view.branches.length - 1) * BRANCH_GAP;
  const height = padY + Math.max(1, view.tiers) * cellH;
  return { x, y, width, height, headers };
}

/** @internal One SVG prerequisite edge, colored by whether it is currently met. */
function Edge({ x1, y1, x2, y2, met }: { x1: number; y1: number; x2: number; y2: number; met: boolean }): ReactNode {
  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={met ? "var(--jg-accent, #38bdf8)" : "rgba(148,163,184,0.32)"}
      strokeWidth={met ? 3 : 2}
      strokeLinecap="round"
      strokeDasharray={met ? undefined : "5 6"}
      opacity={met ? 0.9 : 0.7}
    />
  );
}

/** @internal A single talent node tile — icon, rank badge, state styling, click-to-learn. */
function TalentNode({
  node,
  cx,
  cy,
  size,
  glyph,
  label,
  onLearn,
}: {
  node: TalentNodeView;
  cx: number;
  cy: number;
  size: number;
  glyph: ReactNode;
  label: ReactNode;
  onLearn?: (id: string) => void;
}): ReactNode {
  const s = STATE_STYLE[node.state];
  const interactive = node.allocatable && onLearn !== undefined;
  const showRank = node.maxRank > 1 || node.rank > 0;
  const labelText = typeof label === "string" ? label : node.id;
  return (
    <button
      type="button"
      data-talent-node={node.id}
      data-talent-state={node.state}
      aria-label={`${labelText} — ${node.state}${node.maxRank > 1 ? `, rank ${node.rank} of ${node.maxRank}` : ""}`}
      title={labelText}
      disabled={!interactive}
      onClick={interactive ? () => onLearn!(node.id) : undefined}
      style={{
        position: "absolute",
        left: cx - size / 2,
        top: cy - size / 2,
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        borderRadius: "var(--jg-slot-radius, 12px)",
        border: s.border,
        background: s.bg,
        color: "var(--jg-bar-text, #f4f6fb)",
        opacity: s.opacity,
        boxShadow: interactive ? `${s.glow}, 0 0 0 2px color-mix(in srgb, var(--jg-accent, #38bdf8) 40%, transparent)` : s.glow,
        cursor: interactive ? "pointer" : "default",
        pointerEvents: "auto",
        boxSizing: "border-box",
        transition: "box-shadow 120ms ease, opacity 120ms ease",
      }}
    >
      <span aria-hidden style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>{glyph}</span>
      {showRank ? (
        <span
          data-talent-rank=""
          style={{
            position: "absolute",
            right: -6,
            bottom: -6,
            minWidth: 20,
            height: 18,
            padding: "0 4px",
            borderRadius: 9,
            background: node.state === "maxed" ? "var(--jg-accent, #38bdf8)" : "rgba(6,10,16,0.92)",
            color: node.state === "maxed" ? "#06121b" : "var(--jg-bar-text, #f4f6fb)",
            border: "1px solid var(--jg-accent, #38bdf8)",
            fontSize: 10.5,
            fontWeight: 800,
            fontVariantNumeric: "tabular-nums",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxSizing: "border-box",
          }}
        >
          {node.rank}/{node.maxRank}
        </span>
      ) : null}
    </button>
  );
}

/**
 * Drop-in talent / skill-tree widget over the existing progression model
 * (`@jgengine/core/game/talents` + its `talentTreeView` selector). The game passes its node
 * definitions and a live `createTalentTree` instance; the widget lays nodes out by branch column and
 * prerequisite-depth tier, draws SVG prerequisite edges, styles each node learned/available/locked/maxed,
 * shows an icon + rank badge, and calls `onLearn(nodeId)` when the player clicks a node that is
 * currently allocatable. All layout, edge-drawing, and eligibility come from the model/selector — the
 * widget never re-derives topology. Unskinned and HudTheme-token driven; node ids/branches are opaque
 * game data the game supplies icons and labels for.
 *
 * For the point-spend path pass `nodes` + a live `tree`. To drive the tree from *any* other unlock
 * rule (a currency threshold, a level, a quest flag), build a view with `talentTreeViewFrom` and pass
 * it as `view` — the same widget then renders a money-gated upgrade tree or a condition-unlocked
 * ability web, no renderer change.
 *
 * @capability talent-tree drop-in skill/talent/upgrade-tree widget — pass `nodes`+`tree` for point-spend or a precomputed `view` for any unlock rule; branch/tier layout, SVG prerequisite edges, learned/available/locked/maxed styling, icon + rank, onLearn
 */
export function TalentTree<TStat extends string = string>({
  view: viewProp,
  nodes,
  tree,
  onLearn,
  icon,
  label,
  branchLabel,
  title = "Talents",
  variation = "themed",
  nodeSize = 54,
  columnGap = 30,
  tierGap = 46,
  showPoints = true,
  className,
  style,
}: TalentTreeProps<TStat>): ReactNode {
  if (viewProp === undefined && (nodes === undefined || tree === undefined)) {
    throw new Error("TalentTree requires either a `view` prop or both `nodes` and `tree`.");
  }
  const view = viewProp ?? talentTreeView(nodes!, tree!);
  const layout = place(view, nodeSize, columnGap, tierGap);

  const resolveGlyph = (id: string): ReactNode => {
    const custom = icon?.(id);
    if (custom === undefined || custom === null) return <DefaultNodeGlyph id={id} size={nodeSize * 0.5} />;
    if (typeof custom === "string" && isGameIconName(custom)) return <GameIcon name={custom} size={nodeSize * 0.5} />;
    return custom;
  };
  const resolveLabel = (id: string): ReactNode => label?.(id) ?? id;
  const resolveBranch = (branch: string): ReactNode => branchLabel?.(branch) ?? (branch === "" ? null : branch);

  const centerOf = (id: string): { x: number; y: number } | null => {
    const x = layout.x.get(id);
    const y = layout.y.get(id);
    return x === undefined || y === undefined ? null : { x, y };
  };

  const body = (
    <div
      data-talent-tree=""
      style={{ position: "relative", width: layout.width, height: layout.height, margin: "0 auto" }}
    >
      {/* Branch column headers. */}
      {layout.headers.map((header) => {
        const text = resolveBranch(header.branch);
        if (text === null) return null;
        return (
          <div
            key={`h-${header.branch}`}
            data-talent-branch={header.branch}
            style={{
              position: "absolute",
              left: header.cx,
              top: header.top,
              transform: "translateX(-50%)",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 1.4,
              textTransform: "uppercase",
              opacity: 0.7,
              color: "var(--jg-bar-text, #f4f6fb)",
              whiteSpace: "nowrap",
            }}
          >
            {text}
          </div>
        );
      })}

      {/* Prerequisite edges, drawn behind the nodes. */}
      <svg
        width={layout.width}
        height={layout.height}
        style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}
        aria-hidden
      >
        {view.nodes.flatMap((node) => {
          const to = centerOf(node.id);
          if (to === null) return [];
          return node.requires.flatMap((edge) => {
            const from = centerOf(edge.from);
            if (from === null) return [];
            return [
              <Edge key={`${edge.from}->${node.id}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} met={edge.met} />,
            ];
          });
        })}
      </svg>

      {/* Nodes. */}
      {view.nodes.map((node) => {
        const center = centerOf(node.id);
        if (center === null) return null;
        return (
          <TalentNode
            key={node.id}
            node={node}
            cx={center.x}
            cy={center.y}
            size={nodeSize}
            glyph={resolveGlyph(node.id)}
            label={resolveLabel(node.id)}
            {...(onLearn === undefined ? {} : { onLearn })}
          />
        );
      })}
    </div>
  );

  const pointsBadge = showPoints ? (
    <span data-talent-points="" style={{ fontVariantNumeric: "tabular-nums" }}>
      {view.pointsAvailable} pt{view.pointsAvailable === 1 ? "" : "s"}
    </span>
  ) : undefined;

  if (title === null) {
    return (
      <div className={className} style={style}>
        {body}
      </div>
    );
  }
  return (
    <HudFrame
      variation={variation}
      title={title}
      {...(pointsBadge === undefined ? {} : { aside: pointsBadge })}
      interactive
      padding={16}
      {...(className === undefined ? {} : { className })}
      {...(style === undefined ? {} : { style })}
    >
      {body}
    </HudFrame>
  );
}
