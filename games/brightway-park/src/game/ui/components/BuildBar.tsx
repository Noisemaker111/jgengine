import { useEffect, useState } from "react";
import { useGame, useGameStore } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { useStore } from "@jgengine/react/store";
import { KitActionPrompt, KitButton, KitPanel } from "@jgengine/react/uiKitRoot";

import {
  BUILDABLES,
  CATEGORY_ICON,
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  RIDE_GROUPS,
  RIDE_GROUP_LABEL,
  type BuildCategory,
  type BuildableDef,
  type RideGroup,
} from "../../objects/catalog";
import { session } from "../../session";
import { placementHintStore } from "../../build/placementHint";
import { isLandTool, LAND_COST, LAND_TOOLS } from "../../build/terrain";
import { LINE_KINDS } from "../../build/commands";
import { canUndo } from "../../build/undo";
import { PRICE_TOLERANCE } from "../../park";
import { guestRidePreference, rideFit } from "../../sim/rideExperience";
import { coasterCircuit } from "../../rides";
import { usePark } from "../usePark";

/** The three numbers a ride is judged by, as a compact line. */
function ratingsLine(def: BuildableDef): string {
  const ride = def.ride!;
  return `Excitement ${ride.excitement.toFixed(1)} · Intensity ${ride.intensity.toFixed(1)} · Nausea ${ride.nausea.toFixed(1)}`;
}

/** What the footer says about the picked blueprint: its numbers, or why it can't go here. */
function blueprintDetail(def: BuildableDef, circuit: ReturnType<typeof coasterCircuit>): string {
  const how = LINE_KINDS.has(def.id) ? " · click, or drag to lay a line" : "";
  if (def.ride !== undefined && def.id !== "ride_coaster") {
    const fits = ["guest_a", "guest_c", "guest_d"].map((k) => `${guestRidePreference(k).label} ${Math.round(rideFit(k, def.id, circuit) * 100)}%`).join(" · ");
    return `${ratingsLine(def)} · ${def.ride.capacity} riders · $${def.ride.price} ticket · ${fits}`;
  }
  if (def.category === "track" || def.id === "ride_coaster") return circuit.closed ? `${Math.round(circuit.length)} m lap · ${circuit.lapSeconds.toFixed(1)} s ride · excitement ${circuit.excitement.toFixed(1)}` : "Lay track until the loop comes back to the station";
  if (def.stall !== undefined) return `Sells at $${def.stall.price} · guests pay up to $${Math.floor(def.stall.value * PRICE_TOLERANCE)} · $${def.upkeep} a day`;
  if (def.theme !== undefined) return `Adds ${def.theme.bonus} charm to every ride within ${def.theme.radius} m`;
  return `${def.blurb}${how}`;
}

/** The catalog as a strip of fair tickets: pick a category (and ride family), pick a ticket, place it on the park. */
export function BuildBar({ onClose, onResearch }: { onClose: () => void; onResearch: () => void }) {
  const [category, setCategory] = useState<BuildCategory>("ride");
  const [group, setGroup] = useState<RideGroup>("gentle");
  const { commands } = useGame();
  const w = usePark();
  const ctx = useGameContext();
  const cash = w.num("park.cash");
  const selected = useGameStore(() => session.selectedTool);
  const undoable = useGameStore(() => canUndo());
  const refusal = useStore(placementHintStore);
  useEffect(() => {
    if (isLandTool(selected)) { setCategory("land"); return; }
    const def = selected === null ? undefined : BUILDABLES[selected];
    if (def === undefined) return;
    setCategory(def.category);
    if (def.ride !== undefined) setGroup(def.ride.group);
  }, [selected]);
  const blueprint = selected === null ? undefined : BUILDABLES[selected];
  const land = isLandTool(selected) ? LAND_TOOLS[selected] : undefined;
  const circuit = coasterCircuit(ctx);
  const detail = land !== undefined ? refusal ?? `${land.label} · $${LAND_COST} a cell · click a cell or drag over an area · U undoes`
    : blueprint === undefined ? "Pick a ticket, then a green spot on the park. Click anything built to inspect it."
    : refusal ?? blueprintDetail(blueprint, circuit);
  const items = Object.values(BUILDABLES).filter((d) => d.category === category && (category !== "ride" || d.ride?.group === group));
  const picked = blueprint?.label ?? land?.label;
  return (
    <div className="bw-build">
      {picked !== undefined ? <KitActionPrompt action="clearTool" label={`Done placing ${picked}`} tone="neutral" onActivate={() => commands.run("clearTool", {})} /> : null}
      <KitPanel as="nav" aria-label="Build palette" footer={<span className="bw-hint" data-bad={refusal !== null && picked !== undefined ? "" : undefined}>{detail}</span>}>
        <div className="bw-tabs" role="toolbar" aria-label="Blueprint categories">
          {CATEGORY_ORDER.map((c) => <KitButton key={c} size="sm" variant="ghost" pressed={category === c} icon={CATEGORY_ICON[c]} aria-label={CATEGORY_LABEL[c]} onClick={() => setCategory(c)}><span className="bw-wide">{CATEGORY_LABEL[c]}</span></KitButton>)}
          <KitButton size="sm" variant="ghost" icon="↶" aria-label="Undo" title="Undo the last build, demolish or land change (U)" disabled={!undoable} onClick={() => commands.run("build.undo", {})}><span className="bw-wide">Undo</span></KitButton>
          <KitButton size="sm" variant="ghost" icon="🔬" aria-label="Research lab" title="Research new rides, shops and scenery (R)" onClick={onResearch}><span className="bw-wide">Lab</span></KitButton>
          <KitButton size="sm" variant="ghost" cue="close" aria-label="Close build palette" onClick={onClose}>✕</KitButton>
        </div>
        {category === "ride" ? <div className="bw-tabs" role="toolbar" aria-label="Ride families">
          {RIDE_GROUPS.map((g) => <KitButton key={g} size="sm" variant="ghost" pressed={group === g} onClick={() => setGroup(g)}>{RIDE_GROUP_LABEL[g]}</KitButton>)}
        </div> : null}
        <div className="bw-tickets" role="group" aria-label="Blueprints">
          {category === "land" ? Object.entries(LAND_TOOLS).map(([id, tool]) => (
            <KitButton key={id} pressed={selected === id} variant={selected === id ? "primary" : "secondary"} icon={tool.icon} title={tool.blurb} onClick={() => commands.run("build.select", { id })}
              glyph={<span data-bad={cash < LAND_COST ? "" : undefined}>${LAND_COST}</span>}>{tool.label}</KitButton>
          )) : null}
          {items.map((def) => {
            // Locked is the world's word: the kind's `when` reads its lab topic. A locked ticket opens the lab.
            const locked = w.canPlace(def.id)?.reason === "locked";
            return <KitButton key={def.id} pressed={selected === def.id} variant={selected === def.id ? "primary" : "secondary"} icon={locked ? "🔬" : def.icon}
              title={locked ? `${def.blurb} (research it in the lab first)` : def.blurb}
              onClick={() => (locked ? onResearch() : commands.run("build.select", { id: def.id }))}
              glyph={locked ? `Lab $${(def.research?.cost ?? 0).toLocaleString()}` : <span data-bad={cash < def.cost ? "" : undefined}>${def.cost.toLocaleString()}</span>}>{def.label}</KitButton>;
          })}
        </div>
      </KitPanel>
    </div>
  );
}
