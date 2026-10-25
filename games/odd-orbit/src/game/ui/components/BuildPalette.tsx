import { HudButton } from "@jgengine/react/hudButton";
import { useGame, useSceneObjects } from "@jgengine/react/hooks";
import { useStore } from "@jgengine/react/store";
import { GameIcon } from "@jgengine/react/gameIcons";
import { NEED_ICON } from "../fiction/kit";
import { FURNITURE, FURNITURE_BY_ID } from "../../objects/catalog";
import { creditsText } from "./bits";
import { householdStore } from "../../session/store";

export function BuildPalette({ onChoose }: { onChoose?: () => void }) {
  const household = useStore(householdStore);
  const { commands } = useGame();
  const objects = useSceneObjects().filter(object => FURNITURE_BY_ID[object.catalogId]);
  return <section className="orbit-build"><h2>Make room for life</h2><p className="orbit-fine">Pick one, then tap open floor. Each piece adds to the nightly bill.</p><div className="orbit-build-options">{FURNITURE.map(def => {
    const affordable = household.credits >= def.cost;
    const selected = household.buildTool === def.id;
    return <HudButton key={def.id} aria-pressed={selected} disabled={!affordable} onClick={() => { commands.run("build.tool", { toolId:def.id }); onChoose?.(); }}><span className="orbit-furniture-icon" style={{ color:def.color }} aria-hidden="true"><GameIcon name={def.role === "work" ? "gear" : NEED_ICON[def.role]} size={26} className="orbit-icon-shadow" /><GameIcon name={def.role === "work" ? "gear" : NEED_ICON[def.role]} size={26} /></span><strong>{def.name}</strong><span>{def.blurb}</span><b>{def.cost} credits</b>{!affordable && <small>Need {creditsText(def.cost-household.credits)} more credits</small>}</HudButton>;
  })}</div>{household.buildTool && <div className="orbit-placement" role="status">Place {FURNITURE_BY_ID[household.buildTool]?.name} · cost {FURNITURE_BY_ID[household.buildTool]?.cost} credits<HudButton onClick={() => commands.run("build.cancel", {})}>Cancel placement</HudButton></div>}
    <details><summary>Manage placed furnishings · {objects.length}</summary><div className="orbit-object-list">{objects.map(object => <div key={object.instanceId}><span>{FURNITURE_BY_ID[object.catalogId]!.name}</span><HudButton onClick={() => commands.run("object.sell", { id:object.instanceId })}>Sell · {Math.round(FURNITURE_BY_ID[object.catalogId]!.cost/2)} credits</HudButton></div>)}</div></details>
  </section>;
}
