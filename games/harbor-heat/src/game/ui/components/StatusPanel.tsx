import { HudFade } from "@jgengine/react/hudFade";
import { useCurrency, useEntityStat, usePlayer } from "@jgengine/react/hooks";
import { money } from "../fiction/kit";

/** A thin bar cut into ticks, like the charge strip on a phone. */
function Strip({ label, value, max, tone }: { label: string; value: number; max: number; tone: "health" | "low" | "armor" }) {
  const pct = max <= 0 ? 0 : Math.max(0, Math.min(1, value / max));
  return (
    <span className="hh-strip" data-tone={tone}>
      <small>{label}</small>
      <span className="hh-strip-track" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value)}>
        <i style={{ width: `${pct * 100}%` }} />
      </span>
    </span>
  );
}

/**
 * Cash in hand, painted big like the price on a boulevard billboard, with street cred on a stamped tab
 * and slim health and armor strips under it. It dims when nothing changes and stays lit while you bleed.
 */
export function StatusPanel() {
  const { userId } = usePlayer();
  const health = useEntityStat(userId, "health");
  const armor = useEntityStat(userId, "armor")?.current ?? 0;
  const cred = useEntityStat(userId, "level")?.current ?? 1;
  const cash = useCurrency("cash");
  const hp = health?.current ?? 0;
  const max = health?.max ?? 100;
  const low = hp < max * 0.3;
  return (
    <HudFade watch={[cash, cred, Math.round(hp), Math.round(armor)]} idleMs={6000} dimTo={0.72} hold={low} className="hh-wallet">
      <span className="hh-wallet-top">
        <b className="hh-cash">{money(cash)}</b>
        <span className="hh-cred">Cred {cred}</span>
      </span>
      <Strip label="Health" value={hp} max={max} tone={low ? "low" : "health"} />
      {armor > 0 ? <Strip label="Armor" value={armor} max={100} tone="armor" /> : null}
    </HudFade>
  );
}
