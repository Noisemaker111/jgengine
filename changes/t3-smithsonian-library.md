Smithsonian Open Access CC0 3D scans are in the asset library

Closes #2710

### Added

- 1,030 Smithsonian Open Access scans (fossils, aircraft, spacecraft, artefacts) are library models, each listed only when its own 3D package is marked CC0, credited to the museum unit that holds it, with page and thumbnail. The shared DEMO_KEY ran out after the first 1,000 search items; `assets library ingest smithsonian` with `SI_API_KEY` set lists the other half.
- `assets pull smithsonian:<id>` fetches the package's Draco GLB into the shared store at real scale.
