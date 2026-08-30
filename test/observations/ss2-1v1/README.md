# Runtime observation records

Normalized `ss2-1v1-observation` records produced by
`tools/capture-session.mjs ingest` from controlled licensed-build capture
sessions. Empty until the first real capture: records are never hand-written
or synthesized, because they are the runtime evidence that promotes candidate
fixtures to goldens.

Every record is validated by `src/golden/observation.js` (pinned build
fingerprint, capture attestations, ordered samples with call sites, ordered
mutations, semantic events, final state, and a canonical-JSON SHA-256 digest).
See `docs/integration/ss2-runtime-capture.md`.
