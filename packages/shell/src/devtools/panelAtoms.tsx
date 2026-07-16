export function ms(value: number): string {
  return `${value.toFixed(1)}ms`;
}

export function StatRow({ name, value, alert }: { name: string; value: string; alert?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-neutral-400">{name}</span>
      <span className={`font-mono tabular-nums ${alert === true ? "text-red-400" : "text-neutral-100"}`}>{value}</span>
    </div>
  );
}

export function SectionLabel({ children }: { children: string }) {
  return <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-neutral-500">{children}</div>;
}
