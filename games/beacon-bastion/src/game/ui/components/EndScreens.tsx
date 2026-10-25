import { useGame, useGameStore } from "@jgengine/react/hooks";
import { GameCursor } from "@jgengine/react/gameCursor";
import { GameFrame } from "@jgengine/react/gameFrame";
import { GameIcon } from "@jgengine/react/gameIcons";
import { useMenuNav } from "@jgengine/react/menuNav";

import { campaign, COUNCIL_NODES, councilPoints, councilTree, DIFFICULTIES, DIFFICULTY_IDS } from "../../campaign";
import { keep } from "../../keep";
import { currentWaveNumber } from "../../session";
import { bountyReadout } from "../../waves/bounty";
import { boonDef, carriedRelic, legacy, relicBountyScale } from "../../waves/legacy";
import { TOTAL_WAVES } from "../../waves/manifest";
import { Brazier } from "../kit/Brazier";
import { FIRE } from "../theme";

/**
 * The defense's memorial stone: what it paid, what it banked, and the relics the next keep may open
 * with, each on a sealed writ. One stone for a hold and a fall alike - a fallen keep still has
 * something to carry forward. The field behind is shut out, so nothing on the road runs through it.
 */
export function EndScreens() {
  const gameOver = useGameStore((ctx) => keep.of(ctx).fact("keep.fallen") === true);
  const victory = useGameStore((ctx) => keep.of(ctx).fact("keep.held") === true);
  if (!gameOver && !victory) return null;
  return <Memorial victory={victory} />;
}

function Memorial({ victory }: { victory: boolean }) {
  const { commands } = useGame();
  const bountyEarned = useGameStore((ctx) => keep.of(ctx).num("keep.bounty_earned"));
  const account = useGameStore((ctx) => legacy.read(ctx));
  const wave = Math.max(1, Math.min(TOTAL_WAVES, currentWaveNumber()));
  const readout = bountyReadout(wave, bountyEarned, relicBountyScale(account));
  const relic = carriedRelic(account);
  const offers = account.offer.map((id) => ({ id: `boon:${id}`, boon: boonDef(id), raw: id }));
  const ids = [...offers.map((offer) => offer.id), "restart"];
  const choose = (id: string) => commands.run("legacy.choose", { boon: id.startsWith("boon:") ? id.slice("boon:".length) : null });
  const nav = useMenuNav({ ids, onConfirm: choose });
  const stars = useGameStore((ctx) => keep.of(ctx).num("keep.stars"));
  const difficulty = useGameStore((ctx) => campaign.read(ctx).difficulty);

  const lines: [string, string][] = [
    ["Waves reached", `${wave} / ${TOTAL_WAVES}`],
    ["Bounties paid", `${readout.earned} gold`],
    ["Kill pay", `${readout.opening} → ${readout.closing} gold (×${readout.scale.toFixed(2)})`],
    ["Gold banked", `${account.bankedGold}`],
    ["Standing", String(account.standing)],
    ["Relic carried", relic === null ? "none" : relic.label],
  ];

  return (
    <div className="bb-memorial" data-outcome={victory ? "victory" : "defeat"}>
      <div className="bb-memorial-dark" aria-hidden />
      <GameFrame material="stone" tint="#5a554d" cut="chamfer" depth={22} padding="18px 30px 24px" className="bb-memorial-stone">
        <Brazier size={48} strength={victory ? 1 : 0} className="bb-memorial-fire" />
        <h2 className="bb-memorial-title">{victory ? "The Keep Holds" : "The Keep Has Fallen"}</h2>
        <span className="bb-stars" data-jg="result-stars" aria-label={`${stars} stars on ${DIFFICULTIES[difficulty].label}`}>
          {Array.from({ length: 3 + DIFFICULTIES[difficulty].bonusStar }, (_, index) => (
            <GameIcon key={index} name="star" size={26} color={index < stars ? "#ffcf5a" : "#3a2f24"} />
          ))}
          <small>{DIFFICULTIES[difficulty].label}</small>
        </span>
        <dl className="bb-ledger">
          {lines.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <WarCouncil />
        <p className="bb-memorial-ask">Carry one relic into the next keep</p>
        <nav className="bb-writs" {...nav.containerProps} data-jg-cursor-scope="">
          {offers.map((offer) => (
            <GameFrame
              key={offer.id}
              as="button"
              material="paper"
              cut="torn"
              depth={8}
              padding="10px 12px 16px"
              className="bb-writ"
              {...nav.itemProps(offer.id)}
              onClick={() => choose(offer.id)}
            >
              <i className="bb-wax" aria-hidden>
                <GameIcon name="star" size={14} color="#ffd9b0" />
              </i>
              <strong>{offer.boon === null ? offer.raw : offer.boon.label}</strong>
              <span>{offer.boon === null ? "" : offer.boon.detail}</span>
            </GameFrame>
          ))}
          <GameFrame
            as="button"
            material="wood"
            cut="notch"
            depth={10}
            padding="10px 22px"
            className="bb-plank bb-again"
            {...nav.itemProps("restart")}
            onClick={() => choose("restart")}
          >
            <span className="bb-plank-label" data-text="Defend again">Defend again</span>
          </GameFrame>
          <GameCursor variant="diamond" color={FIRE} arm={16} gap={8} />
        </nav>
      </GameFrame>
    </div>
  );
}

/**
 * The war council between defenses: the best stars on each difficulty are its points, spent on seats
 * that strengthen a tower line, the purse or the beacon's rites. The next defense's difficulty is
 * chosen here too, so a player who keeps losing can step down and one who keeps holding can step up.
 */
function WarCouncil() {
  const { commands } = useGame();
  const view = useGameStore((ctx) => {
    const state = campaign.read(ctx);
    const tree = councilTree(ctx);
    return {
      difficulty: state.difficulty,
      points: councilPoints(state),
      free: tree.pointsAvailable(),
      seats: COUNCIL_NODES.map((node) => ({ node, rank: tree.rank(node.id), open: tree.canSpend(node.id) })),
    };
  });
  const branches = [
    { id: "arsenal", label: "Arsenal" },
    { id: "treasury", label: "Treasury" },
    { id: "rites", label: "Rites" },
  ];
  return (
    <div className="bb-council" data-jg="war-council">
      <div className="bb-council-head">
        <span className="bb-council-title">
          <GameIcon name="star" size={14} color="#ffcf5a" /> {`War Council · ${view.free} of ${view.points} free`}
        </span>
        <span className="bb-difficulty" role="radiogroup" aria-label="Next defense difficulty">
          {DIFFICULTY_IDS.map((id) => (
            <GameFrame
              key={id}
              as="button"
              material={view.difficulty === id ? "enamel" : "wood"}
              tint={view.difficulty === id ? "#8a2414" : undefined}
              cut="notch"
              depth={6}
              padding="3px 9px"
              className="bb-small-plank"
              role="radio"
              aria-checked={view.difficulty === id}
              title={DIFFICULTIES[id].detail}
              data-jg={`difficulty-${id}`}
              onClick={() => commands.run("campaign.difficulty", { difficulty: id })}
            >
              {DIFFICULTIES[id].label}
            </GameFrame>
          ))}
        </span>
      </div>
      <div className="bb-council-seats">
        {branches.map((branch) => (
          <div key={branch.id} className="bb-council-branch">
            <span className="bb-council-branch-name">{branch.label}</span>
            {view.seats
              .filter((seat) => seat.node.branch === branch.id)
              .map(({ node, rank, open }) => (
                <GameFrame
                  key={node.id}
                  as="button"
                  material="stone"
                  tint={rank > 0 ? "#6b5a2e" : "#3f3b35"}
                  cut="chamfer"
                  depth={4}
                  padding="3px 7px"
                  className="bb-seat"
                  data-dim={open.ok || rank > 0 ? undefined : ""}
                  data-jg={`council-${node.id}`}
                  title={`${node.detail}${open.ok ? "" : ` — ${open.reason}`}`}
                  onClick={() => commands.run("council.rank", { node: node.id })}
                >
                  <span>{node.label}</span>
                  <b>{`${rank}/${node.maxRank ?? 1}`}</b>
                </GameFrame>
              ))}
          </div>
        ))}
      </div>
      {view.points > view.free ? (
        <GameFrame as="button" material="wood" cut="notch" depth={5} padding="3px 10px" className="bb-small-plank bb-council-reset" onClick={() => commands.run("council.reset", {})}>
          Return every seat
        </GameFrame>
      ) : null}
    </div>
  );
}
