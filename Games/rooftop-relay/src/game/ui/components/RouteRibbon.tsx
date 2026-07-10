import { ROUTE } from "../../route/legs";

export function RouteRibbon({ legIndex, legProgress }: { legIndex: number; legProgress: number }) {
  return (
    <div className="w-64 rounded-md border border-[#b8a9d9]/40 bg-black/55 px-3 py-2 shadow-lg backdrop-blur">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#c9c4b8]">Relay route</p>
      <div className="flex gap-1">
        {ROUTE.legs.map((leg, index) => {
          const done = index < legIndex;
          const active = index === legIndex;
          const fill = done ? 1 : active ? legProgress : 0;
          return (
            <div key={leg.spec.id} className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-white/10" title={leg.spec.name}>
              <div
                className={`h-full rounded-full ${done ? "bg-[#c9c4b8]" : "bg-[#f2b950]"}`}
                style={{ width: `${Math.round(fill * 100)}%` }}
              />
              <span
                className={`absolute -right-0.5 -top-1 h-2 w-2 rounded-full border border-black/60 ${
                  done ? "bg-[#b8a9d9]" : "bg-[#2b2320]"
                }`}
                aria-hidden
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
