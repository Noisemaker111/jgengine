import type { CreatorPolicy } from "@jgengine/core/editor/creatorStorage";
import { useState } from "react";
import type { EditorSession } from "@jgengine/core/editor/commands";
import type { EditorSimulation } from "@jgengine/core/editor/simulation";
import type { AuthoredWeatherConfig, AuthoredWeatherMode } from "@jgengine/core/world/authoredWeather";
import { useStoreSelector } from "./useStoreSelector";

const modes: AuthoredWeatherMode[] = ["clear", "rain", "snow", "mixed", "dust"];

function NumberInput({ label, value, onChange, min = 0, step = 0.1 }: { label: string; value: number; onChange: (value: number) => void; min?: number; step?: number }) {
  return <label className="flex items-center justify-between gap-2"><span>{label}</span><input aria-label={label} className="w-24 rounded border border-neutral-700 bg-neutral-900 p-1" type="number" min={min} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

/** Production authoring controls share the same validated command and undo history as RPC.
 * @capability simulation-inspector author weather schedules, effects, fire, wind zones, forces and habitats with validated undoable controls
 */
export function SimulationInspector({ session, creatorPolicy }: { session: EditorSession; creatorPolicy?: CreatorPolicy }) {
  const simulation = useStoreSelector(session, (state) => state.document.simulation);
  const [error, setError] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState<string | null>(null);
  const [species, setSpecies] = useState("");
  const weather = simulation?.weather ?? {};
  const allowWeather = creatorPolicy === undefined || (creatorPolicy.maxSimulationParticles ?? 0) >= 5556;
  const allowEmitters = creatorPolicy === undefined || (creatorPolicy.maxSimulationParticles ?? 0) > 0;
  const allowFire = creatorPolicy === undefined || (creatorPolicy.maxFireCells ?? 0) > 0;
  const allowFlocks = creatorPolicy === undefined || (creatorPolicy.maxPopulation ?? 0) > 0;
  const allowForces = creatorPolicy === undefined || (creatorPolicy.maxForceFields ?? 0) > 0;

  function update(next: EditorSimulation): void {
    try { session.dispatch({ type: "setSimulation", simulation: next }); setError(null); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }
  function setWeather(next: AuthoredWeatherConfig): void { update({ ...simulation, weather: next }); }
  function id(prefix: string, rows: readonly { id: string }[]): string {
    let index = 1;
    while (rows.some((row) => row.id === `${prefix}-${index}`)) index += 1;
    return `${prefix}-${index}`;
  }

  return <section aria-label="Simulation authoring" className="space-y-4 p-3 text-xs text-neutral-300">
    <h3 className="text-sm font-semibold text-neutral-100">Weather & simulation</h3>
    <p>Metres · game seconds · wind on world X/Z. Save stores authored inputs; play state saves separately.</p>
    {error !== null ? <p role="alert" className="text-red-300">{error}</p> : null}
    <fieldset hidden={!allowWeather} className="space-y-2"><legend>Ambient weather</legend>
      <label className="flex justify-between">Mode<select aria-label="Weather mode" value={weather.ambient?.mode ?? "clear"} onChange={(event) => setWeather({ ...weather, ambient: { ...weather.ambient, mode: event.target.value as AuthoredWeatherMode, intensity: weather.ambient?.intensity ?? 1 } })}>{modes.map((mode) => <option key={mode}>{mode}</option>)}</select></label>
      <NumberInput label="Weather intensity" value={weather.ambient?.intensity ?? 0} onChange={(intensity) => setWeather({ ...weather, ambient: { mode: "clear", ...weather.ambient, intensity } })} />
      <NumberInput label="Temperature offset °C" min={-100} value={weather.ambient?.temperatureOffset ?? 0} onChange={(temperatureOffset) => setWeather({ ...weather, ambient: { mode: "clear", intensity: 0, ...weather.ambient, temperatureOffset } })} />
      <NumberInput label="Wind speed m/s" value={weather.wind?.speed ?? 0} onChange={(speed) => setWeather({ ...weather, wind: { ...weather.wind, speed } })} />
      <NumberInput label="Wind X direction" min={-1} value={weather.wind?.direction?.[0] ?? 1} onChange={(x) => setWeather({ ...weather, wind: { ...weather.wind, direction: [x, weather.wind?.direction?.[1] ?? 0] } })} />
      <NumberInput label="Wind Z direction" min={-1} value={weather.wind?.direction?.[1] ?? 0} onChange={(z) => setWeather({ ...weather, wind: { ...weather.wind, direction: [weather.wind?.direction?.[0] ?? 1, z] } })} />
    </fieldset>
    <fieldset hidden={!allowWeather} className="space-y-2"><legend>Named profiles</legend>
      {(weather.profiles ?? []).map((profile, index) => <div key={profile.id} className="space-y-1 border-l border-neutral-700 pl-2">
        <label>Profile id<input aria-label={`Profile ${index + 1} id`} value={profile.id} onChange={(event) => {
          const nextId = event.target.value;
          setWeather({ ...weather, initialProfileId: weather.initialProfileId === profile.id ? nextId : weather.initialProfileId, profiles: weather.profiles!.map((row, i) => i === index ? { ...row, id: nextId } : row), schedule: weather.schedule?.map((row) => row.profileId === profile.id ? { ...row, profileId: nextId } : row) });
        }} /></label>
        <select aria-label={`Profile ${profile.id} mode`} value={profile.mode} onChange={(event) => setWeather({ ...weather, profiles: weather.profiles!.map((row, i) => i === index ? { ...row, mode: event.target.value as AuthoredWeatherMode } : row) })}>{modes.map((mode) => <option key={mode}>{mode}</option>)}</select>
        <NumberInput label={`Profile ${profile.id} intensity`} value={profile.intensity} onChange={(intensity) => setWeather({ ...weather, profiles: weather.profiles!.map((row, i) => i === index ? { ...row, intensity } : row) })} />
        <button type="button" onClick={() => setWeather({ ...weather, profiles: weather.profiles!.filter((_, i) => i !== index), initialProfileId: weather.initialProfileId === profile.id ? undefined : weather.initialProfileId, schedule: weather.schedule?.filter((row) => row.profileId !== profile.id) })}>Remove profile</button>
      </div>)}
      <button type="button" onClick={() => setWeather({ ...weather, profiles: [...(weather.profiles ?? []), { id: id("profile", weather.profiles ?? []), mode: "rain", intensity: 0.5 }] })}>Add weather profile</button>
    </fieldset>
    <fieldset hidden={!allowWeather} className="space-y-2"><legend>Schedule</legend>
      {(weather.schedule ?? []).map((transition, index) => <div key={index} className="space-y-1 border-l border-neutral-700 pl-2">
        <select aria-label={`Transition ${index + 1} profile`} value={transition.profileId} onChange={(event) => setWeather({ ...weather, schedule: weather.schedule!.map((row, i) => i === index ? { ...row, profileId: event.target.value } : row) })}>{weather.profiles?.map((profile) => <option key={profile.id}>{profile.id}</option>)}</select>
        <NumberInput label={`Transition ${index + 1} at seconds`} value={transition.atSeconds} onChange={(atSeconds) => setWeather({ ...weather, schedule: weather.schedule!.map((row, i) => i === index ? { ...row, atSeconds } : row) })} />
        <NumberInput label={`Transition ${index + 1} duration seconds`} value={transition.transitionSeconds ?? 0} onChange={(transitionSeconds) => setWeather({ ...weather, schedule: weather.schedule!.map((row, i) => i === index ? { ...row, transitionSeconds } : row) })} />
        <button type="button" onClick={() => setWeather({ ...weather, schedule: weather.schedule!.filter((_, i) => i !== index) })}>Remove transition</button>
      </div>)}
      <button type="button" disabled={!weather.profiles?.length} onClick={() => setWeather({ ...weather, schedule: [...(weather.schedule ?? []), { atSeconds: (weather.schedule?.at(-1)?.atSeconds ?? 0) + 10, profileId: weather.profiles![0]!.id, transitionSeconds: 2 }] })}>Add transition</button>
    </fieldset>
    <fieldset hidden={!allowWeather} className="space-y-2"><legend>Local wind zones</legend>
      {(weather.zones ?? []).map((zone, index) => <div key={zone.id} className="space-y-1 border-l border-neutral-700 pl-2"><span>{zone.id}</span>
        <NumberInput label={`${zone.id} X metres`} min={-1e6} value={zone.center[0]} onChange={(x) => setWeather({ ...weather, zones: weather.zones!.map((row, i) => i === index ? { ...row, center: [x, row.center[1]] } : row) })} />
        <NumberInput label={`${zone.id} Z metres`} min={-1e6} value={zone.center[1]} onChange={(z) => setWeather({ ...weather, zones: weather.zones!.map((row, i) => i === index ? { ...row, center: [row.center[0], z] } : row) })} />
        <NumberInput label={`${zone.id} radius metres`} value={zone.radius} onChange={(radius) => setWeather({ ...weather, zones: weather.zones!.map((row, i) => i === index ? { ...row, radius } : row) })} />
        <NumberInput label={`${zone.id} speed m/s`} value={zone.wind?.speed ?? 0} onChange={(speed) => setWeather({ ...weather, zones: weather.zones!.map((row, i) => i === index ? { ...row, wind: { ...row.wind, speed } } : row) })} />
        <label><input type="checkbox" checked={zone.radial ?? false} onChange={(event) => setWeather({ ...weather, zones: weather.zones!.map((row, i) => i === index ? { ...row, radial: event.target.checked } : row) })} /> Radial wind</label>
        <button type="button" onClick={() => setWeather({ ...weather, zones: weather.zones!.filter((_, i) => i !== index) })}>Remove wind zone</button>
      </div>)}
      <button type="button" onClick={() => setWeather({ ...weather, zones: [...(weather.zones ?? []), { id: id("wind", weather.zones ?? []), center: [0, 0], radius: 10, falloff: 5, wind: { direction: [1, 0], speed: 3 } }] })}>Add wind zone</button>
    </fieldset>
    <fieldset hidden={!allowForces} className="space-y-2"><legend>Spatial forces</legend>
      {(simulation?.forces ?? []).map((field, index) => <div key={index} className="space-y-1 border-l border-neutral-700 pl-2">
        {([0, 1, 2] as const).map((axis) => <NumberInput key={axis} label={`Force ${index + 1} ${["X", "Y", "Z"][axis]} metres`} min={-1e6} value={field.center[axis]} onChange={(value) => update({ ...simulation, forces: simulation!.forces!.map((row, i) => i === index ? { ...row, center: row.center.map((entry, j) => j === axis ? value : entry) as [number, number, number] } : row) })} />)}
        {field.shape.kind === "sphere" ? <NumberInput label={`Force ${index + 1} radius metres`} value={field.shape.radius} onChange={(radius) => update({ ...simulation, forces: simulation!.forces!.map((row, i) => i === index ? { ...row, shape: { kind: "sphere", radius } } : row) })} /> : <span>Box bounds are available in advanced editing.</span>}
        <NumberInput label={`Force ${index + 1} attraction m/s²`} min={-1e6} value={field.strength} onChange={(strength) => update({ ...simulation, forces: simulation!.forces!.map((row, i) => i === index ? { ...row, strength } : row) })} />
        <NumberInput label={`Force ${index + 1} vortex m/s²`} min={-1e6} value={field.vortex?.strength ?? 0} onChange={(strength) => update({ ...simulation, forces: simulation!.forces!.map((row, i) => i === index ? { ...row, vortex: { axis: [0, 1, 0], ...row.vortex, strength } } : row) })} />
        <NumberInput label={`Force ${index + 1} lift m/s²`} min={-1e6} value={field.vortex?.lift ?? 0} onChange={(lift) => update({ ...simulation, forces: simulation!.forces!.map((row, i) => i === index ? { ...row, vortex: { axis: [0, 1, 0], strength: 0, ...row.vortex, lift } } : row) })} />
        <NumberInput label={`Force ${index + 1} falloff`} value={field.attenuation ?? 1} onChange={(attenuation) => update({ ...simulation, forces: simulation!.forces!.map((row, i) => i === index ? { ...row, attenuation } : row) })} />
        <button type="button" onClick={() => update({ ...simulation, forces: simulation!.forces!.filter((_, i) => i !== index) })}>Remove force</button>
      </div>)}
      <button type="button" onClick={() => update({ ...simulation, forces: [...(simulation?.forces ?? []), { center: [0, 0, 0], shape: { kind: "sphere", radius: 10 }, strength: 0, attenuation: 1, vortex: { axis: [0, 1, 0], strength: 2, lift: 1 }, mask: 1 }] })}>Add spatial force</button>
    </fieldset>
    <fieldset hidden={!allowEmitters} className="space-y-2"><legend>Named effects</legend>
      {(simulation?.emitters ?? []).map((emitter, index) => <div key={emitter.id} className="space-y-1 border-l border-neutral-700 pl-2"><span>{emitter.id}</span>
        <select aria-label={`${emitter.id} appearance`} value={emitter.options?.render?.shape ?? "point"} onChange={(event) => update({ ...simulation, emitters: simulation!.emitters!.map((row, i) => i === index ? { ...row, options: { ...row.options, render: { shape: event.target.value as "point" | "streak" | "flake" | "flame" | "smoke" | "ribbon" | "ripple" } } } : row) })}>{["point", "streak", "flake", "flame", "smoke", "ribbon", "ripple"].map((shape) => <option key={shape}>{shape}</option>)}</select>
        <NumberInput label={`${emitter.id} particles/second`} value={emitter.config.rate ?? 0} onChange={(rate) => update({ ...simulation, emitters: simulation!.emitters!.map((row, i) => i === index ? { ...row, config: { ...row.config, rate } } : row) })} />
        <NumberInput label={`${emitter.id} particle capacity`} step={1} value={emitter.config.max ?? 512} onChange={(max) => update({ ...simulation, emitters: simulation!.emitters!.map((row, i) => i === index ? { ...row, config: { ...row.config, max } } : row) })} />
        {(["x", "y", "z"] as const).map((axis) => <NumberInput key={axis} label={`${emitter.id} ${axis.toUpperCase()} metres`} min={-1e6} value={emitter.position[axis]} onChange={(value) => update({ ...simulation, emitters: simulation!.emitters!.map((row, i) => i === index ? { ...row, position: { ...row.position, [axis]: value } } : row) })} />)}
        <label><input type="checkbox" checked={emitter.options?.active !== false} onChange={(event) => update({ ...simulation, emitters: simulation!.emitters!.map((row, i) => i === index ? { ...row, options: { ...row.options, active: event.target.checked } } : row) })} /> Spawning</label>
        <label>Fire binding<select aria-label={`${emitter.id} fire area`} value={emitter.fireAreaId ?? ""} onChange={(event) => update({ ...simulation, emitters: simulation!.emitters!.map((row, i) => i === index ? { ...row, fireAreaId: event.target.value || undefined } : row) })}><option value="">Independent</option>{simulation?.fires?.map((area) => <option key={area.id}>{area.id}</option>)}</select></label>
        <button type="button" onClick={() => update({ ...simulation, emitters: simulation!.emitters!.filter((_, i) => i !== index) })}>Remove emitter</button>
      </div>)}
      <button type="button" onClick={() => update({ ...simulation, emitters: [...(simulation?.emitters ?? []), { id: id("emitter", simulation?.emitters ?? []), position: { x: 0, y: 1, z: 0 }, config: { rate: 8, max: 64, lifetime: { min: 1, max: 2 }, seed: "authored" }, options: { render: { shape: "smoke" } } }] })}>Add named emitter</button>
    </fieldset>
    <fieldset hidden={!allowFire} className="space-y-2"><legend>Fire areas</legend>
      {(simulation?.fires ?? []).map((area, index) => <div key={area.id} className="space-y-1 border-l border-neutral-700 pl-2"><span>{area.id}</span>
        {(["x", "y", "z"] as const).map((axis) => <NumberInput key={axis} label={`${area.id} ${axis.toUpperCase()} metres`} min={-1e6} value={area.position[axis]} onChange={(value) => update({ ...simulation, fires: simulation!.fires!.map((row, i) => i === index ? { ...row, position: { ...row.position, [axis]: value } } : row) })} />)}
        <NumberInput label={`${area.id} cell size metres`} value={area.config.cellSize} onChange={(cellSize) => update({ ...simulation, fires: simulation!.fires!.map((row, i) => i === index ? { ...row, config: { ...row.config, cellSize } } : row) })} />
        <NumberInput label={`${area.id} fuel consumed/second`} value={area.config.burnRate ?? 0.25} onChange={(burnRate) => update({ ...simulation, fires: simulation!.fires!.map((row, i) => i === index ? { ...row, config: { ...row.config, burnRate } } : row) })} />
        <NumberInput label={`${area.id} rain cooling heat/second`} value={area.extinguishRate ?? 0} onChange={(extinguishRate) => update({ ...simulation, fires: simulation!.fires!.map((row, i) => i === index ? { ...row, extinguishRate } : row) })} />
        <label><input type="checkbox" checked={(area.ignitions?.length ?? 0) > 0} onChange={(event) => update({ ...simulation, fires: simulation!.fires!.map((row, i) => i === index ? { ...row, ignitions: event.target.checked ? [{ col: 0, row: 0 }] : [] } : row) })} /> Ignite first cell on play</label>
        <button type="button" onClick={() => update({ ...simulation, fires: simulation!.fires!.filter((_, i) => i !== index), emitters: simulation?.emitters?.map((emitter) => emitter.fireAreaId === area.id ? { ...emitter, fireAreaId: undefined } : emitter) })}>Remove fire area</button>
      </div>)}
      <button type="button" onClick={() => update({ ...simulation, fires: [...(simulation?.fires ?? []), { id: id("fire", simulation?.fires ?? []), position: { x: 0, y: 0, z: 0 }, config: { cols: 4, rows: 4, cellSize: 1 }, ignitions: [] }] })}>Add fire area</button>
    </fieldset>
    <fieldset hidden={!allowFlocks} className="space-y-2"><legend>Flock habitats</legend>
      {(simulation?.habitats ?? []).map((habitat, index) => <div key={habitat.id} className="space-y-1 border-l border-neutral-700 pl-2"><span>{habitat.id} · {habitat.species}</span>
        <select aria-label={`${habitat.id} role`} value={habitat.role} onChange={(event) => update({ ...simulation, habitats: simulation!.habitats!.map((row, i) => i === index ? { ...row, role: event.target.value as "cosmetic" | "gameplay" } : row) })}><option>cosmetic</option><option>gameplay</option></select>
        <NumberInput label={`${habitat.id} bird count`} step={1} value={habitat.count} onChange={(count) => update({ ...simulation, habitats: simulation!.habitats!.map((row, i) => i === index ? { ...row, count } : row) })} />
        <NumberInput label={`${habitat.id} radius metres`} value={habitat.radius} onChange={(radius) => update({ ...simulation, habitats: simulation!.habitats!.map((row, i) => i === index ? { ...row, radius } : row) })} />
        {(["x", "y", "z"] as const).map((axis) => <NumberInput key={axis} label={`${habitat.id} ${axis.toUpperCase()} metres`} min={-1e6} value={habitat.position[axis]} onChange={(value) => update({ ...simulation, habitats: simulation!.habitats!.map((row, i) => i === index ? { ...row, position: { ...row.position, [axis]: value } } : row) })} />)}
        <select aria-label={`${habitat.id} route`} value={habitat.routeId ?? ""} onChange={(event) => update({ ...simulation, habitats: simulation!.habitats!.map((row, i) => i === index ? { ...row, routeId: event.target.value || undefined } : row) })}><option value="">Stay in habitat</option>{session.getState().document.paths.filter((path) => path.points.length > 1).map((path) => <option key={path.id} value={path.id}>{path.label ?? path.id}</option>)}</select>
        <button type="button" onClick={() => update({ ...simulation, habitats: simulation!.habitats!.filter((_, i) => i !== index) })}>Remove habitat</button>
      </div>)}
      <label>Game species<input aria-label="Game species" value={species} onChange={(event) => setSpecies(event.target.value)} /></label>
      <button type="button" disabled={!species.trim()} onClick={() => update({ ...simulation, habitats: [...(simulation?.habitats ?? []), { id: id("habitat", simulation?.habitats ?? []), species: species.trim(), position: { x: 0, y: 4, z: 0 }, radius: 8, count: 8, seed: "authored", role: "cosmetic", steering: { maxSpeed: 4, separationRadius: 1, neighborRadius: 5 } }] })}>Add flock habitat</button>
    </fieldset>
    <button type="button" onClick={() => setAdvanced(JSON.stringify(simulation ?? {}, null, 2))}>Edit complete simulation data</button>
    {advanced !== null ? <div className="space-y-2"><textarea aria-label="Simulation JSON" className="h-60 w-full bg-neutral-900 p-2 font-mono" value={advanced} onChange={(event) => setAdvanced(event.target.value)} /><button type="button" onClick={() => { try { update(JSON.parse(advanced)); } catch (reason) { setError(String(reason)); } }}>Apply simulation data</button><button type="button" onClick={() => setAdvanced(null)}>Close data editor</button></div> : null}
  </section>;
}
