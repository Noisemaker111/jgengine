import { useState } from "react";

import { BILL_TYPE_LABELS } from "@/economy/events";
import { InvoiceBillCard } from "@/economy/components/InvoiceBillCard";
import type { BillType } from "@/economy/events";

const PREVIEW_BILLS: ReadonlyArray<{
  billType: BillType;
  label: string;
  amountUsd: number;
}> = [
  { billType: "electricity", label: BILL_TYPE_LABELS.electricity, amountUsd: 47 },
  { billType: "water", label: "Water", amountUsd: 12 },
  { billType: "rent", label: "Rent", amountUsd: 3 },
];

const STATE_MATRIX: ReadonlyArray<{
  id: string;
  canAfford: boolean;
  isOverdue: boolean;
  caption: string;
}> = [
  { id: "ok", canAfford: true, isOverdue: false, caption: "Can pay" },
  { id: "overdue", canAfford: true, isOverdue: true, caption: "Overdue stamp" },
  { id: "broke", canAfford: false, isOverdue: false, caption: "Insufficient funds" },
  { id: "both", canAfford: false, isOverdue: true, caption: "Overdue + broke" },
];

type BackdropId = "white" | "game";
type GalleryMode = "all-types" | "state-matrix";

/**
 * Dev-only gallery for invoice bill cards — screenshot or iterate on glyph/CSS without play mode.
 * Visit /dev/bills while `bun run dev:web` is running.
 */
export function BillsDevPreview() {
  const [backdrop, setBackdrop] = useState<BackdropId>("white");
  const [galleryMode, setGalleryMode] = useState<GalleryMode>("all-types");
  const [canAfford, setCanAfford] = useState(true);
  const [showOverdue, setShowOverdue] = useState(false);

  const backdropClass =
    backdrop === "white"
      ? "bg-white"
      : "bg-gradient-to-b from-[#2b4a44] via-[#1d3531] to-[#0c1614]";

  const captionClass = backdrop === "white" ? "text-zinc-500" : "text-white/40";

  return (
    <div className="flex h-full w-full overflow-hidden text-white">
      <aside className="flex w-[min(18rem,34vw)] shrink-0 flex-col gap-4 overflow-y-auto border-r border-white/10 bg-zinc-950 p-4 text-sm">
        <div>
          <p className="font-game text-xs uppercase tracking-[0.2em] text-brand-teal/80">Billing lab</p>
          <h1 className="mt-1 font-game text-lg font-bold">Invoice bill cards</h1>
          <p className="mt-2 text-xs leading-relaxed text-white/55">
            Screenshot the grid on the right. Tweak stamps and afford states in{" "}
            <code className="text-white/70">InvoiceBillCard.tsx</code> and{" "}
            <code className="text-white/70">index.css</code>.
          </p>
          <p className="mt-2 text-xs text-white/45">
            URL: <span className="text-white/70">/dev/bills</span> — dev only.
          </p>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">Gallery</span>
          <select
            value={galleryMode}
            onChange={(event) => setGalleryMode(event.target.value as GalleryMode)}
            className="rounded border border-white/15 bg-zinc-900 px-2 py-1.5 text-white"
          >
            <option value="all-types">All 4 bill types</option>
            <option value="state-matrix">State matrix (electricity)</option>
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">Backdrop</span>
          <select
            value={backdrop}
            onChange={(event) => setBackdrop(event.target.value as BackdropId)}
            className="rounded border border-white/15 bg-zinc-900 px-2 py-1.5 text-white"
          >
            <option value="white">White (clean export)</option>
            <option value="game">In-game HUD (dark)</option>
          </select>
        </label>

        {galleryMode === "all-types" ? (
          <>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={canAfford}
                onChange={(event) => setCanAfford(event.target.checked)}
                className="rounded"
              />
              <span className="text-xs text-white/70">Can afford</span>
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={showOverdue}
                onChange={(event) => setShowOverdue(event.target.checked)}
                className="rounded"
              />
              <span className="text-xs text-white/70">Overdue stamp</span>
            </label>
          </>
        ) : null}
      </aside>

      <main className={`flex flex-1 items-center justify-center overflow-auto p-8 ${backdropClass}`}>
        {galleryMode === "all-types" ? (
          <div className="grid w-full max-w-[44rem] grid-cols-1 gap-6 sm:grid-cols-2" data-dev-bills-gallery>
            {PREVIEW_BILLS.map((preview) => (
              <div key={preview.billType} className="flex flex-col items-center gap-2">
                <InvoiceBillCard
                  label={preview.label}
                  amountUsd={preview.amountUsd}
                  billType={preview.billType}
                  canAfford={canAfford}
                  isOverdue={showOverdue}
                  onPay={() => undefined}
                />
                <p className={`text-[10px] uppercase tracking-widest ${captionClass}`}>{preview.billType}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid w-full max-w-[52rem] grid-cols-1 gap-6 sm:grid-cols-2" data-dev-bills-state-matrix>
            {STATE_MATRIX.map((state) => (
              <div key={state.id} className="flex flex-col items-center gap-2">
                <InvoiceBillCard
                  label={BILL_TYPE_LABELS.electricity}
                  amountUsd={47}
                  billType="electricity"
                  canAfford={state.canAfford}
                  isOverdue={state.isOverdue}
                  onPay={() => undefined}
                />
                <p className={`text-[10px] uppercase tracking-widest ${captionClass}`}>{state.caption}</p>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
