import { useState, type ReactNode } from "react";

import {
  MATERIAL_TEXTURE_SEMANTICS,
  validateMaterialAsset,
  type MaterialAsset,
  type MaterialProvenance,
  type MaterialSurfaceParameters,
  type MaterialTextureMetadata,
  type MaterialTextureRole,
} from "@jgengine/core/material/materialAsset";

import { advancedMaterialControls, materialAuthoringNotes, materialControlGroups, prepareMaterialAuthoringEdit, type MaterialControl } from "./materialControls";
import { CONTROL, FOCUS_RING, INPUT_CLS, MICRO_LABEL } from "./shell/theme";

/** A callback-driven physical material editor; the host owns persistence, undo and preview rendering. */
export interface MaterialAssetEditorProps {
  asset: MaterialAsset;
  onChange(asset: MaterialAsset, coalesce?: string): void;
  preview?: (asset: MaterialAsset, mode: "neutral" | "game") => ReactNode;
}

/**
 * Edits sparse reusable material assets without replacing untouched imported material values.
 * @internal Mounted by the material workspace.
 */
export function MaterialAssetEditor({ asset, onChange, preview }: MaterialAssetEditorProps) {
  const [previewMode, setPreviewMode] = useState<"neutral" | "game">("neutral");
  const [mapRole, setMapRole] = useState<MaterialTextureRole>("color");
  const [mapUrl, setMapUrl] = useState("");
  const diagnostics = validateMaterialAsset(asset);
  const commit = (next: MaterialAsset, coalesce?: string) => onChange(prepareMaterialAuthoringEdit(next), coalesce);
  const patchSurface = (patch: Partial<MaterialSurfaceParameters>, field: string) => {
    const surface = { ...asset.surface, ...patch };
    for (const key of Object.keys(surface) as (keyof MaterialSurfaceParameters)[]) {
      if (surface[key] === undefined) delete surface[key];
    }
    commit({ ...asset, surface }, `material:${asset.id}:${field}`);
  };
  const patchTexture = (role: MaterialTextureRole, texture: MaterialTextureMetadata | undefined) => {
    const textures = { ...asset.textures };
    if (texture === undefined) delete textures[role];
    else textures[role] = texture;
    commit({ ...asset, textures }, `material:${asset.id}:texture:${role}`);
  };
  const renderControl = (control: MaterialControl) => (
    <SurfaceField key={control.key} control={control} value={asset.surface[control.key]} onChange={(value) => patchSurface({ [control.key]: value }, control.key)} />
  );

  return (
    <div className="space-y-3 p-2 text-[11px] text-neutral-300">
      <label className="block space-y-1">
        <span className={MICRO_LABEL}>Asset name</span>
        <input key={`${asset.id}:${asset.name}`} aria-label="Material asset name" className={`w-full px-2 py-1 ${INPUT_CLS}`} defaultValue={asset.name} onBlur={(event) => { const name = event.target.value.trim(); if (name && name !== asset.name) commit({ ...asset, name }); }} />
      </label>
      <div className="break-all text-[10px] text-neutral-500">Stable ID: {asset.id} · saved with the scene document</div>
      <label className="flex items-center justify-between gap-2">
        <span className={MICRO_LABEL}>Surface family</span>
        <select aria-label="Material family" className={`px-2 py-1 ${INPUT_CLS}`} value={asset.family} onChange={(event) => commit({ ...asset, family: event.target.value as MaterialAsset["family"] })}>
          {["standard", "fabric", "hair", "glass", "metal", "skin", "stone", "plastic"].map((family) => <option key={family} value={family}>{family}</option>)}
        </select>
      </label>
      <p className="text-[10px] leading-relaxed text-neutral-500">Empty fields inherit the imported surface. A displayed placeholder is the renderer default, which may differ from your asset. Reset removes only this override.</p>
      {preview ? <section className="space-y-2" aria-label="Material preview">
        <div className="flex gap-1" role="group" aria-label="Preview lighting">
          {(["neutral", "game"] as const).map((mode) => <button key={mode} type="button" aria-pressed={previewMode === mode} className={`${CONTROL} ${FOCUS_RING} flex-1 px-2 py-1`} onClick={() => setPreviewMode(mode)}>{mode === "neutral" ? "Neutral light" : "Document light"}</button>)}
        </div>
        {preview(asset, previewMode)}
      </section> : null}
      {materialControlGroups(asset.family).map((group) => <section key={group.label} className="space-y-2 border-t border-white/[0.07] pt-2">
        <div className={MICRO_LABEL}>{group.label}</div>
        <p className="text-[10px] leading-relaxed text-neutral-500">{group.hint}</p>
        {group.controls.map(renderControl)}
        {group.label === "Coverage" ? <CoverageFields surface={asset.surface} onPatch={patchSurface} /> : null}
        {asset.family === "fabric" && group.label === "Detail" ? <FabricFields asset={asset} onChange={commit} /> : null}
        {asset.family === "hair" && group.label === "Strand highlights" ? <HairFields asset={asset} onChange={commit} /> : null}
        {asset.family === "hair" && group.label === "Backlighting" ? <HairBacklightFields asset={asset} onChange={commit} /> : null}
      </section>)}
      <details className="border-t border-white/[0.07] pt-2">
        <summary className={`cursor-pointer py-1 ${FOCUS_RING}`}>Texture maps ({Object.keys(asset.textures ?? {}).length})</summary>
        <div className="space-y-2 pt-2">
          <p className="text-[10px] text-neutral-500">Use an existing runtime URL. Color and emissive use sRGB; numeric maps use linear data and the shader's packed channel.</p>
          <label className="block"><span className={MICRO_LABEL}>Map role</span><select aria-label="New texture role" className={`mt-1 w-full px-2 py-1 ${INPUT_CLS}`} value={mapRole} onChange={(event) => setMapRole(event.target.value as MaterialTextureRole)}>{Object.keys(MATERIAL_TEXTURE_SEMANTICS).map((role) => <option key={role} value={role}>{role}</option>)}</select></label>
          <input aria-label="New texture URL" className={`w-full px-2 py-1 ${INPUT_CLS}`} value={mapUrl} onChange={(event) => setMapUrl(event.target.value)} placeholder="/textures/my-surface.png" />
          <button type="button" className={`${CONTROL} ${FOCUS_RING} px-2 py-1`} disabled={!mapUrl.trim()} onClick={() => { if (!mapUrl.trim()) return; patchTexture(mapRole, { url: mapUrl.trim(), ...MATERIAL_TEXTURE_SEMANTICS[mapRole] }); setMapUrl(""); }}>Assign map</button>
          {(Object.entries(asset.textures ?? {}) as [MaterialTextureRole, MaterialTextureMetadata][]).map(([role, texture]) => <TextureFields key={role} role={role} texture={texture} onChange={(next) => patchTexture(role, next)} />)}
        </div>
      </details>
      <details className="border-t border-white/[0.07] pt-2">
        <summary className={`cursor-pointer py-1 ${FOCUS_RING}`}>Advanced physical settings</summary>
        <div className="space-y-2 pt-2">
          {advancedMaterialControls.map(renderControl)}
          <PairField label="Normal strength XY" value={asset.surface.normalScale} fallback={[1, 1]} onChange={(normalScale) => patchSurface({ normalScale }, "normalScale")} />
          <PairField label="Film thickness range (nm)" value={asset.surface.iridescenceThicknessRange} fallback={[100, 400]} onChange={(iridescenceThicknessRange) => patchSurface({ iridescenceThicknessRange }, "iridescenceThicknessRange")} />
          <CoverageFields surface={asset.surface} onPatch={patchSurface} />
          <div className="text-[10px] text-neutral-500">Declared capabilities: {asset.capabilities.join(", ") || "none"}. Expensive lobes render only when enabled.</div>
        </div>
      </details>
      <details className="border-t border-white/[0.07] pt-2">
        <summary className={`cursor-pointer py-1 ${FOCUS_RING}`}>Authorship and provenance</summary>
        <div className="space-y-2 pt-2">
          <ProvenanceFields key={JSON.stringify(asset.provenance)} label="Material" provenance={asset.provenance} onChange={(provenance) => commit({ ...asset, provenance })} />
        </div>
      </details>
      {materialAuthoringNotes(asset).map((note) => <p key={note} className="text-[10px] leading-relaxed text-amber-200/80">{note}</p>)}
      {diagnostics.length ? <ul className="space-y-1 text-[10px]" aria-label="Material diagnostics">{diagnostics.map((entry) => <li key={`${entry.code}:${entry.path}`} className={entry.severity === "error" ? "text-rose-300" : "text-amber-200/80"}>{entry.path}: {entry.message}</li>)}</ul> : null}
    </div>
  );
}

function SurfaceField({ control, value, onChange }: { control: Omit<MaterialControl, "key">; value: unknown; onChange(value: string | number | undefined): void }) {
  return <label className="block space-y-1" title={control.hint}>
    <span className="flex items-center justify-between gap-2"><span className={MICRO_LABEL}>{control.label}</span>{value === undefined ? <span className="text-[9px] text-neutral-600">Inherited</span> : <button type="button" className={`${FOCUS_RING} text-[9px] text-neutral-400 hover:text-neutral-100`} onClick={() => onChange(undefined)}>Reset</button>}</span>
    {control.kind === "color" ? <div className="flex items-center gap-2"><input aria-label={control.label} type="color" value={typeof value === "string" ? value : String(control.fallback)} onChange={(event) => onChange(event.target.value)} /><span className="text-[10px] text-neutral-500">{typeof value === "string" ? value : "Imported color"}</span></div> : <input aria-label={control.label} type="number" min={control.min} max={control.max} step={control.step ?? 0.01} value={typeof value === "number" ? value : ""} placeholder={String(control.fallback)} className={`w-full px-2 py-1 ${INPUT_CLS}`} onChange={(event) => { if (!event.target.value) onChange(undefined); else { const next = Number(event.target.value); if (Number.isFinite(next)) onChange(next); } }} />}
  </label>;
}

function CoverageFields({ surface, onPatch }: { surface: MaterialSurfaceParameters; onPatch(patch: Partial<MaterialSurfaceParameters>, field: string): void }) {
  return <div className="space-y-2">
    <label className="block space-y-1"><span className={MICRO_LABEL}>Alpha behavior</span><select aria-label="Alpha behavior" className={`w-full px-2 py-1 ${INPUT_CLS}`} value={surface.alphaMode ?? ""} onChange={(event) => onPatch({ alphaMode: (event.target.value || undefined) as MaterialSurfaceParameters["alphaMode"] }, "alphaMode")}><option value="">Imported behavior</option><option value="opaque">Opaque</option><option value="mask">Mask / cutout</option><option value="blend">Alpha blend</option></select></label>
    <label className="block space-y-1"><span className={MICRO_LABEL}>Surface sides</span><select aria-label="Surface sides" className={`w-full px-2 py-1 ${INPUT_CLS}`} value={surface.doubleSided === undefined ? "" : String(surface.doubleSided)} onChange={(event) => onPatch({ doubleSided: event.target.value === "" ? undefined : event.target.value === "true" }, "doubleSided")}><option value="">Imported sides</option><option value="false">Front face</option><option value="true">Both sides</option></select></label>
  </div>;
}

function PairField({ label, value, fallback, onChange }: { label: string; value?: [number, number]; fallback: [number, number]; onChange(value: [number, number] | undefined): void }) {
  return <div className="space-y-1"><div className="flex items-center justify-between"><span className={MICRO_LABEL}>{label}</span>{value ? <button type="button" className={`${FOCUS_RING} text-[9px]`} onClick={() => onChange(undefined)}>Reset</button> : <span className="text-[9px] text-neutral-600">Inherited</span>}</div><div className="grid grid-cols-2 gap-1">{([0, 1] as const).map((index) => <input key={index} aria-label={`${label} ${index + 1}`} type="number" step="0.01" className={`min-w-0 px-2 py-1 ${INPUT_CLS}`} value={value?.[index] ?? ""} placeholder={String(fallback[index])} onChange={(event) => { const next = Number(event.target.value); if (!event.target.value || !Number.isFinite(next)) return; const pair: [number, number] = [...(value ?? fallback)]; pair[index] = next; onChange(pair); }} />)}</div></div>;
}

function TextureFields({ role, texture, onChange }: { role: MaterialTextureRole; texture: MaterialTextureMetadata; onChange(texture: MaterialTextureMetadata | undefined): void }) {
  const patch = (partial: Partial<MaterialTextureMetadata>) => {
    const next = { ...texture, ...partial };
    if (next.transform) {
      next.transform = { ...next.transform };
      for (const key of Object.keys(next.transform) as (keyof NonNullable<MaterialTextureMetadata["transform"]>)[]) {
        if (next.transform[key] === undefined) delete next.transform[key];
      }
    }
    onChange(next);
  };
  return <details className="rounded border border-white/[0.08] p-2" open>
    <summary className={`cursor-pointer ${FOCUS_RING}`}>{role} · {texture.colorSpace} · {texture.channel ?? MATERIAL_TEXTURE_SEMANTICS[role].channel}</summary>
    <div className="space-y-2 pt-2">
      <input key={texture.url} aria-label={`${role} texture URL`} className={`w-full px-2 py-1 ${INPUT_CLS}`} defaultValue={texture.url} onBlur={(event) => { if (event.target.value.trim() && event.target.value.trim() !== texture.url) patch({ url: event.target.value.trim() }); }} />
      <label className="block space-y-1"><span className={MICRO_LABEL}>UV set</span><select aria-label={`${role} UV set`} className={`w-full px-2 py-1 ${INPUT_CLS}`} value={texture.uvSet ?? 0} onChange={(event) => patch({ uvSet: Number(event.target.value) as 0 | 1 | 2 | 3 })}>{[0, 1, 2, 3].map((uv) => <option key={uv} value={uv}>{uv}</option>)}</select></label>
      <PairField label={`${role} UV scale`} value={texture.transform?.scale} fallback={[1, 1]} onChange={(scale) => patch({ transform: { ...texture.transform, scale } })} />
      <PairField label={`${role} UV offset`} value={texture.transform?.offset} fallback={[0, 0]} onChange={(offset) => patch({ transform: { ...texture.transform, offset } })} />
      <label className="block space-y-1"><span className={MICRO_LABEL}>UV rotation (radians)</span><input aria-label={`${role} UV rotation`} type="number" step="0.01" value={texture.transform?.rotation ?? 0} className={`w-full px-2 py-1 ${INPUT_CLS}`} onChange={(event) => { const rotation = Number(event.target.value); if (Number.isFinite(rotation)) patch({ transform: { ...texture.transform, rotation } }); }} /></label>
      <PairField label={`${role} physical size (metres)`} value={texture.physicalSize} fallback={[1, 1]} onChange={(physicalSize) => patch({ physicalSize })} />
      {role === "normal" || role === "clearcoatNormal" ? <label className="block space-y-1"><span className={MICRO_LABEL}>Normal convention</span><select aria-label={`${role} normal convention`} className={`w-full px-2 py-1 ${INPUT_CLS}`} value={texture.normalConvention ?? "opengl"} onChange={(event) => patch({ normalConvention: event.target.value as "opengl" | "directx" })}><option value="opengl">OpenGL (+Y)</option><option value="directx">DirectX (-Y)</option></select></label> : null}
      {(["wrapS", "wrapT"] as const).map((axis) => <label key={axis} className="block space-y-1"><span className={MICRO_LABEL}>{axis}</span><select aria-label={`${role} ${axis}`} className={`w-full px-2 py-1 ${INPUT_CLS}`} value={texture.sampler?.[axis] ?? "repeat"} onChange={(event) => patch({ sampler: { ...texture.sampler, [axis]: event.target.value } })}><option value="repeat">Repeat</option><option value="clamp">Clamp</option><option value="mirror">Mirror</option></select></label>)}
      <label className="block space-y-1"><span className={MICRO_LABEL}>Compression</span><select aria-label={`${role} compression`} className={`w-full px-2 py-1 ${INPUT_CLS}`} value={texture.compression ?? "none"} onChange={(event) => patch({ compression: event.target.value as MaterialTextureMetadata["compression"] })}>{["none", "ktx2", "basisu", "webp"].map((compression) => <option key={compression} value={compression}>{compression}</option>)}</select></label>
      <label className="block space-y-1"><span className={MICRO_LABEL}>Minification filter</span><select aria-label={`${role} minification filter`} className={`w-full px-2 py-1 ${INPUT_CLS}`} value={texture.sampler?.minFilter ?? "linear-mipmap-linear"} onChange={(event) => patch({ sampler: { ...texture.sampler, minFilter: event.target.value as NonNullable<MaterialTextureMetadata["sampler"]>["minFilter"] } })}>{["nearest", "linear", "nearest-mipmap-nearest", "nearest-mipmap-linear", "linear-mipmap-nearest", "linear-mipmap-linear"].map((filter) => <option key={filter} value={filter}>{filter}</option>)}</select></label>
      <label className="block space-y-1"><span className={MICRO_LABEL}>Magnification filter</span><select aria-label={`${role} magnification filter`} className={`w-full px-2 py-1 ${INPUT_CLS}`} value={texture.sampler?.magFilter ?? "linear"} onChange={(event) => patch({ sampler: { ...texture.sampler, magFilter: event.target.value as "nearest" | "linear" } })}><option value="nearest">Nearest</option><option value="linear">Linear</option></select></label>
      <label className="block space-y-1"><span className={MICRO_LABEL}>Texture anisotropic filtering</span><input aria-label={`${role} texture anisotropy`} type="number" min="1" step="1" value={texture.sampler?.anisotropy ?? 1} className={`w-full px-2 py-1 ${INPUT_CLS}`} onChange={(event) => { const anisotropy = Number(event.target.value); if (Number.isFinite(anisotropy) && anisotropy >= 1) patch({ sampler: { ...texture.sampler, anisotropy } }); }} /></label>
      <p className="text-[10px] text-neutral-500">Compression describes the supplied file; this editor does not transcode it. Physical size records authored metres; UV scale controls sampling.</p>
      <details><summary className={`cursor-pointer text-[10px] ${FOCUS_RING}`}>Texture attribution</summary><div className="pt-2"><ProvenanceFields key={JSON.stringify(texture.provenance)} label={`${role} texture`} provenance={texture.provenance} onChange={(provenance) => patch({ provenance })} /></div></details>
      <button type="button" className={`${CONTROL} ${FOCUS_RING} px-2 py-1 text-rose-200`} onClick={() => onChange(undefined)}>Remove map override</button>
    </div>
  </details>;
}

function FabricFields({ asset, onChange }: { asset: MaterialAsset; onChange(asset: MaterialAsset, coalesce?: string): void }) {
  const fabric = asset.fabric;
  return <div className="space-y-2">
    <label className="block space-y-1"><span className={MICRO_LABEL}>Fabric construction</span><select aria-label="Fabric construction" className={`w-full px-2 py-1 ${INPUT_CLS}`} value={fabric?.construction ?? ""} onChange={(event) => { const construction = event.target.value; if (!construction) { const next = { ...asset }; delete next.fabric; onChange(next); } else onChange({ ...asset, fabric: construction === "fuzzy" ? { construction: "fuzzy" } : { ...fabric, construction: "woven" } }); }}><option value="">No appearance adapter</option><option value="fuzzy">Fuzzy / grazing sheen</option><option value="woven">Woven / directional threads</option></select></label>
    {fabric?.construction === "woven" ? <>
      {([
        { key: "weaveDirection", label: "Weave direction (radians)", fallback: 0, min: -Math.PI, max: Math.PI },
        { key: "threadScale", label: "Thread cycles per UV", fallback: 80, min: 0.01 },
        { key: "normalStrength", label: "Thread normal response", fallback: 0.12, min: 0, max: 1 },
        { key: "variation", label: "Roughness variation", fallback: 0.05, min: 0, max: 1 },
      ] as const).map((field) => <SurfaceField key={field.key} control={{ ...field, kind: "number", step: 0.01 }} value={fabric[field.key]} onChange={(value) => { const next = { ...fabric, [field.key]: value }; if (value === undefined) delete next[field.key]; onChange({ ...asset, fabric: next }, `material:${asset.id}:fabric:${field.key}`); }} />)}
      <p className="text-[10px] text-neutral-500">Procedural threads modify normals and roughness on UV-mapped geometry. Explicit physical highlight fields override adapter defaults.</p>
    </> : null}
  </div>;
}

function HairFields({ asset, onChange }: { asset: MaterialAsset; onChange(asset: MaterialAsset, coalesce?: string): void }) {
  const hair = asset.hair;
  return <div className="space-y-2">
    <label className="block space-y-1"><span className={MICRO_LABEL}>Existing geometry</span><select aria-label="Hair geometry kind" className={`w-full px-2 py-1 ${INPUT_CLS}`} value={hair?.geometry ?? ""} onChange={(event) => { const geometry = event.target.value; if (!geometry) { const next = { ...asset }; delete next.hair; onChange(next); } else onChange({ ...asset, hair: geometry === "strands" ? { geometry: "strands", ...(hair?.strandDirection === undefined ? {} : { strandDirection: hair.strandDirection }) } : { ...hair, geometry: "cards" } }); }}><option value="">No appearance adapter</option><option value="cards">Hair cards</option><option value="strands">Strand mesh</option></select></label>
    {hair ? <SurfaceField control={{ label: "Strand direction (radians)", kind: "number", fallback: 0, min: -Math.PI, max: Math.PI, step: 0.01 }} value={hair.strandDirection} onChange={(value) => { const next = { ...hair, strandDirection: typeof value === "number" ? value : undefined }; if (value === undefined) delete next.strandDirection; onChange({ ...asset, hair: next }, `material:${asset.id}:hair:direction`); }} /> : null}
  </div>;
}

function HairBacklightFields({ asset, onChange }: { asset: MaterialAsset; onChange(asset: MaterialAsset, coalesce?: string): void }) {
  const hair = asset.hair;
  if (hair?.geometry !== "cards") return <p className="text-[10px] text-neutral-500">Backlighting is supported by the hair-card adapter. Select existing card geometry under Strand highlights.</p>;
  return <div className="space-y-2">
    <SurfaceField control={{ label: "Card backlight strength", kind: "number", fallback: 0.25, min: 0, max: 1, step: 0.01 }} value={hair.backlightStrength} onChange={(value) => { const next = { ...hair, backlightStrength: typeof value === "number" ? value : undefined }; if (value === undefined) delete next.backlightStrength; onChange({ ...asset, hair: next }, `material:${asset.id}:hair:backlight`); }} />
    <SurfaceField control={{ label: "Card backlight color", kind: "color", fallback: asset.surface.color ?? "#ffffff" }} value={hair.backlightColor} onChange={(value) => { const next = { ...hair, backlightColor: typeof value === "string" ? value : undefined }; if (value === undefined) delete next.backlightColor; onChange({ ...asset, hair: next }, `material:${asset.id}:hair:backlightColor`); }} />
  </div>;
}

function ProvenanceFields({ label, provenance, onChange }: { label: string; provenance?: MaterialProvenance; onChange(provenance: MaterialProvenance): void }) {
  const [draft, setDraft] = useState({ author: provenance?.author ?? "", license: provenance?.license ?? "", sourceUrl: provenance?.sourceUrl ?? "", description: provenance?.description ?? "" });
  const validSource = !draft.sourceUrl.trim() || /^https?:\/\//i.test(draft.sourceUrl.trim());
  return <div className="space-y-2">
    {(["author", "license", "sourceUrl", "description"] as const).map((field) => <label key={field} className="block space-y-1"><span className={MICRO_LABEL}>{field === "sourceUrl" ? "Source URL" : field === "description" ? "Notes" : field}</span><input aria-label={`${label} ${field}`} className={`w-full px-2 py-1 ${INPUT_CLS}`} value={draft[field]} onChange={(event) => setDraft({ ...draft, [field]: event.target.value })} /></label>)}
    {!validSource ? <p className="text-[10px] text-rose-300">Use an HTTP or HTTPS source URL.</p> : null}
    <button type="button" className={`${CONTROL} ${FOCUS_RING} px-2 py-1`} disabled={!draft.author.trim() || !draft.license.trim() || !validSource} onClick={() => onChange({ author: draft.author.trim(), license: draft.license.trim(), ...(draft.sourceUrl.trim() ? { sourceUrl: draft.sourceUrl.trim() } : {}), ...(draft.description.trim() ? { description: draft.description.trim() } : {}) })}>Apply attribution</button>
    {provenance?.sourceUrl && /^https?:\/\//i.test(provenance.sourceUrl) ? <a href={provenance.sourceUrl} target="_blank" rel="noreferrer" className={`ml-2 break-all text-[10px] text-cyan-300 underline ${FOCUS_RING}`}>View source</a> : null}
  </div>;
}
