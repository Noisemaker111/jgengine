export interface ModelCatalogEntryRow {
  isUnlocked?: boolean;
  distillProgressTflops?: number;
}

export type ModelCatalogMapRow = Readonly<Record<string, ModelCatalogEntryRow>>;
