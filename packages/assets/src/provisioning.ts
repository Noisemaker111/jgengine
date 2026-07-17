import { aliases } from "./aliases";
import { generatedIndex } from "./generated";
import type { AssetAlias, IndexEntry, SingleAsset } from "./manifest";
import { singles } from "./singles";

/**
 * How an asset id's bytes reach a clean checkout:
 * - `committed` — resolves to a self-hosted / remote URL carried in the shipped
 *   index (a {@link SingleAsset}); no pull step, available immediately.
 * - `provisioned` — a pack {@link IndexEntry}; the id is declared but its GLB is
 *   fetched on demand by `assets pull <source>` into the consumer's served dir.
 * - `dangling` — nothing in the index, singles, or aliases owns the id, so no
 *   provisioning step exists and it can never resolve on a clean clone.
 */
export type AssetProvenanceKind = "committed" | "provisioned" | "dangling";

/** The resolved ownership of one logical asset id — the provisioning contract for that id. */
export interface AssetProvenance {
  id: string;
  kind: AssetProvenanceKind;
  /**
   * Where the bytes live once available: the committed URL for `committed`, the
   * `<source>/<file>` served path for `provisioned`, or `null` for `dangling`.
   */
  resolvedPath: string | null;
  /** The pack source that must be pulled, for `provisioned` ids. */
  sourceId?: string;
  /** The exact command that makes a `provisioned` id resolve, e.g. `assets pull quaternius-stylized-nature`. */
  provisioningStep?: string;
  /** When the id was reached through an alias, the alias key that pointed at it. */
  viaAlias?: string;
}

/** Override the data {@link resolveProvenance} resolves against; every field defaults to the shipped catalog. */
export interface ResolveProvenanceOptions {
  /** Index entries to resolve against; defaults to the shipped generated index. */
  index?: readonly IndexEntry[];
  singles?: readonly SingleAsset[];
  aliases?: readonly AssetAlias[];
}

function provisionedPath(entry: IndexEntry): string {
  return `${entry.source}/${entry.file}`;
}

/**
 * Resolve one logical asset id (a pack id, a single id, or an alias key) to its
 * {@link AssetProvenance}. Aliases are followed one hop to their target. An id
 * that matches no declared owner is `dangling` — the signal a clean-clone gate
 * turns into a hard failure, because no provisioning step can ever satisfy it.
 */
export function resolveProvenance(id: string, options: ResolveProvenanceOptions = {}): AssetProvenance {
  const index = options.index ?? generatedIndex;
  const singleList = options.singles ?? singles;
  const aliasList = options.aliases ?? aliases;

  const alias = aliasList.find((entry) => entry.key === id);
  if (alias !== undefined) {
    const resolved = resolveProvenance(alias.target, { index, singles: singleList, aliases: aliasList });
    return { ...resolved, id, viaAlias: alias.key };
  }

  const entry = index.find((candidate) => candidate.id === id);
  if (entry !== undefined) {
    return {
      id,
      kind: "provisioned",
      resolvedPath: provisionedPath(entry),
      sourceId: entry.source,
      provisioningStep: `assets pull ${entry.source}`,
    };
  }

  const single = singleList.find((candidate) => candidate.id === id);
  if (single !== undefined) {
    return { id, kind: "committed", resolvedPath: single.url };
  }

  return { id, kind: "dangling", resolvedPath: null };
}

/** A logical asset id referenced by some consumer (a game, scene, or config), for validation. */
export interface AssetReference {
  /** Who references the id — a game id, scene path, or config name — surfaced in the failure. */
  consumer: string;
  /** The logical asset id / alias key the consumer expects to resolve. */
  id: string;
}

/** The verdict for one {@link AssetReference}. */
export interface ReferenceValidation {
  reference: AssetReference;
  provenance: AssetProvenance;
  ok: boolean;
  /** Set only when `ok` is false — a one-line diagnostic naming consumer, id, and resolved path. */
  error?: string;
}

/** Options for {@link validateAssetReferences}: the resolution data plus an optional on-disk `present` check. */
export interface ValidateAssetReferencesOptions extends ResolveProvenanceOptions {
  /**
   * Optional predicate reporting whether a `provisioned` id's bytes are already
   * on disk (its `resolvedPath`). When supplied, a provisioned-but-absent id is a
   * failure — the stricter "clean checkout with a provisioning pass already run"
   * mode. Omit it for the pre-merge gate, where a declared provisioning owner is
   * enough and the pull runs later in `ensure-ready`.
   */
  present?: (resolvedPath: string) => boolean;
}

/** The aggregate result of validating a set of references against the provisioning contract. */
export interface ValidateAssetReferencesResult {
  ok: boolean;
  results: readonly ReferenceValidation[];
  /** One diagnostic line per failing reference. */
  errors: readonly string[];
  /** The unique provisioning steps every `provisioned` reference needs, e.g. for `ensure-ready`. */
  provisioning: readonly string[];
}

/**
 * Validate that every {@link AssetReference} resolves against the declared
 * provisioning contract — not by grepping source text, but by resolving each
 * logical id to its committed / provisioned / dangling owner. A `dangling`
 * reference fails with the referencing consumer, the logical id, the (null)
 * resolved path, and the missing provisioning step; a `provisioned` reference
 * passes and contributes its `assets pull <source>` step to `provisioning`
 * (unless `present` is supplied and reports the bytes absent).
 *
 * @capability asset-reference-integrity validate asset references against the provisioning contract (dangling / committed / provisioned)
 */
export function validateAssetReferences(
  references: readonly AssetReference[],
  options: ValidateAssetReferencesOptions = {},
): ValidateAssetReferencesResult {
  const results: ReferenceValidation[] = [];
  const errors: string[] = [];
  const provisioning = new Set<string>();

  for (const reference of references) {
    const provenance = resolveProvenance(reference.id, options);
    if (provenance.kind === "dangling") {
      const error = `${reference.consumer}: asset "${reference.id}" is dangling — no committed/provisioned owner declares it (resolved path: none). Add a source in packages/assets/src/sources/*.ts or a single, or remove the reference.`;
      results.push({ reference, provenance, ok: false, error });
      errors.push(error);
      continue;
    }

    if (provenance.kind === "provisioned") {
      if (provenance.provisioningStep !== undefined) provisioning.add(provenance.provisioningStep);
      if (options.present !== undefined && provenance.resolvedPath !== null && !options.present(provenance.resolvedPath)) {
        const error = `${reference.consumer}: asset "${reference.id}" is not provisioned — expected bytes at "${provenance.resolvedPath}". Run \`${provenance.provisioningStep}\`.`;
        results.push({ reference, provenance, ok: false, error });
        errors.push(error);
        continue;
      }
    }

    results.push({ reference, provenance, ok: true });
  }

  return { ok: errors.length === 0, results, errors, provisioning: [...provisioning].sort() };
}
