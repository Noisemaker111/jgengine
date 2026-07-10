import { PALETTE } from "../../palette";

export function BankSparkline({ data }: { data: readonly number[] }) {
  const w = 128;
  const h = 34;
  if (data.length < 2) {
    return <div style={{ height: h }} className="w-full" />;
  }
  let min = Infinity;
  let max = -Infinity;
  for (const v of data) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min || 1;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - 3 - ((v - min) / range) * (h - 6);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const up = data[data.length - 1]! >= data[0]!;
  const stroke = up ? PALETTE.pocket3 : PALETTE.frameLight;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-9 w-full">
      <polyline points={`0,${h} ${pts} ${w},${h}`} fill={stroke} opacity={0.16} stroke="none" />
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  );
}
