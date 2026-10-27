import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { InventoryGrid } from "@jgengine/core/inventory/inventoryGrid.view";
import { useGame, useGameStore } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";

import { itemDef, itemLabel } from "../data/items";
import type { SurvivorScreen } from "../screens";
import { BAG, HOTBAR } from "../bags";
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

/** Centre: the survivor's stats with ARK's level-up buttons. */
function Stats(): ReactNode {
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
  return (
    <div style={{ ...PANEL, width: 300 }}>
      <span style={HEADING}>Survivor · level {view.level}</span>
      <span style={{ fontSize: 12, opacity: 0.8 }}>
        XP {view.xp} / {view.xpNext} · {view.statPoints} stat point{view.statPoints === 1 ? "" : "s"}
      </span>
      {view.stats.map((stat) => (
        <div key={stat.id} data-stat={stat.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <span style={{ flex: 1 }}>{stat.label}</span>
          <span style={{ fontVariantNumeric: "tabular-nums", opacity: 0.9 }}>{current[stat.id] ?? `${stat.value}${stat.unit}`}</span>
          <button
            data-level-stat={stat.id}
            disabled={view.statPoints <= 0}
            onClick={() => void game.commands.run("levelStat", { stat: stat.id })}
            style={{
              width: 24,
              height: 24,
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

/** ARK's engram screen: everything by level, learn with engram points. */
function Engrams(): ReactNode {
  const game = useGame();
  const view = useSurvivor();
  return (
    <div style={{ ...PANEL, width: 760 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={HEADING}>Engrams</span>
        <span data-engram-points="" style={{ fontSize: 13 }}>
          {view.engramPoints} engram points · level {view.level}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6, overflowY: "auto", maxHeight: "60vh" }}>
        {view.engrams.map((engram) => {
          const open = engram.level <= view.level;
          const affordable = open && !engram.learned && view.engramPoints >= engram.points;
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
          <Stats />
          <Crafting />
        </div>
      ) : (
        <Engrams />
      )}
      <span style={{ fontSize: 12, color: "#cfe", opacity: 0.8 }}>I to close</span>
    </div>
  );
}
