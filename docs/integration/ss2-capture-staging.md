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

Every table below carries an evidence marker, because the four promoted
goldens make it possible — for the first time — to separate what has actually
been staged from what the map says should be stageable.

| Marker | Meaning |
| --- | --- |
| **verified** | the staging was reached in a real capture session against the licensed build; the observed values are recorded in `test/observations/ss2-1v1/` |
| **inferred** | derived from a cited section of [the battle map](ss2-battle-map.md) or the statically read controller vocabulary; never observed |
| **open** | not determined by either; the row says what evidence would settle it |

Build-behaviour claims cite the battle map by section heading rather than line
number, because that document is under concurrent revision.

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
  event is only reachable in a genuine tournament fight. Thirteen of the
  legacy candidates are in exactly that position.
- `fight_mode == "tournament"` has never been observed live. Every capture
  records it for free, so the first tournament session settles it.

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

## Villain-side staging

The operator cannot freely set opponent stats, and the two fights reached so
far differ in how much control there is at all:

- **Tutorial prisoner fight**: the villain is fixed (the all-zero prisoner).
  There is no villain-side staging; a fixture must be authored to it.
- **Ordinary arena duel**: the opponent is drawn by the game. Two live duel
  captures drew two different opponents — one wearing helmet 2 + shield 2
  (`armourclass_max 44`), one with no armour at all — which is why
  `candidate-duel-absorbed-normal-hit` has a divergence report against the
  session that produced `candidate-duel-firstblood-normal-kill`.

Two supported routes remain:

1. Find an opponent whose stats match a committed candidate's villain block
   exactly (attack/defence/vitality/pieces).
2. Capture against whatever opponent is available and author a **new**
   candidate from the observed staged state: ingest records the observed
   values, the mismatch with the intended fixture surfaces as an explicit
   scenario divergence, and a candidate with the observed scenario can be
   generated through the resolver and verified on the next session. The
   pipeline is built for this direction too — evidence first, fixture second.
   Both duel candidates and the whole prisoner family were authored this way.

## Reachability groups

Thirty-seven fixtures are committed under `test/fixtures/ss2-1v1/`:
twenty-nine physical candidates registered in `SS2_FIXTURE_FILES` and eight
spell candidates in `SS2_SPELL_FIXTURE_FILES` (`test/ss2-fixture-files.js`
asserts the two lists are disjoint and together cover the directory).

| Group | Fixtures | Binding constraint |
| --- | --- | --- |
| A | 12 | none — reachable with the staged tutorial fight as it stands |
| B | 2 | the arena duel's opponent draw, which the operator cannot choose |
| C | 6 | different equipment on one side |
| D | 3 | the bow weapon mode |
| E | 5 | a tournament fight, or a non-lethal finish, or both |
| F | 1 | no player action is known to produce the direction |
| G | 8 | the spell ingress has no autopilot route and no `spell_id` in the trace |

No committed fixture sits on a path that is *entirely* opcode-rolled. The only
`RandomNumber` opcode samples in the whole set are the cosmetic
`armour-debris-*` rolls of `candidate-armour-removal-debris`, and those are
excluded from observation matching on both sides, so they block nothing. The
genuinely unreachable-by-design paths named in the runtime-capture workflow —
range taunts and other opcode-rolled decisions that make no `randomBetween`
call — have no fixture, by design.

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
| `candidate-prisoner-power-kill-dir9` | 9 (`power_attack`) | autopilot `walkright*5,power_attack`; no new staging | **inferred** — same controller frame (runtime-capture §Hero action vocabulary) |
| `candidate-prisoner-power-kill-dir10` | 10 | as above | **inferred** |
| `candidate-prisoner-power-kill-dir11` | 11 | as above | **inferred** |
| `candidate-prisoner-power-kill-dir12` | 12 | as above | **inferred** |
| `candidate-prisoner-quick-kill-dir1` | 1 (`quick_attack`) | autopilot `walkright*5,quick_attack`; no new staging | **inferred** — same controller frame |
| `candidate-prisoner-quick-kill-dir2` | 2 | as above | **inferred** |
| `candidate-prisoner-quick-kill-dir3` | 3 | as above | **inferred** |
| `candidate-prisoner-quick-kill-dir4` | 4 | as above | **inferred** |

The three bands are separate campaign families: their injectable tapes differ
(normal draws `randomBetween(min,max)` then a 1–20 critical; power takes
`max_damage` with a 5–20 critical; quick takes `min_damage` with a −20..20
critical and no knockback roll), and injection is tape-positional, so one
`run-campaign.ps1` run covers one band.

### Group B — reachable, but the opponent is drawn by the game

Ordinary arena duel with the operator's real gladiator (`fight_mode = "duel"`;
hero greaves 4 + boot 4, `armourclass_max 20`).

| Fixture | Direction/action | Staging notes | Evidence |
| --- | --- | --- | --- |
| `candidate-duel-firstblood-normal-kill` | 8 (`normal_attack`) | duel against an unarmoured opponent with damage 8–20; the whole tape injected | **verified** — one matching observation (`obs-20260830-e1`); a second independent session against the same draw is all that stands between it and promotion |
| `candidate-duel-absorbed-normal-hit` | 5 | duel against an opponent wearing helmet 2 + shield 2 (`armourclass_max 44`), damage 8–16; the hit must stay fully absorbed so the first-blood gate does not fire | **verified** for the opponent's existence (observed in a live duel), **open** for the fixture as written — no session has matched direction 5 against that draw |

Neither can be promoted by planning: the campaign loop cannot force an
opponent the way it can retry an attack direction.

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
session. Villain-side armour is not stageable in the tutorial fight at all
(see Villain-side staging), so these rows imply either a tournament opponent
who happens to wear the pieces or the author-from-observation route.

### Group D — needs the bow weapon mode

`bombardleft|right` and `snipeleft|right` live on controller frame 20
(`longrange_archer`) and `bash_attack` on frame 28 (`closerange_archer`).
The arena construction action forces `using_bow = false` for the tutorial
fight (map §Battle entry), so these need a differently equipped gladiator —
one that owns a bow — not a wrapper change.

| Fixture | Direction/action | Staging notes | Evidence |
| --- | --- | --- | --- |
| `candidate-bombard-threshold` | 21 (`bombardleft`/`bombardright`) | bow drawn; no armour either side; tournament (15 damage reaches hitpoints). Which of the two labels the direction comes from is unmapped, and ammunition/range staging is untested | **inferred** for the controller frame; **open** for left/right and range |
| `candidate-snipe-shield-boost` | 22 (`snipeleft`/`sniperight`) | bow drawn **with shield 10 still equipped** — the flagged chance boost reads `game_attacker.shield`, while `battlevalues` scores the shield as 0 armour while `using_bow` (map §Combatant state objects, §Chance calculation). Tournament | **inferred**; **open** whether the shield stays equipped in bow mode |
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

### Group F — no player action is known to produce it

| Fixture | Direction/action | Staging notes | Evidence |
| --- | --- | --- | --- |
| `candidate-grievous-knockback` | 30 (grievous) | hero strength 9 with a 2/10 weapon; villain breastplate 1, 50 hp, armour worn to 4 of 16 mid-battle (the knockback force uses the overflow remainder, not the selected damage — map §Attack roll dispatcher). Tournament | **open** — no `getphase` label in the whole controller vocabulary maps to direction 30, and the campaign section lists grievous 30 without a call-site offset, unlike bash/taunt/bombard/snipe |

`chargeleft`/`chargeright` are not the answer: charge impacts were observed
live with `attack_direction` **undefined**, not 30 (map §Combatant state
objects, runtime-observed note). Until an action is identified, this fixture
cannot be staged at all. The evidence that would settle it is a static read of
what writes `attack_direction = 30`, or a capture of an action whose direction
the wrapper records as 30.

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
