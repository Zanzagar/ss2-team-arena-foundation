# SS2 first integration checkpoint

Status: read-only static map, recorded 2026-08-29. This is interoperability
research for the locally licensed Steam build identified in
[`ss2-build-fingerprint.json`](ss2-build-fingerprint.json). It contains no game
code, artwork, audio, exported scripts, or game binaries.

## Inspection boundary

- The canonical input was the installed `swf/swords_sandals2_download.swf`.
- The installed SWFs were read in place and were not launched, copied, exported,
  decompiled to files, patched, or uploaded.
- The project-local inspector reads a SWF into memory and prints structural AVM1
  metadata and action opcodes. Portable FFDec is installed only under ignored
  `.tools/`, with its profile redirected there.
- The third-party SWF found in Downloads was not used as evidence.
- All future distributable output must remain independently authored source,
  metadata, or patches. Original and extracted game assets are out of scope.

## Licensed build identity

| Item | Verified value |
| --- | --- |
| Steam app | `1055430`, Swords and Sandals Classic Collection |
| Steam build | `24807725` |
| Depot manifest | `1055432 / 8233185473219625516` |
| AIR application | `com.game.whiskeybarrelstudios.swordsandsandalsclassic`, version `1.7.2` |
| Collection shell | `swords_and_sandals_classic.swf`, SHA-256 `6A58E0843967AF5B781133E878A8E8DEB66F0D9EA265D0AAC8A0A4E53712D397` |
| Vanilla SS2 | `swf/swords_sandals2_download.swf`, 7,586,504 bytes |
| Vanilla SS2 SHA-256 | `77CB545C2061AB41246251467A4EDF5926AB6FD1DDD95DC9527D7BA9C45BB8CA` |
| SWF format | uncompressed `FWS`, version 11, AVM1/ActionScript 2 |
| Movie | 30 fps, 270 root frames |
| Static inventory | 644 `DoAction`, 63 `DoInitAction`, 0 `DoABC`; 740 sprites, 502 exports, 1,049 decoded action blocks |

These identifiers are the compatibility key. Formula fixtures must name this
build and hash instead of claiming to describe every SS2 release.

## Battle entry and timeline ownership

The concrete battle construction point is the root `arena` label at frame 221,
action block `DoAction@0x671acd`. A preceding button action on button 1777 calls
`this.gotoAndPlay("beginfight")` on sprite 1788. Its `beginfight` label is frame
75; the frame-78 action sets `_global.current_arena = 1` and
`_global.fight_mode = "misc"`, then sends the root timeline to `arena_intro` at
frame 214. `initbattle`, `beginfight`, `combatwon`, and `combatlost` are
timeline labels/state values, not callable
functions, so an adapter must not invent function boundaries for them.

Root frame 221 does the following:

1. Creates `_root.arena.gladiators` as an empty movie clip.
2. Attaches the `overlay` linkage at depth 40000 and an `overlay_villain`
   linkage at depth 40001.
3. Attaches two `hero_battle` linkage instances beneath
   `_root.arena.gladiators`: `hero` at depth 301 and `villain` at depth 300.
4. Calls `skincharacter` with `_root.game.hero` and `_root.game.villain`.
5. Places the runtime clips at `(-250, 200)` and `(250, 200)`, faces them right
   and left, and sets scale to `80 + round(strength / 1.5)` (the villain's
   horizontal scale is mirrored).
6. Attaches `hero_shadow` and `villain_shadow` instances at depths 298 and 299.
   Their frame, weapon frame, position, and scale are mirrored from the fighter
   clips by `onEnterFrame` handlers.
7. Sets `_global.battle_started = true`.

Before skinning, the same construction action forces the hero to
`equipped_weapon = 1` and `using_bow = false`.

The main battle controller is export `overlay`, sprite 862:

| Location | Responsibility |
| --- | --- |
| frame 1, `DoAction@0x236941` | `getphase`, `attack_chances`, early turn/phase selection |
| frame 52, `DoAction@0x23d7fe` | `remove_armour`, `destroy_armour` |
| frame 52, `DoAction@0x23e7cf` | inventory use and `villain_cast_spells` |
| frame 52, `DoAction@0x23f835` | `randomBetween` and `villainChooseAction` |
| frame 52, `DoAction@0x240c7f` | hit roll, damage, death, spells, status checks, animation dispatch |
| frames 62–77 | additional action/animation phase scripts referencing the two gladiators |

`getphase(whatsdoing)` writes `decisionA`, advances `turnphase`, sets
`this.battle_action = 1`, removes the inventory overlay, and jumps to the
`heroactions` timeline label. The action loop is therefore a timeline state
machine, not a standalone battle class.

Verified controller labels on sprite 862 are `initialise` frame 1,
`longrange_warrior` 5, `closerange_warrior` 13, `longrange_archer` 20,
`closerange_archer` 28, `heroactions` 52, `combatwon` 62, and `combatlost` 74.

## Combatant state objects

Persistent combat data lives in `_root.game.hero` and `_root.game.villain`.
Display and animation state lives in `_root.arena.gladiators.hero` and
`_root.arena.gladiators.villain`. The combat controller repeatedly binds the
current pair into four globals:

- `attacker` and `defender`: movie clips;
- `game_attacker` and `game_defender`: persistent combat objects.

This split is the first adapter seam. Team mode should use combatant IDs and
keep `clipByCombatantId` outside deterministic state; it should not multiply
the existing hero/villain globals.

Observed data fields include:

| Group | Fields |
| --- | --- |
| Identity/progression | `character_name`, `herolevel`, `character_level`, `experience`, `experienceneeded`, `current_tournament`, `tournament_ranking` |
| Base stats | `strength`, `speed`, `attack`, `defence`, `vitality`, `stamina`, `charisma`, `magicka` |
| Live resources | `hitpoints`, `hitpointsmax`, `staminaleft`, `staminamax`, `armourclass`, `armourclass_max`, `ammo_left`, `maximum_ammo` |
| Primary weapon | `weapon`, `weapon_type`, `weapon_weight`, `weapon_range`, `weapon_min_damage`, `weapon_max_damage`, `weapon_enchantment_type`, `weapon_enchantment_potency`, `equipped_weapon`, `using_bow` |
| Secondary weapon | `secondary_weapon` plus the corresponding type, weight, range, min/max damage, and enchantment fields |
| Armour | `breastplate`, `helmet`, `shinguard`, `greaves`, `shoulderguard`, `gauntlet`, `boot`, `shield` and per-piece `_defence` fields |
| Derived combat | `physical_size`, `min_damage`, `max_damage`, `secondary_min_damage`, `secondary_max_damage`, `movement_speed`, `attack_type`, `attack_speed`, `weapon_enchantment_damage` |
| Chance cache | `power_percentage`, `normal_percentage`, `quick_percentage`, `bash_percentage`, `taunt_percentage`, `bombard_percentage`, `snipe_percentage`, `magicka_percentage` |
| Conditions | `psyche_up`, `taunted1`, `taunted2`, `burning`, `frozen`, `poison`, `life_stolen`, and timed `spell_*` fields |
| Inventory | `inventory1` through `inventory6` |

`battlevalues(whichcharacter)` in root frame 35 derives, among other values:

```text
physical_size = 80 + round(strength / 1.5)
min_damage = round(strength * 2) + weapon_min_damage
max_damage = round(strength * 2) + weapon_max_damage
secondary_min_damage = round(strength) + secondary_weapon_min_damage
secondary_max_damage = round(strength) + secondary_weapon_max_damage
hitpointsmax = herolevel * 10 + vitality * 20
staminamax = 100 + stamina * 10
movement_speed = clamp(round(speed * 1.5), 4, 60)
armourclass_max = sum(the active per-piece defence values)
```

The armour piece multipliers assigned in this function are breastplate 16,
helmet 10, shinguard 6, greaves 3, shoulderguard 8, gauntlet 5, boot 2, and
shield 12. Helmet normally contributes `round(helmet * 10)`, but a helmet value
above 25 instead contributes `round(herolevel * 0.5 * 10)`. Shield defence is
zero while `using_bow`; otherwise it contributes `round(shield * 12)`. Thus
`armourclass_max` does not always include the shield. These are verified static
calculations, but they are not yet a complete save-schema map.

Maximum ammunition is tiered by character level: 5 below level 9, 10 for levels
9–22, 15 for 23–27, 20 for 28–34, 25 for 35–44, and 30 at level 45 or above.
When `_global.battle_started` is false, `battlevalues` refills hitpoints and
armour; stamina and ammunition refill only when their current values are zero,
negative, or undefined as applicable.

## RNG surface

Combat is not seeded in vanilla. Identical `randomBetween(a, b)` functions are
defined three times—overlay frame 52 blocks `0x23f835` and `0x240c7f`, and root
frame 35 block `0x40198e`—and are inclusive:

```text
floor(Math.random() * (b - a + 1)) + a
```

The battle code also uses AVM1's direct `RandomNumber` opcode. Some direct uses
are cosmetic (`destroy_armour` debris and crowd movement), while others choose
`attack_direction` and therefore affect combat. Exact deterministic parity
cannot be achieved by replacing only `randomBetween`; both sources must be
routed through one ordered roll stream, with cosmetic rolls either represented
in that stream or removed from authoritative simulation.

Recommended adapter boundary: rules accept explicit samples (or an injected,
versioned RNG) and emit outcomes. Movie clips consume outcomes and may use a
separate cosmetic RNG that never changes state hashes.

## Hit and damage path

### Chance calculation

`attack_chances(game_attacker, game_defender)` writes the following rounded
percentages. `ratio` is `(attacker.attack + 9) / (defender.defence + 9)`.

| Action | Vanilla calculation |
| --- | --- |
| power | `round(ratio * 100 * 0.33)` |
| normal | `round(ratio * 100 * 0.50)` |
| quick | `round(ratio * 100 * 0.66)` |
| bash | `round(ratio * 100 * 0.20)` |
| taunt | `round(((attacker.charisma + 9) / (defender.charisma + 9)) * 100 * 0.40)` |
| bombard | `round(ratio * 100 * 0.60)`, then a shield percentage adjustment |
| snipe | `round(ratio * 100 * 0.90)`, then the same shield adjustment |
| magicka | `round(((attacker.magicka + 9) / (defender.magicka + 9)) * 100 * 0.50)` |

Power, normal, quick, bash, taunt, bombard, and snipe are clamped to 1–99.
No magicka clamp occurs in this function.

The shield adjustment reconstructs as
`ceil(base * (100 + attacker.shield * 1.5) / 100)`. The bytecode explicitly
reads `game_attacker.shield`, so a larger attacker shield increases bombard and
snipe chance. This is counterintuitive; treat it as a verified build behavior
or possible vanilla bug and confirm it with golden runs before encoding
measured rules.

### Attack roll dispatcher

`checkattackroll` is an anonymous function assigned in overlay frame 52. It
calls `attack_chances`, rolls `diceroll = randomBetween(1, 100)`, derives damage
and a critical sample from `attack_direction`, then computes
`rollneeded = 100 - chance`. Control flow is consistent with a hit when
`diceroll >= rollneeded`; the miss branch runs only when
`diceroll < rollneeded`.

| `attack_direction` | Damage | Critical sample | Chance field |
| --- | --- | --- | --- |
| 1–4 | `min_damage` | `randomBetween(-20, 20)` | `quick_percentage` |
| 5–8 | `randomBetween(min_damage, max_damage)` | `randomBetween(1, 20)` | `normal_percentage` |
| 9–12 | `max_damage` | `randomBetween(5, 20)` | `power_percentage` |
| 20 | `round(attacker.charisma * 4) - defender.charisma`, floored to a random 1–3 | forced sentinel 21 | `taunt_percentage` |
| 21 | `randomBetween(min_damage, max_damage)` | `randomBetween(-20, 20)` | `bombard_percentage` |
| 22 | `min_damage` | 0 | `snipe_percentage` |
| 23 | `ceil(min_damage / 2)` | 0 | `bash_percentage` |
| 30 | `ceil(max_damage * 1.5)` with a level-based fallback | forced 20 | `normal_percentage` |

On a hit, direction 30 dispatches `defender_hurt("grievous")`, direction 20
dispatches `defender_hurt("taunt")`, a surviving critical sample of 20
dispatches `defender_hurt("critical")`, and all other hits dispatch
`defender_hurt("normal")`. A separate helmet/greaves roll can deflect a
critical. Its threshold simplifies to
`(100 - 1.5 * game_defender.helmet) + game_defender.greaves`; an inclusive
1–100 roll at or above that threshold clears the critical, except that direction
30 remains grievous. This counterintuitive operand mix also needs a fixture.
A miss calls `defender_blocked()`.

`defender_hurt` selects an animation label (`hurtN`, adjusted for ranged
directions, or `knockback`), calls
`damagecharacter(defender, attacker, game_defender, game_attacker,
damage_method, attack_direction)`, then plays the defender animation.
Physical knockback force is signed
`damage + game_attacker.strength * 6` and forced to a minimum magnitude of 20.
A magnitude above 80 selects the knockback animation, but the unbounded force is
still passed to `knockback`; 80 is not a force clamp.

`damagecharacter`:

- rounds damage upward;
- uses different damage-splat/crowd cues for critical, taunt, and grievous;
- makes every physical damage invocation roll an inclusive 1–100 armour-removal
  chance and remove a piece when the roll is greater than 66; grievous also
  removes one piece unconditionally first and can therefore remove two;
- subtracts normal/grievous damage from `armourclass` first, carrying only
  overflow into `hitpoints`; critical damage bypasses that armour-class branch
  even though its separate removal roll can still destroy a piece;
- after hitpoint-applicable or overflow damage, grants the defender
  `ceil(game_defender.breastplate * appliedDamage / 100)` stamina and clamps;
- can set `burning`, `frozen`, `poison`, or `life_stolen` from weapon
  enchantment types 2–5 after a potency roll;
- sets `phasecomplete` and calls `death(...)` when the relevant mode's defeat
  condition is reached.

`magic_damage_character` is the parallel spell/effect ingress. It receives an
already calculated `damage` argument, applies armour then hitpoint overflow,
updates stamina, clamps state, and follows the same phase/death boundary. Full
direct-damage observations are:

| Spell/effect | Damage ingress |
| --- | --- |
| fireball | inclusive `randomBetween(80, 160)`, effect label `burning` |
| hell fireball | inclusive `randomBetween(150, 450)` |
| dire fireball | inclusive `randomBetween(300, 600)` |
| lightning bolt | inclusive `randomBetween(100, 200)`, effect label `lightning` |
| `frightning_bolt` | inclusive `randomBetween(200, 400)` |
| molten death / death from above | inclusive 10–20 boulders, each entering magic damage with 40 |

The boulder total is therefore 400–800 only if every scheduled impact resolves.
All of these enter the armour-to-hitpoint overflow path; the same
breastplate-based stamina gain applies to hitpoint-applicable damage.

## Spell and vanilla AI surface

`villainChooseAction` is another anonymous overlay-frame-52 function. It binds
hero/villain chances, evaluates distance, stamina, ammunition, weapon mode,
taunts, and damage-over-time flags, and writes `villaindecisionA` labels such as
`quick_attack`, `normal_attack`, `power_attack`, `bombardleft/right`,
`snipeleft/right`, `shove`, `taunt`, movement/charge/jump, `rest`,
`swap_weapons`, and `psyche_up`.

It uses multiple random rolls and ends by calling `villain_cast_spells()`.
That function searches `inventory1`–`inventory6`, calls `use_item`, and can
replace the decision with spell labels. It rolls inclusive 1–100 and enters its
fixed-priority item chain only when the roll is greater than 10, creating a 90%
opportunity before health, armour, stamina, distance, and inventory checks.
Observed inventory ID mappings include:

| IDs | Decision labels |
| --- | --- |
| 30–35 | fireball, hell fireball, dire fireball, little fat kid, lightning bolt, `frightning_bolt` (vanilla spelling) |
| 36–42 | ghost strike, whirlwind, gale, command, swift sandals, bloodlust, colossus |
| 43–49 | `rejuvinate` (vanilla spelling), weaken armour, boundless energy, regenerate, adulation, teleport, death from above |

`cast_spell_icon(which_avatar, spell_number)` attaches export 120
(`cast_spell_image`) to `arena.combat_panel`, positions it at the hero or villain
side, selects the inventory icon frame, hides its battle button, and displays
the inventory name. There is no callable `cast_spell` function: `cast_*`
strings are `phase_decision` labels consumed by the attacker's `onEnterFrame`
state machine.

`check_spells(which_character, which_avatar)` decrements timed fields and
restores backed-up stats/appearance when colossus, little-fat-kid, swift-sandals,
or bloodlust expires; it also decrements regenerate and boundless-energy
counters. Those six buff counters are initialized to 20. One-shot frozen,
burning, poison, and life-stolen phases use the opposing weapon's active
enchantment-damage field, then clear or advance.

`nextphase` is an anonymous function stored in overlay frame 52. Its verified
mutation order is:

1. Clamp the active x position to `[-2100, 2100]`.
2. Run `check_spells` for attacker, then defender.
3. Apply `staminaleft -= staminacost`.
4. Add `1 + round(stamina / 3)` stamina and `1 + ceil(stamina / 2)` hitpoints,
   then clamp.
5. If active, add `round(hitpointsmax / 4)` regeneration and
   `round(staminamax / 4)` boundless energy, then clamp.
6. Update and clamp crowd state, rerun `battlevalues` for both combatants, and
   advance/swap the three-phase `battle_action` cycle.

The rest decision first sets `staminacost = -round(stamina * 15)` and adds
`3 + ceil(stamina)` hitpoints plus `stamina` stamina; `nextphase` then applies
the baseline additions and cost accounting above.

## Battle result and reward callbacks

`death(whichcharacter, how_died)` in overlay frame 52 is the immediate combat
result boundary. It clears burning/frozen/poison/life-steal and taunt flags on
both vanilla objects, assigns the death sequence, then compares the defeated
clip with `arena.gladiators.villain` or `.hero`:

- defeated villain -> `this.gotoAndPlay("combatwon")` on the overlay controller;
- defeated hero -> `this.gotoAndPlay("combatlost")` on the overlay controller.

It then removes the attacker/defender `onEnterFrame` handlers and deletes
`nextphase`. Overlay frames 62 and 74 bridge those labels to
`_root.arena.gotoAndPlay("combat_won")` and `"combat_lost"`, respectively.
There is no generic team-result callback.

The root `arena` instance is sprite 2249. Its result timeline includes:

- `initbattle` frame 1, `combat` 71, `combat_won` 81,
  `combat_wonitem` 94, `combat_delay` 189, `combat_exp` 222, and
  `combat_lost` 250;
- frame 88: attaches export 777, `fight_win_stuff`, and begins win/reward UI;
- frames 189, 222, and 231: continue win item/reward/transition processing;
- frame 315: increments fights and losses, restores the hero, clears
  `battle_started`, sends tournament losses to game-over, or otherwise deducts
  `ceil(herolevel^2 * 50)` gold (clamped at zero) and displays
  `fight_over_lost` (character 2247);
- button 775 release handles final win, level-up, tournament, foyer/daybreak,
  and town-square transitions; button 778 is tournament-win progression;
- the non-tournament loss panel embeds button 2244, whose release returns the
  root timeline to the town square.

Team mode must declare victory only when a team has no living combatants, wait
for the final defeat animation, and invoke a one-shot result bridge. It must not
run vanilla win settlement after the first individual knockout.

## UI and movie-clip map

| Symbol/instance | ID/context | Role |
| --- | --- | --- |
| `arena` | character 2249, root frame 221 | battle scene/result timeline |
| `hero_battle` | export 1241 | fighter and shadow linkage used for both sides |
| `overlay` | export 862 | turn controller, actions, formulas, spell/status logic |
| `combat_panel` | export 751 | health/stamina/armour/potion/action panel |
| `inventory_overlay` | export 492 | battle inventory UI |
| `cast_spell_image` | export 120 | spell notification/icon |
| `damage_icon` | export 817 | damage splat container |
| `fight_win_stuff` | export 777 | reward/victory overlay |
| `hero`, `villain` | `_root.arena.gladiators` | runtime fighter clips |
| `hero_shadow`, `villain_shadow` | `_root.arena.gladiators` | synchronized shadow clips |
| `hero_potion`, `villain_potion` | combat-panel instances | health potion controls |
| `hero_stamina_potion`, `villain_stamina_potion` | combat-panel instances | stamina potion controls |
| `hero_armour`, `villain_armour` | combat-panel instances | armour display |

Key fighter animation labels on export 1241 are `Standing` (frame 2), movement
and charge (33–104), `Block` (118/179), attack directions 1–12 (190–360),
defence directions 1–12 (395–553), `Defend20` (572), death variants
(585–1083), hurt variants (1144–1362), `rest` (1380), `knockback` (1428),
`taunt`/`taunted` (1482/1512), `bombard` (1567), `snipe` (1590),
`psyche_up` (1609), condition effects (1911–2004), yield/cast frames
(2072–2126), and spell transformations (2147–2200). Animation labels are UI
effects, not authoritative state transitions.

The panel and timeline are hard-coded for two sides. The 2v2/3v3 adapter needs
a slot layout and per-combatant widgets; it cannot safely clone variables named
only hero/villain and expect the original callbacks to target the right unit.

## Collection launcher and mod-loading route

The Collection shell is AVM2 and embeds these relevant names:

- base prefix `swf/` and mod prefix `swf/mods/`;
- `GAME_SS2` -> `swords_sandals2_download`;
- `gameLoader`, `gameSWFBridge`, `prepareGame`, `setupAS2Connections`, and
  `gameLoadedComplete`;
- fixed SS2 mod stems:
  `ss2_champion_rush/swords_sandals2_download`,
  `ss2_extended/swords_sandals2_download`,
  `ss2_neomatons/swords_sandals2_download`, and
  `ss2_olis_mod/swords_sandals2_olis_mod`.

The installed folders and SWF names match that table. Evidence supports a
fixed menu/path registry, not automatic discovery of arbitrary directories.
Therefore dropping a new folder under `swf/mods` is not expected to add a menu
entry. A future integration must either add an independently authored launcher
entry/patch or stage against a known slot, and must do so outside the installed
tree until an explicit deployment step is approved.

## Foundation gaps exposed by the map

The current deterministic engine deliberately omits SS2-specific state. Before
claiming 1v1 parity, the adapter/rules layer needs:

- equipment identity and every armour piece, ammunition, stamina, magicka, and
  spell/item identity in canonical state;
- status duration/tick semantics and the precise action-to-animation phase;
- an injectable, versioned RNG whose call order covers all authoritative rolls;
- result events and a one-shot completion bridge after animation acknowledgement;
- rules/build identity in snapshots and golden fixtures;
- deep-copy/rehydration guarantees for wire state.

Do not replace `classicStyleRules` with partially reconstructed formulas. Keep
it explicitly provisional until a golden harness compares vanilla 1v1 and the
adapter with controlled samples.

## Next checkpoint

1. Finish the spell/status and stamina/resource mutation order.
2. Build an asset-free 1v1 fixture schema keyed to the fingerprint above.
3. Add a rules seam that accepts explicit random samples; record roll order.
4. Compare chance, hit/miss, damage, armour overflow, status, and result events
   against licensed vanilla runs without persisting original assets.
5. Render two static ally slots using a `clipByCombatantId` registry, then move
   to 2v2 AI only after 1v1 golden parity passes.

## Reproduce the read-only inventory

With Node available and `$ss2Install` pointing to the Collection directory:

```powershell
$ss2Install = 'C:\Program Files (x86)\Steam\steamapps\common\Swords and Sandals Classic Collection'
node tools/inspect-swf.mjs "$ss2Install\swf\swords_sandals2_download.swf"
node tools/inspect-swf.mjs "$ss2Install\swf\swords_sandals2_download.swf" --function '^attack_chances$' --max-actions 900
node tools/inspect-swf.mjs "$ss2Install\swf\swords_sandals2_download.swf" --references 'fight_over_win|fight_over_lost|combatwon|combatlost'
```

The inspector also supports `--function-names`, `--references`, and
`--around`. These commands print analysis only; do not redirect decompiled game
code or assets into the repository.
