import {
  buildTrimmedIntersections,
  type IntersectionStreet,
  type RoadJunctionInput,
  type RoadRibbon,
} from "@jgengine/core/world/roads";

interface PreviewCase {
  name: string;
  streets: IntersectionStreet[];
  junction: RoadJunctionInput;
}

const armRoad = (angle: number, width: number): IntersectionStreet => ({
  path: [
    [0, 0],
    [Math.sin(angle) * 36, Math.cos(angle) * 36],
  ],
  width,
});

const cases: PreviewCase[] = [
  {
    name: "90 degree turn",
    streets: [armRoad(Math.PI / 2, 8), armRoad(0, 8)],
    junction: { x: 0, z: 0, arms: [{ angle: Math.PI / 2, width: 8 }, { angle: 0, width: 8 }] },
  },
  {
    name: "45 degree turn",
    streets: [armRoad(Math.PI / 2, 8), armRoad(Math.PI / 4, 8)],
    junction: { x: 0, z: 0, arms: [{ angle: Math.PI / 2, width: 8 }, { angle: Math.PI / 4, width: 8 }] },
  },
  {
    name: "unequal T",
    streets: [
      { path: [[-36, 0], [0, 0], [36, 0]], width: 18 },
      armRoad(0, 8),
    ],
    junction: {
      x: 0,
      z: 0,
      arms: [{ angle: Math.PI / 2, width: 18 }, { angle: -Math.PI / 2, width: 18 }, { angle: 0, width: 8 }],
    },
  },
  {
    name: "unequal cross",
    streets: [
      { path: [[-36, 0], [0, 0], [36, 0]], width: 18 },
      { path: [[0, -36], [0, 0], [0, 36]], width: 8 },
    ],
    junction: {
      x: 0,
      z: 0,
      arms: [
        { angle: Math.PI / 2, width: 18 },
        { angle: -Math.PI / 2, width: 18 },
        { angle: 0, width: 8 },
        { angle: Math.PI, width: 8 },
      ],
    },
  },
  {
    name: "five way",
    streets: [
      armRoad(0, 8),
      armRoad(1.12, 18),
      armRoad(2.42, 10),
      armRoad(3.72, 14),
      armRoad(5.05, 8),
    ],
    junction: {
      x: 0,
      z: 0,
      arms: [
        { angle: 0, width: 8 },
        { angle: 1.12, width: 18 },
        { angle: 2.42, width: 10 },
        { angle: 3.72, width: 14 },
        { angle: 5.05, width: 8 },
      ],
    },
  },
];

function triangles(ribbon: RoadRibbon, scale: number, cx: number, cy: number): string[] {
  const result: string[] = [];
  for (let i = 0; i < ribbon.indices.length; i += 3) {
    const points: string[] = [];
    for (let k = 0; k < 3; k += 1) {
      const vertex = ribbon.indices[i + k]! * 3;
      points.push(`${cx + ribbon.positions[vertex]! * scale},${cy + ribbon.positions[vertex + 2]! * scale}`);
    }
    result.push(points.join(" "));
  }
  return result;
}

/**
 * Deterministic close-up gallery of the shared road/junction mesh seam.
 * @capability world-intersections inspect turns and junction meshes in a deterministic preview fixture
 */
export function StreetGeometryPreview({ className }: { className?: string }) {
  return (
    <div className={className} style={{ minHeight: "100%", background: "#07111f", color: "#dbeafe", padding: 24, fontFamily: "ui-monospace, monospace" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <h1 style={{ margin: "0 0 6px", fontSize: 24 }}>Street geometry close-ups</h1>
        <p style={{ margin: "0 0 20px", color: "#7dd3fc", fontSize: 13 }}>
          Exact trimmed ribbons and welded surfaces. Blue is junction-owned pavement; gray is road-owned pavement.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16 }}>
          {cases.map((entry) => {
            const geometry = buildTrimmedIntersections(entry.streets, [entry.junction], () => 0, { filletSegments: 10 });
            const surface = geometry.junctions[0]!;
            let extent = 0;
            for (let i = 3; i < surface.positions.length; i += 3) {
              extent = Math.max(extent, Math.hypot(surface.positions[i]!, surface.positions[i + 2]!));
            }
            return (
              <section key={entry.name} style={{ background: "#0b1b2d", border: "1px solid #1e3a5f", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "12px 14px 4px", display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <strong style={{ fontSize: 14 }}>{entry.name}</strong>
                  <span style={{ color: "#67e8f9", fontSize: 11 }}>extent {extent.toFixed(1)}</span>
                </div>
                <svg viewBox="0 0 280 240" role="img" aria-label={`${entry.name} road mesh`} style={{ display: "block", width: "100%", height: "auto" }}>
                  <defs>
                    <pattern id={`grid-${entry.name}`} width="20" height="20" patternUnits="userSpaceOnUse">
                      <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#123352" strokeWidth="0.7" />
                    </pattern>
                  </defs>
                  <rect width="280" height="240" fill={`url(#grid-${entry.name})`} />
                  {geometry.ribbons.flatMap((ribbon, ri) => triangles(ribbon, 3.2, 140, 120).map((points, ti) => (
                    <polygon key={`r-${ri}-${ti}`} points={points} fill="#64748b" stroke="#64748b" strokeWidth="0.35" />
                  )))}
                  {triangles(surface, 3.2, 140, 120).map((points, ti) => (
                    <polygon key={`j-${ti}`} points={points} fill="#0284c7" stroke="#0284c7" strokeWidth="0.35" />
                  ))}
                  <circle cx="140" cy="120" r="2.5" fill="#f8fafc" />
                </svg>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
