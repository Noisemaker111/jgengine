import { useQuery } from "convex/react";
import { api } from "@llmville/backend/convex/_generated/api";
import { communityMilestone } from "@llmville/game/tutorial/communityMilestone";
import { Award, Users } from "lucide-react";

export function NeighborhoodProject() {
  const progress = useQuery(api.multiplayer.worldPresence.communityProgress, {});
  if (progress === undefined) return null;
  const milestone = communityMilestone(progress.launchedLabs);
  return (
    <section aria-label="Community project" className="col-span-full rounded-2xl border border-brand-amber/25 bg-brand-amber/5 p-4 text-brand-cream">
      <h3 className="flex items-center gap-2 text-sm font-semibold">{milestone.complete ? <Award size={18} className="text-brand-amber" /> : <Users size={18} className="text-brand-teal" />}{milestone.complete ? milestone.reward : milestone.title}</h3>
      <p className="mt-2 text-xs leading-relaxed text-brand-cream-dim">{milestone.complete ? `${progress.launchedLabs} neighbors have launched their first earning model. Your community earned this badge together.` : `Help ${milestone.target} neighbors launch their first earning model. Ask for help in chat or share what worked for you.`}</p>
      <progress aria-label="Neighbors who launched a model" max={milestone.target} value={milestone.progress} className="mt-3 h-2 w-full accent-brand-amber" />
      <p className="mt-1 text-xs text-brand-amber">{milestone.progress} / {milestone.target} labs launched{!milestone.complete && ` · Reward: ${milestone.reward}`}</p>
    </section>
  );
}
