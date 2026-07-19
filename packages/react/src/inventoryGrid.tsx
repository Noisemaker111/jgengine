import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

import { moveGridFocus, type FocusDirection } from "@jgengine/core/ui/actionModel";

import { DragGhost, DraggableCard, DropZone, useDragLayer } from "./dragLayer";
import { iconForItemId } from "./gameIcons";
import { IconTreatment, schoolForItem } from "./iconTreatment";
import { useInventoryGrid } from "./hooks";

/**
 * A drop-in NxN inventory grid bound to a live inventory: `<InventoryGrid inventoryId="bag" columns={4} />`
 * renders every slot (painted {@link IconTreatment} tile + count badge for filled, a themed `--jg-slot-*`
 * placeholder for empty), and wires the real mechanics on top of the engine's inventory model —
 * drag-to-move, swap, stack-merge with remainder (all via the `inventory.move` command), and stack-split
 * (shift/right-click a stack, via `inventory.split`). Fully keyboard-accessible: `role="grid"`, arrow-key
 * roving focus, Enter/Space to pick up and drop. Games own placement, skin, and terminology; the engine
 * ships the working grid.
 *
 * @capability inventory-grid-hud drop-in NxN inventory grid with drag/swap/stack/split bound to a live inventory
 */

const ARROW_DIRECTIONS: Record<string, FocusDirection> = {
  ArrowRight: "right",
  ArrowLeft: "left",
  ArrowUp: "up",
  ArrowDown: "down",
  Home: "first",
  End: "last",
};

/** Props for {@link InventoryGrid}. */
export interface InventoryGridProps {
  /** The declared inventory id to bind (its slot count sets the tile count). */
  inventoryId: string;
  /** Grid columns; default derives a squarish grid from the slot count. */
  columns?: number;
  /** Tile size in px. Default 44. */
  size?: number;
  /** Gap between tiles in px. Default 6. */
  gap?: number;
  /** Caller-supplied item id → icon/glyph registry; return null/undefined to fall back to the default `GameIcon`. */
  itemIcon?: (itemId: string) => ReactNode;
  /** Invoked when a filled slot is activated (double-click) — e.g. use/equip the item. */
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

/** A drop-in inventory grid with drag/swap/stack-merge/split and full keyboard control, bound to `inventoryId`. */
export function InventoryGrid({
  inventoryId,
  columns,
  size = 44,
  gap = 6,
  itemIcon,
  onActivate,
  className,
  style,
}: InventoryGridProps) {
  const { slots, move, split } = useInventoryGrid(inventoryId);
  const cols = columns ?? Math.max(1, Math.ceil(Math.sqrt(slots.length)));

  const [focus, setFocus] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const cellRefs = useRef(new Map<number, HTMLDivElement>());

  const layer = useDragLayer<number>({
    onDrop: (info) => {
      const target = info.target === null ? null : Number(info.target);
      if (target !== null && Number.isInteger(target) && target !== info.payload.value) {
        move(info.payload.value, target);
      }
    },
  });

  useEffect(() => {
    if (focus < slots.length) cellRefs.current.get(focus)?.focus();
  }, [focus, slots.length]);

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
        }
        return;
      }
      if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
        event.preventDefault();
        if (picked === null) {
          if (slots[focus] !== null && slots[focus] !== undefined) setPicked(focus);
        } else {
          if (picked !== focus) move(picked, focus);
          setPicked(null);
        }
        return;
      }
      if (event.key === "Escape" && picked !== null) {
        event.preventDefault();
        setPicked(null);
      }
    },
    [focus, slots, cols, picked, move],
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
    const isPicked = picked === index;
    const label =
      slot === null
        ? `Empty slot ${index + 1}`
        : `${slot.itemId}${slot.count > 1 ? ` (${slot.count})` : ""}, slot ${index + 1}`;
    const custom = slot !== null ? itemIcon?.(slot.itemId) : undefined;
    const named = slot !== null ? iconForItemId(slot.itemId) : null;
    return (
      <DropZone key={index} id={String(index)} layer={layer}>
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
            <DraggableCard id={String(index)} value={index} layer={layer} onRotate={false}>
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
      <DragGhost layer={layer}>
        {(payload) => {
          const slot = slots[payload.value] ?? null;
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
    </div>
  );
}
