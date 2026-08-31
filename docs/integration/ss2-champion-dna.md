# SS2 tournament champion DNA decode

Status: read-only static map, recorded 2026-08-30; revised 2026-08-31 to
reconcile with an independent re-derivation and to correct §7. Interoperability
research for the locally licensed Steam build identified in
[`ss2-build-fingerprint.json`](ss2-build-fingerprint.json). It contains no game
code, artwork, audio, exported scripts, or game binaries — only frame labels,
symbol names, character ids, instruction offsets, and numbers derived from them.

Read with [the battle map](ss2-battle-map.md); this document only adds the one
thing that map left as a parameter: **where a tournament opponent's combat
values come from, and what they are for tournament rank 1.**

## Status after independent audit (2026-08-31)

A write-nothing auditor re-derived this decode from the installed SWF without
using the arithmetic on this page, and reached a split verdict that the rest of
this document is written to reflect.

**The arithmetic holds, completely.** `hitpointsmax` 110 and `armourclass` 86
were both reproduced independently, offset for offset, with no free parameter
anywhere in the chain. The fifty-index map in §1 was re-parsed mechanically from
`initcharacter`'s opcode stream and came back byte-for-byte identical to the
published table. Nothing in §1–§5 is under-determined or back-fitted, and §5.1
below now records the arithmetic explicitly enough to re-check without
re-deriving from bytes.

**The framing does not hold, and it is corrected here.** This decode is a
*postdiction*: the twelve live draws that agree with it were recorded 42 to 72
minutes **before** this document's only commit. It was never a forward
prediction, and any summary that says the champion was "decoded before it was
ever seen" is wrong. §5 states the actual chronology, and states the stronger
argument that replaces it — the formulas were effectively pre-registered a full
day earlier, in a document containing no champion.

> **If you are carrying this claim into another document, carry the corrected
> form:** *the champion's numbers were derived with no free parameter, using
> formulas committed to the repository 21h39m before the champion was first met;
> twelve live draws then recorded exactly those numbers.* That is checkable and
> true. "Predicted before it was seen" is neither.

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

### The earlier construction site — the one the live evidence actually reads

Root frame 221 is not the first site to run this chain, and it is **not** the
site the twelve draws in §5 measured. The frame labels are
`arena_intro` spanning root frames **214–220** and `arena` spanning **221–226**,
and the wrapper emits its `versus` diagnostic at `arena_intro`'s Stop on root
frame **220** — one frame before frame 221's `DoAction` has executed at all.

The champion's derived fields have already materialised by then, at

```text
sprite:721[arena_champ]/frame:1/DoAction@0x223c61  +0x0105  CallMethod
```

which calls `skincharacter` with `_root.game.villain` (the `CallMethod` pops the
name, with `object` = `_root` and `numArgs` = 2, so argument 1 is
`_root.game.villain`). That runs the identical `initcharacter` → `battlevalues`
chain to the identical values, while `battle_started` is still `false` from root
frame 150 — so the refill branch of §4.3 runs there too.

No number in this document changes. The distinction matters only for
verification: a reader checking §5's live figures against the capture logs is
looking at values produced by `sprite:721`, not by root frame 221, and citing
only frame 221 would send them to a block that had not run yet.

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
this decode — the one constant an adversary would most suspect of having been
fitted, because without the cap `helmet` 102 yields `helmet_defence` 1020 and
`armourclass` 1081 instead of 25 and 86. So the branch polarity is settled by
**jump arithmetic, not by reading style**:

```text
+0x34a7  Push register:3, "helmet"; GetMember
+0x34af  Push 25
+0x34b7  Greater        ; helmet > 25
+0x34b8  Not
+0x34b9  Not            ; Not,Not = normalise to boolean; the test is unchanged
+0x34ba  If   {"delta":44,  "target":4185805}
+0x34bf  <ordinary arm>  helmet_defence = round(helmet * helmet_dval)
+0x34e6  Jump {"delta":52, "target":4185857}
+0x34eb  <special arm>   helmet_defence = round(herolevel * 0.5 * helmet_dval)
+0x351f  shinguard_defence = ...          ; the join
```

Recover the block base from the unconditional `Jump`, whose destination is
visibly the join at `+0x351f`:

```text
base       = 4185857 - 0x351f = 4185857 - 13599 = 4172258
If target  = 4185805 - 4172258 = 13547 = 0x34EB
```

So the `If` at `+0x34ba` jumps **to** `+0x34eb`. The taken arm — taken when
`helmet > 25` is true — is the capped one, and the ordinary
`round(helmet * helmet_dval)` arm is the fall-through at `+0x34bf`, which ends
by jumping over the special arm to the join. Therefore:

```text
helmet 102 > 25   ->  helmet_defence = round(herolevel * 0.5 * helmet_dval)
                   =  round(5 * 0.5 * 10)  =  25
```

Two further checks pin this from outside the bytes. The formula and the cap were
already written down in the battle map a day before this champion was met (§5),
so neither can have been chosen to produce 25. And the `herolevel` this arm
reads at `+0x34f6` is `whichcharacter.herolevel` — the **villain's** DNA index
24 = 5, not the hero's — which the live draws independently confirm (§5,
Check 1b).

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

## 5. The champion's derived state, and the checks against it

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

### 5.1 The two headline numbers, re-checkable without touching the bytes

An independent auditor reproduced both numbers from the SWF without using this
document's arithmetic. What follows is that chain written out in full, so the
next reader can re-check it from the table in §2 and the multipliers in §4
alone. Every input is a literal in the opcode stream; there is no step at which
a decoder had latitude.

**`hitpointsmax` — one unconditional statement at `+0x378e`:**

```text
hitpointsmax = herolevel * 10 + vitality * 20
             = 5 * 10 + 3 * 20          ; DNA index 24 = 5, index 20 = 3
             = 50 + 60
             = 110
```

No branch guards it, and nothing after `+0x3c0d` rewrites the field.

**`armourclass` — an eight-term sum at `+0x3ac3`–`+0x3b0e`, then a copy at
`+0x3b0f`:**

| Piece | DNA index | DNA value | `_dval` | Arm | `<piece>_defence` |
| --- | ---: | ---: | ---: | --- | ---: |
| `breastplate` | 8 | 1 | 16 | `round(1 * 16)` | 16 |
| `helmet` | 9 | **102** | 10 | **capped** `round(5 * 0.5 * 10)` | **25** |
| `shinguard` | 11 | 4 | 6 | `round(4 * 6)` | 24 |
| `greaves` | 10 | 2 | 3 | `round(2 * 3)` | 6 |
| `shoulderguard` | 6 | 1 | 8 | `round(1 * 8)` | 8 |
| `gauntlet` | 7 | 1 | 5 | `round(1 * 5)` | 5 |
| `boot` | 12 | 1 | 2 | `round(1 * 2)` | 2 |
| `shield` | 14 | 0 | 12 | `round(0 * 12)` | 0 |

```text
armourclass_max = 16 + 25 + 24 + 6 + 8 + 5 + 2 + 0  =  86
armourclass     = armourclass_max                    =  86
```

The sum is in the summands' opcode order, which is the table's row order. The
only term that is not a plain multiply is the helmet, and §4.2 settles its arm
by jump arithmetic.

The refill block holding those last two statements is gated at
`+0x3a90`–`+0x3aa0` on `battle_started == true`, whose `If` jumps 360 bytes
**past** the block. Root frame 150 writes `battle_started = false`; root frame
221 writes `true` as its *last* statement, after all four `skincharacter` calls.
So at every construction site — including `sprite:721` — the flag is still
false, the jump is not taken, and the block runs.

### 5.2 Check 1 — the live numbers, and what they are and are not

Across four capture sessions — `arena-tourn-2` (5 draws), `arena-staged-1` (3),
`arena-staged-2` (3) and `arena-champ-1` (1) — **twelve** `versus` lines record
`"villainName":"John the Butcher"` with `villainHitpointsmax` 110 and
`villainArmourclass` 86. Twelve for twelve, no other pair. The decode produces
110 at `+0x378e` and 86 at `+0x3ac3` with no free parameter. It agrees.

**This is a postdiction, not a prediction, and it must not be described as one.**
The chronology is checkable and runs the other way:

| When (EDT) | What |
| --- | --- |
| 2026-08-29 23:57:47 | `6dc750e` commits **every formula constant** to [`ss2-battle-map.md`](ss2-battle-map.md) — the HP formula, the eight multipliers, and the `helmet > 25` cap with its exact special arm — in a document containing no champion |
| 2026-08-30 21:36 | first champion draw recorded |
| 2026-08-30 22:06 | twelfth and last champion draw recorded |
| 2026-08-30 22:48:51 | `5d3d777`, this document's **only** commit, and the commit that authored all five fixtures |

The last draw precedes this document's existence by 42 minutes; the first by 72.
So 110 and 86 were known in the repository before the decode was written down,
and this check was available at authoring time. §8 already said as much — these
are a check on the decode, not its source — and that wording stands.

**The stronger argument, which does not depend on chronology at all.** The
fitting hypothesis fails on its own terms, because the derivation has no free
parameter to fit *with*: every constant it consumes was committed 21 hours 39
minutes before the champion was first met, in `6dc750e`, in a document that
contains no champion. The formulas were effectively pre-registered. What would
have broken this — a shifted index map, a helmet cap invented to fit, or a
formula postdating the observation — fails on all three counts: the index map is
50 sequential opcodes with no shift that works (shifting by −1 gives 70/669, by
+1 gives 40/1731), the cap predates the observation, and so does the formula.

**And the pair is discriminating**, which is what makes agreement worth
anything. Against a randomised DNA index map the joint probability of landing on
both 110 and 86 is roughly **1 in 10,000** — about twelve times sharper than the
same null applied to the prisoner check below. Applying this document's index map
to all eighteen hard-coded boss literals, `which_boss == 1` is the *only* one
that gives (110, 86); the nearest neighbours are boss 0 at (10, 0) and boss 2 at
(170, 256). And across the roughly forty distinct `(hitpointsmax, armourclass)`
pairs this project has actually met from generated opponents — which include
(110, 52), (100, 87) and (60, 90) — the pair (110, 86) occurs on John the
Butcher's lines and nowhere else.

*Honest caveat on the null:* permuting just the eight multipliers among the
eight pieces lands on 86 in about 2 % of cases, and 86 is not even the modal
outcome of that permutation. But the multipliers were not free — see `6dc750e`
above — so that particular null does not apply here.

**Check 1b — the live draws falsify a rival reading of the helmet arm.** The
capped arm at `+0x34eb` reads `whichcharacter.herolevel`, i.e. the *villain's*
DNA index 24 = 5. A reading that took the **hero's** `herolevel` instead would
give `round(4 * 0.5 * 10)` = 20 and `armourclass` 81 on any draw taken at hero
level 4. The twelve draws span two hero levels — **two at level 4** (in
`arena-tourn-2` and `arena-champ-1`) and ten at level 5 — and `armourclass`
reads 86 in all twelve. The recorded value is therefore *invariant under hero
level*, which is consistent only with the villain's own `herolevel` feeding the
capped arm. This is a real falsification test the live data passed, and it is
worth considerably more than the twelvefold repetition of an identical literal —
which is trivially expected once you know the source is a string constant.

**What the twelve draws are NOT.** They are `{"t":"dbg", ...}` diagnostic lines
in gitignored operator logs under `captures/` (`.gitignore` admits only
`captures/README.md`). They carry no launch nonce, they are cited by no golden,
`delog` strips every `dbg` line before ingest ever sees them, and all five
`candidate-champion-*` fixtures still declare `runtimeVerified: false`. They are
twelve launches, not the two-session independence the promotion gate means by
"independent". **The champion bout has not been captured.** Nothing in §5 is
promoted evidence.

One forgery vector was checked and is closed: the wrapper *can* stage villain
fields, but none of the twelve logs contains a single `villain.<field>=` staging
token — every `"at":"staged"` line in them is hero-only — and staging cannot
reach these values in principle, because `stepStaging` returns early unless
`battle_started == true` while the `versus` line is emitted at root frame 220,
before frame 221 sets it.

### 5.3 Check 2 — the tutorial prisoner, decoded by the same map

**This is the genuinely prior and independent check**, and none of §5.2's
qualifications touch it. The prisoner is
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

Its independence is of a different and better kind than Check 1's: those
twenty-two goldens were promoted long before this decode existed, through the
two-session gate, from committed observation records — so the load-bearing
confirmation language belongs here rather than on the champion's own 110 and 86.
Its null is looser (roughly 1 in 887 against a randomised index map, against
Check 1's 1 in 10,000, because the prisoner's literal is nearly all zeroes), but
its evidence is retained, promoted and citable, which Check 1's is not.

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
  No previously captured fight has this ratio. The function is
  `attack_chances(game_attacker, game_defender)` at
  `sprite:862[overlay]/frame:1/DoAction@0x236941`, and the three band factors
  are literals in it at `+0x041f` (0.33), `+0x046e` (0.5) and `+0x04bd` (0.66),
  with the `+9` on each of `attack` and `defence` pushed just above each one.
  **This block is cited by none of the five fixtures' `sourceRefs`**, which name
  `unleash_hell`, `initcharacter`, `battlevalues` and the two overlay frame 52
  blocks only — so a reader auditing `chance` and `rollNeeded` from a fixture
  alone cannot reach the bytes that produce them. Cite it here until the
  fixtures carry it.
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

**All five stage `"fightMode": "tournament"`.** This section previously said they
omitted the key; that was wrong when it was written, and it is corrected here.

The history is worth one paragraph, because it is the reason the key is
load-bearing. `test/ss2-post-tutorial-fixtures.test.js` once asserted that **no**
fixture outside its two hard-coded family lists staged tournament mode — a
hand-kept roster that failed on any new tournament family by construction. The
champion family hit it and dropped the key, forfeiting one of the few channels a
capture genuinely reads from the game. The guard has since been restated
positively: a fixture may stage tournament mode only if it belongs to a family
*declared* capable of it, and `candidate-champion-` is now one of the three
declared prefixes. The key is back in all five files, verified in the tree:

```text
test/fixtures/ss2-1v1/candidate-champion-deflection-threshold-discriminator.json:32
test/fixtures/ss2-1v1/candidate-champion-normal-armour-absorbed.json:31
test/fixtures/ss2-1v1/candidate-champion-power-armour-overflow.json:32
test/fixtures/ss2-1v1/candidate-champion-power-hat-removal.json:32
test/fixtures/ss2-1v1/candidate-champion-quick-armour-absorbed.json:31
```

Staging the key changes what ingest does. `capture-ingest.js` projects
`fight_mode` **only** when the fixture stages it: with the key present it
*requires* the trace to carry a `fight_mode` var and refuses the trace outright
if it does not (`The target fixture stages a fightMode, which was not
recorded.`), then copies the recorded value into the comparison. So the mode is
no longer an assumption the resolver makes on the fixture's behalf — it is a
value the capture has to produce and agree on.

### A mode mismatch on the first champion run is a FINDING, not a failed run

**Read this before running the family.** `campaign.mjs plan --family champion`
carries a standing note on every one of the five members:

> `note (unobserved-fight-mode)`: no runtime observation records `fight_mode`
> "tournament" yet (67 runtime observations carry "duel", "misc"). A mode
> mismatch on the first such run is a finding, not a failed run.

This bout is the first place `fight_mode` "tournament" could ever be asserted
from a record. If the first champion capture comes back with a mode that is not
"tournament", the correct response is to **write the observed mode down as a
discovery about the build** — and to re-examine the defeat-gate modelling that
§6 and the post-tutorial family both rest on — rather than to re-run until it
matches or to edit the fixtures to fit. Editing five candidates to agree with one
trace is precisely the fit-to-observation failure this pipeline exists to
prevent.

Two supporting facts, so the next operator can weigh a mismatch correctly rather
than assuming the worst:

- **The planner's note is about observation records, and it is accurate.** No
  committed record under `test/observations/` carries `fight_mode` "tournament";
  the 67 that exist carry "duel" and "misc".
- **The operator logs nevertheless already read "tournament" on this exact
  bout.** The wrapper's `versus` diagnostic prints `_global.fight_mode` directly,
  and it reads `"fightMode":"tournament"` on all twelve champion draws (and on 40
  arena `versus` lines overall, against 13 "duel" and 1 "misc"). That is a `dbg`
  line, stripped by `delog` before ingest, so it is **not** evidence and does not
  discharge the note — but it does mean a mismatch would contradict the
  wrapper's own live read of `_global`, and would therefore be a genuinely
  surprising result rather than an expected one.

| Fixture | Direction | What it discriminates |
| --- | ---: | --- |
| `candidate-champion-quick-armour-absorbed` | 1 | the quick band's `chance` 66 / `rollneeded` 34 at ratio 1, the inclusive hit boundary at `diceroll == rollneeded`, full absorption of `min_damage` 68 by armour 86, and the **absence** of a knockback draw (the 5–12/30 gate) |
| `candidate-champion-normal-armour-absorbed` | 5 | the normal band's 50/50, the `randomBetween(min_damage, max_damage)` damage draw over the new 68–92 window, and a knockback draw that does *not* apply force |
| `candidate-champion-power-armour-overflow` | 9 | the power band's 33/67, and the armour-overflow rewrite: 92 against 86 leaves `armourclass` at −6 until the clamp, carries 6 into hitpoints, and knocks back with **the 6, not the 92** (`force` = 6 + 30·6 = 186) |
| `candidate-champion-deflection-threshold-discriminator` | 5 | the critical-deflection threshold's operand mix — see below |
| `candidate-champion-power-hat-removal` | 9 | the `> 66` removal gate, the top-group selector, and that removing the champion's hat costs **25** armour (the capped `helmet_defence`) while zeroing a `helmet` field of 102 |

**Direction 9 is forced for the hat-removal fixture, not chosen.** `remove_armour`
selects its piece group by direction, and the group that can reach the helmet is
`{1, 5, 8, 9}` (battle map, *The direction-to-piece mapping inside
`remove_armour`*). Of the power band's four directions 9–12, only **9** is in
that group. A later edit that "tidies" this to 10 or 11 to avoid the duplicate
with `candidate-champion-power-armour-overflow` would silently destroy the
fixture's whole purpose.

The other band choices are map-derived at band level and free within it:
`power_attack` draws `randomBetween(9,12)`, `normal_attack` `randomBetween(5,8)`,
`quick_attack` `randomBetween(1,4)`. The two within-band duplicates (5, 5 and
9, 9) are arbitrary but cost nothing, because the five members already need
five distinct injectable tapes and must be captured one at a time regardless.

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
- **The check is a postdiction.** The twelve draws were recorded 42–72 minutes
  before this document's only commit (§5.2). The decode is not thereby weakened —
  the auditor reproduced both numbers from the bytes independently, and every
  formula constant predates the champion by 21h39m — but the *order* is the
  opposite of the one a summary would naturally assume, and it should not be
  restated as a forward prediction.
- **The twelve draws are not retained evidence.** They live in gitignored
  operator logs, carry no launch nonce, are cited by no golden, and are stripped
  before ingest. Two of the five headline numbers being corroborated by
  uncommitted logs is materially weaker than it sounds; the champion bout still
  has to be captured.
- The `attack_chances` block that produces every `chance` and `rollNeeded` in
  the five fixtures is cited in §6.2 of this document and in **none** of the
  fixtures' own `sourceRefs` (§6.2).
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

# The frame spans behind the construction-site note in "Where the DNA string is
# consumed": arena_intro 214-220, arena 221-226.
node tools/inspect-swf.mjs "$ss2Install\swf\swords_sandals2_download.swf" --labels

# The earlier construction site, and the attack_chances block cited in 6.2.
node tools/inspect-swf.mjs "$ss2Install\swf\swords_sandals2_download.swf" --references '"value":"skincharacter"' --around 10
node tools/inspect-swf.mjs "$ss2Install\swf\swords_sandals2_download.swf" --function-names '^attack_chances$'
```

`--references` matches the rendered `<opcode> <operand-json>` text, so a bare
identifier such as `^weapon24$` matches nothing; quote the JSON form as above.
These commands print analysis only. Do not redirect decompiled game code or
assets into the repository.

### Re-checking the claims in §5 and §7 without the SWF

```powershell
# Section 7: all five fixtures stage tournament mode.
Select-String -Path 'test/fixtures/ss2-1v1/candidate-champion-*.json' -Pattern 'fightMode'

# Section 7: the planner's standing unobserved-fight-mode note.
node tools/runtime-capture/campaign.mjs plan --family champion

# Section 5.2: the twelve draws, their spread over four capture sessions, and
# the two hero levels behind Check 1b. captures/ is gitignored operator data.
Select-String -Path 'captures/*/*.rufflelog' -Pattern 'John the Butcher' |
  ForEach-Object { $_.Path } | Split-Path -Parent | Group-Object

# Section 5.2: the chronology. The decode has exactly one commit, and 6dc750e is
# where every formula constant was pre-registered.
git log --format='%H|%ad|%s' --date=iso -- docs/integration/ss2-champion-dna.md
git log -S 'herolevel * 10' --all --format='%H|%ad|%s' --date=iso
```
