# SS2 controlled runtime-capture workflow

Status: capture, verification, and promotion landed 2026-08-30 and are fully
covered by tests. The loop now runs unattended end to end, and the whole
`prisoner-normal-kill` family — all four normal-band attack directions — is
promoted to runtime-observed goldens, each backed by two matching
observations from two independent sessions. Every other committed fixture is
still `classification: "candidate"`. This document is the operating procedure
for Stage 3 of [the roadmap](../roadmap.md): promoting static candidates to
runtime-observed goldens with repeated evidence from the licensed local build
in [`ss2-build-fingerprint.json`](ss2-build-fingerprint.json).

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
- `classicStyleRules` stays the injected placeholder rule set, with its
  formulas untouched, until a runtime-verified rule set is promoted into the
  shared team resolver's seam (`src/team/rule-set.js`). The seam exists now;
  nothing measured has been dropped into it, and the verified-claim gate
  refuses to let a rule set say otherwise without citing a promoted golden.

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

### Reading divergent traces

Injection is tape-positional: when the live action diverges from the
fixture's expected roll order, later injected labels attach to whatever call
happens to match the next tape entry's bounds, not to that call's semantic
role, and non-matching calls appear as `unexpected-N` with live values.
Interpret divergent raw traces by bounds and position, and treat injected
values on a divergent run as controlled experimental inputs, which they are.

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
regression test, and only then attempt promotion again. Divergences correct
the isolated candidate only; they never reach into `classicStyleRules` or the
shared team resolver.

## Campaign automation

A single session is one command; a whole candidate family is one loop. The
loop exists because the wrapper **observes** `attack_direction` rather than
forcing it. The direction is drawn inside the game before the recording
window opens — overlay frame 52 `DoAction@0x240c7f` assigns
`attack_direction = randomBetween(9, 12)` for a power attack (`+0x608a`),
`randomBetween(5, 8)` for a normal attack (`+0x61f1`) and
`randomBetween(1, 4)` for a quick attack (`+0x635c`), with fixed values for
the single-direction actions (bash 23 at `+0x64c3`, taunt 20 at `+0x6981`,
bombard 21 at `+0x6c67`, snipe 22 at `+0x6c8c`, grievous 30). Arming happens
later, at `attack_chances`, so that draw comes from the live RNG and is not
on the injected tape. Which candidate a run is evidence for is therefore not
known until the trace has been read.

```text
run-campaign.ps1  (loop, one Ruffle window at a time)
  -> run-capture.ps1 -SkipPipeline        one unattended session, raw log only
  -> campaign.mjs ingest-round            resolve, ingest, file the observation
  -> campaign.mjs settle                  build manifests, promote what qualifies
```

| File | Responsibility |
| --- | --- |
| `tools/runtime-capture/run-campaign.ps1` | the round loop: unique ids, sequential sessions, per-round ingest and settle, coverage summary |
| `tools/runtime-capture/campaign.mjs` | `plan` (coverage), `seed` (which tape a round injects), `ingest-round` (file one session), `settle` (promote what qualifies) |
| `tools/runtime-capture/build-manifest.mjs` | derive a capture manifest from the observation records it attests |

A **family** is the set of candidate fixtures whose ids share the prefix
`candidate-<family>` and differ only in `scenario.attackDirection` — the
candidates one staged scenario can produce. `ingest-round` ingests a session
against every member and keeps the one that MATCHES, so a run is only ever
filed as evidence for a candidate it agrees with in full; two matches would
mean the members are not mutually exclusive, and that is rejected as a
malformed family. When nothing matches, the run is a real divergence and the
report is written against the member for the direction the trace actually
recorded.

`seed` refuses to nominate a tape when a family's members disagree about
their injectable samples. Injection is tape-positional, so a mismatched tape
would feed one direction's rolls into another's call order and the trace
would be an experiment rather than evidence.

`build-manifest.mjs` copies every manifest field out of the validated
observation records and originates only `createdAt`. Rebuilding the
hand-written `test/manifests/prisoner-dir6.json` from its two observations
reproduces its canonical digest
(`889e099e00f67b66199f7fc0b23642feb603362725197d9721dcb69e0bcefd6c`), which
is the digest `golden-prisoner-normal-kill-dir6` already cites.

`-SkipPipeline` on `run-capture.ps1`/`launch-capture.ps1` leaves the raw log
for the campaign driver. Without it the launcher verifies against the one
fixture it was given and writes a divergence report every time the game chose
a different — equally valid — direction, burying real disagreements in noise.

Nothing in the loop weakens the promotion gate: observations come from
`ingestSs2CaptureTrace`, matching from `matchSs2ObservationToFixture`, and
promotion from the same `promoteSs2CandidateToGolden` two-observation,
two-session gate the CLI uses.

### Hero action vocabulary

`getphase(whatsdoing)` accepts only the labels defined by the controller
frame currently in scope, read statically from sprite 862 (read-only
inspection; nothing exported):

| Controller frame | Labels |
| --- | --- |
| 1 `initialise` | `rest`, `runleft`, `runright`, `frozen`, `burning`, `poisoned`, `life_stolen`, `swap_weapons` |
| 5 `longrange_warrior` | `taunt`, `rest`, `jumpleft`, `jumpright`, `walkleft`, `walkright`, `chargeleft`, `chargeright`, `psyche_up`, `wincrowd` |
| 13 `closerange_warrior` | `power_attack`, `normal_attack`, `quick_attack`, `shove`, `jumpleft`, `jumpright`, `walkleft`, `walkright`, `psyche_up`, `wincrowd` |
| 20 `longrange_archer` | `bombardleft`, `bombardright`, `snipeleft`, `sniperight`, `taunt`, `rest`, `jumpleft`, `jumpright`, `walkleft`, `walkright`, `psyche_up`, `wincrowd` |
| 28 `closerange_archer` | `bash_attack`, `shove`, `taunt`, `jumpleft`, `jumpright`, `walkright`, `psyche_up`, `wincrowd` |

This is why `walkright*5,normal_attack` works: the walks carry the hero from
long range (frame 5) into close range (frame 13), where the three melee
attacks live. `power_attack` and `quick_attack` sit on that same frame and
need no new staging, so the normal-band family has power-band and quick-band
siblings reachable with the same gladiator. The archer actions (`bombard*`,
`snipe*`, `bash_attack`) require the bow weapon mode, so they are gated on a
gladiator that owns a bow, not on the wrapper.

## What remains

The first goldens are in, so what is left is breadth, not feasibility. In
rough order of cost:

1. **Power and quick bands.** `power_attack` and `quick_attack` live on the
   same controller frame as `normal_attack` and need no new staging, but the
   directions they produce (9–12 and 1–4) have no candidate fixtures yet, and
   their roll orders differ from the normal band (`max_damage` with a 5–20
   critical sample; `min_damage` with a −20..20 sample). Author the
   candidates from the battle map first, then run the family through
   `run-campaign.ps1` exactly as the normal band was.
2. **Single-direction actions.** Bash (23), bombard (21), and snipe (22) are
   one fixture each rather than a family, but bombard/snipe/bash need the bow
   weapon mode, so they need a gladiator that owns a bow — a staging problem,
   not a tooling one.
3. **Richer scenarios.** Every golden so far comes from one staged pair (the
   tutorial prisoner against a level-1 gladiator with no armour). Armour,
   status flags, and non-lethal outcomes are all still candidate-only, and
   the armour-first and equality-quirk fixtures are the ones most worth
   confirming live.
4. **Out of scope by design.** Range taunts and other opcode-rolled paths
   make no `randomBetween` calls, so no wrapper can inject or record them.

Staging requirements per fixture are in
[the staging guide](ss2-capture-staging.md).

The 2v2 and then 3v3 cooperative campaign targets are unchanged: one shared
resolver, team elimination, AI fill, controller-independent combatants, and a
single campaign settlement after the final animation acknowledgement, as
recorded in [the roadmap](../roadmap.md).
