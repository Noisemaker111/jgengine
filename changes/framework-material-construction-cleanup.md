### Fixed
- Release unreturned material clones and promotions when imported shader callbacks fail during asset or rim construction, preserving the original error and borrowed resource ownership.
- Attempt every owned replacement's cleanup during assignment rollback even when an earlier disposal callback throws.
