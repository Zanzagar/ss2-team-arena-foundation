# Runtime-observed golden fixtures

Fixtures promoted from `test/fixtures/ss2-1v1/` candidates by
`tools/capture-session.mjs promote`. Empty until at least two matching
independent runtime observations exist for a candidate; goldens are never
created by hand. A golden carries `classification: "golden"`,
`licensed-observation` provenance, `runtimeVerified: true`, at least two
unique observation IDs and digests, and the capture-manifest SHA-256, all
enforced by `src/golden/run-1v1-fixture.js` and
`src/golden/promote-1v1-golden.js`.
