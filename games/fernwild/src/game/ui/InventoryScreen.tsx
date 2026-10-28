import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Paperdoll } from "@jgengine/core/inventory/characterSheet.view";
import { InventoryGrid } from "@jgengine/core/inventory/inventoryGrid.view";
import { EntityPreview } from "@jgengine/core/render/EntityPreview.draw";
import { onboardingLock } from "@jgengine/core/onboarding/onboardingSystem";
import { useGame, useGameStore } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";

import { itemDef, itemLabel } from "../data/items";
import type { SurvivorScreen } from "../screens";
import { BAG, HOTBAR } from "../bags";
import { dossierPages } from "../dossier";
import { entityModels } from "../models";
import { craftable } from "../survivor";
import { ObeliskPanel } from "./Broodmother";
import { CreaturePanel } from "./CreatureScreen";
import { useSurvivor } from "./Hud";
import { ItemIcon, itemIcon } from "./ItemIcon";

const same = <T,>(a: T, b: T) => JSON.stringify(a) === JSON.stringify(b);

const PANEL: CSSProperties = {
  background: "linear-gradient(180deg, #1d2a2fee, #121a1ef2)",
  border: "1px solid #6fb7c955",
  borderRadius: 6,
  padding: 12,
  color: "#e8f1f2",
  boxShadow: "0 8px 30px #000a",
  display: "flex",
  flexDirection: "column",
  gap: 8,
  minHeight: 0,
};

const HEADING: CSSProperties = { fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "#8fd3e2", fontWeight: 800 };

function Tabs({ tab }: { tab: SurvivorScreen }): ReactNode {
  const ctx = useGameContext();
  const view = useSurvivor();
  const button = (id: SurvivorScreen, label: string, badge: number) => (
    <button
      key={id}
      data-tab={id}
      onClick={() => setScreen(ctx, id)}
      style={{
        background: tab === id ? "#2d6f80" : "#16252b",
        color: "#e8f1f2",
        border: "1px solid #6fb7c966",
        padding: "6px 16px",
        fontWeight: 800,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        fontSize: 12,
        cursor: "pointer",
      }}
    >
      {label}
      {badge > 0 ? <span style={{ marginLeft: 6, color: "#9ef08a" }}>{badge}</span> : null}
    </button>
  );
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {button("inventory", "Inventory", view.statPoints)}
      {button("engrams", "Engrams", view.engramPoints)}
      {button("dossier", "Dossier", 0)}
    </div>
  );
}

function setScreen(ctx: ReturnType<typeof useGameContext>, screen: SurvivorScreen): void {
  void ctx.game.commands.run("screen", { screen });
}

/** Left: what you carry, ARK's grid with the hotbar row under it. Beside a creature, double-click gives to it. */
function Carried({ give = false }: { give?: boolean }): ReactNode {
  const game = useGame();
  const view = useSurvivor();
  return (
    <div style={{ ...PANEL, width: 420 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={HEADING}>Your inventory</span>
        <span data-weight="" style={{ fontSize: 12, color: view.encumbered ? "#ff8a7a" : "#cfe" }}>
          Weight {view.weight.value} / {view.weight.max}
        </span>
      </div>
      <div style={{ overflowY: "auto", maxHeight: "52vh" }}>
        <InventoryGrid
          inventoryId={BAG}
          columns={6}
          size={58}
          itemIcon={itemIcon}
          onActivate={(slot) => {
            void game.commands.run(give ? "giveCreature" : "shuttle", { inventoryId: BAG, slot });
          }}
        />
      </div>
      <span style={HEADING}>Hotbar</span>
      <InventoryGrid inventoryId={HOTBAR} columns={10} size={32} itemIcon={itemIcon} onActivate={(slot) => void game.commands.run(give ? "giveCreature" : "shuttle", { inventoryId: HOTBAR, slot })} />
      <span style={{ fontSize: 11, opacity: 0.7 }}>
        {give ? "Double-click gives an item to the creature." : "Double-click moves an item between inventory and hotbar. Number keys use or equip hotbar items."}
      </span>
    </div>
  );
}

/** Left of the doll: head, torso, legs; right: hands, feet, as ARK's equipped row reads left to right. */
const GEAR_SIDE: Record<string, "left" | "right"> = { head: "left", torso: "left", legs: "left", hands: "right", feet: "right" };

/** The survivor as they stand now, turned to face you. */
function Portrait(): ReactNode {
  const ctx = useGameContext();
  const player = entityModels["player"];
  return (
    <div data-portrait="" style={{ width: 170, height: 290, borderRadius: 4, overflow: "hidden", border: "1px solid #6fb7c933" }}>
      {player === undefined ? null : (
        <EntityPreview model={player} instanceId={ctx.player.userId} faceCamera mood="studio" backdrop="#14222a" cameraPosition={[0, 1.1, 4.6]} cameraTarget={[0, 0.92, 0]} fov={30} />
      )}
    </div>
  );
}

/** Centre: ARK's survivor pane — the body with its armour slots, insulation, the XP bar and the stats with their level-up buttons. */
function Survivor(): ReactNode {
  const game = useGame();
  const view = useSurvivor();
  const current: Record<string, string> = {
    health: `${Math.floor(view.health.value)} / ${view.health.max}`,
    stamina: `${Math.floor(view.stamina.value)} / ${view.stamina.max}`,
    oxygen: `${Math.floor(view.oxygen.value)} / ${view.oxygen.max}`,
    food: `${Math.floor(view.food.value)} / ${view.food.max}`,
    water: `${Math.floor(view.water.value)} / ${view.water.max}`,
    weight: `${view.weight.value} / ${view.weight.max}`,
  };
  const xpShare = Math.max(0, Math.min(1, (view.xp - view.xpFrom) / Math.max(1, view.xpNext - view.xpFrom)));
  return (
    <div style={{ ...PANEL, width: 400 }}>
      <span style={{ ...HEADING, textAlign: "center", fontSize: 14 }}>Survivor - Lvl {view.level}</span>
      <Paperdoll
        slots={view.gear.map((slot) => ({
          id: slot.id,
          label: slot.label,
          position: GEAR_SIDE[slot.id] ?? "left",
          item: slot.item === null ? null : { glyph: <ItemIcon itemId={slot.item} />, label: itemLabel(slot.item) },
        }))}
        portrait={<Portrait />}
        slotSize={50}
        onSlotActivate={(slot) => void game.commands.run("takeOff", { slot })}
      />
      <div data-insulation="" style={{ display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.85 }}>
        <span>Hypothermal insulation +{view.insulation.cold}°C</span>
        <span>Hyperthermal insulation +{view.insulation.heat}°C</span>
      </div>
      <div data-xp="" style={{ position: "relative", height: 14, background: "#0009", border: "1px solid #6fb7c955", borderRadius: 7 }}>
        <div style={{ width: `${xpShare * 100}%`, height: "100%", background: "#2d8fa6", borderRadius: 7 }} />
        <span style={{ position: "absolute", inset: 0, textAlign: "center", fontSize: 10, lineHeight: "14px" }}>
          XP: {view.xp} / {view.xpNext}
        </span>
      </div>
      {view.statPoints > 0 ? (
        <span style={{ fontSize: 12, color: "#9ef08a", fontWeight: 800 }}>
          {view.statPoints} point{view.statPoints === 1 ? "" : "s"} to spend
        </span>
      ) : null}
      {view.stats.map((stat) => (
        <div key={stat.id} data-stat={stat.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <span style={{ flex: 1 }}>{stat.label}</span>
          <span style={{ fontVariantNumeric: "tabular-nums", opacity: 0.9 }}>{current[stat.id] ?? `${stat.value}${stat.unit}`}</span>
          <button
            data-level-stat={stat.id}
            disabled={view.statPoints <= 0}
            onClick={() => void game.commands.run("levelStat", { stat: stat.id })}
            style={{
              width: 22,
              height: 22,
              borderRadius: 4,
              border: "1px solid #6fb7c966",
              background: view.statPoints > 0 ? "#2f8a4a" : "#16252b",
              color: "#fff",
              fontWeight: 900,
              cursor: view.statPoints > 0 ? "pointer" : "default",
            }}
          >
            +
          </button>
        </div>
      ))}
      <span style={{ fontSize: 12, opacity: 0.75 }}>
        {view.temperature}°C · {view.comfort} · Torpor {Math.floor(view.torpor.value)} / {view.torpor.max}
      </span>
      <span style={{ fontSize: 11, opacity: 0.7 }}>Double-click armour to wear it; click a worn piece to take it off.</span>
    </div>
  );
}

/** Right: ARK's crafting panel — learned recipes, what they cost, and the queue. */
function Crafting(): ReactNode {
  const game = useGame();
  const recipes = useGameStore(craftable, same);
  const view = useSurvivor();
  return (
    <div style={{ ...PANEL, width: 380 }}>
      <span style={HEADING}>Crafting</span>
      <div style={{ overflowY: "auto", maxHeight: "48vh", display: "flex", flexDirection: "column", gap: 4 }}>
        {recipes.map((recipe) => (
          <button
            key={recipe.id}
            data-recipe={recipe.id}
            title={recipe.blocked ?? `Craft ${itemLabel(recipe.output)}`}
            onClick={(event) => void game.commands.run("craft", { recipeId: recipe.id, count: event.shiftKey ? 5 : 1 })}
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              textAlign: "left",
              background: recipe.blocked === null ? "#1f3a40" : "#161f22",
              opacity: recipe.blocked === null ? 1 : 0.6,
              border: "1px solid #6fb7c944",
              borderRadius: 4,
              padding: 6,
              color: "#e8f1f2",
              cursor: "pointer",
            }}
          >
            <div style={{ width: 36, height: 36, flex: "none" }}>
              <ItemIcon itemId={recipe.output} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>{itemLabel(recipe.output)}</span>
              <span style={{ fontSize: 11 }}>
                {recipe.inputs.map((input) => (
                  <span key={input.itemId} style={{ marginRight: 8, color: input.have >= input.count ? "#bfe6c3" : "#ff9a8a" }}>
                    {input.have}/{input.count} {itemLabel(input.itemId)}
                  </span>
                ))}
              </span>
            </div>
          </button>
        ))}
      </div>
      {view.queue.length > 0 ? <span style={HEADING}>Queue</span> : null}
      {view.queue.map((job) => (
        <div key={job.id} data-job={job.recipeId} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
          <span style={{ flex: 1 }}>{itemLabel(job.output)}</span>
          <div style={{ width: 100, height: 6, background: "#0008", borderRadius: 3 }}>
            <div style={{ width: `${job.progress * 100}%`, height: "100%", background: "#8fd3e2", borderRadius: 3 }} />
          </div>
          <button onClick={() => void game.commands.run("cancelCraft", { jobId: job.id })} style={{ background: "none", border: "none", color: "#ff9a8a", cursor: "pointer" }}>
            ✕
          </button>
        </div>
      ))}
      <span style={{ fontSize: 11, opacity: 0.7 }}>Click to craft one, shift-click for five.</span>
    </div>
  );
}

/** ARK's dossier and explorer notes: every species, met or still "???", which you have tamed, and the notes you have found. */
function Dossier(): ReactNode {
  const pages = useGameStore(dossierPages, same);
  const [open, setOpen] = useState<string | null>(null);
  const met = pages.species.filter((entry) => entry.met).length;
  const tamed = pages.species.filter((entry) => entry.tamed).length;
  const tamable = pages.species.filter((entry) => entry.tamable).length;
  const read = pages.notes.filter((note) => note.read);
  const shown = read.find((note) => note.id === open) ?? null;
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
      <div data-dossier="" style={{ ...PANEL, width: 520 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={HEADING}>Dossier</span>
          <span style={{ fontSize: 12 }}>
            {met}/{pages.species.length} met · {tamed}/{tamable} tamed
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, overflowY: "auto", maxHeight: "60vh" }}>
          {pages.species.map((entry) => (
            <div
              key={entry.id}
              data-species={entry.id}
              style={{ padding: "4px 6px", borderRadius: 3, fontSize: 11, background: entry.tamed ? "#1f3a2a" : "#161f22", border: `1px solid ${entry.met ? "#8fd3e2" : "#6fb7c922"}`, opacity: entry.met ? 1 : 0.5 }}
            >
              {entry.name}
              {entry.tamed ? <span style={{ color: "#9ef08a" }}> ✓</span> : null}
              {entry.met && !entry.tamable ? <span style={{ color: "#ff8a7a" }}> ☠</span> : null}
            </div>
          ))}
        </div>
      </div>
      <div style={{ ...PANEL, width: 360 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={HEADING}>Explorer notes</span>
          <span style={{ fontSize: 12 }}>
            {read.length}/{pages.notes.length}
          </span>
        </div>
        {read.length === 0 ? <span style={{ fontSize: 12, opacity: 0.8 }}>Notes lie at caves, obelisks and summits. The map marks them with ✎.</span> : null}
        <div style={{ display: "flex", flexDirection: "column", gap: 3, overflowY: "auto", maxHeight: "24vh" }}>
          {read.map((note) => (
            <button
              key={note.id}
              data-note={note.id}
              onClick={() => setOpen(note.id)}
              style={{ textAlign: "left", background: note.id === open ? "#2d6f80" : "#161f22", color: "#e8f1f2", border: "1px solid #6fb7c944", padding: "4px 8px", fontSize: 12, cursor: "pointer" }}
            >
              {note.title}
            </button>
          ))}
        </div>
        {shown === null ? null : <p style={{ fontSize: 12, lineHeight: 1.5, margin: 0, whiteSpace: "pre-wrap", overflowY: "auto", maxHeight: "30vh" }}>{shown.text}</p>}
      </div>
    </div>
  );
}

/** ARK's engram screen: everything by level, learn with engram points. */
function Engrams(): ReactNode {
  const game = useGame();
  const view = useSurvivor();
  const lockedBy = useGameStore((ctx) => onboardingLock(ctx, "learn"));
  return (
    <div style={{ ...PANEL, width: 760 }}>
      {lockedBy === null ? null : (
        <span data-engrams-locked="" style={{ fontSize: 13, color: "#e7c84a" }}>
          Learning opens after: {lockedBy}
        </span>
      )}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={HEADING}>Engrams</span>
        <span data-engram-points="" style={{ fontSize: 13 }}>
          {view.engramPoints} engram points · level {view.level}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6, overflowY: "auto", maxHeight: "60vh" }}>
        {view.engrams.map((engram) => {
          const open = engram.level <= view.level;
          const affordable = open && lockedBy === null && !engram.learned && view.engramPoints >= engram.points;
          return (
            <button
              key={engram.id}
              data-engram={engram.id}
              disabled={engram.learned || !affordable}
              onClick={() => void game.commands.run("learn", { engramId: engram.id })}
              title={itemDef(engram.id)?.note ?? itemLabel(engram.id)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                padding: 6,
                borderRadius: 4,
                border: `1px solid ${engram.learned ? "#7ad06a" : affordable ? "#8fd3e2" : "#6fb7c933"}`,
                background: engram.learned ? "#1f3a2a" : "#161f22",
                opacity: open ? 1 : 0.45,
                color: "#e8f1f2",
                cursor: affordable ? "pointer" : "default",
              }}
            >
              <div style={{ width: 40, height: 40 }}>
                <ItemIcon itemId={engram.id} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, textAlign: "center" }}>{itemLabel(engram.id)}</span>
              <span style={{ fontSize: 10, opacity: 0.8 }}>{engram.learned ? "Learned" : open ? `${engram.points} EP` : `Level ${engram.level}`}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** ARK's full-screen survivor panel over the world. */
export function InventoryScreen({ tab }: { tab: SurvivorScreen }): ReactNode {
  const ctx = useGameContext();
  const [, force] = useState(0);
  useEffect(() => {
    document.exitPointerLock?.();
    force((value) => value + 1);
  }, []);
  return (
    <div
      data-screen={tab}
      style={{ position: "absolute", inset: 0, background: "#000a", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, pointerEvents: "auto", zIndex: 40 }}
      onKeyDown={(event) => {
        if (event.key === "Escape") void ctx.game.commands.run("screen", { screen: null });
      }}
    >
      {tab === "creature" || tab === "obelisk" ? null : <Tabs tab={tab} />}
      {tab === "obelisk" ? (
        <ObeliskPanel />
      ) : tab === "creature" ? (
        <div style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
          <Carried give />
          <CreaturePanel />
        </div>
      ) : tab === "inventory" ? (
        <div style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
          <Carried />
          <Survivor />
          <Crafting />
        </div>
      ) : tab === "dossier" ? (
        <Dossier />
      ) : (
        <Engrams />
      )}
      <span style={{ fontSize: 12, color: "#cfe", opacity: 0.8 }}>I to close</span>
    </div>
  );
}
