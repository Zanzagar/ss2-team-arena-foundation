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
| `tools/capture-session.mjs` | operator CLI: `verify-install`, `ingest`, `verify`, `promote`, `manifest-digest` |

## Capture session protocol

1. `node tools/capture-session.mjs verify-install` — both installed hashes
   must match the fingerprint or the session must not start.
2. Stage the exact scenario of one target candidate fixture (stats, armour,
   statuses, positions) in a controlled 1v1.
3. Run the instrumented action once, writing the raw JSONL trace to
   `captures/<session-id>/<observation-id>.jsonl`.
4. `verify-install` again; record both attestations in the trace meta/end
   lines.
5. `node tools/capture-session.mjs ingest --trace <raw> --fixture
   test/fixtures/ss2-1v1/<candidate>.json --out
   test/observations/ss2-1v1/<observation-id>.json`.
6. `node tools/capture-session.mjs verify --fixture <candidate> --observation
   <record>`; a divergence is preserved automatically, never deleted.
7. Repeat from step 1 in a fresh game launch (a new `sessionId`) until at
   least two matching observations from at least two sessions exist.
8. Write the capture manifest listing every session and observation, then
   `node tools/capture-session.mjs promote --fixture <candidate> --manifest
   <manifest> --observation <record1> --observation <record2>`.

Promotion enforces, in code, everything the fixture validator already
requires of goldens: `licensed-observation` provenance, `runtimeVerified:
true`, at least two unique observation IDs and digests, distinct capture
sessions, per-observation manifest attestation, and the capture-manifest
SHA-256. `candidateFlags` do not carry over; a promoted quirk (for example the
armour-equality behavior) is thereby confirmed as build behavior.

## Instrumentation vehicle

No AVM1-capable runtime is currently installed on this machine (checked
2026-08-30: no Ruffle, no standalone Flash projector; `.tools/` holds only
FFDec and a JRE). Live capture is therefore blocked on installing a player,
which needs explicit approval before anything is downloaded. The proposed
vehicle, in order of preference:

1. **Ruffle (open-source Flash emulator), desktop or web build.** An
   independently authored wrapper movie loads the installed
   `swf/swords_sandals2_download.swf` in place by absolute path — reading it
   into memory the same way `tools/inspect-swf.mjs` already does, with no copy
   written anywhere — and instruments it from outside the game's code.
2. A licensed AIR/projector runtime, with the same wrapper, if Ruffle's AVM1
   fidelity proves insufficient for the battle timeline.

The wrapper (independently authored, to live under `tools/runtime-capture/`
when validated against a real player) instruments without patching:

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
- records — but cannot inject — AVM1 `RandomNumber` opcode rolls; the cosmetic
  armour-debris rolls are therefore compared structurally (position and
  bounds), never by value, and `attack_direction` is observed and recorded
  rather than forced;
- emits only the JSONL trace grammar below (no screenshots, no assets).

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
| `end` | last | `installHashVerifiedAfter: true` |

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
- ordered samples — label, source, bounds, and value, except that cosmetic
  `armour-debris-*` opcode rolls match on position and bounds only;
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

## What still blocks live capture

1. Approval to install an AVM1-capable player (Ruffle) — nothing may be
   downloaded without explicit sign-off.
2. Authoring and validating the wrapper movie against that player, including
   confirming `Object.watch` and function-wrap fidelity on the licensed
   timeline before any trace is trusted.
3. The first two controlled sessions per candidate, starting with
   `candidate-normal-threshold-hit`.

The 2v2 and then 3v3 cooperative campaign targets are unchanged: one shared
resolver, team elimination, AI fill, controller-independent combatants, and a
single campaign settlement after the final animation acknowledgement, as
recorded in [the roadmap](../roadmap.md).
