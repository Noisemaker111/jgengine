import { GameIcon, type GameIconName } from "@jgengine/react/gameIcons";
import { useGame, useInventory } from "@jgengine/react/hooks";

import { itemDefById } from "../../items/catalog";
import { CLOSE_BUTTON, PANEL, PANEL_TITLE, QUALITY_COLORS } from "../theme";

function Column({
  title,
  inventoryId,
  actionLabel,
  command,
}: {
  title: string;
  inventoryId: string;
  actionLabel: string;
  command: string;
}) {
  const { commands } = useGame();
  const slots = useInventory(inventoryId);
  return (
    <div className="min-w-0 flex-1">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-amber-500/80">{title}</h3>
      <div className="space-y-0.5">
        {slots.every((slot) => slot === null) ? (
          <p className="py-3 text-center text-xs text-stone-500">Empty</p>
        ) : (
          slots.map((slot, index) => {
            if (slot === null) return null;
            const item = itemDefById(slot.itemId);
            if (item === null) return null;
            return (
              <button
                key={`${slot.itemId}-${index}`}
                type="button"
                onClick={() => commands.run(command, { itemId: slot.itemId })}
                title={actionLabel}
                className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-stone-800/70"
              >
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded border border-stone-700 bg-stone-900 ${QUALITY_COLORS[item.quality]}`}>
                  <GameIcon name={item.icon as GameIconName} size={16} />
                </span>
                <span className={`min-w-0 flex-1 truncate text-xs ${QUALITY_COLORS[item.quality]}`}>
                  {item.name}
                  {slot.count > 1 ? ` ×${slot.count}` : ""}
                </span>
                <span className="text-[10px] text-amber-400/80">{actionLabel}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

export function BankPanel() {
  const { commands } = useGame();
  return (
    <div className={`${PANEL} pointer-events-auto w-[560px] max-h-[70vh] overflow-hidden`}>
      <div className={PANEL_TITLE}>
        <span>The Gilded Strongbox</span>
        <button type="button" className={CLOSE_BUTTON} onClick={() => commands.run("bank.close", {})}>
          ✕
        </button>
      </div>
      <div className="flex max-h-[58vh] gap-5 overflow-y-auto px-4 py-3">
        <Column title="Backpack" inventoryId="bags" actionLabel="Deposit" command="bank.deposit" />
        <Column title="Strongbox" inventoryId="bank" actionLabel="Withdraw" command="bank.withdraw" />
      </div>
    </div>
  );
}
