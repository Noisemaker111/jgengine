### Fixed

- A supplied pursuit eligibility callback accepts targets only when it returns exactly `true`; missing returns, nulls, objects and Promises deny attacks. An absent callback retains the documented player-role default.
