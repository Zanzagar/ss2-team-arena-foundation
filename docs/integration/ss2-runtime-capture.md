# SS2 controlled runtime-capture workflow

Status: capture, verification, and promotion pipeline landed 2026-08-30 and
fully covered by tests. No runtime observation has been captured yet, so every
committed fixture is still `classification: "candidate"`. This document is the
operating procedure for Stage 3 of [the roadmap](../roadmap.md): promoting
static candidates to runtime-observed goldens with repeated evidence from the
licensed local build in
[`ss2-build-fingerprint.json`](ss2-build-fingerprint.json).

## Boundary

- The installed SWFs are read in place and stay byte-identical; the pinned
  SHA-256 hashes are rechecked before and after every capture session, and both
  attestations are mandatory fields of every observation and manifest.
- No original SWF, extracted script, artwork, audio, screenshot, or install
  path enters the repository. Committed records contain only independently
  authored numeric state, ordered RNG samples with structural call-site
  identifiers, ordered mutations, semantic events, and SHA-256 digests.
- Raw instrumentation traces stay in the ignored `captures/` directory.
- The unrelated third-party SWF previously found in Downloads is not evidence
  and must not be captured.
- `classicStyleRules` and the shared 1–3 combatant engine remain untouched
  until promoted goldens justify the adapter seam.

## Pipeline

```text
licensed build (read-only, hash-checked)
  -> instrumented controlled 1v1 action
  -> raw JSONL trace                     captures/ (ignored)
  -> tools/capture-session.mjs ingest
  -> observation record (digested)       test/observations/ss2-1v1/
  -> tools/capture-session.mjs verify
       match    -> repeat in a second independent session
       diverge  -> divergence report     test/fixtures/ss2-1v1-divergences/
  -> tools/capture-session.mjs promote   (needs >= 2 matching observations
       from >= 2 sessions + manifest)
  -> golden fixture                      test/fixtures/ss2-1v1-golden/
```

Module responsibilities:

| File | Responsibility |
| --- | --- |
| `src/golden/observation.js` | observation schema/digests, comparison projection, observation-vs-observation and observation-vs-fixture matching |
| `src/golden/capture-ingest.js` | raw JSONL trace normalization, mutation-chain and final-state integrity checks |
| `src/golden/promote-1v1-golden.js` | capture-manifest validation/digest, independence gate, promotion, divergence reports |
| `src/golden/simulate-capture-trace.js` | reference trace generator (`synthetic-simulator` method, never promotable) for pipeline dry runs and wrapper validation |
| `tools/capture-session.mjs` | operator CLI: `verify-install`, `simulate`, `tape`, `delog`, `ingest`, `verify`, `promote`, `manifest-digest` |
| `tools/runtime-capture/` | AS2 wrapper source, shell/stub builders, the `validate-vehicle.ps1` gate, and `launch-capture.ps1` (see its README for validation status) |

## Capture session protocol

Per-fixture staging requirements (implied equipment, level/vitality
derivations, and open staging questions) are catalogued in
[the capture staging guide](ss2-capture-staging.md).

1. `node tools/capture-session.mjs verify-install` — both installed hashes
   must match the fingerprint or the session must not start.
2. Stage the exact scenario of one target candidate fixture (stats, armour,
   statuses, positions) in a controlled 1v1.
3. Run the instrumented action once, writing the raw JSONL trace to
   `captures/<session-id>/<observation-id>.jsonl`.
4. `node tools/capture-session.mjs ingest --trace <raw> --fixture
   test/fixtures/ss2-1v1/<candidate>.json --out
   test/observations/ss2-1v1/<observation-id>.json` — for wrapper traces
   (whose end line carries the `null` attestation placeholder) ingest re-runs
   the installed-hash verification itself and refuses the trace when the
   post-session check fails.
5. `node tools/capture-session.mjs verify --fixture <candidate> --observation
   <record>`; a divergence is preserved automatically, never deleted.
6. Repeat from step 1 in a fresh game launch (a new `sessionId`) until at
   least two matching observations from at least two sessions exist.
7. Write the capture manifest listing every session and observation, then
   `node tools/capture-session.mjs promote --fixture <candidate> --manifest
   <manifest> --observation <record1> --observation <record2>`.

Promotion enforces, in code, everything the fixture validator already
requires of goldens: `licensed-observation` provenance, `runtimeVerified:
true`, at least two unique observation IDs and digests, distinct capture
sessions, per-observation manifest attestation, and the capture-manifest
SHA-256. `candidateFlags` do not carry over; a promoted quirk (for example the
armour-equality behavior) is thereby confirmed as build behavior.

## Instrumentation vehicle (installed and stub-validated 2026-08-30)

Portable **Ruffle 0.5.0** is installed under ignored `.tools/` by
`tools/install-ruffle.ps1` (pinned official release, SHA-256 verified
against the GitHub-published digest; installation was explicitly approved).
The wrapper is compiled from source on demand: `make-wrapper-shell.mjs`
assembles a minimal FWS v8 shell and portable FFDec compiles
`ss2-capture-wrapper.as` into it via `-importScript`.

`tools/runtime-capture/validate-vehicle.ps1` is the one-command validation
gate: it rebuilds the wrapper and the structural stub game, runs the wrapper
against the stub with `candidate-lethal-result`'s tape injected, and
requires the full `delog -> ingest -> verify` round trip to MATCH the
fixture. The gate passes, which proves every wrapper mechanism (FlashVars,
tape injection, `Object.watch` capture, cross-level function wrapping,
`loadMovieNum` isolation, event ordering, hash-check stamping) under
Ruffle's AVM1. `tools/runtime-capture/launch-capture.ps1` drives a real
session the same way, loading the installed SWF in place via a `file:` URL.
A licensed AIR/projector runtime remains the fallback vehicle if Ruffle's
AVM1 fidelity proves insufficient on the real battle timeline.

The wrapper source is committed as an unvalidated draft at
`tools/runtime-capture/ss2-capture-wrapper.as`. It instruments without
patching:

- wraps the three mapped `randomBetween` definitions (overlay frame 52 blocks
  `0x23f835`/`0x240c7f`, root frame 35 block `0x40198e`) to serve an injected
  deterministic tape and log each call with label, bounds, value, and call
  site — `injected-tape-runtime` capture drives the game's own bytecode with
  the candidate fixture's exact rolls;
- uses AS2 `Object.watch` on every projected field of `_root.game.hero` and
  `_root.game.villain` for per-assignment mutation capture
  (`mutationGranularity: "property-watch"`);
- wraps `defender_hurt`, `defender_blocked`, `death`, and observes the overlay
  `combatwon`/`combatlost` transitions for semantic events;
- can neither inject nor record AVM1 `RandomNumber` opcode rolls (the opcode
  is bytecode, not a wrappable function): the cosmetic armour-debris rolls
  are therefore excluded from observation matching on both sides — fixtures
  keep documenting them, and the static harness still replays them — and
  `attack_direction` is observed and recorded rather than forced;
- emits the end line with a `null` post-session attestation placeholder: the
  hash check cannot have run yet, so `capture-session.mjs ingest` re-runs the
  installed-hash verification live and stamps `installHashVerifiedAfter` only
  when it passes;
- emits only the JSONL trace grammar below (no screenshots, no assets).

### Reference traces (simulator)

`node tools/capture-session.mjs simulate --fixture <candidate.json>` writes
the exact JSONL a perfect wrapper would emit for that fixture's staged
scenario and injected tape (default output under ignored
`captures/simulated/`). These traces exercise `ingest` and `verify` end to
end and are the wrapper's executable specification: during validation the
wrapper must reproduce them (modulo meta identity, passive roll values, and
per-roll callSite attribution) before a real capture counts as evidence. The
simulator also fails fast on any fixture that cannot produce a
self-verifying reference trace, blaming the fixture rather than the trace.
Their capture method is
`synthetic-simulator`, which observation validation accepts but promotion
rejects unconditionally — a simulated trace can never become runtime
evidence, and simulated records do not belong in `test/observations/`.

## Raw trace grammar (JSON lines, version 1)

| Line `t` | Position | Contents |
| --- | --- | --- |
| `meta` | first | trace schema version, observation/session IDs, tool version, method, timestamp, `mutationGranularity`, `installHashVerifiedBefore: true`, attacker side |
| `state` | before the action, one per side | staged numeric/boolean field dump per combatant |
| `var` | any | named scalar: `attack_direction`, `criticalhit` |
| `roll` | action | `{label, source, min, max, value, callSite, injected}` in exact call order |
| `set` | action | `{path, before, after, hook}` — one watched assignment; `hook` is the wrapper's attribution (`damagecharacter`, `remove-armour`, `death`, ...) |
| `event` | action | `defender-hurt`/`defender-blocked`/`death`/`overlay-label` |
| `final` | after the action, one per side | post-action field dump |
| `end` | last | `installHashVerifiedAfter: true`, or `null` as the wrapper's placeholder — ingest then re-runs the hash check live and refuses the trace when it fails |

Ingestion (`src/golden/capture-ingest.js`) enforces integrity before a record
exists: every `set` must chain from the staged value or the previous `after`
for its path, no-op assignments are dropped, the final dump must equal the end
of each watched chain (any gap is an "unobserved mutation" error), a death
event must be followed by its matching overlay label, and the scenario is
projected onto exactly the target fixture's staged fields — a mis-staged
scenario is recorded as observed and surfaces as an explicit mismatch.

## Observation records

`test/observations/ss2-1v1/*.json`, schema `ss2-1v1-observation` version 1.
Each record carries the pinned build block, capture attestations, the target
fixture ID, the observed scenario, ordered samples with call sites, the
ordered mutation trace, semantic events, the result event (if any), the final
state projection, and a SHA-256 digest over the canonical-JSON record (sorted
keys). The digest covers the observation's identity, so independent
observations always digest uniquely — exactly what golden provenance requires.

## Matching rules

An observation matches a fixture when all of the following are exactly equal:

- scenario (numeric staged state, attacker side, attack direction);
- ordered samples — label, source, bounds, and value, with cosmetic
  `armour-debris-*` opcode rolls excluded from both sides (no instrumentation
  can observe the opcode stream, and the rolls never change combat state);
- ordered mutation trace on the `(sequence, path, before, after)` contract —
  `reason` strings are annotations (static-analysis labels in fixtures,
  hook attributions in observations) and are deliberately not compared;
- semantic events against the fixture's derived expectation
  (`defender-blocked` for a miss; `defender-hurt` with the dispatched method
  for a hit; plus `death` and `overlay-label` for a lethal outcome);
- the result event and the final state projection.

`expected.calculation` and `expected.mutation` stay candidate-derived
summaries: they are not directly observable and are exercised by replaying
the candidate resolver, which promotion re-runs on every golden.

## Divergence handling

A mismatch never deletes evidence. `verify` and `promote` write a
`ss2-1v1-divergence` report (fixture ID, observation ID/digest, session, and
JSON-pointer differences) to `test/fixtures/ss2-1v1-divergences/`, and the raw
trace stays in `captures/`. The follow-up is always: keep the report, correct
the isolated candidate module/fixture to the observed behavior, add a
regression test, and only then attempt promotion again. Divergences do not
touch `classicStyleRules` or the team engine directly.

## What remains before the first golden

1. First real sessions must confirm what only the licensed timeline can:
   the `arena.overlay` instance path, live battle-flow timing, the END-key
   non-lethal finish, and which `fight_mode` values ordinary fights use
   (the defeat gate's first-blood term in the battle map).
2. Two matching controlled sessions per candidate, starting with
   `candidate-normal-threshold-hit`, staged per
   [the staging guide](ss2-capture-staging.md) and driven by
   `tools/runtime-capture/launch-capture.ps1`.

The 2v2 and then 3v3 cooperative campaign targets are unchanged: one shared
resolver, team elimination, AI fill, controller-independent combatants, and a
single campaign settlement after the final animation acknowledgement, as
recorded in [the roadmap](../roadmap.md).
