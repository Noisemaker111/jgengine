Grass shading, colour and outline follow realism: cel bands, flat tones and ink edges toward cartoon; sheen and light through the leaf toward photoreal

### Added

- Grass style `shading` (follows realism): toward 0 the sun falls into three flat cel bands, the gloss goes matt and a rim of sky light outlines each blade; toward 1 the blade glosses and light shines through more of the leaf
- Grass style `colourSteps`: snaps each blade's root-to-tip colour to three flat tones and quiets the blade-to-blade noise, on toward cartoon
- Grass style `saturation` and `contrast`: brighter, purer colour and a stronger root-to-tip gradient toward cartoon, the species' own colour and a softer gradient toward photoreal
- Grass style `outline`: dark ink along each blade's edges so clumps read as outlined shapes, on toward cartoon and settable by hand anywhere

### Changed

- A scene that sets no style draws the same grass as before: every new slider sits on today's look at realism 0.5, and all of them are shader uniforms, so moving one never compiles a new shader
