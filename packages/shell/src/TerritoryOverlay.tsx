import type { CSSProperties, ReactNode } from "react";

/** A placement footprint cell and its authoritative preview status. */
export type TerritoryPreviewCell = { key: string; x: number; z: number; status: "owned" | "claimable" | "blocked" };

/**
 * Placement footprint feedback with inline claim cost and affordability.
 * @capability territory-overlay show footprint ownership, claim cost, and affordability
 */
export function TerritoryOverlay({ cells, cost, affordable, formatCost = String, renderCell, className, style }: {
  cells: readonly TerritoryPreviewCell[];
  cost: number;
  affordable: boolean;
  formatCost?: (cost: number) => ReactNode;
  renderCell?: (cell: TerritoryPreviewCell) => ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const blocked = cells.some((cell) => cell.status === "blocked");
  return <div className={className} style={{ pointerEvents: "none", ...style }} data-territory-overlay>
    <div style={{ display: "flex", gap: 3 }}>{cells.map((cell) => <span key={cell.key} data-territory-cell={cell.status} title={`${cell.x}, ${cell.z}: ${cell.status}`}>
      {renderCell ? renderCell(cell) : <span aria-label={cell.status} style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: cell.status === "owned" ? "var(--jg-accent, #5fc2a8)" : cell.status === "claimable" ? "#d6a548" : "#d96969" }} />}
    </span>)}</div>
    <output aria-live="polite" data-affordable={affordable} data-blocked={blocked}>
      {blocked ? "Land unavailable" : <>Land: {formatCost(cost)}{affordable ? "" : " — Insufficient funds"}</>}
    </output>
  </div>;
}
