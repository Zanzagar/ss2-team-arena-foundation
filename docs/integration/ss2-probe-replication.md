# What the probe corpus replicates, and what it does not

Status: the divergence corpus was regenerated 2026-08-30 from the archived raw
traces under the ignored `captures/` tree. Sixty-nine reports are committed
under `test/fixtures/ss2-1v1-divergences/`. Nothing in them is hand-authored:
every report is the return value of `buildSs2DivergenceReport` applied to an
observation that `ingestSs2CaptureTrace` produced from a raw trace and that
`matchSs2ObservationToFixture` found to disagree with its candidate.

This document exists because the reports were once deleted as "direction-lottery
noise", and because the audit that called for their return overstated what they
show. Both the deletion and the overstatement are corrected below.

Regenerate or verify with:

```text
node tools/runtime-capture/regenerate-divergences.mjs           # write the corpus
node tools/runtime-capture/regenerate-divergences.mjs --check   # verify, write nothing
```

The tool is deterministic and re-runnable: a second run over an unchanged
captures tree reports 69 unchanged and writes nothing.

## How the corpus was identified

Not by directory name and not by file name — both are operator-chosen. The tool
walks every `*.jsonl` under `captures/`, reads each trace's own `meta` line, and
keeps the ones whose `observationId` matches `obs-pr-<probe>-<round>` **and**
whose `<probe>` resolves to exactly one committed `candidate-probe-*` fixture. A
trace whose id has that shape but names no such fixture aborts the run rather
than being silently dropped.

That rule selects **89 traces in 89 sessions**, one round per session — the same
89 the audit read. Of those, 20 match their candidate and are the promotion
evidence already committed under `test/observations/ss2-1v1/`; the remaining
**69 diverge and are the corpus**. The rest of the tree is skipped: the band
captures (`session-pw*`, `session-qk*` and the lettered sessions), the
navigation, frame-rate and watch-field diagnostics, the two simulator dry runs,
and the stub-game vehicle checks.

`captures/` is a live working directory — `validate-vehicle.ps1` writes a fresh
`vehicle-check/stubcheck-*.jsonl` on every wrapper validation — so its total
file count moves and no total is pinned here. The 89 probe rounds do not move:
the campaign that produced them is finished. The tool scans until two
consecutive scans agree and aborts if they never do, because a `readdir` racing
a directory being written can silently omit entries, and a short corpus is the
exact failure this whole exercise exists to undo.

## Per-measurement replication

Each row is one probe *arm*. Sessions are independent capture rounds: one raw
trace, one session id, one player launch. "Directions" is the set of
`attack_direction` values the game actually drew across those rounds.

| Measurement | Arm | Sessions | Matching | Divergent | Directions | Draws |
| --- | --- | ---: | ---: | ---: | --- | ---: |
| `rollneeded`, quick band | `quick-rollneeded-miss` (roll 26) | 19 | 2 | 17 | 1, 2, 3, 4 | 2 |
| | `quick-rollneeded-hit` (roll 27) | 7 | 2 | 5 | 1, 2, 3 | 5 |
| `rollneeded`, normal band | `normal-rollneeded-miss` (roll 43) | 10 | 2 | 8 | 5, 6, 7, 8 | 3 |
| | `normal-rollneeded-hit` (roll 44) | 4 | 2 | 2 | 5, 6, 8 | 7 |
| `rollneeded`, power band | `power-rollneeded-miss` (roll 62) | 18 | 2 | 16 | 9, 10, 11, 12 | 2 |
| | `power-rollneeded-hit` (roll 63) | 7 | 2 | 5 | 9, 10, 11, 12 | 6 |
| Critical-deflection threshold | `deflection-threshold-cleared` (roll 100) | 6 | 2 | 4 | 5, 7, 8 | 7 |
| | `deflection-threshold-critical` (roll 99) | 4 | 2 | 2 | 5, 6, 7 | 7 |
| Armour-selection sample | `armour-removal-gate-below` (roll 66) | 12 | 2 | 10 | 5, 6, 7, 8 | 7 |
| | `armour-removal-gate-above` (roll 67) | **2** | 2 | **0** | **5 only** | 8 |

A measurement is a *contrast* between two arms, so what it replicates at is the
set of directions where **both** arms were observed:

| Measurement | Sessions (both arms) | Directions carrying both arms |
| --- | ---: | --- |
| `rollneeded` = 27, quick band | 26 | 1, 2, 3 (3 of 4) |
| `rollneeded` = 44, normal band | 14 | 5, 6, 8 (3 of 4) |
| `rollneeded` = 63, power band | 25 | 9, 10, 11, 12 (4 of 4) |
| Critical-deflection threshold = 100, inclusive | 10 | 5, 7 (2 of 4) |
| Armour-selection sample consumed before the equipped test | 14 | **5 only (1 of 4)** |

### The two unplanned findings

**A miss consumes only pre-dispatch draws.** The runtime does not short-circuit
on the hit roll: it takes the draws that precede the dispatch and then stops.
Draw counts are the strongest thing a capture observes (see below), and they
replicate exactly:

| Band | Draws on a miss | Sessions | Directions |
| --- | ---: | ---: | --- |
| normal (hit roll, damage roll, critical roll) | 3 | 10 | 5, 6, 7, 8 (4 of 4) |
| power (hit roll, critical roll) | 2 | 18 | 9, 10, 11, 12 (4 of 4) |
| quick (hit roll, critical roll) | 2 | 19 | 1, 2, 3, 4 (4 of 4) |

Every one of those 47 sessions recorded the same draw count for its band, and
every one recorded `defender-blocked` with an empty mutation trace.

**The quick band draws no knockback roll.** A quick hit takes 5 draws where a
power hit takes 6 and a normal hit takes 7; the missing one is the knockback
roll. Replicated across 7 quick-hit sessions at directions 1, 2, 3 against 7
power-hit sessions at 9, 10, 11, 12 and 4 normal-hit sessions at 5, 6, 8.

**This finding cannot distinguish the band from the direction range.** A quick
attack draws its direction from `randomBetween(1, 4)` and can never produce a
direction the knockback gate opens on, so "the quick band skips the knockback
draw" and "directions 1–4 skip the knockback draw" are the same statement given
this evidence. The corpus confirms the gate is closed for 1–4 and open for 5–12.
It does not say which of the two is the cause.

## What a divergence report proves

**All 69 reports carry exactly one difference, at `/scenario/attackDirection`.**
Zero reports carry a second difference. That single fact is the whole result,
and it is worth unpacking, because it is easy to read as either more or less
than it is.

`matchSs2ObservationToFixture` compares eight things: the build block, the
target fixture id, the scenario, the ordered samples, the ordered mutation
trace, the semantic events, the result event, and the final state projection. A
report lists every one of them that differed. So a report whose `differences`
array holds one entry at `/scenario/attackDirection` is a positive statement
about the other seven: **at the direction the game actually drew, with the same
injected tape, the build produced the same number of draws in the same
positions, the same hit-or-miss outcome, the same dispatched `defender_hurt`
method, the same ordered mutations, the same death and overlay events, and the
same final state that the candidate predicted for its own nominal direction.**

That is a genuine replication of the measurement at a direction the candidate
does not name — which is exactly why deleting these reports destroyed evidence.

### What it does not prove

The narrowing in `ss2-runtime-capture.md` under *What a match actually
establishes* applies unchanged, and a divergence report inherits all of it:

- **Roll values are echoed, not observed.** The wrapper serves the tape from a
  tap on `Math.random`, which takes no arguments, so each `roll` line's label,
  bounds, value and call site are copied from the candidate. What the corpus
  observes about the rolls is their **count** and their **position**. Every
  claim above about "the same draws" means the same *number* of draws.
- **`expected.calculation` is never compared.** `rollNeeded`, `chance`,
  `deflectionThreshold` and `deflectionRoll` are candidate assertions. The probe
  design is what makes them testable: the two arms of a pair differ in exactly
  one injected value and are predicted to differ in an observed channel, so the
  *contrast* between the arms is measured even though neither arm's arithmetic
  is. A divergence report on one arm strengthens that arm's half of the
  contrast; it never tests the arithmetic directly.
- **A report proves nothing about a direction it does not name.** The union of
  directions across all ten arms is 1–12, but no single measurement was observed
  at twelve directions, and none can be: each band draws only its own four.
- **"Independent session" is still two operator-supplied strings.** Nothing in
  the schema binds an observation to a distinct process. The one piece of
  evidence that does not come from the operator is `launchNonce`, minted inside
  the player; all 89 probe traces carry one and **all 89 are distinct**. That
  is a real signal of 89 distinct launches, but it is recorded in the raw trace,
  not in any committed report, so a reviewer holding only the repo cannot check
  it.

### "Matches a different direction's candidate" vs "contradicts the measurement"

These are the two ways a probe round can fail to match, and conflating them is
what got the corpus deleted.

**The direction lottery.** The game draws `attack_direction` inside overlay
frame 52 *before* the recording window opens, so which direction a round lands
on is not chosen by the operator and is not known until the trace is read. A
probe candidate names one direction. A round that lands on another produces
exactly one difference, at `/scenario/attackDirection`, and agrees everywhere
else. That is a lottery result. It is evidence *for* the measurement, taken at a
direction the candidate does not cover.

**A contradiction.** Any *second* difference — a different draw count, a
`defender-blocked` where `defender-hurt` was predicted, a `critical` dispatch
where `normal` was predicted, a different mutation or final state — is the round
disagreeing with the measurement itself. That must be read, not filed. Nothing
in this corpus is of that kind.

The distinction is asserted, not asserted-by-convention:
`test/ss2-divergence-corpus.test.js` fails if any probe report carries more than
one difference, or if that difference is anywhere but
`/scenario/attackDirection`.

**Direction is only orthogonal within a band.** The knockback gate turns on
directions 5–12, so a quick-band round that somehow drew direction 5 would take
an extra draw and would *not* be a lottery result. No round in the corpus
crosses a band boundary — every observed direction falls inside its arm's own
four — and the test asserts that too. Read as a caveat, this means the corpus
replicates each measurement across the directions *within* its band, never
across the gate.

## Over-draw assurance

`overdraw` is the count of draws the armed window made after the injected tape
ran out. Those draws are invisible in the trace itself, so the field is the only
record that none happened; ingest now requires it for `injected-tape-runtime`
traces and offers one escape hatch, `{ allowMissingOverdraw: true }`, for
archived evidence that predates the field. `regenerate-divergences.mjs` passes
that option unconditionally, because everything it reads is archived by
definition.

**Stated plainly: none of the 69 regenerated reports came from a trace without
over-draw assurance.** All 89 probe traces carry `"overdraw": 0` on their end
line, and all 89 carry a `launchNonce`. The 64 archived traces that lack
`overdraw` are all outside the probe corpus — they are the earlier band,
navigation and frame-rate captures. The escape hatch is therefore load-bearing
for the tool's contract and not for a single committed report.

## What weakens the claim

Recorded here because the audit that called for this regeneration overstated the
result, and the overstatement is now in `HANDOFF.md`.

1. **"Every measurement replicates across all twelve directions with zero
   exceptions" is not true, and no campaign could make it true.** Each melee
   band draws only its own four directions. The strongest per-measurement
   coverage in the corpus is 4 of 4 directions (the power-band `rollneeded`
   contrast); the union across all ten arms is 1–12, which is what the audit
   appears to have measured.
2. **The armour-selection measurement has no cross-direction replication at
   all.** `armour-removal-gate-above` ran twice, both at direction 5, and both
   matched — so it produced zero divergence reports. The contrast that measures
   "the armour-selection sample is consumed before the equipped test" therefore
   rests on 2 sessions at 1 direction on its above-the-gate side, against 12
   sessions at 4 directions below. It was already the weakest of the three
   planned measurements (`HANDOFF.md`: it confirms something the map asserts
   flatly, and the extra draw's label and position are echoed). Regeneration
   does not improve it. Two more above-the-gate rounds, ideally landing on
   directions 6–8, is the cheapest real strengthening available.
   `test/ss2-divergence-corpus.test.js` pins this arm by name so it cannot be
   forgotten.
3. **The critical-deflection threshold is next weakest**: 10 sessions, but only
   directions 5 and 7 carry both arms.
4. **The corpus is broad but shallow.** 69 reports across 10 arms sounds like 69
   independent facts. It is 5 measurements, replicated 1–4 directions deep each.
   Session count and information are not the same thing — the same warning
   `ss2-runtime-capture.md` gives about repeating a non-discriminating capture
   applies here.
5. **`observationDigest` is coupled to the ingest schema.** A divergence report
   digests the observation *as ingested against that report's fixture*. When
   ingest changes what a record carries, every digest in the corpus changes and
   the reports must be regenerated. That is what `--check` is for; treat a
   `--check` failure after an ingest change as expected work, not as corruption.
   Note the related trap this surfaced: two of the six pre-existing reports name
   a committed observation record whose digest differs from the report's, which
   is correct — those records were ingested against a *different* fixture, and an
   observation record is fixture-relative.
6. **One pre-existing report cannot be resolved from the repo at all.**
   `provisional-prisoner-kill--obs-20260830-t1-6bf4f120.json` names the fixture
   `provisional-prisoner-kill`, which is generated into the ignored `captures/`
   tree and was never committed. The report is kept — it is real evidence — but
   a reviewer holding only the repo cannot see what it diverged from.
