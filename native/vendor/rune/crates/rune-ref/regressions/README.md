# Differential regressions

Commit minimized JSON scenes here once a finding is understood. The GPU test
replays every JSON file with a 2-LSB channel cap and zero outlier pixels. Proptest
writes the final minimized scene to `../failures/minimized.json`; replay with:

```sh
cargo run -p rune-ref --features gpu -- --scene PATH --diff --blame 12,17
```
