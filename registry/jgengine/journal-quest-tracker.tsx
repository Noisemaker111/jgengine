import type { QuestInstance } from "@jgengine/core/game/quest";
import { useQuestJournal } from "@jgengine/react/hooks";

import { QuestTracker, type TrackedQuest } from "@/components/ui/quest-tracker";

export function JournalQuestTracker({
  describe,
  width,
  className,
}: {
  describe: (quest: QuestInstance) => TrackedQuest | null;
  width?: number;
  className?: string;
}) {
  const journal = useQuestJournal();
  const quests = journal
    .map((instance) => describe(instance))
    .filter((quest): quest is TrackedQuest => quest !== null);
  return <QuestTracker quests={quests} width={width} className={className} />;
}
