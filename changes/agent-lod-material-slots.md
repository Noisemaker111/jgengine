### Fixed

- A model's `materialAssignments` no longer throw "matched no slots" on a variant level whose simplified asset dropped the selected slot. The source level still validates strictly, and a level skips only the selectors it lacks; `applyMaterialAssignments` takes `{ unmatched: "skip" }` for the same policy. Harbor Heat's HHPD cruiser crashed on spawn at its far level (issue #259).
