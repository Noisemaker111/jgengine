/**
 * Scene ownership boundary — gives every editor-visible object an explicit
 * provenance and a single verdict (expose / bake / reject) so the editor never
 * presents unauthored content as broken authored content.
 *
 * The product invariant is "author world content in the editor": the scene
 * document is the source of truth. Runtime code, procedural generators, and
 * simulation still put objects in front of the player that the document never
 * described. This module classifies each such object by where it comes from and
 * decides whether the editor may author it, may offer to bake it into the
 * document, or must reject it as read-only runtime content — with a diagnostic
 * that explains the decision. Genuinely runtime-only content is then declared
 * with a reason rather than silently tolerated or exempted by game name.
 *
 * Everything here is plain serializable data and pure functions, so a
 * {@link SceneOwnershipManifest} round-trips through JSON and the verdict for an
 * object is deterministic given its declaration.
 */

export type SceneProvenanceKind = "authored" | "generated" | "runtime" | "transient";

export interface AuthoredProvenance {
  readonly kind: "authored";
  readonly documentId: string;
}

export interface GeneratedProvenance {
  readonly kind: "generated";
  readonly sourceDocumentId: string;
  readonly instanceId: string;
}

/**
 * An object owned entirely by runtime or procedural code with no document entry.
 * Not authorable unless its provider can bake it into schema-valid authored data.
 */
export interface RuntimeProvenance {
  readonly kind: "runtime";
  readonly providerId: string;
  readonly instanceId: string;
}

/** An ephemeral simulation object — a spawned agent, projectile, or particle that never persists. */
export interface TransientProvenance {
  readonly kind: "transient";
  readonly providerId: string;
  readonly instanceId: string;
}

export type SceneProvenance =
  | AuthoredProvenance
  | GeneratedProvenance
  | RuntimeProvenance
  | TransientProvenance;

/** What a provider lets the editor do with one of its objects. Absent flags default to `false`. */
export interface ProviderCapabilities {
  readonly select?: boolean;
  readonly focus?: boolean;
  readonly hide?: boolean;
  readonly bake?: boolean;
}

/** A provider's explicit ownership declaration for one editor-visible object. */
export interface SceneOwnershipDeclaration {
  readonly provenance: SceneProvenance;
  readonly capabilities?: ProviderCapabilities;
  /**
   * Human-readable justification for why this object is not an authored document
   * object. Required for `runtime`/`transient` provenance without a `bake`
   * capability — its absence is a boundary violation (unowned content
   * masquerading as scene content).
   */
  readonly reason?: string;
}

export type OwnershipDecision = "expose" | "bake" | "reject";

export interface OwnershipVerdict {
  /** `expose` (authorable), `bake` (offer import), or `reject` (read-only runtime content). */
  readonly decision: OwnershipDecision;
  readonly provenance: SceneProvenanceKind;
  /** The editor must present the object read-only — authoring edits are not accepted. */
  readonly readOnly: boolean;
  readonly bakeable: boolean;
  readonly reason: string;
  /** Set when the declaration breaks the ownership contract; the editor and content gate should flag it. */
  readonly violation?: string | undefined;
}

export interface OwnershipDiagnostic {
  readonly key: string;
  readonly provenance: SceneProvenanceKind;
  readonly decision: OwnershipDecision;
  readonly message: string;
}

/** Serializable record of a world's ownership declarations — persisted next to the scene document or shipped by a game. */
export interface SceneOwnershipManifest {
  readonly version: 1;
  readonly provider?: string;
  /** The per-object ownership declarations. */
  readonly declarations: readonly SceneOwnershipDeclaration[];
}

export const SCENE_OWNERSHIP_MANIFEST_VERSION = 1;

/**
 * Resolve one declaration into a single boundary verdict.
 *
 * - `authored` and `generated` provenance -> **expose** (generated objects are
 *   read-only; edit their source document object).
 * - `runtime`/`transient` with a `bake` capability -> **bake** (offer import).
 * - `runtime`/`transient` without `bake` -> **reject** (read-only); a missing
 *   `reason` marks it a boundary violation — content bypassing the document with
 *   no authored home, no way to bake, and no declared justification.
 *
 * @capability scene-ownership classify an editor-visible object as expose/bake/reject with a diagnostic
 */
export function classifyOwnership(declaration: SceneOwnershipDeclaration): OwnershipVerdict {
  const { provenance, capabilities, reason } = declaration;
  const kind = provenance.kind;

  if (kind === "authored") {
    return {
      decision: "expose",
      provenance: kind,
      readOnly: false,
      bakeable: false,
      reason: `authored document object "${provenance.documentId}"`,
    };
  }

  if (kind === "generated") {
    return {
      decision: "expose",
      provenance: kind,
      readOnly: true,
      bakeable: false,
      reason: `generated from authored object "${provenance.sourceDocumentId}"; edit the source`,
    };
  }

  const canBake = capabilities?.bake === true;
  if (canBake) {
    return {
      decision: "bake",
      provenance: kind,
      readOnly: true,
      bakeable: true,
      reason: reason ?? `runtime provider "${provenance.providerId}" can bake this into the document`,
    };
  }

  const hasReason = reason !== undefined && reason.trim() !== "";
  const violation = hasReason
    ? undefined
    : `${kind} object "${provenance.instanceId}" from provider "${provenance.providerId}" has no authored ` +
      `document entry, no bake capability, and no declared reason — it bypasses the scene-ownership boundary`;
  return {
    decision: "reject",
    provenance: kind,
    readOnly: true,
    bakeable: false,
    reason: hasReason ? (reason as string) : `runtime-only content owned by provider "${provenance.providerId}"`,
    violation,
  };
}

function provenanceKey(provenance: SceneProvenance): string {
  switch (provenance.kind) {
    case "authored":
      return `authored:${provenance.documentId}`;
    case "generated":
      return `generated:${provenance.sourceDocumentId}/${provenance.instanceId}`;
    default:
      return `${provenance.kind}:${provenance.providerId}/${provenance.instanceId}`;
  }
}

/** @capability scene-ownership derive a stable object key from its provenance */
export function ownershipKey(provenance: SceneProvenance): string {
  return provenanceKey(provenance);
}

/**
 * Audit a keyed set of declarations and return one diagnostic per object that
 * breaks the boundary contract (a `reject` verdict carrying a `violation`).
 * Deterministic: diagnostics come back in the iteration order of `entries`.
 *
 * @capability scene-ownership audit editor-visible objects and report boundary violations
 */
export function collectOwnershipDiagnostics(
  entries: Iterable<readonly [string, SceneOwnershipDeclaration]>,
): OwnershipDiagnostic[] {
  const out: OwnershipDiagnostic[] = [];
  for (const [key, declaration] of entries) {
    const verdict = classifyOwnership(declaration);
    if (verdict.violation !== undefined) {
      out.push({
        key,
        provenance: verdict.provenance,
        decision: verdict.decision,
        message: `${key}: ${verdict.violation}`,
      });
    }
  }
  return out;
}

/** @capability scene-ownership audit a whole ownership manifest for boundary violations */
export function auditManifest(manifest: SceneOwnershipManifest): OwnershipDiagnostic[] {
  return collectOwnershipDiagnostics(
    manifest.declarations.map((declaration) => [provenanceKey(declaration.provenance), declaration] as const),
  );
}

function isProvenance(value: unknown): value is SceneProvenance {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  switch (record["kind"]) {
    case "authored":
      return typeof record["documentId"] === "string";
    case "generated":
      return typeof record["sourceDocumentId"] === "string" && typeof record["instanceId"] === "string";
    case "runtime":
    case "transient":
      return typeof record["providerId"] === "string" && typeof record["instanceId"] === "string";
    default:
      return false;
  }
}

function isDeclaration(value: unknown): value is SceneOwnershipDeclaration {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (!isProvenance(record["provenance"])) return false;
  if (record["reason"] !== undefined && typeof record["reason"] !== "string") return false;
  if (record["capabilities"] !== undefined && (typeof record["capabilities"] !== "object" || record["capabilities"] === null)) {
    return false;
  }
  return true;
}

/** @capability scene-ownership validate a serialized ownership manifest loaded from disk */
export function isSceneOwnershipManifest(value: unknown): value is SceneOwnershipManifest {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (record["version"] !== SCENE_OWNERSHIP_MANIFEST_VERSION) return false;
  if (record["provider"] !== undefined && typeof record["provider"] !== "string") return false;
  if (!Array.isArray(record["declarations"])) return false;
  return record["declarations"].every(isDeclaration);
}
