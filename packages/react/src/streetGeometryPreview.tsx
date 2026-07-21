import {
  buildIntersectionMarkings,
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
    <div className={className} style={{ minHeight: "100%", background: "radial-gradient(circle at 78% 68%, #25425a 0%, #142b40 28%, #0b1d2e 62%, #07131f 100%)", color: "#dbeafe", padding: 18, fontFamily: "ui-monospace, monospace" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <h1 style={{ margin: "0 0 6px", fontSize: 24 }}>Street geometry close-ups</h1>
        <p style={{ margin: "0 0 20px", color: "#7dd3fc", fontSize: 13 }}>
          Compact carriageway-union junctions: 45°/90° turns, unequal T, unequal cross, five-way. Pale = sidewalks; blue = pavement; cream = markings.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
          {cases.map((entry) => {
            const patternId = `grid-${entry.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
            const streets = entry.streets.map((street) => ({
              ...street,
              sidewalks: { left: 2.2, right: 2.2 },
              markings: { lines: [{ offset: 0, width: 0.2 }], stopLine: true },
            }));
            const geometry = buildTrimmedIntersections(streets, [entry.junction], () => 0, {
              curbReturnRadius: 2,
              apronMargin: 0.25,
              filletSegments: 10,
            });
            const surface = geometry.junctions[0]!;
            const markings = buildIntersectionMarkings(geometry, () => 0, {
              mouthClearance: 1.25,
              dashLength: 4.8,
              dashGap: 4,
            });
            let extent = 0;
            for (let i = 3; i < surface.positions.length; i += 3) {
              extent = Math.max(extent, Math.hypot(surface.positions[i]!, surface.positions[i + 2]!));
            }
            return (
              <section key={entry.name} style={{ background: "#10263a", border: "1px solid #285174", borderRadius: 10, overflow: "hidden" }}>
                <div style={{ padding: "8px 12px 3px", display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <strong style={{ fontSize: 14 }}>{entry.name}</strong>
                  <span style={{ color: "#67e8f9", fontSize: 11 }}>extent {extent.toFixed(1)}</span>
                </div>
                <svg viewBox="0 0 280 205" role="img" aria-label={`${entry.name} road mesh`} style={{ display: "block", width: "100%", height: "auto" }}>
                  <defs>
                    <pattern id={patternId} width="20" height="20" patternUnits="userSpaceOnUse">
                      <rect width="20" height="20" fill="#0d2234" />
                      <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#1d4b68" strokeWidth="0.8" />
                    </pattern>
                  </defs>
                  <rect width="280" height="205" fill={`url(#${patternId})`} />
                  {geometry.sidewalks.flatMap((ribbon, ri) => triangles(ribbon, 2.65, 140, 102).map((points, ti) => (
                    <polygon key={`s-r-${ri}-${ti}`} points={points} fill="#d8c9aa" stroke="#d8c9aa" strokeWidth="0.35" />
                  )))}
                  {geometry.sidewalkAprons.flatMap((junction, ji) => triangles(junction, 2.65, 140, 102).map((points, ti) => (
                    <polygon key={`s-j-${ji}-${ti}`} points={points} fill="#d8c9aa" stroke="#d8c9aa" strokeWidth="0.35" />
                  )))}
                  {geometry.ribbons.flatMap((ribbon, ri) => triangles(ribbon, 2.65, 140, 102).map((points, ti) => (
                    <polygon key={`r-${ri}-${ti}`} points={points} fill="#52677d" stroke="#52677d" strokeWidth="0.35" />
                  )))}
                  {triangles(surface, 2.65, 140, 102).map((points, ti) => (
                    <polygon key={`j-${ti}`} points={points} fill="#2479a4" stroke="#2479a4" strokeWidth="0.35" />
                  ))}
                  {markings.flatMap((marking, mi) => triangles(marking, 2.65, 140, 102).map((points, ti) => (
                    <polygon key={`m-${mi}-${ti}`} points={points} fill="#f8fafc" />
                  )))}
                </svg>
              </section>
            );
          })}
          <section style={{ minHeight: 238, background: "linear-gradient(145deg, #18354c, #10263a)", border: "1px solid #356487", borderRadius: 10, padding: 18 }}>
            <strong style={{ display: "block", marginBottom: 8, fontSize: 15 }}>Shared geometry contract</strong>
            <p style={{ margin: "0 0 14px", color: "#8ed8ef", fontSize: 12, lineHeight: 1.5 }}>
              Every panel is built from the same renderer-neutral meshes consumed by the Three.js city.
            </p>
            {[
              ["#d8c9aa", "Sidewalk annulus", "No pavement overlap"],
              ["#2479a4", "Junction apron", "Bounded by road widths"],
              ["#f8fafc", "Lane guidance", "Mouth clearance + stop lines"],
              ["#4ade80", "Terrain drape", "Every vertex sampled"],
              ["#fbbf24", "Offset continuity", "Positive and negative"],
            ].map(([color, label, detail]) => (
              <div key={label} style={{ display: "grid", gridTemplateColumns: "12px 1fr auto", alignItems: "center", gap: 9, marginTop: 9, fontSize: 11 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: color, boxShadow: `0 0 8px ${color}` }} />
                <span style={{ color: "#e2edf5" }}>{label}</span>
                <span style={{ color: "#82a9c2" }}>{detail}</span>
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
