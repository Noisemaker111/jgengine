import { GameIcon } from "@jgengine/react/gameIcons";
import {
  useCurrency,
  useEntityStat,
  useGame,
  useGameStore,
  useInventory,
  usePlayer,
  useQuestJournal,
} from "@jgengine/react/hooks";
import type { ReactNode } from "react";

import { classById } from "../../classes/catalog";
import { NPCS } from "../../entities/npcs/catalog";
import { ITEMS, itemDefById } from "../../items/catalog";
import { enchantsForSlot } from "../../items/enchanting";
import { equippedSetStatus } from "../../items/sets";
import type { LockboxView } from "../../minigames/lockpick";
import { PROFESSIONS } from "../../professions/catalog";
import { professionsOf } from "../../professions/gathering";
import type { EquipSlot } from "../../model";
import { QUESTS } from "../../quests/catalog";
import { enchantsOf, heroSheet } from "../../session/hero";
import { CLOSE_BUTTON, PANEL, PANEL_TITLE, QUALITY_COLORS, copperLabel } from "../theme";

function isSalvageOrDisenchantable(itemId: string): boolean {
  const item = itemDefById(itemId);
  return item !== null && (item.kind === "weapon" || item.kind === "armor") && item.quality !== "poor";
}

function Window({
  title,
  onClose,
  children,
  wide,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`${PANEL} pointer-events-auto ${wide === true ? "w-[440px]" : "w-96"} max-h-[70vh] overflow-hidden`}>
      <div className={PANEL_TITLE}>
        <span>{title}</span>
        <button type="button" className={CLOSE_BUTTON} onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="max-h-[58vh] overflow-y-auto px-4 py-3">{children}</div>
    </div>
  );
}

function ItemRow({
  itemId,
  count,
  action,
  actionLabel,
  price,
  extraActions,
}: {
  itemId: string;
  count?: number;
  action?: () => void;
  actionLabel?: string;
  price?: number;
  extraActions?: readonly { label: string; onClick: () => void }[];
}) {
  const item = itemDefById(itemId);
  if (item === null) return null;
  return (
    <div className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-stone-800/60">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded border border-stone-700 bg-stone-900 ${QUALITY_COLORS[item.quality]}`}>
        <GameIcon name={item.icon} size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm ${QUALITY_COLORS[item.quality]}`}>
          {item.name}
          {count !== undefined && count > 1 ? ` ×${count}` : ""}
        </span>
        <span className="block text-[11px] text-stone-500">
          {item.kind === "weapon" && item.weapon !== undefined
            ? `${item.weapon.min}–${item.weapon.max} dmg · ${item.weapon.speed}s`
            : item.kind === "armor"
              ? `${item.armor ?? 0} armor${item.slot !== undefined ? ` · ${item.slot}` : ""}`
              : item.kind}
          {price !== undefined ? ` · ${copperLabel(price)}` : ""}
        </span>
      </span>
      {extraActions?.map((extra) => (
        <button
          key={extra.label}
          type="button"
          onClick={extra.onClick}
          className="rounded border border-stone-700 bg-stone-900/70 px-2 py-0.5 text-xs text-stone-300 hover:bg-stone-800"
        >
          {extra.label}
        </button>
      ))}
      {action !== undefined && (
        <button
          type="button"
          onClick={action}
          className="rounded border border-amber-800 bg-amber-950/60 px-2 py-0.5 text-xs font-semibold text-amber-200 hover:bg-amber-900/60"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function BagsPanel() {
  const { commands } = useGame();
  const { userId } = usePlayer();
  const slots = useInventory("bags");
  const copper = useCurrency("copper");
  const shopId = useGameStore((ctx) => ctx.game.store.get(`shop:${userId}`)) as string | undefined;
  const close = () => commands.run("openBags", {});
  return (
    <Window title={<span>Backpack · <span className="text-amber-400">{copperLabel(copper)}</span></span>} onClose={close}>
      {slots.every((slot) => slot === null) ? (
        <p className="py-6 text-center text-sm text-stone-500">Your backpack is empty.</p>
      ) : (
        <div className="space-y-0.5">
          {slots.map((slot, index) =>
            slot === null ? null : (
              <ItemRow
                key={`${slot.itemId}-${index}`}
                itemId={slot.itemId}
                count={slot.count}
                action={
                  shopId !== undefined
                    ? () => commands.run("shop.sell", { itemId: slot.itemId })
                    : itemDefById(slot.itemId)?.kind === "consumable" || itemDefById(slot.itemId)?.slot !== undefined
                      ? () => commands.run("bags.use", { itemId: slot.itemId })
                      : undefined
                }
                actionLabel={
                  shopId !== undefined
                    ? "Sell"
                    : itemDefById(slot.itemId)?.kind === "consumable"
                      ? "Use"
                      : "Equip"
                }
                extraActions={
                  shopId !== undefined || !isSalvageOrDisenchantable(slot.itemId)
                    ? undefined
                    : [
                        { label: "Salvage", onClick: () => commands.run("item.salvage", { itemId: slot.itemId }) },
                        { label: "Disenchant", onClick: () => commands.run("item.disenchant", { itemId: slot.itemId }) },
                      ]
                }
              />
            ),
          )}
        </div>
      )}
    </Window>
  );
}

export function CharacterPanel() {
  const { commands } = useGame();
  const { userId } = usePlayer();
  const classId = useGameStore((ctx) => ctx.game.store.get(`class:${userId}`)) as string | undefined;
  const level = useEntityStat(userId, "level")?.current ?? 1;
  const sheet = useGameStore((ctx) => heroSheet(ctx, userId));
  const equips = useGameStore(
    (ctx) => (ctx.game.store.get(`equip:${userId}`) as Partial<Record<EquipSlot, string>> | undefined) ?? {},
  );
  const profs = useGameStore((ctx) => professionsOf(ctx, userId));
  if (classId === undefined || sheet === null) return null;
  const cls = classById(classId);
  return (
    <Window title={`${cls.name} · Level ${level}`} onClose={() => commands.run("openCharacter", {})}>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
        {(
          [
            ["Strength", sheet.attributes.str],
            ["Agility", sheet.attributes.agi],
            ["Stamina", sheet.attributes.sta],
            ["Intellect", sheet.attributes.int],
            ["Spirit", sheet.attributes.spi],
            ["Armor", Math.round(sheet.armor)],
            ["Attack power", Math.round(sheet.attackPower)],
            ["Spell power", Math.round(sheet.spellPower)],
            ["Crit", `${sheet.critPct.toFixed(1)}%`],
            ["Haste", `${(sheet.hastePct * 100).toFixed(1)}%`],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="flex justify-between border-b border-stone-800/60 py-0.5">
            <span className="text-stone-400">{label}</span>
            <span className="font-semibold text-amber-100">{value}</span>
          </div>
        ))}
      </div>
      <h3 className="mt-4 mb-1 text-xs font-semibold uppercase tracking-wider text-amber-500/80">Professions</h3>
      <div className="grid grid-cols-3 gap-2 text-sm">
        {PROFESSIONS.map((profession) => (
          <div key={profession.id} className="flex items-center gap-1.5 rounded border border-stone-800 px-2 py-1">
            <GameIcon name={profession.icon} size={16} className="text-amber-300" />
            <span className="capitalize text-stone-300">{profession.name}</span>
            <span className="ml-auto font-semibold text-amber-100">
              {profs[profession.id]}/{profession.maxSkill}
            </span>
          </div>
        ))}
      </div>
      <h3 className="mt-4 mb-1 text-xs font-semibold uppercase tracking-wider text-amber-500/80">Equipped</h3>
      {Object.entries(equips).length === 0 ? (
        <p className="text-sm text-stone-500">Nothing equipped.</p>
      ) : (
        <div className="space-y-0.5">
          {Object.entries(equips).map(([slot, itemId]) =>
            itemId === undefined ? null : <ItemRow key={slot} itemId={itemId} />,
          )}
        </div>
      )}
      <SetBonuses equips={equips} />
      <Enchants equips={equips} />
    </Window>
  );
}

function Enchants({ equips }: { equips: Partial<Record<EquipSlot, string>> }) {
  const { commands } = useGame();
  const { userId } = usePlayer();
  const enchants = useGameStore((ctx) => enchantsOf(ctx, userId));
  const counts = useInventory("bags");
  const held = (itemId: string): number =>
    counts.reduce((sum, slot) => sum + (slot !== null && slot.itemId === itemId ? slot.count : 0), 0);
  const slots = (Object.keys(equips) as EquipSlot[]).filter((slot) => equips[slot] !== undefined);
  const enchantable = slots.filter((slot) => enchantsForSlot(slot).length > 0);
  if (enchantable.length === 0) return null;
  return (
    <>
      <h3 className="mt-4 mb-1 text-xs font-semibold uppercase tracking-wider text-amber-500/80">Enchants</h3>
      <div className="space-y-2">
        {enchantable.map((slot) => {
          const activeId = enchants[slot];
          return (
            <div key={slot} className="rounded border border-stone-800 px-2 py-1.5">
              <p className="mb-1 text-xs capitalize text-stone-400">
                {slot}
                {activeId !== undefined && <span className="ml-1 text-emerald-300">— applied</span>}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {enchantsForSlot(slot).map((enchant) => {
                  const affordable = enchant.reagents.every((reagent) => held(reagent.itemId) >= reagent.count);
                  const active = activeId === enchant.id;
                  return (
                    <button
                      key={enchant.id}
                      type="button"
                      disabled={!affordable || active}
                      onClick={() => commands.run("item.applyEnchant", { slot, enchantId: enchant.id })}
                      title={enchant.reagents.map((r) => `${r.count} ${r.itemId.replaceAll("_", " ")}`).join(", ")}
                      className={`rounded border px-2 py-0.5 text-[11px] ${
                        active
                          ? "border-emerald-700 bg-emerald-950/50 text-emerald-300"
                          : affordable
                            ? "border-amber-800 bg-amber-950/60 text-amber-200 hover:bg-amber-900/60"
                            : "border-stone-800 text-stone-600"
                      }`}
                    >
                      {enchant.name.replace("Enchant Weapon: ", "").replace("Enchant ", "")}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function SetBonuses({ equips }: { equips: Partial<Record<EquipSlot, string>> }) {
  const sets = equippedSetStatus(equips);
  if (sets.length === 0) return null;
  return (
    <>
      <h3 className="mt-4 mb-1 text-xs font-semibold uppercase tracking-wider text-amber-500/80">Set Bonuses</h3>
      <div className="space-y-2">
        {sets.map((set) => (
          <div key={set.setId}>
            <p className="text-sm font-semibold text-amber-200">
              {set.name} <span className="text-stone-400">({set.equipped})</span>
            </p>
            {set.tiers.map((tier) => (
              <p
                key={tier.pieces}
                className={`text-xs ${tier.active ? "text-emerald-300" : "text-stone-500"}`}
              >
                ({tier.pieces}) {tier.text}
              </p>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

export function QuestLogPanel() {
  const { commands } = useGame();
  const journal = useQuestJournal();
  return (
    <Window title="Quest Log" onClose={() => commands.run("openQuestLog", {})} wide>
      {journal.length === 0 ? (
        <p className="py-6 text-center text-sm text-stone-500">
          No quests yet — speak with the marshals and wardens of the hubs.
        </p>
      ) : (
        <div className="space-y-3">
          {journal.map((quest) => {
            const def = QUESTS.find((entry) => entry.id === quest.questId);
            return (
              <div key={quest.questId}>
                <p className={`font-semibold ${quest.status === "completed" ? "text-emerald-300" : "text-amber-200"}`}>
                  {def?.title ?? quest.questId}
                  {quest.status === "completed" ? " (complete)" : ""}
                </p>
                {def?.description !== undefined && <p className="text-xs text-stone-400">{def.description}</p>}
                <ul className="mt-1 space-y-0.5 text-sm">
                  {quest.objectives.map((objective) => (
                    <li key={objective.id} className={objective.complete ? "text-emerald-400" : "text-stone-300"}>
                      {objective.complete ? "✓" : "•"} {objectiveLabel(quest.questId, objective.id)}{" "}
                      {objective.progress}/{objective.count}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </Window>
  );
}

function objectiveLabel(questId: string, objectiveId: string): string {
  const def = QUESTS.find((entry) => entry.id === questId);
  const objective = def?.objectives.find((entry) => entry.id === objectiveId);
  if (objective === undefined) return objectiveId;
  if (objective.kind === "kill") return `Slay ${objective.target?.replaceAll("_", " ") ?? "foes"}`;
  return `Collect ${objective.item?.replaceAll("_", " ") ?? "items"}`;
}

const PICK_LABEL: Record<string, string> = {
  hardSet: "Hard Set",
  set: "Set",
  steady: "Steady",
  ease: "Ease",
  drop: "Drop",
};

export function LockpickPanel() {
  const { commands } = useGame();
  const { userId } = usePlayer();
  const session = useGameStore((ctx) => ctx.game.store.get(`lockpick:${userId}`) as LockboxView | undefined);
  if (session === undefined) return null;
  const close = () => commands.run("lockpick.close", {});
  return (
    <Window
      title={`Tumbler's Path · Ante ${session.ante} · ${session.livesLeft} ${session.livesLeft === 1 ? "life" : "lives"}`}
      onClose={close}
    >
      {session.result !== "playing" && (
        <p className={`mb-2 text-sm font-semibold ${session.result === "success" ? "text-emerald-300" : "text-rose-300"}`}>
          {session.result === "success" ? "The lock clicks open!" : "The lock jams shut."}
        </p>
      )}
      <div
        className="mx-auto grid gap-0.5"
        style={{ gridTemplateColumns: `repeat(${session.cols}, 1.15rem)` }}
      >
        {Array.from({ length: session.rows }).map((_, row) =>
          Array.from({ length: session.cols }).map((_, col) => {
            const cell = session.visible.find((c) => c.col === col && c.row === row);
            const isPick = col === session.col && row === session.row;
            const bg =
              cell === undefined
                ? "bg-stone-950"
                : cell.kind === "seat"
                  ? "bg-amber-500"
                  : cell.kind === "gate"
                    ? "bg-sky-500"
                    : cell.kind === "trap"
                      ? "bg-rose-600"
                      : "bg-stone-600";
            return (
              <div
                key={`${col}-${row}`}
                className={`h-[1.15rem] w-[1.15rem] rounded-sm ${bg} ${isPick ? "ring-2 ring-amber-200" : ""}`}
              />
            );
          }),
        )}
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-1.5">
        {session.allowedActions.map((action) => (
          <button
            key={action}
            type="button"
            disabled={session.result !== "playing"}
            onClick={() => commands.run("lockpick.pick", { action })}
            className="rounded border border-amber-800 bg-amber-950/60 px-2.5 py-1 text-xs font-semibold text-amber-200 hover:bg-amber-900/60 disabled:opacity-40"
          >
            {PICK_LABEL[action] ?? action}
          </button>
        ))}
      </div>
    </Window>
  );
}

export function VendorPanel() {
  const { commands } = useGame();
  const { userId } = usePlayer();
  const shopId = useGameStore((ctx) => ctx.game.store.get(`shop:${userId}`)) as string | undefined;
  const copper = useCurrency("copper");
  const stock = useGameStore((ctx) =>
    shopId === undefined ? [] : ctx.game.trade!.tradableAt(shopId, ITEMS.map((item) => item.id)),
  );
  if (shopId === undefined) return null;
  const vendor = NPCS.find((npc) => npc.shopId === shopId);
  return (
    <Window
      title={<span>{vendor?.name ?? "Vendor"} · <span className="text-amber-400">{copperLabel(copper)}</span></span>}
      onClose={() => commands.run("shop.close", {})}
      wide
    >
      <p className="mb-2 text-xs text-stone-500">Open your backpack (B) to sell. Prices in copper.</p>
      <div className="space-y-0.5">
        {stock.map((itemId) => (
          <ItemRow
            key={itemId}
            itemId={itemId}
            price={itemDefById(itemId)?.buyPrice}
            action={() => commands.run("shop.buy", { itemId })}
            actionLabel="Buy"
          />
        ))}
      </div>
    </Window>
  );
}
