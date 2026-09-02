---
handoff:      2026-09-01-2112--the-project-became-playable
written:      2026-09-01 21:12 -0400
sessionStart: 2026-09-01 15:52 -0400
sessionId:    6c06a03b-d328-49f3-b861-8c252cc507ce (https://claude.ai/code/session_01TFmcvHecCsXerxRGg9rKMd)
agentRuns:    wf_bec89df5-025 (armoured arming gate) — VERIFIED 6/6 + 18/18, 0 errors, 9 BROKEN
              wf_ef6cc2c8-6b3 (villain-stamina re-derivation) — VERIFIED 6/6 + 18/18, 0 errors, 7 BROKEN
              wf_d6acd18c-884 (ss2-rules wiring spec) — VERIFIED 6/6 + 12/12, 0 errors, 12 BROKEN
              All verifiers write-nothing. Derivers for wf_ef6cc2c8 were forbidden
              from opening any capture; sources were the hash-verified SWF and the map.
branch:       arena/champion-capture
commits:      c3bdc4c..cfda417 (6 commits, all PUSHED)
suite:        646 tests / 645 passed / 0 failed / 1 skipped (WSL, fresh-clone profile)
environment:  WSL2, node v26.3.1, ~/projects/swords-and-sandals-2-multiplayer
supersedes:   2026-09-01-1550--codex-independence-and-the-corpus-archetype
---
# Handoff — the project became playable, and the corpus got a consumer

**Supersedes `2026-09-01-1550`, whose ranked items 1 and 3 are RETRACTED by
measurement.** Both retractions are in the LIVING HEAD at the instruction.

**The strategic finding, which outranks everything else here and came from the
owner asking "is this approach robust enough that the project survives":**
the verification machinery had become the project. 22 runtime-verified goldens
fed nothing, `defineTeamRuleSet` was called once outside tests from
`placeholder-rules.js`, there was no entry point and one npm script. Nothing had
ever been played. **That is now fixed at the root**, and the roadmap below is
about USE, not breadth.

## Where things stand

- `arena/champion-capture`, clean, **646 / 645 / 0 / 1**, all six commits PUSHED.
- `github/main` unchanged at `362859a`; still no PR.
- **`node tools/hotseat.mjs` plays a fight.** Two humans, one keyboard, to a
  winner. First playable thing in the project's history.
- Licensed SWF, live save and raw archive all hash-verified unchanged.
- **The raw archive is now verifiable and mirrored.** `captures/ARCHIVE-MANIFEST.sha256`
  is committed (the one non-ignored path under `captures/`); `D:` holds a
  hash-checked mirror (1,588/1,588) plus the snapshot store and Ruffle profile.
  The owner may keep `D:` disconnected — nothing reads it.

## Read first, in order

1. `HANDOFF.md` § "What to read, and what you may skip" — its first correction
   is the one that mattered most this session.
2. `HANDOFF.md` § "DECIDED 2026-09-01 (evening): the villain-stamina remedy
   needs a SCHEMA change".
3. `HANDOFF.md` § "Found 2026-09-01 (evening): the armoured family measured at
   n=38".
4. This file's Traps.

**Do not read `2026-09-01-1550`'s ranked list as current.**

## Highest-value work, ranked, with the reason

1. **WRITE `src/team/ss2-rules.js`.** The tier it needed now exists
   (`map-derived`, commit `cfda417`) and the arithmetic has existed for weeks
   (`src/golden/ss2-attack-candidate.js`, 597 lines). Wiring them makes the
   numbers on screen the GAME's numbers instead of invented ones, and gives the
   22 goldens their first consumer. A VERIFIED spec wave produced
   implementation-ready detail — re-read `wf_d6acd18c-884`'s transcripts rather
   than re-deriving. **Ranked first because everything else in the project gets
   its priority from this working.**

   Four obstacles it already named, none fatal:
   - the resolver's combatant cannot carry the arithmetic's inputs — 8 armour
     piece ids, `min_damage`/`max_damage`, `gladiator_dir` (a STRING, so it
     cannot be a resource), `equipped_weapon`, `character_level`, `herolevel`.
     Hot-seat can pass numerics through `resources`; the ADAPTER path cannot,
     because `CANONICAL_RESOURCE_SOURCES` (`state-bridge.js:153-178`) is closed.
   - attack DIRECTION cannot travel on an action: the resolver forwards only
     `type`, `targetId`, `spellKind` (`resolver.js:357-365`). Encode it in the
     type token — `quick-1`…`power-12` all satisfy the token regex.
   - `resolveSs2PhysicalAttackCandidate` MUTATES its scenario (its own docstring
     says so) and the resolver hands rule sets frozen views. Build a fresh
     scenario per call.
   - `legalActions` has NO existing arithmetic to delegate to — stamina cost,
     regeneration and gating must be written from the map. `rest` is required
     or a fight deadlocks at zero stamina.

   Good news, measured: the resolver's `rolls` object is already call-compatible
   with the arithmetic (`randomBetween`/`randomNumber`) — **no adapter needed** —
   and all 22 goldens replay through `createTeamBattle`/`applyAction` matching
   byte-for-byte.

2. **Re-aim the 22 goldens at the resolver path.** They currently test
   `src/golden/run-1v1-fixture.js`, a standalone replay that imports nothing from
   `src/team/` — i.e. **not the thing that would be the game.** Re-aiming makes
   the evidence do work for the first time. Note the honest limit: all 22 have
   `armourclass 0` and all piece ids 0, so they exercise one effect kind and give
   the armour-first split ZERO coverage.

3. **Add `helmet_defence`/`shoulderguard_defence` via `-WatchFields`.** Two of
   the eight blocked fixtures REFUSE every archived trace at INGEST, not at
   comparison. Two fixtures unblocked for one launcher parameter. **Do NOT widen
   `DEFAULT_WATCH_FIELDS`.**

4. **Pin the approach-step count.** `hero.staminaleft == 110 − walkcount` holds
   38 of 38, so the hero's value is deterministic and controllable — and unused.

5. ~~**The schema question, still the owner's.**~~ **DECIDED AND DEFERRED — do
   not reopen it without the trigger.** The owner delegated both standing
   questions; see `HANDOFF.md` § "DECIDED 2026-09-01 (evening): two questions
   this file kept re-asking" for the reasoning and the reopen trigger. Short
   version: it pays off only for a second opponent archetype, which is not on
   the path to a playable mod; the remedy may not work anyway, because three
   villain-selectable spells rewrite the caster's own stats mid-fight
   (byte-verified: `cast_swiftsandals` `speed = 10 + backup_speed*2`,
   `cast_colossus` `strength = backup_strength*3`, `cast_bloodlust`
   `+round(backup_strength*1.5)`); and playing `ss2-rules.js` will turn "which
   parity matters" from a guess into an observation.

## The branch, and why there is still no PR

**Decided, not overlooked.** The branch is 98 commits / 95 files /
+17,190 −2,398 ahead of `main`. **A PR that size is not reviewable, and opening
one would create the appearance of a review gate while providing none.**

What WAS blocking a clean merge is fixed: `main` had diverged, and merging it in
recovered content this branch was silently missing — `.mailmap`, two design
docs, README improvements our branch had never touched, and a HANDOFF section
that reached `main` via PR #2. **The branch is now a clean superset of `main`
and merges without conflict whenever the owner wants it.**

Recommendation in the head: keep working on the branch until `ss2-rules.js`
lands, then merge it wholesale as one foundation merge that says plainly it was
not reviewed commit-by-commit. Splitting it into reviewable PRs is real work
that buys review of code already green and already in use.

## Traps from this session

- **THE MACHINERY CAN BECOME THE PROJECT, AND IT DID.** Months of excellent
  verification produced 22 goldens that fed nothing and a resolver running
  invented formulas. The head's own note — "the corpus is an asset nothing
  consumes, and breadth is buying less than use would" — had been ranked LAST
  every session since it was written. **When a true observation keeps getting
  ranked last, that ranking is the finding.**
- **A GREEN SUITE IS NOT VALIDATION WHEN THE SUITE CANNOT SEE THE QUANTITY.**
  The value-only fixture edit passes 630/629/0/1 — and so does the same edit
  with the value `7`, which the runtime can never produce. Ask what the suite
  would have to be blind to for it to be green anyway.
- **A HAND-MIRRORED ENUM BREAKS ONLY AT SETTLEMENT.** Adding a tier to
  `RuleSetVerification` and not to `RecordedRuleSetVerification` leaves the whole
  638-test suite green and throws after a real fight is fought. Zero tests pinned
  the membership. Mutation-check a guard rather than trusting a green run.
- **`powershell.exe` DRIVEN FROM WSL INHERITS A CWD INSIDE THE REPO.** A stray
  `Copy-Item … -Destination $null` overwrote the root `README.md`. Caught by
  reading `git status` before committing. **Explicit `git add` paths did not
  protect me; reading the working tree did.**
- **A STATED IMPOSSIBILITY IN THE HEAD NEARLY STOPPED THE SESSION'S CENTRAL
  MEASUREMENT** ("the archive is not reachable from Linux" — it is), and then I
  over-corrected in the other direction ("one reachable copy" — `D:` was
  unplugged, not gone). **State reachability and existence separately.**
- **TWO BUGS SHOWED UP ONLY BY PLAYING.** `seatOf` returns a string not an
  object; readline against a closed pipe ate one line of eight and died on an
  unsettled await. Neither would have surfaced in a unit test.
- **PREFER THE Edit TOOL TO BASH FOR FILES ALREADY IN CONTEXT.** Patching via
  `python3` heredoc makes the harness echo the ENTIRE file back as a
  changed-on-disk notice — several thousand tokens each, four times this session.
- **28 of 48 verdicts across three waves came back BROKEN**, many against claims
  I found persuasive. A wave that breaks half its load-bearing claims is working.

## Hard rules

- Licensed SWFs are read-only and hash-verified before and after every capture.
- Never shortcut the game's own frames.
- A candidate becomes golden ONLY via >=2 matching observations from >=2 sessions.
  **Never hand-write a golden, observation or manifest.**
- **Derive candidates from the battle map, never from a capture.** Every observed
  stamina number in the head is a diagnostic, **not** a value to write anywhere.
- **A rule set may never claim a tier it has not earned.** `map-derived` declares
  `runtimeVerified: false`, pins the build hash, and cites map sections AND
  goldens. The hot-seat banner prints the tier on every run; keep it there.
- `validate-vehicle.ps1` must PASS after ANY wrapper edit — and read the head for
  the branch its PASS cannot reach.
- Snapshot before every save-mutating run, AND before every restore.
- **Do not push to `main`. Ask before pushing anything.**
- Adversarial verifiers write nothing at all.
- **Do NOT run `/codex:setup --enable-review-gate`.**
