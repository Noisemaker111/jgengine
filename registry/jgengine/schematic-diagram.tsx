const HUD_TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.55)";

export type SchematicTone = "accent" | "danger" | "warning" | "dim";

export interface SchematicNode {
  id: string;
  /** Panel-space position in [0, 1] — fixed layout, independent of any world position. */
  x: number;
  y: number;
  label?: string;
  glyph?: string;
  tone?: SchematicTone;
  /** Ring the node (the selected station, the breached vault). */
  active?: boolean;
}

export interface SchematicEdge {
  from: string;
  to: string;
  tone?: SchematicTone;
  /** Dashed — a planned/severed/forecast connection. */
  dashed?: boolean;
  label?: string;
}

function toneColor(tone: SchematicTone | undefined): string {
  if (tone === "danger") return "var(--jg-danger, #e0483e)";
  if (tone === "warning") return "var(--jg-warning, #e8a33d)";
  if (tone === "dim") return "var(--jg-text-dim, #a3947a)";
  return "var(--jg-accent, #e3b054)";
}

/**
 * Fixed-panel node+edge schematic — circuit layouts, rail networks, heist floor plans, skill webs.
 * Pure presentational: positions are panel fractions, not world coordinates; game glue decides both.
 */
export function SchematicDiagram({
  nodes,
  edges = [],
  width = 260,
  height = 180,
  title,
  className,
}: {
  nodes: readonly SchematicNode[];
  edges?: readonly SchematicEdge[];
  width?: number;
  height?: number;
  title?: string;
  className?: string;
}) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const px = (node: SchematicNode) => ({ x: node.x * width, y: node.y * height });

  return (
    <div
      className={className}
      data-schematic
      style={{
        width,
        borderRadius: 10,
        padding: 8,
        background: "rgba(10,12,16,0.82)",
        border: "1px solid var(--jg-edge, #57452c)",
        color: "var(--jg-text, #f2e7d0)",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
      }}
    >
      {title !== undefined ? (
        <div
          style={{
            fontSize: 10,
            letterSpacing: 1.4,
            textTransform: "uppercase",
            marginBottom: 4,
            color: "var(--jg-text-dim, #a3947a)",
            textShadow: HUD_TEXT_SHADOW,
          }}
        >
          {title}
        </div>
      ) : null}
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {edges.map((edge, index) => {
          const from = byId.get(edge.from);
          const to = byId.get(edge.to);
          if (from === undefined || to === undefined) return null;
          const a = px(from);
          const b = px(to);
          const color = toneColor(edge.tone ?? "dim");
          const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          return (
            <g key={`edge-${index}`} data-schematic-edge={`${edge.from}-${edge.to}`}>
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={color}
                strokeWidth={1.5}
                opacity={0.8}
                {...(edge.dashed === true ? { strokeDasharray: "5 4" } : {})}
              />
              {edge.label !== undefined ? (
                <text x={mid.x} y={mid.y - 3} textAnchor="middle" fontSize={8} fill={color}>
                  {edge.label}
                </text>
              ) : null}
            </g>
          );
        })}
        {nodes.map((node) => {
          const at = px(node);
          const color = toneColor(node.tone);
          return (
            <g key={node.id} data-schematic-node={node.id}>
              {node.active === true ? (
                <circle cx={at.x} cy={at.y} r={11} fill="none" stroke={color} strokeWidth={1.5} opacity={0.9} />
              ) : null}
              <circle cx={at.x} cy={at.y} r={7} fill="rgba(6,8,12,0.9)" stroke={color} strokeWidth={1.5} />
              {node.glyph !== undefined ? (
                <text x={at.x} y={at.y + 3} textAnchor="middle" fontSize={8} fill={color} style={{ fontWeight: 700 }}>
                  {node.glyph}
                </text>
              ) : null}
              {node.label !== undefined ? (
                <text
                  x={at.x}
                  y={at.y + 18}
                  textAnchor="middle"
                  fontSize={9}
                  fill="var(--jg-text, #f2e7d0)"
                  style={{ textShadow: HUD_TEXT_SHADOW }}
                >
                  {node.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
