# SS2 weapon and armour item tables, and the shop gates

Status: read-only static map, recorded 2026-08-30. Completes section 6
("Equipment") of [the arena route map](ss2-arena-route.md); same licensed build,
same [fingerprint](ss2-build-fingerprint.json), same inspection boundary.

Everything below was read from the installed
`swf/swords_sandals2_download.swf` in place. Nothing was launched, patched,
copied or exported; no save was touched. Every claim carries a
`sprite:<id>/frame:<n>/DoAction@<addr>` context and a `+0x....` instruction
offset within that block, and every number is either an authored numeric
literal or arithmetic derived from one.

**Inspection boundary note.** Each weapon and armour item also carries a
**display-name string literal**. Names are game content, not structure, so this
document does not reproduce any of them — items are identified by **id** only,
exactly as the wrapper addresses them. The same is true of the shopkeeper
dialogue and the refusal texts, which appear below as `<refusal text>`. Anyone
reproducing the inventory with the commands in the last section will see the
names in their own terminal; they do not belong in the repository.

---

## 0. The answer the route needs

### 0.1 The formula this is all in service of

`battlevalues` (`root/frame:35/DoAction@0x3fa9dc`) derives, for a character
`c` (register 3), with `_root` in register 1 and `_global` in register 2:

```text
c.weapon_type       = _root["weapon" + c.weapon][0]                  // +0x3122
c.weapon_name       = _root["weapon" + c.weapon][1]                  // +0x3142
c.weapon_typename   = _root.weapontypes[c.weapon_type]               // +0x315e
c.weapon_weight     = _root["weapon" + c.weapon][2]                  // +0x3174
c.weapon_range      = c.physical_size
                    + _root["weapon" + c.weapon][5] * 44             // +0x3190
c.weapon_min_damage = _root["weapon" + c.weapon][3]                  // +0x31be
c.weapon_max_damage = _root["weapon" + c.weapon][4]                  // +0x31da

c.min_damage = Math.round(c.strength * 2) + c.weapon_min_damage      // +0x3356
c.max_damage = Math.round(c.strength * 2) + c.weapon_max_damage      // +0x3386
```

**Two corrections to the brief this task was written from:**

1. The multiplier on strength is **2**, not 1 (`Push 2; Multiply` at `+0x3362`
   and `+0x3392`). The secondary pair uses **1** (`+0x33c2`, `+0x33f2`).
2. There is no `weapons` array and no `weapon_min_damage` field in the table.
   The table is **80 separate root variables** `_root.weapon1` … `_root.weapon80`
   (plus `weapon0` and nine off-shop ids), each a 6-element `Array`. The
   `weapon_*` names are the *outputs* `battlevalues` writes onto the character.

So the input the route can actually change is `hero.weapon` — a small integer —
and the shop is the only path that writes it for the hero from a purchase.

### 0.2 The recommendation

**`-ShopWeapon 20`, and it is useless without staging an attribute first.**

| | |
| --- | --- |
| Recommended id | **20** — slashing band, `weap_i` 20, `itemlevel` 60, `[3]/[4]` = **26 / 676** |
| Attribute needed | **`hero.speed >= 60`** (Agility). Staged, e.g. `-StageHero "speed:60"` |
| Resulting battle damage | `min_damage = 2*strength + 26`, `max_damage = 2*strength + 676` |
| Shop cost before discounts | 94 538 gold — well inside a staged `-StageGold` |
| Page it lives on | `slashing3` (sprite 1961 frame **116**) |

Id 20 has the **highest `[4]` (max damage) of any of the 80 shop items**, and
from `weap_i >= 3` upward the slashing band beats both strength bands on `[4]`
at every equal `weap_i`. Its `[3]` (min damage) is low — 26 — so if the operator
wants a high *floor* instead of a high *ceiling*, the alternative is **id 40**
(`strength >= 60`, 170 / 440) or **id 60** (`strength >= 60`, 160 / 480).

**With base attributes, no weapon at all is purchasable.** A newly created
gladiator starts at `strength = speed = 1` (`heroDNA` literal, indices 16 and
17 — see §6) plus 9 creation points and per-level points; the cheapest item in
every band has `itemlevel = 3` and the gate is `itemlevel <= attribute`. The
project's `level4-vitality-tournament-gate` snapshot spent everything on
vitality, so **every one of its shop attempts is refused** — which is exactly
what capture `arena-shop-3` recorded: nine pages walked, `shop-exhausted` with
`"tries":25`, not one purchase.

### 0.3 Best candidates at several attribute levels

Primary weapon only (the ranged band writes `secondary_weapon`, not `weapon` —
see §4.4). `A` is whichever attribute governs the band: `speed` for slashing,
`strength` for hacking and bashing. Allowed band position is
`weap_i <= floor(A / 3)`.

| A | best `[4]` | 2nd | 3rd |
| ---: | --- | --- | --- |
| 3 | **21** hacking 4/16 | 41 bashing 4/12 | 1 slashing 3/9 |
| 6 | **22** hacking 5/20 | 2 slashing 4/16 | 21 hacking 4/16 |
| 9 | **3** slashing 5/25 | 23 hacking 6/24 | 43 bashing 8/24 |
| 12 | **4** slashing 6/36 | 24 hacking 8/32 | 44 bashing 10/30 |
| 15 | **5** slashing 7/49 | 45 bashing 15/45 | 25 hacking 10/40 |
| 18 | **6** slashing 8/64 | 26 hacking 15/60 | 46 bashing 20/60 |
| 24 | **8** slashing 10/100 | 48 bashing 30/90 | 7 slashing 9/81 |
| 30 | **10** slashing 14/196 | 9 slashing 12/144 | 30 hacking 30/120 |
| 36 | **12** slashing 18/324 | 11 slashing 16/256 | 10 slashing 14/196 |
| 42 | **14** slashing 20/400 | 13 slashing 19/361 | 12 slashing 18/324 |
| 48 | **16** slashing 22/484 | 15 slashing 21/441 | 14 slashing 20/400 |
| 54 | **18** slashing 24/576 | 17 slashing 23/529 | 16 slashing 22/484 |
| 57 | **19** slashing 25/625 | 18 slashing 24/576 | 17 slashing 23/529 |
| **60** | **20 slashing 26/676** | 19 slashing 25/625 | 18 slashing 24/576 |

The strength bands never top the table above `weap_i` 2, but they carry a far
higher `[3]`. If the operator wants a damage *floor* rather than a ceiling, the
`weap_i`-20 strength picks are id **40** (170/440) and id **60** (160/480)
against id 20's 26/676.

Ranged band, for a *secondary* weapon (`speed` gated, and **id 61 is not
purchasable at all** — see §3.4):

| `speed` | best ranged id | `[3]/[4]` |
| ---: | ---: | --- |
| 6 | 62 | 5 / 25 |
| 12 | 64 | 7 / 49 |
| 24 | 68 | 11 / 121 |
| 36 | 72 | 15 / 225 |
| 48 | 76 | 19 / 361 |
| 60 | 80 | 23 / 529 |

### 0.4 Armour, same question

The armour gate is `itemlevel <= hero.herolevel`, and armour `itemlevel` is a
**step function of the item number** (§3.2), not `n * 3`:

| item number | 2–4 | 5–6 | 7–9 | 10–12 | 13–15 | 16–18 | 19–21 | 22–24 | 25 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `itemlevel` | 1 | 6 | 12 | 18 | 24 | 30 | 36 | 42 | 48 |

**A herolevel 4–5 gladiator can buy item numbers 2, 3 and 4 only** — the
`itemlevel 1` tier. Item 5 needs herolevel 6. A full set-4 kit across all eight
pieces is `armourclass` **248** for 30 624 gold before discounts (§5.3).
`-ShopArmour 4` is therefore the ceiling at level 4–5, and nothing the operator
can stage changes it short of staging `herolevel` itself.

---

## 1. Are the per-item handlers wired for all ids? **No.**

This is the answer to the live stall, and it has two independent parts.

### 1.1 `weaponbuttons()` is never called on the `browse` page

Whole-build reference check on the name (`--references '"value":"weaponbuttons"'`):
**13 hits, one definition and twelve calls**, and every call is on a *category
page* frame:

| Called at | Frame label |
| --- | --- |
| `sprite:1961/frame:48/DoAction@0x612e90` `+0x0000` | `bashing1` |
| `sprite:1961/frame:56/DoAction@0x613016` `+0x0000` | `bashing2` |
| `sprite:1961/frame:64/DoAction@0x61310a` `+0x0000` | `bashing3` |
| `sprite:1961/frame:72/DoAction@0x613215` `+0x0000` | `hacking1` |
| `sprite:1961/frame:80/DoAction@0x613377` `+0x0000` | `hacking2` |
| `sprite:1961/frame:88/DoAction@0x613487` `+0x0000` | `hacking3` |
| `sprite:1961/frame:96/DoAction@0x613575` `+0x0000` | `slashing1` |
| `sprite:1961/frame:106/DoAction@0x6136b7` `+0x0000` | `slashing2` |
| `sprite:1961/frame:116/DoAction@0x6137c6` `+0x0000` | `slashing3` |
| `sprite:1961/frame:124/DoAction@0x6138d2` `+0x0000` | `ranged1` |
| `sprite:1961/frame:131/DoAction@0x613a31` `+0x0000` | `ranged2` |
| `sprite:1961/frame:139/DoAction@0x613b1e` `+0x0000` | `ranged3` |

There is **no call at `enter` (1), `browse` (26), `angry` (27), `buy` (37) or
`getitem` (147)**. The armoury is the same shape: `armourbuttons()` has 21 hits,
one definition at `sprite:1909/frame:1/DoAction@0x5f1fa9` `+0x0786` and twenty
calls, each at `+0x0016` of a per-piece page frame (48, 56, 64, 71, 79, 86, 93,
99, 105, 111, 117, 124, 131, 138, 146, 152, 158, 164, 171, 177).

### 1.2 Even on a page, only that page's item clips exist

`weaponbuttons()` loops `i = 1..80` (`+0x05a6` `Push 80; Greater; Not; Not; If`,
loop back at `+0x0982`) and assigns to `this["item" + i]`. In AVM1 a
`SetMember` on `undefined` is a silent no-op, so **ids not placed on the current
frame get nothing** — no `itemlevel`, no `attribute_required`, no `onRollOver`,
no `onRelease`.

`PlaceObject2` instance names per frame in sprite 1961:

| Frame | Label | Item clips placed |
| ---: | --- | --- |
| 48 | `bashing1` | 41 42 43 44 45 46 47 48 |
| 56 | `bashing2` | 49 50 51 52 53 |
| 64 | `bashing3` | 54 55 56 57 58 60 |
| 72 | `hacking1` | 21 22 23 24 25 26 27 28 29 |
| 80 | `hacking2` | 30 31 32 33 35 40 |
| 88 | `hacking3` | 34 36 37 38 39 |
| 96 | `slashing1` | 1 2 3 4 5 6 7 8 |
| 106 | `slashing2` | 9 10 11 12 13 14 |
| 116 | `slashing3` | 15 16 17 18 19 20 |
| 124 | `ranged1` | 62 63 64 65 66 67 68 69 70 |
| 131 | `ranged2` | 71 72 73 74 75 |
| 139 | `ranged3` | 76 77 78 79 80 |

Note the pages are **not in id order** — 34 sits on `hacking3` while 35 and 40
sit on `hacking2`.

**Ids 59 and 61 are placed on no page at all**, so they can never be bought.
(59 would be `strength >= 57`, 140/420; 61 would be `speed >= 3`, 4/16.)

### 1.3 This replicates against the project's own capture logs

`captures/arena-shop-2/arena-shop-2-obs-a1.rufflelog` enumerated the weaponsmith
clip's own properties at shop frames **38** and **47** (between `buy` and
`bashing1`):

```text
"step":"shop-no-handlers", ... "shopFrame":38, "props":
  "initbubbletext bubbletext buyweapon getweaponinfo weaponbuttons coins_text
   instance431 instance437 ... shopkeeper instance432 hand instance423 "
```

No `item<n>` property of any kind. The same run at frame 47 reports the same
list. And in `captures/arena-shop-3/…` at shop frame **87** — seven frames past
the `hacking2` page — the enumeration reads
`… item35 item33 item32 item31 item30 item40 …`: **exactly the six ids the
static instance table gives for frame 80**, and no others. The display list is
reset by the `gotoAndPlay`, so previous pages' items are gone.

**Conclusion:** the handlers are wired for *a page at a time*, and a navigator
must send the shop clip to a category page before any `item<n>.onRelease` exists.
The wrapper already does this (`shop.gotoAndPlay(page)`), and the logs show the
page walk working.

### 1.4 The second half of the stall: `onRelease` alone is not enough

`buyweapon` does **not** read the item that was clicked. It reads three
timeline variables on the weaponsmith clip — `itemnumber`, `itemtype`,
`itemcost` — and **only `getweaponinfo` ever sets them**:

```text
getweaponinfo(whichweapon)                     // r1 = _root, r2 = whichweapon
  itemnumber = whichweapon._name.charAt(4)
             + whichweapon._name.charAt(5)                    // +0x09ac
  itemnumber = Number(itemnumber)                             // +0x09e0
  itemtype   = _root["weapon" + itemnumber][0]                // +0x09ea
  itemtype   = _root.weapontypes[itemtype]                    // +0x0a06
  itemweight = _root["weapon" + itemnumber][2]                // +0x0a18
  itemweight = _root.weaponweights[itemweight]                // +0x0a30
  itemcost   = Math.round(_root["weapon"+itemnumber][0] * 2
                        + _root["weapon"+itemnumber][3] * 9
                        + _root["weapon"+itemnumber][4] * 45 * 3.1)   // +0x0a42
  if (itemtype == "ranged") itemcost = Math.round(itemcost / 2)       // +0x0ad5
  ...
```

`getweaponinfo` is wired **only as `onRollOver`** (`weaponbuttons` `+0x089b`,
body `+0x08ab` calls `getweaponinfo(this)`). A human hovers before clicking; a
script that calls `onRelease()` directly never does.

`weaponbuttons` itself contains one stray `itemnumber = Number(weap_i)` at
`+0x07f6`, on the common path of the `i = 1..80` loop — so after the loop
finishes, `itemnumber` holds `weap_i` for `i = 80`, which is **20**.

That prediction is confirmed to the digit by
`captures/arena-shop-5/arena-shop-5-obs-a1.rufflelog`:

```text
"step":"shop-operands-unreadable", ... "itemcost":"NaN","itemnumber":"20",
"goldpieces":"5000000","shopFrame":154
```

`itemnumber` is exactly 20; `itemcost` is `NaN` because `buyweapon` computes
`char_discount = itemcost * charisma / 200` (`+0x0fd5`) from an `itemcost`
nobody initialised, then subtracts it (`+0x1026`).

And in `captures/arena-shop-4/…` the confirm did fire:

```text
"step":"shop-bought", ... "item":39,"cost":null,"weapon":20,"goldLeft":4000
```

Item **39** was pressed; `hero.weapon` became **20**; and 5 000 000 staged gold
became 4 000, because `goldpieces -= NaN` produced `NaN` and `check_for_nan`
repaired it to `herolevel * 1000`.

**Unverified:** whether calling `item<n>.onRollOver()` immediately before
`item<n>.onRelease()` is behaviourally identical to a real hover-then-click.
Nothing in either handler reads mouse state, so it should be, but it has not
been run.

---

## 2. The weapon data table

### 2.1 Where it lives and how it is shaped

All of it is built as plain root variables in one run of literals at
`root/frame:35/DoAction@0x3fa9dc`, `+0x3c46` … `+0x4c9c`. Each entry is:

```text
Push "weapon<N>", a, b, c, d, <name>, e, 6, "Array" ; NewObject ; SetVariable
```

`NewObject` pops the class name, then the argument count, then the arguments
from the top of the stack, so the compiler pushes them in reverse. The resulting
array is therefore `[e, name, d, c, b, a]`:

| index | meaning | read by |
| ---: | --- | --- |
| `[0]` | type index into `weapontypes` | `battlevalues` `+0x3122`, `getweaponinfo` `+0x09ea` |
| `[1]` | display name (string literal; not reproduced here) | `battlevalues` `+0x3142`, `buyweapon` `+0x0cf2` |
| `[2]` | weight index into `weaponweights`; also `attack_speed` | `battlevalues` `+0x3174` and `+0x346a` |
| `[3]` | **min damage** | `battlevalues` `+0x31be` |
| `[4]` | **max damage** | `battlevalues` `+0x31da` |
| `[5]` | range multiplier (`weapon_range = physical_size + [5]*44`) | `battlevalues` `+0x3190` |

Supporting arrays, same block:

```text
armourweights    = ["", ?, ?, ?]                     // +0x3c46  (4 entries)
armourtypes      = ["", "boot", "shinguard", "greaves", "breastplate",
                    "gauntlet", "shoulderguard", "helmet", "shield"]  // +0x3c76
armoursets       = ["", "", <25 set names>]          // +0x3c96  (27 entries)
armoursetweights = [1,1,1,2,3,1,2,2,3,1,1,2,2,3,1,2,3,2,3,1,3,2,2,3,1,2,3]
                                                     // +0x3cda  (27 entries)
weapontypes      = ["", "slashing", "bashing", "hacking", "ranged"]   // +0x3d8c
weaponenchantments_potency (4)                       // +0x3da4
weaponenchantments (6)                               // +0x3dba
weaponweights (6)                                    // +0x3dd4
```

Weight index 1 is the heaviest and 5 the lightest (the string literals run
"Very heavy" → "Very light", pushed in that order at `+0x3dd4`).

`physical_size = 80 + Math.round(strength / 1.5)` (`battlevalues` `+0x30f1`),
which is why `weapon_range` moves with strength as well as with `[5]`.

### 2.2 The band → category mapping is CONFIRMED, not assumed

The route map's `1–20 slashing / 21–40 hacking / 41–60 bashing / 61–80 ranged`
is **correct**, and it is now verified from two independent places rather than
inferred:

- Every id 1–20 has `[0] = 1`; 21–40 have `[0] = 3`; 41–60 have `[0] = 2`;
  61–80 have `[0] = 4`. Zero exceptions across all 80 literals.
- `weapontypes[1] = "slashing"`, `[2] = "bashing"`, `[3] = "hacking"`,
  `[4] = "ranged"` (`+0x3d8c`).
- The frame labels agree: the ids on `bashing1..3` all have `[0] = 2`, the ids
  on `hacking1..3` all have `[0] = 3`, and so on.

Note the *timeline* order of the pages (bashing 48/56/64, hacking 72/80/88,
slashing 96/106/116, ranged 124/131/139) is **not** the id order. That is a
layout fact, not a data fact.

### 2.3 The full shop table (ids 1–80)

`weap_i` is the position within the band; `itemlevel = weap_i * 3`; the gate is
`itemlevel <= <attribute>` where the attribute is `speed` for slashing and
ranged, `strength` for hacking and bashing (§3.1). `shop itemcost` is the
undiscounted quote `getweaponinfo` computes at `+0x0a42` (halved for ranged at
`+0x0ad5`); §4 gives the discounts.

| id | band | `weap_i` | `itemlevel` | gate | `[0]` type | `[3]` min | `[4]` max | `[2]` wt | `[5]` rng | shop `itemcost` | page | literal at |
| ---: | --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| 1 | slashing | 1 | 3 | `speed >= 3` | 1 | 3 | 9 | 5 | 1 | 1285 | `slashing1` | `+0x3e17` |
| 2 | slashing | 2 | 6 | `speed >= 6` | 1 | 4 | 16 | 5 | 1 | 2270 | `slashing1` | `+0x3e40` |
| 3 | slashing | 3 | 9 | `speed >= 9` | 1 | 5 | 25 | 5 | 1 | 3535 | `slashing1` | `+0x3e69` |
| 4 | slashing | 4 | 12 | `speed >= 12` | 1 | 6 | 36 | 4 | 1 | 5078 | `slashing1` | `+0x3e92` |
| 5 | slashing | 5 | 15 | `speed >= 15` | 1 | 7 | 49 | 3 | 2 | 6901 | `slashing1` | `+0x3ebb` |
| 6 | slashing | 6 | 18 | `speed >= 18` | 1 | 8 | 64 | 3 | 2 | 9002 | `slashing1` | `+0x3ee4` |
| 7 | slashing | 7 | 21 | `speed >= 21` | 1 | 9 | 81 | 3 | 2 | 11383 | `slashing1` | `+0x3f0d` |
| 8 | slashing | 8 | 24 | `speed >= 24` | 1 | 10 | 100 | 3 | 2 | 14042 | `slashing1` | `+0x3f36` |
| 9 | slashing | 9 | 27 | `speed >= 27` | 1 | 12 | 144 | 3 | 2 | 20198 | `slashing2` | `+0x3f5f` |
| 10 | slashing | 10 | 30 | `speed >= 30` | 1 | 14 | 196 | 3 | 2 | 27470 | `slashing2` | `+0x3f88` |
| 11 | slashing | 11 | 33 | `speed >= 33` | 1 | 16 | 256 | 3 | 2 | 35858 | `slashing2` | `+0x3fb1` |
| 12 | slashing | 12 | 36 | `speed >= 36` | 1 | 18 | 324 | 3 | 2 | 45362 | `slashing2` | `+0x3fda` |
| 13 | slashing | 13 | 39 | `speed >= 39` | 1 | 19 | 361 | 4 | 2 | 50533 | `slashing2` | `+0x4003` |
| 14 | slashing | 14 | 42 | `speed >= 42` | 1 | 20 | 400 | 4 | 2 | 55982 | `slashing2` | `+0x402c` |
| 15 | slashing | 15 | 45 | `speed >= 45` | 1 | 21 | 441 | 1 | 2 | 61711 | `slashing3` | `+0x4055` |
| 16 | slashing | 16 | 48 | `speed >= 48` | 1 | 22 | 484 | 1 | 2 | 67718 | `slashing3` | `+0x407e` |
| 17 | slashing | 17 | 51 | `speed >= 51` | 1 | 23 | 529 | 3 | 3 | 74005 | `slashing3` | `+0x40a7` |
| 18 | slashing | 18 | 54 | `speed >= 54` | 1 | 24 | 576 | 2 | 3 | 80570 | `slashing3` | `+0x40d0` |
| 19 | slashing | 19 | 57 | `speed >= 57` | 1 | 25 | 625 | 2 | 3 | 87415 | `slashing3` | `+0x40f9` |
| 20 | slashing | 20 | 60 | `speed >= 60` | 1 | 26 | 676 | 1 | 3 | 94538 | `slashing3` | `+0x4122` |
| 21 | hacking | 1 | 3 | `strength >= 3` | 3 | 4 | 16 | 5 | 1 | 2274 | `hacking1` | `+0x414b` |
| 22 | hacking | 2 | 6 | `strength >= 6` | 3 | 5 | 20 | 4 | 1 | 2841 | `hacking1` | `+0x4174` |
| 23 | hacking | 3 | 9 | `strength >= 9` | 3 | 6 | 24 | 4 | 1 | 3408 | `hacking1` | `+0x419d` |
| 24 | hacking | 4 | 12 | `strength >= 12` | 3 | 8 | 32 | 4 | 1 | 4542 | `hacking1` | `+0x41c6` |
| 25 | hacking | 5 | 15 | `strength >= 15` | 3 | 10 | 40 | 3 | 1 | 5676 | `hacking1` | `+0x41ef` |
| 26 | hacking | 6 | 18 | `strength >= 18` | 3 | 15 | 60 | 3 | 1 | 8511 | `hacking1` | `+0x4218` |
| 27 | hacking | 7 | 21 | `strength >= 21` | 3 | 18 | 72 | 3 | 2 | 10212 | `hacking1` | `+0x4241` |
| 28 | hacking | 8 | 24 | `strength >= 24` | 3 | 20 | 80 | 1 | 2 | 11346 | `hacking1` | `+0x426a` |
| 29 | hacking | 9 | 27 | `strength >= 27` | 3 | 25 | 100 | 3 | 2 | 14181 | `hacking1` | `+0x4293` |
| 30 | hacking | 10 | 30 | `strength >= 30` | 3 | 30 | 120 | 2 | 2 | 17016 | `hacking2` | `+0x42bc` |
| 31 | hacking | 11 | 33 | `strength >= 33` | 3 | 35 | 140 | 3 | 2 | 19851 | `hacking2` | `+0x42e5` |
| 32 | hacking | 12 | 36 | `strength >= 36` | 3 | 40 | 160 | 3 | 2 | 22686 | `hacking2` | `+0x430e` |
| 33 | hacking | 13 | 39 | `strength >= 39` | 3 | 45 | 180 | 3 | 2 | 25521 | `hacking2` | `+0x4337` |
| 34 | hacking | 14 | 42 | `strength >= 42` | 3 | 50 | 200 | 3 | 3 | 28356 | `hacking3` | `+0x4360` |
| 35 | hacking | 15 | 45 | `strength >= 45` | 3 | 70 | 240 | 1 | 3 | 34116 | `hacking2` | `+0x438a` |
| 36 | hacking | 16 | 48 | `strength >= 48` | 3 | 90 | 280 | 2 | 3 | 39876 | `hacking3` | `+0x43b5` |
| 37 | hacking | 17 | 51 | `strength >= 51` | 3 | 110 | 320 | 2 | 3 | 45636 | `hacking3` | `+0x43e0` |
| 38 | hacking | 18 | 54 | `strength >= 54` | 3 | 130 | 360 | 2 | 3 | 51396 | `hacking3` | `+0x440b` |
| 39 | hacking | 19 | 57 | `strength >= 57` | 3 | 150 | 400 | 1 | 3 | 57156 | `hacking3` | `+0x4436` |
| 40 | hacking | 20 | 60 | `strength >= 60` | 3 | 170 | 440 | 1 | 3 | 62916 | `hacking2` | `+0x4461` |
| 41 | bashing | 1 | 3 | `strength >= 3` | 2 | 4 | 12 | 4 | 1 | 1714 | `bashing1` | `+0x448c` |
| 42 | bashing | 2 | 6 | `strength >= 6` | 2 | 5 | 15 | 4 | 1 | 2142 | `bashing1` | `+0x44b7` |
| 43 | bashing | 3 | 9 | `strength >= 9` | 2 | 8 | 24 | 5 | 1 | 3424 | `bashing1` | `+0x44e2` |
| 44 | bashing | 4 | 12 | `strength >= 12` | 2 | 10 | 30 | 3 | 1 | 4279 | `bashing1` | `+0x450d` |
| 45 | bashing | 5 | 15 | `strength >= 15` | 2 | 15 | 45 | 3 | 1 | 6417 | `bashing1` | `+0x4538` |
| 46 | bashing | 6 | 18 | `strength >= 18` | 2 | 20 | 60 | 3 | 2 | 8554 | `bashing1` | `+0x4563` |
| 47 | bashing | 7 | 21 | `strength >= 21` | 2 | 25 | 75 | 2 | 2 | 10692 | `bashing1` | `+0x458e` |
| 48 | bashing | 8 | 24 | `strength >= 24` | 2 | 30 | 90 | 3 | 2 | 12829 | `bashing1` | `+0x45b9` |
| 49 | bashing | 9 | 27 | `strength >= 27` | 2 | 35 | 105 | 3 | 2 | 14967 | `bashing2` | `+0x45e4` |
| 50 | bashing | 10 | 30 | `strength >= 30` | 2 | 40 | 120 | 3 | 2 | 17104 | `bashing2` | `+0x460f` |
| 51 | bashing | 11 | 33 | `strength >= 33` | 2 | 45 | 135 | 2 | 2 | 19242 | `bashing2` | `+0x463a` |
| 52 | bashing | 12 | 36 | `strength >= 36` | 2 | 50 | 150 | 2 | 2 | 21379 | `bashing2` | `+0x4665` |
| 53 | bashing | 13 | 39 | `strength >= 39` | 2 | 60 | 180 | 1 | 2 | 25654 | `bashing2` | `+0x4690` |
| 54 | bashing | 14 | 42 | `strength >= 42` | 2 | 70 | 210 | 3 | 2 | 29929 | `bashing3` | `+0x46bb` |
| 55 | bashing | 15 | 45 | `strength >= 45` | 2 | 80 | 250 | 1 | 2 | 35599 | `bashing3` | `+0x46e6` |
| 56 | bashing | 16 | 48 | `strength >= 48` | 2 | 90 | 270 | 2 | 3 | 38479 | `bashing3` | `+0x4711` |
| 57 | bashing | 17 | 51 | `strength >= 51` | 2 | 100 | 30 | 2 | 3 | 5089 | `bashing3` | `+0x473c` |
| 58 | bashing | 18 | 54 | `strength >= 54` | 2 | 120 | 360 | 4 | 3 | 51304 | `bashing3` | `+0x4767` |
| 59 | bashing | 19 | 57 | `strength >= 57` | 2 | 140 | 420 | 3 | 3 | 59854 | **none** | `+0x4792` |
| 60 | bashing | 20 | 60 | `strength >= 60` | 2 | 160 | 480 | 1 | 3 | 68404 | `bashing3` | `+0x47bd` |
| 61 | ranged | 1 | 3 | `speed >= 3` | 4 | 4 | 16 | 5 | 100 | 1138 | **none** | `+0x47e8` |
| 62 | ranged | 2 | 6 | `speed >= 6` | 4 | 5 | 25 | 5 | 100 | 1771 | `ranged1` | `+0x4813` |
| 63 | ranged | 3 | 9 | `speed >= 9` | 4 | 6 | 36 | 5 | 100 | 2542 | `ranged1` | `+0x483e` |
| 64 | ranged | 4 | 12 | `speed >= 12` | 4 | 7 | 49 | 4 | 100 | 3454 | `ranged1` | `+0x4869` |
| 65 | ranged | 5 | 15 | `speed >= 15` | 4 | 8 | 64 | 3 | 4 | 4504 | `ranged1` | `+0x4894` |
| 66 | ranged | 6 | 18 | `speed >= 18` | 4 | 9 | 81 | 3 | 100 | 5695 | `ranged1` | `+0x48bf` |
| 67 | ranged | 7 | 21 | `speed >= 21` | 4 | 10 | 100 | 3 | 100 | 7024 | `ranged1` | `+0x48ea` |
| 68 | ranged | 8 | 24 | `speed >= 24` | 4 | 11 | 121 | 3 | 100 | 8494 | `ranged1` | `+0x4915` |
| 69 | ranged | 9 | 27 | `speed >= 27` | 4 | 12 | 144 | 3 | 100 | 10102 | `ranged1` | `+0x4940` |
| 70 | ranged | 10 | 30 | `speed >= 30` | 4 | 13 | 169 | 3 | 100 | 11851 | `ranged1` | `+0x496b` |
| 71 | ranged | 11 | 33 | `speed >= 33` | 4 | 14 | 196 | 3 | 100 | 13738 | `ranged2` | `+0x4996` |
| 72 | ranged | 12 | 36 | `speed >= 36` | 4 | 15 | 225 | 3 | 100 | 15766 | `ranged2` | `+0x49c1` |
| 73 | ranged | 13 | 39 | `speed >= 39` | 4 | 16 | 256 | 4 | 100 | 17932 | `ranged2` | `+0x49ec` |
| 74 | ranged | 14 | 42 | `speed >= 42` | 4 | 17 | 289 | 4 | 100 | 20239 | `ranged2` | `+0x4a17` |
| 75 | ranged | 15 | 45 | `speed >= 45` | 4 | 18 | 324 | 1 | 4 | 22684 | `ranged2` | `+0x4a42` |
| 76 | ranged | 16 | 48 | `speed >= 48` | 4 | 19 | 361 | 1 | 100 | 25270 | `ranged3` | `+0x4a6d` |
| 77 | ranged | 17 | 51 | `speed >= 51` | 4 | 20 | 400 | 3 | 100 | 27994 | `ranged3` | `+0x4a98` |
| 78 | ranged | 18 | 54 | `speed >= 54` | 4 | 21 | 441 | 2 | 100 | 30859 | `ranged3` | `+0x4ac3` |
| 79 | ranged | 19 | 57 | `speed >= 57` | 4 | 22 | 484 | 2 | 100 | 33862 | `ranged3` | `+0x4aee` |
| 80 | ranged | 20 | 60 | `speed >= 60` | 4 | 23 | 529 | 1 | 100 | 37006 | `ranged3` | `+0x4b19` |

### 2.4 Ids that exist in the table but are not in the weapon shop

`weapon0` is the starting weapon written by the `heroDNA` literal (index 13 is
`0`, so a fresh gladiator's `hero.weapon` is 0 and `_root.weapon0` is what
`battlevalues` resolves). Ids 201–220 are reachable only through paths this
document does not map (the magic shop's `enchant_weapon`, `unleash_hell`'s
hard-coded champion DNA, and `randomise_gladiator`).

| id | `[0]` type | `[2]` wt | `[3]` min | `[4]` max | `[5]` rng | literal at |
| ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 0 | 2 | 5 | 1 | 3 | 1 | `+0x3dee` |
| 201 | 1 | 4 | 5 | 19 | 2 | `+0x4b44` |
| 202 | 1 | 3 | 10 | 30 | 2 | `+0x4b6f` |
| 203 | 2 | 4 | 20 | 80 | 2 | `+0x4b9a` |
| 204 | 3 | 3 | 25 | 100 | 2 | `+0x4bc5` |
| 205 | 3 | 3 | 25 | 100 | 3 | `+0x4bf0` |
| 206 | 1 | 3 | 30 | 110 | 3 | `+0x4c1b` |
| 207 | 1 | 3 | 40 | 150 | 3 | `+0x4c46` |
| 210 | 1 | 3 | 30 | 300 | 3 | `+0x4c71` |
| 220 | 1 | 3 | 200 | 800 | 4 | `+0x4c9c` |

Id **220** is the outlier: `[3]/[4]` = 200 / 800, higher than anything in the
shop. Nothing in the purchase path can reach it. **Not mapped:** which site,
if any, awards it.

---

## 3. The gates, precisely

### 3.1 The weapon gate — what is really compared

The route map recorded `item.itemlevel <= item.attribute_required`, and noted
it reads oddly. It reads oddly because **the field name lies**:
`attribute_required` does not hold a requirement, it holds a **snapshot of the
hero's own governing attribute**, taken when `weaponbuttons()` ran.

`weaponbuttons()` — `sprite:1961/frame:1/DoAction@0x6110ce` `+0x0571`, body
from `+0x0589`; register 1 is `this` (the weaponsmith clip), register 2 is
`_root`:

```text
weaponbuttons() {
  _root.delete_tooltips();                                       // +0x0589
  i = 1;                                                         // +0x059b
  while (!(i > 80)) {                     // +0x05a6 .. +0x05b7 / back +0x0982
    weap_i = i;                                                  // +0x05bc
    if      (!(i > 20)) { attr = _root.game.hero.speed;    txt = "Agility";  }
                                                    // +0x05c5 .. +0x0611
    else if (!(i > 40)) { weap_i = i - 20;
                          attr = _root.game.hero.strength; txt = "Strength"; }
                                                    // +0x065d .. +0x06a5
    else if (!(i > 60)) { weap_i = i - 40;
                          attr = _root.game.hero.strength; txt = "Strength"; }
                                                    // +0x06f6 .. +0x073e
    else if (!(i > 80)) { weap_i = i - 60;
                          attr = _root.game.hero.speed;    txt = "Agility";  }
                                                    // +0x078f .. +0x07d7
    this["item"+i].attribute_required     = attr;
    this["item"+i].attribute_required_txt = txt;
    this["item"+i].itemlevel              = weap_i * 3;
                          // +0x061e / +0x06b2 / +0x074b / +0x07e4, all "* 3"
    itemnumber = Number(weap_i);                                 // +0x07f6
    ...
  }
}
```

So for item id `N` with band position `p`:

```text
item.itemlevel          = 3 * p
item.attribute_required = hero.speed     (ids 1..20 slashing, 61..80 ranged)
                        | hero.strength  (ids 21..40 hacking, 41..60 bashing)
```

and the `onRelease` gate at `+0x0929` is:

```text
Push this.itemlevel            // +0x0929
Push this.attribute_required   // +0x0931
Greater                        // +0x0939   -> (itemlevel > attribute_required)
Not ; Not ; If -> refusal      // +0x093a .. +0x093c
buyweapon(this)                // +0x0941
```

`ActionGreater` yields `first-pushed > second-pushed`; the operand order is
fixed independently by the armour comparison at `armourbuttons` `+0x0aa6`,
whose semantics are pinned by which arm greys the item out. The real gate is
therefore:

> **`3 * band_position <= hero.speed`** for slashing and ranged,
> **`3 * band_position <= hero.strength`** for hacking and bashing.

The same expression, with the operands pushed in the other order and the
`Less2` opcode, controls the greyed-out rendering at `+0x0812`–`+0x0826`
(`attribute_required < itemlevel` → `_alpha = 90`, `blendMode = "invert"`).

**Weapon slots are attribute-gated and not level-gated at all.** The route map
already said this; it is now confirmed — `herolevel` appears nowhere in
`weaponbuttons` or in the `onRelease` body.

Two structural notes that matter to a navigator:

- The `onRollOver` and `onRelease` assignments (`+0x089b`, `+0x08c6`) are
  **outside** the greying `if` — the `If` at `+0x085f` jumps to `+0x088f`,
  the first instruction after the grey-out block. A greyed item still has a
  live handler; it just takes the refusal arm.
- The refusal arm (`+0x0954`) only sets `bubbletext` to a `<refusal text>`
  naming the required attribute and value. It does **not** move the playhead.
  So a refused click is silent and idempotent, and the only way to tell refusal
  from acceptance is that the clip did *not* reach `getitem` (frame 147).

### 3.2 The armour gate

`armourbuttons()` — `sprite:1909/frame:1/DoAction@0x5f1fa9` `+0x0786`, body
from `+0x079e`; register 1 is `this`, register 2 is `_root`, register 3 is
`_global`:

```text
armourbuttons() {
  _root.delete_tooltips();                                       // +0x079e
  i = 1;
  while (!(i > 60)) {                     // +0x07bb .. / back +0x0bfc
    itemnumber = Number(this["item"+i]._name.charAt(4)
                      + this["item"+i]._name.charAt(5));         // +0x07d1
    if      (!(itemnumber >  4)) this["item"+i].itemlevel =  1;   // +0x0823
    else if (!(itemnumber >  6)) this["item"+i].itemlevel =  6;   // +0x0855
    else if (!(itemnumber >  9)) this["item"+i].itemlevel = 12;   // +0x089e
    else if (!(itemnumber > 12)) this["item"+i].itemlevel = 18;   // +0x08e7
    else if (!(itemnumber > 15)) this["item"+i].itemlevel = 24;   // +0x0930
    else if (!(itemnumber > 18)) this["item"+i].itemlevel = 30;   // +0x0979
    else if (!(itemnumber > 21)) this["item"+i].itemlevel = 36;   // +0x09c2
    else if (!(itemnumber > 24)) this["item"+i].itemlevel = 42;   // +0x0a0b
    else if   (itemnumber > 24)  this["item"+i].itemlevel = 48;   // +0x0a54
    if (_root.game.hero.herolevel < this["item"+i].itemlevel) {   // +0x0a80
      this["item"+i]._alpha = 90; this["item"+i].blendMode = "invert";
    }
    this["item"+i].onRollOver = function () {
      getarmourinfo(this, armourpiece);                          // +0x0ae4
    };
    this["item"+i].onRelease = function () {                     // +0x0b15
      _root.clicksound.start();                                  // +0x0b25
      if (this.itemlevel > 12 && _global.game_mode == "demo") {  // +0x0b3d
        bubbletext = <refusal text>;
      } else if (!(this.itemlevel > _root.game.hero.herolevel)) {// +0x0b77
        buyarmour(this, armourpiece, this.itemlevel);            // +0x0ba9
      } else if (_global.game_mode == "full") {                  // +0x0bbc
        bubbletext = <refusal text naming this.itemlevel>;
      } else {
        bubbletext = <refusal text>;
      }
    };
    i++;
  }
}
```

The route map's `item.itemlevel <= _root.game.hero.herolevel` at `+0x0b77` is
**exactly right** — the armour gate really does compare the item to the hero.
It is only the *weapon* gate that was mis-transcribed, and only because the
weapon field is misnamed in the game's own source.

`armourpiece` is a plain timeline variable set by the page frame itself, before
it calls `armourbuttons`; the value is the index into `armourtypes`:

| `armourpiece` | piece | page frames | item numbers on each |
| ---: | --- | --- | --- |
| 1 | `boot` | 79, 86 | 2–13 / 14–25 |
| 2 | `shinguard` | 105, 111 | 2–14 / 15–25 |
| 3 | `greaves` | 131, 138 | 2–14 / 15–25 |
| 4 | `breastplate` | 48, 56, 64, 71 | 2–10 / 11–16 / 17–22 / 23–25 |
| 5 | `gauntlet` | 93, 99 | 2–15 / 16–25 |
| 6 | `shoulderguard` | 117, 124 | 2–14 / 15–25 |
| 7 | `helmet` | 146, 152, 158 | 2–10 / 11–19 / 20–25 |
| 8 | `shield` | 164, 171, 177 | 2–11 / 12, 14–19 / 20–25 |

Each `armourpiece` assignment is at `+0x0000` of that frame's `DoAction`, and
`armourbuttons()` is called at `+0x0016` of the same block.

**`shield` item 13 is placed on no page** and so, like weapon ids 59 and 61, can
never be bought. Every other piece carries the full 2–25 range.

Item number **1** is on no page either, in any piece — it is the "no armour"
entry, `armoursets[1]`, matching the `heroDNA` literal's zeros at the armour
indices.

### 3.3 The two "full game" refusals — which branch actually applies

Both shops carry a lock, and **they test two different flags**.

**Armour** (`armourbuttons` `+0x0b3d`, and the tooltip copy at `getarmourinfo`
`+0x0d1a`):

```text
if (item.itemlevel > 12 && _global.game_mode == "demo") { <demo refusal> }
```

**Weapons** (`weaponbuttons` `onRelease` `+0x08ee`, and the grey-out at
`+0x083e`):

```text
if (item.itemlevel > 16 && _root.fizMode != "fizzle") { <demo refusal> }
```

Note the weapon test is `!=`, not `==`: `Equals2` at `+0x0914` followed by `Not`
at `+0x0915`, with the `&&` join at `+0x0916`.

Both are inert in this build, and the chain that settles it is short:

1. `root/frame:1/DoAction@0x5b66c` `+0x0026`: `_root.fizMode = "fizzle"`,
   unconditionally, on the movie's very first frame.
2. `root/frame:10/DoAction@0x3c46b8` `+0x00ea`:
   `if (_root.fizMode == "fizzle") _global.game_mode = "full";`
   `else _global.game_mode = "demo";` (`+0x0102` / `+0x0115`).

So `fizMode == "fizzle"` → the weapon lock's second operand is false → **no
weapon is demo-locked**; and `game_mode == "full"` → **no armour is
demo-locked**. This agrees with the handoff's live reading of `game_mode`, and
it also explains it: `game_mode` is *derived* from `fizMode`, and `fizMode` is
set by a literal in frame 1 that nothing else writes.

**The earlier audit's "this is the demo build" inference is wrong in both
shops.** Neither `itemlevel > 12` nor `itemlevel > 16` refuses anything at
runtime. The only live gates are the attribute gate (weapons), the herolevel
gate (armour), and gold.

### 3.4 Every way a purchase can be refused

| # | Refusal | Site | Live? |
| ---: | --- | --- | --- |
| 1 | The id has no clip on the current page | the `weaponbuttons` / `armourbuttons` loop is a silent no-op on `undefined` | **yes** — weapon ids 59 and 61, shield item 13, and every id not on the page currently loaded |
| 2 | `3*weap_i > hero.speed` / `hero.strength` | `+0x0929` | **yes** |
| 3 | `item.itemlevel > 16 && fizMode != "fizzle"` | `+0x08ee` | no — `fizMode` is `"fizzle"` |
| 4 | `item.itemlevel > hero.herolevel` (armour) | `+0x0b77` | **yes** |
| 5 | `item.itemlevel > 12 && game_mode == "demo"` | `+0x0b3d` | no — `game_mode` is `"full"` |
| 6 | Already wielding / wearing this exact item | `buyweapon` `+0x1075`, `buyarmour` `+0x13cf` | **yes** — the quote page is still shown, with all costs forced to 0 |
| 7 | `goldpieces < itemcost` | confirm buttons 1952 `+0x015d`, 1907 `+0x010f` | **yes** |

Only #1, #2 and #4 refuse *before* the shop plays `getitem`; #6 and #7 refuse on
the confirm page. That is what makes "did the clip reach frame 147 / 184?" a
valid read of gates 1–5 — the test the wrapper already uses.

---

## 4. Cost

### 4.1 The weapon quote

Computed by `getweaponinfo` on **rollover**, then mutated in place by
`buyweapon`. Let `W = _root["weapon" + itemnumber]`.

```text
// getweaponinfo, +0x0a42 .. +0x0ac2
itemcost = Math.round( W[0]*2 + W[3]*9 + W[4]*45*3.1 )
// +0x0ad5 .. +0x0af7
if (itemtype == "ranged") itemcost = Math.round(itemcost / 2)
```

`W[0]` is the type index 1..4, so it contributes 2–8 gold; the price is driven
almost entirely by `W[4] * 139.5`.

### 4.2 The trade-in

`buyweapon(whichweapon)` — `sprite:1961/frame:1/DoAction@0x6110ce`,
`DefineFunction2` at `+0x0bf6`, body from `+0x0c17`; register 1 is `_root`.
Its first two acts are `goldpieces = _root.game.hero.goldpieces` (`+0x0c17`)
and `gotoAndPlay("getitem"); Play` (`+0x0c2e`).

The branch at `+0x0d51`–`+0x0dc6`:

```text
if ((hero.weapon != 0 && itemtype != "ranged")
 || (hero.secondary_weapon != 0 && itemtype == "ranged"))   -> trade-in branch
else                                                        -> no-trade branch
```

Trade-in branch, with `O` the *old* weapon's array — `weapon[hero.weapon]` for a
melee purchase (`+0x0dde`), `weapon[hero.secondary_weapon]` for a ranged one
(`+0x0ec2`):

```text
olditemcost = Math.ceil( O[0]*2 + O[3]*9 + O[4]*45*2 )     // *2 here, not *3.1
if (itemtype == "ranged") olditemcost = Math.round(olditemcost / 2)   // +0x0f69
trade_discount = Math.round(olditemcost / 4)                          // +0x0fb2
char_discount  = Math.round(itemcost * hero.charisma / 200)           // +0x0fd5
itemcostbefore = itemcost                                             // +0x100d
itemcost       = itemcost - trade_discount                            // +0x1016
itemcost       = itemcost - char_discount                             // +0x1026
if (itemcost < 1) itemcost = 1                                        // +0x1036
```

No-trade branch (`+0x1172` onward) is the same without the trade term:

```text
char_discount  = Math.round(itemcost * hero.charisma / 200)           // +0x11d6
itemcostbefore = itemcost                                             // +0x120e
itemcost       = itemcost - char_discount                             // +0x1217
if (itemcost < 1) itemcost = 1                                        // +0x1227
```

`trade_discount` is **not** reset in that branch; only the display string is set
to a "nothing to trade in" literal (`+0x1273`).

The "already own it" arm at `+0x1075`–`+0x1116` forces
`char_discount = trade_discount = itemcostbefore = itemcost = 0` and shows a
refusal — so an operator who re-offers the same id gets a **zero-cost quote**
that button 1952 will still confirm (the gold check passes and `hero.weapon` is
re-set to the same value). Harmless, but not a no-op.

### 4.3 The full weapon cost formula

```text
base     = round( W[0]*2 + W[3]*9 + W[4]*45*3.1 )
base     = round(base / 2)                              if W is ranged
old      = ceil( O[0]*2 + O[3]*9 + O[4]*45*2 )          O = the slot being traded
old      = round(old / 2)                               if the purchase is ranged
trade    = round(old / 4)                               0 when that slot is empty
charisma = round(base * hero.charisma / 200)
itemcost = max(1, base - trade - charisma)
```

For id 20 with an empty weapon slot and charisma 1: `base = 94538`,
`char_discount = round(94538 * 1 / 200) = 473`, `itemcost = 94065`.

### 4.4 What the confirm button does

Weapon confirm, `root/button:1952/condition:0`:

```text
if (_root.game.hero.goldpieces < itemcost) { <refusal text> }        // +0x0145
else {
  if (itemcost != 0) _root.coins.start();                            // +0x0193
  if (itemtype != "ranged") {
    _root.game.hero.weapon = itemnumber;                             // +0x01ee
    _root.game.hero.weapon_enchantment_potency = 1;
    _root.game.hero.weapon_enchantment_type    = 1;
  } else {
    _root.game.hero.secondary_weapon = itemnumber;
    _root.game.hero.secondary_weapon_enchantment_potency = 1;        // +0x0275
    _root.game.hero.secondary_weapon_enchantment_type    = 1;        // +0x0292
  }
  _root.game.hero.goldpieces -= itemcost;                            // +0x02af
  _root.constructDNA();                                              // +0x02d1
  itempurchased = "yes";                                             // +0x02e7
  gotoAndPlay("browse");                                             // +0x02ef
}
```

Armour confirm, `root/button:1907/condition:0`, is the same shape with an
eight-way dispatch on `armourpiece` writing `_root.game.hero.<piece> =
itemnumber` (`+0x0232` breastplate, `+0x0262` gauntlet, `+0x0292`
shoulderguard, `+0x02c2` helmet, `+0x02f2` shield, and the boot / shinguard /
greaves arms above them), then `goldpieces -= itemcost` (`+0x030d`),
`constructDNA()` (`+0x033e`), `itempurchased = "yes"` (`+0x0345`) and
`gotoAndPlay("buy")` (`+0x034d`). The armoury returns to `buy` (frame 37); the
weaponsmith returns to `browse` (frame 26).

Both read `itemcost`, `itemnumber` and `itemtype` as bare `GetVariable`, which
in a button placed inside the shop sprite resolves against that sprite's own
timeline. That is why the wrapper's `clip.itemcost` / `clip.itemnumber` reads
address the right object — the values simply were never written.

**Buying a ranged item never changes `min_damage`.** It writes
`secondary_weapon`, and `battlevalues` only copies the secondary pair over the
primary pair when `using_bow` is true (`+0x3416`–`+0x344a`), which root frame
221 clears at battle construction.

---

## 5. The armour table

### 5.1 Shape

There is no per-item armour array. An armour item is fully described by two
numbers — the **piece** (1..8) and the **item number** (1..26) — plus eight
`_global` scalars:

```text
// battlevalues, +0x3089 .. +0x30e4  (register 2 = _global)
breastplate_dval   = 16      helmet_dval   = 10
shinguard_dval     =  6      greaves_dval  =  3
shoulderguard_dval =  8      gauntlet_dval =  5
boot_dval          =  2      shield_dval   = 12
```

Shop side, `checkarmour(armourpiece, itemnumber)`
(`sprite:1909/frame:1/DoAction@0x5f1fa9`, body from `+0x0e46`; register 1 is
`_root`, register 2 is `_global`, register 3 is `itemnumber`, register 4 is
`armourpiece`):

```text
dval            = _global[<piece>_dval]              // +0x0e57 .. +0x10b1
olditem         = _root.game.hero[<piece>]
itemdefence     = Math.ceil(itemnumber * dval)                      // +0x110b
old_itemdefence = Math.ceil(olditem    * dval)                      // +0x1128
old_itemcost    = Math.round(old_itemdefence * old_itemdefence * 3) // +0x1149
trade_discount  = Math.ceil(old_itemcost * (100 - hero.charisma) / 200 / 4)
                                                                    // +0x1173
```

and in `getarmourinfo(whicharmour, armourpiece)` (body from `+0x0c33`; register
1 is `_root`, register 2 is `_global`, register 3 is `whicharmour`, register 4
is `armourpiece`):

```text
itemnumber = Number(whicharmour._name.charAt(4)
                  + whicharmour._name.charAt(5))                    // +0x0c33
itemset    = _root.armoursets[itemnumber]                           // +0x0c71
itemtype   = _root.armourtypes[armourpiece]                         // +0x0c83
itemweight = _root.armourweights[_root.armoursetweights[itemnumber]]
                                                       // +0x0caa, +0x0cbc
checkarmour(armourpiece, itemnumber)                                // +0x0cce
itemcost   = Math.round(itemdefence * itemdefence * 3)              // +0x0ce2
```

Each item number is one **set**, applied across all eight pieces, so
`armoursets` and `armoursetweights` are indexed by item number, not by piece.
`armoursetweights` (`+0x3cda`, 27 entries, index 0 first) is

```text
[1,1,1,2,3,1,2,2,3,1,1,2,2,3,1,2,3,2,3,1,3,2,2,3,1,2,3]
```

into `armourweights` (`+0x3c46`, 4 entries) — 1 lightest, 3 heaviest.

Item number **26** exists in `armoursets` but is on no shop page. It is the one
value the helmet special case is for (§5.4).

### 5.2 Cost formula, armour

```text
itemdefence = ceil(n * dval)                    // n = item number
base        = round(itemdefence^2 * 3)
old_def     = ceil(hero[<piece>] * dval)
old_cost    = round(old_def^2 * 3)
trade       = ceil(old_cost * (100 - hero.charisma) / 800)
charisma    = round(base * hero.charisma / 200)
itemcost    = max(1, base - charisma - trade)
              // buyarmour trade arm    +0x1357 .. +0x13c4
              // buyarmour no-trade arm +0x1484 .. +0x14ea
```

The trade term uses `(100 - charisma)`, not `charisma` — **higher charisma gives
a smaller trade-in credit** in the armoury while giving a larger straight
discount. The subtraction is at `+0x117b`–`+0x1195`. It looks like an authoring
slip rather than a design; it is recorded here without judgement, because the
navigator only needs the number.

`buyarmour(whicharmour, armourpiece, itemlevel)` opens the same way as
`buyweapon`: `goldpieces = hero.goldpieces` (`+0x11f3`), then
`gotoAndPlay("getitem"); Play` (`+0x120a`). It too reads `itemcost`,
`itemdefence`, `itemtype`, `itemnumber`, `itemweight`, `olditem` and
`trade_discount` off the timeline — all of which only `getarmourinfo` and
`checkarmour` write, and only from `onRollOver` (`+0x0ae4`). **The armoury has
exactly the same rollover dependency as the weapon shop.**

### 5.3 Defence and cost per set and piece

Cells are `itemdefence / base cost`; the number after each piece name is its
`dval`. `armourclass` is the plain sum of the eight `<piece>_defence` values
(`battlevalues` `+0x3ac3`, copied to `armourclass` at `+0x3b0f`).

| set `n` | `itemlevel` | wt | boot (2) | shin (6) | greav (3) | breast (16) | gaunt (5) | shldr (8) | helm (10) | shield (12) | full `armourclass` | full base cost |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2 | 1 | 1 | 4 / 48 | 12 / 432 | 6 / 108 | 32 / 3072 | 10 / 300 | 16 / 768 | 20 / 1200 | 24 / 1728 | 124 | 7 656 |
| 3 | 1 | 2 | 6 / 108 | 18 / 972 | 9 / 243 | 48 / 6912 | 15 / 675 | 24 / 1728 | 30 / 2700 | 36 / 3888 | 186 | 17 226 |
| 4 | 1 | 3 | 8 / 192 | 24 / 1728 | 12 / 432 | 64 / 12288 | 20 / 1200 | 32 / 3072 | 40 / 4800 | 48 / 6912 | 248 | 30 624 |
| 5 | 6 | 1 | 10 / 300 | 30 / 2700 | 15 / 675 | 80 / 19200 | 25 / 1875 | 40 / 4800 | 50 / 7500 | 60 / 10800 | 310 | 47 850 |
| 6 | 6 | 2 | 12 / 432 | 36 / 3888 | 18 / 972 | 96 / 27648 | 30 / 2700 | 48 / 6912 | 60 / 10800 | 72 / 15552 | 372 | 68 904 |
| 7 | 12 | 2 | 14 / 588 | 42 / 5292 | 21 / 1323 | 112 / 37632 | 35 / 3675 | 56 / 9408 | 70 / 14700 | 84 / 21168 | 434 | 93 786 |
| 8 | 12 | 3 | 16 / 768 | 48 / 6912 | 24 / 1728 | 128 / 49152 | 40 / 4800 | 64 / 12288 | 80 / 19200 | 96 / 27648 | 496 | 122 496 |
| 9 | 12 | 1 | 18 / 972 | 54 / 8748 | 27 / 2187 | 144 / 62208 | 45 / 6075 | 72 / 15552 | 90 / 24300 | 108 / 34992 | 558 | 155 034 |
| 10 | 18 | 1 | 20 / 1200 | 60 / 10800 | 30 / 2700 | 160 / 76800 | 50 / 7500 | 80 / 19200 | 100 / 30000 | 120 / 43200 | 620 | 191 400 |
| 11 | 18 | 2 | 22 / 1452 | 66 / 13068 | 33 / 3267 | 176 / 92928 | 55 / 9075 | 88 / 23232 | 110 / 36300 | 132 / 52272 | 682 | 231 594 |
| 12 | 18 | 2 | 24 / 1728 | 72 / 15552 | 36 / 3888 | 192 / 110592 | 60 / 10800 | 96 / 27648 | 120 / 43200 | 144 / 62208 | 744 | 275 616 |
| 13 | 24 | 3 | 26 / 2028 | 78 / 18252 | 39 / 4563 | 208 / 129792 | 65 / 12675 | 104 / 32448 | 130 / 50700 | 156 / 73008 | 806 | 323 466 |
| 14 | 24 | 1 | 28 / 2352 | 84 / 21168 | 42 / 5292 | 224 / 150528 | 70 / 14700 | 112 / 37632 | 140 / 58800 | 168 / 84672 | 868 | 375 144 |
| 15 | 24 | 2 | 30 / 2700 | 90 / 24300 | 45 / 6075 | 240 / 172800 | 75 / 16875 | 120 / 43200 | 150 / 67500 | 180 / 97200 | 930 | 430 650 |
| 16 | 30 | 3 | 32 / 3072 | 96 / 27648 | 48 / 6912 | 256 / 196608 | 80 / 19200 | 128 / 49152 | 160 / 76800 | 192 / 110592 | 992 | 489 984 |
| 17 | 30 | 2 | 34 / 3468 | 102 / 31212 | 51 / 7803 | 272 / 221952 | 85 / 21675 | 136 / 55488 | 170 / 86700 | 204 / 124848 | 1054 | 553 146 |
| 18 | 30 | 3 | 36 / 3888 | 108 / 34992 | 54 / 8748 | 288 / 248832 | 90 / 24300 | 144 / 62208 | 180 / 97200 | 216 / 139968 | 1116 | 620 136 |
| 19 | 36 | 1 | 38 / 4332 | 114 / 38988 | 57 / 9747 | 304 / 277248 | 95 / 27075 | 152 / 69312 | 190 / 108300 | 228 / 155952 | 1178 | 690 954 |
| 20 | 36 | 3 | 40 / 4800 | 120 / 43200 | 60 / 10800 | 320 / 307200 | 100 / 30000 | 160 / 76800 | 200 / 120000 | 240 / 172800 | 1240 | 765 600 |
| 21 | 36 | 2 | 42 / 5292 | 126 / 47628 | 63 / 11907 | 336 / 338688 | 105 / 33075 | 168 / 84672 | 210 / 132300 | 252 / 190512 | 1302 | 844 074 |
| 22 | 42 | 2 | 44 / 5808 | 132 / 52272 | 66 / 13068 | 352 / 371712 | 110 / 36300 | 176 / 92928 | 220 / 145200 | 264 / 209088 | 1364 | 926 376 |
| 23 | 42 | 3 | 46 / 6348 | 138 / 57132 | 69 / 14283 | 368 / 406272 | 115 / 39675 | 184 / 101568 | 230 / 158700 | 276 / 228528 | 1426 | 1 012 506 |
| 24 | 42 | 1 | 48 / 6912 | 144 / 62208 | 72 / 15552 | 384 / 442368 | 120 / 43200 | 192 / 110592 | 240 / 172800 | 288 / 248832 | 1488 | 1 102 464 |
| 25 | 48 | 2 | 50 / 7500 | 150 / 67500 | 75 / 16875 | 400 / 480000 | 125 / 46875 | 200 / 120000 | 250 / 187500 | 300 / 270000 | 1550 | 1 196 250 |

The sets are strictly linear in `n`. The `dval`s sum to 62 and their squares sum
to 638, so `full armourclass = 62n` and `full base cost = 3 * 638 * n^2 =
1914 n^2` (checks: `n = 2` → 124 / 7 656; `n = 25` → 1550 / 1 196 250).

### 5.4 What the battle side does with it

```text
<piece>_defence = Math.round(hero.<piece> * <piece>_dval)   // +0x3480 .. +0x35e1
armourclass_max = breastplate_defence + helmet_defence + shinguard_defence
                + greaves_defence + shoulderguard_defence + gauntlet_defence
                + boot_defence + shield_defence                    // +0x3ac3
armourclass     = armourclass_max                                  // +0x3b0f
```

`round` in battle versus `ceil` in the shop is the same value for integer item
numbers, so the shop's displayed defence is the battle's defence.

Two special cases:

- **Helmet above 25.** `if (hero.helmet > 25) helmet_defence =
  round(herolevel * 0.5 * helmet_dval)` (`+0x34a7`–`+0x351e`). Item number 26 is
  the only value that trips it, and it is on no shop page — so this branch is
  unreachable from a purchase.
- **Shield with a bow.** `shield_defence` is computed only when
  `using_bow != true`; otherwise it is set to **0** (`+0x35e2`, `+0x3623`).
  Swapping to the secondary weapon costs the hero its entire shield
  contribution to `armourclass`.

`checkarmour` also composes the per-piece flavour bonus the shop displays —
boot `itemnumber*2` movement, shinguard `itemnumber*2` jump, greaves
`itemnumber*1` crit protection, breastplate `itemnumber*1` damage-to-energy,
gauntlet `itemnumber*2` shove, shoulderguard `itemnumber*2` charge, helmet
`itemnumber*1.5` crit protection, shield `itemnumber*1.5` missile deflection
(`+0x0e79`, `+0x0ed1`, `+0x0f29`, `+0x0f78`, `+0x0fc7`, `+0x101f`, `+0x1077`,
`+0x10d3`). **Unverified:** whether any of these is read by a battle site.
Nothing in `battlevalues` reads them.

---

## 6. Base attributes, and why the gate bites

`global_DNA_settings` (`root/frame:35/DoAction@0x3ffdcf`) sets a `heroDNA`
literal of 51 comma-separated fields at `+0x0766`. `initcharacter`
(`root/frame:35/DoAction@0x40bf76`) maps `characterDNA[i]` onto the character
field by field; the indices that matter here:

| index | field | `heroDNA` value |
| ---: | --- | ---: |
| 13 | `weapon` | 0 |
| 16 | `strength` | 1 |
| 17 | `speed` | 1 |
| 18 | `attack` | 1 |
| 19 | `defence` | 1 |
| 20 | `vitality` | 1 |
| 21 | `charisma` | 1 |
| 24 | `herolevel` | 1 |
| 26 | `experienceneeded` | **125** |
| 29 | `goldpieces` | 2500 |
| 45 | `secondary_weapon` | 0 |
| 48 | `maximum_ammo` | 5 |
| 49 | `equipped_weapon` | 1 |

`initwarrior` (`root/frame:35/DoAction@0x3ffdcf`) then grants
`statpoints = 9` for a brand-new gladiator (`+0x0b41`), and `0` when an existing
`charDNA` is being restored (`+0x0b1f`).

Index 26 independently confirms the handoff's correction that level 1 needs
**125** experience, not 60.

So the floor is `strength = speed = 1`, and 9 creation points plus per-level
points are the only unstaged way up before the shop. Nine points all into one
attribute reaches 10, which unlocks `weap_i <= 3` — ids 1–3, 21–23, 41–43,
62–63. That is the realistic unstaged ceiling at herolevel 4–5, and it is why
the recommendation in §0.2 is conditional on staging.

---

## 7. Data anomalies found while reading the tables

Recorded because a navigator that "picks the best item" will otherwise pick one
of them.

1. **Id 57 has `[3] > [4]`** — min 100, max 30 (`+0x473c`). Every other entry in
   the build satisfies `[3] <= [4]`. Its computed shop cost collapses to 5 089,
   an order of magnitude below its neighbours (56 costs 38 479, 58 costs
   51 304), because cost is dominated by `[4]`. A "highest max damage" scan
   skips it; a "cheapest above a damage threshold" scan would grab it.
2. **Weapon ids 59 and 61, and shield item 13, are on no page** and cannot be
   bought by any route through these shops.
3. **Ranged `[5]` is 100 for eighteen of the twenty ids, but 4 for ids 65 and
   75** (`+0x4894`, `+0x4a42`). Since `weapon_range = physical_size + [5]*44`,
   those two get `physical_size + 176` where their neighbours get
   `physical_size + 4400` — bows with melee reach. Almost certainly an authoring
   slip; recorded, not corrected.
4. **Melee `[4]` is `[3]` squared** across the whole slashing band (3→9, 4→16,
   … 26→676) and the whole ranged band. Hacking and bashing use `[4] = 4*[3]`
   up to ids 34 and 56 and then diverge. Useful as an independent cross-check
   that the six-element array decode is the right way round.
5. **`weapon0`'s type index is 2 (bashing)**, which does not match what the
   starting weapon is called. Inert — nothing gates on the starter's type.

---

## 8. Everything not settled

| Claim | Status | What would settle it |
| --- | --- | --- |
| `item.onRollOver()` immediately before `item.onRelease()` behaves like a real hover-then-click | **unverified** — neither handler reads mouse state, but it has not been run | one shop run that calls the pair and logs `clip.itemnumber` and `clip.itemcost` between them |
| `armourbuttons` leaves its `itemnumber` as `NaN` after the loop (no clip exists for `i = 60`) | **inferred** from the loop shape. `buyarmour` gets the item as an argument, but still reads `itemnumber` at `+0x123b` to attach the display clip | the same run, logging `armoursmith.itemnumber` after a page load |
| `whichweapon` — the character property `battlevalues` reads `attack_type` and `attack_speed` from at `+0x3450` / `+0x346a` | **not mapped** — it is assigned outside `battlevalues` | a whole-build reference sweep on `whichweapon` |
| The per-piece armour flavour bonuses are read by any battle site | **unverified** — nothing in `battlevalues` reads them | a reference sweep on each bonus's field name |
| Which site, if any, awards weapon ids 201–220 | **not mapped** | out of scope here; `enchant_weapon` and `unleash_hell` are the candidates |
| The `browse`-page category buttons a human uses to reach `slashing1` etc. | **not decoded** — unnamed `DefineButton2` placements | not needed: `gotoAndPlay(<label>)` is observed working in four capture sessions |
| `angry` (frame 27) is played by the leave button when `itempurchased == null` | **inferred** — the pattern is visible at `root/button:1984/condition:0` `+0x0046`, and buttons 1849, 1929 and 2033 carry the identical three-reference shape | reading each shop's own leave button |
| A second `buyweapon` without an intervening `getweaponinfo` double-discounts | **inferred** from `itemcost` being mutated in place at `+0x1016` / `+0x1026` rather than recomputed | a run that calls `onRelease` twice on one id and logs `clip.itemcost` between them |
| Whether display-list state from an earlier page survives a straight forward play (rather than a `gotoAndPlay`) into the next page | **unverified**, and irrelevant to the navigator, which always jumps | a run that lets the shop play 48 → 56 without a jump |

---

## 9. Changes this track would make elsewhere (not made — other tracks own these files)

1. **`tools/runtime-capture/ss2-capture-wrapper.as`, `shop-open`.** It must call
   `shop["item" + shopItem].onRollOver()` before `.onRelease()`. Without it
   `itemnumber`, `itemtype` and `itemcost` are never written, and the observed
   consequences are exactly the ones in the capture logs: `itemcost` `NaN`,
   `itemnumber` stuck at 20, `hero.weapon` set to 20 whichever id was pressed,
   and 5 000 000 staged gold repaired down to 4 000 by `check_for_nan`. The
   existing `shop-operands-unreadable` guard is doing its job; the missing
   rollover is the cause it is guarding against.
2. **Same file, `WEAPON_PAGES`.** The order `hacking3, bashing3, slashing3,
   hacking2, …` is right for "highest tier first" but wastes two page loads for
   the recommended id 20, which is on `slashing3`. With a real table the page is
   a lookup: band = `ceil(id/20)`, page from the instance table in §1.2.
3. **Same file, `ARMOUR_PAGES = ["browse"]`.** The armoury has no item handlers
   on `browse` either; it needs the twenty per-piece page frames, or at minimum
   the pages for the piece the operator wants. As written, `-ShopArmour` can
   only ever reach `shop-unreachable`.
4. **[`ss2-arena-route.md`](ss2-arena-route.md) §6.** Three corrections: the
   weapon gate compares the item's level to the **hero's attribute**, not to
   anything on the item (§3.1); the `itemlevel > 16` / `itemlevel > 12`
   refusals are **inert** in this build, because root frame 1 sets
   `_root.fizMode = "fizzle"` and frame 10 derives `game_mode = "full"` from it
   (§3.3); and `_root.weaponsmith["item"+i]` exists only on the category pages,
   never at `browse` (§1).
5. **[`ss2-battle-map.md`](ss2-battle-map.md).** It should record
   `min_damage = round(strength*2) + weapon_min_damage`, the matching
   `max_damage`, and the `[3]` / `[4]` table indices — that pair is the operand
   of every damage roll and is currently only described as derived.

---

## Reproduce the read-only inventory

With Node available and `$ss2Install` pointing to the Collection directory.
`--references` matches its regex against the rendered instruction name plus the
JSON of its operand, so quote the `"value":"…"` form to match a constant-pool
string exactly — a bare `^weapon[0-9]+$` matches nothing.

```powershell
$node = 'C:\Users\corey\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$ss2Install = 'C:\Program Files (x86)\Steam\steamapps\common\Swords and Sandals Classic Collection'
$swf = "$ss2Install\swf\swords_sandals2_download.swf"

# the two button wirers, and the gates inside them
& $node tools/inspect-swf.mjs $swf --function '^weaponbuttons$' --max-actions 6000
& $node tools/inspect-swf.mjs $swf --function '^armourbuttons$' --max-actions 6000

# where they are called from - the page-at-a-time finding
& $node tools/inspect-swf.mjs $swf --references '"value":"weaponbuttons"'
& $node tools/inspect-swf.mjs $swf --references '"value":"armourbuttons"'
& $node tools/inspect-swf.mjs $swf --references '"value":"armourpiece"' --max-actions 80

# the weapon data table: 80 shop ids, plus weapon0 and 201..220
& $node tools/inspect-swf.mjs $swf --references '"value":"weapon[0-9]+"' --max-actions 400
& $node tools/inspect-swf.mjs $swf --references '"value":"weapontypes"' --around 60

# the armour scalars and the name/weight tables
& $node tools/inspect-swf.mjs $swf --references '"value":"[a-z]*_dval"' --max-actions 60
& $node tools/inspect-swf.mjs $swf --references '"value":"armoursets"|"value":"armourtypes"|"value":"armoursetweights"|"value":"armourweights"'

# quote, discounts and commit
& $node tools/inspect-swf.mjs $swf --function '^getweaponinfo$' --max-actions 3000
& $node tools/inspect-swf.mjs $swf --function '^buyweapon$'     --max-actions 3000
& $node tools/inspect-swf.mjs $swf --function '^getarmourinfo$' --max-actions 3000
& $node tools/inspect-swf.mjs $swf --function '^checkarmour$'   --max-actions 4000
& $node tools/inspect-swf.mjs $swf --function '^buyarmour$'     --max-actions 3000
& $node tools/inspect-swf.mjs $swf --references '"value":"itempurchased"' --around 90

# the derivation the whole exercise serves
& $node tools/inspect-swf.mjs $swf --function '^battlevalues$' --max-actions 20000

# which flag the demo locks actually test
& $node tools/inspect-swf.mjs $swf --references '"value":"fizMode"' --around 8
& $node tools/inspect-swf.mjs $swf --references '"value":"game_mode"'

# base attributes
& $node tools/inspect-swf.mjs $swf --references '"value":"heroDNA"' --around 3
& $node tools/inspect-swf.mjs $swf --function '^initwarrior$'   --max-actions 800
& $node tools/inspect-swf.mjs $swf --function '^initcharacter$' --max-actions 1200
```

The per-frame instance names in §1.2 and §3.2 come from the tool's structural
summary rather than from any action dump — filter `namedInstances` by `context`
for `sprite:1961` and `sprite:1909`:

```powershell
& $node tools/inspect-swf.mjs $swf --json
```

Every command above prints analysis only. Do not redirect decompiled game code
or assets into the repository. In particular the
`--references '"value":"weapon[0-9]+"'` output carries each item's display-name
string literal, which is why this document identifies items by id alone.

The live corroboration in §1.3 and §1.4 is read from files already committed
and needs no session:

```powershell
Select-String -Path captures\arena-shop-*\*.rufflelog -Pattern '"step":"shop'
Select-String -Path captures\arena-shop-*\*.rufflelog -Pattern '"step":"staged'
```
