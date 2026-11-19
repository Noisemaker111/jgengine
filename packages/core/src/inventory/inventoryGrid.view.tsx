/** @jsxImportSource @jgengine/core/ui/jsx */
import { useCallback, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "@jgengine/core/ui/jsx";
import type { KeyboardEvent as ReactKeyboardEvent } from "@jgengine/core/ui/jsx/dom.view";

import { moveGridFocus, type FocusDirection } from "@jgengine/core/ui/actionModel";

import type { CommandResult } from "@jgengine/core/commands/commandRegistry";
import { DragGhost, DraggableCard, DropZone, useDragLayer, type DragLayer } from "@jgengine/core/inventory/dragLayer.view";
import { inventorySlotKey, parseInventorySlotKey, type InventorySlotRef } from "@jgengine/core/inventory/inventoryModel";
import { iconForItemId } from "@jgengine/core/ui/icons/gameIcons.view";
import { IconTreatment, schoolForItem } from "@jgengine/core/ui/icons/iconTreatment.view";
import { useGame, useInventoryGrid } from "@jgengine/ui/hooks";

/** @capability inventory-grid-hud drop-in NxN inventory grid with drag/swap/stack/split bound to a live inventory */

const ARROW_DIRECTIONS: Record<string, FocusDirection> = {
  ArrowRight: "right",
  ArrowLeft: "left",
  ArrowUp: "up",
  ArrowDown: "down",
  Home: "first",
  End: "last",
};

export interface InventoryMoveRefusal {
  reason: string;
  from: InventorySlotRef;
  to: InventorySlotRef;
}

/**
 * Drag and pick-up state shared by every {@link InventoryGrid} it is passed to, so a stack moves
 * between their inventories: one drag layer, one keyboard pick and the newest refusal.
 */
export interface InventoryTransfer {
  layer: DragLayer<InventorySlotRef>;
  picked: InventorySlotRef | null;
  pick(ref: InventorySlotRef | null): void;
  move(from: InventorySlotRef, to: InventorySlotRef): void;
  refusal: InventoryMoveRefusal | null;
}

/**
 * One transfer for several grids: `const transfer = useInventoryTransfer()` then
 * `<InventoryGrid inventoryId="bag" transfer={transfer} />` beside
 * `<InventoryGrid inventoryId="stash" transfer={transfer} />`. A drop runs `inventory.move` with
 * `toInventoryId`, so it swaps, merges up to the stack limit with the remainder left behind, or is
 * refused with the model's reason (`wrong-kind`, `no-space`) and both inventories unchanged.
 *
 * @capability inventory-transfer drag or keyboard-move a stack between two inventory grids (bag to stash) with swap, merge remainder and refusal reasons
 */
export function useInventoryTransfer(options?: {
  onRefuse?: (refusal: InventoryMoveRefusal) => void;
}): InventoryTransfer {
  const { commands } = useGame();
  const [picked, setPicked] = useState<InventorySlotRef | null>(null);
  const [refusal, setRefusal] = useState<InventoryMoveRefusal | null>(null);
  const latest = useRef(options);
  latest.current = options;

  const move = useCallback(
    (from: InventorySlotRef, to: InventorySlotRef) => {
      if (from.inventoryId === to.inventoryId && from.slot === to.slot) return;
      const input =
        from.inventoryId === to.inventoryId
          ? { inventoryId: from.inventoryId, from: from.slot, to: to.slot }
          : { inventoryId: from.inventoryId, from: from.slot, to: to.slot, toInventoryId: to.inventoryId };
      const settle = (result: CommandResult<unknown>) => {
        if (result.status !== "rejected") {
          setRefusal(null);
          return;
        }
        const next = { reason: result.reason, from, to };
        setRefusal(next);
        latest.current?.onRefuse?.(next);
      };
      const result = commands.run("inventory.move", input);
      if (result instanceof Promise) void result.then(settle);
      else settle(result);
    },
    [commands],
  );

  const layer = useDragLayer<InventorySlotRef>({
    onDrop: (info) => {
      const target = info.target === null ? null : parseInventorySlotKey(info.target);
      if (target !== null) move(info.payload.value, target);
    },
  });

  const pick = useCallback((ref: InventorySlotRef | null) => {
    setPicked(ref);
    if (ref !== null) setRefusal(null);
  }, []);

  return useMemo(() => ({ layer, picked, pick, move, refusal }), [layer, picked, pick, move, refusal]);
}

const REFUSAL_TEXT: Record<string, string> = {
  "wrong-kind": "That item does not go there",
  "no-space": "No room for that stack",
  "empty-slot": "Nothing to move",
  "invalid-slot": "Not a slot",
};

export interface InventoryGridProps {
  inventoryId: string;
  columns?: number;
  /** Tile size in px. Default 44. */
  size?: number;
  /** Gap between tiles in px. Default 6. */
  gap?: number;
  transfer?: InventoryTransfer;
  describeRefusal?: (reason: string) => string;
  itemIcon?: (itemId: string) => ReactNode;
  onActivate?: (slot: number) => void;
  className?: string;
  style?: CSSProperties;
}

function EmptySlot({ size, picked }: { size: number; picked: boolean }) {
  return (
    <div
      data-slot-empty=""
      style={{
        width: size,
        height: size,
        borderRadius: "var(--jg-slot-radius, 9px)",
        background: "var(--jg-slot-bg, rgba(12,14,20,0.5))",
        border: picked
          ? "1px solid var(--jg-accent, #38bdf8)"
          : "var(--jg-slot-border, 1px solid rgba(255,255,255,0.1))",
        boxShadow: "inset 0 2px 6px rgba(0,0,0,0.45)",
        boxSizing: "border-box",
      }}
    />
  );
}

export function InventoryGrid({
  inventoryId,
  columns,
  size = 44,
  gap = 6,
  transfer: shared,
  describeRefusal,
  itemIcon,
  onActivate,
  className,
  style,
}: InventoryGridProps) {
  const { slots, split } = useInventoryGrid(inventoryId);
  const own = useInventoryTransfer();
  const transfer = shared ?? own;
  const { layer, picked, pick, move, refusal } = transfer;
  const cols = columns ?? Math.max(1, Math.ceil(Math.sqrt(slots.length)));

  const [focus, setFocus] = useState(0);
  const cellRefs = useRef(new Map<number, HTMLDivElement>());
  const isPickedHere = (index: number) => picked !== null && picked.inventoryId === inventoryId && picked.slot === index;

  const splitHalf = useCallback(
    (index: number) => {
      const slot = slots[index];
      if (slot !== null && slot !== undefined && slot.count > 1) split(index, Math.floor(slot.count / 2));
    },
    [slots, split],
  );

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const dir = ARROW_DIRECTIONS[event.key];
      if (dir !== undefined) {
        const next = moveGridFocus(focus, slots.length, cols, dir);
        if (next >= 0) {
          event.preventDefault();
          setFocus(next);
          cellRefs.current.get(next)?.focus();
        }
        return;
      }
      if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
        event.preventDefault();
        // A stack picked up in another grid sharing this transfer drops here: bag to stash by keyboard.
        if (picked === null) {
          if (slots[focus] !== null && slots[focus] !== undefined) pick({ inventoryId, slot: focus });
        } else {
          move(picked, { inventoryId, slot: focus });
          pick(null);
        }
        return;
      }
      if (event.key === "Escape" && picked !== null) {
        event.preventDefault();
        pick(null);
      }
    },
    [focus, slots, cols, picked, pick, move, inventoryId],
  );

  const rows: number[][] = useMemo(() => {
    const out: number[][] = [];
    for (let i = 0; i < slots.length; i += cols) {
      out.push(Array.from({ length: Math.min(cols, slots.length - i) }, (_, k) => i + k));
    }
    return out;
  }, [slots.length, cols]);

  const renderTile = (index: number): ReactNode => {
    const slot = slots[index] ?? null;
    const isPicked = isPickedHere(index);
    const key = inventorySlotKey({ inventoryId, slot: index });
    const label =
      slot === null
        ? `Empty slot ${index + 1}`
        : `${slot.itemId}${slot.count > 1 ? ` (${slot.count})` : ""}, slot ${index + 1}`;
    const custom = slot !== null ? itemIcon?.(slot.itemId) : undefined;
    const named = slot !== null ? iconForItemId(slot.itemId) : null;
    return (
      <DropZone key={index} id={key} layer={layer}>
        <div
          role="gridcell"
          aria-label={label}
          aria-selected={isPicked}
          tabIndex={focus === index ? 0 : -1}
          data-slot={index}
          ref={(node) => {
            if (node === null) cellRefs.current.delete(index);
            else cellRefs.current.set(index, node);
          }}
          onFocus={() => setFocus(index)}
          onKeyDown={onKeyDown}
          onDoubleClick={() => {
            if (slot !== null) onActivate?.(index);
          }}
          onClick={(event) => {
            if (event.shiftKey) {
              event.preventDefault();
              splitHalf(index);
            }
          }}
          onContextMenu={(event) => {
            if (slot !== null && slot.count > 1) {
              event.preventDefault();
              splitHalf(index);
            }
          }}
          style={{ width: size, height: size, position: "relative", cursor: slot !== null ? "grab" : "default" }}
        >
          {slot !== null ? (
            <DraggableCard id={key} value={{ inventoryId, slot: index }} layer={layer} onRotate={false}>
              {custom !== undefined && custom !== null ? (
                <IconTreatment glyph={custom} size={size} count={slot.count} active={isPicked} />
              ) : (
                <IconTreatment
                  {...(named === null ? {} : { icon: named })}
                  school={schoolForItem(slot.itemId)}
                  size={size}
                  count={slot.count}
                  active={isPicked}
                />
              )}
            </DraggableCard>
          ) : (
            <EmptySlot size={size} picked={isPicked} />
          )}
        </div>
      </DropZone>
    );
  };

  const refusedHere = refusal !== null && refusal.to.inventoryId === inventoryId ? refusal.reason : null;
  // Only the grid the stack came from paints the ghost, so a shared drag shows exactly one.
  const ghostHere = layer.state.payload?.value.inventoryId === inventoryId;

  return (
    <div
      role="grid"
      aria-label={`${inventoryId} inventory`}
      aria-colcount={cols}
      className={className}
      data-inventory-grid={inventoryId}
      style={{ display: "grid", gap, ...style }}
    >
      {rows.map((row, r) => (
        <div key={r} role="row" style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, ${size}px)`, gap }}>
          {row.map(renderTile)}
        </div>
      ))}
      <div
        role="status"
        aria-live="polite"
        data-move-refused={refusedHere ?? undefined}
        style={{ minHeight: "1em", fontSize: 12, color: "var(--jg-danger, #f26d6d)" }}
      >
        {refusedHere === null ? null : (describeRefusal?.(refusedHere) ?? REFUSAL_TEXT[refusedHere] ?? refusedHere)}
      </div>
      {ghostHere ? (
        <DragGhost layer={layer}>
          {(payload) => {
            const slot = slots[payload.value.slot] ?? null;
            if (slot === null) return null;
            const named = iconForItemId(slot.itemId);
            const custom = itemIcon?.(slot.itemId);
            return custom !== undefined && custom !== null ? (
              <IconTreatment glyph={custom} size={size} count={slot.count} />
            ) : (
              <IconTreatment
                {...(named === null ? {} : { icon: named })}
                school={schoolForItem(slot.itemId)}
                size={size}
                count={slot.count}
              />
            );
          }}
        </DragGhost>
      ) : null}
    </div>
  );
}
