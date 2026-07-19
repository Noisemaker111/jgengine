import { useEffect, useReducer, type CSSProperties, type ReactNode } from "react";

import type { FastTravelNetwork, TravelPointView } from "@jgengine/core/world/fastTravel";
import type { WorldXZ } from "@jgengine/core/world/minimap";

/**
 * Subscribe a component to a fast-travel network's discovery changes. Returns the
 * network unchanged; the hook only forces a re-render when a point is discovered
 * or the network is restored, so callers can read `destinations`/`list` in render.
 *
 * @capability use-fast-travel re-render a component when a fast-travel network's discovery state changes
 */
export function useFastTravel<TMeta = unknown>(network: FastTravelNetwork<TMeta>): FastTravelNetwork<TMeta> {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => network.subscribe(bump), [network]);
  return network;
}

function formatDistance(distance: number | undefined): string | null {
  if (distance === undefined) return null;
  if (distance < 1000) return `${Math.round(distance)}m`;
  return `${(distance / 1000).toFixed(1)}km`;
}

function groupByRegion<TMeta>(
  views: readonly TravelPointView<TMeta>[],
): { region: string | null; points: TravelPointView<TMeta>[] }[] {
  const groups: { region: string | null; points: TravelPointView<TMeta>[] }[] = [];
  const index = new Map<string | null, TravelPointView<TMeta>[]>();
  for (const view of views) {
    const key = view.region ?? null;
    let bucket = index.get(key);
    if (bucket === undefined) {
      bucket = [];
      index.set(key, bucket);
      groups.push({ region: key, points: bucket });
    }
    bucket.push(view);
  }
  return groups;
}

/** Props for {@link FastTravelMenu}. */
export interface FastTravelMenuProps<TMeta = unknown> {
  network: FastTravelNetwork<TMeta>;
  /** Origin for distance sorting/labels — usually the player's world-XZ. */
  from?: WorldXZ;
  /** Fires with the chosen destination id; the game applies the teleport. */
  onTravel?: (id: string, point: TravelPointView<TMeta>) => void;
  /** The id the player is standing on — shown as "You are here", not travelable. */
  currentId?: string;
  title?: string;
  emptyLabel?: string;
  onClose?: () => void;
  className?: string;
  style?: CSSProperties;
}

/**
 * Fast-travel menu — the discovered-destinations list players pick from: points
 * grouped by region, distance-sorted from `from`, each showing icon, name, and
 * distance, with a header counting discovered vs. total. Selecting a row calls
 * `onTravel`; the current location is flagged and not travelable. Bind it to a
 * `createFastTravelNetwork`.
 *
 * @capability fast-travel-menu discovered-destinations picker grouped by region with distances, a discovery counter, and a travel callback
 */
export function FastTravelMenu<TMeta = unknown>({
  network,
  from,
  onTravel,
  currentId,
  title = "Fast Travel",
  emptyLabel = "No destinations discovered yet.",
  onClose,
  className,
  style,
}: FastTravelMenuProps<TMeta>): ReactNode {
  useFastTravel(network);
  const destinations = network.destinations(from);
  const groups = groupByRegion(destinations);
  const discovered = network.discoveredCount();
  const total = network.total();

  return (
    <div
      className={className}
      data-fast-travel
      style={{
        width: 320,
        maxHeight: 460,
        display: "flex",
        flexDirection: "column",
        borderRadius: 14,
        background: "linear-gradient(160deg, rgba(20,24,32,0.97), rgba(11,14,19,0.97))",
        border: "1px solid var(--jg-ring, rgba(148,163,184,0.32))",
        color: "#e2e8f0",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        boxShadow: "0 18px 44px rgba(0,0,0,0.5)",
        ...style,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "10px 12px",
          borderBottom: "1px solid rgba(148,163,184,0.2)",
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase" }}>
          {title}
          <span style={{ marginLeft: 6, color: "rgba(148,163,184,0.7)", fontWeight: 500 }}>
            {discovered}/{total}
          </span>
        </span>
        {onClose !== undefined ? (
          <button
            type="button"
            onClick={onClose}
            style={{
              border: "1px solid rgba(148,163,184,0.4)",
              borderRadius: 6,
              background: "transparent",
              color: "rgba(226,232,240,0.85)",
              fontSize: 11,
              padding: "3px 8px",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        ) : null}
      </div>
      {destinations.length === 0 ? (
        <p style={{ margin: 0, padding: "16px 12px", fontSize: 12, color: "rgba(148,163,184,0.8)" }}>{emptyLabel}</p>
      ) : (
        <div style={{ overflowY: "auto", padding: 6, display: "flex", flexDirection: "column", gap: 8 }}>
          {groups.map((group) => (
            <div key={group.region ?? "__none__"} data-region={group.region ?? ""}>
              {group.region !== null ? (
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 1,
                    textTransform: "uppercase",
                    color: "rgba(148,163,184,0.65)",
                    padding: "2px 6px",
                  }}
                >
                  {group.region}
                </div>
              ) : null}
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                {group.points.map((point) => {
                  const isCurrent = point.id === currentId;
                  const distance = formatDistance(point.distance);
                  return (
                    <li key={point.id}>
                      <button
                        type="button"
                        data-travel-point={point.id}
                        data-current={isCurrent}
                        disabled={isCurrent}
                        onClick={() => onTravel?.(point.id, point)}
                        style={{
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "9px 10px",
                          borderRadius: 9,
                          border: "1px solid transparent",
                          background: isCurrent ? "rgba(56,189,248,0.12)" : "rgba(148,163,184,0.06)",
                          color: "#e2e8f0",
                          textAlign: "left",
                          cursor: isCurrent ? "default" : "pointer",
                        }}
                      >
                        <span style={{ fontSize: 18, width: 22, textAlign: "center", flexShrink: 0 }}>
                          {point.icon ?? "📍"}
                        </span>
                        <span style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{point.name}</span>
                          {isCurrent ? (
                            <span style={{ fontSize: 10, color: "rgba(56,189,248,0.85)" }}>You are here</span>
                          ) : null}
                        </span>
                        {distance !== null && !isCurrent ? (
                          <span style={{ fontSize: 11, color: "rgba(148,163,184,0.75)", whiteSpace: "nowrap" }}>
                            {distance}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
