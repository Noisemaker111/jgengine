### Migrate

- The engine runs on three 0.187 and vite 8. Packages peer on `three >=0.187.0`; move your app to `three@^0.187.0`, `vite@^8`, `@vitejs/plugin-react@^6` and `@tailwindcss/vite@^4.3`, and keep `@react-three/fiber` on `~9.7.0` (9.8.x unmounts drei `Html` roots inside React's commit and logs an error at boot).
- `PCFSoftShadowMap` is removed in three 0.187 (it falls back to `PCFShadowMap` with a warning). Use `shadows="percentage"`.
- GLSL that calls `inverseTransformDirection` should call `transformNormalByInverseViewMatrix` or `transformDirectionByInverseViewMatrix`.

### Fixed

- The shader warmup replay no longer draws a post pass into the target it samples, which three 0.187 turned into a GL feedback-loop error.
- Material overrides set iridescence thickness through `iridescenceThicknessMinimum` and `iridescenceThicknessMaximum`.
- The scaffold templates pin three 0.187, vite 8, plugin-react 6 and fiber ~9.7.0.
