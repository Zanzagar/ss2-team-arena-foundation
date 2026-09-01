---
handoff:      2026-09-01-1637--armoured-family-measured-at-n38
written:      2026-09-01 16:37 -0400
sessionStart: 2026-09-01 15:52 -0400
sessionId:    6c06a03b-d328-49f3-b861-8c252cc507ce (https://claude.ai/code/session_01TFmcvHecCsXerxRGg9rKMd)
agentRuns:    wf_bec89df5-025 (armoured arming gate) — VERIFIED: 6/6 questions,
              18/18 write-nothing verifiers, 0 errors, 2.30 M subagent tokens.
              9 verdicts STANDS, 9 BROKEN. 61 load-bearing claims raised, 18
              verified, 43 dropped and logged by name (no silent cap).
              Plus direct byte re-derivation from the licensed SWF by the main
              session, and a full n=38 matcher run over the raw archive.
branch:       arena/champion-capture
commits:      c3bdc4c..<tip>   # run `git log --oneline -1`
suite:        630 tests / 629 passed / 0 failed / 1 skipped (WSL, fresh-clone profile)
environment:  WSL2, node v26.3.1, ~/projects/swords-and-sandals-2-multiplayer
supersedes:   2026-09-01-1550--codex-independence-and-the-corpus-archetype
---
# Handoff — the armoured family, measured at n=38, and why item 1 was the wrong first move

**Supersedes `2026-09-01-1550`. Its ranked item 1 — "run the armoured family
under the arming gate instead of `-ArenaCapture always`" — is RETRACTED, by
measurement, and the retraction is written into the LIVING HEAD at the
instruction rather than only here.** Everything else in that handoff stands.

I wrote none of the wrapper. Nothing was captured, no save was touched, no
Ruffle was launched, and nothing was ingested into the corpus. What changed is
the record.

## Where things stand

- Branch `arena/champion-capture`, **630 / 629 / 0 / 1**, unchanged by this
  session's edits (they are documentation).
- `HANDOFF.md`'s living head carries **eleven corrections**, each placed AT the
  instruction it corrects.
- **The armoured family is one field from evidence, and it is not the field the
  roadmap has been working on.**

## The one-paragraph version

All 38 armed `adc` traces were delogged (27 for the first time) and run through
the repository's own matcher against all 8 blocked fixtures. **35 of 38
reproduce the target fixture on every pinned, watched field except
`staminaleft`**, and 4 of 38 diverge on nothing else at all. `hero.staminaleft
== 110 − (walk count)` holds **38 of 38**, so the hero side is deterministic and
controllable and nobody has used that. The villain side is not merely unpinned —
**its action sequence is unobserved by construction**, because the wrapper hooks
`getphase`, which carries only the hero's actions, while the villain is
dispatched through `villaindecisionA`. And a gate keyed on the fixtures as
written would have armed **0 times in 38**.

## Why item 1 was wrong, in the order the cost was discovered

1. **The gate is proven only to REFUSE, never to ARM** — 931 evaluations across
   all four champion rufflelogs, zero `action-armed`.
2. **Its hero predicate contradicts all 8 fixtures.** It requires
   `hero.staminaleft == staminamax`; every fixture pins 105 of 110. A session
   that passes the gate can never match a fixture, and vice versa.
3. **A new branch there is DEAD CODE under `validate-vehicle.ps1`** — the gate
   passes no `-Pnavigate`, so `captureAllowedNow()` returns at line 2024, before
   the champion block at 2026. It would go green untested.
4. **The wrapper has no channel for a fixture's scenario.** This is a new
   FlashVar through three files, not "a one-line bypass".

**But read the 0/38 narrowly.** All 38 rounds ran with NO autopilot — a human
chose the arming moment. So 0/38 measures an ungated MANUAL protocol, not a
gate's yield. **The measurement that would settle it has never been taken: arm
on the hero's FIRST action of the staged bout.** `initbattle` assigns
`villain.staminaleft = villain.staminamax` unconditionally, so before the villain
has taken a phase the value IS determined.

## Ranked work, with the reason

1. **Add `helmet_defence` / `shoulderguard_defence` via `-WatchFields`.** Two of
   the eight fixtures — `removal-destroys-helmet` and `-shoulderguard` — REFUSE
   every one of the 38 traces at INGEST, not at comparison: *"the staged villain
   state is missing the required field `helmet_defence`"*. Two fixtures unblocked
   for the cost of one parameter, and `-WatchFields` is already the right
   mechanism. **Do NOT widen `DEFAULT_WATCH_FIELDS`.** Cheapest item on the list
   and nothing recorded it before now.
2. **Pin the approach-step count.** `hero.staminaleft = 110 − walks`, 38 of 38.
   Pinning walks removes the hero-side lottery outright. This is the "fix the
   capture, not the comparison" remedy the head has prescribed since 2026-08-31
   and which has never been implemented.
3. **Decide the SCHEMA question. ~~Decide the villain-stamina scenario
   question — 3 values per fixture and 0 recalculations.~~ SUPERSEDED THE SAME
   EVENING by a second VERIFIED wave (6/6 derivers, 18/18 verifiers, 7 BROKEN),
   which the owner authorised and which says the remedy CANNOT be expressed as a
   fixture edit. No fixture was changed.** `COMBATANT_KEYS`
   (`src/golden/run-1v1-fixture.js:91`) is a closed 42-key allow-list holding
   `staminaleft` and `staminamax` but NOT `stamina`, `speed`, `vitality` or
   `herolevel`: **the schema pins the output and refuses the input.** Adding
   `stamina` throws and fails 17 tests. A value-only edit passes 630/629/0/1 —
   but so does setting the same fields to **7**, which is impossible in the
   runtime, so the suite cannot tell a derived value from an arbitrary one.
   And the minimum stamina is not a constant: `stamina_min = 3M - 4` where
   `M = max(2*movement_speed, round(strength*3), round(charisma*2),
   round(magicka), 7)`, and the villain's `strength` is DRAWN 1..8. Full
   derivation, with offsets, in the head under § "DECIDED 2026-09-01 (evening)".
4. **Only then a gate — and only one an extended stub can exercise.** The
   technique is proven here once already: `stub-game.as:52-65` was extended with
   `ov.game_attacker`/`ov.game_defender` so the gate could see the attacker-side
   guard, and it then went red in both directions.

**Items 1–3 need no Ruffle, no save, and no supervised window.**

## Traps from this session

- **A CLAIM IN THE HEAD ALMOST STOPPED THE WHOLE MEASUREMENT.** "The archive is
  not reachable from Linux" / "not adjudicable from a WSL clone at all" is FALSE:
  `/mnt/c/ss2-capture/captures` reads normally from WSL — 240 entries, 1,603
  files. The distinction the wording missed is CLONE versus MACHINE. Struck at
  all three sites. **Check a stated impossibility before accepting it; two
  independent agents flagged this one before taking any number.**
- **THE ARCHIVE HAS ONE REACHABLE COPY, NOT THREE.** `D:` is not attached, and
  the retired OneDrive tree holds only a git bundle — which by construction
  cannot carry gitignored traces. 1,603 files, unreplicated. And the exposure
  inverts what the head assumes: the archive sits OUTSIDE the MSIX container, so
  an app reset does not touch it, while the smaller save store inside it would
  be lost. **Protecting the container does not protect the evidence.**
- **A VERIFIER WAS RIGHT TO DEMAND BYTES AND WRONG IN ITS CONCLUSION.** It
  refuted "charge is in the villain's action set" as having no byte evidence,
  which would have made option (b)'s minimum `stamina 2` rather than 20. The
  SWF settles it: `villainChooseAction` writes 25 labels including `chargeright`
  (`+0x0a18`) and `chargeleft` (`+0x0d07`), and charge costs
  `round(movement_speed*2)` (`+0x4214`). **Record the command, not the argument.**
  I re-derived the regen and cost opcodes myself rather than relaying either
  side.
- **9 of 18 verdicts came back BROKEN.** Several claims I found most compelling
  did not survive. A wave that breaks half its own load-bearing claims is
  working; one that breaks none has probably been told what to think.
- **`installHashVerifiedAfter` IS `null` IN ALL 38 TRACES.** Ingesting any of
  them today makes the tool run a LIVE hash check and stamp `true` — asserting a
  post-session check about sessions that ran days ago, with no committed record
  to carry the value forward from. Measure them in scratch; do not ingest without
  deciding that first.
- **THE 27 UNDELOGGED TRACES ADD NO MATCHABLE EVIDENCE**, which retires the 15:50
  handoff's ranked item 3. All four near-misses were already among the 11
  delogged. "3.5× more rounds than the repository can see" is true of traces and
  false of evidence.
- **`-Concurrency 2` DOES NOT APPLY TO THIS FAMILY, AND READING IT AS GENERAL IS
  DANGEROUS.** `run-arena.ps1` has no such parameter; `run-campaign.ps1` refuses
  `>1` for any navigator but `prisoner`; `-SaveDirectory` is passed only when
  `>1`. **So an armoured run gets NO save isolation and necessarily mutates the
  licensed save.**
- **The WSL repo cannot launch Ruffle** — `launch-capture.ps1:156` resolves
  `ruffle.exe` under `$projectRoot/.tools`, which exists only in the Windows tree
  at `C:\ss2-capture`. **That tree is 28 commits behind this one**, so a wrapper
  edit here does not reach the capture path until it is fetched. Its 38
  "modified" files are pure CRLF churn — verified by diffing content, not by
  reading `git status`.
- **`validate-vehicle.ps1`'s own PASS text overstates its blindness.** It claims
  it never enters the capture gate; it does, and two archived gate runs went RED
  on a capture-gate refusal. It is a working oracle for the first half of
  `captureAllowedNow()` and blind only from line 2024 on.
- **The load-bearing negative under the whole plan has no byte citation.** "The
  villain is never re-skinned, so `-StageVillain` is durable" appears only in
  `HANDOFF.md`, with no offset — while its hero half is fully cited. The archive
  supports it observationally (12 of 12 staged fields constant across 38 rounds)
  but that is not the same thing. Check it before spending another window on it.

## Hard rules

- Licensed SWFs are read-only and hash-verified before and after every capture.
  (Verified this session: `77cb545c…`, matching the pinned fingerprint.)
- Never shortcut the game's own frames.
- A candidate becomes golden ONLY via >=2 matching observations from >=2 sessions.
  **Never hand-write a golden, observation or manifest.**
- **Derive candidates from the battle map, never from a capture.** The observed
  villain stamina values in this handoff are diagnostics; **none of them is a
  value to write into a fixture.**
- `validate-vehicle.ps1` must PASS after ANY wrapper edit — and see above for
  what its PASS does and does not cover.
- Snapshot before every save-mutating run, AND before every restore.
- **Do not push to `main`. Ask before pushing anything.**
- Adversarial verifiers write nothing at all.
- **Do NOT run `/codex:setup --enable-review-gate`.**
