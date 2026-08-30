# Runtime-capture instrumentation

`ss2-capture-wrapper.as` is the independently authored AS2 instrumentation
host for controlled licensed-build capture sessions. It is compiled from
source on every use (never committed as a binary): `make-wrapper-shell.mjs`
assembles a minimal FWS v8 shell and portable FFDec's `-importScript`
compiles the wrapper into it.

## Validation status (2026-08-30)

The capture vehicle is **validated end to end against a structural stub**:

1. Portable Ruffle 0.5.0 is installed under ignored `.tools/` by
   `tools/install-ruffle.ps1` (pinned release, SHA-256 verified against the
   GitHub-published digest).
2. `validate-vehicle.ps1` — the one-command gate — rebuilds the wrapper and
   `stub-game.as` (a structural mimic of the mapped battle layout that
   replays `candidate-lethal-result` exactly, containing no game content),
   runs the wrapper against the stub under Ruffle, then delogs, ingests
   (live post-session hash check included), and verifies. The round trip
   MATCHES the fixture. This proves FlashVars plumbing, the JSON emitter,
   tape injection, `Object.watch` per-assignment capture with hook
   attribution, cross-level function wrapping, `loadMovieNum` level
   isolation, event emission and ordering, and the whole
   delog→ingest→verify pipeline.
3. Not yet validated (needs the first real session): the licensed timeline's
   actual instance paths (`arena.overlay`), live battle-flow timing, the
   END-key non-lethal finish, and the real `fight_mode` values.

Run `validate-vehicle.ps1` after every wrapper edit; run
`launch-capture.ps1` for real sessions (it verifies hashes, rebuilds,
injects the fixture tape, opens the licensed game read-in-place via a
`file:` URL, and runs the pipeline when the window closes).

Traces produced against the stub are validation artifacts only: their ids
stay prefixed `stubcheck-` and their observation records never enter
`test/observations/`.

## Known constraints

- The wrapper cannot observe AVM1 `RandomNumber` opcode rolls (cosmetic
  debris), which are excluded from observation matching.
- It cannot attest the post-session install hash itself: its end line
  carries a `null` placeholder that `capture-session.mjs ingest` replaces
  only after re-running the hash check live.
- FlashVars land as `_root` properties and timeline vars ARE `_root`
  properties — read every FlashVar before declaring any variable with the
  same name (the tape FlashVar was silently clobbered this way; the stub
  gate caught it).
- Reference traces from `capture-session.mjs simulate` must stay
  reproducible by the wrapper modulo meta identity, passive roll values, and
  per-roll callSite attribution.
