/** @jsxImportSource @jgengine/core/ui/jsx */
import { GameIcon } from "@jgengine/core/ui/icons/gameIcons.view";
import { useStore } from "@jgengine/ui/store";
import { MAX_HEAT, MAX_STARS, type WantedSnapshot, wantedStore } from "../../streetPlay";

/** HHPD's own words for what it is doing, so the stars read as a search rather than a score. */
function heatLine(wanted: Pick<WantedSnapshot, "response" | "stars">): string {
  if (wanted.response === "roadblock") return "HHPD has the causeway";
  if (wanted.response === "pursue") return "HHPD is hunting you";
  return wanted.stars >= 2 ? "HHPD is asking around" : "Someone called it in";
}

const SEGMENTS = 20;

/**
 * The police scanner on the dash, only on while HHPD wants you: a red-and-blue light bar that strobes
 * once they are hunting, a row of star badges, and red LED lines for what dispatch is saying, how hot
 * the call is, and how wide the search circle is.
 */
export function WantedStars() {
  // Pursuit publishes heat every tick; the scanner draws twenty segments, so it selects those.
  const wanted = useStore(wantedStore, (state) => state === undefined ? undefined : {
    stars: state.stars,
    response: state.response,
    lit: Math.round((Math.min(state.heat, MAX_HEAT) / MAX_HEAT) * SEGMENTS),
    searchRadius: state.search == null ? null : Math.round(state.search.radius),
  });
  if (wanted === undefined || wanted.stars === 0) return null;
  const hunting = wanted.response === "pursue" || wanted.response === "roadblock";
  const lit = wanted.lit;
  return (
    <div className="hh-scanner" data-hunting={hunting ? "" : undefined} data-stars={wanted.stars}>
      <span className="hh-lightbar" aria-hidden="true"><i /><i /><i /><i /></span>
      <div className="hh-scanner-body">
        <span className="hh-scanner-stars" role="img" aria-label={`${wanted.stars} of ${MAX_STARS} stars`}>
          {Array.from({ length: MAX_STARS }, (_, i) => (
            <span key={i} className="hh-badge" data-lit={i < wanted.stars ? "" : undefined}>
              <GameIcon name="star" size={22} />
            </span>
          ))}
          <span className="hh-sr">{"★".repeat(wanted.stars) + "☆".repeat(MAX_STARS - wanted.stars)}</span>
        </span>
        <span className="hh-led">
          <b className="hh-led-line">{heatLine(wanted)}</b>
          <span className="hh-led-heat" aria-hidden="true">
            {Array.from({ length: SEGMENTS }, (_, i) => <i key={i} data-lit={i < lit ? "" : undefined} />)}
          </span>
          {wanted.searchRadius === null ? null : <small className="hh-led-search">Search {wanted.searchRadius} m · lose them outside it</small>}
        </span>
      </div>
    </div>
  );
}
