# Transfer handoff — Swords & Sandals II Multiplayer Foundation

**This file is the accumulated STATE of the project. The brief for a single
session lives in [`docs/handoffs/`](docs/handoffs/README.md), stamped
`YYYY-MM-DD-HHMM--slug`.** Starting a session should cost one sentence — "read
the latest handoff in `docs/handoffs/` and proceed" — with this file as the state
it points at. A handoff must not restate what is here; if the two ever disagree,
THIS file is right and the handoff was frozen at the end of its session. Latest:
[2026-08-31 14:43 — nonce gate, stat arithmetic, toolchain](docs/handoffs/2026-08-31-1443--nonce-gate-stat-arithmetic-toolchain.md).

## READ THIS FIRST — corrections from the 2026-08-31 audit pass

A 13-agent write-nothing audit checked EVERY hand-authored scalar in all 60
candidates against a byte-level derivation. **Roughly 3,300 scalars derive
cleanly with no free parameter; 60 do not.** The corpus is about 98% sound, and
four claims below this line are now WRONG. They are corrected here rather than
edited away, because each was load-bearing.

**Baseline is 620 tests, 0 failed, 0 skipped** (614 at the end of the audit pass,
617 by the end of that session — a number this file was never updated with, so
every "614" below it was stale on the day it was written; 620 after `2b123b9`.
Was 603 before the audit pass; the "602" written below was already stale when
written — `20197f2`'s own message says 603). `github/main` is **`4409ec7`**, not `e3f14aa`: PR #2
(`design/endless-progression-readiness`) merged after this file was last touched.
No PR is open for `arena/champion-capture`. `gh` is NOT installed on this machine;
check PR state with `git ls-remote github "refs/pull/*/head"`.

► **THE "IMPOSSIBLE" FIXTURES ARE REACHABLE. This is the correction that changes
  the roadmap.** This file has said no tool path can change hero `attack` or
  `defence` — "not `-StageHero`, not the shop, not levelling" — and on that basis
  22 fixtures were written off. **The third clause is false.** Root frame 227
  (`levelup`) places character 2265, carrying eight `+` buttons, one per base
  stat, each with the identical body behind a `statpoints > 0` guard:
  `1596` strength, `1600` speed, **`1602` attack**, **`2252` defence**,
  `2253` vitality, `1608` charisma, `2254` stamina, `2264` magicka. No per-stat
  cap, no exclusion. And the writes PERSIST: `constructDNA` reads `hero.attack` at
  `+0x1e1b` and `hero.defence` at `+0x1e36` into `charDNA`; `initcharacter`
  restores them from DNA indices 18 and 19; button 2283 calls `backup_char` and
  `restore_char`, both ending in `constructDNA`. So a spent point survives the
  per-turn re-skin that discards every `-StageHero` write. Entry is ordinary play
  — `gotoAndPlay("levelup")` has exactly ONE site in the build, on button 775 of
  the reward overlay. The wrapper spends all four points into `vitality` BY POLICY
  (it replicates button 2253 verbatim), to keep sessions comparable. **That is a
  choice, not a limit.** Verified independently by the main session with
  `inspect-swf --references 'statpoints'`. Detail is in `ss2-battle-map.md`.

  Still to do: the arithmetic of which exact stat vectors are hittable under "four
  points per level, all four must be spent" (GATE C will not release the level-up
  screen until `statpoints` reads 0). Note also that the impossible-hero set is
  better identified by `attack 11 / defence 11` (15 fixtures) than by the
  strength/damage signature this file uses, which catches only 14 and misses
  `candidate-grievous-knockback`; and the `attack 3 / defence 2` duel pair was
  never counted at all.

► **THE TRANSCRIPTION IS FIVE FIXTURES, NOT THE WHOLE CORPUS.** A digest detector
  flags 23 candidates; only FIVE are transcriptions. **Digest equality between a
  candidate and an observation is the signature of a CORRECT PREDICTION, not of a
  copy** — when a map-derived candidate is right, the confirming observation has an
  identical scenario and tape by definition. The discriminator is lineage, not
  identity. Relabelling the other eighteen would have installed eighteen false
  provenance claims and made ten probe goldens permanently unpromotable. The five,
  each with the commit that landed fixture and record together:
  `candidate-prisoner-normal-kill` ← `obs-20260830-t1` (`135f211`),
  `-dir8` ← `obs-20260830-u1` (`5f45627`), `-dir6` ← `obs-diag` (`19aead3`),
  `-dir5` ← `obs-nav6` (`5317cec`), and
  `candidate-duel-firstblood-normal-kill` ← `obs-20260830-e1` (`74a07a4`).

  **Four goldens counted their candidate's own source record as one of their two
  "independent" observations.** `135f211` says so in plain words and draws the
  opposite conclusion. That is now REFUSED (`7856e2b`, `141e98a`). The four are
  NOT yet re-promoted; the eligible records are committed and named in `7856e2b`.
  What is NOT in question: the goldens' measurements. The game really does produce
  those outcomes. What was broken is the provenance argument, and for four of them
  the independence of the pair.

► **THE PRESCRIBED `staminaleft` FIX IS DEAD. Do not write it.** Its premise —
  that `staminaleft` is inert — is false: the map has it gating which attack
  buttons exist, forcing the rest phase, and steering the villain AI. Separately,
  an auditor promoted a golden from two records disagreeing by **99,992 stamina**
  with the new pairwise gate installed and silent, because this repository's only
  existing exclusion (`comparableSamples`) is PROJECTION-side, and a
  projection-side exclusion silences the gate. The sound path is to **fix the
  capture, not the comparison**: pin the approach-step count so the value is
  deterministic, turning a silent non-match into a visible refusal. That needs a
  wrapper edit and supervised rounds. And do NOT "restore" 105 to 110 — 105 is a
  TRUE description of that route; the defect is that the fixture pins a quantity
  the scenario does not determine.

► **THE PAIRWISE GATE'S DORMANCY IS SETTLED — run
  `node tools/pairwise-gate-dormancy.mjs`, do not read the next two paragraphs
  as current.** The gate HAS TEETH (407 free leaves it alone refuses, all at
  `/samples/*/callSite`) and on committed evidence it still refuses NOTHING,
  because the nonce check refuses every forgery about forty lines earlier. Both
  facts, and what they do and do not license, are in the block at
  "The pairwise gate: what the 2026-08-31 measurement settled" below. **The
  "162" retraction in this bullet is itself wrong: 162 reproduces exactly.**

  *The original bullet is kept below because it was load-bearing.*

► **THE PAIRWISE GATE'S DORMANCY NUMBERS ARE WRONG, and the gate is weaker than
  recorded.** **Both numbers in this bullet are wrong — see the note below it.**
  **And the correction is wrong too: see the settled block below.**
  "162 leaves" is a full-record count, not the comparison projection's
  (142); over the surface it names at least 10 leaves can differ, not 0, and 2 of
  them MUST differ in every legitimate promotion. The gate is LOGICALLY unable to
  fire on the promotion path. **The largest hole in the pipeline is now this: two
  fabricated observations that are copies of EACH OTHER still promote a new
  golden.** Before any field exclusion ever lands, make
  `projectSs2ObservationForComparison` structurally incapable of sharing an
  exclusion with the matcher.

  **Both halves of that were done on 2026-08-31.** The projection split landed in
  `f2a57c4`. The copy hole is closed in `2b123b9`, and closing it needed
  something the paragraph above did not see: **no pairwise comparison could ever
  have caught it**, because copies agree, and agreement is what that gate checks
  for. It went through the nonce instead. `cc42503` had already made
  `launchNonce` mandatory at INGEST, but the promotion gate bound only the
  records that HAPPENED to carry one — so deleting the key from the copy walked
  past it, which was demonstrated end to end against the committed corpus. Absence
  is now enumerated: `src/golden/pre-nonce-observations.js` names by digest the 58
  records that predate the field, the list may only ever shrink, and three tests
  audit it. **What is still open, and is smaller than what was closed: a forger
  who MINTS A FRESH NONCE for the copy is refused by none of this.** A nonce off
  the wrapper is unverifiable text; no repository-side check distinguishes one the
  player minted from one a person typed.

Also corrected this pass: three circular warrants in the staging docs — including
`capture-staging.md:318`, which attributed the villain's `100→95` to the HERO's
five walks, when `+0x32a1..+0x3304` mutate `game_attacker.staminaleft` ONLY, so
that derivation was impossible — and five wrong rows in the `staminacost` table,
notably `rest`, which is `0 - round(stamina*15)`, a GAIN, not 0.

Not yet done, in priority order (the projection/exclusion hazard and the copy
hole that led this list are both closed — see the paragraph above): re-promote
the four goldens from eligible records (pipeline only, never by hand); correct the
CONTRADICTED scalars in non-promoted fixtures (7 of 9 misc-a carry a
strength/damage triple no weapon row in the build produces; two pin an enchantment
potency of 5 against a cap of 3; spell `damageMethod: null` for ids 31/32/35 where
the bytes pass `"burning"` and `"lightning"`; villain blocks omit `<piece>_defence`
fields `battlevalues` rewrites every phase); the stub rewrite (**only 4 of 15**
hook slots can change the vehicle gate's PASS/FAIL, and every `dbg` line —
including every `wrapped:`, `capture-refused-*` and `attacker-resolved-*` — is
stripped before the match); and the attacker identity, whose record field is
written 16 lines before the game is loaded.

## State at the end of the 2026-08-31 session

22 promoted goldens and **no runtime evidence yet for the champion, armoured or
tournament families**. **620 tests, all passing, 0 skipped** (this paragraph said 602, then 614; see the corrections block above) in a capture-bearing
worktree.

The 2026-08-30 session landed 38 commits (`1d829c7..2d70738`); the previous
handoff said 36. PR #1 and PR #2 have since merged — `github/main` is `4409ec7`, whose
history includes `ecf4510` — and the 2026-08-31 session added the commits on
`arena/champion-capture`.

### Expected test profiles

- A capture-bearing operator worktree with the complete ignored raw-trace
  archive runs all **620 tests: 620 passed, 0 skipped, 0 failed**.
- A fresh clone or worktree with none of those ignored traces runs **620 tests:
  619 passed, 1 skipped, 0 failed**. The skipped test is the raw-trace archive
  existence check; the committed observation and divergence integrity checks
  still run.
- A partial raw-trace archive does **not** skip: it fails and names every
  missing expected trace.

**Both profiles were MEASURED at `2b123b9`, not derived from the previous
numbers** — the second one in a detached worktree holding only committed content,
which is the fresh-clone condition. Worth doing rather than adding 3 to the old
figures: the last four sessions each carried the previous session's count forward
untouched, which is how "614" survived in three places after the suite had reached
617.

**The skip is now anchored, and this is the part that changed.** It used to skip
whenever zero expected traces resolved, and a count of successful lookups cannot
tell "fresh clone" from "the path derivation is broken" — three one-character
edits each made it skip silently on a machine holding the complete archive, and
the resulting run was byte-identical to the fresh-clone profile documented
above. It now requires a POSITIVE anchor: `captures/README.md` is the one path
`git ls-files captures` returns, so it exists in a fresh clone AND on an
operator machine. If it does not resolve, the derivation is wrong and the test
FAILS naming it, instead of skipping.

So a skip no longer needs a human to check which kind of machine they are on.

Read this section, then [`docs/overnight-agent-plan.md`](docs/overnight-agent-plan.md)
for how the parallel work is organised.

### What changed at the level of what this project can do

1. **Parallel capture works.** `-SaveDirectory` was never broken. Three
   concurrent sessions complete in 22s against ~45s serial, all matching
   promoted goldens, master save byte-identical.
2. **The leveled-gladiator arena route runs end to end.** A gladiator was taken
   1 → 4 and fought the tournament ladder to rank 2 in five of six attempts.
3. **The wrapper can stage a scenario and buy equipment**, both owner-approved,
   both declared in the evidence.
4. **The champion's numbers were derived with no free parameter, from formulas
   committed a day before the champion was ever met.** `unleash_hell`'s
   hard-coded DNA, read through `initcharacter` and `battlevalues`, gives
   `hitpointsmax` 110 and `armourclass` 86, and thirteen live draws recorded
   exactly those. Five `candidate-champion-*` fixtures exist.

   **The previous version of this file said the champion was "decoded from the
   map before it was ever seen" and that the reading "PREDICTED" those numbers.
   That is not what the record shows, and the overstatement was mine.** It is
   corrected here rather than quietly fixed because it was load-bearing: it was
   the stated reason to trust the champion family, in the document a new session
   reads first, on a project whose whole discipline is that a candidate fitted
   to a known answer makes its own confirmation meaningless.

   The chronology, established by an auditor and then checked independently:

   - `6dc750e` (2026-08-29 23:57) already carried every term needed —
     `hitpointsmax = herolevel * 10 + vitality * 20`, the per-piece armour
     multipliers, and decisively the `helmet > 25` branch — at
     `docs/integration/ss2-battle-map.md:131-134`, in a file that contains no
     champion.
   - The thirteen draws ran 2026-08-30 21:31 to 22:06.
   - `ss2-champion-dna.md`'s only commit before today, `5d3d777`, is
     2026-08-30 22:48 — **42 minutes after the last draw.**

   So the FORMULAS were effectively pre-registered, some 21 hours before the
   opponent existed in this project. The DNA INDEX MAP was written afterwards.
   That map has no fitting freedom to exploit — 50 strictly sequential
   `characterDNA[n]` assignments, re-derived mechanically from the opcode stream
   and matching the published table offset for offset — but "written afterwards"
   and "predicted" are different claims, and only the first one is true.

   The pre-registration is the stronger argument anyway, and the old wording
   omitted it entirely. Without the `helmet > 25` branch the same arithmetic
   gives `armourclass` 1081 rather than 86, so that branch is exactly the
   constant a back-fit would have had to invent — and it was in the repository a
   day early. [`ss2-champion-dna.md`](docs/integration/ss2-champion-dna.md) now
   states this as a postdiction in its own text, and says it must not be
   restated as a forward prediction.

### The single most important correction

**Five separate adversarial passes each found the same defect class — a test
whose assertion cannot fail — and each one had been hiding a real bug.** That is
now the project's most reliable signal, and the reason to keep running
write-nothing auditors against named claims.

Two forgeries against the promotion gate worked *by the documented pipeline*
and are now closed:

- **The launch-nonce gate was opt-out.** Copy a raw trace, change the ids,
  delete the nonce key: both ingest, both promote, and you get a golden claiming
  two independent sessions from one capture. Now mandatory for
  `injected-tape-runtime` on the same terms as `overdraw`.
- **An observation could carry unlimited invisible draws.** Cosmetic opcode
  rolls are excluded from matching by label regex on *both* sides, so a record
  with 120 fabricated debris rolls matched a 7-sample fixture. Records now
  refuse opcode samples outright — the doc's own reasoning (no instrumentation
  can observe the opcode stream) is exactly why no record should hold one.

**The 22 goldens are sound.** Independent re-derivation reproduced every one
byte-for-byte; manifests, digests and cited observations all resolve.

---

## What is running, and how to run it

| Script | Purpose | Guards |
| --- | --- | --- |
| `run-campaign.ps1 -Concurrency N` | capture families in parallel | refuses `N>1` for any navigator but `prisoner` |
| `run-arena.ps1` | the save-mutating arena route | refuses to start without a fresh snapshot, takes it itself, hashes before/after |
| `launch-capture.ps1` | one session; the ONLY script with both `-WatchFields` and `-Stage*` | **no snapshot guard** — see Open items |
| `validate-vehicle.ps1` | wrapper gate after any edit | prints the source hash it compiled, and what it does not prove |
| `save-state.ps1` | snapshot/restore | refuses an empty tree, and refuses to restore a WIPED save |

Snapshots: **`level4-vitality-tournament-gate`** (vitality 13, 5723 gold,
`current_tournament` 1 — `hitpointsmax` reads 220 in the level-up log because
`battlevalues` last ran pre-spend; the formula gives 300) and
**`level4-armed-weapon39`** (the same gladiator after a shop trip: weapon 39,
843,130 gold, strength and speed 60). `verified-good-1701` and `pre-arena-path`
are the original level-1 gladiator.

**`zainger-repaired` is a WIPED save under a reassuring name.** `save-state.ps1`
now refuses to restore it without `-Force`.

---

## Non-negotiable rules (each learned the hard way)

- Licensed SWFs are read-only and hash-verified before and after every capture.
  Never copy, export or commit game assets or extracted scripts.
- **Never shortcut the game's own frames.** Jumping past the prologue tripped
  the game's own validation screen.
- A candidate becomes golden ONLY via >=2 matching observations from >=2
  sessions. Never hand-write a golden, observation or manifest.
- **Derive candidates from the battle map, never from a capture.**
- `validate-vehicle.ps1` must PASS after ANY wrapper edit — but see below for
  what that does and does not mean.
- Snapshot before every save-mutating run. `run-arena.ps1` does it for you.
- Use `git commit -F <file>` for any message containing quotes.

### AVM1 has ONE comparison opcode

`>` is `<` with operands swapped; `>=` and `<=` are `<` negated. Every
comparison with NaN is false, so **both negated forms return TRUE for NaN**, and
every field the wrapper reads is undefined until the frame that initialises it.
This caused **three separate live defects in one day**, including one that
rewrote the gladiator's gold. The only safe shape is un-negated `<`, twice:
`(n < 1) || (0 < n)`. Use `isNum()`.

### `validate-vehicle.ps1` proves less than its name suggests

Audited: it catches **0 of the 6 defects found live on this route**, `isNum` has
**zero reachable call sites** in a stub run, and a one-line revert of `isNum`'s
body leaves the gate green while restoring the demonstrated save-corruption bug
verbatim. Save corruption is outside its observable universe by construction —
it compares a trace to a fixture, never a save. It now says so in its own PASS
output and names the wrapper source hash it compiled.

---

## Next steps, in order

1. ~~**The champion family cannot be captured, and the fixtures must be
   re-derived.**~~ **RETRACTED 2026-08-31 (`2d0b077`). ALL THREE ARITHMETIC
   BLOCKS BELOW ARE FALSE. Do not act on this item; capture the armoured family
   instead (item 2).**

   This was the file's top-ranked next step while the corrections block at the
   head of the same file already called its first premise false. A session that
   read the list and not the block would have spent a window re-deriving five
   fixtures that are capturable as written. **A retraction at the top of a file
   does not reach a reader who starts at the section that tells them what to do:
   retract AT THE INSTRUCTION, not only above it.**

   The three blocks, and what each is refuted by — run
   `node tools/stat-vector-reachability.mjs` for the current answer:

   - ~~"no tool path can change `attack`/`defence` — not levelling"~~ **False.**
     Root frame 227's level-up panel carries one `+` button per base stat,
     `attack` (1602) and `defence` (2252) included, and `constructDNA` persists
     them. Corrected in the block at the head of this file.
   - ~~"`hitpointsmax` 250 … no reachable (herolevel, vitality) pair"~~ **False.**
     `L=11, vitality 7` gives `110 + 140 = 250`. Six further odd levels also work.
   - ~~"`staminamax` 150 needs `stamina` 5. Nothing in the tooling writes
     `stamina`"~~ **False.** `stamina` is an ordinary level-up stat, button 2254.

   The champion family is reachable at `herolevel 11` (vitality 7, speed 7,
   stamina 5, weapon 24). It is NOT the cheapest target — weapon 24 costs 4542
   against a 2500 start, so it needs won purses. See
   `docs/integration/ss2-battle-map.md` § "The reachability arithmetic, done".

   **The byte answer to why staged hero fields die** — the question runbook §2A.5
   left open, and it is not the `experience` hypothesis. Overlay frame 1
   (`initialise`) re-runs once per turn and calls
   `skincharacter(_root.game.hero, this.hero)` → `initcharacter(hero, avatar,
   hero.charDNA)`, which rewrites all 40+ DNA fields, then `battlevalues`. The
   villain is never re-skinned there — which is exactly why `-StageVillain`
   survives to arming and `-StageHero` does not. **Nothing in the build derives
   `herolevel` from `experience`**, so the runbook's `experience:0` story was a
   coincidence: the staged run's experience sits inside the unstaged
   distribution, and nothing was suppressed. Battle-time `-StageHero` is a
   one-turn write on the hero and a durable write on the villain.

   **The "arrive empty" idea for the stamina gate is also wrong** and should not
   be tried: overlay frame 62 refills the hero's stamina AND hitpoints on every
   won bout, so a hero arriving at the rank-1 bout already has a full bar. The
   only remaining stamina risk is the number of walk actions before the first
   `checkattackroll`.

   Do NOT edit the staging string to fit. Re-derive the family's hero from the
   gladiator the project actually has — `attack` 1, `defence` 1, `magicka` 1,
   `charisma` 1, `stamina` 1, `vitality` 1 + 4 per level — and recompute the
   chance, roll and damage chain from that. The champion OPPONENT is unaffected:
   `hitpointsmax` 110 and `armourclass` 86 are hard-coded DNA and were confirmed
   again live (fifteen sightings).

2. **Capture `candidate-armoured-*` (5) and `candidate-tournament-*` (3).**
   Both reachable with the tooling as it stands, and neither needs the
   tournament ladder, so neither carries the level/stamina problem above.
   `campaign.mjs watch-fields --family <f>` prints what each needs — note the
   armoured family does NOT agree on one watch list, so it must be run one
   member at a time. Staged armour IS honoured (`damagecharacter` reads the live
   reference at roll time); staged `hitpoints` is NOT (`check_stats` clamps it
   every phase transition). **This is now the cheapest real evidence available
   and should probably come first.**

3. **The spell family (8) is still blocked** — the hook fix was necessary but
   not sufficient. See below.

`campaign.mjs plan --family <f>` names blocking reasons derived from the
repository, and [`ss2-staging-runbook.md`](docs/integration/ss2-staging-runbook.md)
has per-fixture commands.

---

## Open items

### Found 2026-08-31, not yet closed

The blocks below are in reverse order of discovery. Read this list first; the
ones that change what the next session should DO are marked ►.

► **THE FRESH-NONCE RESIDUAL IS WORSE THAN RECORDED: it also unlocks the
  authored-from gate, and all four self-citing goldens are re-promotable from
  the very records they were transcribed from.** Found 2026-08-31 by an
  adversarial pass driving the real promotion entry point, then reproduced
  independently by the main session: 4 of 4.

  The gate compares `observation.observationId` to
  `candidate.provenance.authoredFrom` as a **string**, and `observationId` is
  both invisible to the matcher and excluded from the pairwise projection. So
  renaming the authored-from record walks straight past it.

  **The rename alone is NOT enough, and the composition is the finding.** A
  rename re-digests, which drops the record out of the pre-nonce digest waiver,
  and the nonce check refuses it — verified, 4 of 4 refused. Mint a fresh nonce
  as well and all four PROMOTE. So this is the already-known "forger who mints a
  fresh nonce" residual, which turns out to unlock a second gate nobody had
  connected it to. It is not a separate hole to close; it is a reason the nonce
  residual outranks its current billing as "smaller than what it replaced".

  **This bears directly on the re-promotion of the four self-citing goldens
  (next-steps item below).** `test/capture-campaign.test.js` asserts those four
  cannot be re-promoted from their own source record. That assertion is true of
  the honest pipeline and bypassable by a forger, which are different
  guarantees. Re-promote them from genuinely independent nonce-bearing evidence;
  do not treat the gate as proof the pipeline cannot be walked past.

► **`capture.observedAt` is free end to end, and nothing anywhere checks it.**
  Its only consumer on the promotion path is the stamp that writes the golden's
  `provenance.observedAt`. There is no ordering, recency or plausibility check,
  so a promoted golden's stated observation date is an unverified operator
  string. Low severity on its own; listed because "when the evidence was taken"
  is provenance, and every other provenance field here is checked.

- ~~**The promotion gate never compared the two observations to each other.** Now
  it does, and the gate is DORMANT by measurement (0 of 162 leaves can differ
  while both still match).~~ **CLOSED 2026-08-31 by measurement. Both bullets
  struck through here were wrong, in opposite directions.** The gate is NOT
  dormant, and "162" was never unreproducible. See § "The pairwise gate: what
  the 2026-08-31 measurement settled" below, and run
  `node tools/pairwise-gate-dormancy.mjs`.
- ~~**The "162 leaves" dormancy measurement does not reproduce, and neither does
  its correction.** No record carries 162 under either, so "162" is not a
  full-record count.~~ **The RANGES in this bullet are right — full-record
  101-184, matcher projection 86-157, both reproduced exactly — and the
  CONCLUSION drawn from them is wrong.** 162 is full-record leaves *minus the
  digest*, which any probe must rewrite; obs-qk1 and ten siblings carry exactly
  that, and 142 is that same family's matcher projection. Both disputed numbers
  name one record family. This is the third time this measurement was re-argued
  from memory, which is why it is now a committed tool.

► **A candidate was fitted to an observation, and it predates this session.**
  `staminaleft` 105 was transcribed after the map predicted 110. The same hero
  block may have carried it into other fixtures — **audit the corpus before
  trusting any staged scalar.**
► **The champion family cannot be captured at all** (hero `attack`/`defence` 3
  is unreachable; `hitpointsmax` 250 and `staminamax` 150 likewise). Five
  fixtures join the fifteen impossible-hero ones. Re-derive from the map.
► **All eight reachable fixtures over-pin `staminaleft`**, which nothing in the
  resolution chain reads. Fixing it needs a matcher change. **The sequencing
  advice that stood here — "which needs the dormant gate above landed first" —
  is superseded.** The gate is landed and has teeth, but on nonce-free evidence
  it is unreachable, so it backstops an exclusion for exactly nothing today.
  Whoever lands the exclusion cannot lean on it and must bring the adversarial
  pass named in § "The prescribed fix" below.
► **The stub is far weaker than the gate implies** — 7 of 15 hook slots have
  never wrapped in any gate run; `attack_chances`, the production arming point,
  is exercised 0 times there and ~209 times live.
- The wrong-side guard read an object the game never writes and was dead on
  every route. Fixed, and proved to fire in both directions. *(Closed.)*
- `scenario.attackerSide` is compared against the fixture's own declaration —
  a self-comparison — and the wrapper's real observation of who swung is
  discarded before ingest.
- The 81 divergence-report digests are unverified, and the obvious repair is
  itself an assertion that cannot fail.
- Hook attribution forgery. *(Closed this session.)*

Three claims I recorded during the session were wrong and are corrected in
place: that the wrong-side defect was arena-specific; that `if (attacker ==
undefined) return false` was the fix; and that 105 was arithmetically
unreachable. Each correction sits with the block it belongs to.

**Correction to my own entry above, and the transcription charge is CONFIRMED
while my reasoning for it was wrong.**

I wrote that "105 is arithmetically unreachable from the fixture's own inputs"
and that two combatants sharing a non-derivable number was "the signature of a
transcribed observation". The conclusion is right and the premise is false: 105
IS arithmetically reachable, and the live data fixes the step size. Do not repeat
the unreachability argument.

The transcription is established by the repository's own record, not by
inference. The eight fixtures were created de novo in `6fd3884`
(2026-08-30 19:52), and their hero block is byte-identical to
`candidate-prisoner-normal-kill`'s except `hitpoints` 30 → 300. The decisive
artifact is committed:
`test/fixtures/ss2-1v1-divergences/provisional-prisoner-kill--obs-20260830-t1-6bf4f120.json`
records `/scenario/hero/staminaleft` **expected 110, actual 105**. The
map-derived prediction was 110 — a fresh bout at full stamina — the runtime
returned 105, and the fixture was re-authored to the runtime's number. The
authoring commit says so in the test it added: *"the one staged number that is a
function of the autopilot step count rather than of a formula"*, *"exactly as
observed in the promoted prisoner sessions"*. The "five walks from 110"
derivation the documents now carry first appears three hours AFTER the fixtures.

So this is a candidate fitted to an observation, it predates this session, and
the same hero block may have carried it into other fixtures. **Check the rest of
the corpus before trusting any staged scalar.**

### The pairwise gate: what the 2026-08-31 measurement settled

`promoteSs2CandidateToGolden` matched every observation against the candidate and
never against the other observation — so "two matching observations from two
independent sessions" has always meant two records that each resembled the same
prediction, never two that resembled each other. `ss2ObservationsMatch` existed,
was exercised by tests, and was never called from the promotion path.

That gate is now called, and **its dormancy is settled by a committed tool rather
than by a sentence: `node tools/pairwise-gate-dormancy.mjs`.** It takes a minute.
Three independent implementations agreed on every number below, and an
adversarial pass drove the real promotion entry point rather than the functions.
Do not quote these figures without re-running it — this measurement has now been
re-argued from memory three times and retracted twice.

**The gate HAS TEETH.** 751 of 11,121 single-leaf perturbations across the 67
records are free — valid, re-digested, still matching their candidate — and
**407 of them, every one at `/samples/*/callSite`, this gate alone refuses.**
The free count is exact, not a lower bound: a leaf the matcher compares cannot
be free, since every record matches its fixture at baseline.

**And on committed evidence it refuses nothing, for a reason nobody had looked
at.** Zero of the observation ids the 22 goldens cite carries a `launchNonce`;
each is waived only by its exact digest in `pre-nonce-observations.js`; every
forgery re-digests and so leaves the waiver. The **nonce check** refuses all 18
eligible goldens' forgeries about forty lines before the pairwise loop runs.
Excising the loop changes zero verdicts. It fires only on nonce-bearing
evidence, of which three promotable groups exist (`obs-cachecold`+`obs-cachewarm`,
`obs-iso2`+`obs-par1`, `obs-par2`+`obs-par3`) and no golden cites any.

**So the old "DORMANT TODAY" comment was wrong about the function and
accidentally right about the corpus.** Both halves are now pinned by tests in
`capture-campaign.test.js`, and both were demonstrated to fail when broken.

**Read the teeth narrowly.** All 407 committed samples carry ONE `callSite`
literal, because the wrapper has one roll emitter stamping one compile-time
constant — the same fact that makes a fixture-derived `callSite` comparison
something this file already refuses to add. These teeth cannot bite two honest
captures. **And the gate catches disagreement, never falsehood: two records
carrying the SAME fabricated `callSite` agree, match, and promote.** It does not
close the hook-attribution hole and must not be described as closing it — the
same structural reason a pairwise comparison could never have caught the copied
record, which had to go through the nonce instead.

It becomes load-bearing the moment any field stops being compared. With the
prescribed `staminaleft` exclusion patched in, an auditor promoted two records
differing by 99,992 stamina — one negative, one 10^13 above `staminamax`. That is
the debris forgery's second symptom exactly.

**Land any field exclusion only after this, never before — but the old reason
for that rule is dead.** It used to read as "the gate is a dormant precondition
that starts protecting the corpus once an exclusion lands." It will not: on
nonce-free evidence the gate is unreachable, so an exclusion landed today is
backstopped here by nothing. Free to keep, re-measured: all 29 cited observation
pairs across the 22 goldens agree under it, so it refuses no promotion that
already stands.

**ANSWERED FROM THE MAP, BLIND TO THE CAPTURES.** `staminaleft` is read by
**nothing** in the attack-resolution chain, and the pinned 105 is not derivable
from the fixtures' own inputs. The analysis was done by an agent forbidden from
opening `captures/`, the divergence reports, this file, or the staging runbook,
so its warrant is independent of anything the runs recorded.

Complete reference inventory — 42 `staminaleft` sites, 24 `staminamax`, every one
attributed by offset:

- `checkattackroll` (overlay `+0x2c30`–`+0x3192`): **zero** stamina references.
- `attack_chances`: **zero**. Reads `attack`, `defence`, `charisma`, `magicka`,
  `shield` only.
- Deflection (`+0x3030`–`+0x3095`): reads `helmet` and `greaves` only.
- `remove_armour` / `destroy_armour`: **zero**.
- `damagecharacter`: one touch, and it is a **write** —
  `game_defender.staminaleft += ceil(breastplate * damage / 100)` at `+0x1928`.
  Nothing downstream consumes it; the defeat gate reads `hitpoints`.
- `check_stats`: reads `staminamax` only to clamp `staminaleft`. Self-referential.

**It is path-determined, not scenario-determined.** In `normal_attack` the cost is
*set* at `+0x61a3`, `attack_direction` drawn at `+0x61f1`, `checkattackroll()` at
`+0x62ad`, and `staminaleft -= staminacost` only later in `nextphase` (`+0x32a7`).
So the value at the roll reflects history *before* the attack. Each prior turn
nets `-staminacost + (1 + round(stamina/3))`, and a walk costs
`round(movement_speed/2)` where `movement_speed = clamp(round(speed*1.5), 4, 60)`.
**The fixtures state neither `stamina` nor `speed` for either combatant.**

**And 105 is arithmetically unreachable from the fixture.** `staminamax = 100 +
stamina*10`, so 110 implies base `stamina` 1 and per-turn regen 1. A fresh bout
starts full at 110. Reaching 105 needs exactly one prior turn at net −5, i.e. one
walk at `movement_speed` 11–12, i.e. `speed` 7 or 8 — which the scenario does not
state. With the stated `strength: 10` a prior *attack* would have cost 20 and
landed on 91. The same 105/110 is pinned for the villain, whose block states no
`strength` and no `speed` at all. **Two independent combatants landing on the same
non-derivable number is the signature of a transcribed observation, not a
derivation** — which, if so, means this predates the session and is the exact
discipline failure the pipeline exists to prevent.

`staminamax: 110` is separately over-specified: `battlevalues` recomputes it
unconditionally from base `stamina` at `+0x37b6`, and `nextphase` runs
`battlevalues` for both combatants at every phase transition, so a staged
`staminamax` cannot survive one turn.

**And `expected.state.<side>.staminaleft` carries zero information today.** The
capture window deliberately closes before `nextphase`
(`ss2-capture-wrapper.as:2456-2459`), so `finalState.staminaleft` = staged value +
`staminaBonus`; with `breastplate: 0` in all five armoured fixtures,
`staminaBonus` is 0 and the field is a pure echo of the scenario value. The pin
costs six exact-equality constraints per fixture, none related to deflection
thresholds, armour removal, or the equality quirk these fixtures exist to test.

### The prescribed fix, and why I did not apply it

Dropping `staminaleft`/`staminamax` from `scenario` is a clean deletion —
`assertAllowedKeys` is an allow-list. But `expected.state.<side>.staminaleft`
cannot simply follow: `assertExactKeys` makes it mandatory on both sides, and the
resolver's defaults would then pin `staminamax`, or `0` — **a different wrong
number rather than none.** So the field has to be excluded from the `/finalState`
comparison, with `expected.mutation.staminaBonus` carrying the derivable claim
instead. That split is right in principle: the delta
`ceil(breastplate * damage / 100)` is a pure function of the scenario; the
absolute level is not.

**STOP AND AUDIT BEFORE IMPLEMENTING THAT.** Excluding a field from
`matchSs2ObservationToFixture` repeats the structural shape of one of the two
forgeries closed in `cc42503`: cosmetic opcode rolls were excluded from sample
matching by label regex on both sides, and a record carrying 120 fabricated
debris rolls matched a 7-sample fixture. The analysis cites
`isCosmeticDebrisSample` as the precedent to follow — but that mechanism *was*
the vulnerability. An exclusion that is "obviously harmless because the chain
never reads the field" is exactly the argument that was made for debris rolls.

The next session should implement it, but only behind an adversarial pass whose
single named claim is **"a record carrying an arbitrary `staminaleft` cannot be
promoted"**, and it must check the 22 existing goldens, whose `breastplate` is
not always 0.

Undocumented behaviour found on the way, for the battle map: the `taunt` branch
carries the rest branch's restoration inline — `+0x684c`
`hitpoints += 3 + ceil(stamina)` and `+0x6894` `staminaleft += stamina` — guarded
only by `attacker.struck != null`, i.e. on every completed taunt.

**All eight currently reachable fixtures pin the identical
`staminaleft: 105 / staminamax: 110` for BOTH combatants** — the five
`candidate-armoured-*` and the three `candidate-tournament-*`. It reads as one
derived constant applied uniformly rather than eight independent derivations.

Five independent live direction-5 hero captures disagree with it, and with each
other: villain `staminaleft` came back 90, 92, 93, 95, 100 and hero 104, 106,
106, 108. Nothing else observable diverged, except one run where the villain
landed a blow first and cost the hero 12 hitpoints — which is the predicted
consequence of the repaired side guard re-arming rather than a surprise.

Be precise about what "nothing else diverged" covers, because the compared
projection is narrower than it looks. `matchSs2ObservationToFixture` compares
the scenario, the ordered samples, the ordered mutations with each reason
translated to a hook, the semantic events, the result event and the final state.
**`expected.calculation` and `expected.mutation` are candidate-derived and are
NOT compared at all** — so the hit chance, roll needed, deflection roll and
threshold, and critical determination were never checked against the runtime.
And `/samples` is close to a self-comparison on an injected-tape capture,
because the wrapper emits the fixture's own tape entry rather than the game's
call arguments.

What genuinely matched five times over is the mutation trace and the final
state — the damage write, the armour absorption, and the resulting
`armourclass`. Those are real game outputs.

So the blocker for all eight is one field, and the question is whether it belongs
in these fixtures at all. **Do not resolve it by editing the fixtures to the
observed values.** That is the one move this pipeline exists to refuse. It is a
map question: does `staminaleft` enter the resolution chain, and is its value at
the first `checkattackroll` determined by the scenario or by the number of
approach steps the scenario does not specify?

**The 81 divergence-report digests are unverified, and the obvious fix is
another assertion that cannot fail.** `ss2-divergence-corpus.test.js` compares
`record.digest` to `report.observationDigest` only inside
`if (record.target.fixtureId === report.fixtureId)`, a branch dead by
construction — a report exists *because* the observation did not match that
fixture — and the file already asserts `sameTarget === 0` and says so.

Measured while looking for a repair, and the measurement is the finding: for all
six reports that resolve to a committed record, `computeSs2ObservationDigest`
reproduces the record's **stored** digest exactly (6/6), and the **report's**
`observationDigest` is a different value in every case. So the report digest is
not the observation record's digest, despite `promote-1v1-golden.js:207` reading
`observationDigest: observation.digest` — a second code path produces the ones in
the corpus. Until that is traced, there is nothing in the repository to compare
them against.

Do NOT "fix" this by adding
`assert.equal(record.digest, computeSs2ObservationDigest(record))`.
`ss2-capture-attestation.test.js:92-104` already establishes that this
assertion **cannot fail**: `validateSs2Observation` recomputes and compares the
digest internally and `ingestSs2CaptureTrace` returns through it, so the equality
holds by construction on any ingested record. That file solves the real problem
the right way — it adds and removes each attestation and requires the digest to
MOVE — and any repair here should follow that shape rather than compare a value
to itself.

Three genuinely redundant assertions also survive in the divergence corpus file:
the duplicate-pair check at :259 (implied by the filename check above it, since
a directory cannot hold two files of the same name), and the two closing
equalities of the archive test, each arithmetically implied by the
`assert.deepEqual(missing, [])` five lines above. They are noise rather than
cover for a bug, but they should be given independent derivations or deleted.

**The wrong-side guard does not protect the arena route, and 9 of 20 armed
captures were mislabelled. CRITICAL, and found live.**

Twenty-two `run-arena.ps1` rounds were run against
`candidate-armoured-deflection-threshold-cleared` on 2026-08-31 (sessions
`session-adc1` … `session-adc22`; twenty armed, one aborted, one produced no
direction). Splitting them by which combatant the first `damagecharacter` write
landed on:

| Who actually swung | n | `attack_direction` values observed |
| --- | ---: | --- |
| hero | 11 | 8, 8, 7, 8, 7, 6, 8, 8, 6, 7, 7 |
| **villain** | **9** | 4, 10, 11, 20, 3, 2, **5**, 20, 10 |

**Every one of the twenty carries `"attackerSide":"hero"` in its meta line, and
`capture-refused-wrong-side` was logged exactly zero times.**

This is the failure `captureAllowedNow`'s own comment calls out by name — "arming
on the villain's swing would file a trace labelled 'hero' that ingest has no way
to contradict: a false observation, which is worse than no observation." The
guard is written correctly but is skipped wholesale on this route:

```
var attacker = gameRoot().game_attacker;
if (attacker != undefined) {          // <-- on the arena route it IS undefined
    ...
    dbg("capture-refused-wrong-side");
```

`game_attacker` is evidently not set at the moment `captureAllowedNow` runs here.
**Correction, 2026-08-31.** Both sentences that stood here were wrong, and they
were mine. I wrote that the guard "is not dead everywhere — six
`capture-refused-wrong-side` lines exist in older prisoner-route captures — so
this is arena-specific." Those six matches are in compiled wrapper SOURCE copies
under `captures/wrapper-cache/` and `captures/vehicle-check/`, not in any trace.
Across 268 archived rufflelogs the refusal appears **zero** times, and the defect
was **universal**, not arena-specific.

The cause was one word in one expression: the guard read
`gameRoot().game_attacker` — `_level1.game_attacker` — and the game never writes
that path. All 296 `game_attacker` references live inside `sprite:862[overlay]`
frames 1 and 52, and the only two writes are bare `SetVariable` instructions
inside `changeCombatants`, which in AVM1 resolve up the scope chain to the clip
that defined the function. The value lives on the **overlay clip** — the same
object the wrapper already reads `attack_direction` from at arming time.

I also proposed `if (attacker == undefined) return false;` as the fix. Applied to
the path as it stood, that would have blocked **every** capture on every route —
21 of 21 armed rounds and all 193 archive captures — because the read never
resolves. Fixing the object had to come first.

**Both are now fixed and the guard is proved to fire in both directions**
(commit `2b483a8`). `stub-game.as` had omitted `game_attacker` entirely, so
`validate-vehicle.ps1` could not exercise the side guard at all — the gate this
project mandates after every wrapper edit never noticed the guard was dead,
because a stub that omits the field a guard reads cannot test that guard, and
its silence reads exactly like a pass. With the stub binding the attacker:

| stub binds | launcher claims | marker | outcome |
| --- | --- | --- | --- |
| hero | hero | `attacker-resolved-hero` | 32 trace lines, MATCH, gate PASSES |
| villain | hero | `capture-refused-wrong-side` | 2 lines, nothing arms, ingest refuses |

The second row is the first observed refusal in the project's history. A run
whose log carries no `attacker-resolved-<side>` line has a dead guard again.

**Two things follow, and the second is the dangerous one.**

1. *The battle map's `randomBetween(5, 8)` for `normal_attack` is confirmed,
   sharply.* All eleven hero swings landed in 6–8 and none outside. The
   out-of-range directions in the archive (2, 3, 4, 10, 11, 20) are the villain's
   attacks, not a wider hero range. Direction 20 in particular belongs to no
   documented hero band.

2. *Direction does NOT discriminate, and must not be used as if it did.*
   `session-adc18` is a villain swing at **direction 5** — inside the hero's own
   range. Its mutation path is `/hero/hitpoints` and its method is `critical`.
   Had the target fixture expected a hero-side mutation, that trace could have
   MATCHED while being attributed to the wrong combatant, and the promotion gate
   needs only two such.

Every one of the nine was in fact caught, by `/mutationTrace/0/path` diverging
(`/villain/armourclass` expected, `/hero/hitpoints` observed). **That is
incidental, not a designed defence.** It holds only because every currently
reachable fixture happens to expect a villain-side mutation.

The fix belongs in `ss2-capture-wrapper.as` and so needs the vehicle gate re-run;
the wrapper was frozen for this session's supervised captures, so this is
reported rather than fixed. The shape it should take is a REFUSAL when the
attacker cannot be identified, not a skip — `if (attacker == undefined) return
false;` — because "I could not tell who swung" and "the right combatant swung"
are the two cases the current code merges, and it merges them in the unsafe
direction. Note that this is the same defect class as the `isNum` trap: an
undefined read taking the permissive branch.

**A third working forgery against the promotion gate. CRITICAL.** Hook
attribution is not merely unverified — `reason` is stripped from BOTH sides
before comparison (`src/golden/observation.js:753-760` and `:803-808`,
`src/golden/promote-1v1-golden.js:373`), so a record carrying deliberately WRONG
hook labels, `callSite` or `injected` passes ingest, verify AND the promotion
gate, and yields a golden the committed suite accepts. The mutation trace is the
documentation's own "substantive evidence", and its attribution to a game
function is the only thing separating "`damagecharacter` subtracted these
hitpoints" from "some unnamed code did". This is the same class as the two
forgeries closed in `cc42503`, and it is open.

The fix is to translate rather than strip — map each fixture entry's static
reason through the hook table and compare — and it costs no re-capture. **Do
NOT instead add a fixture-derived `callSite` comparison:** `callSite` is a
compile-time constant in the wrapper's single roll emitter, so comparing it
would manufacture the appearance of verification while comparing one hard-coded
constant to another, which is the defect class this project has now found six
times.

**`validate-vehicle.ps1`'s new save tripwire hashes only the FIRST file named
`ss2_data.sol`.** This machine's save root holds three `.sol` files. The gate is
isolated by `--save-directory` regardless, and the tripwire is documented as
currently unarmed, but it is narrower than it reads.

**`src/adapter/battle-host.js:155` returns `{ ...declared, resources: first }`,
and `declared` may legally be an array since `193e54d`.** An array `aiFill`
collapses to a single object — reproduced end to end against the real modules.
Pinned by no test. The workaround retirement this was found under is NOT done:
removing it reddens three assertion sites in `test/ss2-adapter-integration.test.js`,
one of which pins the defect being removed, so the source edit and its test
rewrite have to land together in one owner's hands.

*(My error on that track: I briefed the agent with the path `src/team/battle-host.js`.
The file is `src/adapter/battle-host.js`. The agent correctly stopped and
reported rather than guessing.)*

**`-StageGold` re-staging on retry: the obvious fix is worse than the bug.**
Gold gates WHICH weapon the shop scanner accepts, and `hero.weapon` is a
`battlevalues` input. Making the gold write once-only while leaving the shop
re-entry in place would let attempt 2 buy a DIFFERENT, cheaper weapon and fight
with different damage rolls — a real evidence defect, where the current bug only
fabricates a gold figure no artefact carries. Scope any fix to make the SHOP TRIP
idempotent, not the gold write.

**One `isNum` site survives, at `ss2-capture-wrapper.as:1407`** — two raw hero
reads compared with BOTH negated forms, and one operand is demonstrably NaN in a
committed live trace. Fail-closed (`arenaAbort` only sets flags and logs), so it
is a correctness and diagnosability defect rather than a corruption path, but the
claim that the guard is used everywhere it is needed is false.

**The fifteen impossible-hero fixtures: the contradiction is FORCED, not a failed
search.** The `max_damage - min_damage` spread is strength-free, and exactly one
row in ninety has spread 8 — so the weapon is uniquely determined before strength
is considered, and only then does strength turn out to be wrong. And the escape
hatch is closed: `nextphase` recomputes `battlevalues` for BOTH combatants at
every phase transition (`ss2-capture-wrapper.as:2078`), so `-StageHero
"strength:5,min_damage:12,max_damage:20"` cannot reproduce them live either.
Still deliberately NOT fixed — they must be re-derived from the map, not edited
to fit — but the reasoning is now a proof rather than an absence.


**Evidence chain**
- Two-session independence still rests on operator strings for every promoted
  golden: 9 of 67 records carry a nonce and **none of the 9 is cited by a
  golden**.
- **Hook attribution is never verified anywhere.** `reason` is stripped from
  both sides before comparison, so hook labels, `callSite` and `injected` are
  unfalsifiable in all 22 committed observations.

**Fifteen fixtures assert a hero the build cannot produce.** Groups C–F stage
`strength 5` with `min_damage 12 / max_damage 20`, which under the verified
`round(strength*2) + weapon_min_damage` implies a weapon row `[3]=2 [4]=10`. All
90 rows were dumped; no such row exists. The closest is `weapon41` (4/12), which
works at strength **4** or **8** — one point off each fixture. **Deliberately not
fixed**: candidates are derived from the map, never edited to fit, so these
should be re-derived properly rather than patched.

**The spell ingress cannot arm.** The hook label and `magic-damage` event are
fixed, but all 13 `checkattackroll` sites were enumerated and none falls inside a
spell arm; `attack_chances` is not reachable on a hero cast turn. And **`spell_id`
does not exist anywhere in the build** — both branches of that code are dead. The
byte-backed candidate for an arming point is `cast_spell_icon`, which carries the
inventory id as a literal argument; wiring it changes the capture window's
boundary (a cast's impact lands many frames later) and needs the gate re-run.

**GATE A freezes a game mechanic, deliberately.** The route writes
`time_of_day = 24` on every town-square entry; no button does that. It suppresses
the day counter, the lighting and the 200-point special event, and frame 150
persists the frozen value. Kept — the event it prevents permanently mutates
charisma, magicka or gold and saves *that* — but it is an alteration,
owner-approved, and must not be described as a button replication.

**Save-safety items not yet closed**
- `run-arena.ps1` still kills every Ruffle process rather than its own pid,
  which sabotages any concurrent isolated session.
- `validate-vehicle.ps1` launches Ruffle at the REAL save with no
  `--save-directory` and no process guard, while this file mandates running it
  after every wrapper edit.
- Two unguarded arithmetic writes to DNA fields: `experience = experienceneeded
  + 1` and `vitality++`. Neither operand was shown to be undefined, so this is
  argued rather than demonstrated — but it breaks the file's own isNum rule.
- `-StageGold` re-stages on every `-Attempts` retry, discarding gold the
  previous attempt earned.

**Adapter**
- No per-action animation acknowledgement, so nothing sequences action N+1's
  rebind against action N's running timeline. Documented as a gap, not designed.
- `roster.js` now supports per-slot AI fill; `battle-host.js` can drop its
  `aiFillWithResources` workaround and retire `diagnostics.aiFillResourceGaps`.

**Docs known stale** (flagged by agents, not yet reconciled): the staging
runbook's `parseStageList` mechanism (it guards with `isNum`; it does not write
NaN) and its "weapon table unmapped" premise (it is decoded);
`ss2-arena-route.md` §12 on `armourclass` being re-derived mid-battle (it is
not — that is the whole basis of the armoured family); `ss2-champion-dna.md` §7
on `fightMode` (the fixtures carry it now).

---

## The design track is deliberately quarantined

A separate track researches endless progression, on branch
`design/endless-progression` (PR #1), and it now carries a complete proposed
Arena Circuit progression, loot, inventory, opponent and settlement design.

**Design must never flow into candidate authoring.** A candidate fitted to a
design is a candidate fitted to a hypothesis, and the capture that "confirms" it
confirms a fit rather than a prediction — which is the one failure this whole
pipeline exists to prevent. The rule is not that the two tracks disagree; it is
that the measuring instrument must not be shaped by what anyone hopes to
measure. Read the design if you are working on the design. Do not read it while
authoring a fixture.

This omission is mine: the rule was in the previous handoff and I dropped it
when rewriting this file, at exactly the moment the design track grew from a
brief into a full proposal.

**Repository naming.** The GitHub repo was renamed to
`Zanzagar/swords-and-sandals-2-multiplayer`; the `github` remote already points
at the new URL. The local worktree directories and the `origin` bundle keep the
old `ss2-team-arena-foundation` name **intentionally** — do not rename them or
hand-edit worktree metadata. `package.json` still carries the old identity on
`main`; the migration is part of PR #1 and lands when that merges.

## Working agreement for parallel agents

Exclusive file ownership stated in every prompt; no agent runs a state-mutating
git command; no agent launches Ruffle or touches the installation, the save or
the snapshots; adversarial verifiers write nothing at all.

**The limit is the file graph, not the budget.** Writers are capped at ten to
twelve coherent slices. Auditors have no cap, because they write nothing and
cannot conflict — and several independent auditors on the same target is a
quality technique, not duplication. Give each one ONE named claim to break.

## Keep the project lawful and reversible

Use only a licensed local copy for inspection. Keep originals untouched, work in
a separate mod folder, and distribute patches or independently authored files
rather than the original game files or assets.
