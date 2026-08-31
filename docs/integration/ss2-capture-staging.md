# SS2 capture staging guide

How to stage each committed candidate's scenario in the licensed build for a
controlled capture session (protocol in
[the runtime-capture workflow](ss2-runtime-capture.md)). Every staged value
must be reached through normal play or supported game state — the installed
build is never modified, and `battlevalues` rederives derived stats every
phase, so only derivable states are stageable.

This document answers one question per fixture: **what has to be set up before
a capture of this can even happen?** It is not the capture procedure; that is
the runtime-capture workflow, and it is not the command line either; that is
[the staging runbook](ss2-staging-runbook.md).

## What has superseded parts of this page

This is the oldest planning document in the project. It was written before the
arena route existed, before scenario staging existed, and before the item and
champion tables were decoded, and three of its central conclusions have since
been overturned by work in other documents. Where that has happened the old
reasoning is kept and marked rather than deleted, because the reasoning was
usually sound and only its premise moved.

| This page used to say | Now | Where it was settled |
| --- | --- | --- |
| villain-side armour is not stageable, so most of Groups C–F are blocked | `-StageVillain` overwrites every projected villain key before the action arms | [runbook §0](ss2-staging-runbook.md), verified again below |
| `fight_mode == "tournament"` has never been observed live | reached live, and recorded 40 times in the arena captures | [arena route §3, §12](ss2-arena-route.md) |
| neither duel candidate has a route to the two-observation gate | reachable in principle — staging overrides the generator | [runbook §9](ss2-staging-runbook.md) |
| mid-battle armour wear needs an extra uncontrolled exchange | directly stageable; the refill sits behind a `battle_started` guard | [runbook §0.3](ss2-staging-runbook.md) |
| the spell trace carries no `spell_id` | the wrapper emits it; the blocker is now the missing `magic-damage` event | [runbook §10](ss2-staging-runbook.md) |
| a tournament loss ends the character | false — no flush site is reachable from a bout, the ladder or the loss path | [arena route §3, §12](ss2-arena-route.md) |

**And one thing this page got right that later documents did not.** The
derivation constraint below has always read `round(strength * 2) + weapon_min`.
Several other documents dropped the factor of two. The bytes are
`Push register:3, "strength"; GetMember; Push 2; Multiply; Math.round; Push
register:3, "weapon_min_damage"; GetMember; Add2` at `battlevalues` `+0x3356`
(`root/frame:35/DoAction@0x3fa9dc`), re-read for this revision. The factor is 2.
The **secondary** pair at `+0x33b6`/`+0x33e6` uses 1, which is probably where
the confusion started.

## How to read the evidence column

Every table below carries an evidence marker, because the twenty-two promoted
goldens make it possible to separate what has actually been staged from what
the map says should be stageable.

| Marker | Meaning |
| --- | --- |
| **verified** | the staging was reached in a real capture session against the licensed build; the observed values are recorded in `test/observations/ss2-1v1/` |
| **inferred** | derived from a cited section of [the battle map](ss2-battle-map.md) or the statically read controller vocabulary; never observed |
| **open** | not determined by either; the row says what evidence would settle it |

**What "verified" does and does not cover.** A capture observes the ordered
mutation trace, the semantic events (hit or miss, and which `defender_hurt`
method was dispatched), the result event, the staged and final state dumps,
`attack_direction`, `fight_mode`, and the *number* of `randomBetween` draws in
the armed window. It does **not** observe any roll's bounds or value. The
wrapper's tap sits on `Math.random`, which receives no arguments, so every
`roll` line in a trace is echoed from the tape that session injected — and the
tape was generated from the fixture under test, so the sample comparison
compares a fixture against a copy of itself and can only fail on the count
(runtime-capture §What a match actually establishes). A **verified** row here
therefore means the staging was reached and the observed channels agreed. It
never means an injected bound or value was measured.

Build-behaviour claims cite the battle map by section heading rather than line
number, because that document is under concurrent revision. Claims about the
route *to* a fight — which screens, which fight modes, which opponents — cite
[the leveled-gladiator arena route](ss2-arena-route.md) by numbered section in
the same way; those were byte-read there and are not independently re-decoded
here.

## Derivation constraints (from the verified `battlevalues` map)

| Staged field | Constraint | Stageable? |
| --- | --- | --- |
| `min_damage` / `max_damage` | `round(strength * 2) + weapon_min/max_damage` (`+0x3356`, `+0x3386`) | **no** — an output. Stage `strength` and `weapon` |
| `weapon_min/max_damage` | `_root["weapon" + <side>.weapon][3]` and `[4]` (`+0x31be`, `+0x31da`) | **no** — a table lookup. `weapon` (the id) is the input |
| `hitpointsmax` | `herolevel * 10 + vitality * 20` (`+0x378e`) | **no** — stage `herolevel` and `vitality` |
| `staminamax` | `100 + stamina * 10` (`+0x37b6`) | **no** — stage `stamina` |
| `armourclass_max` | sum of `round(piece * multiplier)` over equipped pieces (breastplate 16, helmet 10, shinguard 6, greaves 3, shoulderguard 8, gauntlet 5, boot 2, shield 12; shield counts 0 while `using_bow`) | **yes mid-battle** — see below |
| `armourclass < armourclass_max` | **now directly stageable** | **yes** |
| `hitpoints < hitpointsmax` | `check_stats` clamps down only, so a value below max survives | **yes**, but the defeat-gate consequence below still binds the fight mode |

The multipliers are `_global.<piece>_dval` literals at `battlevalues`
`+0x3089`–`+0x30f0`, re-read for this revision: 16, 10, 6, 3, 8, 5, 2, 12 in
the order above. The rest of the table comes from map §Combatant state objects.

**Correction — mid-battle armour wear is no longer an engineering problem.**
This section used to say that `armourclass < armourclass_max` was "reachable
only mid-battle (take armour damage first; refills happen while
`battle_started` is false)". The premise was right and the conclusion no longer
follows. The refill block is guarded:

```text
+0x3a90  if (_global.battle_started == true) goto +0x3c0d   // skips 360 bytes
+0x3aa5  hitpoints       = round(hitpointsmax)
+0x3ac3  armourclass_max = <the eight *_defence values summed>
+0x3b0f  armourclass     = armourclass_max
```

and `stepStaging` writes only while `_global.battle_started == true`, i.e. past
the guard. So `armourclass` and `armourclass_max` are never re-derived after
staging, and a staged `armourclass 12` of `armourclass_max 16` survives every
`nextphase` for the rest of the bout. The corollary matters: because the sum is
**not** recomputed mid-battle, staging the raw pieces alone does nothing to the
absorbing pool — stage `armourclass` and `armourclass_max` explicitly, alongside
the pieces. Byte detail and command lines in
[runbook §0.3](ss2-staging-runbook.md).

The one thing that *does* still touch these mid-battle is `check_stats`, and it
only ever clamps **down**: re-read for this revision at overlay `+0x110a`
onward, it forces `staminaleft` into `[0, staminamax]`, `hitpoints` into
`[0, hitpointsmax]` and `armourclass` into `[0, armourclass_max]`, never
raising anything. It has eleven call sites, two of which decide the question —
`nextphase` calls it on every phase transition, and `damagecharacter` calls it
one instruction before the defeat gate. So a staged value *below* its ceiling
is safe and a staged value *above* it is not: `hitpoints 999` survives until
the next transition and then becomes `hitpointsmax`. Stage inputs, not outputs.

Common implied builds in the committed fixtures:

- `staminamax 100`: stamina stat 0; `staminamax 110`: stamina stat 1;
  `staminamax 150`: stamina stat 5.
- `hitpointsmax 40` = level 2 / vitality 1; `50` = level 3 / vitality 1 (or
  level 1 / vitality 2); `60` = level 2 / vitality 2 (or level 4 / vitality 1);
  `300` = level 4 / vitality 13.
- The tutorial pair: hero `30` = level 1 / vitality 1; prisoner `10` =
  level 1 / vitality 0.

### The weapon spread is a table lookup, and one implied weapon does not exist

This section used to say, of the legacy fixtures, "strength 5 with
`min 12 / max 20`, or strength 9 with `min 20 / max 28`: a 2/10-damage weapon in
both cases." **The arithmetic is right and the weapon is not real.**

`_root.weapon0` … `_root.weapon80` plus nine off-shop rows are 90 authored
`Array` literals in `root/frame:35/DoAction@0x3fa9dc` (`+0x3dee`–`+0x4c9c`);
[the item tables](ss2-item-tables.md) decodes all of them, and the numeric
`[3]`/`[4]` columns were re-read from the bytes for this revision. **No row in
the build has `[3] = 2` with `[4] = 10`.** The closest is `weapon41`, `4 / 12`,
whose spread of 8 is the same — so `min 12 / max 20` is producible, but only at
`strength` **4**, and `min 20 / max 28` only at `strength` **8**.

Both `strength` and `min_damage` are projected fields, and `battlevalues`
recomputes `min_damage` on every phase transition, so a fixture asserting
`strength 5` **and** `min_damage 12` cannot be satisfied by any weapon id, by
any staging, in this build. **Fifteen uncaptured candidates carry that pair** —
every legacy physical candidate outside the duel, armoured, tournament and
champion families. They are marked below and the fix is a fixture edit, not a
staging plan.

For contrast, every other uncaptured family's implied weapon *does* exist:

| Family | Implied `[3]/[4]` | Weapon id |
| --- | --- | --- |
| `candidate-armoured-*`, `candidate-tournament-*` (hero, strength 10, 21/23) | 1 / 3 | **`weapon0`**, the starting weapon — do not shop |
| `candidate-champion-*` (hero, strength 30, 68/92) | 8 / 32 | **24** (hacking, gate `strength >= 12`) |
| `candidate-champion-*` (villain, strength 6, 20/44) | 8 / 32 | **24** — the champion's own DNA index 13 |
| `candidate-duel-*` (hero, strength 7, 18/26) | 4 / 12 | **41** (bashing, gate `strength >= 3`) |
| `candidate-duel-absorbed-normal-hit` (villain, strength 2, 8/16) | 4 / 12 | **41** |
| `candidate-duel-firstblood-normal-kill` (villain, strength 2, 8/20) | 4 / 16 | **2**, **21** or **61** (61 is on no shop page; for a staged villain that does not matter) |

A fixture only stages the fields it names, and `capture-session.mjs ingest`
projects an observation onto exactly those fields
(`Object.keys(fixture.scenario.hero)` / `.villain`, `src/golden/capture-ingest.js`).
An unstaged armour piece is therefore not compared: a villain block that stages
`armourclass_max 12` with no piece fields can be satisfied by boot 6, greaves 4,
or shield 1 — whichever the available gladiator happens to wear. That same
projection rule is what makes the duel pair reachable again; see Villain-side
staging.

### The two shop gates, precisely

Both were mis-stated in this project's earlier documents, in opposite
directions.

- **Weapons are attribute-gated, never level-gated.** `weaponbuttons` writes
  `item.itemlevel = weap_i * 3` and `item.attribute_required = hero.speed`
  (ids 1–20 slashing, 61–80 ranged) or `hero.strength` (21–40 hacking, 41–60
  bashing); the `onRelease` gate refuses when `itemlevel > attribute_required`.
  So the real gate is **`3 * band_position <= hero.speed`** or
  **`<= hero.strength`**. `herolevel` appears nowhere in the function. Re-read
  for this revision at `sprite:1961/frame:1/DoAction@0x6110ce` `+0x05e7`
  (attribute), `+0x061e` (`* 3`).
- **Armour is level-gated.** `armourbuttons`' `onRelease` at
  `sprite:1909/frame:1/DoAction@0x5f1fa9` `+0x0b77` compares
  `item.itemlevel > _root.game.hero.herolevel` and takes the refusal arm; so
  the gate is **`itemlevel <= herolevel`**, and armour `itemlevel` is a step
  function of the item number, not `n * 3` (2–4 → 1, 5–6 → 6, 7–9 → 12, …).
  A level 4–5 gladiator can buy item numbers 2, 3 and 4 and nothing else.

Both re-read from the bytes for this revision; the full tables, costs and the
two dead `game_mode == "demo"` refusals are in
[the item tables](ss2-item-tables.md).

## The defeat gate makes most legacy candidates tournament-only

The byte-verified defeat gate (map §Defeat gate and death dispatch) is entered
when `hitpoints <= 0` **or** (`hitpoints < hitpointsmax` **and**
`fight_mode != "tournament"`). The staging consequence, which the earlier
version of this document did not record:

- **Any hit that reaches hitpoints ends a non-tournament fight.** The first
  live captures confirmed this directly for `duel` (map §Defeat gate,
  runtime-resolved note): the fight ends via `death(clip, "yield")` on the
  first hitpoint damage, and a fully armour-absorbed hit does not trigger it.
- The same term covers `misc`, the tutorial prisoner fight's mode, because the
  test is `!= "tournament"`. That is **inferred** from the byte-verified gate;
  every prisoner capture so far has been outright lethal, so the first-blood
  branch has never fired in `misc`.
- Therefore a fixture that applies hitpoint damage and expects **no** result
  event is only reachable in a genuine tournament fight. **Twelve** of the
  legacy physical candidates are in exactly that position, and four of the
  spell candidates; the newer `candidate-armoured-*`, `candidate-tournament-*`
  and `candidate-champion-*` families all stage `fightMode: "tournament"`
  explicitly. (An earlier revision said thirteen physical. Thirteen is the
  count of *tournament-only* legacy physical candidates; the thirteenth,
  `candidate-lethal-result`, is tournament-only for a different reason — it
  stages a defender already at `hitpoints 12` of `40`, which is the gate's
  second term satisfied before the action even begins, so in any other mode
  the bout would already have ended. Note that the *staging* of that state is
  no longer the problem it was: `check_stats` clamps down only, so
  `hitpoints:12` sticks. None of the ten probe candidates is in either set:
  their hit arms kill outright and their miss arms touch nothing.)
- **Corrected — `fight_mode == "tournament"` is no longer unobserved, and it is
  no longer a blocker for anything.** This section used to read "has never been
  observed live"; that was true when it was written and the sentence was left
  standing after the arena route made the mode cheap. It is now reached
  routinely: a level-4 gladiator with `current_tournament == 1` qualifies for a
  four-fighter tournament in arena 2 (arena route §3), and **40 capture lines
  across fifteen logs in `captures/arena-tourn-2`, `arena-tourn-dry`,
  `arena-staged-1`, `arena-staged-2` and `arena-champ-1` read
  `"fightMode":"tournament"` off `_global` at root frame 220**, against 13
  `duel` and 136 `misc`. Treat any row below that says "needs a tournament" as
  a routing requirement, not an unknown.

  The narrower claim that *is* still true: **no ingested observation records
  the mode yet.** All 67 observations under `test/observations/ss2-1v1/` read
  `misc` (66) or `duel` (1), because ingest projects `fight_mode` only when the
  fixture stages it and no tournament-mode fixture has been captured. The first
  successful tournament capture retires that gap for free.

Armour damage does not enter the gate, so mid-battle armour wear
(`armourclass < armourclass_max`) is stageable in any mode.

A fixture that omits `scenario.fightMode` is not asserting the live mode —
ingest only projects `fight_mode` when the fixture stages it. The mode still
binds indirectly, through the result event the capture would or would not
observe.

## The staged fight that produced the goldens (verified)

`run-capture.ps1 -Navigate prisoner` walks the game from its title screen to
the tutorial prisoner battle using the build's own navigation calls, loading
the hero from a saved gladiator slot. Everything below was observed in the
sessions behind `test/fixtures/ss2-1v1-golden/`:

| Staged fact | Observed value |
| --- | --- |
| Fight mode | `misc` (set with `current_arena = 1` at sprite 1788 frame 78 — map §Battle entry and timeline ownership) |
| Hero weapon mode | `equipped_weapon = 1`, `using_bow = false`, forced by the arena construction action (map §Battle entry) |
| Hero (saved slot) | hp 30/30, armour 0/0, strength 10, attack/defence/charisma/magicka 1, damage 21–23, stamina 105/110 at action time |
| Villain (prisoner) | hp 10/10, armour 0/0, every stat 0, damage 1–3, stamina 95/100 at action time |
| Status flags | all `undefined` on the persistent objects until something sets them; the wrapper normalizes them to `false` (map §Combatant state objects) |
| Autopilot | `walkright*5,normal_attack` — five walks carry the hero from `longrange_warrior` into `closerange_warrior`, where the three melee labels live |
| Stamina drift | the five walks cost stamina: 110 → 105 hero, 100 → 95 villain. Staged stamina is a function of the autopilot step count, and an early fixture diverged on exactly this |
| Attack direction | **observed, not forced** — drawn before the recording window arms, so a family needs one candidate per direction |

The one operator-controlled lever **in this loop** is the saved gladiator in the
slot the navigator loads: `run-capture.ps1 -Navigate prisoner` has `-Autopilot`
and `-WatchFields` but no `-Stage*` at all. Equipment, enchantments, weapon
mode, and stats are staged by outfitting that gladiator through normal play
before the session.

**That is no longer the only lever in the project.** `-StageHero` /
`-StageVillain` write `field:value` pairs directly onto `_level1.game.hero` and
`_level1.game.villain` once `battle_started` is true, and they are exposed by
`run-arena.ps1` and `launch-capture.ps1` — not by `run-capture.ps1`. So a
"needs different equipment" row below is a shopping trip **only for the inputs
staging cannot fake**, which after the `battlevalues` audit is a short list:
`weapon` and `secondary_weapon` ids can be staged (they are inputs), the damage
spreads they imply cannot. Which script carries which flag is the runbook's §1,
and it is the one operational fact that decides how each fixture is run:

| Script | `-Stage*` | `-WatchFields` | `-Autopilot` |
| --- | :---: | :---: | :---: |
| `run-arena.ps1` | yes | **no** | **no** |
| `run-capture.ps1` | **no** | yes | yes |
| `run-campaign.ps1` | **no** | **no** | yes |
| `launch-capture.ps1` | yes | yes | yes |

A fixture that stages a `<piece>_defence` name **and** needs a staged opponent
has to go through `launch-capture.ps1`, which has no snapshot guard — take the
snapshot by hand first.

### The twenty-two goldens, and what the probe pairs measured

`test/fixtures/ss2-1v1-golden/` now holds **twenty-two** promoted goldens, of
two different kinds. The earlier revision of this document was written when
there were four, and the revision after that when there were eighteen.

- **Twelve kills.** `golden-prisoner-normal-kill*` (directions 5–8),
  `golden-prisoner-power-kill*` (9–12) and `golden-prisoner-quick-kill*` (1–4)
  — **all three bands are now complete**, twelve directions of twelve. The
  quick band's four kill goldens are the ones this document last recorded as
  *inferred*.
- **Ten probes.** `golden-probe-*`, in five pairs, and a different kind of
  evidence. A probe pair stages this exact fight twice, changes **one**
  injected value between the arms, and is predicted to differ in a channel the
  capture genuinely observes. Repeating a capture adds sessions; a probe adds
  information.

| Pair (`golden-probe-…`) | The one value that moves | The observed channel that separates the arms | What it measured |
| --- | --- | --- | --- |
| `quick-rollneeded-{miss,hit}` | hit roll 26 → 27 | `defender-blocked` → `defender-hurt`, plus mutation trace, final state and draw count | quick-band `rollneeded` at this staging is exactly **27** |
| `normal-rollneeded-{miss,hit}` | hit roll 43 → 44 | as above | normal-band `rollneeded` is exactly **44** |
| `power-rollneeded-{miss,hit}` | hit roll 62 → 63 | as above | power-band `rollneeded` is exactly **63** |
| `deflection-threshold-{critical,cleared}` | deflection roll 99 → 100 | the dispatched `defender_hurt` method **alone** — `critical` → `normal` | the critical-deflection threshold is inclusive at exactly **100** against a defender with no helmet and no greaves |
| `armour-removal-gate-{below,above}` | removal roll 66 → 67 | the **draw count** alone — one extra `randomBetween(1, 2)` | the removal gate is `> 66`, and `remove_armour` draws its group selection *before* testing whether the piece is equipped |

Three consequences worth carrying forward.

- The three `rollneeded` brackets together settle the dispatcher's hit
  comparison as `diceroll >= rollneeded`, not `>`. Each pair brackets one
  band's smallest hitting roll between adjacent integers, and the three results
  (27, 44, 63) are exactly `100 - chance` for the mapped chances 73 / 56 / 37
  at this staging's ratio. A strict reading would need chances 74 / 57 / 38, and
  no factor in the map's `attack_chances` table yields any of them at that
  ratio (map §Chance calculation, §Attack roll dispatcher).
- The last two pairs are the sharpest evidence the set has, because each moves
  exactly one channel and nothing else: the deflection pair leaves mutations,
  final state and draw count identical; the removal pair leaves events,
  mutations and final state identical. Neither can be satisfied by a fixture
  agreeing with itself.
- The deflection pair pins the *comparison*, not the *formula*. Both arms are
  staged against the unarmoured prisoner, so the threshold under test is
  `100 - 0 + 0`. The helmet/greaves operand mix is still unobserved.
  `candidate-deflection-threshold-discriminator` was the fixture that would
  settle it, and it has since been **superseded by a strictly stronger
  instrument**: `candidate-champion-deflection-threshold-discriminator`. The
  champion's `helmet` field is 102 while his `helmet_defence` is 25, so the two
  rival readings are −51 and 64.5 rather than 83 and 87 — far enough apart that
  one bans criticals against him entirely and the other allows them, which
  separates the readings in *two* observed channels (the dispatched
  `defender_hurt` method and the mutation trace) instead of one injected roll
  sitting between two close numbers.

The experimental-design contract these pairs have to keep is asserted in
`test/ss2-probe-fixtures.test.js`, which fails if a later edit quietly turns a
probe back into a pair whose arms differ only in echoed values.

## What a session costs

**The prisoner route writes the save on every run.** An earlier version of this
section claimed the route was save-neutral because town square is the only
flush site and the route never enters it. That reasoning is wrong, and it was
wrong in a way that mattered: `refresh_gladiators` ends unconditionally with
`SharedObject.getLocal("ss2_data")` and a `flush()`, and it is called from root
frame 35 (`new_or_continue`) and root frame 84 (`load_saved_gladiators`) —
both of which the navigator passes through, at `navStep 0` and `navStep 1`.
Every capture session to date has flushed the store twice before reaching a
fight.

What is true, and what the evidence base actually rests on, is narrower and
was verified rather than reasoned: the write is a near-identity rewrite, so the
*content* does not change. `ss2_data.sol` has been byte-identical — 679 bytes,
SHA-256 `6A06E9E8...` — before and after every capture, checked against a
snapshot, while its modification time moves. So the data is safe, but that
safety is a property of what `refresh_gladiators` happens to write, not of the
route avoiding it.

The distinction is load-bearing because the same function carries a **reset
branch**: if `so_local.max_gladiators` reads as `undefined`, `0` or `NaN`, it
blanks `character1`…`character11` to `"Empty,0"`, sets the count to zero, and
flushes. That is almost certainly the "last writer wins" clobbering the
launcher already warns about. Snapshot `ss2_data.sol` around **every** session,
not only levelled ones.

**A levelled session is not save-neutral.** Root frame 150 calls
`save_character(_global.current_character)` on *every* entry to the town
square; `save_character` re-derives the hero, writes it into
`so_local["character" + n]`, then calls `SharedObject.getLocal("ss2_data")`
and flushes it. There is no path from `daybreak` to the arena foyer that avoids the
town square, and the reward button returns through it after each win — so gold,
experience, level, equipment and the battle counters are persisted at least
twice per fight loop (arena route §8).

Three things follow for anything staged on the levelled route, which from here
on is most of this page:

- The capture protocol's install-hash attestation covers the SWF, not the
  SharedObject, so a mutated save will never surface as a verification
  failure. It has to be handled by procedure, not by the pipeline.
- Use a **dedicated capture slot**, and copy `ss2_data.sol` before the session
  and restore it after. `tools/runtime-capture/save-state.ps1` snapshots and
  restores it, and `run-arena.ps1` refuses to start without a fresh snapshot
  name and takes the snapshot itself. Without that, session 2 of a family is
  staged differently from session 1 — which is exactly the class of divergence
  this pipeline already had to chase once, over five walks' worth of stamina
  drift.
- **Corrected — a tournament loss does NOT end the character.** This bullet
  used to read "a tournament **loss ends the character**", and treated it as
  the reason a backup mattered. The byte fact it rested on is real and
  unchanged: `sprite:2249/frame:315` `+0x03a2` branches on
  `tournament_in_progress` into the game-over path instead of the ordinary loss
  panel. What does not follow is the consequence. Losing the *screen* is not
  losing the *slot*: `save_character` has exactly three call sites (root frame
  150 `+0x0585`, button 1565 `+0x02d6`, button 2042 `+0x020f`) and **none is
  reachable from a bout, the ladder, the win chain or the loss path** (arena
  route §3). Observed: 22 `ABORT:battle-lost` lines across `captures/arena-*`,
  twelve of them to the rank-1 champion, and the gladiator survived every one —
  it lost gold and battle counters that had never been flushed.

  The backup still matters, for the reason in the two bullets above rather than
  this one; and `run-arena.ps1 -Attempts N` deliberately does *not* restore on
  retry, because the save already holds every completed bout.

**Sessions can run in parallel, and the save is what decides which ones.**
`run-campaign.ps1 -Concurrency N` gives each session its own SharedObject store
seeded byte-identically from the real save; three rounds in 35 s with three
matches and zero divergences is the measured figure. The scope limit follows
from this page's own subject: per-session stores **fork** the save, which is
right for a prisoner campaign, where every session stages the same gladiator
from the same starting point, and wrong for the arena route, which must
**accumulate** across bouts. `-Concurrency > 1` is refused for any navigator
but `prisoner`. Group A is therefore the only group this parallelism helps, and
it is already fully promoted.

## Villain-side staging

The operator cannot freely set opponent stats, and the three fights now mapped
differ enormously in how much control there is — enough that the difference
decides which fights are worth capturing at all. An earlier revision of this
section said the duel opponent was "drawn by the game". That understates it
badly, and the correction is the most consequential one on this page.

- **Tutorial prisoner fight**: the villain is fixed (the all-zero prisoner).
  There is no villain-side staging; a fixture must be authored to it. Every
  golden in the set comes from this one fight.
- **Ordinary arena duel**: the opponent is **procedurally generated, not drawn
  from a roster**, and it is regenerated on every entry.
  `randomise_gladiator(villain, avatar, hero.herolevel)` builds a fresh
  gladiator at the hero's own level: appearance from four `RandomNumber` opcode
  draws; `statpoints = ceil(herolevel * 5) - 8` spread by a distribution loop
  driven by two more opcode draws; weapons, ammunition and enchantments from a
  long run mixing `randomBetween` calls **and** further opcode draws; armour
  per piece, plus a matched-suit path that sets all eight pieces at once when
  its own opcode draw clears (arena route §2). The gate that might have
  suppressed regeneration reads `_global.fightstarted`, which is assigned
  nowhere in the build, so it reduces to `fight_mode == "duel"` and always
  fires. Two live duel captures drew two different opponents — one wearing
  helmet 2 + shield 2 (`armourclass_max 44`), one with no armour at all — which
  is why `candidate-duel-absorbed-normal-hit` has a divergence report against
  the session that produced `candidate-duel-firstblood-normal-kill`. That was
  not bad luck; it is what the generator does every time.
- **Tournament bout**: the whole field is **pre-generated once**, when the
  foyer's `tournament` span first runs, behind a `tournament_in_progress`
  guard, and is not redrawn between bouts. The hero enters at
  `tournament_ranking = tournament_max_gladiators` and loses one rank per win;
  `_root.game.villain` is bound from the ranking before the fight, and root
  frame 214's `randomise_gladiator` call sits behind the duel gate, so it
  leaves the binding alone. Rank 1 is the tournament boss (arena route §3).

> **Duels are not a viable capture target, and tournaments are.** The AVM1
> `RandomNumber` opcode is neither injectable nor recordable by the wrapper,
> and the duel generator uses it for appearance, for the stat distribution
> itself, and for the armour suit. So a duel opponent cannot be chosen, cannot
> be reproduced, and cannot be reconstructed from the trace even with a fully
> injected tape — not partially, and not with more sessions. Every duel capture
> is a single unrepeatable observation, which means no duel candidate can ever
> clear the two-observation promotion gate except by coincidence. A tournament
> field, by contrast, is generated once, fixed by ranking, stable across the
> whole ladder, and **inspectable before you commit**: the ladder objects are
> live at `_root.game.villain1 … villainN` and on screen at the foyer before
> the first bout, so a session can read the whole field's stats and armour and
> decide whether to proceed. Read every villain-side staging requirement in the
> groups below as a tournament requirement.

### Correction — the block above is sound about the generator and wrong about the conclusion

Every sentence in it about `randomise_gladiator` still holds; two live
qualifications have since been added to the *tournament* half, and the *duel*
half's conclusion has been overturned outright. Keeping the paragraph is the
point: it is the record of why the project wrote off two committed fixtures.

**What overturned it is a capability that did not exist when it was written.**
The block reasons about what a capture can *observe* and *reconstruct*. But
promotion does not compare a capture against the generator's output; it
compares a capture against the fixture, and it compares **only the keys the
fixture names**:

```js
// src/golden/capture-ingest.js
villain: projectFields(staged.villain.fields, Object.keys(fixture.scenario.villain), …)
```

`-StageVillain` writes any `field:number` pair onto that same
`_level1.game.villain` object, for 20 frames after `battle_started`, before the
action arms (`applyStageSide`, `stepStaging`). So every key the projection will
look at is overwritten after the generator has finished and before anything
reads it. **The un-interceptable draw stops mattering, because nothing that is
compared survives it.** That closes the gap the block called permanent, and it
closes it for duels as well as tournaments.

Four qualifications the block did not have:

- **Every projected field must be staged, including zeroes.** A generated
  opponent that turns up wearing a breastplate fails the final-state comparison
  unless the fixture's zeroes are staged too.
- **The tournament field is only partly inspectable.**
  `_root.game.villain1` is an empty `Object` — foyer frame 22 creates it and
  then builds the champion into `_root.game.champion` instead — and derived
  fields (`hitpointsmax`, `armourclass`, `min_damage`, `max_damage`) read
  `undefined` until that villain has been through `skincharacter` as the active
  villain. What is readable up front is `attack`, `defence` and the per-piece
  tiers (arena route §3).
- **Staging a ladder object persists for the rest of that tournament**, because
  `game.villain` is an alias of `game["villain" + (ranking − 1)]`. Restore the
  snapshot between attempts; never chain two captures in one ladder.
- **The one opponent that needs no staging at all** is tournament rank 1.
  `unleash_hell` builds it from a hard-coded `charDNA` literal and contains
  zero RNG of any kind; "John the Butcher", `hitpointsmax` 110,
  `armourclass` 86, identical across twelve independent launches. Its every
  combat field is decoded in [the champion DNA map](ss2-champion-dna.md).

Three routes now exist, and the distinction above decides which applies:

1. **Stage it.** Overwrite the villain's projected fields with `-StageVillain`
   and let the generator draw whatever it likes. This is the route for the
   `armoured`, `tournament` and duel families, and it is the reason the "cannot
   be drawn twice" objection no longer decides anything.
2. **Inspect, then commit** — tournaments only, and now largely superseded by
   route 1. Read the pre-generated field at the foyer and enter only if a
   ranked opponent matches. Useful when a fixture's villain block is *not*
   fully projected, or as a sanity check before spending a ladder.
3. **Capture first, author second.** Capture against whatever opponent turned
   up and author a **new** candidate from the observed staged state: ingest
   records the observed values, the mismatch with the intended fixture surfaces
   as an explicit scenario divergence, and a candidate with the observed
   scenario can be generated through the resolver and verified on the next
   session. The pipeline is built for this direction too — evidence first,
   fixture second. Both duel candidates and the whole prisoner family were
   authored this way. This is no longer the *only* route for a duel.

## Reachability groups

`test/ss2-fixture-files.js` is the authority on what is committed. It
**discovers** `test/fixtures/ss2-1v1/` from disk and classifies each fixture by
its declared action identity — `scenario.attackDirection` into
`SS2_FIXTURE_FILES` (physical, replayed through
`resolveSs2PhysicalAttackCandidate`), `scenario.spellId` into
`SS2_SPELL_FIXTURE_FILES` (spell, `resolveSs2SpellDamageCandidate`) — and
asserts the two are disjoint, together cover the directory, and that every
discovered fixture is actually replayed. It is no longer a hand-kept roster, so
a new fixture cannot be missing from it. The set
grows steadily, so treat those two lists as the count and the table below as a
partition of them, not of a number. At the time of writing that is **52
physical and 8 spell** candidates — up from 39 physical at the last revision,
the thirteen new ones being the five `candidate-armoured-*`, the three
`candidate-tournament-*` and the five `candidate-champion-*`. Twenty-two are
promoted, so **38 are uncaptured**.

**This table's verdicts were the most out-of-date thing on the page.** Its
premise was that most of the set was unreachable; that is now largely false.
[The staging runbook](ss2-staging-runbook.md) carries the per-fixture detail
and one runnable command line each — read it for *how*, and this table for
*what stands in the way*. Do not duplicate its commands here.

| Group | Fixtures | Uncaptured | Binding constraint, as it stands |
| --- | --- | ---: | --- |
| A | prisoner kills + probes | 0 | **none** — all 22 promoted, all three bands complete |
| **H** | `candidate-armoured-*` | 5 | **none. Reachable now** with `-StageVillain`; runbook §3 |
| **I** | `candidate-tournament-*` | 3 | **none. Reachable now**; runbook §4. `tournament-nonlethal-normal-hit` is the cheapest capture in the set |
| **J** | `candidate-champion-*` | 5 | conditional — the ladder reaches rank 2 reliably and the opponent is reproducible, but the hero must enter at a staged level with full stamina or the wrapper refuses to arm |
| B | duel | 2 | **no longer the opponent.** A second, *lower*-level gladiator (`herolevel < tournament_level_required`), plus two weapon ids that this revision names |
| C | legacy armour | 6 | **the hero build does not exist** — implied weapon 2/10 |
| D | ranged and bash | 3 | same 2/10 hero; plus a secondary weapon and an unproven `swap_weapons` autopilot |
| E | tournament-only, no equipment | 5 | same 2/10 hero; plus a boolean-status blocker on `lethal-result` and an open question on `taunt` |
| F | grievous | 1 | same 2/10 hero; plus the `psyche_up` chain and its `herolevel` question |
| G | spell | 8 | **the wrapper** — no `magic-damage` event and no arming site on the ingress |

(The runbook letters its families differently; when cross-reading, match on the
fixture prefix rather than the letter.)

**Scoreboard.** 8 uncaptured candidates are reachable with the tooling exactly
as it stands (H and I). 5 more are conditional on the champion gate (J). 2 are
reachable in principle but need a second gladiator (B). 8 are blocked in the
wrapper (G). **15 cannot be captured as written at all** (C, D, E, F), and the
blocker is not staging — it is that their hero's `strength` / `min_damage` /
`max_damage` triple corresponds to no weapon row in the build. That is a
fixture edit, and it is not this document's to make.

The runbook's own scoreboard says "9 more behind one read-only weapon-table
sweep". **That sweep has been done** — [the item tables](ss2-item-tables.md)
decodes all 90 weapon rows — and its answer for those fixtures is negative.
See *The weapon spread is a table lookup* above.

No committed fixture *resolves* on a path that is entirely opcode-rolled. The
only `RandomNumber` opcode samples inside a fixture's own roll stream are the
cosmetic `armour-debris-*` rolls of `candidate-armour-removal-debris`, and
those are excluded from observation matching on both sides, so they block
nothing. The genuinely unreachable-by-design paths named in the runtime-capture
workflow — range taunts and other opcode-rolled decisions that make no
`randomBetween` call — have no fixture, by design. This says nothing about how
a combatant was *built*: the duel opponent is opcode-generated before the roll
stream begins (see Villain-side staging) — which used to be a staging blocker
even though it never appears in a tape, and is one no longer, because staging
overwrites the generator's output before anything compares it.

### Group A — reachable with the staged tutorial fight

Same navigation, same saved gladiator, same prisoner. Only the autopilot's
final label changes, because `power_attack`, `normal_attack`, and
`quick_attack` all live on controller frame 13 (`closerange_warrior`).

| Fixture | Direction/action | Staging notes | Evidence |
| --- | --- | --- | --- |
| `candidate-prisoner-normal-kill` | 7 (`normal_attack`) | the staged fight exactly as above | **verified** — promoted to `golden-prisoner-normal-kill` |
| `candidate-prisoner-normal-kill-dir5` | 5 | as above | **verified** — promoted |
| `candidate-prisoner-normal-kill-dir6` | 6 | as above | **verified** — promoted |
| `candidate-prisoner-normal-kill-dir8` | 8 | as above | **verified** — promoted |
| `candidate-prisoner-power-kill-dir9` | 9 (`power_attack`) | autopilot `walkright*5,power_attack`; no new staging | **verified** — promoted to `golden-prisoner-power-kill-dir9` |
| `candidate-prisoner-power-kill-dir10` | 10 | as above | **verified** — promoted |
| `candidate-prisoner-power-kill-dir11` | 11 | as above | **verified** — promoted |
| `candidate-prisoner-power-kill-dir12` | 12 | as above | **verified** — promoted |
| `candidate-prisoner-quick-kill-dir1` | 1 (`quick_attack`) | autopilot `walkright*5,quick_attack`; no new staging | **verified** — promoted to `golden-prisoner-quick-kill-dir1` |
| `candidate-prisoner-quick-kill-dir2` | 2 | as above | **verified** — promoted |
| `candidate-prisoner-quick-kill-dir3` | 3 | as above | **verified** — promoted |
| `candidate-prisoner-quick-kill-dir4` | 4 | as above | **verified** — promoted |

The last four rows read **inferred** at the last revision, with the note that
"only the kill tape is unobserved". They have since been captured; all twelve
melee directions now carry a kill golden.

The three bands are separate campaign families: their injectable tapes differ
(normal draws `randomBetween(min,max)` then a 1–20 critical; power takes
`max_damage` with a 5–20 critical; quick takes `min_damage` with a −20..20
critical and no knockback roll), and injection is tape-positional, so one
`run-campaign.ps1` run covers one band.

The ten probe candidates stage this same fight and reuse
`candidate-prisoner-normal-kill-dir5`'s scenario verbatim — same gladiator,
same prisoner, same `misc` mode, same attacker side. Only the tape differs, so
each pair is one more family for the campaign loop and needs no new staging at
all. All ten are promoted; the evidence they carry is set out under
[The twenty-two goldens](#the-twenty-two-goldens-and-what-the-probe-pairs-measured).

| Fixture pair | Direction | Staging notes | Evidence |
| --- | --- | --- | --- |
| `candidate-probe-quick-rollneeded-{miss,hit}` | 1 (`quick_attack`) | as the staged fight; arms differ only in the injected hit roll (26 / 27) | **verified** — both promoted |
| `candidate-probe-normal-rollneeded-{miss,hit}` | 5 (`normal_attack`) | as above (43 / 44) | **verified** — both promoted |
| `candidate-probe-power-rollneeded-{miss,hit}` | 9 (`power_attack`) | as above (62 / 63) | **verified** — both promoted |
| `candidate-probe-deflection-threshold-{critical,cleared}` | 5 | as above; injected critical 20 and deflection roll 99 / 100 | **verified** — both promoted |
| `candidate-probe-armour-removal-gate-{below,above}` | 5 | as above; injected removal roll 66 / 67 | **verified** — both promoted |

The miss arms are the cheapest rows in the whole set: a miss calls no
`damagecharacter`, so its tape is two or three samples long and its expected
mutation trace is empty.

### Group H — `candidate-armoured-*` (5). Reachable now.

Tournament bout on the levelled route, staged opponent, direction 5,
`normal_attack`. All five stage the *same* hero, and the hero side wants to be
**real, not staged**: the block decodes to a specific gladiator rather than an
arbitrary one.

| Fixture value (hero) | Required input |
| --- | --- |
| `min_damage 21` / `max_damage 23` at `strength 10` | `weapon0`, the starting weapon — **do not shop** |
| `hitpointsmax 300` | `herolevel 4` with **`vitality 13`** |
| `staminamax 110` | `stamina 1` — the tutorial value |
| `staminaleft 105` | five walks from 110, or stage it |
| `armourclass_max 0` | all eight pieces 0 — **do not buy armour** |
| `attack`/`defence`/`charisma`/`magicka 1`, `strength 10` | untouched tutorial values, i.e. a **vitality-only** levelling |

That is snapshot `level4-vitality-tournament-gate`, and it is what the fixtures
were authored to. Root frame 214 full-heals the hero at battle construction
(`hero.hitpoints = hero.hitpointsmax` at `+0x02a9`), so
`hitpoints == hitpointsmax` before staging runs and the `check_stats` clamp
problem never arises on the hero side.

> **Check this before the first run, and do not stage around it.** The
> `level4-vitality-tournament-gate` level-up log reads `hitpointsmax` **220**,
> which `herolevel 4 + vitality 13` cannot produce. The explanation on record is
> that 220 is the *pre-spend* value — `battlevalues` had last run before the
> four points went in — and that the next `battlevalues` produces 300. That is
> consistent and it has never been read back live. One passive run reports the
> hero's fields. If it really reads 220, the gladiator is at `vitality 9` and
> needs the remaining points spent through the game's own level-up screen;
> staging `vitality:13` instead works, but adds the clamp race below to a
> fixture family that does not otherwise have one.

The villain side is where staging does the work. `randomise_gladiator` builds
each ladder rank at the hero's own level, and `-StageVillain` then overwrites
every projected key:

| Fixture value (villain) | Required input |
| --- | --- |
| `hitpointsmax 80` | `herolevel 4` + `vitality 2` |
| `armourclass_max 79` | helmet 6 (60) + shoulderguard 1 (8) + greaves 2 (6) + gauntlet 1 (5), **and `armourclass`/`armourclass_max` staged directly** |
| `armourclass_max 22` | helmet 2 (20) + boot 1 (2), same |
| `defence 3` | staged raw |

The chance the fixtures encode falls straight out:
`round(((1 + 9) / (3 + 9)) * 100 * 0.50) = 42`, `rollNeeded 58` — which is why
`hero.attack 1` and `villain.defence 3` are both load-bearing and neither may
drift.

**Staging notes that are not obvious:**

- Stage the raw piece **and** its `<piece>_defence`. The defence values are
  recomputed unconditionally as `round(piece × dval)`, so the write is a no-op
  — but ingest refuses a trace whose staged dump lacks a field the fixture
  stages, and the wrapper must dump it.
- `-WatchFields` is additive onto a 28-name default that omits the defence
  names. Only the two `removal-destroys-*` fixtures in this family need it
  (`helmet_defence,shoulderguard_defence`), which is why **three of the five
  run on `run-arena.ps1` unmodified** and two must go through
  `launch-capture.ps1`.
- **Direction attrition is the dominant cost, not the staging.**
  `normal_attack` draws `randomBetween(5, 8)` *before* the tape is served, so a
  direction-5 fixture matches roughly one bout in four; with the
  two-observation gate that is about eight successful bouts per fixture. The
  wrapper has no attacker-side gate either, so a bout where the villain swings
  first arms on his attack and diverges. Both cost a restore and a rerun.
- **The clamp race is the one genuinely unproven part.** Staging `vitality:2`
  and `hitpoints:80` together is correct only if `battlevalues(villain)` runs
  before the last `check_stats(villain)` inside the 20-frame staging window.
  Repetition makes that likely, not certain. The failure mode is an ingest
  **refusal** naming the field rather than a silent match, which is the right
  way round — but do not plan as though it cannot happen.
- **Restore the base snapshot between every attempt.** Staging writes onto the
  ladder object, and a win advances `tournament_ranking`, which re-binds
  `game.villain` to a different one.

Per-fixture villain blocks, watch fields and the command lines are
[runbook §3](ss2-staging-runbook.md).

### Group I — `candidate-tournament-*` (3). Reachable now, and cheapest.

Same hero as Group H, direction 5, `normal_attack`, **no extra watch fields at
all**. These three exist to exercise the defeat gate's first-blood term, which
is why they are the first fixtures that *need* the mode rather than merely
tolerating it.

| Fixture | Villain | What it asserts |
| --- | --- | --- |
| `tournament-nonlethal-normal-hit` | `ac 0/0`, no pieces | 22 straight to hitpoints and **no result event** — the whole point |
| `tournament-boundary-at-max` | `ac 22/22`, helmet 2 + boot 1 | armour 22 → 1, hitpoints untouched |
| `tournament-boundary-below-max` | identical | armour 22 → −1, 1 hitpoint, clamp to 0 |

`tournament-nonlethal-normal-hit` stages no armour at all, so the only staging
is stripping whatever the generator drew. It is the single cheapest uncaptured
capture in the set. Treat a *mode* mismatch on any of the three as a finding,
not a failed run: they would be the first ingested observation of
`fight_mode == "tournament"` in the archive.

### Group J — `candidate-champion-*` (5). Conditional on the hero, not the opponent.

The one bout in the build with a **reproducible** opponent. `unleash_hell`
builds `_root.game.champion` from a hard-coded `charDNA` literal with no RNG of
any kind, and `skincharacter` derives every combat field from it: `hitpointsmax`
110, `armourclass` 86, `min_damage` 20 / `max_damage` 44 from `weapon24`,
`helmet` 102 capped to `helmet_defence` 25 by the `helmet > 25` arm. Twelve
independent launches read the same numbers. Every value is decoded in
[the champion DNA map](ss2-champion-dna.md); this page adds only the staging.

**The hero is the part that is not free**, and it is what the whole family turns
on:

- experience per bout is a *generated* opponent's `character_xp`, so the hero
  levels 4 → 5 after the rank-2 bout in most runs but not all; and
  `staminaleft` carries across bouts, because `battlevalues` resets it only
  when it is already `<= 0`. Both are projected fields, so two sessions
  differing in either cannot match.
- The wrapper therefore **refuses to arm** unless `staminaleft == staminamax`
  and `herolevel == -ArenaStagedLevel`. It refused 382 times in one observed
  champion bout, for exactly those two reasons. A silent non-match becomes a
  visible refusal, which is the point.
- The staging is `-ArenaStagedLevel 5` plus a hero staged **on inputs only**:
  `herolevel 5`, `strength 30`, `weapon 24`, `attack 3`, `vitality 10`,
  `speed 2`, `stamina 5`, and eight armour zeroes. `speed 2` and `stamina 5`
  are chosen together so a walk phase costs less than `nextphase` restores,
  which is what lets the full-stamina gate ever pass.
- **Winning is not required.** The wrapper arms on the first `checkattackroll`
  and closes the trace on that call's return, so the evidence is one action.
  A vitality-only gladiator is 0 for 12 against this opponent and it does not
  matter.

Only three bands are reachable for this hero — quick (1–4), normal (5–8) and
power (9–12) — because nothing can start him in close range and the approach
turns are unavoidable. `psyche_up` is out at `herolevel 5`, and the bow
directions need a `swap_weapons` turn nobody has driven.

### Group B — the duel pair. Reachable in principle for the first time.

Ordinary arena duel with the operator's real gladiator (`fight_mode = "duel"`;
hero greaves 4 + boot 4, `armourclass_max 20`).

| Fixture | Direction/action | Staging notes | Evidence |
| --- | --- | --- | --- |
| `candidate-duel-firstblood-normal-kill` | 8 (`normal_attack`) | duel against an unarmoured opponent with damage 8–20; the whole tape injected | **verified** — one matching observation (`obs-20260830-e1`) |
| `candidate-duel-absorbed-normal-hit` | 5 | duel against an opponent wearing helmet 2 + shield 2 (`armourclass_max 44`), damage 8–16; the hit must stay fully absorbed so the first-blood gate does not fire | **verified** for the opponent's existence (observed in a live duel), **open** for the fixture as written |

An earlier revision said of the first row that "a second independent session
against the same draw is all that stands between it and promotion", and the
revision after that called it a dead end:

> `randomise_gladiator` regenerates the duel opponent on every entry, using
> `RandomNumber` opcode draws the wrapper can neither record nor inject, so the
> same draw cannot be asked for — the campaign loop can retry an attack
> direction, but nothing can retry an opponent. **Neither Group B fixture has a
> route to the two-observation promotion gate**, and neither should be planned
> for.

**Every clause of that is still true about the generator, and the conclusion no
longer follows.** It was sound when the wrapper could only observe. Ingest
projects exactly the keys the fixture names, and `-StageVillain` can write every
one of them before the action arms, so the draw is overwritten before anything
compares it. The reasoning is kept because it is the record of why two
committed fixtures were written off.

What actually stands in the way now, in order of cost:

1. **A second, lower-level gladiator.** The duel button is hidden exactly when
   `herolevel >= tournament_level_required`, which is **4** for
   `current_tournament == 1`. So a level-4 gladiator cannot duel — observed
   four times as `ABORT:duel-button-hidden` reading `"level":4,"required":4`.
   `herolevel` 2–3 duels; 4+ tournaments only, until tournament 1 is won. This
   is the real cost of the family, not the opponent.
2. **Two weapon ids, which this revision names.** `min_damage`/`max_damage` are
   outputs, so the villain's `weapon` id must be staged instead. From the
   decoded table: `duel-absorbed`'s villain (`strength 2`, 8/16) is
   `[3]/[4] = 4/12` → **`weapon41`**; `duel-firstblood`'s villain
   (`strength 2`, 8/20) is `4/16` → **`weapon2`**, **`weapon21`** or
   **`weapon61`** (61 is on no shop page, which does not matter for a staged
   villain). The hero on both (`strength 7`, 18/26) is also `4/12` → **41**,
   purchasable at `strength >= 3`. `-Stage* weapon:<n>` has never been run —
   the field is read by `battlevalues` at `+0x31be` so it should work, but the
   sprite and `weapon_range` side effects are unexamined.
3. **Hero armour**: greaves 4 + boot 4. Armour is level-gated
   (`itemlevel <= herolevel`), and greaves/boot item 4 is `itemlevel 1`, so a
   level-2 gladiator can buy both.

**Verdict: reachable in principle, lowest priority of the reachable set.**

### Groups C, D, E and F share one blocker, and it is not staging

The fifteen fixtures in these four groups all carry the same hero build —
`strength 5` with `min_damage 12` / `max_damage 20`, or `strength 9` with
`20 / 28` for `candidate-grievous-knockback`. Both imply a weapon whose
`[3]`/`[4]` are **2 and 10**, and *The weapon spread is a table lookup* above
shows no such row exists in the build.

`min_damage` is recomputed from `strength` and the weapon table on every phase
transition, and `strength` is projected too, so no staging and no purchase can
satisfy both at once. **These fifteen cannot be captured as written.** The
group-by-group blockers below are all still real and still worth reading — they
are what remains once the hero is fixed — but none of them is the first thing
in the way any more.

The fix is a fixture edit and is outside this document's ownership. For the
record, the arithmetic that would work: `weapon41` (`4 / 12`) gives
`min 12 / max 20` at `strength` **4** and `min 20 / max 28` at `strength`
**8** — a one-token change to `scenario.hero.strength` in each file, with the
tape's damage-roll bounds unchanged.

### Group C — needs different equipment

Reachable with the same close-range warrior once the saved gladiator or the
opponent carries the right pieces. Each also needs a tournament fight unless
the hit is fully absorbed; the fight-mode column notes which. **Read every row
with the 2/10 hero caveat above.**

| Fixture | Direction/action | Equipment to stage | Also needs | Evidence |
| --- | --- | --- | --- | --- |
| `candidate-armour-overflow-burning` | 5 | hero weapon enchantment type 2, potency 5; villain breastplate 1, `armourclass 12` of `armourclass_max 16` | tournament (8 damage overflows to hitpoints). The worn armour is now **staged directly** — this row used to say "one extra uncontrolled exchange to wear the armour", which the `battle_started` guard makes unnecessary | **inferred** — map §Combatant state objects for the sum, §Hit and damage path for the overflow |
| `candidate-armour-equality-quirk` | 5 | villain armour totalling 12 (boot 6 is the fixture's implied build) | tournament — the quirk applies the full original damage to hitpoints *as well*; the damage roll must land exactly on 12, so the tape must be injected | **inferred** — map §Hit and damage path, transient/boundary note |
| `candidate-armour-removal-debris` | 5 | villain helmet 1 + shield 2 (`armourclass_max 34`) | nothing — 12 damage is fully absorbed, so any fight mode works. This is the most cheaply reachable Group C row | **inferred** |
| `candidate-deflection-threshold-discriminator` | 5 | villain helmet 10 + greaves 2 (`armourclass_max 106`) | tournament (the surviving critical bypasses armour); injected critical 20 and deflection 85 — the roll sits between the rival readings 83 < 85 < 87 and that is the entire point | **inferred** — map §Attack roll dispatcher, flagged operand mix |
| `candidate-power-critical-armour-bypass` | 9 (`power_attack`) | villain breastplate 1 (`armourclass_max 16`) | tournament; the critical sample must survive deflection at 20 | **inferred** |
| `candidate-frozen-enchantment-proc` | 5 | hero weapon enchantment type 3, potency 5 | tournament (12 damage reaches hitpoints) | **inferred** |

Enchanted weapons are hero-side staging: outfit the saved gladiator before the
session, or stage `weapon_enchantment_type` / `_potency` as numbers — untested.
`enchant_weapon` (`sprite:2023/frame:1`) is the game's own path.

**Corrected — "villain-side armour is not stageable" no longer holds.** This
paragraph used to end "read every row above as *inspect a tournament field for
it, or author the fixture from what turns up*", because the tutorial prisoner
is unarmoured and a generated opponent could not be chosen. Both premises still
hold; the conclusion does not. `-StageVillain` writes the pieces,
`armourclass` and `armourclass_max` directly, and because the re-sum sits
behind the `battle_started` guard the staged pool survives the whole bout. Read
every row above as "stage it" instead — with the caveat that the prisoner route
has no `-Stage*` script, so even `armour-removal-debris`, which needs no
tournament at all because its 12 damage is fully absorbed by 34 armour, has to
go through `launch-capture.ps1`.

Four of the six also need extra `-WatchFields`, because they stage
`<piece>_defence` names the wrapper's 28-name default omits:
`helmet_defence,shield_defence` for `armour-removal-debris`, `boot_defence` for
`armour-equality-quirk`, `helmet_defence,greaves_defence` for
`deflection-threshold-discriminator`, and
`equipped_weapon,weapon_enchantment_type,weapon_enchantment_potency` for the
two enchantment rows.

`power-critical-armour-bypass` is direction **9**, and the arena route's
`aggressive` policy only ever issues `normal_attack`. Reaching the power band
needs an explicit autopilot **and** an empty policy — and no session has ever
driven the arena route from an autopilot. That is open, and it is shared with
Groups D, E and F.

### Group D — needs a secondary weapon and a `swap_weapons` turn

`bombardleft|right` and `snipeleft|right` live on controller frame 20
(`longrange_archer`) and `bash_attack` on frame 28 (`closerange_archer`).
The arena construction action forces `equipped_weapon = 1` and
`using_bow = false` for every fight (map §Battle entry), so a gladiator always
starts on a warrior controller and something has to flip it. This is equipment
plus one spent turn, not a wrapper change — but an earlier revision of this
heading said "needs the bow weapon mode ... a gladiator that owns a bow", and
that is stricter than the build:

- The only manual route to `using_bow` is the battle inventory overlay's
  `swap_inventory.onRelease` → `getphase("swap_weapons")`; no controller frame
  wires `swap_weapons` (map §Weapon mode and `swap_weapons`). The button is
  hidden when the hero has no secondary weapon, so **a secondary weapon of any
  kind** is the real gate — the `swap_weapons` phase never checks that it is a
  bow, it just sets `equipped_weapon = 2` and `using_bow = true`.
- Buying any weapon-shop item in the ranged band writes
  `hero.secondary_weapon`, and weapon bands are gated on an attribute
  (ranged on `speed`, displayed as Agility), **not** on level (arena route §6).
  The gate is now exact: **`3 * band_position <= hero.speed`** for the ranged
  and slashing bands, `<= hero.strength` for hacking and bashing; the
  `attribute_required` field the earlier reading tripped over does not hold a
  requirement, it holds a snapshot of the hero's own attribute. A ranged item
  is still the right staging, because `bombard`/`snipe` damage comes from
  `secondary_min_damage`/`secondary_max_damage` and the ranged phase decrements
  `ammo_left` — but the gate on *reaching* the archer controllers is weaker
  than this document assumed. Ranged id **61 is on no shop page** and can never
  be bought; 62 is the cheapest reachable one, at `speed >= 6`.
- **The shop refuses a vitality-only gladiator everything**, which is what a
  `level4-vitality-tournament-gate` snapshot is. Observed live as twenty-five
  successive refusals walking ids 40 down to 14. Stage `speed` or `strength` at
  the town square before the shop, not at battle start.
- The turn itself costs a phase. Budget `swap_weapons` as the autopilot's first
  step; the wrapper passes unrecognised labels through to `getphase` rather
  than blocking them, so `-Autopilot 'swap_weapons,…'` should reach it —
  **inferred**, never run.

| Fixture | Direction/action | Staging notes | Evidence |
| --- | --- | --- | --- |
| `candidate-bombard-threshold` | 21 (`bombardleft`/`bombardright`) | secondary weapon swapped in; no armour either side; tournament (15 damage reaches hitpoints). Which of the two labels the direction comes from is unmapped, and ammunition/range staging is untested | **inferred** for the controller frame; **open** for left/right and range |
| `candidate-snipe-shield-boost` | 22 (`snipeleft`/`sniperight`) | secondary weapon swapped in **with shield 10 still equipped** — the flagged chance boost reads `game_attacker.shield`, while `battlevalues` scores the shield as 0 armour while `using_bow` (map §Combatant state objects, §Chance calculation). Tournament | **inferred**; **open** whether the shield stays equipped in bow mode |
| `candidate-bash-inherited-critical` | 23 (`bash_attack`) | a prior action must leave `criticalhit` at 20 and the transient must survive to this one; tournament | **inferred**; see the `shove` question below |

**Open — does `shove` also produce direction 23?** `shove` sits on *both*
`closerange_warrior` (frame 13) and `closerange_archer` (frame 28), and
neither the map nor the controller vocabulary records which
`attack_direction` it assigns. If `shove` is the direction-23 site, then
`candidate-bash-inherited-critical` leaves Group D entirely and becomes
reachable with the tutorial gladiator. One unattended round with
`-Autopilot 'walkright*5,shove'` settles it, because the wrapper records
`attack_direction` passively.

### Group E — needs a tournament fight, a non-lethal finish, or both

No equipment problem; the blocker is the fight itself. Four of the five also
need the END-key non-lethal finish, which no capture has exercised yet (the
wrapper README lists it as not-yet-validated: every session so far ended
lethally). `candidate-lethal-result` is the exception — its action kills.

| Fixture | Direction/action | Staging notes | Evidence |
| --- | --- | --- | --- |
| `candidate-normal-threshold-hit` | 5 (`normal_attack`) | no armour either side, both attack 11 / defence 11 (chance 50); villain 40 hp. Tournament — 12 damage reaches hitpoints and the fixture expects no defeat | **inferred** |
| `candidate-normal-miss-roll-order` | 5 | same pair; the hit roll must miss. A miss touches no hitpoints, so the defeat gate never opens — this and `candidate-armour-removal-debris` are the only two legacy candidates reachable in any fight mode. It needs the miss (passive, or an injected 49) and the non-lethal finish | **inferred** |
| `candidate-quick-threshold-profile` | 2 (`quick_attack`) | no armour; threshold diceroll 34 injected; tournament | **inferred** |
| `candidate-lethal-result` | 5 | villain pre-damaged to 12 of 40 **and** already `burning`. The pre-damage is no longer a problem — `check_stats` clamps `hitpoints` *down* only, so `hitpoints:12` stages cleanly. The `burning` flag is; see below. The action itself is lethal, so no END-key finish is needed | **inferred**, and **blocked** on the boolean |
| `candidate-taunt-charisma-floor` | 20 (`taunt`) | hero charisma 5 vs villain charisma 30; the 1–3 floor roll must be injected; tournament. `taunt` is on `longrange_warrior` (frame 13 is not needed) so it is reachable *without* walking into close range and without a bow — drop the walks from the autopilot | **open** — see the tension below |

**Blocked — boolean statuses cannot be staged.** `parseStageList` refuses any
value `isNum` rejects and emits a `stage-refused … "why":"not-a-number"` line
rather than writing it, so `-StageVillain "burning:true"` writes nothing at
all. `burning:1` writes the *number* 1, and the wrapper's
`normalizeFieldValue` only maps `undefined` → `false` for the six status names
— it does not map 1 → `true` — so the staged dump would report `1` against the
fixture's `true` and ingest would diverge. Three fixtures are affected:
`candidate-lethal-result`, `candidate-spell-first-blood-duel` and
`candidate-spell-lethal-slain`. The options are (a) let the game set the flag
by taking an uncontrolled exchange against an enchanted opponent first —
uncontrollable, (b) a one-line wrapper change to pass `true`/`false` through
unconverted. **(b) is out of this document's ownership; it is reported, not
made.**

**Open — is the direction-20 taunt observable at all?** The runtime-capture
workflow lists "range taunts and other opcode-rolled paths" as out of scope
because they make no `randomBetween` call, while the same document's campaign
section records `taunt 20` as a fixed `attack_direction` assignment at
`+0x6981` and the map's dispatcher table gives direction 20 both a
`taunt_percentage` and a `randomBetween(1, 3)` floor roll. Those cannot both
describe the same code path. This has since been narrowed rather than settled:
the taunt phase reaches the `+0x6981` assignment only when
`taunt_effect = randomBetween(1, 2)` returns 1 at `+0x6952`, and that draw
happens **before** arming, so it is uninjectable — half of all taunts never
reach the dispatcher at all, on top of the `taunt_percentage` comparison and
the 60-tick `taunttimer` watchdog. One unattended round with
`-Autopilot 'taunt' -ArenaPolicy ''` still resolves it: either the trace
records `attack_direction = 20` with the mapped rolls, or it records no
`randomBetween` call and the fixture is genuinely unreachable.

### Group F — needs the `psyche_up` discharge chain

**Correction, and it is now confirmed from the bytes rather than from the map.**
This group used to read "no player action is known to produce the direction",
and cited the absence of a `getphase` label mapping to direction 30. That was
wrong. Re-read for this revision in `sprite:862[overlay]`:

- the `psyche_up` phase writes `attack_direction = 30` and then calls
  `checkattackroll()` at **two** sites, one per facing — `+0x669e`/`+0x66a9`
  and `+0x6717`/`+0x6722`, each behind the range gate;
- `psyche_up` **is** a `getphase` label: `Push "psyche_up", 1, "getphase";
  CallFunction` appears on both facings of controller frame 5
  (`+0x0dec`, `+0x127e`) and both facings of frame 13 (`+0x0b8b`, `+0x0f95`),
  and the archer frames the same way;
- the gate is a `_visible` test on the slot, not on the phase: frame 13 facing
  right hides `optionG` below `herolevel` 3 (`+0x0785`… `Push 3`) and
  `optionH` — the `psyche_up` slot — below `herolevel` **7**
  (`+0x07ba`… `Push 7`). Frame 28 uses `Push 3` for the same slots.

Direction 30 is not unreachable. It is a levelled-gladiator unlock.

| Fixture | Direction/action | Staging notes | Evidence |
| --- | --- | --- | --- |
| `candidate-grievous-knockback` | 30 (grievous) | hero strength 9 with a 2/10 weapon — **which does not exist**, see Groups C–F above; villain breastplate 1, 50 hp, `armourclass 4` of `armourclass_max 16`, now directly stageable (the knockback force uses the overflow remainder, not the selected damage — map §Attack roll dispatcher). Tournament, and the discharge chain below | **inferred** — the direction's producer and its gating are byte-verified; no session has yet driven `psyche_up` at all |

What reaching direction 30 now requires, in order of cost:

1. **A gladiator whose controller wires `psyche_up`.** It is hidden below
   `herolevel` 7 on the two warrior controllers and below `herolevel` 3 on the
   two archer controllers (map §Buttons wired per controller frame). Level 7
   with any weapon, or level 3 with a secondary weapon swapped in, are the two
   cheapest doors. Whether that gate binds an *autopilot* is a separate
   question — see below.
2. **Range.** `psyche_up` is one of only two phases that gate on distance,
   comparing `attacker._x` against `defender._x -/+ round(weapon_range + 50)`
   by facing. Out of range the phase decides nothing at all: no roll, no
   damage, no death. That threshold is wider than the close-range controller's,
   so `walkright*5` already satisfies it.
3. **Three uninterrupted `psyche_up` turns.** The counter plays `psyche_up`,
   `psyche_up2`, `psyche_up3` at values 1, 2 and >= 3, and only the third
   discharges the grievous. Any non-`psyche_up` hero decision resets the
   counter through `nextphase`, and **any damage the hero takes resets it**
   through `damagecharacter`. So the autopilot is five walks followed by
   `psyche_up` three times over, and it is fragile: one connecting blow from
   the opponent during those three turns and the count restarts at 1. This,
   not the direction, is the real staging cost.
4. **The fixture's own scenario.** This used to be listed as "a Group C/E
   problem on top", and two thirds of it has since dissolved: the armoured
   opponent worn to 4 of 16 is now a two-field `-StageVillain` write rather
   than an exchange to engineer, and `tournament` mode is a routing choice.
   What is left is the hero's nonexistent 2/10 weapon, which is a fixture
   problem rather than a staging one.

Two things a first `psyche_up` session would settle for free. The map records a
**static candidate** that after a discharge the counter is written back to 1
and then incremented again in a later tick of the same phase, landing on 2
rather than 1 and so shortening the *next* chain; two consecutive presses
recorded live decide it. And it would resolve the tension in item 1: the
herolevel test hides the *button*, while the map's byte-verified note says the
phase machine never consults the controller frame, so a driver calling
`getphase("psyche_up")` should reach the phase whatever the level. The
wrapper's own readiness model assumes the opposite and would report a stall.
**Open**, and cheap — one unattended round on the tutorial gladiator, which is
level 1 and therefore below both gates, distinguishes the two outcomes
outright.

`cast_whirlwind` also writes 30, at `+0x79d0`/`+0x7a49` behind the same range
gate, but it is a `cast_*` phase label with no autopilot route (Group G,
blocker 2), so it is not a second door.

`chargeleft`/`chargeright` remain not the answer: charge impacts were observed
live with `attack_direction` **undefined**, not 30 — the charge sites write the
value as a member on the fighter clip, and `checkattackroll` reads the overlay
timeline variable and never sees it (map §Where `attack_direction` is assigned,
runtime-observed note).

### Group G — spell ingress

All eight replay through `resolveSs2SpellDamageCandidate` and carry
`scenario.spellId` (the caller's inventory id), not an attack direction:
`magic_damage_character` has no direction chain (map §Spell ingress). The
ingress makes no RNG call of its own, so the single tape sample belongs to the
caller's mapped `randomBetween` range.

| Fixture | Spell (id) | Staging notes | Evidence |
| --- | --- | --- | --- |
| `candidate-spell-fireball-armour-absorbed` | fireball (30) | duel; villain helmet 6 + shield 5 (`armourclass_max 120`) absorbs 100 — the absorbed hit must not trip the first-blood gate | **inferred** |
| `candidate-spell-breastplate-stamina-absorbed` | lightning bolt (34) | tournament; **villain casts**; hero breastplate 7 (`armourclass_max 112`) absorbs 100 and still gains stamina | **inferred** |
| `candidate-spell-armour-equality-quirk` | fireball (30) | tournament; villain armour exactly 120 and the roll exactly 120 — injection required | **inferred** |
| `candidate-spell-armour-overflow-remainder` | fireball (30) | tournament; same 120 armour, roll 121, so exactly 1 overflows | **inferred** |
| `candidate-spell-armour-depleted-full-damage` | lightning bolt (34) | tournament; villain breastplate 3 + helmet 6 (`armourclass_max 108`) already worn to 0 mid-battle | **inferred** |
| `candidate-spell-raw-fractional-damage` | fireball (30) | villain `armourclass 90.5` of 96 (breastplate 6) | **open** — flagged `synthetic-fractional-armour`; every mapped direct-damage spell rolls an integer and the physical path ceils, so no mapped route to a fractional `armourclass` is known. Settled by a live capture that records one, or by mapping a caller that applies fractional armour damage |
| `candidate-spell-first-blood-duel` | fireball (30) | duel; villain unarmoured and already `burning`, hero already `taunted1`; 80 damage reaches hitpoints and yields | **inferred** |
| `candidate-spell-lethal-slain` | dire fireball (32) | `misc`; **villain casts**; hero breastplate 6 (`armourclass_max 96`) and already `poison`; 400 damage leaves 304 after armour and kills | **inferred** |

Four blockers apply to the whole group. The first has been closed since this
list was written; the second and third are new here and are the real ones.

1. ~~**The trace carries no `spell_id`.**~~ **Closed.** The wrapper now emits
   it in `beginAction`, reading `overlay.spell_id` and falling back to
   `_global.spell_id`, and ingest reads it from the same `var` line. This was
   the item the list called "small"; it was, and it is done.
2. **The wrapper emits no `magic-damage` event, so ingest cannot key the
   dispatch.** `deriveExpectedEventsFromSs2Fixture` pushes
   `{ type: "magic-damage", … }` for every fixture carrying `scenario.spellId`,
   and ingest keys the death dispatch on
   `events.some(e => e.type === "magic-damage")` — but the hook is registered
   as `registerSlot(…, "magic_damage_character", makeHookMaker("damagecharacter"))`,
   so a spell trace emits the *physical* label and never the event it needs.
3. **The recording window never opens on a cast.** `beginAction()` is called
   from exactly two sites — the `attack_chances` hook and the `checkattackroll`
   hook. `magic_damage_character` runs through neither, and `check_spells` is
   hooked without arming. Nothing about the spell ingress is observable until
   an arming site exists.
4. **No autopilot route to a hero-side cast.** The `cast_*` strings are
   `phase_decision` labels consumed by the attacker's `onEnterFrame` state
   machine, and there is no callable `cast_spell` function (map §Spell and
   vanilla AI surface). No `getphase` label casts anything, so the autopilot
   cannot reach a cast the way it reaches `normal_attack`; the battle
   inventory overlay would have to be driven instead.
5. **Villain-side casts cannot be forced.** `villain_cast_spells` rolls an
   inclusive 1–100 and enters its fixed-priority item chain only above 10 (map
   §Spell and vanilla AI surface). That roll is a `randomBetween` call the
   fixtures do not carry, so a villain-cast capture is expected to record at
   least one sample ahead of the fixture's — an **inference** that the first
   spell trace will confirm or refute. Both villain-cast fixtures also need
   the spell in the opponent's inventory, which is a draw, not a setting.

Every mapped direct-damage spell also needs high magicka and the item in
inventory, and the fixtures' hitpoint totals (150–300) imply gladiators well
beyond the tutorial pair.

**Verdict: 8 of 8 blocked in the wrapper, not on staging** — and unlike every
other blocker on this page, this one has a small, named fix (an event emission
on the `magic_damage_character` hook plus an arming site). Two of the eight
carry the boolean-status blocker on top, and one — `spell-raw-fractional-damage`
— became *newly reachable in principle* the day staging arrived, since
`Number("90.5")` parses and staging is now the only known route to a fractional
`armourclass`. All of that is moot until the ingress arms. **The wrapper edits
are not this document's to make.**

## Wrapper launch values

`node tools/capture-session.mjs tape --fixture <candidate.json>` prints the
`tape` FlashVars string for the wrapper (randomBetween samples only — opcode
debris rolls are neither injectable nor recordable). For a whole family,
`node tools/runtime-capture/campaign.mjs seed` nominates the tape instead, and
refuses when a family's members disagree about their injectable samples.

The other launch values (ids, timestamps, `hashBefore`) come from the session
protocol; the post-session hash attestation is stamped by `ingest`, never at
launch. `attack_direction` is never a launch value — it is observed.

`launch-capture.ps1` derives the tape from `-FixturePath` itself, so a session
driven through it never passes a tape by hand. The `armoured-*`,
`removal-destroys-*` and `tournament-boundary-*` pairs differ only in one
injected sample while sharing `attackDirection 5`, so a two-member family both
collides on the action key and disagrees about its tape: **run each as a
one-member family**, using the full fixture id as `--family`.

## What is still genuinely unreachable, and what would unblock it

| Fixtures | Needs |
| --- | --- |
| the 15 in Groups C, D, E and F | a hero whose `strength` / `min_damage` / `max_damage` triple matches a real weapon row. A fixture edit |
| all 8 `candidate-spell-*` | a `magic-damage` event on the `magic_damage_character` hook, and an arming site on the spell ingress. A wrapper edit |
| `candidate-lethal-result`, `candidate-spell-first-blood-duel`, `candidate-spell-lethal-slain` | `-Stage*` to pass `true`/`false` through unconverted. A wrapper edit |
| `candidate-taunt-charisma-floor` | proof that direction 20 arms at all — `taunt_effect` is drawn pre-arm |
| `candidate-grievous-knockback` | proof that `getphase("psyche_up")` reaches the phase below `herolevel 7` |
| `candidate-bash-inherited-critical` | a secondary weapon, or proof that `shove` produces direction 23 |
| every non-`normal_attack` direction on the arena route | one run proving `-Autopilot` with `-ArenaPolicy ''` drives it. Never done |
| the duel pair | a second gladiator at `herolevel` 2–3 |

Nothing on this page any longer claims a fixture is unreachable because its
opponent cannot be chosen, because parallel capture is impossible, or because
`fight_mode == "tournament"` cannot be reached. All three were true once and
none is true now.
