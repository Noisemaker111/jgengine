import { BuilderIcon } from "@/dev/builder/components/builderIcons";
import { AssetViewer } from "@/dev/builder/components/AssetViewer";
import { BUILDER_CSS } from "@/dev/builder/components/builderStyles";

export function BuilderSidebar() {
  return (
    <aside className={BUILDER_CSS.sidebar} aria-label="Asset viewer">
      <header className="relative z-10 flex shrink-0 items-center gap-2.5 border-b border-[var(--surface-border)] bg-[var(--surface)] px-4 py-3">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[var(--brand-teal)]/15 text-[var(--brand-teal)]">
          <BuilderIcon id="library" active size="sm" />
        </div>
        <span className={BUILDER_CSS.propsTitle}>Asset viewer</span>
      </header>
      <AssetViewer />
    </aside>
  );
}