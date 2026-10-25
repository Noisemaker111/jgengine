export const BUILDER_CSS = {
  shell: "flex h-full min-h-0 flex-col bg-[var(--brand-ink)] text-[var(--brand-cream)]",
  topBar: "relative z-20 flex h-14 shrink-0 items-center gap-3 border-b border-[var(--surface-border)] bg-[var(--surface-strong)] px-4 backdrop-blur",
  topBarLabel: "font-game text-base font-bold text-[var(--brand-cream)]",
  topBarSubLabel: "font-game text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--brand-cream-dim)]",
  scenePromptWrap:
    "pointer-events-auto absolute bottom-5 left-1/2 z-20 flex w-full max-w-md -translate-x-1/2 flex-col items-center gap-1.5 px-4",
  scenePromptField:
    "game-input min-h-16 max-h-32 w-full resize-none rounded-xl border border-[var(--surface-border)] bg-[var(--surface-strong)]/92 px-3 py-3 pr-12 text-sm leading-relaxed shadow-lg backdrop-blur placeholder:text-[var(--brand-cream-dim)]/55",
  scenePromptSend:
    "absolute bottom-2.5 right-2.5 grid h-8 w-8 place-items-center rounded-lg bg-[var(--brand-coral)] text-[#3a1b12] shadow-sm transition hover:bg-[#ec8f78] disabled:opacity-40",
  compactSelect:
    "h-8 w-full min-w-0 cursor-pointer rounded-[var(--r-field)] border border-[var(--surface-border)] bg-black/35 px-2 text-xs text-[var(--brand-cream)] shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-teal)]/35",
  canvasToolStrip:
    "pointer-events-auto absolute left-3 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-1",
  toolSquare:
    "group relative grid h-9 w-9 shrink-0 place-items-center rounded-md border border-[var(--surface-border)] bg-black/25 text-[var(--brand-cream-dim)] transition hover:border-[var(--surface-border-strong)] hover:text-[var(--brand-cream)]",
  toolSquareActive:
    "border-[var(--brand-teal)]/55 bg-[var(--brand-teal)]/15 text-[var(--brand-teal)] shadow-[inset_0_0_0_1px_rgba(95,194,168,0.18)]",
  toolSquareShortcut:
    "pointer-events-none absolute -bottom-1 right-0.5 rounded bg-black/50 px-0.5 font-mono text-[7px] text-[var(--brand-cream-dim)] opacity-0 transition group-hover:opacity-100",
  sidebar:
    "flex w-80 shrink-0 flex-col border-r border-[var(--surface-border)] bg-[var(--surface)]",
  sidebarHeader:
    "flex shrink-0 flex-col gap-3 border-b border-[var(--surface-border)] px-4 py-3",
  sidebarSelectorRow: "grid grid-cols-2 gap-2",
  sidebarSection: "border-b border-[var(--surface-border)] px-4 py-3",
  sidebarToolButton:
    "inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md border border-[var(--surface-border)] bg-black/20 px-2 py-2 text-[11px] font-semibold text-[var(--brand-cream-dim)] transition hover:border-[var(--surface-border-strong)] hover:text-[var(--brand-cream)]",
  sidebarToolButtonActive:
    "border-[var(--brand-teal)]/55 bg-[var(--brand-teal)]/15 text-[var(--brand-teal)]",
  recentAssetCard:
    "flex w-full flex-col gap-0.5 rounded-md border border-transparent bg-black/20 px-2.5 py-2 text-left transition hover:border-[var(--surface-border)] hover:bg-black/30",
  recentAssetCardActive: "border-[var(--brand-teal)]/45 bg-[var(--brand-teal)]/10",
  toolRail: "flex w-14 shrink-0 flex-col items-center gap-1 border-r border-[var(--surface-border)] bg-[var(--surface)] py-2",
  toolButton:
    "group relative grid h-10 w-10 place-items-center rounded-lg border border-transparent text-[var(--brand-cream-dim)] transition hover:border-[var(--surface-border-strong)] hover:bg-black/30 hover:text-[var(--brand-cream)]",
  toolButtonActive:
    "border-[var(--brand-teal)]/55 bg-[var(--brand-teal)]/15 text-[var(--brand-teal)] shadow-[inset_0_0_0_1px_rgba(95,194,168,0.18)]",
  toolShortcut:
    "pointer-events-none absolute -bottom-0.5 right-1 rounded bg-black/40 px-1 text-[8px] font-mono text-[var(--brand-cream-dim)] opacity-0 transition group-hover:opacity-100",
  toolDivider: "my-1 h-px w-8 bg-[var(--surface-border)]",
  propsShell: "flex w-[340px] shrink-0 flex-col border-l border-[var(--surface-border)] bg-[var(--surface)]",
  propsHeader:
    "flex h-14 shrink-0 items-center justify-between gap-2 border-b border-[var(--surface-border)] px-4",
  propsTitle: "font-game text-sm font-bold text-[var(--brand-cream)]",
  propsBody: "flex-1 min-h-0 overflow-y-auto",
  propsSection: "border-b border-[var(--surface-border)] px-4 py-3",
  propsSectionLabel:
    "mb-2 font-game text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--brand-cream-dim)]",
  previewCard:
    "flex w-full min-w-0 flex-col overflow-hidden rounded-md text-left transition",
  previewCardActive:
    "ring-1 ring-[var(--brand-teal)]/60 ring-offset-1 ring-offset-[var(--surface)]",
  previewCardDisabled: "cursor-default opacity-70",
  previewCardError: "ring-1 ring-[var(--destructive)]/40 ring-offset-1 ring-offset-[var(--surface)]",
  previewCardViewport:
    "relative aspect-square w-full shrink-0 overflow-hidden rounded-md bg-[#060a10]",
  previewCardLabel:
    "flex min-h-7 shrink-0 items-center justify-center px-1 pt-1 text-center font-game text-[9px] font-bold leading-tight text-[var(--brand-cream-dim)]",
  previewCardLabelActive: "text-[var(--brand-teal)]",
  previewCardGrid: "grid grid-cols-2 gap-2",
  statusBar:
    "flex h-8 shrink-0 items-center gap-3 border-t border-[var(--surface-border)] bg-[var(--surface-strong)] px-4 text-[11px] text-[var(--brand-cream-dim)]",
  statusDot: "h-1.5 w-1.5 rounded-full bg-[var(--brand-teal)] shadow-[0_0_8px_rgba(95,194,168,0.7)]",
  canvas: "relative min-h-0 flex-1",
  canvasHelp:
    "pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-md border border-[var(--surface-border)] bg-[var(--surface-strong)]/85 px-3 py-1.5 text-[11px] text-[var(--brand-cream-dim)] backdrop-blur",
  inlineLabel: "font-game text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--brand-cream-dim)]",
  fieldRow: "grid grid-cols-[64px_1fr] items-center gap-2",
  fieldNumber:
    "game-input h-8 px-2 text-center text-xs font-mono",
  selectField:
    "game-input h-8 cursor-pointer px-2 text-xs",
  primaryButton:
    "game-btn game-btn--primary h-9 px-3 text-xs",
  secondaryButton:
    "game-btn game-btn--secondary h-8 px-3 text-xs",
  defaultButton:
    "game-btn game-btn--default h-8 px-3 text-xs",
  dangerButton:
    "game-btn h-8 px-3 text-xs",
  segmentedGroup: "game-control-group p-0.5",
  segmentedButton:
    "game-control-segment flex-1 py-1.5 text-[11px] font-semibold",
  segmentedButtonActive: "game-control-segment-active",
  segmentIcon: "mx-auto grid place-items-center",
  swatchGrid: "grid grid-cols-6 gap-1.5",
  swatch:
    "group relative h-8 w-full rounded-md border border-white/10 transition hover:scale-105 hover:border-white/40",
  swatchActive: "ring-2 ring-[var(--brand-teal)] ring-offset-2 ring-offset-[var(--surface)]",
  primitiveRow: "grid grid-cols-4 gap-1.5",
  primitiveButton:
    "flex flex-col items-center gap-0.5 rounded-md border border-[var(--surface-border)] bg-black/20 px-1 py-2 text-[var(--brand-cream-dim)] transition hover:border-[var(--surface-border-strong)] hover:text-[var(--brand-cream)]",
  primitiveButtonActive:
    "border-[var(--brand-teal)]/60 bg-[var(--brand-teal)]/12 text-[var(--brand-teal)]",
  libCard:
    "group flex w-full items-start gap-2 rounded-md border border-transparent bg-black/20 px-2.5 py-2 text-left transition hover:border-[var(--surface-border)] hover:bg-black/30",
  libCardActive: "border-[var(--brand-teal)]/40 bg-[var(--brand-teal)]/10",
  stepToggle: "game-control-group p-0.5",
  stepButton: "game-control-segment px-2 py-0.5 text-[10px] font-mono",
  stepButtonActive: "game-control-segment-active",
  arrowPad: "grid grid-cols-3 gap-0.5",
  arrowBtn:
    "grid h-7 w-7 place-items-center rounded border border-[var(--surface-border)] bg-black/25 text-sm text-[var(--brand-cream-dim)] transition hover:border-[var(--brand-teal)]/50 hover:text-[var(--brand-teal)] disabled:opacity-40",
  arrowPadCenter:
    "grid h-7 place-items-center rounded bg-black/10 font-mono text-[10px] text-[var(--brand-cream-dim)]",
  tabRow: "flex items-center gap-0.5 border-b border-[var(--surface-border)] bg-black/15 px-2",
  tab: "relative flex items-center gap-1.5 px-3 py-2 text-[11px] font-semibold text-[var(--brand-cream-dim)] transition hover:text-[var(--brand-cream)]",
  tabActive:
    "text-[var(--brand-cream)] after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-[var(--brand-teal)]",
  emptyState: "rounded-md border border-dashed border-[var(--surface-border)] bg-black/15 px-3 py-4 text-center text-[11px] text-[var(--brand-cream-dim)]",
  sectionGrid: "grid gap-2",
  row: "flex items-center gap-2",
  rowWrap: "flex flex-wrap items-center gap-1.5",
  monacoReadout:
    "game-field max-h-40 overflow-auto px-2 py-1.5 font-mono text-[10px] text-[var(--brand-cream-dim)]",
  errorBox:
    "rounded border border-[var(--destructive)]/40 bg-[var(--destructive)]/10 px-2 py-1.5 text-[11px] text-[#f0a097]",
  hintBox: "text-[10px] leading-relaxed text-[var(--brand-cream-dim)]/80",
} as const;
