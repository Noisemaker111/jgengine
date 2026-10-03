### Migrate

- `MaterialMaps.ao`, `MaterialMaps.roughness`, and matching terrain roles are optional. Pass the resolved maps directly to material seams or check for a URL before loading it. Native ambientCG pulls no longer advertise unprovided KTX2 maps.

### Fixed

- Material catalog URLs follow pinned source map availability, including absent AO in `ambientcg-metalplates001` and absent roughness in `ambientcg-gravel001`/`ambientcg-concrete001`. Pull rejects archives missing declared maps; terrain skips absent AO/roughness sampling and keeps authored scalar roughness.
