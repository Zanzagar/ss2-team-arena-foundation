---
handoff:      2026-09-02-0130--ss2-rules-and-the-wave-that-broke-it
written:      2026-09-02 01:30 -0400
sessionStart: 2026-09-01 22:00 -0400
sessionId:    16532b60-e783-4426-806f-088de24dcacf (https://claude.ai/code/session_01BwAizicqr8TcqRUUsLgC85)
agentRuns:    wf_9f0108b5-fb5 (adversarial verification of src/team/ss2-rules.js)
              12 briefs, 12 started, 12 returned, 0 errors, **10 BROKEN**.
              All twelve write-nothing, one named claim each. Two of the breaks
              were evidence-level; both were then re-derived from the licensed
              SWF by the main session before anything was changed.
branch:       arena/champion-capture
commits:      831bcdc (1 commit, NOT pushed — `github/arena/champion-capture`
              is still at 2f8e4b8, and pushing needs the owner)
suite:        693 tests / 692 passed / 0 failed / 1 skipped (WSL, fresh-clone profile)
environment:  WSL2, node v26.3.1, ~/projects/swords-and-sandals-2-multiplayer
supersedes:   2026-09-01-2112--the-project-became-playable (its ranked items 1 and 2)
---
# Handoff — the corpus got a consumer, and the wave broke ten of twelve claims

**Ranked items 1 and 2 of the previous brief are DONE.** SS2's own attack
arithmetic now runs inside the shared resolver, and all 22 promoted goldens
replay through `createTeamBattle`/`applyAction` rather than through a standalone
harness that imports nothing from `src/team/`. `node tools/hotseat.mjs` plays
that rule set by default, so the numbers on screen are the build's.

**But the headline is the verification wave, not the feature.** Twelve
write-nothing verifiers, one named claim each, broke ten. Two of the breaks were
not stylistic:

1. **The rest branch has its own `hitpoints += 3 + ceil(stamina)` at `+0x51d5`,
   and this session overruled the map to say otherwise.** `ss2-rules.js` was
   written asserting that `+0x684c` (taunt) was the only offset-backed site for
   that expression, dropped the heal on that basis, and a test was written to
   pin the resulting wrong number. `ss2-battle-map.md`'s own PROSE said the
   taunt copy was a copy. The bytes agree with the prose.
   **The mechanism is worth more than the fix: the map's WRITERS TABLES omitted
   the row its prose described, and a table is what an implementer reads.** Both
   the code and the map are corrected.
2. **A killing blow costs the attacker nothing.** `death()` deletes
   `attacker.onEnterFrame` (`+0x2035`), `defender.onEnterFrame` (`+0x2042`) and
   the `nextphase` variable itself (`+0x2049`), and every melee branch only
   calls `nextphase()` on a later tick behind `attacker.struck == true`
   (`+0x62c3` → `+0x62e2`). So the tick that kills is the last one.
   **The golden replay had been asserting, nineteen times, that the engine must
   DISAGREE with the only measured attacker number the fixtures carry.** It now
   asserts equality — nineteen measured assertions recovered from a `notEqual`.

Every byte claim above was re-read from the licensed SWF by the main session
before anything changed; the SWF hashes to the pinned `SS2_BUILD_SHA256`.

## What landed

- **`src/team/ss2-rules.js`** — a `map-derived` rule set. It delegates the
  attack ingress to `src/golden/ss2-attack-candidate.js` (the module the
  goldens already replay against) and adds from the map what that module has
  none of: the `staminacost` table, `nextphase`'s attacker-only spend and
  regeneration, the forced-rest gate, and `ss2BattleValues` — the build's own
  derivation — so a blueprint states base stats and kit instead of hand-typed
  derived numbers.
- **The vocabulary is `quick-attack` / `normal-attack` / `power-attack` /
  `rest`, and the DIRECTION IS DRAWN.** Byte-verified: the three melee branches
  each draw `randomBetween(9,12)` / `(5,8)` / `(1,4)` before their own
  `checkattackroll()` call. Encoding twelve directions as twelve action tokens —
  the obvious design — would have handed the player armour-targeting the build
  never offers, since `remove_armour` dispatches on the exact direction.
- **`test/ss2-golden-resolver-replay.test.js`** — the 22 goldens through the
  real resolver, matching the arithmetic's entire return AND the applied state,
  with the tape drained. The corpus has a consumer for the first time.
- **`test/ss2-team-rules.test.js`** — everything the corpus cannot reach,
  labelled by what kind of check it is.
- **`tools/hotseat.mjs`** — SS2 by default, `--rules placeholder` to compare,
  `--armour N` to make the armour-first split visible. Three defects fixed, all
  found by reading rather than by a failing test: the knockout line matched a
  token (`"combatant-defeated"`) and a field (`combatantId`) that do not exist,
  so it never printed; and the runner **computed the hit/miss verdict itself**
  from `effect.amount === 0`, announcing every armour-absorbed hit as a miss two
  lines under its own derivation line reading HIT.

## Read first, in order

1. `HANDOFF.md` § "Found 2026-09-02" — the open items this opened.
2. `src/team/ss2-rules.js`'s header, in full. It states three gaps by name.
3. `test/ss2-golden-resolver-replay.test.js`'s header — specifically what it
   does NOT prove, which is more than its first draft admitted.
4. This file's Traps.

## Highest-value work, ranked, with the reason

1. **CAPTURE AN ARMOURED OR ENCHANTED FIXTURE. Nothing else on this list moves
   until this does.** A mutation sweep is what measured the suite's reach: nine
   mutations of `ss2-rules.js` passed all 685 tests. Seven have since been
   closed, and **the fix was never "add an assertion" — it was desaturating the
   fixtures.** The remaining hole is not a test-writing problem: all 22 goldens
   stage `armourclass 0`, eight zero piece ids, no enchantment,
   `fightMode: "misc"`, `attack == defence`, a hero at full health, and damage
   exactly equal to the defender's hitpoints. Three clamp sites can each be
   deleted with the replay file green because no value ever reaches a bound.
   The armour-first split, piece destruction, the breastplate stamina join and
   enchantment status have ZERO runtime backing. The previous brief's ranked
   item 3 — `helmet_defence`/`shoulderguard_defence` via `-WatchFields`, two
   fixtures for one launcher parameter — is now the cheapest route to it.
2. **Give `src/golden/ss2-attack-candidate.js:254-264` its own named claim.**
   `activeEnchantment` returns the PRIMARY potency in both branches, so the
   `equipped_weapon === 2` branch pairs the secondary type with the primary
   potency. Flagged by a verifier and deliberately NOT touched: 22 promoted
   goldens replay against that module, so changing it is an evidence decision.
3. **Close `localeCompare` in `roster.js` and `placeholder-rules.js`.** It is
   ICU-locale-dependent, and `initiativeOrder` uses it, so two peers in
   different locales order a whole battle differently and their
   `combatStateHash` diverges with no other cause. Fixed in `ss2-rules.js`;
   left alone in the other two because initiative has a wider blast radius.
   One line each plus a test.
4. **Decide whether the RNG tape belongs in the hash.** A tape channel's
   `state` is a constant 0, so two peers with different tapes hash identically
   until they diverge. Resolver-contract change.
5. **The adapter path still cannot feed this rule set**, and that is stated
   rather than worked around: `CANONICAL_RESOURCE_SOURCES` carries none of the
   eight armour piece ids, `min_damage`, `max_damage`, `character_level`,
   `equipped_weapon` or `herolevel`. `maximumHealth` refuses loudly instead of
   running on defaults.

## Traps from this session

- **DO NOT OVERRULE THE MAP FROM MEMORY.** The one thing this session got
  materially wrong was writing "the only offset-backed site for that expression
  is `+0x684c`" into a source comment and a test, against a map that said
  otherwise, without reading the bytes. Two verifiers broke it independently.
  **The map's tables and the map's prose disagreed, and the table won because a
  table is what you read when you are implementing.** If you are about to
  contradict the map, read the bytes first — it takes one `inspect-swf` call.
- **A GREEN SUITE OVER SYMMETRIC, SATURATED INPUTS CANNOT SEE.** Every mutation
  that survived did so for a fixture reason, not an assertion reason: the
  defender sat at full stamina so the breastplate join clamped and wrote
  nothing; hero and villain shared `attack == defence` so swapping them was
  invisible; `stamina 4` makes `round(x/3)` and `floor(x/3)` agree. **Mutate
  anything load-bearing before believing a green run.**
- **A TEST CAN PIN THE ENGINE TO DISAGREE WITH THE EVIDENCE.** The replay test's
  `assert.notEqual(hero.staminaleft, golden.expected.state.hero.staminaleft)`
  read as rigour — a positive assertion instead of an exclusion — and was the
  opposite: nineteen fixtures' measured attacker state, asserted away.
- **THE PRESENTATION LAYER IS WHERE A COMBAT DECISION HIDES.** `renderResolution`
  recomputing hit/miss from an effect amount looked like formatting. It was a
  rule the rule set already published, computed a second way, and wrong.
- **A TEST NAMED FOR A GUARD IS NOT THE GUARD.** "the runner decides no combat"
  asserted only that a positive roll count was printed. A mutant that fabricates
  2 damage after every action passed it and all ten of its neighbours. Both
  mutants now fail; the fix was to check the printed before/after pair against
  the printed amount, and the journal length against the cursor.
- **THE SHARED SCRATCHPAD IS NOT PRIVATE BETWEEN CONCURRENT AGENTS.** Three
  verifiers independently reported their throwaway probe scripts being
  overwritten by another agent's file of the same name, and at least one got
  another agent's output back before noticing. **Tell every agent in a wave to
  write to a uniquely-named subdirectory.**
- **THE TREE MOVED UNDER THE VERIFIERS.** The main session edited
  `src/team/ss2-rules.js` after the wave launched. Four verifiers noticed and
  re-ran; that they noticed is the only reason it was harmless. **Freeze the
  work under test before launching a wave.**

## Hard rules

- Licensed SWFs are read-only and hash-verified before and after every capture.
- Never shortcut the game's own frames.
- A candidate becomes golden ONLY via >=2 matching observations from >=2 sessions.
  **Never hand-write a golden, observation or manifest.**
- **Derive candidates from the battle map, never from a capture** — and when you
  think the map is wrong, read the bytes before writing the code that says so.
- **A rule set may never claim a tier it has not earned.** `ss2-rules.js`
  declares `runtimeVerified: false`, pins the build hash, cites map sections and
  the 22 goldens, and a test asserts the citation equals the set actually
  replayed. The hot-seat banner prints the tier and names what has no backing.
- `validate-vehicle.ps1` must PASS after ANY wrapper edit — and read the head
  for the branch its PASS cannot reach.
- Snapshot before every save-mutating run, AND before every restore.
- **Do not push to `main`. Ask before pushing anything.**
- Adversarial verifiers write nothing at all.
- **Do NOT run `/codex:setup --enable-review-gate`.**
