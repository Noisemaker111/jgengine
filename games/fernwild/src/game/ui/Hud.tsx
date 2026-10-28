import { useMemo, type CSSProperties, type ReactNode } from "react";
import { KillFeed } from "@jgengine/core/feed/killFeed.view";
import { Hotbar } from "@jgengine/core/hud/hudReadouts.view";
import { Minimap, useMarkers } from "@jgengine/core/map/map.view";
import type { MarkerView } from "@jgengine/core/map/markers";
import { OnboardingBanner, OnboardingHud, useOnboarding } from "@jgengine/core/onboarding/onboarding.view";
import { useGameStore } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { HudSlots } from "@jgengine/shell/gameKit";

import { baseView } from "../base";
import { bodyView } from "../deathBody";
import { dossierView } from "../dossier";
import { ISLAND_MARKS, islandBake, islandMarks } from "../islandMap";
import { pickupFeed } from "../pickupFeed";
import { openScreen } from "../screens";
import { HOTBAR } from "../bags";
import { survivorView, type SurvivorView } from "../survivor";
import { BossBar } from "./Broodmother";
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

/** Where your body lies after a death: how far, and how long before it falls apart with your things. */
function BodyLine(): ReactNode {
  const body = useGameStore((ctx) => {
    const view = bodyView(ctx);
    return view === null ? null : { metres: Math.round(view.distance), minutes: Math.ceil(view.secondsLeft / 60) };
  }, same);
  if (body === null) return null;
  return (
    <div data-body="" style={{ textAlign: "right", fontSize: 13, fontWeight: 700, color: "#cfe8ff", textShadow: "0 1px 2px #000", pointerEvents: "none" }}>
      Your body: {body.metres} m · {body.minutes} min left
    </div>
  );
}

const WEATHER_WORD: Record<string, string> = { rain: "Rain", snow: "Snow", mixed: "Sleet", dust: "Dust" };

function Vitals(): ReactNode {
  const view = useSurvivor();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, color: "#f2ead8", pointerEvents: "none" }}>
      <div style={{ textAlign: "right", fontSize: 12, opacity: 0.85, textShadow: "0 1px 2px #000" }} data-temperature="">
        {view.weather === "clear" ? "" : `${WEATHER_WORD[view.weather]}${view.sheltered ? " (sheltered)" : ""} · `}
        {view.temperature}°C{view.comfort === "comfortable" ? "" : ` · ${view.comfort}`}
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

/** ARK's item lines under the top edge: an icon and "ADDED: 3x Thatch" in cyan, "CONSUMED" in yellow, stacking down and fading. */
const PICKUP_ROW: CSSProperties = {
  background: "none",
  borderLeft: "none",
  boxShadow: "none",
  padding: "1px 0",
  fontSize: 15,
  fontWeight: 800,
  letterSpacing: "0.05em",
  textShadow: "0 0 3px #000, 0 1px 2px #000",
  transform: "none",
};
const PICKUP_KINDS = { added: { color: "#74e4ef" }, consumed: { color: "#f2d54b" } };
const pickupIcon = (entry: { icon: string | undefined }): ReactNode =>
  entry.icon === undefined ? null : <span style={{ width: 22, height: 22, flexShrink: 0, display: "block" }}>{itemIcon(entry.icon)}</span>;

function PickupLines(): ReactNode {
  const ticker = pickupFeed(useGameContext());
  return <KillFeed ticker={ticker} oldestFirst renderIcon={pickupIcon} rowStyle={PICKUP_ROW} kindStyles={PICKUP_KINDS} style={{ alignItems: "center", gap: 2 }} />;
}

function Top(): ReactNode {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <BossBar />
      <OnboardingBanner theme={{ accent: "#e7c84a" }} placement="inline" />
      <PickupLines />
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
  const use = aimed.dead ? (aimed.inventory.some((slot) => slot !== null) ? "E · Access inventory · Hit to carve" : "Hit to carve meat and hide") : aimed.tamed ? (aimed.saddled ? "E · Ride" : "E · Access inventory") : aimed.taming?.unconscious === true ? "E · Access inventory" : null;
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

/** Building: what the ghost will place and why not, or the piece in front with its health. */
function StructureLook(): ReactNode {
  const base = useGameStore(baseView, same);
  if (base.ghost !== null) {
    return (
      <div data-build="" style={LOOK}>
        <div style={{ color: base.ghost.valid ? "#9ef08a" : "#ff8a7a" }}>{base.ghost.valid ? `Place ${base.ghost.piece}` : base.ghost.why}</div>
        <div style={{ opacity: 0.85, fontSize: 12 }}>Click to place · R to turn</div>
      </div>
    );
  }
  if (base.aimed === null) return null;
  return (
    <div data-aim-structure="" style={LOOK}>
      <div>
        {base.aimed.label} {base.aimed.health}/{base.aimed.max}
      </div>
      <div style={{ opacity: 0.85, fontSize: 12 }}>{base.aimed.door ? `E · ${base.aimed.open ? "Close" : "Open"} · ` : ""}G · Demolish</div>
    </div>
  );
}

/** Under the crosshair, ARK's look-at prompt: what you would hit, and what E picks up. */
function Prompt(): ReactNode {
  const { aim } = useSurvivor();
  const { aimed, riding } = useCreatures();
  const building = useGameStore((ctx) => { const base = baseView(ctx); return base.ghost !== null || base.aimed !== null; });
  if (aimed !== null || riding !== null) return <CreatureLook />;
  if (building) return <StructureLook />;
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
      {screen === null ? <NoteReader /> : null}
      {screen === null ? null : <InventoryScreen tab={screen} />}
    </>
  );
}

const NO_MARKS: readonly MarkerView[] = [];

/** A small map of the island round the survivor: the ground from above, the first-day goal starred, unread notes, obelisks, cave mouths and your tames. */
function MapCorner(): ReactNode {
  const ctx = useGameContext();
  const onboarding = useOnboarding();
  const goal = useMarkers(onboarding?.markers ?? NO_MARKS);
  const marks = useGameStore(islandMarks, same);
  const bake = useMemo(() => islandBake(ctx), [ctx]);
  const here = useGameStore((state) => {
    const me = state.scene.entity.get(state.player.userId);
    return me === null ? null : { x: Math.round(me.position[0]), z: Math.round(me.position[2]), yaw: Math.round(me.rotationY * 20) / 20 };
  }, same);
  const markers = useMemo(() => [...goal, ...marks], [goal, marks]);
  if (here === null) return null;
  return (
    <div data-minimap="">
      <Minimap markers={markers} center={[here.x, here.z]} facingYaw={here.yaw} worldRadius={180} size={170} title="Island" background={bake.background} mapBounds={bake.mapBounds} kindStyles={ISLAND_MARKS} />
    </div>
  );
}

/** A note just read: ARK's explorer note open over the world for a while; the dossier (I) keeps it. */
function NoteReader(): ReactNode {
  const reading = useGameStore((ctx) => dossierView(ctx).reading, same);
  if (reading === null) return null;
  return (
    <div
      data-note-open=""
      style={{ position: "absolute", right: 16, top: 40, width: 380, maxWidth: "45vw", maxHeight: "50vh", overflowY: "auto", background: "#f1e6c8f2", color: "#3a2c18", padding: "14px 18px", borderRadius: 4, boxShadow: "0 8px 30px #000a", fontFamily: "Georgia, serif", pointerEvents: "none" }}
    >
      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 6 }}>{reading.title}</div>
      <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{reading.text}</div>
      <div style={{ fontSize: 11, opacity: 0.7, marginTop: 8 }}>Kept in your dossier (I · Dossier)</div>
    </div>
  );
}

/** ARK's layout: pools bottom-right, hotbar bottom-centre, gather feed left, crosshair centre; the first-day steps top-left over the map. */
export function Hud(): ReactNode {
  return (
    <HudSlots
      storageKey="fernwild"
      slots={{ topLeft: <OnboardingHud accent="#e7c84a" ahead={1} />, top: <Top />, topRight: <BodyLine />, right: <MapCorner />, bottomLeft: <Mount />, bottom: <Bar />, bottomRight: <Vitals /> }}
      overlay={<Screens />}
    />
  );
}
