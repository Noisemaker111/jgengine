### Fixed

- Listing books preserve occupied listing IDs: generated IDs skip collisions, and explicit duplicates return `duplicate-id` without replacing retained goods.
- Invalid negative, fractional and non-finite item claims leave collection boxes unchanged; zero-count no-ops and valid integer claims keep their behavior.
