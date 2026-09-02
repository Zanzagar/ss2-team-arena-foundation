---
handoff:      2026-09-02-1659--three-waves-cut-at-the-usage-limit
written:      2026-09-02 16:59 -0400
sessionStart: 2026-09-02 16:25 -0400 (approx.)
sessionId:    426439d1-71ea-4b21-8f84-9782562bbba7 (https://claude.ai/code/session_0117WNCMTh4Uy619L7sbNvM4)
agentRuns:    wf_dc0487cc-744 what the armoured candidate must pin   6/6 investigators, 2/12 verifiers (both HOLDS)  UNVERIFIED-PARTIAL
              wf_98de7ab7-859 the enchantment-damage fork            6/6 investigators, 0/12 verifiers               UNVERIFIED
              wf_1da41bdf-591 pinning the approach-step count        5/6 investigators, 0/12 verifiers               UNVERIFIED
              **All three were STOPPED by me at the owner's message that the
              session was at 92% of its limit, ~25 minutes after launch.
              Completed agents are cached; resume with `resumeFromRunId` and
              a SMALLER `verifierBudget`. Nothing below is verified unless it
              says so; the main session re-derived the load-bearing ones.**
branch:       arena/champion-capture, fully pushed (0 ahead / 0 behind
              `github/arena/champion-capture` at start; measured, not copied
              from the 13:40 brief, which said 18 unpushed).
suite:        721 tests / 720 passed / 0 failed / 1 skipped (WSL, fresh-clone
              profile), MEASURED 16:35. Re-measure; never copy this line.
environment:  WSL2, node v26.3.1, ~/projects/swords-and-sandals-2-multiplayer
supersedes:   2026-09-02-1340--the-first-armoured-golden (ranked item 4 CLOSED
              by measurement; item 3's premise BROKEN; items 1 and 2 costed
              but not decided)
---
# Handoff — three waves, cut at the usage limit

## The one-sentence version

Three capped fan-out waves on the 13:40 brief's ranked items 1–3 returned all
but one investigator and almost no verifiers before the owner reported 92% of
the session limit and 30% of the WEEKLY Fable 5.1 usage gone in under twenty
minutes; what they found — one verified, the rest not — is below, the three
stale instructions they exposed are corrected at their sites, and the cost
lesson outranks every finding.

## THE COST, FIRST

Three concurrent `question-fanout-audit` waves (6 investigators + 12 verifiers
each, 54 agents at the ceiling) consumed **~30% of the weekly Fable 5.1 usage
and 92% of the session limit in under twenty minutes** — measured by the owner,
not by me. The waves were launched because ultracode was ON for the session,
which tells the agent to orchestrate every substantive task; nothing in this
repository asks for a wave every session, and `AGENTS.md` says skills are
invoked on judgment.

**Owner, 2026-09-02:** the fan-out is worth keeping *"if it gives substantive
quality improvements"*, but *"we don't have infinite usage."* The record says
the verify phase is where this project's real defects have been found (10 of
12, 28 of 48, 7 of 18 claims broken on earlier nights), so the technique stays.
**What changes:**

- **ONE wave at a time, never three.** Concurrency is what turned a
  twenty-minute wave into a session-ending one.
- **`verifierBudget` 4–6, not 12.** The entry-point claim is verified first and
  survives any cap; put the decision-critical claim second.
- **Fan out only where the map, the code AND the archive all have to be
  checked** — a candidate-derivation decision, a protocol change. Mechanical
  edits and anything a test already pins run solo.
- **Check the harness copy.** `~/projects/claude-harness/workflows/question-fanout-audit.js`
  is the UNCAPPED pre-2026-09-02 version: no `verifierBudget`, no
  `environment` field, no `maxItems: 6` on claims. Its
  `docs/multi-agent-field-rules.md` does not carry the cap either. **Any
  project that adopts the harness copy re-learns the five-hour usage limit.**
  Sync this repository's copy back to the harness (that is a change in another
  repo, so it is the owner's call to push).

## RANKED ITEM 4 IS CLOSED — measured, not carried forward

`github/arena/champion-capture` is at `27ef6a1`, identical to local HEAD at
session start; the two zero-commit local design branches are gone (only
`design/endless-progression-owner-packet` remains, as a worktree at
`~/projects/ss2-progression-design`); local `main` equals `github/main` at
`362859a`. The remote still carries `github/design/endless-progression` and
`-readiness`; deleting a remote branch is a push, so it stays the owner's call.

## WHAT THE WAVES FOUND, BY VERIFICATION STATUS

### Ranked item 2 — what the armoured candidate must pin (wave `wf_dc0487cc-744`)

**VERIFIED (verifier HOLDS, and the main session re-derived it a second way):
nothing on the hero's one-action path reads the defender's damage pair.**
`golden-armoured-deflection-threshold-cleared` replays through the real
`createTeamBattle`/`applyAction` with `calculation`, `mutation`,
`mutationTrace` and `state` all deepEqual whether the villain is given
`min_damage/max_damage` 1/1 or 999/999 (verifier harness in this session's
scratchpad, `q2-verifier-villain-damage-pair/probe.mjs`). The second way: the
two captures the golden cites recorded DIFFERENT villains — strength 7 with
18/30 against strength 1 with 7/22, read from their `t:state` records — and
produced identical measured outcomes. **So the candidate's omission is CORRECT
from the map, and the gap is on the rule-set side.** Do not write those
numbers, or any villain damage pair, into a candidate.

**VERIFIED by the main session from the code, and FIXED this session:
`REPLAY_UNDRIVABLE` was NOT "asserted in both directions".** Two investigators
found it independently: `isReplayable` is `!hasOwn(REPLAY_UNDRIVABLE, id)`,
so the `deepEqual(undrivable, keys(REPLAY_UNDRIVABLE))` at `:294-298` compared
the frozen object with itself — it caught an entry naming a golden that does
not exist and NOTHING else; a listed golden that quietly became drivable was
never noticed. That is the project's signature defect, in the assertion the
13:40 brief praised. The test now also BUILDS every listed golden and requires
the refusal by name; the mutation that kills it is relaxing the rule-set guard
while leaving the list.

**UNVERIFIED (investigators only), in rank order of how much they would change:**

- The refusal is construction-time and role-blind: `roster.js:167` calls
  `rules.maximumHealth` for every slot, which reaches `assertRequiredResources`
  at `ss2-rules.js:939`; the call at `:636` (`vanillaRecordOf`) is dead on every
  tested path. With both removed the golden builds and the arithmetic sees a
  defaulted `[1,1]`. **Recommended shape: a ROLE-BASED requirement — the damage
  pair is required of whoever ATTACKS, checked at resolve time — gated or not
  on `fixtureReplay`.** It fills a hole and overwrites nothing.
- The sentinel option (poisoned pair that fails on read) is "unachievable as
  specified": `initialiseCombatant` in `ss2-attack-candidate.js` is eager over
  every field.
- The armoured villain omits SIX keys the prisoner villains carry (`attack`,
  `strength`, `charisma`, `magicka`, `min_damage`, `max_damage`), not two.
- 31 of 60 candidates omit the defender's damage pair and would land in
  `REPLAY_UNDRIVABLE` the day they promote; no fixture pins a weapon id and
  none can (`COMBATANT_KEYS` has `strength` but not `weapon`). (The table
  claim itself HOLDS — one of the two returned verdicts.)
- Extending the candidate instead (strength + weapon + derived pair) forces
  new captures AND a hand-deleted golden, and fails two tests as written. The
  negative "the villain is never re-skinned in battle" is now byte-cited TRUE,
  spell paths excepted (unreachable for a randomised villain with no castable
  item) — but a staged pair is NOT deterministic without also pinning
  `secondary_weapon`/`using_bow`.
- Over the 1,321 armed rounds the villain pair took 63 distinct values;
  1,317 of 1,321 invert onto an item-table row. Costing only.

### Ranked item 1 — the enchantment-damage fork (wave `wf_98de7ab7-859`, 0 verifiers)

**VERIFIED by the main session and corrected at the instruction:** the head
(`HANDOFF.md` ~line 1440) and `ss2-rules.js`'s header gap 4 both said the
secondary enchantment damage is absent from the adapter catalogue and that
"neither is computed here". Both false since `52bc570` (2026-09-02 06:05):
`src/adapter/vanilla-fields.js:150,155` carries both, and `ss2BattleValues`
derives both at `ss2-rules.js:472-475`. The same commit's own header text was
stale on the day it landed.

**UNVERIFIED, six investigators, all returned:**

- The rule-set seam has NO turn-start hook: `rule-set.js` `REQUIRED_FUNCTIONS`
  is exactly `[maximumHealth, legalActions, resolveAction, chooseAiAction]`.
  **The status phase as the ONLY legal action for an afflicted combatant needs
  no change to `resolver.js` or `rule-set.js`, changes no projection field, and
  moves none of the 12 pinned hashes.** The tick consumes no RNG sample.
- `magic_damage_character` (DefineFunction2 at `+0x129c` of
  `overlay/frame:52/DoAction@0x240c7f`): binds `defender→r4`, `game_defender→r2`,
  `attacker`/`game_attacker→r0` (unread); reads `damage_method` exactly once,
  as a `gotoAndPlay` label, and `bonus_frame` once — so **"lifesteal" heals
  nobody** and no method changes the arithmetic. The breastplate stamina join
  evaluates as `ceil(damage * ((breastplate/100*100)/100))`.
- **Map errors, both in the section the head cites:** for the HERO the FIRST
  matching status wins, not the last (`getphase` gates on `turnphase == 1`);
  and the map's status-arm pseudo-code inverts both `struck` tests. A villain
  status turn can be silently lost. Correct the map only after a verifier.
- H5 was half false: **7 of 60 candidates carry non-zero potency and two
  EXPECT a proc** (`candidate-armour-overflow-burning`,
  `candidate-frozen-enchantment-proc`); no golden or observation does. In-play
  potency maxes at 3 (magic-shop buttons 2010/2011/2012 push 3/2/1).
- The wrapper cannot arm on a status phase (`beginAction` is reachable only
  from the `attack_chances`/`checkattackroll` wraps), so any implementation
  is map-derived tier until a new hook exists. **The archive does hold 79
  hero status-phase `phase_action` entries** (poisoned 33, frozen 21, the rest
  burning/life_stolen) — the villain's enchanted weapons hit the hero often.
- `tools/hotseat.mjs` `buildSs2Fighter` sets no enchantment, so `statusApplied`
  cannot fire in the stock playable path today.

**The fork, as it should be put to the owner (my recommendation first, and it
is UNVERIFIED):** (a) **status phase as a forced legal action** — faithful to
the build's phase structure, no resolver change, map-derived tier;
(b) auto-resolved tick at turn start — same arithmetic, the client never sees
the turn; (c) on-hit approximation — zero architecture, unfaithful;
(d) leave unmodelled and document. Verify the two `wf_98de7ab7-859` claims
that carry (a) — "needs no resolver change" and "moves no pinned hash" — with
two verifiers before asking.

### Ranked item 3 — pinning the approach-step count (wave `wf_1da41bdf-591`, 5/6, 0 verifiers)

**The premise is BROKEN, and the main session's own measurement agrees with the
part it could reach.** Over 1,351 `session-ondc*/onx*` dirs (1,321 armed; the
brief's 1,353 includes two `onh` pre-junction attempts):

| | main session | wave |
| --- | ---: | ---: |
| walk-count mode | 5 (399 of 1,321) | 5 (400 of 1,322) |
| `heroStam == 110 − walks` | 1,312 / 1,321 | **1,321 / 1,321 once status ticks are added** |
| villain 105 at arming | 21 (1.6%) | 21 (1.6%) |
| villain 110 at arming | 64 (4.8%) | 209 arm ABOVE 105 |
| joint dir 5 ∧ hero 105 ∧ hp 300 ∧ villain 105 | 2 | 2 (`onx1405`, `onx1521`) |

- **The hero's walk count is decided by the VILLAIN's approach, not by the
  wrapper** — both gladiators close the distance from constant start positions
  (`root/frame:221` writes `arena_hero._x = -250`; one walk is 44 px; the
  closerange controller is selected by `fightdistance`). A fixed
  `walkright*5,normal_attack` list adds yield only in the 26.6% of rounds that
  reached range in FEWER than five walks; in the rest it waits for an
  unavailable `normal_attack` until the 900 s session abort. **So "pin the
  approach-step count" is not the two-constraint win the 13:40 brief ranked;
  drop it as ranked.**
- My nine "exceptions" were the wave's finding from the other side: hero stamina
  is `110 − walks + (status phases)`, because a status tick has `staminacost
  0` and still regenerates.
- Every armed round issued one `walkright` at overlay frame 10 BEFORE the
  navigator's `battle-ready` line, so the trace's `n` under-counts by one.
- 30 aborts, all `ABORT:special-event-screen` (`ondc224` is one of thirty, not
  a singleton); one time-of-day ceiling (`onh1`). The 5 hero-`left` rounds did
  not START swapped: `gladiator_dir` is re-derived from relative position
  mid-bout.
- `run-arena.ps1:267-269`'s stated reason for omitting `-Autopilot` (an empty
  ArgumentList element) is false — its own quoting passes `""`. And
  `validate-vehicle.ps1` passes no `-Pautopilot`/`-Pnavigate`, so it can
  exercise none of this.

**What the villain side actually says:** 110 (zero villain phases, the
map-derived value for a scenario declaring none) is three times likelier at
arming than the pinned 105, and NEITHER is scenario-determined. That is the
deferred schema question, unchanged, and it is now the only capture lever.

## Highest-value work, ranked

1. **Land the role-based damage-pair requirement and empty
   `REPLAY_UNDRIVABLE`** — ONE wave, `verifierBudget` 4, aimed at the two
   unverified claims above (refusal site; the new guard fills and never
   overwrites). The armoured golden then reaches the resolver.
2. **Put the enchantment fork to the owner** after two verifiers on option (a).
3. **Correct the map's status-arm section** (first-match-wins for the hero;
   the inverted `struck` tests) — after a verifier, never from this brief.
4. **Sync the capped workflow to `claude-harness`** — owner's push.
5. The schema question and `.claude/settings.local.json`'s `Bash(rm -rf *)`
   allow remain the owner's.

## Resuming the waves

`Workflow({ scriptPath: <session workflows dir>/question-fanout-audit-<runId>.js,
resumeFromRunId: <runId> })` with the same args replays the cached
investigators for free; the verify phase then runs live, so pass
`verifierBudget: 4` in `args`. Investigator answers and the two verdicts are
also extracted to this session's scratchpad under `main/waves/<runId>.results.md`.

## Traps from this session

- **TWO OF THE SIX GROUND-BRIEF HYPOTHESES I WROTE WERE STALE, and five agents
  each spent their first paragraph refuting them.** Both came from the 13:40
  brief and the head. Re-derive a hypothesis before it goes in a brief; the
  premise rule worked, but it is the expensive way to find out.
- **A workflow journal's `result` entries are keyed by content hash, not
  label**; the label lives in the `started` entry. Extract by pairing them.
- **My own archive script missed the frame-10 pre-walk and the status ticks**
  and still agreed with the wave on every headline number — which is exactly
  the correlated-agreement warning in `AGENTS.md`, from the inside.
- **`TaskStop` on a workflow keeps every completed agent in the cache.**
  Stopping early is cheap; letting the limit kill the verifiers is not.

## Hard rules (unchanged)

- Licensed SWFs are read-only and hash-verified before and after every capture.
- Never shortcut the game's own frames.
- A candidate becomes golden ONLY via >=2 matching observations from >=2
  sessions. Never hand-write a golden, observation or manifest.
- **Derive candidates from the battle map** — the villain damage pairs in this
  brief are COSTING numbers and must never enter a fixture.
- `validate-vehicle.ps1` must PASS after ANY wrapper edit.
- Snapshot before every save-mutating run, AND before every restore.
- **Do not push to `main`. This project asks before EVERY push.**
- Adversarial verifiers write nothing at all.
- **Do NOT run `/codex:setup --enable-review-gate`.**
