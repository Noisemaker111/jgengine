### Fixed

- `createAuctionBook` rejects duplicate explicit IDs with `duplicate-id` and skips occupied generated IDs, preserving active auctions and escrow.
- `AuctionBook.claimItem` rejects nonpositive and noninteger counts without changing collection items.
