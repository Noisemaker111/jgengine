import { useLocalPlayerDead } from "@jgengine/react/hooks";

import { DeathScreenView } from "@/components/ui/death-screen-view";

export function DeathOverlayBound({
  statId = "health",
  title,
  subtitle,
  respawnLabel,
  respawnKeybind,
  onRespawn,
  respawnAvailableIn,
  className,
}: {
  statId?: string;
  title?: string;
  subtitle?: string;
  respawnLabel?: string;
  respawnKeybind?: string;
  onRespawn?: () => void;
  respawnAvailableIn?: number;
  className?: string;
}) {
  const dead = useLocalPlayerDead(statId);
  if (!dead) return null;
  return (
    <DeathScreenView
      title={title}
      subtitle={subtitle}
      respawnLabel={respawnLabel}
      respawnKeybind={respawnKeybind}
      onRespawn={onRespawn}
      respawnAvailableIn={respawnAvailableIn}
      className={className}
    />
  );
}
