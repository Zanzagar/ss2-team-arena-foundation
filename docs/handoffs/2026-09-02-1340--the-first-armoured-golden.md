---
handoff:      2026-09-02-1340--the-first-armoured-golden
written:      2026-09-02 13:40 -0400
sessionStart: 2026-09-02 03:25 -0400
sessionId:    0ffa2c73-d813-44cc-aae2-2054fedc0e4c (https://claude.ai/code/session_01FgHQMpeP3mG6nJPSdwSyUC)
agentRuns:    wf_c9be17d6-243 enchantment damage      279 started / 58 returned  UNVERIFIED-PARTIAL
              wf_2d907743-453 weapon table            274 started / 56 returned  UNVERIFIED-PARTIAL
              wf_635358d6-fb0 the open list           247 started / 26 returned  UNVERIFIED-PARTIAL
              wf_37978a97-6b9 capture-window prep     302 started /  8 returned  UNVERIFIED-PARTIAL
              wf_876a1652-313 targeted verification    57 started / 57 returned  **VERIFIED**
              **All 29 investigators of the first four waves RETURNED; their
              VERIFIER phases died on a five-hour usage limit, 119 verdicts into
              1,069. That was a rule defect in this repository, not bad luck —
              see the fan-out section below. The fifth wave is the same work at
              the corrected scale and is the only one whose findings are
              attested.**
branch:       arena/champion-capture
commits:      9ce955a..f06f2d4 (18). NOTHING PUSHED — the branch tip on
              `github/arena/champion-capture` is still 9ce955a, so all 18 exist
              on one machine. `main` untouched at 362859a.
suite:        721 tests / 720 passed / 0 failed / 1 skipped (WSL, fresh-clone
              profile), from 693 at session start.
              **MEASURED at 13:40, not carried forward. Re-measure; never copy
              this line.**
environment:  WSL2, node v26.3.1, ~/projects/swords-and-sandals-2-multiplayer
supersedes:   2026-09-02-0007--the-wave-refuted-more-than-it-confirmed (ranked
              item 3 CLOSED, item 2 half-landed and half-decided-by-the-owner,
              item 1 re-measured and reframed)
---
# Handoff — the armoured family has a golden

## The one-sentence version

`golden-armoured-deflection-threshold-cleared` is promoted from two independent
captures, so the corpus has armour and `fightMode: "tournament"` for the first
time; ranked item 3 is closed; ranked item 2's arithmetic is in and its
application is a decision for you; and the machinery that produced all of it
had two rule defects that cost a five-hour usage limit between them.

## THE RESULT: the first armoured golden

`golden-armoured-deflection-threshold-cleared`, promoted through the pipeline's
own gate from `obs-onx1405-a1` and `obs-onx1521-a1` — launch nonces
`127-718809396` and `106-390589781`, seventeen minutes apart. They agree on
every measured field and differ only in identity, which is what two independent
captures of a deterministic scenario are supposed to produce.

**What the corpus gains is not one more of the same.** All 22 earlier goldens
carry `armourclass 0`, eight zero piece ids and `fightMode: "misc"`. This one
carries `armourclass 79`, `helmet 6`, `shoulderguard 1`, `gauntlet 1`,
`greaves 2` — and **`tournament`, the mode the game actually plays, which no
runtime observation in this project had ever recorded.**
`test/capture-campaign.test.js` predicted the moment in a comment ("the note
disappears by itself on the first successful tournament capture") and now
records that it arrived.

**The gate refused it first, correctly**, because the observations were
wrapper-staged and the schema could not record that. `provenance.staged` is now
a validated optional field whose ABSENCE is the claim that a scenario was
game-produced. The gate's own suggested fix could not be followed as written —
it named an import that is a cycle — so the grammar moved down to
`src/golden/staged-declaration.js`, a leaf both `observation.js` and
`run-1v1-fixture.js` can reach.

**And the new evidence immediately exposed a gap, which is why it was worth
having.** The replay harness cannot drive this golden: its villain scenario
carries twelve keys where the prisoner goldens carry fourteen, because the
candidate does not pin `min_damage`/`max_damage` — the villain never swings —
and the rule set requires a damage pair from every combatant. `REPLAY_UNDRIVABLE`
in `test/ss2-golden-resolver-replay.test.js` names it and is asserted in BOTH
directions. **It is not a skip list.** Closing it is a candidate-derivation
decision and must come FROM THE MAP: the raw trace does carry the numbers
(`min_damage` is in `DEFAULT_WATCH_FIELDS`), and fitting the candidate to the
capture is the move this repository refuses most consistently.

## CAPTURE IS NOT A SCARCE WINDOW ANY MORE — 14 SECONDS A ROUND

The head framed ranked item 1 as a supervised window to be spent carefully.
That was a cost estimate nobody re-measured after the protocol changed.
**1,353 rounds ran unattended, producing 1,320 divergence reports and the two
matches above.** Restore → `run-arena.ps1` → ingest is one command.

Two environment facts made it work, neither of which was written down, because
the 2026-09-01 session only ever ran `validate-vehicle.ps1` — which uses
`--save-directory` and so never touches the licensed store:

1. **Ruffle reads a different save store from the one `save-state.ps1`
   manages, and the guards watched the wrong one.** Ruffle resolves its profile
   through the Windows Known Folder API and ignores `$env:LOCALAPPDATA`, so it
   opened an empty store, minted a 267-byte save, and the route aborted at
   `new_or_continue` with `level: null`. Worse than the failure: `run-arena.ps1`'s
   snapshot guard and save tripwire both read `C:\ss2la`, so the run printed
   `UNCHANGED (byte-identical)` truthfully, about a file it never touched.
   **Fixed with a directory junction** so both paths are one store; see the head's
   § "Driving the capture pipeline FROM WSL".
2. **`campaign.mjs ingest-round` cannot run under WSL node and fails with a
   licence-integrity scare.** `DEFAULT_INSTALL_DIR` is a literal Windows path,
   so it is `ENOENT`, and the thrown message is "the installed build no longer
   matches the pinned fingerprint". Nothing is wrong with the build. Run ingest
   under Windows node.

**The measured yield, and what actually blocks it.** Over the first 150 rounds:
`attackDirection` 5 in 46, hero `staminaleft` 105 in 47, hero `hitpoints` intact
in 107, **villain `staminaleft` 105 in 5**. Direction is the only real draw and
its rate is exactly 1/4 by construction (`randomBetween(5,8)` at `+0x61f1`;
χ² 2.416 on 3 df over 243 rounds). Hero stamina is `110 − walk steps`, so
`105` is exactly "the approach took five steps" — **which is what "pin the
approach-step count" would fix, and it would fix two constraints at once.**
The villain's stamina is the binding one and is NOT settable by staging: it is
staged to 105 every round and walked down before arming.

► **A wave concluded the opposite and told me to act on it immediately.** It
  read the `"t":"end"` record's `staged:` string as the driver's staging INPUT;
  it is the CURRENT value. Measured on `session-ondc100`: `{"at":"staged"}`
  says 105, `{"t":"state"}` at arming says 97, the end record says 97. Its
  proposed 31× saving does not exist.

## TWO RULE DEFECTS IN OUR OWN MACHINERY, AND THEY COST THE NIGHT'S FIRST HALF

**1. The verifier wave had no cap, because a rule said it needed none.**
`docs/overnight-agent-plan.md` said "Adversarial verifiers have no such cap,
because they write nothing" — reasoning about FILE CONFLICTS, applied to a
question about COST — and `.claude/workflows/question-fanout-audit.js`
implemented it literally: one verifier per claim, unbounded. Measured: 29
investigators emitted **20 / 37 / 51 claims each, 1,069 total**, because the
schema asked for "each load-bearing claim" with no ceiling, so environment facts
became claims and *"the SWF sha256 was 77cb545c…"* got its own adversarial
verifier. Claims were also flattened in question order, so q1's fifty-one ate
the budget and the capture-prep wave returned **1 verdict of 295**.
**Fixed**: `maxItems: 6` with a definition of what a claim is NOT, round-robin
interleaving across questions, a `verifierBudget` defaulting to 24, and
`unverifiedClaims` returned even on success — a capped wave is complete-as-run,
never complete-as-asked. The recapped wave returned **57 of 57, VERIFIED**.

**2. `overnight-agent-plan.md` was never meant to be standing guidance.** It was
created 2026-08-30 as "a ready-to-run fan-out for an unattended session" — one
night, 80 lines, eight tracks. It accumulated measurements, kept its lessons
after those tracks closed, reached 427 lines, and **one line in `AGENTS.md`
promoted the whole of it to doctrine loaded by every agent.** Nobody decided
that. It now has an archive line: standing rules above, the August run history
below, and `AGENTS.md` cites only the part above.

## GIT AND GITHUB HYGIENE NOW EXISTS, AND DID NOT

Asked whether the harness specifies it. **It did not, and the shape of the
absence matters**: no git document, no git skill, and exactly one convention —
"the global *always push after commit* convention" — cited three times in the
harness as the reason for EXCLUDING `git-guardrails`, **and stated in no
document anywhere.** It was also the exact opposite of this project's own
"ask before pushing anything". Neither side knew.

`claude-harness/docs/git-hygiene.md` now states thirteen rules including the one
these repositories kept leaving unwritten — when a branch becomes ELIGIBLE to
merge — and `settings/git-hygiene.snippet.json` enforces them as
`permissions.deny`/`ask`. **This project has a checked-in `.claude/settings.json`
for the first time**, carrying those rules and the harness's credential guard,
which until now had been adopted by ZERO projects because no project had a file
to merge it into.

► **REPORTED, NOT FIXED: `.claude/settings.local.json` pre-approves
  `Bash(rm -rf *)`** — an unrestricted recursive delete, untracked and therefore
  never reviewed. A checked-in deny cannot override a local allow. It is the
  owner's file.

## SETTLED AFTER THE BRIEF WAS WRITTEN: the six-slot arena is asset-free

The owner asked whether expanding to 2v2/3v3 and a new progression system would
force us to alter licensed assets. **It does not.** A VERIFIED wave (6 questions,
24 verifiers, 30 of 30 returned) established it from the build; the detail is in
`docs/ss2-adapter-contract.md` § "Can a six-slot arena be rendered without
touching an asset?".

Short version: `hero_battle` (character 1241) is `ExportAssets`-exported with no
`SymbolClass`, no `DoABC`, no `registerClass` and therefore no instance cap —
and **vanilla already attaches it four times concurrently**. The depth band
`slot-layout.js` reserves is free, `duplicateMovieClip` is used zero times, and
every skinning and combat function is already free of `hero`/`villain` literals.
Four seams are hard-coded to two combatants (`death` routing, `cast_spell_icon`,
`getfightdistance`, the villain AI) and **all four are replaced by our own code,
not by art.**

**The boundary block in `AGENTS.md` was also rewritten this session, twice, at
the owner's instruction.** It had conflated three unrelated things under one
ethics heading; an independent agent confirmed the diagnosis — *"No document in
this repository prohibits authoring new art, UI, systems, screens, progression
or opponents. I found zero such rule."* What survives is two operational facts,
neither an ethics boundary: the installed SWF stays byte-identical because it is
the MEASUREMENT ORACLE (a modded build gets a second install and its own
fingerprint lane), and no SS2 asset ships, because the project is intended to be
SHARED non-commercially and a clone must still need its own licensed copy.

*(Two agents in that wave reported a premise failure worth keeping: I edited
`AGENTS.md` while the wave was running, so their briefs quoted a file that no
longer existed. Editing the thing a wave is auditing invalidates its brief.)*

## Highest-value work, ranked

1. **DECIDE WHETHER ENCHANTMENT DAMAGE IS APPLIED.** The arithmetic is in
   (`weapon_enchantment_damage`, `+0x320c`/`+0x3326`, mutation-checked). Applying
   it is not, because in the build the tick REPLACES the afflicted combatant's
   turn and the resolver has no channel for that. Same shape as the RNG-tape
   decision you took. The mechanism is fully mapped — battle map § "The
   enchantment effect is a SKIPPED TURN".
2. **Decide what a candidate must pin**, which unblocks `REPLAY_UNDRIVABLE` and
   is the only thing between the armoured golden and the resolver. FROM THE MAP.
3. **Pin the approach-step count** — one protocol change, two of the four
   capture constraints, and the arithmetic is above.
4. **The branches.** `arena/champion-capture` is 126 commits ahead of
   `github/main` and fast-forwards cleanly; `design/endless-progression` and
   `design/endless-progression-readiness` have ZERO unique commits and should be
   deleted; local `main` is one behind the remote. **18 commits are unpushed.**
5. **`COMBATANT_KEYS` schema question — unchanged and still yours.**

## Traps from this session

- **A TRUNCATING PIPE IS A FILTER.** I put a false claim in the repository by
  running `grep … | head -10`, which cut off forty lines before the only match
  that mattered, then read the absence of a match as the absence of a call.
  `overnight-agent-plan.md` already names this failure with `grep -v`. Same
  mistake, different pipe, made by the session that had read the rule that
  morning.
- **A LOG LINE THAT DESCRIBES AN INTENTION IS NOT EVIDENCE OF A BEHAVIOUR.**
  The head said all 38 armed `adc` rounds ran with NO autopilot, citing a
  `launcher.log` banner. Every one of those traces records the autopilot
  driving. The conclusion drawn from it — that the real measurement had never
  been taken — collapsed.
- **AN ORACLE THAT CANNOT FAIL LOOKS LIKE CORROBORATION.** The claim that the
  weapon table is runtime-corroborated is near-tautological: `battlevalues`
  derives both damage numbers from the same row and adds the same offset, so
  any honest record inverts back onto a table pair by construction. Measured
  false-match rate 6.1%; coverage 9 ids of 90. **The table stays map-derived.**
- **A GUARD BEHIND A GUARD READS AS COVERAGE.** `ss2-rules.js:784`'s stamina
  floor is dead code because `resources.js:252` re-clamps every write.
- **THE CORPUS CANNOT ALWAYS DEFEND ITSELF.** Mutating the new weapon-derivation
  to overwrite a supplied damage pair fails ONE test of 718; the golden replay
  never notices, because no golden carries a `weapon` id.
- **DENY RULES THAT BLOCK REAL WORK ARE WORSE THAN NONE.** My first drafts
  denied `git checkout main`, rebasing onto main, and pushing to the working
  branch — the last would have blocked a push you had authorised.

## Hard rules (unchanged)

- Licensed SWFs are read-only and hash-verified before and after every capture.
- Never shortcut the game's own frames.
- A candidate becomes golden ONLY via >=2 matching observations from >=2
  sessions. **Never hand-write a golden, observation or manifest.**
- **Derive candidates from the battle map** — and when you think the map is
  wrong, read the bytes before writing the code that says so.
- A rule set may never claim a tier it has not earned.
- `validate-vehicle.ps1` must PASS after ANY wrapper edit.
- Snapshot before every save-mutating run, AND before every restore.
- **Do not push to `main`. This project asks before EVERY push.**
- Adversarial verifiers write nothing at all.
- **Do NOT run `/codex:setup --enable-review-gate`.**
