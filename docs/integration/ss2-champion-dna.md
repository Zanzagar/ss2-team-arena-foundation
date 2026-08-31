# SS2 tournament champion DNA decode

Status: read-only static map, recorded 2026-08-30. Interoperability research for
the locally licensed Steam build identified in
[`ss2-build-fingerprint.json`](ss2-build-fingerprint.json). It contains no game
code, artwork, audio, exported scripts, or game binaries — only frame labels,
symbol names, character ids, instruction offsets, and numbers derived from them.

Read with [the battle map](ss2-battle-map.md); this document only adds the one
thing that map left as a parameter: **where a tournament opponent's combat
values come from, and what they are for tournament rank 1.**

## Why this decode is possible at all

Every other post-tutorial opponent this project has met is a
`randomise_gladiator` draw, built at the hero's level through the
un-interceptable `RandomNumber` opcode and regenerated on every launch
(arena route §2). That is why
[the post-tutorial fixtures](../../test/ss2-post-tutorial-fixtures.test.js)
declare their villain block as a *profile* rather than a staging.

The tournament boss is different. `unleash_hell(which_boss)` — root frame 35,
`DoAction@0x3f8539`, `DefineFunction2` at `+0x1812` — is a flat chain of
`which_boss == N` tests, each of which builds `_root.game.champion` as a fresh
`Object` and writes four or five **string literals** into it. It contains no
`randomBetween` call, no `RandomNumber` opcode, and no call to any generator.
The whole function ends at `+0x2216`–`+0x222e` with

```text
_root.game.villain = _root.game.champion;
```

so the object it just built *is* the villain. Verified branch offsets:

| `which_boss` | Test | `charDNA` write | Opponent |
| ---: | --- | --- | --- |
| 0 | `+0x1835` | `+0x1872` | the tutorial prisoner |
| 1 | `+0x18cb` | `+0x1904` | **the rank-1 champion, `character_name` "John the Butcher"** |
| 2 | `+0x194e` | `+0x1987` | rank 1 of tournament 2 |
| … | … | … | seventeen further literals through `+0x21cc` |

Only `charDNA`, `character_name`, `character_quote`, `character_intro` and
`hat_name` are written here. **Not one combat field is.** Every combat value in
this document is *derived*, and the two functions that derive it are the subject
of the rest of this page.

The tutorial prisoner is `which_boss == 0` in the same chain. That matters
below: it makes the twenty-two promoted goldens an independent check on this
decode rather than a source for it.

## Where the DNA string is consumed

Root frame 221 (`DoAction@0x671acd`, battle map §Battle entry) calls
`skincharacter` with `_root.game.hero` and `_root.game.villain`. `skincharacter`
is root frame 35 `DoAction@0x40bf76` and its first four statements are, in
order:

| Offset | Call |
| --- | --- |
| `+0x1aa1`–`+0x1ab7` | `initcharacter(whichcharacter, whichavatar, whichcharacter.charDNA)` |
| `+0x1ab9` | `updatecharacter(whichcharacter, whichavatar)` |
| `+0x1ac9` | `colorhero(whichcharacter, whichavatar)` |
| `+0x1ad9`–`+0x1ae5` | `battlevalues(whichcharacter)` |

`updatecharacter` reads `helmet`, `breastplate` and `shield` only to select
avatar layer frames (`+0x0d9b`, `+0x0e03`, `+0x1026`) and writes no combat
field, so the chain that decides the champion's numbers is exactly
`initcharacter` then `battlevalues`. Both are RNG-free.

Root frame 221 sets `_global.battle_started = true` *after* the `skincharacter`
call, which is what selects the refill branch of `battlevalues` (§4 below).

## 1. The DNA index-to-field map

`initcharacter(whichcharacter, whichavatar, DNA)` — root frame 35
`DoAction@0x40bf76`, `DefineFunction2` at `+0x05cc`. Registers are
byte-verified from the call site above and from the argument order of the three
trailing calls (`+0x0b46`, `+0x0b56`, `+0x0b66`): `register:3` is
`whichcharacter`, `register:4` is `whichavatar`, `register:5` is the DNA
string.

The body opens with two statements only:

```text
+0x05cc  whichcharacter.characterDNA = new Array();
+0x05e0  whichcharacter.characterDNA = DNA.split(",");
```

and is then fifty flat `whichcharacter.<field> = characterDNA[<n>]` assignments.
Every one is coerced — `ToString` for indices 0 and 28, `ToNumber` for the other
forty-eight. The offset column is the `Push register:3, "<field>"` that opens
each assignment.

| Index | Field | Offset | Coercion |
| ---: | --- | --- | --- |
| 0 | `hero_name` | `+0x05f4` | `ToString` `+0x060b` |
| 1 | `skincolor` | `+0x060d` | `ToNumber` |
| 2 | `haircolor` | `+0x0624` | `ToNumber` |
| 3 | `features` | `+0x063b` | `ToNumber` |
| 4 | `hairstyle` | `+0x0652` | `ToNumber` |
| 5 | `facehairstyle` | `+0x0669` | `ToNumber` |
| 6 | `shoulderguard` | `+0x0680` | `ToNumber` |
| 7 | `gauntlet` | `+0x0697` | `ToNumber` |
| 8 | `breastplate` | `+0x06ae` | `ToNumber` |
| 9 | `helmet` | `+0x06c5` | `ToNumber` |
| 10 | `greaves` | `+0x06dc` | `ToNumber` |
| 11 | `shinguard` | `+0x06f3` | `ToNumber` |
| 12 | `boot` | `+0x070a` | `ToNumber` |
| 13 | `weapon` | `+0x0721` | `ToNumber` |
| 14 | `shield` | `+0x0738` | `ToNumber` |
| 15 | `battlesfought` | `+0x074f` | `ToNumber` |
| 16 | `strength` | `+0x0766` | `ToNumber` |
| 17 | `speed` | `+0x077d` | `ToNumber` |
| 18 | `attack` | `+0x0794` | `ToNumber` |
| 19 | `defence` | `+0x07ab` | `ToNumber` |
| 20 | `vitality` | `+0x07c2` | `ToNumber` |
| 21 | `charisma` | `+0x07d9` | `ToNumber` |
| 22 | `stamina` | `+0x07f0` | `ToNumber` |
| 23 | `magicka` | `+0x0807` | `ToNumber` |
| 24 | `herolevel` | `+0x081e` | `ToNumber` |
| 25 | `experience` | `+0x0835` | `ToNumber` |
| 26 | `experienceneeded` | `+0x084c` | `ToNumber` |
| 27 | `villain_xp` | `+0x0863` | `ToNumber` |
| 28 | `mostpowerfulfoe` | `+0x087a` | `ToString` `+0x088f` |
| 29 | `goldpieces` | `+0x0891` | `ToNumber` |
| 30 | `current_tournament` | `+0x08a8` | `ToNumber` |
| 31 | `gladiatorscore` | `+0x08bf` | `ToNumber` |
| 32 | `weapon_enchantment_potency` | `+0x08d6` | `ToNumber` |
| 33 | `weapon_enchantment_type` | `+0x08ed` | `ToNumber` |
| 34–39 | `inventory1`…`inventory6` | `+0x0904`, `+0x091b`, `+0x0932`, `+0x0949`, `+0x0960`, `+0x0977` | `ToNumber` |
| 40 | `inventory_maxslots` | `+0x098e` | `ToNumber` |
| 41 | `battleswon` | `+0x09a5` | `ToNumber` |
| 42 | `days_in_arena` | `+0x09bc` | `ToNumber` |
| 43 | `battlesfought` **(again)** | `+0x09d3` | `ToNumber` |
| 44 | `battleslost` | `+0x09ea` | `ToNumber` |
| 45 | `secondary_weapon` | `+0x0a01` | `ToNumber` |
| 46 | `secondary_weapon_enchantment_potency` | `+0x0a18` | `ToNumber` |
| 47 | `secondary_weapon_enchantment_type` | `+0x0a2f` | `ToNumber` |
| 48 | `maximum_ammo` | `+0x0a46` | `ToNumber` |
| 49 | `equipped_weapon` | `+0x0a5d` | `ToNumber` |

**Index 43 is not a new field.** It re-assigns `battlesfought` from the constant
pool entry index 15 already used, so index 15's value is written and then
overwritten. Both are 0 for every boss literal read here, so the quirk is
latent, but a DNA writer that disagreed between the two slots would silently
lose the first.

After the table, `initcharacter` copies `_root.game.hero.days_in_arena` into a
`day` field (`+0x0a74`), then raises `inventory_maxslots` by level in a chain of
five tests — `herolevel >= 6, 15, 20, 30, 40` give 2, 3, 4, 5, 6
(`+0x0a8d`–`+0x0b45`) — and calls `initcolour`, `updatecharacter`, `colorhero`.
A `herolevel` below 6 leaves the DNA's own index-40 value in place.

## 2. The tournament rank-1 literal, decoded

The literal at `unleash_hell` `+0x1904` carries fifty comma-separated fields,
exactly filling indices 0–49. Applying the table above field by field:

| Index | Field | Value | Index | Field | Value |
| ---: | --- | ---: | ---: | --- | ---: |
| 0 | `hero_name` | "John the Butcher" | 25 | `experience` | 0 |
| 1 | `skincolor` | 1 | 26 | `experienceneeded` | 125 |
| 2 | `haircolor` | 13 | 27 | `villain_xp` | 1 |
| 3 | `features` | 1 | 28 | `mostpowerfulfoe` | "0" |
| 4 | `hairstyle` | 40 | 29 | `goldpieces` | 2500 |
| 5 | `facehairstyle` | 3 | 30 | `current_tournament` | 1 |
| 6 | `shoulderguard` | 1 | 31 | `gladiatorscore` | 0 |
| 7 | `gauntlet` | 1 | 32 | `weapon_enchantment_potency` | 1 |
| 8 | `breastplate` | 1 | 33 | `weapon_enchantment_type` | 4 |
| 9 | `helmet` | **102** | 34 | `inventory1` | 6 |
| 10 | `greaves` | 2 | 35 | `inventory2` | 1 |
| 11 | `shinguard` | 4 | 36–39 | `inventory3`…`6` | 0 |
| 12 | `boot` | 1 | 40 | `inventory_maxslots` | 1 |
| 13 | `weapon` | 24 | 41 | `battleswon` | 0 |
| 14 | `shield` | 0 | 42 | `days_in_arena` | 1 |
| 15 | `battlesfought` | 0 | 43 | `battlesfought` | 0 |
| 16 | `strength` | 6 | 44 | `battleslost` | 0 |
| 17 | `speed` | 3 | 45 | `secondary_weapon` | 0 |
| 18 | `attack` | 1 | 46 | `secondary_weapon_enchantment_potency` | 0 |
| 19 | `defence` | 3 | 47 | `secondary_weapon_enchantment_type` | 0 |
| 20 | `vitality` | 3 | 48 | `maximum_ammo` | 5 |
| 21 | `charisma` | 2 | 49 | `equipped_weapon` | 1 |
| 22 | `stamina` | 5 | | | |
| 23 | `magicka` | 1 | | | |
| 24 | `herolevel` | 5 | | | |

`herolevel` 5 fails every test in the `inventory_maxslots` chain, so index 40's
1 stands. `using_bow` is not a DNA field and is never written for a
DNA-constructed villain, so it stays `undefined` — falsy at both sites that
read it in `battlevalues`.

The raw literal is not reproduced here; the offset above is the citation.

## 3. The two lookup tables `battlevalues` needs

`battlevalues` reads the weapon rows as `_root["weapon" + whichcharacter.weapon]`
(`+0x3122`: push `_root`, push `"weapon"`, push `whichcharacter.weapon`, `Add2`,
`GetMember`). The rows are plain `Array` literals built on the root frame 35
timeline of the same block, `DoAction@0x3fa9dc`. Because `NewObject` pops its
arguments in declaration order, the six slots decode as
`[weapon_type, weapon_name, weapon_weight, min, max, range_factor]`.

| Row | Offset | type | weight | min | max | range factor |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `weapon0` (the champion's `secondary_weapon`) | `+0x3dee` | 2 | 5 | 1 | 3 | 1 |
| `weapon24` (the champion's `weapon`) | `+0x41c6` | 3 | 4 | **8** | **32** | 1 |

The slot order is settled by two independent cross-checks inside the same
block, not by assumption:

- `weapontypes` (`+0x3d8c`) and `weaponweights` (`+0x3dd4`) decode to sane
  index-0-is-empty arrays under this reading and to nonsense under the reversed
  one; and
- `weaponenchantments` (`+0x3dba`) decodes with index 2, 3, 4, 5 in the order
  the battle map already records for the four enchantment statuses
  (burning, frozen, poison, life-stolen). The champion's
  `weapon_enchantment_type` 4 is therefore the poison entry.

The largest `range factor` anywhere in the table is 3. That is load-bearing for
the capture plan in §6.

## 4. `battlevalues` applied to the champion

`battlevalues(whichcharacter)` — root frame 35 `DoAction@0x3fa9dc`. `register:3`
is `whichcharacter`, `register:1` is `_root`, `register:2` is `_global`. Its
first eight statements write the armour multipliers onto `_global`
(`+0x3089`–`+0x30f0`): breastplate 16, helmet 10, shinguard 6, greaves 3,
shoulderguard 8, gauntlet 5, boot 2, shield 12 — the same eight the battle map
records.

### 4.1 Size, weapon and damage

| Value | Site | Arithmetic | Result |
| --- | --- | --- | ---: |
| `physical_size` | `+0x30f1` | `80 + round(6 / 1.5)` | 84 |
| `weapon_type` | `+0x3122` | `weapon24[0]` | 3 |
| `weapon_weight` | `+0x3174` | `weapon24[2]` | 4 |
| `weapon_range` | `+0x3190` | `84 + weapon24[5] * 44` | 128 |
| `weapon_min_damage` | `+0x31be` | `weapon24[3]` | 8 |
| `weapon_max_damage` | `+0x31da` | `weapon24[4]` | 32 |
| `weapon_enchantment_damage` | `+0x320c` | `ceil(32 / 3 * 1)` | 11 |
| `secondary_weapon_min_damage` | `+0x32d8` | `weapon0[3]` | 1 |
| `secondary_weapon_max_damage` | `+0x32f4` | `weapon0[4]` | 3 |
| `secondary_weapon_range` | `+0x32aa` | `84 + weapon0[5] * 44` | 128 |
| `secondary_weapon_enchantment_damage` | `+0x3326` | `ceil(3 / 3 * 0)` | 0 |
| **`min_damage`** | `+0x3356` | `round(6 * 2) + 8` | **20** |
| **`max_damage`** | `+0x3386` | `round(6 * 2) + 32` | **44** |
| `secondary_min_damage` | `+0x33b6` | `round(6 * 1) + 1` | 7 |
| `secondary_max_damage` | `+0x33e6` | `round(6 * 1) + 3` | 9 |

The `using_bow` swap at `+0x3416`–`+0x344b` overwrites `min_damage`,
`max_damage` and `weapon_range` with the secondary values **when `using_bow` is
truthy**. The `If` at `+0x341f` jumps over the block on `Not using_bow`, so for
the champion — whose `using_bow` is never written — the primary values stand.

`attack_type` (`+0x3450`) and `attack_speed` (`+0x346a`) read
`whichcharacter.whichweapon`, which no DNA path writes. They stay `undefined`
for a DNA-built villain and are not read by any site on the physical attack
path.

### 4.2 Armour, and the `helmet > 25` cap

Each piece writes `<piece>_defence = round(piece * <piece>_dval)`:

| Piece | Site | Arithmetic | Result |
| --- | --- | --- | ---: |
| `breastplate_defence` | `+0x3480` | `round(1 * 16)` | 16 |
| `shinguard_defence` | `+0x351f` | `round(4 * 6)` | 24 |
| `greaves_defence` | `+0x3546` | `round(2 * 3)` | 6 |
| `shoulderguard_defence` | `+0x356d` | `round(1 * 8)` | 8 |
| `gauntlet_defence` | `+0x3594` | `round(1 * 5)` | 5 |
| `boot_defence` | `+0x35bb` | `round(1 * 2)` | 2 |
| `shield_defence` | `+0x35f7` / `+0x3623` | `round(0 * 12)` | 0 |

The helmet is the exception, and it is the single most consequential number in
this decode. The test at `+0x34a7`–`+0x34ba` is `helmet > 25`; the `If` jumps
**to** the special arm at `+0x34eb`, and the ordinary
`round(helmet * helmet_dval)` arm is the fall-through at `+0x34bf`:

```text
helmet 102 > 25   ->  helmet_defence = round(herolevel * 0.5 * helmet_dval)
                   =  round(5 * 0.5 * 10)  =  25
```

So the champion's headgear — `hat_name` is written alongside the DNA at
`+0x1946` — contributes **25**, not 1020. Its raw value 102 is nonetheless the
value still standing in the `helmet` field, and §5 shows where that matters.

The shield branch at `+0x35e2` tests `using_bow == true` and jumps to the
zero-assignment; the champion falls through to the multiply, which is 0 either
way.

### 4.3 Pools, and the branch the refill lives behind

| Value | Site | Arithmetic | Result |
| --- | --- | --- | ---: |
| `maximum_ammo` | `+0x3634`–`+0x364b` | `herolevel 5 < 9` -> 5 | 5 |
| **`hitpointsmax`** | `+0x378e` | `5 * 10 + 3 * 20` | **110** |
| `staminamax` | `+0x37b6` | `100 + 5 * 10` | 150 |
| `movement_speed` | `+0x37d2`, clamps `+0x37fd`/`+0x3821` | `clamp(round(3 * 1.5), 4, 60)` | 5 |
| `charheight` | `+0x39c8` | `60 + round(6 * 0.9)` | 65 |
| `charweight` | `+0x3a63` | `110 + round(6 * 7)` | 152 |

The test at `+0x3a90`–`+0x3aa0` is `_global.battle_started == true`, and the
`If` jumps 360 bytes to `+0x3c0d`, i.e. **past** everything below. Because root
frame 221 calls `skincharacter` before it sets `battle_started`, this branch
runs at battle construction and does not run again during the fight:

| Value | Site | Arithmetic | Result |
| --- | --- | --- | ---: |
| `hitpoints` | `+0x3aa5` | `round(hitpointsmax)` | 110 |
| **`armourclass_max`** | `+0x3ac3`–`+0x3b0e` | `16 + 25 + 24 + 6 + 8 + 5 + 2 + 0` | **86** |
| `armourclass` | `+0x3b0f` | `= armourclass_max` | 86 |
| `staminaleft` | `+0x3b1c`/`+0x3b38` | not `> 0` -> `staminamax` | 150 |
| `ammo_left` | `+0x3b45`–`+0x3b81` | not `> 0` or `undefined` -> `maximum_ammo` | 5 |
| `character_xp` | `+0x3b82`–`+0x3c0c` | `7 + 9*10 + 20 + 44*20 + 11*10 + 0*10 + 5^2 + 86*10 + 150` | **2142** |

`character_xp` is the win reward's input (battle map §Battle result), so beating
the rank-1 champion pays `round(2142 * (100 + crowd_interest) / 100)` gold — the
only fully determined bout reward in the build, since every other opponent's
`character_xp` comes from a generated gladiator.

**Quirk worth recording.** `experiencelast` (`+0x3845`) and `experienceneeded`
(`+0x38d3`) are written on `_root.game.hero` *unconditionally*, not on
`whichcharacter`. Calling `battlevalues` on the villain therefore rewrites the
**hero's** progression fields. Both reduce to `round(h³ * 60)` for
`h = herolevel` and `h - 1` respectively, with a floor of 125 applied at
`+0x399c`–`+0x39c7`. At `h = 1` that is `round(60)` floored to 125 — which is
independently the corrected level-1 requirement recorded in the transfer
handoff, and is the third check on this decode.

## 5. The champion's derived state, and the two live checks

| Field | Value | Source |
| --- | ---: | --- |
| `character_name` | John the Butcher | `unleash_hell` `+0x191a` |
| `herolevel` | 5 | DNA 24 |
| `attack` / `defence` | 1 / 3 | DNA 18 / 19 |
| `strength` / `speed` | 6 / 3 | DNA 16 / 17 |
| `vitality` / `stamina` | 3 / 5 | DNA 20 / 22 |
| `charisma` / `magicka` | 2 / 1 | DNA 21 / 23 |
| `min_damage` / `max_damage` | 20 / 44 | `battlevalues` `+0x3356` / `+0x3386` |
| **`hitpointsmax`** | **110** | `+0x378e` |
| `hitpoints` | 110 | `+0x3aa5` |
| `staminamax` / `staminaleft` | 150 / 150 | `+0x37b6` / `+0x3b38` |
| **`armourclass_max`** | **86** | `+0x3ac3` |
| **`armourclass`** | **86** | `+0x3b0f` |
| `helmet` / `helmet_defence` | 102 / 25 | DNA 9, `+0x34eb` |
| `shoulderguard` / `_defence` | 1 / 8 | DNA 6, `+0x356d` |
| `breastplate` / `_defence` | 1 / 16 | DNA 8, `+0x3480` |
| `gauntlet` / `_defence` | 1 / 5 | DNA 7, `+0x3594` |
| `greaves` / `_defence` | 2 / 6 | DNA 10, `+0x3546` |
| `shinguard` / `_defence` | 4 / 24 | DNA 11, `+0x351f` |
| `boot` / `_defence` | 1 / 2 | DNA 12, `+0x35bb` |
| `shield` / `_defence` | 0 / 0 | DNA 14, `+0x35f7` |
| `weapon_enchantment_type` / `_potency` | 4 (poison) / 1 | DNA 33 / 32 |
| `weapon_enchantment_damage` | 11 | `+0x320c` |
| `equipped_weapon` / `using_bow` | 1 / undefined | DNA 49, never written |
| `physical_size` / `weapon_range` | 84 / 128 | `+0x30f1` / `+0x3190` |
| `movement_speed` | 5 | `+0x37d2` |
| `ammo_left` / `maximum_ammo` | 5 / 5 | `+0x3b75` / `+0x364b` |
| `character_xp` | 2142 | `+0x3b82` |

**Check 1 — the live numbers.** A runtime log recorded the champion at
`hitpointsmax` 110 and `armourclass` 86, identical across eight independent
draws. The decode above produces 110 at `+0x378e` and 86 at `+0x3ac3` with no
free parameter anywhere in the chain. It agrees.

**Check 2 — the tutorial prisoner, decoded by the same map.** The prisoner is
`which_boss == 0` in the same `unleash_hell` chain, `charDNA` at `+0x1872`, and
the same two functions build him. Applying this document's index map to that
literal gives `herolevel` 1, `vitality` 0, `stamina` 0, `strength` 0,
`attack` 0, `defence` 0, `charisma` 0, `magicka` 0, `weapon` 0, every armour
piece 0. `battlevalues` then gives `hitpointsmax` `1*10 + 0*20` = **10**,
`staminamax` `100 + 0` = **100**, `min_damage` `round(0) + weapon0[3]` = **1**,
`max_damage` `round(0) + weapon0[4]` = **3**, `armourclass_max` **0**. Those are
exactly the villain values carried by the twenty-two promoted goldens — which
were measured, not authored, and which this track did not use to derive
anything. The index map, the `>25` helmet branch aside, and the weapon-row slot
order are all confirmed by a set of numbers produced by the running game.

## 6. What a capture of this bout can and cannot be

### 6.1 The hero side is not free, and this is how it is pinned

The champion is reproducible; the hero entering the bout is not. Three
mechanisms decide what a fixture may assert about him.

1. **The wrapper's champion gate.** `captureAllowedNow` is called from
   `beginAction`, i.e. **at the armed `checkattackroll`**, and refuses to arm
   unless `hero.staminaleft == hero.staminamax` and (when
   `-ArenaStagedLevel` is given) `hero.herolevel` equals it. So both fields are
   *guaranteed* at the captured action, not merely hoped for.
2. **Nothing can have damaged either fighter yet.** The only two damage
   ingresses in the build are `damagecharacter` and `magic_damage_character`
   (battle map §Defeat gate), and every physical route to the first passes
   through `checkattackroll`. The wrapper arms on the **first**
   `checkattackroll` of the bout and closes the trace on its return. A trace
   that exists at all is therefore a trace in which no earlier hit landed, so
   both fighters still hold their construction values: `hitpoints ==
   hitpointsmax` and `armourclass == armourclass_max` on both sides, and every
   status flag unset. The champion carries no spell inventory (`inventory1` 6,
   `inventory2` 1 — both below the spell band 30–49), which closes the only
   other ingress.
3. **Derived fields are recomputed, so only inputs may be staged.**
   `battlevalues` runs again inside `nextphase` (overlay frame 52 `+0x35f1`,
   `+0x3605`) and rewrites `min_damage`, `max_damage`, `hitpointsmax`,
   `staminamax` and every `<piece>_defence` from strength, weapon, herolevel,
   vitality and stamina. Staging an output writes the result of a formula the
   game recomputes. The hero staging below therefore stages **inputs only** and
   the fixtures carry the values `battlevalues` derives from them, which makes
   the staged state a fixed point: it does not matter how many times
   `battlevalues` reruns.

The wrapper's town-square staging step applies the hero fields and then calls
`root.constructDNA()`, which serialises `_root.game.hero` back into `charDNA` in
the same field order §1 decodes. Every staged field is therefore rebuilt through
`initcharacter` at every subsequent bout, exactly as the champion's is.

`constructDNA` also calls `is_that_virtuous()` whenever `_root.fizMode` is not
`"fizzle"` (root frame 35 `DoAction@0x40bf76` `+0x1b7d`; the `If` **skips** the
call when the mode matches). That function, at `+0x219c`, clamps every armour
piece to 8, `strength`/`speed`/`attack`/`defence`/`vitality`/`charisma`/`magicka`
to 50, `herolevel` to 12, `inventory_maxslots` to 2 and `maximum_ammo` to 10.
Whether it runs at runtime is disputed (the transfer handoff records
`game_mode` reading `"full"`). The staging below sits **below every one of those
caps**, so it produces the same hero either way and the question does not have
to be settled first.

### 6.2 The staging string

```text
-ArenaStagedLevel 5
-StageHero "herolevel:5,experience:0,strength:30,speed:2,attack:3,defence:3,vitality:10,charisma:1,magicka:1,stamina:5,weapon:24,secondary_weapon:0,weapon_enchantment_type:0,weapon_enchantment_potency:0,helmet:0,shoulderguard:0,breastplate:0,gauntlet:0,greaves:0,shinguard:0,boot:0,shield:0"
```

What each group is for:

- `herolevel:5` + `experience:0` + `-ArenaStagedLevel 5` pin the level. At
  `herolevel` 5 the next requirement is `round(5³ * 60)` = 7500 (§4.3), and two
  ladder bouts against level-5 generated opponents pay roughly one
  `character_xp` each — the champion's own is 2142 — so no level-up should land
  mid-ladder. If one does, the gate refuses to arm rather than producing a
  trace nobody can reproduce.
- `speed:2` and `stamina:5` are chosen together so the hero can *walk into
  range without losing stamina*. A walk phase costs `round(movement_speed / 2)`
  (overlay frame 52 `+0x3b37`); `speed` 2 gives `movement_speed`
  `clamp(round(3), 4, 60)` = 4, so the cost is 2, while `nextphase` returns
  `1 + round(stamina / 3)` = 3 and then clamps to `staminamax`. Stamina is
  therefore pinned at 150 for the whole approach, which is what lets the
  wrapper's full-stamina gate ever pass. It also keeps the hero above the 50 %
  taunt/rest split on the long-range controller, so no forced `rest` phase
  fires.
- `strength:30` + `weapon:24` give `min_damage` `round(60) + 8` = 68 and
  `max_damage` `60 + 32` = 92 — the only pair in reach that is *below* the
  champion's 86 armour on the quick and normal bands and *above* it on the
  power band, so one staging exercises both the absorbed and the overflow arm
  of `damagecharacter`.
- `attack:3` against the champion's `defence` 3 makes the `attack_chances`
  ratio `(3 + 9) / (3 + 9)` exactly **1**, so the three melee chances reduce to
  the three band factors themselves: 33, 50, 66, and `rollneeded` 67, 50, 34.
  No previously captured fight has this ratio.
- `vitality:10` gives `hitpointsmax` 250 — comfortably above the champion's
  `max_damage` 44, so the hero cannot be killed inside the one captured action.
- The eight armour zeroes and the two enchantment zeroes remove the save's
  history from the scenario: the hero's `armourclass` is 0 by construction and
  the post-damage enchantment roll can never apply a status
  (`potency * 10` = 0 is below every inclusive 1–100 roll).

### 6.3 Which bands are actually reachable

`power_attack`, `normal_attack` and `quick_attack` are wired only by
`closerange_warrior` (battle map §Buttons wired per controller frame), and the
hero always starts on a warrior controller because root frame 221 forces
`equipped_weapon = 1` and `using_bow = false`. `getfightdistance`
(sprite 2249 frame 1 `DoAction@0x6e421b` `+0x02ff`, `+0x0427`) makes
`fightdistance` the rounded x-separation of the two clips, which is 500 at
construction, while the largest `weapon_range` any row in §3 can produce is
`physical_size + 3 * 44` — under 250 even at the stat cap. **No staging can
start the hero in close range**, so the approach turns are unavoidable and only
§6.1's argument 2 makes the captured state predictable.

That leaves exactly three bands a capture can drive:

| Band | Direction | Wired by | How the wrapper issues it |
| --- | ---: | --- | --- |
| quick | 1–4 | `closerange_warrior` | `-Autopilot` with a walk prefix |
| normal | 5–8 | `closerange_warrior` | the default `aggressive` policy, which returns `normal_attack` as soon as the controller offers it |
| power | 9–12 | `closerange_warrior` | `-Autopilot` with a walk prefix |

Explicitly **not** reachable for this hero, and why:

- `taunt` (direction 20) and `rest` share one long-range slot chosen by a
  stamina test the wrapper cannot see, so it never issues either.
- `bash` (23), `bombard` (21) and `snipe` (22) all require `using_bow`, which
  needs a secondary bow and a `swap_weapons` turn; no controller wires
  `swap_weapons` and the wrapper never issues it.
- `psyche_up` (direction 30) is hidden below `herolevel` 7 on the warrior
  controllers, and this hero is staged at 5.
- A charge writes `attack_direction` as a `SetMember` on the fighter clip, which
  `checkattackroll` never reads, so a charge cannot be a directed fixture at all
  (battle map §Where `attack_direction` is assigned).

A run whose first `checkattackroll` is the champion's own attack, or a charge,
closes the trace on that action instead and simply yields no match — a visible
failure, not a silent one.

## 7. The candidate fixtures this decode supports

Five `candidate-champion-*` fixtures under `test/fixtures/ss2-1v1/`. All five
share the hero and champion blocks above and `attackerSide` `"hero"`.

**They omit `scenario.fightMode`, and that is a compromise, not a preference.**
Absent means tournament to both the validator and the resolver, so the modelled
defeat gate is the right one either way. But ingest projects `fight_mode` only
when a fixture stages it, so omitting the key gives up the one channel a capture
reads straight from `_global` — and the battle map records the live `fight_mode`
of a tournament bout as still unobserved, which makes this bout the first place
it could have been asserted. The key was removed because
`test/ss2-post-tutorial-fixtures.test.js` — a repository guard, not a game rule
— asserts that **no fixture outside its two hard-coded family lists stages
tournament mode**, and that assertion fails on any new tournament family by
construction. It is the same hand-kept-roster shape that
`test/ss2-fixture-files.js` was refactored away from: the guard should derive
its families from a declared rule, or scope its "no others" clause to the
families it names. Until it does, restoring `"fightMode": "tournament"` to these
five fixtures is a one-line change per file and turns the mode back into
evidence.

| Fixture | Direction | What it discriminates |
| --- | ---: | --- |
| `candidate-champion-quick-armour-absorbed` | 1 | the quick band's `chance` 66 / `rollneeded` 34 at ratio 1, the inclusive hit boundary at `diceroll == rollneeded`, full absorption of `min_damage` 68 by armour 86, and the **absence** of a knockback draw (the 5–12/30 gate) |
| `candidate-champion-normal-armour-absorbed` | 5 | the normal band's 50/50, the `randomBetween(min_damage, max_damage)` damage draw over the new 68–92 window, and a knockback draw that does *not* apply force |
| `candidate-champion-power-armour-overflow` | 9 | the power band's 33/67, and the armour-overflow rewrite: 92 against 86 leaves `armourclass` at −6 until the clamp, carries 6 into hitpoints, and knocks back with **the 6, not the 92** (`force` = 6 + 30·6 = 186) |
| `candidate-champion-deflection-threshold-discriminator` | 5 | the critical-deflection threshold's operand mix — see below |
| `candidate-champion-power-hat-removal` | 9 | the `> 66` removal gate, the top-group selector, and that removing the champion's hat costs **25** armour (the capped `helmet_defence`) while zeroing a `helmet` field of 102 |

### The deflection discriminator

The battle map records the threshold as
`(100 - 1.5 * game_defender.helmet) + game_defender.greaves`, with the operand
mix flagged as the one unresolved part. The champion is the first opponent in
this project's reach whose `helmet` field and `helmet_defence` differ *by an
order of magnitude*, so the two readings are no longer close:

| Reading | Threshold | With deflection roll 42 |
| --- | ---: | --- |
| raw `helmet` 102 (the map's) | `100 − 153 + 2` = **−51** | cleared; `criticalhit` zeroed; dispatch `normal` |
| `helmet_defence` 25 | `100 − 37.5 + 2` = **64.5** | not cleared; `criticalhit` 20 survives; dispatch `critical` |

Under the map's reading **no critical can ever be dispatched against this
champion**, because −51 is below the floor of the inclusive 1–100 roll. Under
the rival reading a critical survives, and a critical bypasses the armour-first
branch entirely — so the two readings differ in *two* channels a capture
genuinely observes: the dispatched `defender_hurt` method, and the mutation
trace (`/villain/armourclass` 86→18 against `/villain/hitpoints` 110→42). This
is a strictly stronger instrument than
`candidate-deflection-threshold-discriminator`, whose two readings are 83 and
87 either side of an injected 85.

### The breastplate join, on every one of the five

The champion's `breastplate` 1 makes `ceil(1 * damage / 100)` equal 1 for every
damage value in these fixtures, and his `staminaleft` is already at
`staminamax`. Each fixture therefore predicts the same two-step tail —
`/villain/staminaleft` 150→151 `breastplate-stamina`, then 151→150
`stat-clamp` — which is a direct, cheap test of the map's claim that the
breastplate block is an unconditional join reached even when armour fully
absorbed the hit.

## 8. What this document does not establish

- Nothing here is runtime-verified. All five fixtures are `candidate`, with
  `runtimeVerified: false` and `synthetic-static-map` provenance. The 110 and 86
  in §5 are a *check* on the decode, not its source, and they leave every other
  number in the table unmeasured.
- `attack_type` and `attack_speed` are left `undefined` for a DNA-built villain
  and this decode does not say what writes `whichweapon`.
- Whether `is_that_virtuous` runs at all is still unsettled; §6.1 only shows
  that the staging is below its caps and so is insensitive to the answer.
- The three approach turns before the captured action are not modelled. The
  argument in §6.1 is that they cannot have changed either fighter's state
  *given that a trace exists*, not that their number is predictable.
- Tournaments 2–18 use the same chain and the same two functions; this document
  decodes only `which_boss == 1` and cites the other seventeen literals'
  offsets without applying the map to them.

## Reproduce the read-only inspection

```powershell
$ss2Install = 'C:\Program Files (x86)\Steam\steamapps\common\Swords and Sandals Classic Collection'
node tools/inspect-swf.mjs "$ss2Install\swf\swords_sandals2_download.swf" --function '^initcharacter$' --max-actions 4000
node tools/inspect-swf.mjs "$ss2Install\swf\swords_sandals2_download.swf" --function '^battlevalues$' --max-actions 6000
node tools/inspect-swf.mjs "$ss2Install\swf\swords_sandals2_download.swf" --function '^unleash_hell$' --max-actions 4000
node tools/inspect-swf.mjs "$ss2Install\swf\swords_sandals2_download.swf" --references '"value":"weapon24"' --around 6
```

`--references` matches the rendered `<opcode> <operand-json>` text, so a bare
identifier such as `^weapon24$` matches nothing; quote the JSON form as above.
These commands print analysis only. Do not redirect decompiled game code or
assets into the repository.
