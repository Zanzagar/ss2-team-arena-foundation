---
handoff:      2026-09-01-1733--armoured-family-measured-and-the-schema-question
written:      2026-09-01 17:33 -0400
sessionStart: 2026-09-01 15:52 -0400
sessionId:    6c06a03b-d328-49f3-b861-8c252cc507ce (https://claude.ai/code/session_01TFmcvHecCsXerxRGg9rKMd)
agentRuns:    wf_bec89df5-025 (armoured arming gate) — VERIFIED: 6/6 questions,
              18/18 write-nothing verifiers, 0 errors. 9 STANDS / 9 BROKEN.
              61 load-bearing claims raised, 18 verified, 43 dropped and logged
              by name. 2.30 M subagent tokens.
              wf_ef6cc2c8-6b3 (villain-stamina re-derivation) — VERIFIED: 6/6
              derivers, 18/18 verifiers, 0 errors. 11 STANDS / 7 BROKEN.
              3.10 M subagent tokens. Derivers were forbidden from opening any
              capture; sources were the hash-verified SWF and the battle map.
              Plus direct byte re-derivation from the SWF by the main session,
              and a full n=38 run of the repo's own matcher over the raw archive.
branch:       arena/champion-capture
commits:      c3bdc4c..<tip>   # run `git log --oneline -1`; pushed state with `git log --oneline @{u}..HEAD`
suite:        630 tests / 629 passed / 0 failed / 1 skipped (WSL, fresh-clone profile)
environment:  WSL2, node v26.3.1, ~/projects/swords-and-sandals-2-multiplayer
supersedes:   2026-09-01-1550--codex-independence-and-the-corpus-archetype
---
# Handoff — the armoured family measured, and the question that replaced it

**Supersedes `2026-09-01-1550`, whose ranked items 1 and 3 are both RETRACTED by
measurement.** Everything else in it stands. Both retractions are written into
the LIVING HEAD at the instruction, not only here.

Nothing was captured this session: no Ruffle, no save touched, no wrapper edit,
no fixture edit, nothing ingested into the corpus. What changed is the record,
plus the archive's backup and verifiability.

## Where things stand

- Branch `arena/champion-capture`, clean, **630 / 629 / 0 / 1**, all work
  **PUSHED** (owner-authorised).
- `github/main` unchanged at `362859a`; this branch is still far ahead with no PR.
- Licensed SWF, live save and raw archive all hash-verified unchanged at the end
  of the session.

## Read first, in order

1. `HANDOFF.md` § "What to read, and what you may skip" — its first correction
   is the one that matters most this session.
2. `HANDOFF.md` § "DECIDED 2026-09-01 (evening): the villain-stamina remedy needs
   a SCHEMA change" — the current top question, with its byte-level derivation.
3. `HANDOFF.md` § "Found 2026-09-01 (evening): the armoured family measured at
   n=38" — what the family is actually waiting on.
4. This file's Traps.

**Do not read the ranked list in `2026-09-01-1550` as current.** Its item 1 is
retracted and its item 3 is retired.

## Highest-value work, ranked, with the reason

1. **CHECK THE ONE CAVEAT THAT COULD KILL THE WHOLE STAMINA APPROACH, before
   anything else is built on it.** Three `getphase` branches — `cast_swiftsandals`,
   `cast_bloodlust`, `cast_colossus` — are reported to rewrite the ACTING
   combatant's own base stats mid-bout, and all three are villain-selectable via
   `villain_cast_spells`. If that holds, **no reachable stat vector is invariant**
   and the remedy the owner chose is dead regardless of the schema. Raised by a
   deriver against its own answer and NOT verified. It is cheap (a static SWF
   read) and it gates items 2 and 3. **Ranked first because it can invalidate
   them, not because it is the most valuable if it fails.**

2. **THE SCHEMA DECISION — the owner's, and now costed.** Should
   `COMBATANT_KEYS` (`src/golden/run-1v1-fixture.js:91`, a closed 42-key
   allow-list) admit the DERIVED stats `stamina`, `speed`, `vitality`,
   `herolevel`? Today a scenario may pin a quantity the game derives while being
   forbidden to declare what derives it — every "unpinned input to a pinned
   output" finding in the head is a symptom of that one fact.
   `TOURNAMENT_OPPONENT_PARAMETERS` (`test/ss2-post-tutorial-fixtures.test.js:170`)
   pins the same surface and must move with it. **Do not land a value-only edit
   in the meantime**: it passes 630/629/0/1, but so does setting the same fields
   to `7`, which is impossible in the runtime — the suite is blind to the
   difference.

3. **Add `helmet_defence` / `shoulderguard_defence` via `-WatchFields`.**
   `candidate-armoured-removal-destroys-helmet` and `-shoulderguard` REFUSE every
   one of the 38 archived traces at INGEST — not at comparison — with *"the staged
   villain state is missing the required field `helmet_defence`"*. Two of the
   eight fixtures unblocked for the cost of one launcher parameter, and
   `-WatchFields` is already the right mechanism. **Do NOT widen
   `DEFAULT_WATCH_FIELDS`.** Cheapest item here and nothing recorded it before.

4. **Pin the approach-step count.** `hero.staminaleft == 110 − (hero walk count)`
   holds **38 of 38**, exceptionless — so the hero's value is a deterministic
   function of a quantity the autopilot chooses, and no one has used that. This
   is the "fix the capture, not the comparison" remedy the head has prescribed
   since 2026-08-31 and which has never been implemented.

5. **Consider hooking `villainChooseAction`.** The villain's action sequence is
   the sole determinant of its `staminaleft` at arming and is recorded NOWHERE in
   the archive, because the wrapper's only action hook is `getphase`, which
   carries the hero's actions alone. This is an OBSERVABILITY change, not a
   determinism one — `villainChooseAction` makes its own random draws — but it
   would make the villain's stamina explainable from the record instead of
   unexplained. Costed nowhere; think before building.

6. **The nonce recovery** and **injecting the 22 goldens into the resolver** are
   unchanged from `2026-09-01-1550` items 4 and 5. The corpus is still an asset
   nothing consumes.

## Traps from this session

- **A STATED IMPOSSIBILITY IN THE HEAD NEARLY STOPPED THE SESSION'S CENTRAL
  MEASUREMENT.** "The archive is not reachable from Linux" is FALSE — it reads
  fine from WSL at `/mnt/c/ss2-capture/captures`. The wording confused CLONE with
  MACHINE. Two independent agents flagged it before taking a number. **Check an
  impossibility before accepting it, especially one that conveniently bounds your
  work.**
- **THEN I OVER-CORRECTED IN THE OPPOSITE DIRECTION.** I wrote "the archive has
  ONE reachable copy, not three". True as stated, and it invites a stronger
  reading that is false: `D:` was UNPLUGGED, not gone, and held a real 1,589-file
  mirror. **State reachability and existence separately.**
- **`powershell.exe` DRIVEN FROM WSL INHERITS A CWD INSIDE THE REPO.** A stray
  `Copy-Item ... -Destination $null` I left in a command resolved `$null` to that
  CWD and **overwrote the root `README.md`**. Caught by reading `git status`
  before committing; restored; reached no commit. **Explicit `git add` paths did
  not protect me — only reading the working tree did.** That is the `git add -A`
  lesson from a different direction.
- **A GREEN SUITE IS NOT VALIDATION WHEN THE SUITE CANNOT SEE THE QUANTITY.** The
  value-only fixture edit passes 630/629/0/1; so does the same edit with the
  value `7`, which the runtime can never produce. **Before citing a green run,
  ask what the suite would have to be blind to for it to be green anyway.**
- **A VERIFIER CAN BE RIGHT TO DEMAND EVIDENCE AND WRONG IN ITS CONCLUSION.** One
  refuted "charge is in the villain's action set" as unevidenced — which would
  have changed the minimum stamina by an order of magnitude. The bytes settle it:
  `villaindecisionA = "chargeright"` at `+0x0a18`. **Record the command, not the
  argument**, and re-derive rather than adjudicating between two agents.
- **16 of 36 verdicts across two waves came back BROKEN**, several against claims
  I had found persuasive. A wave that breaks half its own load-bearing claims is
  working. One that breaks none has probably been told what to think.
- **DELOGGING THE 27 TRACES ADDED NO MATCHABLE EVIDENCE**, which retires a ranked
  item. I found the near-misses from the 11 committed reports and only afterwards
  checked whether the other 27 added any. **Measure the increment before ranking
  the work that produces it.**
- **`installHashVerifiedAfter` IS `null` IN ALL 38 TRACES.** Ingesting any of them
  today makes the tool run a LIVE hash check and stamp `true` — asserting a
  post-session check about sessions that ran days ago, with no committed record to
  carry the value forward from. Measure them in scratch; do not ingest without
  deciding that first.

## Hard rules

- Licensed SWFs are read-only and hash-verified before and after every capture.
- Never shortcut the game's own frames.
- A candidate becomes golden ONLY via >=2 matching observations from >=2 sessions.
  **Never hand-write a golden, observation or manifest.**
- **Derive candidates from the battle map, never from a capture.** Every observed
  stamina value in the head is a diagnostic; **none is a value to write into a
  fixture.**
- `validate-vehicle.ps1` must PASS after ANY wrapper edit — and read the head for
  what its PASS does not cover, including the branch it cannot reach.
- Snapshot before every save-mutating run, AND before every restore.
- **Do not push to `main`. Ask before pushing anything.**
- Adversarial verifiers write nothing at all.
- **Do NOT run `/codex:setup --enable-review-gate`.**
