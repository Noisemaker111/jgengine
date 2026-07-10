import { actionLabel, bindingLabel } from "@jgengine/core/input/actionBindings";
import { keybinds } from "../../keybinds";
import { CHARGE_FUSE_SECONDS } from "../../charges/chargeState";
import type { ChargeSlotView } from "../../match/snapshot";

function ChargeSlot({ slot, index }: { slot: ChargeSlotView; index: number }) {
  const remaining = Math.max(0, CHARGE_FUSE_SECONDS * (1 - slot.fuseFraction));
  const sweepDeg = slot.armed ? Math.round(slot.fuseFraction * 360) : 0;
  return (
    <div
      className={`relative flex h-14 w-14 items-center justify-center rounded-lg border-2 sm:h-16 sm:w-16 ${
        slot.armed ? "border-[#ff6b35] bg-[#2b1710]" : "border-[#cdb891]/30 bg-[#1c1815]/80"
      }`}
      style={
        slot.armed
          ? {
              backgroundImage: `conic-gradient(#ff6b35 ${sweepDeg}deg, rgba(255,107,53,0.12) ${sweepDeg}deg)`,
            }
          : undefined
      }
    >
      {slot.armed ? (
        <span className="rounded bg-black/60 px-1.5 py-0.5 text-sm font-bold text-[#ffd7ba] sm:text-base">
          {remaining.toFixed(1)}
        </span>
      ) : (
        <span className="text-xs font-semibold text-[#cdb891]/50">EMPTY</span>
      )}
      <span className="absolute -bottom-1.5 -right-1.5 rounded border border-[#cdb891]/40 bg-[#0f0c0a] px-1 text-[10px] font-bold text-[#cdb891]">
        {index + 1}
      </span>
    </div>
  );
}

export function ChargeSlots({ slots, dodgeFraction }: { slots: readonly [ChargeSlotView, ChargeSlotView]; dodgeFraction: number }) {
  const throwLabel = bindingLabel("mouse0");
  const facingLabel = actionLabel(keybinds, "throwFacing") ?? "F";
  const detonateLabel = actionLabel(keybinds, "detonateCharges") ?? "Space";
  const dodgeLabel = actionLabel(keybinds, "dodgeRoll") ?? "Shift";
  const dodgeReady = dodgeFraction >= 1;
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[#ff6b35]/25 bg-[#160f0c]/85 p-3 shadow-lg shadow-black/40 backdrop-blur-sm">
      <div className="flex items-center gap-2">
        {slots.map((slot, index) => (
          <ChargeSlot key={index} slot={slot} index={index} />
        ))}
        <div className="ml-1 flex flex-col items-center gap-1">
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-[10px] font-bold ${
              dodgeReady ? "border-[#3bc7c4] text-[#3bc7c4]" : "border-[#cdb891]/30 text-[#cdb891]/40"
            }`}
            style={{
              backgroundImage: dodgeReady
                ? undefined
                : `conic-gradient(rgba(59,199,196,0.5) ${Math.round(dodgeFraction * 360)}deg, transparent ${Math.round(dodgeFraction * 360)}deg)`,
            }}
          >
            {dodgeLabel}
          </div>
          <span className="text-[9px] font-semibold uppercase tracking-wide text-[#cdb891]/50">Dodge</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#cdb891]/70">
        <span>
          <span className="rounded bg-black/50 px-1 py-0.5 text-[#ffd7ba]">{throwLabel}</span> arm
        </span>
        <span>
          <span className="rounded bg-black/50 px-1 py-0.5 text-[#ffd7ba]">{facingLabel}</span> arm-facing
        </span>
        <span>
          <span className="rounded bg-black/50 px-1 py-0.5 text-[#ffd7ba]">{detonateLabel}</span> detonate
        </span>
      </div>
    </div>
  );
}
