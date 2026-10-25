import { GameIcon } from "@jgengine/react/gameIcons";
import { useStore } from "@jgengine/react/store";
import { MAX_HEAT, MAX_STARS, type WantedSnapshot, wantedStore } from "../../handroll";

/** HHPD's own words for what it is doing, so the stars read as a search rather than a score. */
function heatLine(wanted: WantedSnapshot): string {
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
  const wanted = useStore(wantedStore);
  if (wanted === undefined || wanted.stars === 0) return null;
  const hunting = wanted.response === "pursue" || wanted.response === "roadblock";
  const lit = Math.round((Math.min(wanted.heat, MAX_HEAT) / MAX_HEAT) * SEGMENTS);
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
          {wanted.search == null ? null : <small className="hh-led-search">Search {Math.round(wanted.search.radius)} m · lose them outside it</small>}
        </span>
      </div>
    </div>
  );
}
