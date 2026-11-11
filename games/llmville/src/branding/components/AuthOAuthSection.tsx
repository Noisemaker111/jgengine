/** @jsxImportSource @jgengine/core/ui/jsx */
import { RuneAction, RuneGlyph } from "@jgengine/core/ui/rune/primitives.view";

import { FULL, Icon, Text } from "../../ui/kit";
import { GOOGLE_ARTWORK } from "../../ui/icons";

/** Google sign-in, on Google's own white button. */
export function AuthOAuthSection({ actionLabel, loadingLabel = "Connecting…", loading, onClick }: {
  actionLabel: string; loadingLabel?: string; loading: boolean; onClick: () => void;
}) {
  return <RuneAction layout="row" gap={10} items="center" justify="center" width={FULL} minHeight={46} radius={14} fill="#ffffff" border={{ width: 1, color: "#dadce0" }}
    hover="#00000010" press="#00000020" color="#1f1f1f" disabled={loading} label={`${actionLabel} with Google`} run={onClick}>
    {loading ? <Icon name="spinner" size={16} color="#1f1f1f" /> : <RuneGlyph artwork={GOOGLE_ARTWORK} size={18} />}
    <Text size={15} weight={700} color="#1f1f1f">{loading ? loadingLabel : actionLabel}</Text>
  </RuneAction>;
}
