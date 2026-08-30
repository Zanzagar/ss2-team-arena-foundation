# Preserved divergence reports

`ss2-1v1-divergence` reports written by `tools/capture-session.mjs` whenever a
runtime observation disagrees with a candidate fixture. Divergent traces are
evidence, not failures to discard: keep the report, correct the isolated
candidate in `src/golden/ss2-attack-candidate.js` and its fixture, add a
regression test, and re-verify. Reports are named
`<fixture-id>--<observation-id>.json` and validated by
`src/golden/promote-1v1-golden.js`.
