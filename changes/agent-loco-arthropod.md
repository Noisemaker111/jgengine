arthropodGait scores a game insect or spider against real cockroaches, ants and tarantulas at equal Froude number

Closes #2796

### Added

- `arthropodStride`, `arthropodTopSpeed` and `compareArthropod` give a real insect or spider's stride, gait and top speed scaled to a leg length, from Full & Tu 1991, Pfeffer et al. 2019, Wahl et al. 2015 and Biancardi et al. 2011.
- `validateArthropodReference` checks each runner's published stride fits against its speed, predicts the cockroach's top speed from the two ants within 4%, and checks the √leg-length scaling against Hurlbert et al.'s ant exponents.
- `bun run games:capabilities locomotion --creatures ... --arthropods <id[:8],...>` scores a game's insects and spiders against them.
