# SS2 capture staging guide

How to stage each committed candidate's scenario in the licensed build for a
controlled capture session (protocol in
[the runtime-capture workflow](ss2-runtime-capture.md)). Every staged value
must be reached through normal play or supported game state — the installed
build is never modified, and `battlevalues` rederives derived stats every
phase, so only derivable states are stageable.

This document answers one question per fixture: **what has to be set up before
a capture of this can even happen?** It is not the capture procedure; that is
the runtime-capture workflow.

## How to read the evidence column

Every table below carries an evidence marker, because the eighteen promoted
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

| Staged field | Constraint |
| --- | --- |
| `min_damage` / `max_damage` | `round(strength * 2) + weapon_min/max` |
| `hitpointsmax` | `herolevel * 10 + vitality * 20` |
| `staminamax` | `100 + stamina * 10` |
| `armourclass_max` | sum of `round(piece * multiplier)` over equipped pieces (breastplate 16, helmet 10, shinguard 6, greaves 3, shoulderguard 8, gauntlet 5, boot 2, shield 12; shield counts 0 while `using_bow`) |
| `armourclass < armourclass_max` | reachable only mid-battle (take armour damage first; refills happen while `battle_started` is false) |
| `hitpoints < hitpointsmax` | reachable only mid-battle **and** only in a tournament fight — see the defeat-gate consequence below |

All rows above come from map §Combatant state objects.

Common implied builds in the committed fixtures:

- strength 5 with `min 12 / max 20`, or strength 9 with `min 20 / max 28`:
  a 2/10-damage weapon in both cases.
- `staminamax 100`: stamina stat 0; `staminamax 110`: stamina stat 1.
- `hitpointsmax 40` = level 2 / vitality 1; `50` = level 3 / vitality 1 (or
  level 1 / vitality 2); `60` = level 2 / vitality 2 (or level 4 / vitality 1).
- The tutorial pair: hero `30` = level 1 / vitality 1; prisoner `10` =
  level 1 / vitality 0.

A fixture only stages the fields it names, and `capture-session.mjs ingest`
projects an observation onto exactly those fields. An unstaged armour piece is
therefore not compared: a villain block that stages `armourclass_max 12` with
no piece fields can be satisfied by boot 6, greaves 4, or shield 1 — whichever
the available gladiator happens to wear.

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
  physical candidates are in exactly that position, and four of the spell
  candidates. (An earlier revision said thirteen physical. Thirteen is the
  count of *tournament-only* legacy physical candidates; the thirteenth,
  `candidate-lethal-result`, is tournament-only for a different reason — it
  stages a pre-damaged defender, and `hitpoints < hitpointsmax` is itself
  reachable only mid-battle in a tournament. None of the ten probe candidates
  is in either set: their hit arms kill outright and their miss arms touch
  nothing.)
- `fight_mode == "tournament"` has never been observed live. Every capture
  records it for free, so the first tournament session settles it — and the
  arena route has since shown the mode is cheap to reach (§3): a level-4
  gladiator with `current_tournament == 1` qualifies for a four-fighter
  tournament in arena 2.

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

The one operator-controlled lever in this loop is the **saved gladiator in the
slot the navigator loads**. Equipment, enchantments, weapon mode, and stats are
staged by outfitting that gladiator through normal play before the session.
Every "needs different equipment" row below is therefore a shopping trip, not a
tooling gap.

### The eighteen goldens, and what the probe pairs measured

`test/fixtures/ss2-1v1-golden/` now holds **eighteen** promoted goldens, of two
different kinds. The earlier revision of this document was written when there
were four.

- **Eight kills.** `golden-prisoner-normal-kill*` (directions 5–8) and
  `golden-prisoner-power-kill*` (9–12) — both bands complete. The quick band
  has no *kill* golden yet, though quick attacks have been captured live (see
  the probes below).
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
  `100 - 0 + 0`. The helmet/greaves operand mix is still unobserved, and
  `candidate-deflection-threshold-discriminator` is still the fixture that
  would settle it.

The experimental-design contract these pairs have to keep is asserted in
`test/ss2-probe-fixtures.test.js`, which fails if a later edit quietly turns a
probe back into a pair whose arms differ only in echoed values.

## What a session costs

The prisoner route is save-neutral. `daybreak` sends a level-1 hero straight to
the dungeon, and the one site that flushes the game's SharedObject sits on the
town-square frame, which that route never enters.

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
  and restore it after. Without that, session 2 of a family is staged
  differently from session 1 — which is exactly the class of divergence this
  pipeline already had to chase once, over five walks' worth of stamina drift.
- A tournament **loss ends the character**: the loss chain branches on
  `tournament_in_progress` into the game-over path instead of the ordinary loss
  panel (arena route §3). An unattended tournament campaign must treat a loss
  as terminal for that slot, so the backup above is the difference between one
  lost round and one lost gladiator.

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

Two routes remain, and the distinction above decides which one applies:

1. **Inspect, then commit** — tournaments only. Read the pre-generated field at
   the foyer and enter only if a ranked opponent matches a committed
   candidate's villain block (attack/defence/vitality/pieces). This is the
   closest thing to opponent selection the build offers.
2. **Capture first, author second.** Capture against whatever opponent turned
   up and author a **new** candidate from the observed staged state: ingest
   records the observed values, the mismatch with the intended fixture surfaces
   as an explicit scenario divergence, and a candidate with the observed
   scenario can be generated through the resolver and verified on the next
   session. The pipeline is built for this direction too — evidence first,
   fixture second. Both duel candidates and the whole prisoner family were
   authored this way. For a duel this is the *only* route, and it stops at one
   observation: the promotion gate needs two sessions that agree, and the
   opponent cannot be drawn twice.

## Reachability groups

`test/ss2-fixture-files.js` is the authority on what is committed. It splits
`test/fixtures/ss2-1v1/` into `SS2_FIXTURE_FILES` (physical candidates, replayed
through `resolveSs2PhysicalAttackCandidate`) and `SS2_SPELL_FIXTURE_FILES`
(spell candidates, replayed through `resolveSs2SpellDamageCandidate`), and
asserts the two lists are disjoint and together cover the directory. The set
grows steadily, so treat those two lists as the count and the table below as a
partition of them, not of a number. At the time of writing that is **39
physical and 8 spell** candidates — up from 29 physical when this document was
last revised, the ten new ones being the probe pairs, all of them in group A.

| Group | Fixtures | Binding constraint |
| --- | --- | --- |
| A | 22 | none — reachable with the staged tutorial fight as it stands |
| B | 2 | the arena duel's generated opponent, which can be neither chosen nor redrawn |
| C | 6 | different equipment on one side |
| D | 3 | a secondary weapon and a `swap_weapons` turn |
| E | 5 | a tournament fight, or a non-lethal finish, or both |
| F | 1 | the `psyche_up` discharge chain — a levelled gladiator and three uninterrupted turns |
| G | 8 | the spell ingress has no autopilot route and no `spell_id` in the trace |

No committed fixture *resolves* on a path that is entirely opcode-rolled. The
only `RandomNumber` opcode samples inside a fixture's own roll stream are the
cosmetic `armour-debris-*` rolls of `candidate-armour-removal-debris`, and
those are excluded from observation matching on both sides, so they block
nothing. The genuinely unreachable-by-design paths named in the runtime-capture
workflow — range taunts and other opcode-rolled decisions that make no
`randomBetween` call — have no fixture, by design. This says nothing about how
a combatant was *built*: the duel opponent is opcode-generated before the roll
stream begins (see Villain-side staging), and that is a staging blocker even
though it never appears in a tape.

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
| `candidate-prisoner-quick-kill-dir1` | 1 (`quick_attack`) | autopilot `walkright*5,quick_attack`; no new staging | **inferred** for this fixture; the *band* is **verified** — `golden-probe-quick-rollneeded-hit` was captured live at direction 1 from this exact staging, so only the kill tape is unobserved |
| `candidate-prisoner-quick-kill-dir2` | 2 | as above | **inferred**; band verified, this direction not yet recorded |
| `candidate-prisoner-quick-kill-dir3` | 3 | as above | **inferred**; band verified, this direction not yet recorded |
| `candidate-prisoner-quick-kill-dir4` | 4 | as above | **inferred**; band verified, this direction not yet recorded |

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
[The eighteen goldens](#the-eighteen-goldens-and-what-the-probe-pairs-measured).

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

### Group B — reachable, but the opponent cannot be reproduced

Ordinary arena duel with the operator's real gladiator (`fight_mode = "duel"`;
hero greaves 4 + boot 4, `armourclass_max 20`).

| Fixture | Direction/action | Staging notes | Evidence |
| --- | --- | --- | --- |
| `candidate-duel-firstblood-normal-kill` | 8 (`normal_attack`) | duel against an unarmoured opponent with damage 8–20; the whole tape injected | **verified** — one matching observation (`obs-20260830-e1`), and that is where it stops |
| `candidate-duel-absorbed-normal-hit` | 5 | duel against an opponent wearing helmet 2 + shield 2 (`armourclass_max 44`), damage 8–16; the hit must stay fully absorbed so the first-blood gate does not fire | **verified** for the opponent's existence (observed in a live duel), **open** for the fixture as written — no session has matched direction 5 against that draw |

An earlier revision said of the first row that "a second independent session
against the same draw is all that stands between it and promotion." That is now
known to be a dead end. `randomise_gladiator` regenerates the duel opponent on
every entry, using `RandomNumber` opcode draws the wrapper can neither record
nor inject, so the same draw cannot be asked for — the campaign loop can retry
an attack direction, but nothing can retry an opponent. **Neither Group B
fixture has a route to the two-observation promotion gate**, and neither should
be planned for. Both are best read as what they are: two honest one-shot
observations that document what a duel looks like. A committed candidate that
needs an armoured opponent belongs on the tournament route instead.

### Group C — needs different equipment

Reachable with the same close-range warrior once the saved gladiator or the
opponent carries the right pieces. Each also needs a tournament fight unless
the hit is fully absorbed; the fight-mode column notes which.

| Fixture | Direction/action | Equipment to stage | Also needs | Evidence |
| --- | --- | --- | --- | --- |
| `candidate-armour-overflow-burning` | 5 | hero weapon enchantment type 2, potency 5; villain breastplate 1 (`armourclass_max 16`) worn down to 12 mid-battle | tournament (8 damage overflows to hitpoints); one extra uncontrolled exchange to wear the armour | **inferred** — map §Combatant state objects for the sum, §Hit and damage path for the overflow |
| `candidate-armour-equality-quirk` | 5 | villain armour totalling 12 (boot 6 is the fixture's implied build) | tournament — the quirk applies the full original damage to hitpoints *as well*; the damage roll must land exactly on 12, so the tape must be injected | **inferred** — map §Hit and damage path, transient/boundary note |
| `candidate-armour-removal-debris` | 5 | villain helmet 1 + shield 2 (`armourclass_max 34`) | nothing — 12 damage is fully absorbed, so any fight mode works. This is the most cheaply reachable Group C row | **inferred** |
| `candidate-deflection-threshold-discriminator` | 5 | villain helmet 10 + greaves 2 (`armourclass_max 106`) | tournament (the surviving critical bypasses armour); injected critical 20 and deflection 85 — the roll sits between the rival readings 83 < 85 < 87 and that is the entire point | **inferred** — map §Attack roll dispatcher, flagged operand mix |
| `candidate-power-critical-armour-bypass` | 9 (`power_attack`) | villain breastplate 1 (`armourclass_max 16`) | tournament; the critical sample must survive deflection at 20 | **inferred** |
| `candidate-frozen-enchantment-proc` | 5 | hero weapon enchantment type 3, potency 5 | tournament (12 damage reaches hitpoints) | **inferred** |

Enchanted weapons are hero-side staging: outfit the saved gladiator before the
session. Villain-side armour is not stageable in the tutorial fight at all (see
Villain-side staging). It *is* now reachable, because `randomise_gladiator`
gives generated opponents armour and enchanted weapons at the hero's own level
— but only the tournament route makes that usable, since a tournament field can
be inspected for the right pieces before the bout and a duel opponent cannot.
Read every row above as "inspect a tournament field for it, or author the
fixture from what turns up".

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
  A ranged item is still the right staging, because `bombard`/`snipe` damage
  comes from `secondary_min_damage`/`secondary_max_damage` and the ranged phase
  decrements `ammo_left` — but the gate on *reaching* the archer controllers is
  weaker than this document assumed.
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
| `candidate-lethal-result` | 5 | villain pre-damaged to 12 of 40 **and** already `burning`. Both are mid-battle states, and a pre-damaged defender is tournament-only by the defeat gate. The action itself is lethal, so no END-key finish is needed | **inferred** |
| `candidate-taunt-charisma-floor` | 20 (`taunt`) | hero charisma 5 vs villain charisma 30; the 1–3 floor roll must be injected; tournament. `taunt` is on `longrange_warrior` (frame 13 is not needed) so it is reachable *without* walking into close range and without a bow — drop the walks from the autopilot | **open** — see the tension below |

**Open — is the direction-20 taunt observable at all?** The runtime-capture
workflow lists "range taunts and other opcode-rolled paths" as out of scope
because they make no `randomBetween` call, while the same document's campaign
section records `taunt 20` as a fixed `attack_direction` assignment at
`+0x6981` and the map's dispatcher table gives direction 20 both a
`taunt_percentage` and a `randomBetween(1, 3)` floor roll. Those cannot both
describe the same code path. One unattended round with `-Autopilot 'taunt'`
resolves it: either the trace records `attack_direction = 20` with the mapped
rolls, or it records no `randomBetween` call and the fixture is genuinely
unreachable.

### Group F — needs the `psyche_up` discharge chain

**Correction.** This group used to read "no player action is known to produce
the direction", and cited the absence of a `getphase` label mapping to
direction 30. That was wrong, and the battle map's own `attack_direction`
assignment table contradicted it: the `psyche_up` phase writes
`attack_direction = 30` at two sites, one per facing, and `psyche_up` **is** a
`getphase` label — wired on `optionH`/`optionG` by every one of the four
controllers (map §Where `attack_direction` is assigned, §Buttons wired per
controller frame). Direction 30 is not unreachable. It is a levelled-gladiator
unlock.

| Fixture | Direction/action | Staging notes | Evidence |
| --- | --- | --- | --- |
| `candidate-grievous-knockback` | 30 (grievous) | hero strength 9 with a 2/10 weapon; villain breastplate 1, 50 hp, armour worn to 4 of 16 mid-battle (the knockback force uses the overflow remainder, not the selected damage — map §Attack roll dispatcher). Tournament, and the discharge chain below | **inferred** — the direction's producer and its gating are byte-verified in the map; no session has yet driven `psyche_up` at all |

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
4. **The fixture's own scenario**, which is a Group C/E problem on top: an
   armoured opponent (breastplate 1) worn to 4 of 16 mid-battle, and
   `tournament` mode so the hit does not end the fight. Read it with the
   tournament route.

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

Three blockers apply to the whole group, in increasing cost:

1. **The trace carries no `spell_id`.** `capture-session.mjs ingest` projects
   `scenario.spellId` from a `spell_id` trace variable, and the capture
   wrapper emits `fight_mode`, `attack_direction`, `criticalhit`, and
   `phase_action` — never `spell_id`. Ingest refuses the trace. This is the
   only item on the whole page that is a tooling gap rather than a staging
   requirement, and it is small.
2. **No autopilot route to a hero-side cast.** The `cast_*` strings are
   `phase_decision` labels consumed by the attacker's `onEnterFrame` state
   machine, and there is no callable `cast_spell` function (map §Spell and
   vanilla AI surface). No `getphase` label casts anything, so the autopilot
   cannot reach a cast the way it reaches `normal_attack`; the battle
   inventory overlay would have to be driven instead.
3. **Villain-side casts cannot be forced.** `villain_cast_spells` rolls an
   inclusive 1–100 and enters its fixed-priority item chain only above 10 (map
   §Spell and vanilla AI surface). That roll is a `randomBetween` call the
   fixtures do not carry, so a villain-cast capture is expected to record at
   least one sample ahead of the fixture's — an **inference** that the first
   spell trace will confirm or refute. Both villain-cast fixtures also need
   the spell in the opponent's inventory, which is a draw, not a setting.

Every mapped direct-damage spell also needs high magicka and the item in
inventory, and the fixtures' hitpoint totals (150–300) imply gladiators well
beyond the tutorial pair.

## Wrapper launch values

`node tools/capture-session.mjs tape --fixture <candidate.json>` prints the
`tape` FlashVars string for the wrapper (randomBetween samples only — opcode
debris rolls are neither injectable nor recordable). For a whole family,
`node tools/runtime-capture/campaign.mjs seed` nominates the tape instead, and
refuses when a family's members disagree about their injectable samples.

The other launch values (ids, timestamps, `hashBefore`) come from the session
protocol; the post-session hash attestation is stamped by `ingest`, never at
launch. `attack_direction` is never a launch value — it is observed.
