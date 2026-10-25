import type { ReactNode } from "react";

import type { BillType } from "@/economy/events";

const GLYPH_STROKE = "#b8a898";

function GlyphSvg({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <svg className={className} viewBox="0 0 140 72" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      {children}
    </svg>
  );
}

function ElectricityGlyph({ className }: { className?: string }) {
  const s = { stroke: GLYPH_STROKE, fill: "none" as const, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <GlyphSvg className={className}>
      <path d="M38 8 L28 38 H42 L34 64 L58 30 H44 Z" {...s} strokeWidth={2.4} />
      <rect x="78" y="18" width="44" height="38" rx="2" {...s} strokeWidth={2.2} />
      <rect x="84" y="24" width="32" height="14" rx="1" {...s} strokeWidth={1.6} />
      <path d="M86 50h28M86 56h20" stroke={GLYPH_STROKE} strokeWidth={1.4} strokeLinecap="round" opacity={0.7} />
      <text x="88" y="35" fill={GLYPH_STROKE} fontSize="7" fontFamily="ui-monospace, monospace" opacity={0.85}>
        00234
      </text>
    </GlyphSvg>
  );
}

function WaterGlyph({ className }: { className?: string }) {
  const s = { stroke: GLYPH_STROKE, fill: "none" as const, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <GlyphSvg className={className}>
      <path
        d="M42 10 C42 10 24 34 24 48 C24 58 32 66 42 66 C52 66 60 58 60 48 C60 34 42 10 42 10Z"
        {...s}
        strokeWidth={2.4}
      />
      <path d="M72 44 H118" {...s} strokeWidth={2.6} />
      <circle cx="98" cy="44" r="12" {...s} strokeWidth={2.2} />
      <circle cx="98" cy="44" r="4" {...s} strokeWidth={1.6} />
      <path d="M98 32v-8M90 36l-6-4M106 36l6-4" stroke={GLYPH_STROKE} strokeWidth={1.6} strokeLinecap="round" />
    </GlyphSvg>
  );
}

function RentGlyph({ className }: { className?: string }) {
  const s = { stroke: GLYPH_STROKE, fill: "none" as const, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
        <GlyphSvg className={className}>
          <rect x="32" y="16" width="34" height="50" {...s} strokeWidth={2.2} />
          <rect x="74" y="16" width="34" height="50" {...s} strokeWidth={2.2} />
          <path
            d="M36 26h24M36 36h24M36 46h24M78 26h24M78 36h24M78 46h24"
            stroke={GLYPH_STROKE}
            strokeWidth={1.3}
            strokeLinecap="round"
            opacity={0.55}
          />
        </GlyphSvg>
  );
}

/** Line-art watermark for invoice bill cards (electricity, water, rent). */
export function BillCardGlyph({
  billType,
  className,
}: {
  billType: BillType;
  className?: string;
}) {
  switch (billType) {
    case "electricity":
      return <ElectricityGlyph className={className} />;
    case "water":
      return <WaterGlyph className={className} />;
    case "rent":
      return <RentGlyph className={className} />;
  }
}
