# SS2 staging runbook — one runnable command per uncaptured candidate

Companion to [the staging guide](ss2-capture-staging.md) (what each scenario
*is*) and [the runtime-capture workflow](ss2-runtime-capture.md) (how a session
*runs*). This page answers the third question: **for each candidate that is not
yet a golden, what exactly do I type?**

Scope: the **33** committed candidates in `test/fixtures/ss2-1v1/` that have no
counterpart in `test/fixtures/ss2-1v1-golden/`. (55 candidates, 22 promoted.)

Evidence markers are the staging guide's: **verified** = observed in a real
session against the licensed build; **byte-verified** = decoded opcode by
opcode from the installed SWF in this document; **inferred** = derived from
byte-verified behaviour but never run; **open** = not settled, with the test
that would settle it named. Nothing below is asserted from a capture that has
not happened.

---

## 0. The armour-staging answer

**Staging defender armour WILL be honoured by `damagecharacter`. The armoured
family does not need a different staging point.** The reason
`hitpoints: 999` changed nothing is a different mechanism, and it is not the
one the handoff's open question guessed at.

All offsets below are in `swords_sandals2_download.swf`,
SHA-256 `77CB545C2061AB41246251467A4EDF5926AB6FD1DDD95DC9527D7BA9C45BB8CA`,
read in place with `tools/inspect-swf.mjs`.

### 0.1 The damage path reads `game.<side>` live, at roll time

Four byte-verified links, and one runtime link that closes the chain.

**1 — `game_attacker` / `game_defender` are references, rebound per attack.**
Inside the phase machine (`sprite:862[overlay]/frame:52/DoAction@0x240c7f`),
immediately before the roll:

```text
+0x2b92  game_attacker = <root>.game.villain
+0x2ba3  game_defender = <root>.game.hero        // villain attacking
+0x2c08  game_attacker = <root>.game.hero
+0x2c19  game_defender = <root>.game.villain     // hero attacking
```

Both are plain `GetMember` results — object references, not copies. Nothing is
snapshotted at battle construction, and there is no overlay-side shadow object.

**2 — `damagecharacter` reads and writes every operand through that reference.**
With `register:3 = game_defender` (the function header is
`damagecharacter(defender, attacker, game_defender, game_attacker,
damage_method, attack_direction)`):

```text
+0x17cd  game_defender.armourclass > 0                 ← live GetMember
+0x17e8  game_defender.armourclass_temp = armourclass
+0x17f5  game_defender.armourclass = armourclass - damage
+0x1809  if (!(armourclass < 0)) skip the overflow rewrite
+0x1841  damage = damage - game_defender.armourclass_temp   (overflow remainder)
+0x18df  game_defender.hitpoints = hitpoints - damage
+0x18f3  stamina block reads game_defender.breastplate
```

**3 — the critical-deflection threshold reads the raw piece levels live**, at
`+0x3048`:

```text
deflect_needed = get_percentage(100 - game_defender.helmet * 1.5
                                    + game_defender.greaves, 100)
```

This is the operand mix `candidate-deflection-threshold-discriminator` exists
to discriminate, and it reads the same live object.

**4 — `remove_armour(whichcharacter, whichavatar, attack_direction)`** subtracts
the piece's defence from both pools live (helmet arm shown; every piece arm is
the same shape):

```text
+0x033c  whichcharacter.armourclass     -= whichcharacter.helmet_defence
+0x0352  whichcharacter.armourclass_max -= whichcharacter.helmet_defence
```

with the equipped test (`helmet != 0`, `+0x0320`) taken *after* the
`randomBetween(1, 2)` group draw at `+0x02f3` — which is exactly what
`golden-probe-armour-removal-gate-{below,above}` measured.

**5 — the runtime link.** The wrapper installs `Object.watch` on
`_level1.game.hero` / `_level1.game.villain` (`sweepFieldWatches`, and
`dumpSide` reads the same objects), and `stepStaging` writes to those same two
objects via `gameObject(side)`. A watch fires only on the object it is
installed on — and `test/observations/ss2-1v1/obs-pw1.json` records

```json
{ "sequence": 1, "path": "/villain/hitpoints", "before": 10, "after": -13,
  "reason": "damagecharacter" }
```

So the object `damagecharacter` mutates **is** the object `stepStaging` writes.
That is the chain closed at both ends: statically from the bytes, and
empirically from twelve promoted kill goldens.

### 0.2 Why `hitpoints: 999` did nothing

`hitpoints` is not an independent field. `check_stats(whichcharacter)`
(overlay `+0x10e4`) is a pure **clamp**, and it never raises a value:

```text
+0x111a  if (!(staminaleft  < staminamax))     staminaleft  = staminamax
+0x1143  if (!(staminaleft  > 0))              staminaleft  = 0
+0x116c  if (!(hitpoints    < hitpointsmax))   hitpoints    = hitpointsmax   ← here
+0x1195  if (!(hitpoints    > 0))              hitpoints    = 0
+0x11be  if (!(armourclass  < armourclass_max)) armourclass = armourclass_max
+0x11e7  if (!(armourclass  > 0))              armourclass  = 0
```

It has **eleven** call sites. Two of them settle the question:

- `nextphase` calls `check_stats(game_attacker)` at `+0x35bb` — **every phase
  transition**;
- `damagecharacter` calls `check_stats(game_defender)` at `+0x193c` —
  **immediately before the defeat gate at `+0x195e`**.

And `hitpointsmax` is not stageable either. `battlevalues(whichcharacter)`
(`root/frame:35/DoAction@0x3fa9dc`) recomputes it at `+0x378e` as
`herolevel * 10 + vitality * 20`, and `nextphase` calls
`battlevalues(game_attacker)` at `+0x35eb` **and** `battlevalues(game_defender)`
at `+0x3605` — both combatants, every phase transition.

So a staged `hitpoints 999` survives until the next `check_stats`, which clamps
it to the re-derived `hitpointsmax`. At the instant the defeat gate reads the
pair, `check_stats` ran one instruction earlier. **`hitpoints` and
`hitpointsmax` are not levers; `herolevel` and `vitality` are.**

The same mechanism, same function, explains `min_damage 300` / `max_damage 400`:

```text
+0x3356  min_damage = round(strength * 2) + weapon_min_damage
+0x3386  max_damage = round(strength * 2) + weapon_max_damage
+0x31be  weapon_min_damage = _root["weapon" + <side>.weapon][3]     (max is [4])
```

all **outside** any guard, so all recomputed on every phase transition. This
confirms the handoff's suspicion for those two fields and extends it to
`hitpointsmax` and `staminamax` (`+0x37b6`, `100 + stamina * 10`).

One thing this does **not** explain, and should not be claimed to: staging
`strength 100` *does* stick (it is a raw stat `battlevalues` only reads), and it
does raise `min_damage` to `200 + weapon_min_damage`. The most likely reason
that still lost is that the hit *chance* was never staged —
`attack_chances` computes `round(((attack + 9) / (defence + 9)) * 100 * 0.50)`
clamped to 1–99, and a hero left at `attack 1` against a boss with high
`defence` lands almost nothing however hard he hits. That is **open**: a
one-bout probe staging `attack` alongside `strength` settles it. The
byte-level half — that `min_damage` was recomputed — is byte-verified.

### 0.3 The decisive part: what `battlevalues` does *not* recompute

The armour/hitpoint refill block at `+0x3a90` is guarded:

```text
+0x3a90  if (<root>.battle_started == true) goto +0x3bf8      // skip everything below
+0x3aa5  hitpoints       = round(hitpointsmax)
+0x3ac3  armourclass_max = breastplate_defence + helmet_defence + shinguard_defence
                         + greaves_defence + shoulderguard_defence
                         + gauntlet_defence + boot_defence + shield_defence
+0x3b0f  armourclass     = armourclass_max
+0x3b1c  if (!(staminaleft > 0)) staminaleft = staminamax
```

`stepStaging` writes only while `_global.battle_started == true`, so it is past
this guard. **`armourclass` and `armourclass_max` are therefore never
re-derived after staging**; a staged value survives every `nextphase` for the
rest of the bout. That is precisely why the armour family is stageable and the
hitpoint family is not.

The corollary that decides the command lines: because `armourclass_max` is
**not** re-summed mid-battle, staging the raw pieces alone does nothing to the
absorbing pool. **You must stage `armourclass` and `armourclass_max`
explicitly, alongside the pieces.**

Conversely the per-piece `<piece>_defence` fields *are* recomputed
unconditionally, outside the guard, at `+0x3480`–`+0x3600`:

```text
breastplate_defence   = round(breastplate   * breastplate_dval)     dval 16
helmet_defence        = helmet > 25 ? round(herolevel * 0.5 * helmet_dval)
                                    : round(helmet * helmet_dval)   dval 10
shinguard_defence     = round(shinguard     * shinguard_dval)       dval  6
greaves_defence       = round(greaves       * greaves_dval)         dval  3
shoulderguard_defence = round(shoulderguard * shoulderguard_dval)   dval  8
gauntlet_defence      = round(gauntlet      * gauntlet_dval)        dval  5
boot_defence          = round(boot          * boot_dval)            dval  2
shield_defence        = using_bow ? 0 : round(shield * shield_dval) dval 12
```

(dvals read at `+0x3089`–`+0x30f0`; the `helmet > 25` arm at `+0x34a7` is new to
the record and irrelevant at the levels the fixtures use.) So a staged
`<piece>_defence` is overwritten — but every committed fixture's value already
equals `piece × dval` (helmet 6 → 60, shoulderguard 1 → 8, greaves 2 → 6,
boot 6 → 12, shield 2 → 24, breastplate 7 → 112, …), so the overwrite is a
no-op. **Stage the raw piece. Stage `<piece>_defence` too, only because ingest
projects it and the wrapper must dump it.**

### 0.4 Stageability verdict, field by field

| Field | Stageable mid-battle? | Why (byte-verified) |
| --- | --- | --- |
| `strength`, `attack`, `defence`, `charisma`, `magicka`, `herolevel`, `vitality`, `stamina` | **yes, stable** | raw stats; `battlevalues` only ever reads them (no `SetMember` to any of these names in the function) |
| the eight raw armour pieces | **yes, stable** | raw equipment; only `remove_armour` writes them |
| `armourclass`, `armourclass_max` | **yes, stable** | the re-derivation sits behind the `battle_started == true` guard at `+0x3a90` |
| `<piece>_defence` | overwritten with `round(piece × dval)` | `+0x3480`–`+0x3600`, unconditional. Stage the piece; stage the defence value as well for the dump |
| `staminaleft` | **yes**, at or below `staminamax` | `check_stats` clamps down only |
| `hitpoints` | **no** — survives at most to the next `check_stats` | clamped down to `hitpointsmax` at `+0x116c`, from eleven call sites |
| `hitpointsmax` | **no** | `+0x378e`, `herolevel * 10 + vitality * 20`, unconditional |
| `staminamax` | **no** | `+0x37b6`, `100 + stamina * 10`, unconditional |
| `min_damage`, `max_damage` | **no** | `+0x3356`/`+0x3386`, `round(strength * 2) + weapon_min/max_damage` |
| weapon damage spread | **no** via damage fields | `_root["weapon" + <side>.weapon][3]/[4]`; only `weapon` (an id) is settable |
| `gladiator_dir` | **no** | it lives on the fighter **clip**, not the stat object (`dumpSide` comment, runtime-verified), and `-Stage*` coerces every value with `Number()` |

**Practical rule: stage inputs, not outputs.** Anything in the "no" rows must be
produced by staging its input, or by bringing a gladiator that already has it.
`end.staged` is read back off the live object at `finishTrace`, and ingest
refuses when it disagrees with the armed-window state dump — so a field you
staged and the game re-derived surfaces as a **refusal**, not a silent
mismatch. That is the safety net; do not lean on it as a plan.

### 0.5 One writer that is *not* yet accounted for

Overlay `+0x8e2c`–`+0x8f00` restores `game_attacker` wholesale from a backup:

```text
+0x8e3a  game_attacker.armourclass = game_attacker.armourclass_max
+0x8e7d  game_attacker.breastplate = game_attacker.backup_breastplate
+0x8e93  game_attacker.helmet      = game_attacker.backup_helmet
         … every piece, plus backup_weapon and backup_shield
```

`backup_char` / `restore_char` (root frame 35, `+0x2df5` / `+0x2f73`) are the
named pair; this is an inlined third copy. **Its trigger is not identified in
this pass — record it as open.** It matters only for the attacker side, so it
cannot touch a staged *defender* while the hero attacks; the one fixture it
could bite is `candidate-snipe-shield-boost`, which stages hero `shield 10`.
It is also almost certainly an end-of-bout path, and the wrapper closes its
trace on the first `checkattackroll` return, long before that.

---

## 1. The two capture vehicles, and the gap between them

This is the single most important operational fact on the page, because it is
not in any existing document.

| Script | `-StageHero` / `-StageVillain` | `-WatchFields` | `-Autopilot` | snapshot guard |
| --- | :---: | :---: | :---: | :---: |
| `run-arena.ps1` | **yes** | **no** | no | takes the snapshot itself, refuses without a fresh name |
| `run-capture.ps1` | **no** | **yes** | yes | none |
| `run-campaign.ps1` | **no** | **no** | yes | none |
| `launch-capture.ps1` | **yes** | **yes** | yes | **none** |

**No wrapper script exposes both staging and watch fields.** A fixture that
stages a `<piece>_defence` name AND needs a staged opponent must be run through
`launch-capture.ps1` directly, with the snapshot taken by hand first:

```powershell
powershell -File tools\runtime-capture\save-state.ps1 snapshot <fresh-name>
```

`launch-capture.ps1`'s own header warns against calling it directly on the
arena route precisely because it has no snapshot guard. Taking the snapshot
yourself is the substitute. **Restore the base snapshot between every attempt** —
`run-arena.ps1` deliberately does *not* restore on retry, and a tournament win
advances `tournament_ranking`, which re-binds `game.villain` to a different
ladder object.

### 1.1 `-WatchFields` is additive; the default omits the defence names

The wrapper's `DEFAULT_WATCH_FIELDS` is 28 names — the 18 projected state keys
plus `attack, defence, strength, charisma, magicka, min_damage, max_damage,
hitpointsmax, staminamax, ammo_left`. `-WatchFields` is concatenated onto it,
de-duplicated. `gladiator_dir` is dumped separately from the fighter clip and
never needs listing.

Ingest refuses a trace whose staged dump lacks a field the fixture stages:

```text
Capture trace line <N>: the staged villain state is missing the required field helmet_defence.
```

**Exactly nine of the 33 need extra watch fields.** Everything else runs on the
default list:

| Fixture | `-WatchFields` |
| --- | --- |
| `candidate-armoured-removal-destroys-helmet` | `helmet_defence,shoulderguard_defence` |
| `candidate-armoured-removal-destroys-shoulderguard` | `helmet_defence,shoulderguard_defence` |
| `candidate-armour-removal-debris` | `helmet_defence,shield_defence` |
| `candidate-armour-equality-quirk` | `boot_defence` |
| `candidate-deflection-threshold-discriminator` | `helmet_defence,greaves_defence` |
| `candidate-snipe-shield-boost` | `shield_defence` |
| `candidate-armour-overflow-burning` | `equipped_weapon,weapon_enchantment_type,weapon_enchantment_potency` |
| `candidate-frozen-enchantment-proc` | `equipped_weapon,weapon_enchantment_type,weapon_enchantment_potency` |
| every `candidate-spell-*` that stages a defence name | see §9 |

None of `candidate-armoured-deflection-threshold-{cleared,critical}`,
`candidate-armoured-equality-quirk` or the three `candidate-tournament-*` needs
any — they stage `armourclass_max` and the raw pieces only. **Five of the eight
immediate targets run on `run-arena.ps1` unmodified.**

### 1.2 Attack direction is not controllable — budget for it

`makeRandomBetweenMaker` is a diagnostic passthrough; the tape is served at the
`Math.random` tap and **only while armed**:

```actionscript
function tappedRandom() {
    if (!armed) return originalMathRandom();
    ...
}
```

Arming happens at `attack_chances` (once `attack_direction` is already a
number) or at `checkattackroll` — both *after* the phase machine has drawn the
direction. `normal_attack` draws `randomBetween(5, 8)` at `+0x61f1`, so a
direction-5 fixture matches roughly **1 bout in 4**. With the two-observation
promotion gate that is ~8 successful bouts per fixture, plus attrition:

- the wrapper has **no attacker-side gate** in `beginAction` — if the villain
  swings first, the trace arms on the villain's attack and diverges on the
  mutation paths. Retry.
- `run-arena.ps1 -Attempts N` relaunches only for `battle-lost` and
  `special-event-screen`. A wrong-direction bout is a clean `CAPTURED` with a
  divergence report; it costs a manual restore-and-rerun.

### 1.3 Family naming for `campaign.mjs`

Membership is `candidate-<family>` exactly, or `candidate-<family>-<rest>`. All
the pairs below (`armoured-deflection-threshold-*`,
`armoured-removal-destroys-*`, `tournament-boundary-*`) differ only in one
injected sample and share `attackDirection 5`, so a two-member family both
collides on the action key and disagrees about its tape. **Always run these as
one-member families**, using the full fixture id as `--family`:

```powershell
node tools/runtime-capture/campaign.mjs ingest-round `
  --family armoured-deflection-threshold-cleared `
  --session <sessionId> --observation <observationId>
```

`launch-capture.ps1` derives the tape from `-FixturePath` itself
(`capture-session.mjs tape --fixture …`); you never pass a tape.

---

## 2. The reference gladiator, and why the fixtures fit it

The five `candidate-armoured-*` and three `candidate-tournament-*` all share
one hero block:

```text
attack 1  defence 1  strength 10  charisma 1  magicka 1
min_damage 21  max_damage 23
hitpoints 300  hitpointsmax 300
staminaleft 105  staminamax 110
armourclass 0  armourclass_max 0   gladiator_dir right
```

Run that through §0.4 and it decodes to a specific gladiator, not an arbitrary
one:

| Fixture value | Required input | Note |
| --- | --- | --- |
| `min_damage 21`, `max_damage 23` at `strength 10` | `weapon_min_damage 1`, `weapon_max_damage 3` | the **starting** weapon. Do **not** pass `-ShopWeapon` |
| `hitpointsmax 300` | `herolevel * 10 + vitality * 20 == 300` | at `herolevel 4`: **`vitality 13`** |
| `staminamax 110` | `stamina 1` | the tutorial value |
| `staminaleft 105` | five walks from 110, or stage it | matches the goldens' observed drift |
| `armourclass_max 0` | all eight pieces 0 | do **not** pass `-ShopArmour` |
| `attack/defence/charisma/magicka 1`, `strength 10` | untouched tutorial values | a **vitality-only** levelling leaves exactly these |

That is snapshot **`level4-vitality-tournament-gate`** — a vitality-only
gladiator at level 4 with the starting kit. **The fixtures were authored to it.**
The hero side therefore wants to be *real*, not staged, and the whole
`hitpoints`-clamp problem disappears with it: root frame 214 full-heals the
hero at battle construction, so `hitpoints == hitpointsmax` before staging ever
runs.

> **Open, and it must be checked before the first run.** The handoff records
> that snapshot as "vitality 13, 220 hitpoints". Those two cannot both be true:
> `herolevel 4 + vitality 13` gives `hitpointsmax 300`, and `220` needs
> `vitality 9`. One passive run settles it —
> `run-arena.ps1 -ArenaCapture never -ArenaTarget tournament` reports the
> hero's fields, or add `-WatchFields vitality,herolevel` on a
> `launch-capture.ps1` run. If it reads 220, spend the remaining vitality
> points through the game's own level-up screen, or add `vitality:13` to
> `-StageHero` and accept the clamp race in §10.

**Villain arithmetic for the same family**, by the same rules
(`randomise_gladiator` builds the ladder at the hero's own `herolevel`, so
`herolevel 4` for every generated opponent):

| Fixture value | Required input |
| --- | --- |
| `hitpointsmax 80` | `herolevel 4` + **`vitality 2`** |
| `staminamax 110` | `stamina 1` |
| `armourclass_max 79` | helmet 6 (60) + shoulderguard 1 (8) + greaves 2 (6) + gauntlet 1 (5) — **and staged directly**, because §0.3 |
| `armourclass_max 22` | helmet 2 (20) + boot 1 (2) — same |
| `defence 3` | staged raw |

The chance the fixtures encode falls straight out:
`round(((1 + 9) / (3 + 9)) * 100 * 0.50) = 42`, `rollNeeded 58`, injected
`hit-roll 100`. That is the fixtures' own `expected.calculation`, and it is why
`hero.attack 1` and `villain.defence 3` are both load-bearing.

**Every projected field must be staged, including zeroes.** Ingest projects
`Object.keys(fixture.scenario.villain)` from the dump, and `expected.state`
compares all 18 projected keys per side. A generated ladder opponent that turns
up wearing a breastplate and a shield will fail the final-state comparison
unless those pieces are staged to `0`.

---

## 3. Family A — `candidate-armoured-*` (5). Immediate target.

Tournament bout, staged opponent, direction 5, `normal_attack`. All five share
the §2 hero and differ only in the villain's armour and one injected sample.

| Fixture | Villain scenario | Injected discriminator | Extra watch |
| --- | --- | --- | --- |
| `armoured-deflection-threshold-cleared` | defence 3, hp 80/80, ac 79/79, helmet 6, shoulderguard 1, greaves 2, gauntlet 1 | deflection roll **93** = threshold 93 → `criticalCleared: true`, method `normal`, 22 to armour | — |
| `armoured-deflection-threshold-critical` | identical | deflection roll **92** → critical survives, bypasses armour, 22 to hitpoints | — |
| `armoured-equality-quirk` | defence 3, hp 80/80, ac 22/22, helmet 2, boot 1 | damage 22 vs armour 22 → armour to 0 **and** 22 to hitpoints | — |
| `armoured-removal-destroys-helmet` | ac 79/79, helmet 6 (`helmet_defence 60`), shoulderguard 1 (`shoulderguard_defence 8`), greaves 2, gauntlet 1 | removal roll 67, selection **1** → helmet destroyed, then 19 armour / 3 hitpoints | `helmet_defence,shoulderguard_defence` |
| `armoured-removal-destroys-shoulderguard` | identical | selection **2** → shoulderguard destroyed | `helmet_defence,shoulderguard_defence` |

**Reachability: reachable now.** The blocker the staging guide recorded for
Group C — "villain-side armour is not stageable" — is lifted twice over: the
tournament field can be inspected before you commit, and `-StageVillain`
overwrites whatever `randomise_gladiator` drew. Because *every* projected field
is staged, the opcode-driven generator no longer matters: the two-observation
gate is reachable even though the draw is not.

The two `-StageVillain` strings (deflection/removal trio, then the quirk):

```text
ARM79 = defence:3,herolevel:4,vitality:2,stamina:1,hitpoints:80,staminaleft:105,
        armourclass:79,armourclass_max:79,
        helmet:6,shoulderguard:1,breastplate:0,gauntlet:1,greaves:2,shinguard:0,boot:0,shield:0

ARM22 = defence:3,herolevel:4,vitality:2,stamina:1,hitpoints:80,staminaleft:105,
        armourclass:22,armourclass_max:22,
        helmet:2,shoulderguard:0,breastplate:0,gauntlet:0,greaves:0,shinguard:0,boot:1,shield:0
```

(one line, no spaces, when you type it).

### Commands

The three with no extra watch fields run on `run-arena.ps1`:

```powershell
# candidate-armoured-deflection-threshold-cleared  (repeat for -critical)
powershell -File tools\runtime-capture\save-state.ps1 restore level4-vitality-tournament-gate
powershell -File tools\runtime-capture\run-arena.ps1 `
  -SessionId session-adc1 -ObservationId obs-adc1 `
  -Snapshot adc1-pre `
  -ArenaTarget tournament -ArenaCapture always `
  -FixturePath test\fixtures\ss2-1v1\candidate-armoured-deflection-threshold-cleared.json `
  -StageVillain "defence:3,herolevel:4,vitality:2,stamina:1,hitpoints:80,staminaleft:105,armourclass:79,armourclass_max:79,helmet:6,shoulderguard:1,breastplate:0,gauntlet:1,greaves:2,shinguard:0,boot:0,shield:0"

node tools/runtime-capture/campaign.mjs ingest-round `
  --family armoured-deflection-threshold-cleared --session session-adc1 --observation obs-adc1
```

```powershell
# candidate-armoured-equality-quirk — same shape, ARM22, --family armoured-equality-quirk
```

The two removal fixtures need `-WatchFields`, so they go through
`launch-capture.ps1`:

```powershell
powershell -File tools\runtime-capture\save-state.ps1 restore level4-vitality-tournament-gate
powershell -File tools\runtime-capture\save-state.ps1 snapshot arh1-pre
powershell -File tools\runtime-capture\launch-capture.ps1 `
  -SessionId session-arh1 -ObservationId obs-arh1 `
  -FixturePath test\fixtures\ss2-1v1\candidate-armoured-removal-destroys-helmet.json `
  -Navigate arena -ArenaTarget tournament -ArenaCapture always -ArenaPolicy aggressive `
  -FrameRate 960 -SkipPipeline `
  -WatchFields "helmet_defence,shoulderguard_defence" `
  -StageVillain "defence:3,herolevel:4,vitality:2,stamina:1,hitpoints:80,staminaleft:105,armourclass:79,armourclass_max:79,helmet:6,shoulderguard:1,breastplate:0,gauntlet:1,greaves:2,shinguard:0,boot:0,shield:0"

node tools/runtime-capture/campaign.mjs ingest-round `
  --family armoured-removal-destroys-helmet --session session-arh1 --observation obs-arh1
```

Repeat each with a fresh `SessionId`/`ObservationId` until two sessions match;
restore the base snapshot between every attempt.

### What could go wrong (family A)

1. **Direction attrition, ~3 bouts wasted in 4.** §1.2. This is the dominant
   cost, not the staging.
2. **The villain swings first** and the trace arms on his attack. Divergence,
   retry.
3. **`hitpoints`/`hitpointsmax` clamp race.** Staging `vitality:2` and
   `hitpoints:80` together is correct only if `battlevalues(villain)` runs
   before the last `check_stats(villain)` in the staging window. `stepStaging`
   re-applies for 20 frames, which makes it likely and not certain. Failure is
   an ingest **refusal** naming the field, not a silent match. **inferred.**
4. **`armour-selection-1` is a `randomBetween(1, 2)` in the tape** — injected,
   so the helmet/shoulderguard split is deterministic once armed. The gate roll
   67 is injected too. Nothing here depends on luck beyond the direction.
5. **The ladder object is aliased**, `game.villain = game["villain" + (ranking − 1)]`
   (arena route §3). Staging mutates the ladder entry, which persists for the
   rest of that tournament. Restore the snapshot; never chain two captures in
   one ladder.
6. **`gladiator_dir`** is observed, not staged. If a bout starts with reversed
   facing the fixture diverges. No evidence it ever has.

---

## 4. Family B — `candidate-tournament-*` (3). Immediate target.

The defeat gate's first-blood term, now that `fight_mode == "tournament"` is
reachable. Same hero, direction 5, `normal_attack`, no extra watch fields.

| Fixture | Villain scenario | Injected discriminator | Expects |
| --- | --- | --- | --- |
| `tournament-nonlethal-normal-hit` | defence 3, hp 80/80, **ac 0/0**, no pieces | damage roll 22 | 22 straight to hitpoints, **no result event** — the whole point |
| `tournament-boundary-at-max` | defence 3, hp 80/80, ac 22/22, helmet 2, boot 1 | damage roll **21** | armour 22 → 1, hitpoints untouched |
| `tournament-boundary-below-max` | identical | damage roll **23** | armour 22 → −1, 1 hitpoint, clamp to 0 |

**Reachability: reachable now**, and cheaper than family A — the first two need
only the tournament mode plus a stripped or lightly armoured opponent.
`tournament-nonlethal-normal-hit` is the single cheapest capture in the whole
uncaptured set: it stages no armour at all, so the only staging is stripping
the generated opponent.

```text
ARM00 = defence:3,herolevel:4,vitality:2,stamina:1,hitpoints:80,staminaleft:105,
        armourclass:0,armourclass_max:0,
        helmet:0,shoulderguard:0,breastplate:0,gauntlet:0,greaves:0,shinguard:0,boot:0,shield:0
```

```powershell
powershell -File tools\runtime-capture\save-state.ps1 restore level4-vitality-tournament-gate
powershell -File tools\runtime-capture\run-arena.ps1 `
  -SessionId session-tn1 -ObservationId obs-tn1 -Snapshot tn1-pre `
  -ArenaTarget tournament -ArenaCapture always `
  -FixturePath test\fixtures\ss2-1v1\candidate-tournament-nonlethal-normal-hit.json `
  -StageVillain "defence:3,herolevel:4,vitality:2,stamina:1,hitpoints:80,staminaleft:105,armourclass:0,armourclass_max:0,helmet:0,shoulderguard:0,breastplate:0,gauntlet:0,greaves:0,shinguard:0,boot:0,shield:0"

node tools/runtime-capture/campaign.mjs ingest-round `
  --family tournament-nonlethal-normal-hit --session session-tn1 --observation obs-tn1
```

The two boundary fixtures use `ARM22` and `--family tournament-boundary-at-max`
/ `--family tournament-boundary-below-max`.

### What could go wrong (family B)

- Everything in §3, minus the removal-selection point.
- **These three are the first observation of `fight_mode == "tournament"` in
  the archive.** Every capture records the mode for free, so the first
  successful run also retires the `fight-mode-tournament-unobserved` flag on
  eight committed fixtures. Treat a *mode* mismatch here as a finding, not a
  failed run.
- `tournament-boundary-below-max` expects the `armourclass` clamp `−1 → 0`.
  That clamp is `check_stats` at `+0x11e7`, called from `damagecharacter`
  `+0x193c`, inside the armed window — byte-verified, and the same shape as the
  observed `/villain/hitpoints −13 → 0` in `obs-pw1`.

---

## 5. Family C — legacy armour candidates on the tutorial-damage build (6)

`candidate-armour-equality-quirk`, `candidate-armour-overflow-burning`,
`candidate-armour-removal-debris`, `candidate-deflection-threshold-discriminator`,
`candidate-power-critical-armour-bypass`, `candidate-frozen-enchantment-proc`.

These share a **different** hero: `strength 5`, `min_damage 12`,
`max_damage 20`, `hitpoints 60/60`, `staminaleft 20`, `staminamax 100`,
`attack 11`, `defence 11`, `charisma 5`.

| Fixture value | Required input | Reachable? |
| --- | --- | --- |
| `min 12 / max 20` at `strength 5` | weapon `[3]=2, [4]=10` — a **2/10 weapon** | **shop purchase.** The spread is not stageable (§0.4) |
| `hitpointsmax 60` | `herolevel * 10 + vitality * 20 == 60` — e.g. level 2 / vitality 2, or level 4 / vitality 1 | stage `vitality`, or level the gladiator |
| `staminamax 100` | `stamina 0` | the level-4 snapshot has `stamina 1`; stage `stamina:0` |
| `staminaleft 20` | stage directly (clamped down only) | yes |
| `attack 11 / defence 11` | stage directly | yes |

**Reachability: reachable, but each needs a weapon the archive has not
identified.** `weapon_min_damage = _root["weapon" + hero.weapon][3]` is a table
lookup on a numeric id, so there are two routes and neither is verified:

- **cheap and untested** — stage the id: `-StageHero weapon:<n>`. `battlevalues`
  then derives the spread from the table. Risk: `weapon` also drives the
  on-screen sprite and `weapon_range`; range matters only to `psyche_up` and
  `cast_whirlwind`. **inferred, never run.**
- **safe and slow** — buy it: `-StageGold <g> -ShopWeapon <highest id to try>`,
  which steps down until the game accepts one.

Either way, **pin the id first with one throwaway passive run — on the prisoner
route, not the arena one.** `stepStaging` is not arena-gated, the tutorial fight
arms in about seven seconds, and it is the one route measured save-neutral
(`ss2_data.sol` byte-identical, 679 bytes, SHA-256 `6A06E9E8…`):

```powershell
powershell -File tools\runtime-capture\launch-capture.ps1 `
  -SessionId session-wsweep -ObservationId obs-wsweep `
  -FixturePath test\fixtures\ss2-1v1\candidate-normal-threshold-hit.json `
  -Navigate prisoner -Autopilot 'walkright*5,normal_attack' `
  -Passive -SkipPipeline -FrameRate 960 `
  -WatchFields "weapon,weapon_min_damage,weapon_max_damage,vitality,herolevel,stamina" `
  -StageHero "weapon:<n>"
```

`-Passive` serves no tape but still arms, so the `state` dump at `beginAction`
reports the derived spread for id `<n>`. Read `weapon_min_damage` /
`weapon_max_damage` out of the raw log; sweep `<n>` until you find `2` / `10`.
One sweep pins the whole family. **Do this before planning any Family C
session** — it is the single unknown standing between six fixtures and a
command.

`-ShopWeapon` is the alternative, but it only runs inside the arena navigator,
so the buy route costs a full arena session per id. Prefer the staged sweep for
discovery and the shop only if staging `weapon` turns out not to hold.

Per-fixture, once the weapon is known:

| Fixture | Also needs | Mode | Extra watch |
| --- | --- | --- | --- |
| `armour-removal-debris` | villain ac 34/34, helmet 1 (`helmet_defence 10`), shield 2 (`shield_defence 24`); 12 damage fully absorbed | **any** — no hitpoint damage, so the defeat gate never opens | `helmet_defence,shield_defence` |
| `armour-equality-quirk` | villain ac 12/12, boot 6 (`boot_defence 12`) | tournament (full damage also lands on hitpoints) | `boot_defence` |
| `armour-overflow-burning` | hero `equipped_weapon 1`, enchantment type 2 potency 5; villain **`armourclass 12` of `armourclass_max 16`**, breastplate 1 | tournament | `equipped_weapon,weapon_enchantment_type,weapon_enchantment_potency` |
| `deflection-threshold-discriminator` | villain ac 106/106, helmet 10 (`helmet_defence 100`), greaves 2 (`greaves_defence 6`); injected deflection **85**, threshold 87 | tournament | `helmet_defence,greaves_defence` |
| `power-critical-armour-bypass` | direction **9** — `power_attack`; villain ac 16/16, breastplate 1 | tournament | — |
| `frozen-enchantment-proc` | hero enchantment type 3 potency 5, unarmoured villain | tournament | `equipped_weapon,weapon_enchantment_type,weapon_enchantment_potency` |

Three notes that change the plan:

- **`armour-removal-debris` is the cheapest of the six** and is mode-agnostic:
  its 12 damage is fully absorbed by 34 armour, so it needs no tournament at
  all. It could in principle run on the prisoner route — except the prisoner is
  unarmoured and the prisoner route has no staging script (`run-capture.ps1`
  has no `-Stage*`). So it too goes through `launch-capture.ps1`.
- **`armour-overflow-burning` stages `armourclass 12` below `armourclass_max 16`.**
  That is now trivially stageable (§0.3) rather than requiring "one extra
  uncontrolled exchange to wear the armour", which is what the staging guide
  assumed. Same for `candidate-grievous-knockback`'s `4 of 16`.
- **`power-critical-armour-bypass` is direction 9**, and the arena route's
  `aggressive` policy only ever issues `normal_attack` (`arenaPolicyStep`
  returns `normal_attack` whenever the close-range controller offers it). Reach
  the power band by passing an explicit autopilot **and** an empty policy:
  `-Autopilot 'walkright*5,power_attack' -ArenaPolicy ''`. **inferred** — the
  wrapper's own line 558 only defaults the policy when the autopilot list is
  empty, so this should work, but no session has driven the arena route from an
  autopilot.

Enchanted weapons (`weapon_enchantment_type` 2 and 3) are the other open item:
they are hero-side equipment, so they are either a shop purchase or a staged
numeric field, and staging them is untested. `enchant_weapon`
(`sprite:2023/frame:1`) is the game's own path.

---

## 6. Family D — tournament-only, no equipment problem (5)

`candidate-normal-threshold-hit`, `candidate-normal-miss-roll-order`,
`candidate-quick-threshold-profile`, `candidate-lethal-result`,
`candidate-taunt-charisma-floor`. Same `strength 5` hero as Family C, so the
same 2/10 weapon question applies to all five.

| Fixture | Direction | Villain | Mode needed | Verdict |
| --- | --- | --- | --- | --- |
| `normal-threshold-hit` | 5 | unarmoured, hp 40/40, attack 11 / defence 11 | tournament | **reachable** once the weapon is pinned |
| `normal-miss-roll-order` | 5 | armourclass 12/12, hp 40/40 | **any** — injected roll 49 misses, empty mutation trace | **reachable**, and the cheapest of the five: three tape samples, nothing mutates |
| `quick-threshold-profile` | **2** | unarmoured, hp 40/40 | tournament | **reachable**, but needs `-Autopilot 'walkright*5,quick_attack' -ArenaPolicy ''` (quick band is directions 1–4, so ~1 bout in 4 again) |
| `lethal-result` | 5 | **hp 12 of 40** and already **`burning`** | tournament | **reachable now.** `hitpoints` below max is a clamp-down, so `hitpoints:12` stages cleanly; `burning:true` is a boolean the `Number()` parse turns into `NaN` — see the blocker below |
| `taunt-charisma-floor` | **20** (`taunt`) | charisma 30 | tournament | **open** — see below |

**`candidate-lethal-result` has a staging-syntax blocker.** `parseStageList`
does `Number(pair[1])`, so `-StageVillain "burning:true"` writes `NaN`, and
`end.staged` then fails the observation grammar
`^(hero|villain)\.([a-z][a-z0-9_]{0,63})=(-?…|true|false)$` and ingest refuses
the whole trace. `burning:1` writes the number 1, which the wrapper's
`normalizeFieldValue` may or may not normalise to `true` — **unverified**.
Options, in order of honesty: (a) let the game set `burning` by taking one
uncontrolled exchange against an enchanted opponent before the armed action —
uncontrollable; (b) verify whether `burning:1` round-trips as `true`, with one
passive run and `-WatchFields` on nothing extra (burning is already default);
(c) a one-line wrapper change to pass `true`/`false` through unconverted —
**out of this document's ownership; report it, do not make it.**
`candidate-spell-first-blood-duel` and `candidate-spell-lethal-slain` stage
boolean statuses too, so this blocker is shared by three fixtures.

**`candidate-taunt-charisma-floor` is still open**, and this pass narrows it
rather than settling it. The map's assignment table gives `taunt` a fixed
`attack_direction = 20` at `+0x6981` followed by `checkattackroll`, so it
*should* arm and *should* draw the mapped `randomBetween(1, 3)` floor. But the
taunt phase reaches that site only when `taunt_effect = randomBetween(1, 2)`
returns 1 (`+0x6952`) — and that draw happens **before** arming, so it is
uninjectable: half of all taunts never reach the dispatcher at all. Add the
`taunt_percentage` comparison at `+0x694b` and the 60-tick `taunttimer`
watchdog at `+0x67e4`, and a taunt capture is a coin flip on top of the usual
attrition. One unattended round with
`-Autopilot 'taunt' -ArenaPolicy ''` records `attack_direction` passively and
settles whether it arms at all. Do that before planning a session for it.

---

## 7. Family E — ranged and bash (3)

`candidate-bombard-threshold` (21), `candidate-snipe-shield-boost` (22),
`candidate-bash-inherited-critical` (23).

**Reachability: conditional, and the gate is weaker than the staging guide
recorded but still real.** All three live on archer controller frames, and the
arena construction action forces `equipped_weapon = 1` / `using_bow = false`
for every fight. The only manual flip is the inventory overlay's
`swap_inventory.onRelease → getphase("swap_weapons")`, which is hidden unless
the hero owns a **secondary weapon of any kind**.

| Fixture | Staging | Blocker |
| --- | --- | --- |
| `bombard-threshold` | unarmoured both sides; tournament; damage from `secondary_min/max_damage`; the ranged phase decrements `ammo_left` | secondary weapon + one `swap_weapons` turn. `-Autopilot 'swap_weapons,bombardright'` — **inferred**, the wrapper passes unrecognised labels through to `getphase` |
| `snipe-shield-boost` | **hero** `shield 10`, `shield_defence 120`, kept equipped in bow mode | same, plus **open**: `battlevalues` scores `shield_defence = 0` while `using_bow` (`+0x35e2`), yet the chance boost reads `game_attacker.shield` (the raw level). The fixture stages both, so both must survive. Also the one fixture exposed to the §0.5 attacker-restore block. `-WatchFields shield_defence` |
| `bash-inherited-critical` | `scenario.transient.criticalhit = 20` must survive from a previous action; tournament | **open** — whether `shove` (wired on `closerange_warrior` *and* `closerange_archer`) is the other direction-23 producer. If it is, this fixture needs no bow at all. One round with `-Autopilot 'walkright*5,shove'` settles it; `attack_direction` is recorded passively |

Buying a ranged item is gated on the **speed/Agility** attribute, not on level
(arena route §6), so `-StageGold` plus `-ShopWeapon <id>` is the route — and,
per §5, the id sweep has to happen first.

---

## 8. Family F — `candidate-grievous-knockback` (1)

Direction 30, via the `psyche_up` discharge chain. Hero `strength 9` with a
2/10 weapon (`min 20 / max 28`); villain breastplate 1, hp 50/50,
**`armourclass 4` of `armourclass_max 16`**; tournament.

Two of the four historical blockers are now gone:

- the mid-battle worn armour (`4 of 16`) is **directly stageable** (§0.3), not a
  matter of engineering an extra exchange;
- direction 30 has a `getphase` label and every controller wires it.

Two remain:

1. **Three uninterrupted `psyche_up` turns.** Any non-`psyche_up` hero decision
   resets the counter through `nextphase` (`+0x35e0`), and **any damage the hero
   takes** resets it through `damagecharacter` (`+0x1be4`). Autopilot
   `walkright*5,psyche_up,psyche_up,psyche_up` with `-ArenaPolicy ''`; one
   connecting blow from the opponent restarts the count. The hero's 300
   hitpoints help him survive it but do not stop the reset.
2. **Open — does the `herolevel` gate bind an autopilot?** The gate hides the
   *button* below `herolevel 7` on warrior controllers, while the phase machine
   never consults the controller frame. The level-4 snapshot sits between the
   two readings, so this fixture is the test. The wrapper's readiness model
   assumes the button gate binds and would report a stall.

**Verdict: reachable in principle, unproven in practice.** Do not schedule it
before the `psyche_up` probe above returns.

---

## 9. Family G — the two duel candidates (2)

`candidate-duel-firstblood-normal-kill` (direction 8),
`candidate-duel-absorbed-normal-hit` (direction 5).

**The staging guide's verdict on these is now wrong, and this is a correction
worth recording.** It concluded that "neither Group B fixture has a route to
the two-observation promotion gate", because `randomise_gladiator` builds the
duel opponent from `RandomNumber` opcode draws the wrapper can neither record
nor inject. That reasoning was sound when the wrapper could only observe. It is
not sound now: **ingest projects exactly `Object.keys(fixture.scenario.villain)`,
and `-StageVillain` can write every one of them.** The generator's output is
overwritten before the action arms, so the draw stops mattering.

One genuine obstacle survives, and it is the §5 weapon problem on the *villain*
side:

| Fixture | Villain `min_damage` / `max_damage` | Implied weapon |
| --- | --- | --- |
| `duel-absorbed-normal-hit` | 8 / 16 at `strength 2` | `[3]=4, [4]=12` |
| `duel-firstblood-normal-kill` | 8 / 20 at `strength 2` | `[3]=4, [4]=16` |

Those two fields are recomputed from `strength` and `weapon`, so they cannot be
staged directly — the villain's `weapon` id must be staged instead, and the
table is unmapped. **Same sweep as §5, applied to `-StageVillain weapon:<n>`.**
Everything else in both blocks (attack, defence, strength, hp, stamina,
armourclass, armourclass_max, helmet, shield) is directly stageable.

The hero side is the `strength 7`, `min 18 / max 26` build with
`greaves 4 + boot 4` (`armourclass_max 20`) — a third weapon spread (`[3]=4,
[4]=12`) and a shop armour purchase.

Reaching `fight_mode == "duel"` needs the duel button visible, i.e.
`herolevel < tournament_level_required`: **a level-4 gladiator cannot duel.**
Use `-ArenaTarget level:<n>` on a *lower*-level snapshot, or accept that this
family needs a second gladiator. That is the real cost, not the opponent.

**Verdict: reachable in principle for the first time, but behind two unmapped
weapon ids and a second gladiator. Lowest priority of the reachable set.**

---

## 10. Family H — the eight `candidate-spell-*` (8)

**Unreachable today. This is the one group whose blocker is a tooling gap, not
a staging requirement**, and one part of the record needs correcting.

- **Corrected:** the staging guide's blocker 1 says "the trace carries no
  `spell_id` … ingest refuses the trace". The wrapper now emits it, in
  `beginAction`, reading `overlay.spell_id` then `_global.spell_id`. That
  blocker is closed.
- **The real blocker:** the wrapper emits **no `magic-damage` event**.
  `deriveExpectedEventsFromSs2Fixture` pushes `{ type: "magic-damage", … }` for
  every fixture carrying `scenario.spellId`, and ingest keys the death dispatch
  on `events.some(e => e.type === "magic-damage")`. The
  `magic_damage_character` hook is registered with the label
  `"damagecharacter"` and emits nothing:

  ```actionscript
  registerSlot(function () { return overlayClip(); }, "magic_damage_character",
               makeHookMaker("damagecharacter"));
  ```

  A spell trace therefore cannot produce the event it needs, and falls into the
  physical dispatch arm besides.
- **Arming never happens on a cast.** `beginAction()` is called from exactly two
  sites — `attack_chances` (with a numeric `attack_direction`) and
  `checkattackroll`. `magic_damage_character` runs through neither, and
  `check_spells` is hooked without arming. So the recording window never opens.
- **No autopilot route to a hero-side cast** (the `cast_*` strings are
  `phase_decision` labels with no `getphase` entry point), and **villain casts
  cannot be forced** (`villain_cast_spells` rolls an inclusive 1–100 and enters
  its chain only above 10 — an uninjectable pre-arm draw).

Beyond the tooling, three of the eight carry staging problems this document can
already name:

| Fixture | Staging problem |
| --- | --- |
| `spell-first-blood-duel` | stages `hero.taunted1 = true`, `villain.burning = true` — the `Number()` blocker of §6 |
| `spell-lethal-slain` | stages `hero.poison = true`, `villain.taunted2 = true` — same, plus `attackerSide: villain` |
| `spell-raw-fractional-damage` | stages `villain.armourclass 90.5`. `Number("90.5")` parses, so the *write* works — but the fixture is flagged `synthetic-fractional-armour` and no mapped route produces a fractional `armourclass` in play. Staging it is now the only known route, which makes this fixture **newly reachable in principle** if the ingress is ever armed |

**Verdict: 8 of 8 blocked on the wrapper, not on staging.** The smallest fix is
an event emission on the `magic_damage_character` hook plus an arming site;
both are wrapper edits and neither is this document's to make.

---

## 11. Scoreboard

| Group | Count | Verdict |
| --- | ---: | --- |
| A `candidate-armoured-*` | 5 | **reachable now**, commands in §3 |
| B `candidate-tournament-*` | 3 | **reachable now**, commands in §4 |
| C legacy armour | 6 | reachable once one weapon id is pinned (§5) |
| D tournament-only, no equipment | 5 | 3 reachable once the weapon is pinned; `lethal-result` blocked on boolean staging; `taunt-charisma-floor` open |
| E ranged / bash | 3 | conditional — secondary weapon plus an unproven `swap_weapons` autopilot |
| F grievous | 1 | conditional — `psyche_up` chain unproven |
| G duel | 2 | **newly reachable in principle** (staging overrides the generator); needs two unmapped weapon ids and a second, lower-level gladiator |
| H spell | 8 | **blocked in the wrapper** — no `magic-damage` event, no arming site |

**8 reachable with the tooling exactly as it stands. 9 more behind one
read-only weapon-table sweep. 8 behind a wrapper change. 8 open or
conditional.**

Fixtures that **cannot** be staged as written, and what each needs instead:

| Fixture | Needs |
| --- | --- |
| `candidate-lethal-result`, `candidate-spell-first-blood-duel`, `candidate-spell-lethal-slain` | `-Stage*` to pass `true`/`false` through unconverted, or proof that `burning:1` normalises to `true` |
| all 8 `candidate-spell-*` | a `magic-damage` event and an arming site on the spell ingress |
| `candidate-taunt-charisma-floor` | proof that direction 20 arms at all (`taunt_effect` is drawn pre-arm) |
| `candidate-grievous-knockback` | proof that `getphase("psyche_up")` works below `herolevel 7` |
| `candidate-bash-inherited-critical` | either a secondary weapon, or proof that `shove` produces direction 23 |
| Families C, D, G | the `_root["weapon" + n]` table's `[3]`/`[4]` values |

---

## 12. Unverified — do not treat as established

Everything in this section is stated because it is load-bearing and unproven,
not because it is likely.

1. **The `level4-vitality-tournament-gate` hitpoint figure.** The handoff's
   "vitality 13, 220 hitpoints" is internally inconsistent with the
   byte-verified `hitpointsmax = herolevel * 10 + vitality * 20`. §2.
2. **The clamp race inside the 20-tick staging window.** Whether
   `battlevalues(side)` runs before the final `check_stats(side)` after the last
   staging tick. Failure mode is an ingest refusal, not a silent match. §3.
3. **`-Autopilot` on the arena route.** No session has driven `-Navigate arena`
   from an autopilot with `-ArenaPolicy ''`. Needed by every non-`normal_attack`
   direction. §5, §6, §7, §8.
4. **`-StageHero weapon:<n>` / `-StageVillain weapon:<n>`.** Never run. The
   field is read by `battlevalues` at `+0x31be`, so it should work; the sprite
   and `weapon_range` side effects are unexamined. §5.
5. **`burning:1` → `true` normalisation.** §6.
6. **The trigger of the attacker armour-restore block at overlay `+0x8e2c`.**
   Identified as existing and as operating on `game_attacker`; not traced to a
   caller. §0.5.
7. **Why the staged champion bout still lost.** The `min_damage` recomputation
   is byte-verified; the "hit chance was never staged" explanation is not. §0.2.
8. **`shield_defence` under `using_bow`.** `battlevalues` `+0x35e2` scores it 0,
   the chance boost reads the raw `shield`; `candidate-snipe-shield-boost`
   stages both and no session has run one. §7.
9. **Whether direction 20 arms.** §6.
10. **Whether `remove_armour` zeroes the raw piece field** as well as
    subtracting its defence. The fixtures assert it (`/villain/helmet 1 → 0`);
    the write was not located in this pass. It affects only whether a second
    removal roll can re-destroy a piece.
