import type { CSSProperties, ReactNode } from "react";
import { Hotbar } from "@jgengine/core/hud/hudReadouts.view";
import { useGameStore } from "@jgengine/react/hooks";
import { HudSlots } from "@jgengine/shell/gameKit";

import { openScreen } from "../screens";
import { HOTBAR } from "../bags";
import { survivorView, type SurvivorView } from "../survivor";
import { itemIcon } from "./ItemIcon";
import { InventoryScreen } from "./InventoryScreen";
import { CreatureReadout, useCreatures } from "./CreatureScreen";

const same = <T,>(a: T, b: T) => JSON.stringify(a) === JSON.stringify(b);

export function useSurvivor(): SurvivorView {
  return useGameStore(survivorView, same);
}

const COLORS = {
  health: "#d8483f",
  stamina: "#e7c84a",
  food: "#d98a3a",
  water: "#3fa0e0",
  oxygen: "#9ad7f0",
  weight: "#b9b0a0",
  torpor: "#a45fd6",
  xp: "#7ad06a",
} as const;

/** ARK's bottom-right column: one round gauge per pool, filling from the bottom, number beside it. */
function Gauge({ id, label, value, max, warn }: { id: keyof typeof COLORS; label: string; value: number; max: number; warn?: boolean }): ReactNode {
  const fill = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const color = COLORS[id];
  return (
    <div data-vital={id} style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
      <span style={{ fontSize: 12, fontVariantNumeric: "tabular-nums", opacity: 0.9, textShadow: "0 1px 2px #000" }}>
        {label} {Math.floor(value)}/{Math.round(max)}
      </span>
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: "50%",
          border: `2px solid ${warn === true ? "#ff5a4a" : "#0008"}`,
          background: `linear-gradient(to top, ${color} ${fill * 100}%, #1a1712cc ${fill * 100}%)`,
          boxShadow: "0 1px 4px #0009",
        }}
      />
    </div>
  );
}

function Vitals(): ReactNode {
  const view = useSurvivor();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, color: "#f2ead8", pointerEvents: "none" }}>
      <div style={{ textAlign: "right", fontSize: 12, opacity: 0.85, textShadow: "0 1px 2px #000" }} data-temperature="">
        {view.temperature}°C · {view.comfort === "comfortable" ? "" : view.comfort}
      </div>
      {view.torpor.value > 0 ? <Gauge id="torpor" label="Torpor" value={view.torpor.value} max={view.torpor.max} /> : null}
      <Gauge id="health" label="Health" value={view.health.value} max={view.health.max} warn={view.health.value <= 30} />
      <Gauge id="stamina" label="Stamina" value={view.stamina.value} max={view.stamina.max} />
      <Gauge id="food" label="Food" value={view.food.value} max={view.food.max} warn={view.flags.includes("hungry")} />
      <Gauge id="water" label="Water" value={view.water.value} max={view.water.max} warn={view.flags.includes("thirsty")} />
      <Gauge id="weight" label="Weight" value={view.weight.value} max={view.weight.max} warn={view.encumbered} />
      <Gauge id="xp" label={`Level ${view.level}`} value={view.xp - view.xpFrom} max={Math.max(1, view.xpNext - view.xpFrom)} />
      {view.statPoints > 0 ? (
        <div data-levelup="" style={{ textAlign: "right", color: "#9ef08a", fontWeight: 800, fontSize: 13, textShadow: "0 1px 2px #000" }}>
          ▲ Level up — press I
        </div>
      ) : null}
    </div>
  );
}

const crosshair: CSSProperties = {
  position: "absolute",
  left: "50%",
  top: "50%",
  width: 6,
  height: 6,
  marginLeft: -3,
  marginTop: -3,
  borderRadius: "50%",
  background: "#fff",
  boxShadow: "0 0 0 1px #0008",
  pointerEvents: "none",
};

/** The gather feed, ARK's "+3 Thatch" on the left. */
function Feed(): ReactNode {
  const view = useSurvivor();
  return view.gain === null ? null : (
    <div data-gain="" style={{ color: "#f4efe2", fontWeight: 700, fontSize: 15, textShadow: "0 1px 3px #000", pointerEvents: "none" }}>
      +{view.gain}
    </div>
  );
}

function Bar(): ReactNode {
  const view = useSurvivor();
  return (
    <Hotbar
      inventoryId={HOTBAR}
      {...(view.activeSlot === null ? {} : { activeSlot: view.activeSlot })}
      keys={["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"]}
      itemIcon={itemIcon}
      slotSize={48}
    />
  );
}

const LOOK: CSSProperties = { position: "absolute", left: "50%", top: "calc(50% + 18px)", transform: "translateX(-50%)", textAlign: "center", color: "#f4efe2", fontSize: 13, fontWeight: 700, textShadow: "0 1px 3px #000", pointerEvents: "none", whiteSpace: "nowrap" };

/** A creature in front: ARK's readout under the crosshair and what E does to it. */
function CreatureLook(): ReactNode {
  const { aimed, riding } = useCreatures();
  if (riding !== null) return null;
  if (aimed === null) return null;
  const use = aimed.dead ? "Hit to carve meat and hide" : aimed.tamed ? (aimed.saddled ? "E · Ride" : "E · Access inventory") : aimed.taming?.unconscious === true ? "E · Access inventory" : null;
  return (
    <div data-aim-creature="" style={{ ...LOOK, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <CreatureReadout card={aimed} />
      {use === null ? null : <div style={{ opacity: 0.9 }}>{use}</div>}
    </div>
  );
}

/** Riding: the mount's health bottom-left and how to get off. */
function Mount(): ReactNode {
  const { riding } = useCreatures();
  if (riding === null) return null;
  return (
    <div data-riding={riding.id} style={{ color: "#f2ead8", textShadow: "0 1px 2px #000", display: "flex", flexDirection: "column", gap: 4, pointerEvents: "none" }}>
      <CreatureReadout card={riding} />
      <span style={{ fontSize: 12, opacity: 0.85 }}>Click to bite · E to dismount</span>
    </div>
  );
}

/** Under the crosshair, ARK's look-at prompt: what you would hit, and what E picks up. */
function Prompt(): ReactNode {
  const { aim } = useSurvivor();
  const { aimed, riding } = useCreatures();
  if (aimed !== null || riding !== null) return <CreatureLook />;
  if (aim.strike === null && aim.pick === null && !aim.water) return null;
  return (
    <div data-aim="" style={LOOK}>
      {aim.strike === null ? null : <div>{aim.strike}</div>}
      {aim.pick === null ? null : <div style={{ opacity: 0.9 }}>E · Harvest {aim.pick}</div>}
      {aim.pick === null && aim.water ? <div style={{ opacity: 0.9 }}>E · Drink</div> : null}
    </div>
  );
}

function Screens(): ReactNode {
  const screen = useGameStore(openScreen);
  return (
    <>
      <div style={crosshair} />
      {screen === null ? <Prompt /> : null}
      {screen === null ? null : <InventoryScreen tab={screen} />}
    </>
  );
}

/** ARK's layout: pools bottom-right, hotbar bottom-centre, gather feed left, crosshair centre. */
export function Hud(): ReactNode {
  return <HudSlots storageKey="fernwild" slots={{ left: <Feed />, bottomLeft: <Mount />, bottom: <Bar />, bottomRight: <Vitals /> }} overlay={<Screens />} />;
}
