### Fixed

- Authored primitive surfaces and static shape batches now decode sheen-colour and specular-colour maps as sRGB, using the shared texture-role semantics. Numeric maps remain linear and loader-cached textures remain untouched.
