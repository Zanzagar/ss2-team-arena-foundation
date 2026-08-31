# Progression diagnosis: what flattens, when, and what should transfer

**Status:** first research deliverable; diagnosis and principles only. This
document does not propose the section D/E progression system and does not
authorize implementation.

**Research date:** 2026-08-30.

## Evidence discipline

This document uses the following labels so that a derivation is not mistaken
for an observation:

- **[V] Battle-map evidence:** recorded in the fingerprinted build's
  [battle map](../integration/ss2-battle-map.md). This label does **not** mean
  "runtime-verified": the map distinguishes static byte verification, runtime
  observations, and candidates still awaiting a promoted golden, and this
  document preserves those qualifications.
- **[D] Derived:** arithmetic from [V] inputs. The derivation can be checked,
  but it is not a new runtime observation.
- **[O] Official external:** a developer, publisher, or mod-author source. It
  describes the named version; it is not evidence about the fingerprinted SS2
  build.
- **[C] Community external:** a guide or wiki. Useful for triangulation, never
  treated as measured vanilla behaviour.
- **[A] Assumption or design inference:** an explicit modelling choice.
- **[U] Unverified:** the needed evidence was not found.

Unless separately sourced, transfer rankings, rejections, and proposed design
principles are [A]: they are design synthesis, not observations about player
behaviour.

The repository has no allowed champion-stat table, level-to-stat curve,
equipment-acquisition curve, or stat-points-per-level specification. Therefore
there is no honest way to turn every stat threshold below into an exact
character level. Where an external guide supplies a level, it is labelled [C],
not silently promoted to [V].

## Executive conclusion

The brief's diagnosis is directionally right but too broad in four ways.

1. **Equal-stat hit chance is not a late-game plateau. In an exactly
   matched-stat model it is stationary at every value.** If attack equals
   defence, the ratio is exactly 1 wherever that contest is available. [V/D]
2. **"Both sides invest" is not sufficient for convergence to 1.** If defence
   has a positive long-run growth rate, the ratio converges to the ratio of the
   attack and defence rates. With zero defence growth and positive attack
   growth, the raw ratio diverges while the clamped chance still saturates.
   What becomes asymptotically stationary is the probability surface, not
   necessarily `100*K`; rounding/clamping may create an earlier exact plateau.
   [A/D]
3. **The cached chance is not the realized probability.** The mapped dispatcher
   hits on an inclusive `d100 >= 100 - chance`, so a cached 50 realizes 51%,
   and a clamped 99 realizes 100%. [V/D]
4. **Damage numbers do not inherently flatten.** Strength keeps adding damage
   and level keeps adding health. The listed quick/normal/power/bash and mapped
   ranged selectors are level-invariant whenever available, while a deliberately
   simplified non-first-blood model can produce asymptotically constant
   attempts-to-kill. The best of quick, normal, and power can change as weapon
   spread changes. [V/A/D]

The most defensible ordering is therefore:

| Axis | Earliest defensible flatten point | Confidence |
| --- | --- | --- |
| to-hit in a matched attack/defence contest | stationary at every matched value; no first-fight availability claim | [V/D], unlock chronology [U] |
| listed quick/normal/power/bash/ranged selector formulas | level-invariant whenever each action is available; grievous has a separate level fallback and unlock chronology is unverified | [V/U] |
| damage magnitude / non-first-blood attempts-to-kill | no unique level; depends on fight mode, strength, vitality, weapons, armour, and growth rates | [A/D/U] |
| movement | for integer stats, hard cap first reached at speed 40 because `round(1.5*speed)` then clamps at 60 | [V/D] |
| ammunition capacity | level 45; it is 30 forever after | [V] |
| ordinary player armour catalogue | community tables put the final Champion tier at level 48; only its conditional armour total is arithmetically cross-checked | [C/D] |
| opponent/content ladder | first-party Classic Collection achievements identify the finite boss roster; community walkthroughs put its last player gate at level 50 | [O/C], boss stat curve [U] |

**Which flattens first?** Only the matched-stat base to-hit score can honestly
be called stationary immediately. A bounded contest-stat gap can later become
rounding-invisible, but cannot be assigned a player level from allowed
evidence. Selector formulas are invariant whenever their actions are
available; their unlock chronology is unknown. Armour has no intrinsic cap,
damage magnitude has no mapped hard cap, and opponent difficulty has no
verified flattening level. There is therefore no evidence-backed global level
ordering across all four axes. Community data only suggest that the ordinary
armour catalogue and championship boss schedule end near player gates 48 and
50 respectively. [V/C/D/U]

That distinction matters. Vanilla does not simply run out of numbers. It runs
out of **new questions** while numbers can continue rising.

---

## 1. Quantitative diagnosis of vanilla progression

### 1.1 To-hit: the general limit

For the physical attack/defence contest, write:

```text
A(L) = aL + A0
D(L) = dL + D0
ratio(L) = (A(L) + 9) / (D(L) + 9)
```

For `d > 0`, then:

```text
lim ratio(L) = a / d
```

It tends to 1 only when the long-run attack and defence slopes are equal and
positive. A fixed absolute gap is one such case only when the shared baseline
grows without bound. If `d = 0 < a`, the ratio instead diverges until the
chance clamp saturates; if `a = d = 0`, it remains
`(A0 + 9)/(D0 + 9)`, not necessarily 1. A persistent 20% proportional
advantage does **not** wash out; it approaches a ratio of 1.2. [A/D]

The broader late-game problem remains. For `d > 0`, once allocation slopes
stabilize the ratio approaches a constant, so level loses explanatory power.
For `d = 0 < a`, the raw ratio diverges but the physical cached chance reaches
the 99 clamp. The `+9` term is a low-stat regularizer; at large values it
disappears relative to growing stats. It does not rescue late-game
sensitivity. [D]

For an exactly matched pair, `A = D`, the ratio is 1 at every level. Before the
ranged shield adjustment, the cached scores are therefore always:

| Action | `K` | Cached score at equal stats | Realized physical hit probability |
| --- | ---: | ---: | ---: |
| bash | 0.20 | 20 | 21% |
| power | 0.33 | 33 | 34% |
| taunt (charisma contest) | 0.40 | 40 | 41% |
| normal | 0.50 | 50 | 51% |
| magicka (magicka contest) | 0.50 | 50 | dispatcher-specific; not assumed here |
| bombard, before shield adjustment | 0.60 | 60 | 61% |
| quick | 0.66 | 66 | 67% |
| snipe, before shield adjustment | 0.90 | 90 | 91% |

The final column follows from the mapped inclusive roll. With cached score
`c`, the hit outcomes are `100-c, ..., 100`, or `c+1` outcomes out of 100.
Thus the stated 1–99 clamp produces an effective physical range of 2–100%, not
1–99%. [V/D]

Two qualifications from the map are important:

- Bombard and snipe subsequently multiply the base score by an
  **attacker-shield** adjustment. That counterintuitive behaviour is
  byte-mapped but explicitly awaits golden confirmation. [V]
- Magicka is not clamped in `attack_chances`, and this document does not infer
  its complete cast dispatcher from the physical hit branch. [V]

### 1.2 How quickly does a fixed stat gap disappear from the base score?

Let `Delta = A - D` and `N = 100*K`. Before rounding and clamping:

```text
raw score = N + N*Delta/(D + 9)
```

So the signed deviation from the equal-stat plateau is exactly (its distance
is the absolute value):

```text
deviation in percentage points = N*Delta/(D + 9)
```

For integer contest stats and a fixed positive integer gap, the base score
before any ranged shield adjustment rounds all the way back to `N` once the
exact condition
`D > 2*N*Delta - 9` holds, equivalently:

```text
D >= 2*N*Delta - 8
```

For only a **one-point contest-stat advantage**, the opposing-stat thresholds
are:

| Action | `N` | Opposing stat where a +1 advantage becomes invisible in the base score |
| --- | ---: | ---: |
| bash | 20 | 32 |
| power | 33 | 58 |
| taunt | 40 | 72 |
| normal / magicka | 50 | 92 |
| bombard (pre-shield base) | 60 | 112 |
| quick | 66 | 124 |
| snipe (pre-shield base) | 90 | 172 |

For a fixed gap of five, those thresholds are 192, 322, 392, 492, 592, 652,
and 892 respectively. [D]

For bombard and snipe these are sufficient thresholds for the pre-shield base,
not necessarily the earliest thresholds for the final cached chance. A nonzero
attacker shield applies another rounding step, and the final clamp can make a
gap invisible earlier or saturate the result. [V/D]

JavaScript's `Math.round` breaks exact half-ties upward, so the negative side
is one point different. For integer disadvantage `g = D - A > 0`, a deficit
becomes rounding-invisible once `D >= 2*N*g - 9`. This small asymmetry applies
to attack/defence, charisma, or magicka according to the action's actual
contest stat. [V/D]

This corrects another overstatement in the brief. A bounded gap matters less
and less, but it is not necessarily rounding-invisible during the vanilla
campaign—especially for high-`K` actions. Conversely, in a true mirror match
there was never any progression in the score to begin with.

Converting a defender stat threshold to a level requires a measured `D(L)`.
None exists in the allowed repository sources. If a future capture establishes
`D(L) = dL + D0`, the corresponding level threshold is obtained directly by
`L_min = max(L_domain_min, ceil((threshold - D0)/d))` for integer player
levels and `d > 0`; until then, reporting a level would be invented.

### 1.3 The ranged shield bug is a separate saturation path

The mapped ranged adjustment is:

```text
adjusted = ceil(base * (100 + attacker.shield*1.5) / 100)
```

At equal attack and defence, snipe has base 90. A shield value of 6 yields:

```text
ceil(90 * 1.09) = 99
```

The physical dispatcher then realizes 100% hits. [D] This is potentially an
early degeneracy, not an endgame flattening effect. It must remain labelled
as a derivation from a statically mapped behaviour until a golden confirms the
adjustment. It is also evidence that the `K` table alone is not the complete
ranged curve.

### 1.4 Damage: rigid selectors, non-rigid payoff

The verified primary-weapon endpoints are:

```text
m = min_damage = round(2*strength) + weapon_min_damage
M = max_damage = round(2*strength) + weapon_max_damage
```

The mapped action selectors are:

```text
quick  -> m
normal -> uniform integer draw from m to M
power  -> M
bash   -> ceil(m/2)
```

That selector vocabulary is rigid. The claim that its risk/reward curve never
changes shape is not.

At equal attack and defence, ignoring armour, criticals, stamina, range,
statuses, and the shield adjustment, expected raw damage per attempted action
is:

| Action | Expected raw damage per attempt |
| --- | ---: |
| quick | `0.67*m` |
| normal | `0.255*(m + M)` |
| power | `0.34*M` |
| bash | `0.21*ceil(m/2)` |
| bombard | `0.305*(m + M)` |
| snipe | `0.91*m` |

For the subsequent algebra, assume the mapped stats are integers, so
`round(2*S) = 2*S`. For the three basic melee attacks, let `R = M/m`. Then:

- power beats normal only when `R > 3`;
- normal beats quick only when `R > 83/51`, approximately 1.6275;
- power beats quick only when `R > 67/34`, approximately 1.9706. [D]

Because:

```text
R = (2*S + Wmax)/(2*S + Wmin)
  = 1 + (Wmax - Wmin)/(2*S + Wmin)
```

a fixed weapon's relative spread shrinks as strength rises. Eventually quick
has the highest raw expected melee damage per attempt. That does not prove
quick is globally optimal—stamina costs, distance, critical bypass, armour
removal, and full action timing are not all mapped—but it disproves the claim
that the payoff ordering is fixed. [D/U]

A community catalogue gives the final slashing weapon, Daikatana, endpoints
26–676 and a requirement of 60 agility. [C] Used only as an illustration, those
endpoints put the power/normal crossover at strength 149.5 and the
normal/quick crossover at approximately 504.97. Under the exclusions above,
the integer-strength raw-EV envelope is therefore power through 149, normal
from 150–504, and quick from 505 onward. [D] A community build guide reports
reaching the 60-agility weapon threshold around level 21; that is one route,
not a measured universal damage breakpoint. [C]

### 1.5 Health and attempts-to-kill: a conditional model, not campaign evidence

Maximum health is verified as:

```text
HP = 10*level + 20*vitality
```

Assume, for modelling only, that post-catalogue strength and vitality grow
linearly:

```text
strength(L) = sL + constant
vitality(L) = vL + constant
```

The map also verifies that ordinary arena `duel` mode is first blood: the first
hitpoint damage ends the fight. In that mode, total HP does **not** determine
time-to-kill; penetrating armour or landing a critical bypass does. The
fingerprinted campaign/tournament `fight_mode` remains unverified. [V/U]

For a deliberately hypothetical non-first-blood mode, add the assumptions
that `s > 0`, long-run hit probability is a stable `p_inf`, armour is fixed or
asymptotically negligible, successful attempts are independent, and
healing/status/critical disruption is absent. With a fixed weapon, let
`q_action` be the selector's leading strength coefficient: 2 for
quick/normal/power/bombard/snipe and 1 for bash. Taunt, grievous, and spell
damage need separate models. Then:

```text
landed damage              ~ q_action*s*L
continuous HP/damage ratio -> r = (10 + 20*v)/(q_action*s)
landed hits required       -> ceil(r), away from an exact integer boundary
expected attempts          -> ceil(r)/p_inf
```

At an exact integer `r`, lower-order health/damage constants and residual
weapon-range randomness decide the ceiling. The continuous quotient alone
cannot say whether a realization needs `r` or `r + 1` landed hits; expected
attempts can lie between `r/p_inf` and `(r + 1)/p_inf`. Outside that boundary,
expected attempts approach a constant whose value depends on both growth
coefficients and hit probability. Continued shortening or lengthening requires
changing relative growth rates or different growth orders; it does not follow
merely from comparing `s` and `v`. This is a model result [A/D], not evidence
about the unverified campaign mode [U]. There is no single "damage flattens at
level X" answer without the missing fight-mode, allocation, and equipment
curves.

Several mapped direct-damage spells have fixed caller ranges: fireball 80–160,
lightning 100–200, hell fireball 150–450, `frightning_bolt` (the mapped vanilla
spelling) 200–400, dire fireball 300–600, and 10–20 boulders at 40 each for
death from above. The last totals 400–800 only if every impact resolves. [V]
In a non-first-blood mode where health receives an automatic `10*level` term,
these spells lose relative value if their callers acquire no separate scaling.
Buffs, statuses, first-blood rules, and unmapped spell interactions may remain
useful; this conclusion applies only to the listed direct-damage ingress under
the stated model. [A/D/U]

### 1.6 Armour: no ratio saturation, but a finite pool can become irrelevant

Armour is a summed, degradable pool rather than an attack/defence ratio. It
therefore has no intrinsic convergence formula. Its late curve depends on the
equipment catalogue:

- if armour stops growing while damage rises, absorbed-hit count tends to zero;
- if armour and damage grow proportionally, absorbed-hit count tends a
  constant;
- if armour outgrows damage, it increasingly delays hitpoint interaction. [D]

The verified slot multipliers sum to 62:

```text
16 breastplate + 10 helmet + 6 shinguard + 3 greaves
+ 8 shoulderguard + 5 gauntlet + 2 boot + 12 shield = 62
```

Community equipment tables put ordinary Champion pieces at tier value 25 and
level 48. [C] Combining that tier with the verified multipliers gives:

```text
full Champion armour with shield = 25 * 62 = 1550
using a bow, shield omitted       = 1550 - 25*12 = 1250
```

The 1550 total independently matches a community endgame build report. [C/D]
This is strong triangulation, not a runtime observation. It suggests ordinary
player armour acquisition stops near level 48. If physical damage continues
to grow after that, armour does not merely flatten; its relative protection
decays.

The special helmet branch complicates extrapolation. A helmet value above 25
switches from `10*helmet` to `5*level`. Crossing from 25 to 26 would therefore
reduce helmet armour below level 50, tie it at level 50, and increase it above
50. [V/D] The availability and intent of values above 25 are unverified.

Armour still creates tactical state after its catalogue stops:

- normal/grievous physical damage is armour-first, while a surviving critical
  bypasses the armour-class branch; [V]
- every physical damage invocation makes a universal 1–100 roll and calls
  armour removal above 66, a 34% chance per invocation; grievous direction 30
  also has an unconditional call that statically appears to be an equipment
  no-op, pending runtime confirmation; [V/D]
- assuming independent universal rolls, the probability that those rolls
  alone call removal at least once after `n` invocations is `1 - 0.66^n`: 56.4%
  after two, 71.3% after three, and 87.5% after five; [A/D]
- a removal call is not guaranteed to destroy a useful piece because direction
  mapping and current equipment still matter; [V]
- exact armour equality and several direction branches have mapped quirks that
  remain candidate behaviours where the battle map says so. [V]

Thus armour is one of vanilla's better non-ratio axes, but finite armour values
alone do not create endless progression.

### 1.7 Hard caps and recovery saturation outside the four requested axes

Two verified caps matter because they remove additional progression questions:

- `movement_speed = clamp(round(speed*1.5), 4, 60)`, so integer speed 40 is
  the first stat value to reach the hard movement cap (the real-valued
  boundary would be `119/3`, approximately 39.667); [V/D]
- ammunition capacity becomes 30 at level 45 and never increases again. [V]

Stamina has a softer collapse. For integer stamina stat `T`, a rest from empty
restores the direct rest gain, the negative stamina cost, and the baseline
phase gain:

```text
rest recovery = 16*T + 1 + round(T/3)
maximum       = 100 + 10*T
```

One rest fills the bar from empty at `T >= 16`; at `T = 15`, 246 is restored
against a 250 maximum, while at `T = 16`, 262 is clamped to the 260 maximum.
[V/D] Rest still consumes an action, and the full action-cost table is not
mapped here, so stamina does not become meaningless. The inference that its
capacity-versus-recovery decision mostly collapses here is [A], not an observed
player-behaviour result.

### 1.8 Opponent difficulty: the listed boss schedule ends; the stat curve is unknown

The Classic Collection's
[first-party achievement roster](https://steamcommunity.com/stats/1055430/achievements)
identifies the Fearful Prisoner tutorial followed by 18 original championship
bosses through Emperor Antares. [O] Community walkthroughs provide the following **player
level gates**, not the bosses' internal levels: [C]

| Player level | Championship opponent |
| ---: | --- |
| 3 | John the Butcher |
| 6 | Evil Ninja |
| 9 | Son of Stylonius |
| 12 | Marksman Dantus |
| 15 | Great Beast |
| 18 | Wizard Sagan |
| 21 | Slave Driver |
| 24 | Spheracles |
| 27 | Maharaja Saeed |
| 30 | Gaiax |
| 33 | Daimyo Katsumodo |
| 36 | HeChaos |
| 39 | Archfiend Zeerzabahl |
| 42 | Sir Belgrave |
| 44 | Bhaargle Yarg |
| 46 | Archangel Sandalphon |
| 48 | evil self / Nameless Shadow |
| 50 | Emperor Antares |

This is a strong community reconstruction of the listed championship schedule,
not a byte-verified ladder. It shows the community-listed authored
**championship boss schedule** ending at a player gate of 50: every three
levels through 42, then every two levels. It neither proves that all opponent
content ends there nor shows a smooth difficulty curve.

The same walkthrough reports Antares at internal level 60 with all eight stats
at 60. Community equipment entries give the Blade of the Empire as 200–800 and
list an active-shield armour total of 1,628. [C] Combining the
community strength value with the verified damage formula yields a base
physical range of 320–920. [C+D] An older guide's rough `1670+` armour estimate
is rejected in favour of the itemized 1,628 sum. None of these Antares values
is tied to a repository capture.

The exact questions still unanswered are:

- the fingerprinted build's complete champion order and level gates; [U]
- every champion's stats, equipment, spell inventory, and AI weights; [U]
- whether opponent stat gaps grow absolutely, proportionally, or by authored
  spikes; [U]
- the live `fight_mode` and reward behaviour across the whole campaign; [U]
- any opponent generation after the final authored champion. [U]

Accordingly, "opponent difficulty flattens at level 50" is still too strong.
Only "community evidence places the listed championship endpoint at a player
gate of 50, while the fingerprinted build's opponent stat curve and later
generation remain unverified" is supportable. Antares' community-listed
internal level 60 must not be confused with playable progression continuing to
level 60.

### 1.9 Vanilla mechanics that resist the ratio problem

The following mechanics earn further design attention because their value is
not simply `attack/defence`:

| Mechanic | Why it resists ratio saturation | Existing limit or risk |
| --- | --- | --- |
| armour depletion and slot destruction | changes state within the fight; different directions can threaten different equipment | finite pool; removal is partly random; catalogue appears finite |
| critical bypass and helmet/greaves deflection | separate roll and equipment contest; can change whether armour matters | threshold operands are counterintuitive and some behaviours still need goldens |
| stamina/rest economy | action opportunity cost and recovery timing are independent of hit ratio | one rest fills from empty at stamina 16; costs are incompletely mapped |
| ammunition and weapon swap | finite shots and mode changes create sequencing decisions | capacity hard-caps at level 45 |
| burning, frozen, poison, life stolen, taunts, and timed buffs | alter future state rather than merely the current hit score | fixed status vocabulary; stacking/duration details are not all verified |
| spell items in six inventory slots | already makes abilities compete for scarce carried slots | listed direct-damage spells do not visibly scale with level in the mapped callers |
| position, charge, shove, jump, and range | changes action legality and tempo rather than a scalar contest | movement speed itself caps; much spatial timing remains presentation-bound |

For criticals specifically, each critical-sample draw equals exactly 20 with
probability 1/41 for quick and bombard, 1/20 for normal, and 1/16 for power.
It affects that same action only if the attack lands, but a sample drawn on a
miss can remain transiently available to a later bash. Snipe supplies zero.
[V/D] Deflection
then supplies another separate equipment roll; statistical independence is
not established here. [V] These axes can keep
individual turns stateful, but a fixed list of them still runs out of novelty.

### 1.10 What vanilla actually runs out of

The model predicts that vanilla runs out of **new decisions first**, **authored
content second**, and only then appears to run out of numbers. [A]

- The attack/defence surface is already stationary for matched stats, yet the
  early game can still be interesting because weapons, armour, spells,
  positioning, and named opponents arrive. Therefore ratio saturation alone
  cannot explain the timing of late-game boredom. [A/D]
- Later stat and item gains mostly revisit the same action grammar. If and where
  weapon, movement, ammunition, armour, spell, and championship-opponent
  catalogues stop expanding, level gains adjust quantities without asking a
  new question. [V/C/D]
- Health, strength damage, gold penalties, and some equipment values can keep
  rising. Under the stated hypothetical non-first-blood assumptions,
  proportional growth stabilizes their ratios and attempts-to-kill; ordinary
  first-blood `duel` instead turns armour penetration/critical bypass into the
  gating question. Neither adds a new decision merely because its numbers
  rise. [V/A/D]

The corrected model-level diagnosis is: [A]

> In the modeled stable-growth cases, vanilla projects builds onto an
> asymptotically stationary contest/outcome surface while the mapped action and
> spell vocabularies, community-listed equipment catalogue, and championship
> schedule stop adding decision types. The ratio formula is an important
> cause; the inference is that decision/catalogue exhaustion, not a literal
> universal number cap, explains the late-game flattening.

---

## 2. Transferable principles from the reference games

This section extracts tests for the later design. It deliberately stops before
specifying the section D/E progression timeline, loot tables, inventory model,
or opponent generator.

No reference-game mechanic should be copied literally. Later SS2 proposals
must still state, one by one, whether they preserve vanilla parity or require a
separate non-runtime-verified rule set, and must name the degeneration they
invite plus its counter.

### 2.1 Torchlight II: separate vanilla from the user's modded reference

The user's remembered reference was heavily modded, including Synergies. It is
therefore important not to attribute the whole experience to vanilla.

#### What vanilla actually contributes

Vanilla Torchlight II supplies two broad replay structures: New Game Plus and
Mapworks. NG+ carries a character into a harder replay; Mapworks supplies
repeatable maps. The
[official Steam description](https://store.steampowered.com/app/200710/Torchlight_II/)
describes the pair as its
near-endless replay layer, and Runic later added endgame maps plus NG+-only
dungeons/events. [O] The transferable part is **persistent build carryover into
new challenge contexts**. Replaying the same campaign at larger numbers is not
enough.

The stronger vanilla contribution is item grammar. Runic's own development
notes distinguish uniques that trigger behaviour—skills on strike,
shield-breaking, and similar effects—from items that merely have larger passive
values. Official technical documentation confirms that items can combine
affixes, set membership, sockets, and attached skills. [O] That creates several
bounded ways for one item to change a build's behaviour.

Vanilla also recognizes experimentation cost: Runic's
[post-beta notes](https://www.runicgames.com/blog/2012/06/21/post-beta-changes-and-updates/)
identify respec handling as a major skill-system change. [O] The exact
version-specific implementation is not material to the transferable principle:
a system built around combinations needs a controlled escape hatch. Synergies'
respec/stat potions later push that principle much further.

#### What Synergies and common companion mods add

The [SynergiesMOD author page](https://steamcommunity.com/workshop/filedetails/?id=136232408)
documents random monster affixes, fifty fame levels, altered skill/enchant
pacing, respec and stat potions, new crafting systems, more than 300 additional
legendaries, explicit Tier 0/0.5/1 raid content, boss-specific drops,
level-scaling alternate dungeons, waves, swarms, custom classes, and much higher
monster density. [O: mod author]

That list contains both the best and worst transfer candidates. Named content
tiers, opponent affixes, boss-owned rewards, alternate progression routes, and
build-changing legendaries can create new questions. Hundreds of enemies,
flat zone debuffs, and raw gear inflation merely lengthen an action-RPG gear
treadmill.

The ecosystem itself supplies useful counter-evidence:

- the author's historical
  [Synergies collection](https://steamcommunity.com/sharedfiles/filedetails/?id=136429082)
  separates LOWPOP (density back toward vanilla) from HIGHLOOT (reward
  quality); density and reward were axes players could tune independently;
  [O: mod author]
- the historical [LAO 2.0 listing](https://steamcommunity.com/sharedfiles/filedetails/?id=185023302)
  advertises more than 15,000 item variants, more rarity tiers, and scaling or
  randomized affixes; that demonstrates demand for a longer item chase, but
  most replicated level variants are vertical quantity, not new play; [O: mod
  author]
- [Adventure Mode](https://github.com/tukkek/torchlight2-AdventureMode)
  replaces automatic level matching with fixed map tiers, push/farm choice,
  gameplay modifier families, and targetable reward categories; this is a
  cleaner expression of the Mapworks principle; [O: mod author]
- the historical [RnF Skill Spells listing](https://steamcommunity.com/sharedfiles/filedetails/?id=158678801)
  turns class abilities into findable inventory spells usable by any class,
  while Essentials bundles respec, inventory/UI, classes, sets, and loot
  changes. [O: mod author] The former is conceptually close to SS2's existing
  item-id spell inventory; the latter is evidence that quality of life is part
  of making a complex progression system usable.

The user's exact historical mod stack beyond Synergies remains [U]. LAO,
Adventure Mode, findable skills, and Essentials are comparisons, not claims
about what the user played.

#### Torchlight transfer ranking

| Pattern behind the feature | Fit for a short deterministic arena duel | What survives translation | What does not |
| --- | --- | --- | --- |
| behaviour-bearing affixes and uniques | very high | a rare result changes an action, resource, or build rule | passive DPS/armour inflation and thousands of level copies |
| abilities represented as loot | very high | a scarce carried slot can add or transform tactical vocabulary | enormous hotbars and strictly better ranks of one spell |
| fixed challenge tiers with visible reward families | very high | choosing to push, hold, or target a reward remains meaningful between short fights | procedural corridors, travel time, and trash packs |
| bounded sockets, small set thresholds, and targeted enchanting | high, with strict caps | modular tuning and repairing a near-miss drop | unrestricted stacking, full-outfit taxes, blind reroll loops |
| constrained respec and saved experiments | high | protects discovery from irreversible mistakes | rebuilding perfectly for every revealed opponent |
| NG+ carryover | conditional | keep the build while introducing a new challenge layer | the same ladder with larger stats |
| gambling and rarity colours by themselves | low | at most, a disclosed-category risk/reward choice | blind gold sinks and labels with no mechanical meaning |
| Synergies density, swarm clearing, and raid attrition | reject | none of the volume itself | real-time AoE, sustain, kiting, and hundreds of enemies |

The ranking yields one concise lesson: **reward targeting and rule variety are
more valuable than drop volume**. A duel loop has no room for an ARPG's ratio of
hundreds of discarded items to one useful find.

### 2.2 Project Ascension: freedom needs constraints, anchors, and pruning

Ascension is not one timeless ruleset. Its official pages document a sequence
of experiments, and exact mechanics change by season:

- **Free Pick** combines abilities and talents across classes and supports
  respecs/saved specializations;
- **Draft** offers a small choice set at level intervals, with cards, rerolls,
  rarity pressure, and Prestige;
- **Wildcard** randomizes abilities/talents, then lets players keep, lock,
  steer, or reroll parts of the result. [O]

The important finding is negative: combinatorial freedom does not prevent a
meta. Ascension's own [Ability Gems rationale](https://ascension.gg/en/news/ability-gems-new-spells-and-more-on-area-52/399)
says unrestricted Free Pick led to mandatory immunity/control packages,
stunlock chains, encounter cheese, and one-button builds that spent the rest of
their budget on universal utility. The response was categorical scarcity:
powerful control, survival, escape, and multi-role tools consume rarer budgets.
[O]

Its random modes work best when randomness is steerable rather than absolute:

- limited cards establish a foundation;
- synergy offers are influenced by already-owned components;
- locking and rerolling turn pruning into progression;
- rejection protection prevents immediate repeats;
- extracted enchantments and gear memory convert a found effect into reusable
  collection knowledge;
- presets and nerf refunds protect experimentation from sunk costs. [O]

Ascension also documents the failure modes of those corrections. Draft could
become repeated Prestige until a target meta build appeared; core common
abilities could be missed; pure Wildcard produced duplicate or unusable rolls;
and long endgame sessions could yield no useful optimization. One
[official balance report](https://ascension.gg/en/news/april-balance-update/488)
describes a snapshot build at roughly three times alternatives, requiring both
a nerf and encounter retuning. [O] Randomness widened the search space but did
not remove dominant combinations or the need for stewardship.

This yields the transferable pattern:

> Offer imperfect, contextual choices; let the player's existing build steer
> future offers; reserve a small number of deterministic anchors; impose
> categorical scarcity on universal tools; and turn rejected/duplicate results
> into bounded future agency.

It also yields the rejection:

> Do not import unrestricted full-library selection, pure random rolls,
> hundreds of rerolls, forced re-levelling, or a huge active hotbar. Each lets a
> short duel collapse into either a copied best kit, a grind for that kit, or a
> rehearsed opening script.

Because SS2 already gives every gladiator the same basic action grammar,
"Wildcard" cannot usefully mean crossing class boundaries. Its conceptual SS2
analogue is a constrained offer of behaviour-changing action, spell, or item
modifiers inside scarce carried/active slots, with offers steered by a few
already-kept tags and repaired by bounded anchors or pity. [A] That is a
transfer pattern, not a section D/E proposal. Pure random replacement of base
actions would be especially destructive here: one dead roll occupies a much
larger share of a short duel's decision space.

### 2.3 What the current Ascension directions add to that lesson

This subsection is status-qualified to the research date. Ascension changes
quickly, so launch descriptions are not assumed to be current when a later
changelog contradicts them. The official realm status and timelines show
Bronzebeard, the Conquest of Azeroth realms, and Season 10's Dawnrise and
Darkmoon operating on 2026-08-30; the timelines show late-August raid and
Mythic+ releases. "Ascendancy I" is also marked released that day, but no
accessible mechanical specification was found, so no design conclusion is
drawn from its name. [O/U] Sources: [status](https://ascension.gg/en/status),
[Bronzebeard timeline](https://ascension.gg/en/timeline/bronzebeard),
[Vol'jin timeline](https://ascension.gg/en/timeline/voljin),
[Dawnrise timeline](https://ascension.gg/en/timeline/dawnrise), and
[Darkmoon timeline](https://ascension.gg/en/timeline/darkmoon).

#### Season 10: charge breadth for depth, and make randomness repairable

The official July 17
[Season 10 overview](https://www.youtube.com/watch?v=98nvu-v5ruA) presents two
separate agency models that launched July 24: Dawnrise Free Pick and Darkmoon
Wildcard. [O] That separation matters more than the realm names. Deterministic
construction and constrained discovery produce different player promises and
should not be blurred into a single economy whose worst luck can be bypassed by
copying a solved build.

Dawnrise is no longer an unconstrained full-library picker. Chosen abilities
grant class points that gate deeper abilities; talent investment gates deeper
specialization nodes; Ability and Talent Essences bound the total selections;
and reactive Mystic Scrolls bias compatible multischool effects toward the
current build. [O: official overview, 18:32–21:39] The pattern is a
**depth-for-breadth budget**: hybridization remains possible, but taking every
best shallow tool carries an opportunity cost and coherent investment earns
access to capstones. The failure it invites is fake freedom—gates so tight that
every hybrid becomes a lightly flavoured mono-class build. A current
[Dawnrise discussion](https://www.reddit.com/r/ProjectAscension/comments/1vue32s/why_is_dawnrise_almost_dead/)
contains both that complaint and defences of the constraint [C], so it is a
warning rather than a population or balance verdict.

Darkmoon keeps stochastic assembly but surrounds it with correction: a
rerollable starting set, alternating ability/talent rolls, synergy-biased
offers anchored in something already kept, Scrolls of Fortune, guaranteed
Skill Cards, and refinement at level cap. [O: official overview,
21:42–24:37] The launch plan withheld starter Skill Cards until a first
Prestige; the
[July 28 correction](https://ascension.gg/en/changelog/2026?page=26) moved them
to character creation and also cut Dawnrise unlearn costs. [O] The transferable
rule is that **reversibility and a deterministic anchor must arrive before a
failed build becomes sunk cost**. Forced full re-levelling/Prestige as the
normal repair mechanism does not transfer to a sequence of short duels: it
turns experimentation into punishment and rewards repetitive farming.

Season 10's Class Fusion layer addresses another classless failure at the
substrate rather than through thousands of bespoke pairings. Multischool
actions satisfy multiple damage families, "unlocked" talents broaden triggers
to semantic predicates, and Path of Duality supports two offensive stat
families. [O: official overview, 8:25–15:04] The transferable pattern is **tag-level
compatibility**: effects can refer to a small vocabulary such as `physical`,
`ranged`, `magic`, `control`, `heavy`, or `quick`, and a hybrid action can
satisfy two tags. The degeneration is a universal proc soup in which every
action triggers every payoff. The control is a strict tag budget, explicit
trigger timing, and stacking groups.

Post-launch changes make that last control concrete. The
[August 2–4 changelog](https://ascension.gg/en/changelog/2026/08/04) made
several percentage healing and damage bonuses mutually exclusive, stopped
some multiplayer effects stacking multiplicatively, and removed other
unintended stacking. [O] For SS2's eventual 2v2/3v3 rule set, the
principle is **strongest-only or diminishing stacking groups applied across
the whole team**, not merely within one fighter's inventory. Otherwise the
degenerate team is predictable: everyone stacks the same multiplier, or one
mandatory "tax fighter" carries the aura/debuff every composition needs.

The amount of post-launch correction is also evidence against assuming that a
semantic tag system self-balances. It reduces compatibility dead ends; it does
not remove combinatorial tuning cost. Exact current gates, weights, and balance
continue to change and should be treated as version-sensitive. [O/U]

#### Bronzebeard / Warcraft Reborn: persistence and deterministic exits from RNG

Bronzebeard moves in the opposite direction from classless breadth. Its
[official launch overview](https://www.youtube.com/watch?v=Q6Yg37OpR34),
published 2025-09-28 for the 2025-10-03 launch, presents nine recognizable
classes on a staged progressive realm. [O] Its July 2025
[Warcraft Reborn article](https://ascension.gg/en/news/bronzebeard-warcraft-reborn-the-next-chapter-unfolds/497)
was an Alpha design statement; its exact bounded-enchantment-slot and scaling
rules remain live-unverified unless later corroborated. Only mechanics
corroborated by the 2026
[Shadows over Blackrock update](https://ascension.gg/en/news/warcraft-reborn-shadows-over-blackrock/529)
or current changelogs are treated as current here. [O]

The most transferable pattern is **identity persistence without permanent
numerical supremacy**. A Worldforged item's characteristic effect can persist
while the item is upgraded through cleared content tiers; the permitted tier
is progression-gated and earlier costs fall as the realm advances. The 2026
[mid-February update](https://ascension.gg/en/news/mid-february-updates-heroic-world-bosses-worldforged-upgrades-and-more/525)
and Shadows over Blackrock corroborate continued tier upgrading, while the
[August 18 entry](https://ascension.gg/en/changelog/1?page=4) caps later Rune
costs at the Onyxia rate. [O] A future SS2 signature item or technique could
likewise evolve instead of being discarded every few levels. The invited degeneration is a permanent
best-in-slot obligation that deletes later loot choice. Its required control
is a current-tier power budget, sidegrades, and a way to retire or transform
the signature—not infinite additive scaling.

Bronzebeard's more important loot lesson is layered **deterministic bad-luck
protection**, not additional slot-machine pulls. Shadows over Blackrock
documents slot-targetable tier tokens, visible callboard progress, and
boss-earned currency that eventually buys an exact item from a cleared raid.
The dated [August 16 archive entry](https://ascension.gg/cs/changelog/2026/05/19)
documents current-spec weighting plus 200-cache suppression after recycling;
the [August 24 archive](https://ascension.gg/en/changelog/2026/07/30) adds a
searchable vendor containing every Mythic-0 item, whose upgrade power is capped
by the player's highest cleared key. [O] The archive routes are pagination
artifacts, so the entry dates—not their URL dates—identify the changes.
Abstracted for a duel loop, the complete pattern is:

1. suppress or convert duplicates;
2. turn rejected results into visible progress;
3. guarantee an exact category or item after a bounded number of failures;
4. unlock the fallback only after the relevant opponent tier is cleared;
5. reduce old-tier costs when a new tier begins.

The degeneracy is deterministic acquisition becoming the fastest path and
making drops irrelevant. The counter is to make the fallback a bounded
worst-case guarantee while first discovery, sidegrades, and earlier clears
remain valuable.

Bronzebeard also supplies unusually candid negative evidence. The Shadows
article says proc items became so dominant that raids equipped otherwise-poor
items solely for raid-wide buffs, disproportionately taxing small groups. The
response reduced procs, converted armour-reduction effects to owner-only
bypass, made other buffs personal, and added an internal cooldown. [O] This is
almost a direct 2v2/3v3 warning: interesting effects still collapse choice if
they create a mandatory aura holder. Personal ownership, strongest-only
groups, or a visible team budget are safer than raid-wide multiplication.

For replay, the March 20
[Raid Trials specification](https://ascension.gg/en/news/warcraft-reborn-march-updates-new-world-boss-mythic-11-15-alterac-valley-raid-trials-blood-bowl-and-more/526)
describes a system that launched April 10: optional linear difficulty,
first-clear currency and a gear cache, half currency on repeats, plus
cosmetics/leaderboards. It explicitly has no weekly reset or attempt cap. [O]
The transferable pattern is **first-clear-heavy optional difficulty**: prove
mastery for the main reward, let repeats remain useful without becoming the
optimal farm, and do not calendar-gate attempts. The health/damage/healing
scalars, shared group unlocks, raid scale, and live content calendar do not
transfer literally.

Finally, the 2025 Alpha design article rejects exact level mirroring because it
can erase the feeling of getting stronger and describes enemies trailing and
capping. [O, historical design; current implementation U] The argument supports
testing stepped, lagged, or capped opponent scaling over an opponent who copies
every player increase, but it is not evidence that the live rule succeeded.
Exact mirroring invites a null progression treadmill; unlimited overlevelling
invites trivial farming. A later opponent design will need a bounded gap
between them.

#### Conquest of Azeroth: bounded identity and complete core competence

Current Ascension material describes Conquest of Azeroth as 21 authored
classes with three specializations each, not a single unrestricted pool. [O]
Source: [current overview](https://ascension.gg/en). The
[official release overview](https://www.youtube.com/watch?v=pIPOCauIHKw) was
published 2026-06-28 for the 2026-07-03 launch. [O] Its development history is
valuable because it documents why more options were removed or reorganized.
The June 2023
[talent overhaul](https://ascension.gg/en/news/conquest-of-azeroth-talent-overhaul/425)
specified a primary specialization at level 10 and alternating class/spec tree
points; it also names poor pacing, long tooltips, passive clutter, weak
differentiation, and balance problems in the prior design. [O, historical]

Later beta changes sharpened the pattern. The
[January 2025 beta](https://ascension.gg/en/news/conquest-of-azeroth-january-open-beta-test/482)
aimed to deliver a complete core rotation by level 30, leaving later levels to
change priorities and unlock longer cooldowns. The
[March beta](https://ascension.gg/en/news/conquest-of-azeroth-march-open-beta-test/485)
added an optional Auto-Build for overwhelmed players, reduced the number of
control categories per class, reserved permanent stealth for a stealth-focused
identity, and combined button bloat into fewer stronger actions. The
[June final beta](https://ascension.gg/en/news/conquest-of-azeroth-june-open-beta-test/492)
gave every class essential interaction such as an interrupt, but expressed it
with asymmetric potency and timing. [O, pre-release design evidence]

The current homepage and status verify that the CoA realms and 21-class
product are live; they do not prove that every pre-release tree, control, or
level-pacing detail survived unchanged. No accessible 2026 live mechanical
specification closed that gap, so those details remain a documented design
lineage rather than current-rule evidence. [O/U]

The design inference is **a complete baseline grammar, bounded identity, then
bounded specialization mixing**. [A] Every fighter must be independently
functional in 1v1 and have an answer to core threats; later choices should
alter emphasis, not withhold the basic loop. Answers can be asymmetric, and no
fighter should own every control category. The degeneration is either
universal-tool soup or hard class counters. The counter is shared core
competence, narrow identity budgets, soft/telegraphed opponent niches, and
teamwide control fatigue.

What does not transfer is equally important: 21 large classes, long rotations,
dozens of buttons, permanent stealth, chain control, or hard tank/healer/DPS
dependency. A three-unit team is too small to absorb a
required MMO role, and a deterministic duel is too short for hard denial to
average out over many encounters.

No current public CoA-specific bad-luck-protection system comparable to
Bronzebeard's cache suppression or exact raid-item fallback was verified. [U]
CoA shares broader Ascension content, but those Bronzebeard acquisition rules
must not be projected onto it.

#### Combined conclusion from the current modes

The newer evidence revises the older Ascension lesson in six ways:

1. charge breadth for depth rather than presenting unrestricted choice as
   freedom;
2. express hybrid compatibility through a small semantic rule grammar;
3. keep deterministic construction and constrained-random discovery as
   distinct modes;
4. make bad-luck protection converge on exact acquisition, not endless
   rerolls;
5. preserve signature identity while capping it to the current power budget;
6. apply multiplier, control, and action-economy limits across the entire team.

These are principles for later design, not parity claims. The seam creates
three distinct provenance cases:

- changed formulas, action semantics, resolver tags, or combat stacking require
  a separate designed rule set and must never be called runtime-verified;
- custom opponents, rewards, or pre-fight inventories can use unchanged
  classic combat rules and therefore preserve **combat-rule parity**, while
  still being a designed campaign rather than vanilla campaign parity;
- cosmetics or bookkeeping with no combat/state effect preserve noncombat
  parity and need no progression combat rule.

Each concrete mechanic must still name its own case, degeneration, and counter
in sections D/E.

### 2.4 Corroborating references that genuinely transfer

Only three additional patterns earn a place here.

#### Hades: difficulty as a player-authored constraint budget

Supergiant describes the Pact of Punishment as a central endgame in which
players select harmful Conditions to reach Heat thresholds and earn Bounties.
Some Conditions change bosses or give enemies distinct perks such as linked
invulnerability, movement, armour, or other behaviours rather than only more
health. [O]

The transferable pattern is **visible optional difficulty debt**: the player
chooses which constraints to accept, and rewards are tied to the declared
budget. Real-time deadlines, room speed, reaction tests, and repeated chamber
navigation do not transfer literally.

#### Slay the Spire: cumulative mastery layers

Mega Crit's official Ascension announcements describe victory-gated,
cumulative difficulty layers; later levels alter scarcity, enemies, and the
final encounter as well as numbers. [O] The transferable pattern is a readable
mastery ladder that introduces one complication at a time. Deck dilution,
route planning, card draw, and long-run attrition are specific to a deckbuilder,
and a finite difficulty ladder alone is not endless progression.

#### Monster Train: power now, explicit danger later

The official Last Divinity material ties optional Pact Shards to immediate
upgrades or resources while empowering enemies and eventually unlocking an
additional boss. [O] The transferable pattern is a **paired bargain**: an
optional power gain incurs visible future difficulty debt. Unit fusion, deck
construction, and multi-floor wave routing do not transfer.

### 2.5 The seven principles to hold the later design against

These are intentionally phrased as tests rather than features.

#### Principle 1 — Add a new decision type before the old one is solved

Numerical growth can continue, but it cannot be the only reward. A progression
layer earns its place only if it asks a question the previous layer did not.
The test is not "did power rise?" but "does the player now consider something
new before or during a turn?"

**Degeneration to watch:** every later layer is the same optimization under a
new currency name. **Control:** each milestone must name its new decision and
which earlier solved pattern it disrupts.

#### Principle 2 — Make important power change action grammar, not just scale

Torchlight's best uniques, Ascension's build-defining effects, and Hades'
enemy-changing Conditions all alter behaviour. A higher tier should more often
change when, why, or at what cost an existing action is used than add another
percentage to it.

**Degeneration to watch:** multiplicative rule effects combine into an
unanswerable opening or mandatory best-in-slot package. **Control:** bounded
effect families, mutual exclusions, explicit costs/drawbacks, and a small
active rule budget.

#### Principle 3 — Constrain discovery, but make it steerable

Full free pick converges on published best builds; pure randomness converges on
reroll grind. The useful middle is limited contextual choice plus anchors,
synergy weighting, pruning, duplicate protection, and deterministic pity.

**Degeneration to watch:** steering becomes strong enough that every run
reconstructs the same target build, or weak enough that progress is lottery
only. **Control:** cap anchors and steering, preserve at least one off-axis
option, and make failed results advance a bounded guarantee.

#### Principle 4 — Scarcity must be categorical, not only a total point cap

A single point budget often permits a cheap damage engine plus every universal
defence/control tool. Ascension's history shows why control, survival, escape,
and role compression need their own scarcity categories. In co-op, some limits
must be team-wide or three individually legal kits will recreate permanent
disable or invulnerability.

**Degeneration to watch:** one combatant carries all setup/support while one
executes every payoff, or the team chains hard control forever. **Control:**
per-combatant identity budgets plus team budgets for hard disable,
invulnerability, and multiplicative burst.

#### Principle 5 — Let players choose visible difficulty; do not erase it with automatic scaling

Map tiers, Hades Heat, and shard bargains preserve the choice to push, hold, or
farm. Automatic level matching makes every gain feel cancelled; pure stat NG+
makes every fight feel repeated.

**Degeneration to watch:** players select one easiest modifier/reward pairing
forever. **Control:** price modifier interactions, use first-clear progression,
diminish identical repeats, and rotate or broaden targetable reward families.

#### Principle 6 — Protect experimentation and convert failure into information

Respecs, extraction, salvage, presets, duplicate conversion, and pity all keep
experimentation from becoming wasted time. Reversibility should exist between
meaningful blocks of play, not necessarily between every opponent.

**Degeneration to watch:** perfect counter-respec before every fully revealed
fight erases character identity; uncapped rerolls turn time/currency into
guaranteed best-in-slot. **Control:** lock choices for a short series, seed
offers before display, cap rerolls, and make deterministic progress bounded.

#### Principle 7 — Optimize for readable encounters and reward quality, not content volume

A short deterministic duel magnifies every rule. One opponent doctrine and a
few legible combatant identities can create more meaningful variety than
hundreds of enemies or thousands of item copies. Randomness belongs primarily
in what challenge/build is offered; once a fight begins, outcomes must remain
ordered, replayable, and explainable through the resolver's RNG channel.

**Degeneration to watch:** affix combinations become unreadable, especially in
3v3, or loot administration takes longer than combat. **Control:** small
budgets, disclosed opponent rules, family exclusions, concise combat logs, and
few decision-bearing drops.

### 2.6 Mechanics and patterns that do not transfer

Rejecting these is more important than reproducing a reference game's feature
count.

| Reject | Why it fails in a short deterministic 1v1/2v2/3v3 duel |
| --- | --- |
| procedural corridors, exploration, dense trash packs, swarm clear, and real-time raid attrition | there is no traversal/clear-speed loop; volume adds time, not arena decisions |
| real-time movement/reaction tests, cast-speed races, projectile density, kiting, and on-kill chains | they test execution and spatial throughput that the turn resolver does not express |
| item showers, inventory Tetris, tiny percentage upgrades, and thousands of level-replicated variants | most drops become chores; scalar gains are swallowed by the same ratios |
| pure-stat NG+, flat player debuffs, paragon-style endless points, and enemy HP inflation | they preserve or worsen the stationary outcome loop |
| unrestricted full-library ability selection | a copied best toolbox replaces discovery; SS2 is already classless in the ordinary sense |
| pure Wildcard rolls and hundreds of rerolls | one dead choice is proportionally larger in a short duel; rerolling becomes the game |
| MMO Prestige/relevel cycles, dailies, auction-house economies, crafting-currency webs, and mandatory seasons | they are retention/economy loops, not better decisions; resets conceal convergence rather than solve it |
| huge hotbars, long rotations, snapshotting, frequent proc chains, and multiplicative buff stacks | deterministic combat turns them into solved opening scripts or one-turn kills |
| rigid tank/healer/DPS imports | 1v1 cannot use them, and in co-op they risk making one player a support appliance |
| blind gambling and reloadable shops | they undermine planning and invite refresh/save manipulation |
| seven-to-ten-piece completion sets | they tax nearly every slot, suppress upgrades, and make one missing drop disproportionately important |
| unrestricted respec before each opponent | full information plus perfect rebuilding removes persistent build identity |

### 2.7 Gate for the next design documents

Every section D/E mechanic should pass all of these questions before it is
called complete:

1. What genuinely new decision does it introduce, and at what point?
2. Does its value remain meaningful after attack/defence and damage/health
   ratios stabilize?
3. Is the choice legible before a deterministic fight begins?
4. What is scarce, and is that scarcity per combatant, per team, or both?
5. What degenerate strategy does it invite, and what explicit rule counters
   that strategy?
6. Does it preserve measured vanilla behaviour, alter only campaign/state/UI,
   or require a separate designed rule set behind the seam?
7. Does it still give each ally agency in 2v2/3v3?
8. Can a duplicate, failed roll, or balance change be recovered from without
   turning recovery into the dominant grind?

No implementation should begin until those answers exist for the minimum
viable slice.

---

## Sources

### Repository evidence

- [SS2 battle map](../integration/ss2-battle-map.md) — fingerprinted build,
  formulas, action ingress, armour, resources, spells, statuses, and evidence
  qualifiers.
- [Endless-progression brief](endless-progression-brief.md) — assignment scope
  and research questions.
- [Rule-set seam](../../src/team/rule-set.js) and
  [adapter contract](../ss2-adapter-contract.md) — provenance/parity boundary.

### Official developer, publisher, and mod-author sources

- Classic Collection [first-party achievements](https://steamcommunity.com/stats/1055430/achievements)
  — original boss-roster identity, but not levels or stats — and the
  [official store page](https://store.steampowered.com/app/1055430/Swords_and_Sandals_Classic_Collection/).
- Classic Collection [official update archive](https://store.steampowered.com/oldnews/?appgroupname=Swords+and+Sandals+Classic+Collection&appids=1055430&feed=steam_community_announcements)
  — evidence that Collection releases changed some classic behaviours, so a
  public original-game table is not automatically evidence for the
  fingerprinted build.
- Swords & Sandals official [Tome of Lore](https://swordsandsandals.com/) —
  lore and original/Redux distinctions only; its blended roster is not used as
  an exact classic ladder.
- Torchlight II [official site](https://www.torchlight2.com/),
  [support page](https://www.torchlight2game.com/support), and
  [official Steam page](https://store.steampowered.com/app/200710/Torchlight_II/).
- Runic on [behaviour-bearing unique items](https://www.runicgames.com/blog/2012/07/17/travis-with-some-torchlight-ii-updates/),
  [content scale](https://www.runicgames.com/blog/2012/07/20/size-matters-travis-talks-about-scale/),
  [post-beta respec](https://www.runicgames.com/blog/2012/06/21/post-beta-changes-and-updates/),
  [GUTS/endgame additions](https://www.runicgames.com/blog/2013/04/01/guts/),
  and [item schema](https://docs.runicgames.com/wiki/Items.html).
- [SynergiesMOD](https://steamcommunity.com/workshop/filedetails/?id=136232408),
  the [official Synergies collection](https://steamcommunity.com/sharedfiles/filedetails/?id=136429082),
  [LAO 2.0](https://steamcommunity.com/sharedfiles/filedetails/?id=185023302),
  [Adventure Mode](https://github.com/tukkek/torchlight2-AdventureMode),
  [RnF Skill Spells](https://steamcommunity.com/sharedfiles/filedetails/?id=158678801),
  and [Torchlight II Essentials](https://steamcommunity.com/sharedfiles/filedetails/?id=138228035)
  author pages. LAO and RnF are historical/removed Workshop references; they
  document mod design, not current availability.
- Project Ascension's earlier classless-system record:
  [classless overview](https://ascension.gg/en/features/classless-wow),
  [Draft overview](https://ascension.gg/en/news/mastering-draft-mode/368),
  [Season 9 overview](https://ascension.gg/en/news/season-9-full-overview-article/445),
  [Ability Gems rationale](https://ascension.gg/en/news/ability-gems-new-spells-and-more-on-area-52/399),
  [Draft improvements](https://ascension.gg/en/news/draft-improvements/392),
  [Wildcard Chapter 2 changes](https://ascension.gg/en/news/s9-ch.2-full-features-overview/458),
  [enchant memory/presets](https://ascension.gg/en/news/mystic-enchants-gear-memory-and-enchant-presets/348),
  and [April 2025 balance report](https://ascension.gg/en/news/april-balance-update/488).
- Current/live Ascension boundary sources: the
  [current homepage](https://ascension.gg/en),
  [realm overview](https://ascension.gg/en/about),
  [realm status](https://ascension.gg/en/status), official
  [Season 10 overview](https://www.youtube.com/watch?v=98nvu-v5ruA),
  [Bronzebeard launch overview](https://www.youtube.com/watch?v=Q6Yg37OpR34),
  and [Conquest of Azeroth release overview](https://www.youtube.com/watch?v=pIPOCauIHKw).
- Live 2026 Ascension articles and changelogs:
  [July 28 Season 10 corrections](https://ascension.gg/en/changelog/2026?page=26),
  [August 2–4 stacking corrections](https://ascension.gg/en/changelog/2026/08/04),
  [Shadows over Blackrock](https://ascension.gg/en/news/warcraft-reborn-shadows-over-blackrock/529),
  [mid-February Worldforged update](https://ascension.gg/en/news/mid-february-updates-heroic-world-bosses-worldforged-upgrades-and-more/525),
  [Raid Trials specification](https://ascension.gg/en/news/warcraft-reborn-march-updates-new-world-boss-mythic-11-15-alterac-valley-raid-trials-blood-bowl-and-more/526),
  [August 16 cache suppression](https://ascension.gg/cs/changelog/2026/05/19),
  [August 18 Worldforged cost cap](https://ascension.gg/en/changelog/1?page=4),
  and [August 24 Mythic vendor](https://ascension.gg/en/changelog/2026/07/30).
- Historical/pre-release Ascension design evidence: Bronzebeard's
  [July 2025 Alpha design](https://ascension.gg/en/news/bronzebeard-warcraft-reborn-the-next-chapter-unfolds/497)
  and Conquest of Azeroth's
  [2023 talent overhaul](https://ascension.gg/en/news/conquest-of-azeroth-talent-overhaul/425),
  [January 2025 beta](https://ascension.gg/en/news/conquest-of-azeroth-january-open-beta-test/482),
  [March 2025 beta](https://ascension.gg/en/news/conquest-of-azeroth-march-open-beta-test/485), and
  [June 2025 final beta](https://ascension.gg/en/news/conquest-of-azeroth-june-open-beta-test/492).
- Current Ascension release timelines:
  [Bronzebeard](https://ascension.gg/en/timeline/bronzebeard),
  [Vol'jin](https://ascension.gg/en/timeline/voljin),
  [Dawnrise](https://ascension.gg/en/timeline/dawnrise), and
  [Darkmoon](https://ascension.gg/en/timeline/darkmoon).
- Supergiant's [Pact redesign](https://www.supergiantgames.com/blog/hades-superstar-update-patch-notes/)
  and [Pact enemy-perk changes](https://www.supergiantgames.com/blog/hades-the-nighty-night-update-patch-notes/).
- Mega Crit's [Ascension announcement](https://steamcommunity.com/games/646570/announcements/detail/1665638172195983578)
  and [levels 16–20 update](https://steamcommunity.com/games/646570/announcements/detail/1706188954889923898).
- Monster Train's official [Last Divinity overview](https://www.themonstertrain.com/dlc/the-last-divinity).

### Community sources used only for labelled illustrations

- [Flash Gaming Wiki SS2 equipment/weapon catalogue](https://flashgaming.fandom.com/wiki/Swords_And_Sandals_2).
- Armor Games SS2 build discussion and walkthrough,
  [page 2](https://armorgames.com/community/thread/1798141/swords-and-sandals-2-guide-needed?page=2)
  and [page 3](https://armorgames.com/community/thread/1798141/swords-and-sandals-2-guide-needed?page=3).
- [Emperor Antares community entry](https://swordsandsandals.fandom.com/wiki/Emperor_Antares).
- [Current Dawnrise discussion](https://www.reddit.com/r/ProjectAscension/comments/1vue32s/why_is_dawnrise_almost_dead/),
  used only for conflicting player perceptions of class-point constraints, not
  as population telemetry.

## Open verification items

- Exact fingerprinted-build champion levels, stats, inventories, AI, and final
  campaign level.
- Complete player equipment acquisition curve and whether every ordinary
  Champion piece is available at the community-listed gate in this build.
- Runtime golden for the attacker-shield bombard/snipe adjustment.
- Fingerprinted campaign/tournament `fight_mode`; ordinary arena `duel`
  first-blood behaviour must not be silently projected onto it.
- Full stamina costs and spatial timing needed to rank actions globally.
- The user's exact Torchlight II mod stack beyond confirmed Synergies.
- Exact live Season 10 gates/weights after ongoing hotfixes, and an accessible
  mechanical specification for the 2026-08-30 "Ascendancy I" release.
- Current-live verification of Bronzebeard's Alpha-described enchantment-slot
  limits and enemy trailing/cap rules.
- Which CoA pre-release talent/CC structures survived unchanged into the live
  realms, and whether CoA has any current progression/loot bad-luck protection
  distinct from Bronzebeard's systems.
