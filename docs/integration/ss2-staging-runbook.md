# SS2 staging runbook — one runnable command per uncaptured candidate

Companion to [the staging guide](ss2-capture-staging.md) (what each scenario
*is*) and [the runtime-capture workflow](ss2-runtime-capture.md) (how a session
*runs*). This page answers the third question: **for each candidate that is not
yet a golden, what exactly do I type?**

Scope: the **38** committed candidates in `test/fixtures/ss2-1v1/` that have no
counterpart in `test/fixtures/ss2-1v1-golden/`. (60 candidates, 22 promoted.)

The five `candidate-champion-*` fixtures landed after the rest of this page was
written; they are **§2A**, inserted between §2 and §3 rather than appended, so
the highest-priority family is not last. Every other section number is unchanged
on purpose — `ss2-capture-staging.md` links to §0, §0.3, §3, §9 and §10 of this
file by number, and renumbering would silently break four references in a
document this one does not own.

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

## 1. The capture vehicles, and the gap between them

This is the single most important operational fact on the page.

| Script | `-StageHero` / `-StageVillain` | `-WatchFields` | `-Autopilot` | snapshot guard |
| --- | :---: | :---: | :---: | :---: |
| `run-arena.ps1` | **yes** | **yes** | **no** | takes the snapshot itself, refuses without a fresh name |
| `run-capture.ps1` | no | yes | yes | none |
| `run-campaign.ps1` | no | no | yes | none |
| `launch-capture.ps1` | **yes** | **yes** | yes | **none** |

Every cell is a `param(...)` declaration in the named script and nothing else.
`campaign.mjs` derives the same three capability columns the same way rather
than from a table (`captureVehicles`, which regexes each launcher's own
`param(...)` block), so `campaign.mjs plan --family <f>` is the authority and
this table is a convenience that can go stale. Check it before a session.

**`run-arena.ps1` now exposes `-WatchFields`, and it is the only script that
carries staging, watch fields and a snapshot guard together.** That retires this
section's original headline — "no wrapper script exposes both staging and watch
fields" — which was true when it was written and is now false. A fixture that
stages a `<piece>_defence` name AND needs a staged opponent no longer has to be
hand-snapshotted through `launch-capture.ps1`, provided it wants the normal
attack band; see the remaining gap below.

**Why the guard did not move the other way.** The alternative was to put
`run-arena.ps1`'s snapshot guard onto `launch-capture.ps1` and keep driving the
staged-plus-watched fixtures from there. It was not taken, and the reason is
worth recording because it is a defect class this project has already paid for
once. `launch-capture.ps1` is the shared bottom layer: `run-campaign.ps1` drives
it at `-Concurrency 3` with per-session `-SaveDirectory` stores that provably
mutate nothing — three concurrent sessions completed and the master
`ss2_data.sol` was byte-identical afterwards. A guard there would demand a fresh
restore point from runs that touch no save, so it would have to be **opt-out**,
and an opt-out gate is exactly what the launch-nonce forgeries walked through.
Keeping the guard on `run-arena.ps1` alone preserves the invariant instead: the
one save-mutating script is the one that snapshots, and it snapshots itself
rather than trusting an operator to remember.

### 1.0 The gap did not close — it moved to `-Autopilot`

`run-arena.ps1` exposes no `-Autopilot`, hard-codes `-Navigate arena`, and does
not forward a step list; and `arenaPolicyStep` returns `normal_attack` whenever
the close-range controller offers it, **whatever string `-ArenaPolicy` carries**
(the policy name is only ever tested for emptiness). So the arena route as
`run-arena.ps1` drives it produces the **normal band, directions 5–8, and
nothing else**.

Any arena fixture wanting the quick band (1–4), the power band (9–12), `taunt`
(20), `psyche_up` (30) or `swap_weapons` still has to go through
`launch-capture.ps1`, with the snapshot taken by hand first:

```powershell
powershell -File tools\runtime-capture\save-state.ps1 snapshot <fresh-name>
```

`launch-capture.ps1`'s own header warns against calling it directly on the
arena route precisely because it has no snapshot guard. Taking the snapshot
yourself is the substitute. **Restore the base snapshot between every attempt** —
`run-arena.ps1` deliberately does *not* restore on retry, and a tournament win
advances `tournament_ranking`, which re-binds `game.villain` to a different
ladder object.

The smallest change that would remove what is left of the gap is an
`-Autopilot` passthrough on `run-arena.ps1`, forwarded to the launcher exactly
as `-WatchFields` now is. **Out of this document's ownership: reported, not
made.** Ten uncaptured candidates are waiting on it: three of the five
`candidate-champion-*` (directions 1, 9, 9), `power-critical-armour-bypass` (9),
`quick-threshold-profile` (2), `taunt-charisma-floor` (20),
`grievous-knockback` (30), and all three of Family E (21, 22, 23).
See §2A, §5, §6, §7 and §8.

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

**Twenty of the 38 need extra watch fields**: the eight below, the five
`candidate-champion-*` (§2A, eleven names each), and seven of the eight
`candidate-spell-*` (§10). Everything else runs on the default list. Do not
copy these by hand — `campaign.mjs watch-fields --family <f>` derives the set
from the fixture's own staged keys and the wrapper's default list, so it is
right by construction for a fixture that does not exist yet:

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
any — they stage `armourclass_max` and the raw pieces only.

**All eight immediate targets now run on `run-arena.ps1`.** The two
`armoured-removal-destroys-*` fixtures were the pair this page previously sent
through `launch-capture.ps1` with a hand snapshot; `-WatchFields` on
`run-arena.ps1` retires that detour. All eight are attack direction 5, so none
of them needs the `-Autopilot` that `run-arena.ps1` still does not have.

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

- **Correction: the wrapper does have an attacker-side gate now.** This page
  previously said `beginAction` had none and that a villain-first swing would
  arm on the villain's attack. `captureAllowedNow` compares
  `game_attacker == game.hero` against the declared `attackerSide` and refuses
  with `capture-refused-wrong-side`, on every route, *before* the arming latch —
  so it can still arm on a later action. The failure mode is therefore not a
  mislabelled trace. It is that the villain's swing may have **landed** first,
  so when the wrapper does arm, the state dump carries a damaged hero and the
  fixture diverges on `hitpoints` / `armourclass`. Retry either way.
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
| `staminaleft 105` | stage it — **nothing in the map derives it** | transcribed from one capture; see the note below |
| `armourclass_max 0` | all eight pieces 0 | do **not** pass `-ShopArmour` |
| `attack/defence/charisma/magicka 1`, `strength 10` | untouched tutorial values | a **vitality-only** levelling leaves exactly these |

**Corrected — the warrant for `staminaleft 105` was circular.** This row used to
say the value *"matches the goldens' observed drift"*. The goldens are where the
number came from, so that warrant reduces to "105 because 105". The actual
provenance, from the repository's own record:

1. The map-derived prediction for the prisoner bout was a **full bar**. The
   committed
   `test/fixtures/ss2-1v1-divergences/provisional-prisoner-kill--obs-20260830-t1-6bf4f120.json`
   records `/scenario/hero/staminaleft` **expected 110, actual 105** and
   `/scenario/villain/staminaleft` **expected 100, actual 95**.
2. The prisoner candidate was then re-authored to the runtime's numbers, and
   `golden-prisoner-normal-kill` carries hero `105/110`, villain `95/100`.
3. These eight arena fixtures were created de novo in `6fd3884` with a hero
   block identical to `candidate-prisoner-normal-kill`'s, same key order,
   differing in exactly two fields (`hitpoints` and `hitpointsmax`, 30 → 300) —
   so their 105 is that same measured number, carried across from a different
   route, a different mode and a different gladiator
   level. Their **villain's** 105 is the hero's number duplicated; nothing
   observed a villain at 105, and the villain table below has no `staminaleft`
   row to warrant one.

So `105` is a measurement, honestly obtained, that has been used far outside the
bout that produced it. It is not derivable: `battlevalues` refills `staminaleft`
only when it is already `<= 0` (`+0x3b1c`, §0.2's clamp table), the per-phase
arithmetic is charged to `game_attacker` only, and the value therefore depends
on each side's own turn count in the specific bout. Stage it, and treat a
divergence on it as expected rather than as a failed run — six committed arena
divergence reports already carry one
([capture-staging, Group H](ss2-capture-staging.md)).

That is snapshot **`level4-vitality-tournament-gate`** — a vitality-only
gladiator at level 4 with the starting kit. **The fixtures were authored to it.**
One row above is not part of it: `staminaleft` is bout state, not saved
gladiator state — `restore_char` (root frame 35, `DoAction@0x3fa9dc`) holds
none of the build's 42 `staminaleft` references — so a snapshot cannot
pin it, and the other rows should not be read as though it could.
The hero side therefore wants to be *real*, not staged, and the whole
`hitpoints`-clamp problem disappears with it: root frame 214 full-heals the
hero at battle construction, so `hitpoints == hitpointsmax` before staging ever
runs.

> **Resolved since this was written; no probe needed.** This page recorded the
> handoff's "vitality 13, 220 hitpoints" as an inconsistency, because
> `herolevel 4 + vitality 13` gives 300 and 220 needs `vitality 9`. The handoff
> now carries the explanation: **220 is what the level-up log printed because
> `battlevalues` last ran *before* the points were spent**, and the formula
> gives 300 at the moment the bout is constructed — which is the moment these
> fixtures describe. `vitality 13` and `hitpointsmax 300` are both right. Do
> **not** add `vitality:13` to `-StageHero` to "fix" a 220 reading; the reading
> is stale, not the gladiator, and staging it would buy the §3 clamp race for
> nothing. §12 item 1 is retired.

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

## 2A. Family I — `candidate-champion-*` (5)

The tournament rank-1 opponent, decoded from `unleash_hell`'s hard-coded DNA in
[`ss2-champion-dna.md`](ss2-champion-dna.md). Numbered 2A because it was added
after the rest of the page and the other section numbers are load-bearing (see
the scope note at the top).

**The `-WatchFields` blocker is gone.** Every one of the five stages the whole
per-piece `<piece>_defence` set plus the enchantment pair — eleven names the
default watch list omits — and until `run-arena.ps1` gained `-WatchFields`, the
only script exposing both that and `-Stage*` was `launch-capture.ps1`, which has
no snapshot guard. That was the reason the handoff recorded this family as
unable to go through `run-arena.ps1`, and it no longer holds.

**A second blocker survives it, and it is not the same one.** `run-arena.ps1`
forwards no `-Autopilot`, so it can only produce the normal attack band (§1.0).
**Two of the five are direction 5 and run on the guarded vehicle today; the
other three are directions 1, 9 and 9 and still need `launch-capture.ps1` with
a hand snapshot.** Do not read "the champion family is unblocked" as "all five".

### 2A.1 The vehicle split, by attack band

`run-arena.ps1` can only produce the normal band (§1.0), so the family divides:

| Fixture | Direction | Band | Vehicle |
| --- | ---: | --- | --- |
| `candidate-champion-normal-armour-absorbed` | 5 | normal | **`run-arena.ps1`** |
| `candidate-champion-deflection-threshold-discriminator` | 5 | normal | **`run-arena.ps1`** |
| `candidate-champion-quick-armour-absorbed` | 1 | quick | `launch-capture.ps1` + hand snapshot |
| `candidate-champion-power-armour-overflow` | 9 | power | `launch-capture.ps1` + hand snapshot |
| `candidate-champion-power-hat-removal` | 9 | power | `launch-capture.ps1` + hand snapshot |

The three in the lower rows need `-Autopilot 'walkright*5,quick_attack*20'` or
`'walkright*5,power_attack*20'` with `-ArenaPolicy ''`, and `run-arena.ps1`
forwards no step list. (Those are `getphase` labels, wired by
`closerange_warrior`; the hero always starts on a warrior controller because
root frame 221 forces `equipped_weapon = 1` and `using_bow = false`.) Note the
`*20`: `arenaResetAutopilot` rewinds `autopilotIndex` to 0 at every bout, but
within a bout a step list that runs out leaves the hero standing still, and the
ladder is **three** bouts — ranks 3 and 2 have to be won before the champion is
bound. A single trailing `power_attack` would attack once per bout and then
stall. **inferred; no session has driven the arena route from a step list.**

### 2A.2 Staging

One string, from [`ss2-champion-dna.md` §6.2](ss2-champion-dna.md), staging
**inputs only** so that `battlevalues` re-deriving them mid-bout is a fixed
point rather than a race:

```text
-ArenaStagedLevel 5
-StageHero "herolevel:5,experience:0,strength:30,speed:2,attack:3,defence:3,vitality:10,charisma:1,magicka:1,stamina:5,weapon:24,secondary_weapon:0,weapon_enchantment_type:0,weapon_enchantment_potency:0,helmet:0,shoulderguard:0,breastplate:0,gauntlet:0,greaves:0,shinguard:0,boot:0,shield:0"
```

There is **no `-StageVillain`**: the champion is built from a DNA string
literal with no RNG in the chain, which is the whole reason this family exists.

Three things about that string worth knowing before typing it:

- **`-ArenaStagedLevel` must equal the staged `herolevel`, and for this family
  that is 5, not 4.** `captureAllowedNow` refuses to arm unless
  `hero.herolevel == arenaStagedLevel` and `staminaleft == staminamax`; a
  mismatch is a `capture-refused-unstaged` line, not a bad trace. The
  `.EXAMPLE` block in `run-arena.ps1` shows `-ArenaStagedLevel 4` with no
  `-StageHero` for `candidate-champion-normal-armour-absorbed`; that pairing
  cannot produce the fixture's hero (`hitpointsmax 250` needs `herolevel 5` and
  `vitality 10`). **`run-arena.ps1` is not this document's to edit — reported.**
- **`weapon:24` is a table id, not a purchase.** `battlevalues` reads
  `_root["weapon" + hero.weapon][3]/[4]`, and weapon 24 is `8 / 32`
  ([item tables §2.3](ss2-item-tables.md)), so `strength 30` gives exactly the
  fixtures' `min_damage 68` / `max_damage 92`. No `-ShopWeapon`, no `-StageGold`
  — the shop gate for id 24 is `strength >= 12`, which the staging clears, but
  buying it would also cost a town-square trip and persist gold into the save.
  `weapon` is not in the default watch list, so it is never cross-checked
  against the staged dump; the derived `min_damage`/`max_damage` are, and they
  are the real check.
- `speed:2` with `stamina:5` is chosen so the approach walk costs no net
  stamina, which is what lets the wrapper's full-stamina gate pass at all.
  Do not "tidy" either value.

### 2A.3 Commands (the two normal-band members)

```powershell
powershell -File tools\runtime-capture\save-state.ps1 restore level4-vitality-tournament-gate

powershell -File tools\runtime-capture\run-arena.ps1 `
  -SessionId session-champ-n1 -ObservationId obs-champ-n1 `
  -Snapshot champ-n1-pre `
  -ArenaTarget tournament -ArenaCapture champion -ArenaStagedLevel 5 `
  -FixturePath test\fixtures\ss2-1v1\candidate-champion-normal-armour-absorbed.json `
  -WatchFields "boot_defence,breastplate_defence,equipped_weapon,gauntlet_defence,greaves_defence,helmet_defence,shield_defence,shinguard_defence,shoulderguard_defence,weapon_enchantment_potency,weapon_enchantment_type" `
  -StageHero "herolevel:5,experience:0,strength:30,speed:2,attack:3,defence:3,vitality:10,charisma:1,magicka:1,stamina:5,weapon:24,secondary_weapon:0,weapon_enchantment_type:0,weapon_enchantment_potency:0,helmet:0,shoulderguard:0,breastplate:0,gauntlet:0,greaves:0,shinguard:0,boot:0,shield:0"

node tools/runtime-capture/campaign.mjs ingest-round `
  --family champion-normal-armour-absorbed `
  --session session-champ-n1 --observation obs-champ-n1
```

`candidate-champion-deflection-threshold-discriminator` is the identical command
with its own fixture path and `--family champion-deflection-threshold-discriminator`.

**One member per session.** `campaign.mjs plan --family champion` reports two
fixtures claiming direction 5, two claiming direction 9, and five distinct
injectable tapes across five members, so a family run cannot serve them all —
pass the full fixture id as `--family`, as §1.3 says.

`-ArenaCapture champion` rather than `always`: it arms only once
`tournament_ranking <= 2` with `tournament_in_progress`, so the two generated
ladder opponents are fought and not recorded.

**Winning the champion bout is not required.** The wrapper arms on the *first*
`checkattackroll` of that bout and closes the trace on its return, so the
evidence is complete before the fight is decided. Ranks 3 and 2 do have to be
won — that is the cost of the run, and it is paid again on every retry.

### 2A.4 What could go wrong (family I)

1. **Direction attrition inside the one armed action.** `normal_attack` draws
   `randomBetween(5, 8)` before arming, so a direction-5 fixture matches about
   one armed bout in four, and the wrapper arms on the **first**
   `checkattackroll` of the champion bout and closes on its return — one shot
   per ladder. The two ladder wins are paid again on every retry.
2. **The champion swings first.** `captureAllowedNow` refuses on the wrong side
   (`capture-refused-wrong-side`) before the arming latch, so the trace is never
   mislabelled and the wrapper can still arm on the hero's own attack. But the
   champion's swing may have **landed** by then, and the fixtures assert a hero
   at `hitpoints == hitpointsmax`. Expect a divergence on the hero's state
   rather than a bad trace. Note this qualifies `ss2-champion-dna.md` §6.1's
   argument 2 — "a trace that exists at all is a trace in which no earlier hit
   landed" holds only if the wrapper arms on the bout's *first*
   `checkattackroll`, and the wrong-side refusal is exactly the case where it
   does not. **That document is not this one's to edit; recorded here.**
3. **A mid-ladder level-up.** At `herolevel 5` the next requirement is 7500 and
   the two generated opponents pay roughly one `character_xp` each, so it
   should not land — and if it does, `-ArenaStagedLevel 5` makes the gate refuse
   rather than produce a trace no second session reproduces.
4. **The ladder shares one `time_of_day` budget.** A won tournament bout goes to
   `foyer`, never to `townsquare` (arena route §3), so there is no mid-ladder
   reset anchor and GATE A's ceiling has to cover all three bouts. Enter with
   the clock freshly reset.
5. **`fight_mode` is `tournament`, which no committed observation has ever
   recorded** (67 records carry `duel` and `misc`). Treat a *mode* mismatch on
   the first such run as a finding, not a failed run.
6. This is a **save-mutating** route. `run-arena.ps1` snapshots for you; restore
   the base snapshot between attempts, and never chain two captures in one
   ladder — staging mutates the aliased ladder entry.

---

### 2A.5 What the first live run of this command actually did

Run 2026-08-31, `session-champ-n1`, three attempts, `-ArenaStagedLevel 5` with
the §2A.2 staging string. **No capture.** The save was byte-identical before and
after (687 bytes, `2514B1CB`). This section records what the route did, because
it is now evidence rather than prediction, and two of §2A.4's expectations are
wrong.

**The route works.** Attempt 2 beat Hector the Noobhammer (60 hp / 40 ac) and
Severn the Fiend (80 hp / 14 ac) and reached **John the Butcher, 110 hp / 86
ac** — the fifteenth independent sighting of exactly the decoded numbers.
Staging applied at every bout including the champion bout: four `at":"staged"`
lines, one per `battle-ready`, the last at champion-bout tick 20. The per-bout
`stageTicks` reset works.

**It refused to arm, on both gate conditions, for the whole bout:**

```
"step":"capture-refused-unstaged","root":226,"level":4,
  "staminaleft":107,"staminamax":110,"herolevel":4,"stagedLevel":5
```

1. **The staged `herolevel` is written and does not survive.** `stepStaging`
   wrote `hero.herolevel=5` — the `staged` line proves the write — and
   `captureAllowedNow` read **4**, every tick of the bout. This is exactly the
   distinction the wrapper's own comment draws: the `staged` line "says what was
   written; whether it SURVIVED is answered at arming time". The likely cause is
   that `herolevel` is re-derived from `experience`, which §2A.2 stages to 0, so
   staging the two together is self-cancelling. **This is unverified — it is the
   next thing to establish from the bytes, and it should be established before
   the string is edited again.**

2. **The full-stamina gate was never satisfied.** `staminaleft` at the champion
   bout ran 0, 11, 15, 16, 17, 30, 49, 68, 87, **107** — never 110. The approach
   walk alone costs 3, so §2A.2's "speed:2 with stamina:5 … costs no net stamina"
   does not hold across a ladder: `staminaleft` CARRIES across bouts and
   `battlevalues` refills it only when it is already `<= 0`. A hero who arrives
   with anything in the bar cannot pass `staminaleft == staminamax`.

   The refills seen at 0 suggest the only reliable route to a full bar is to
   arrive **empty**, which is the opposite of what the string is tuned for.

**§2A.4's item 3 is wrong in both directions, and the two errors cancel
misleadingly.** It predicts a mid-ladder level-up "should not land". Two runs:

- Unstaged (`arena-champ-2`, `-ArenaStagedLevel 4`, no `-StageHero`): the hero
  **did** level 4 → 5 on the ladder and was refused for `herolevel 5` vs
  `stagedLevel 4`.
- Staged (`session-champ-n1`): `experience:0` suppressed the level-up, the hero
  stayed at 4, and was refused for `herolevel 4` vs `stagedLevel 5`.

So the natural progression produces 5 and the staged one produces 4 — each is
the value the *other* configuration wanted.

**Ladder cost, measured.** Opponents are drawn per entry by
`randomise_gladiator` and the spread is wider than the family can absorb:
attempt 1 drew **Skuld the Fox, 90 hp / armourclass 195** against a hero whose
`min_damage` is 68, and lost immediately. Attempt 3 hit
`ABORT:special-event-screen`. Across the whole archive the drawn range is
`ac` 0–195 and `hp` 30–140, against `John the Butcher` invariant at 110/86 in
all fifteen sightings. Budget several attempts per capture, and note that
**`-Attempts` re-fights the ladder from the snapshot state each time**.

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

All five run on `run-arena.ps1`. The three with no extra watch fields:

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

The two removal fixtures need `-WatchFields`. **This page used to route them
through `launch-capture.ps1` with the snapshot taken by hand; that detour is
retired** — `run-arena.ps1` exposes `-WatchFields` now (§1), so the same guarded
vehicle serves them, and the only difference from the block above is one flag:

```powershell
powershell -File tools\runtime-capture\save-state.ps1 restore level4-vitality-tournament-gate
powershell -File tools\runtime-capture\run-arena.ps1 `
  -SessionId session-arh1 -ObservationId obs-arh1 `
  -Snapshot arh1-pre `
  -ArenaTarget tournament -ArenaCapture always `
  -FixturePath test\fixtures\ss2-1v1\candidate-armoured-removal-destroys-helmet.json `
  -WatchFields "helmet_defence,shoulderguard_defence" `
  -StageVillain "defence:3,herolevel:4,vitality:2,stamina:1,hitpoints:80,staminaleft:105,armourclass:79,armourclass_max:79,helmet:6,shoulderguard:1,breastplate:0,gauntlet:1,greaves:2,shinguard:0,boot:0,shield:0"

node tools/runtime-capture/campaign.mjs ingest-round `
  --family armoured-removal-destroys-helmet --session session-arh1 --observation obs-arh1
```

(`run-arena.ps1` supplies `-Navigate arena`, `-ArenaPolicy aggressive`,
`-FrameRate 960` and `-SkipPipeline` itself; it also takes the snapshot, which
is why `-Snapshot` replaces the two hand `save-state.ps1` calls.)

Repeat each with a fresh `SessionId`/`ObservationId` until two sessions match;
restore the base snapshot between every attempt.

### What twenty-two live rounds showed (family A)

**The wrong-side guard does not protect the arena route, and 9 of 20 armed
captures were mislabelled. CRITICAL, and found live.**

Twenty-two `run-arena.ps1` rounds were run against
`candidate-armoured-deflection-threshold-cleared` on 2026-08-31 (sessions
`session-adc1` … `session-adc22`; twenty armed, one aborted, one produced no
direction). Splitting them by which combatant the first `damagecharacter` write
landed on:

| Who actually swung | n | `attack_direction` values observed |
| --- | ---: | --- |
| hero | 11 | 8, 8, 7, 8, 7, 6, 8, 8, 6, 7, 7 |
| **villain** | **9** | 4, 10, 11, 20, 3, 2, **5**, 20, 10 |

**Every one of the twenty carries `"attackerSide":"hero"` in its meta line, and
`capture-refused-wrong-side` was logged exactly zero times.**

This is the failure `captureAllowedNow`'s own comment calls out by name — "arming
on the villain's swing would file a trace labelled 'hero' that ingest has no way
to contradict: a false observation, which is worse than no observation." The
guard is written correctly but is skipped wholesale on this route:

```
var attacker = gameRoot().game_attacker;
if (attacker != undefined) {          // <-- on the arena route it IS undefined
    ...
    dbg("capture-refused-wrong-side");
```

`game_attacker` is evidently not set at the moment `captureAllowedNow` runs here.
**Correction, 2026-08-31.** Both sentences that stood here were wrong, and they
were mine. I wrote that the guard "is not dead everywhere — six
`capture-refused-wrong-side` lines exist in older prisoner-route captures — so
this is arena-specific." Those six matches are in compiled wrapper SOURCE copies
under `captures/wrapper-cache/` and `captures/vehicle-check/`, not in any trace.
Across 268 archived rufflelogs the refusal appears **zero** times, and the defect
was **universal**, not arena-specific.

The cause was one word in one expression: the guard read
`gameRoot().game_attacker` — `_level1.game_attacker` — and the game never writes
that path. All 296 `game_attacker` references live inside `sprite:862[overlay]`
frames 1 and 52, and the only two writes are bare `SetVariable` instructions
inside `changeCombatants`, which in AVM1 resolve up the scope chain to the clip
that defined the function. The value lives on the **overlay clip** — the same
object the wrapper already reads `attack_direction` from at arming time.

I also proposed `if (attacker == undefined) return false;` as the fix. Applied to
the path as it stood, that would have blocked **every** capture on every route —
21 of 21 armed rounds and all 193 archive captures — because the read never
resolves. Fixing the object had to come first.

**Both are now fixed and the guard is proved to fire in both directions**
(commit `2b483a8`). `stub-game.as` had omitted `game_attacker` entirely, so
`validate-vehicle.ps1` could not exercise the side guard at all — the gate this
project mandates after every wrapper edit never noticed the guard was dead,
because a stub that omits the field a guard reads cannot test that guard, and
its silence reads exactly like a pass. With the stub binding the attacker:

| stub binds | launcher claims | marker | outcome |
| --- | --- | --- | --- |
| hero | hero | `attacker-resolved-hero` | 32 trace lines, MATCH, gate PASSES |
| villain | hero | `capture-refused-wrong-side` | 2 lines, nothing arms, ingest refuses |

The second row is the first observed refusal in the project's history. A run
whose log carries no `attacker-resolved-<side>` line has a dead guard again.

**Two things follow, and the second is the dangerous one.**

1. *The battle map's `randomBetween(5, 8)` for `normal_attack` is confirmed,
   sharply.* All eleven hero swings landed in 6–8 and none outside. The
   out-of-range directions in the archive (2, 3, 4, 10, 11, 20) are the villain's
   attacks, not a wider hero range. Direction 20 in particular belongs to no
   documented hero band.

2. *Direction does NOT discriminate, and must not be used as if it did.*
   `session-adc18` is a villain swing at **direction 5** — inside the hero's own
   range. Its mutation path is `/hero/hitpoints` and its method is `critical`.
   Had the target fixture expected a hero-side mutation, that trace could have
   MATCHED while being attributed to the wrong combatant, and the promotion gate
   needs only two such.

Every one of the nine was in fact caught, by `/mutationTrace/0/path` diverging
(`/villain/armourclass` expected, `/hero/hitpoints` observed). **That is
incidental, not a designed defence.** It holds only because every currently
reachable fixture happens to expect a villain-side mutation.

The fix belongs in `ss2-capture-wrapper.as` and so needs the vehicle gate re-run;
the wrapper was frozen for this session's supervised captures, so this is
reported rather than fixed. The shape it should take is a REFUSAL when the
attacker cannot be identified, not a skip — `if (attacker == undefined) return
false;` — because "I could not tell who swung" and "the right combatant swung"
are the two cases the current code merges, and it merges them in the unsafe
direction. Note that this is the same defect class as the `isNum` trap: an
undefined read taking the permissive branch.

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
| `min 12 / max 20` at `strength 5` | weapon `[3]=2, [4]=10` — a **2/10 weapon** | **no such weapon exists.** See below |
| `hitpointsmax 60` | `herolevel * 10 + vitality * 20 == 60` — e.g. level 2 / vitality 2, or level 4 / vitality 1 | stage `vitality`, or level the gladiator |
| `staminamax 100` | `stamina 0` | the level-4 snapshot has `stamina 1`; stage `stamina:0` |
| `staminaleft 20` | stage directly (clamped down only) | yes |
| `attack 11 / defence 11` | stage directly | yes |

### 5.1 Retraction: the weapon table is decoded, and this hero is not producible

**An earlier revision of this section prescribed a supervised sweep for a 2/10
weapon. Do not run it. It cannot terminate successfully.** The table is no
longer unmapped: all ninety `_root.weapon<n>` literals are decoded in
[`ss2-item-tables.md` §2.3–2.4](ss2-item-tables.md) (commit `df3a122`), and
re-read independently for this revision from the same pinned build.

Three facts settle the family:

1. **No row has `[3] = 2`, and no row has `[4] = 10`** — not in the eighty shop
   ids, not in `weapon0`, not in the nine off-shop ids `201`–`220`. There is
   nothing to sweep for.
2. **The weapon is determined before strength is considered.** `min_damage` and
   `max_damage` share the identical `Math.round(strength * 2)` addend
   (`battlevalues` `+0x3356` / `+0x3386`), so
   `max_damage − min_damage == weapon[4] − weapon[3]` for every strength.
   The fixtures' spread is `20 − 12 = 8`, and **exactly one row in ninety has a
   spread of 8: `weapon41`, `[3]/[4] = 4 / 12`.**
3. Given `weapon41`, `min_damage 12` needs `Math.round(2 × strength) == 8`,
   i.e. **`strength 4`** — one point below the `strength 5` the fixtures carry.
   `strength 5` gives `10 + 4 = 14` and `10 + 12 = 22`, never `12 / 20`.

This is a search with a proof attached rather than a search that has not found
anything yet: the spread invariant leaves no room for a different weapon, and
the shop gate for `weapon41` is `3 × band_position <= hero.strength`, i.e.
`3 <= 4`, so a strength-4 gladiator can actually buy it.

**Reachability: NOT reachable as written. All six assert a hero the build
cannot produce**, and so do five of Family D, all three of Family E and the one
in Family F — fifteen fixtures in total, the same fifteen the handoff records.
The rest of this section is what to run **after** those fixtures are re-derived,
not a plan that can be executed against them today.

**Deliberately not patched here.** Candidates are *supposed to be* derived from
the map and never edited to fit a run — but that is the project's rule, not a
description of the corpus, and it has been broken at least twice already
(§2's `staminaleft 105`, and `candidate-duel-firstblood-normal-kill`, which
sides with the runtime on **all eight** `/scenario` differences in the
divergence report landed in its own commit `74a07a45` and with the map-derived
prediction on **none** — six reproduced by value, and the two where the
prediction said `helmet 2` / `shield 2` and the runtime said `0` dropped from
the villain block outright). Read it as the
standard this edit is being held to, not as a warrant for any number already in
the tree. A one-token strength edit is still an edit, and two of the
fifteen need more than one token anyway (`candidate-grievous-knockback`'s
expected knockback force is itself strength-derived, and the three Family E
members take a different formula — §7). Re-derivation is a fixture change and
**out of this document's ownership: reported, not made.**

The two routes to a weapon, for whatever the re-derived fixtures ask for:

- **stage the id** — `-StageHero weapon:<n>`. `battlevalues` derives the spread
  from the table at `+0x31be` / `+0x31da`. `weapon` is not in the default watch
  list, so it is never cross-checked against the staged dump; the derived
  `min_damage` / `max_damage` are, and they are the real check. Side effects:
  `weapon` also drives the sprite and `weapon_range`
  (`physical_size + [5] * 44`), which matters only to `psyche_up` and
  `cast_whirlwind`. **inferred, never run.**
- **buy it** — `-StageGold <g> -ShopWeapon <highest id to try>`, stepping down
  until the game accepts one. The gate is now mapped and is **not** a level
  gate: `3 × band_position <= hero.speed` for slashing and ranged,
  `<= hero.strength` for hacking and bashing (item tables §3.1). A vitality-only
  level-4 gladiator has base `strength` and `speed`, so **every** item is
  refused — which is exactly what `arena-shop-3` recorded, nine pages walked and
  twenty-five refusals. Stage the governing attribute first or the shop trip is
  wasted.

  > **This whole route mutates the licensed save.** Two separate writes, not
  > one. The purchase itself is persisted, and staging `strength` / `speed` /
  > `charisma` alongside `-ShopWeapon` is written into the **saved** gladiator
  > by the wrapper's town-square block (`staged-hero-town`, `constructDNA()`
  > then flush) — not merely into the bout. So a shop trip permanently changes
  > the gladiator's attributes as well as their inventory and gold.
  >
  > Snapshot first, and prefer `run-arena.ps1`, which refuses to start without a
  > fresh restore point and takes it itself, over `launch-capture.ps1`, which
  > has no snapshot guard. Where the direction forces `launch-capture.ps1`, take
  > the snapshot by hand (§1.0) before the run, not after.

Per-fixture, once the fifteen are re-derived:

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
  has no `-Stage*`). It is attack direction 5, so on the arena route it goes
  through `run-arena.ps1` with `-WatchFields "helmet_defence,shield_defence"`,
  not through `launch-capture.ps1`; the same is true of `armour-equality-quirk`,
  `armour-overflow-burning`, `deflection-threshold-discriminator` and
  `frozen-enchantment-proc`. Only `power-critical-armour-bypass` still needs the
  unguarded vehicle, and only because of its direction.
- **`armour-overflow-burning` stages `armourclass 12` below `armourclass_max 16`.**
  That is now trivially stageable (§0.3) rather than requiring "one extra
  uncontrolled exchange to wear the armour", which is what the staging guide
  assumed. Same for `candidate-grievous-knockback`'s `4 of 16`.
- **`power-critical-armour-bypass` is direction 9**, and the arena route's
  `aggressive` policy only ever issues `normal_attack` (`arenaPolicyStep`
  returns `normal_attack` whenever the close-range controller offers it). Reach
  the power band by passing an explicit autopilot **and** an empty policy:
  `-Autopilot 'walkright*5,power_attack*20' -ArenaPolicy ''`. **inferred** — the
  wrapper defaults the policy to `aggressive` only when the autopilot list is
  empty, so this should work, but no session has driven the arena route from an
  autopilot. Note this forces `launch-capture.ps1` and a hand snapshot:
  `run-arena.ps1` forwards no step list (§1.0). Use the `*20` repeat rather than
  a single trailing `power_attack`; a step list that runs out mid-bout leaves
  the hero standing still.

Enchanted weapons (`weapon_enchantment_type` 2 and 3) are the other open item:
they are hero-side equipment, so they are either a shop purchase or a staged
numeric field, and staging them is untested. `enchant_weapon`
(`sprite:2023/frame:1`) is the game's own path.

---

## 6. Family D — tournament-only, no equipment problem (5)

`candidate-normal-threshold-hit`, `candidate-normal-miss-roll-order`,
`candidate-quick-threshold-profile`, `candidate-lethal-result`,
`candidate-taunt-charisma-floor`. Same `strength 5` hero as Family C — so
**§5.1 applies to all five: the hero is not producible and all five are blocked
on a fixture re-derivation, not on equipment.** The section title is now wrong
about the "no equipment problem"; it is kept only because other documents link
to these section numbers. Everything below is what to run once the hero is
re-derived.

| Fixture | Direction | Villain | Mode needed | Verdict |
| --- | --- | --- | --- | --- |
| `normal-threshold-hit` | 5 | unarmoured, hp 40/40, attack 11 / defence 11 | tournament | blocked on the §5.1 hero; otherwise `run-arena.ps1`, no extra watch fields |
| `normal-miss-roll-order` | 5 | armourclass 12/12, hp 40/40 | **any** — injected roll 49 misses, empty mutation trace | blocked on the §5.1 hero; otherwise the cheapest of the five: three tape samples, nothing mutates |
| `quick-threshold-profile` | **2** | unarmoured, hp 40/40 | tournament | blocked on the §5.1 hero, **and** needs `-Autopilot 'walkright*5,quick_attack*20' -ArenaPolicy ''`, so `launch-capture.ps1` and a hand snapshot (§1.0). Quick band is directions 1–4, so ~1 bout in 4 again |
| `lethal-result` | 5 | **hp 12 of 40** and already **`burning`** | tournament | blocked on the §5.1 hero, **and** on boolean staging. `hitpoints` below max is a clamp-down, so `hitpoints:12` stages cleanly; `burning:true` is refused outright by `parseStageList` — see the blocker below |
| `taunt-charisma-floor` | **20** (`taunt`) | charisma 30 | tournament | **open** — see below |

**`candidate-lethal-result` has a staging-syntax blocker, and this page
previously described the wrong mechanism.** The correction matters because the
two mechanisms fail in opposite directions — one is a loud refusal, the other is
a silent omission.

**What `parseStageList` actually does.** It does *not* write `NaN`. Every pair
is put through `isNum` and a non-numeric value is **refused, not converted**:

```actionscript
if (!isNum(pair[1])) {
    trace("{\"t\":\"dbg\",\"at\":\"stage-refused\",\"field\":\"" + pair[0] +
        "\",\"raw\":\"" + String(pair[1]) + "\",\"why\":\"not-a-number\"}");
    continue;
}
```

The refused pair never enters `stageHeroFields` / `stageVillainFields`, so
`applyStageSide` never writes it, `stagedSummary` never reports it, and it never
appears in `end.staged` at all. There is a second refusal on the same shape:
`herolevel` outside 1–60 is dropped with `"why":"outside-1-60"`, because
`constructDNA` calls the game's own `check_for_nan`, which jumps the root
timeline to `bugs` on a bad `herolevel`, silently repairs `NaN` gold to
`herolevel * 1000`, and resets a bad `statpoints` to 4. A typo in a staging
string is not a no-op in this build; the guard exists so that it is one here.

**So the failure mode is not an ingest refusal.** `-StageVillain "burning:true"`
produces a clean `CAPTURED` run whose villain simply has `burning` unset —
`dumpSide` normalises the undefined status flag to `false` — and the fixture
wants `true`. That surfaces as a **divergence report at `/villain/burning`**,
one line in a trace that otherwise matches. The only warning is a
`{"t":"dbg","at":"stage-refused","field":"burning","raw":"true"}` line, and
`dbg` lines are stripped from the delogged trace before ingest ever sees them
(`capture-session.mjs`), so it exists **only in the raw `.rufflelog`**. Grep for
`stage-refused` in the raw log before ingesting anything staged.

**And `burning:1` does not round-trip either.** This was recorded as unverified;
it is now answerable statically and the answer is no. `normalizeFieldValue` maps
exactly one thing — `undefined` → `false` for the six status flags — and passes
every other value through unchanged, so the staged `1` is dumped as the number
`1`. `finalState.<side>.burning` is then a number where the observation schema
requires a boolean (`PROJECTED_BOOLEAN_KEYS`), and the record is refused at
validation. That is at least a loud failure, but it is still not a capture.

Options, in order of honesty: (a) let the game set `burning` by taking one
uncontrolled exchange against an enchanted opponent before the armed action —
uncontrollable; (b) a one-line wrapper change to pass the literals `true` /
`false` through `parseStageList` unconverted — **out of this document's
ownership; report it, do not make it.** `candidate-spell-first-blood-duel` and
`candidate-spell-lethal-slain` stage boolean statuses too, so this blocker is
shared by three fixtures.

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
`-Autopilot 'taunt*20' -ArenaPolicy ''` records `attack_direction` passively and
settles whether it arms at all. Do that before planning a session for it — and
note it is a `launch-capture.ps1` run with a hand snapshot, because
`run-arena.ps1` forwards no step list (§1.0).

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
| `bombard-threshold` | unarmoured both sides; tournament; damage from `secondary_min/max_damage`; the ranged phase decrements `ammo_left` | secondary weapon + one `swap_weapons` turn. `-Autopilot 'swap_weapons,bombardright*20'` — **inferred**, the wrapper passes unrecognised labels through to `getphase` |
| `snipe-shield-boost` | **hero** `shield 10`, `shield_defence 120`, kept equipped in bow mode | same, plus **open**: `battlevalues` scores `shield_defence = 0` while `using_bow` (`+0x35e2`), yet the chance boost reads `game_attacker.shield` (the raw level). The fixture stages both, so both must survive. Also the one fixture exposed to the §0.5 attacker-restore block. `-WatchFields shield_defence` |
| `bash-inherited-critical` | `scenario.transient.criticalhit = 20` must survive from a previous action; tournament | **open** — whether `shove` (wired on `closerange_warrior` *and* `closerange_archer`) is the other direction-23 producer. If it is, this fixture needs no bow at all. One round with `-Autopilot 'walkright*5,shove*20'` settles it; `attack_direction` is recorded passively |

All three need `-Autopilot`, so all three are `launch-capture.ps1` runs with the
snapshot taken by hand (§1.0) whatever else is settled about them.

Buying a ranged item is gated on the **speed/Agility** attribute, not on level
(arena route §6; item tables §3.1 gives the comparison exactly:
`3 × band_position <= hero.speed`), so `-StageGold` plus `-ShopWeapon <id>` is
the route. No sweep is needed any more — the twenty ranged rows are ids 61–80
and their `[3]/[4]` pairs are tabulated in
[`ss2-item-tables.md` §2.3](ss2-item-tables.md).

### 7.1 All three are blocked on the §5.1 hero, on a *different* formula

These three take the `using_bow` branch, and §5.1's arithmetic has to be redone
for them rather than copied. `battlevalues` builds the secondary pair with
multiplier **1**, not 2 (`+0x33c2`, `+0x33f2`), and the block at `+0x3424` —
entered only when `using_bow` is true — overwrites `min_damage` and
`max_damage` with `secondary_min_damage` / `secondary_max_damage`. So the
fixtures' `12 / 20` at `strength 5` implies a secondary row `[3] = 7`,
`[4] = 15`.

**No row is 7/15**, and the spread invariant is worse here than in §5.1: the
only spread-8 row in the build is `weapon41`, which is *bashing*, and the shop
writes `secondary_weapon` only from the ranged band. The twenty ranged rows have
spreads 12, 20, 30, 42, 56, 72, 90, 110, 132, 156, 182, 210, 240, 272, 306, 342,
380, 420, 462, 506 — **no ranged weapon can produce a spread of 8 at any
strength**. With `weapon41` staged directly into the secondary slot the pair
works at `strength 8` (three points off, not one).

So the §5.1 remedy does not transfer: re-deriving these three by moving
`strength` from 5 to 4 would produce a fixture that is still wrong, because it
fixes the wrong formula. That is a fixture change either way and **out of this
document's ownership: reported, not made.** `candidate-bash-inherited-critical`
is the conditional one — if `shove` also produces direction 23 (still open,
below) it returns to the melee path and §5.1's arithmetic applies to it after
all.

---

## 8. Family F — `candidate-grievous-knockback` (1)

Direction 30, via the `psyche_up` discharge chain. Hero `strength 9` with
`min 20 / max 28`; villain breastplate 1, hp 50/50, **`armourclass 4` of
`armourclass_max 16`**; tournament.

**§5.1 applies here too, and this one needs more than a strength edit.** The
spread is again 8, so the weapon is again `weapon41` (4/12) and the strength
that produces `20 / 28` is **8**, not the 9 the fixture carries. But `strength`
reaches a second expected output in this fixture and only in this one: the
knockback magnitude is `max(20, vanillaDamageRegister + attacker.strength * 6)`,
and the fixture asserts `force 92` = `38 + 9 × 6`. At strength 8 that becomes
86 — still above the 80 animation threshold, so `animation` stays true, but the
asserted force moves. A re-derivation that changed only `scenario.hero.strength`
would trade one unproducible number for another. **Fixture change, reported and
not made.**

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

**Verdict: not reachable as written** — the hero is one of the fifteen (above),
and even after a re-derivation it stays *reachable in principle, unproven in
practice*. Do not schedule it before the `psyche_up` probe above returns. The
probe and the capture are both `launch-capture.ps1` runs with a hand snapshot:
direction 30 needs an autopilot and `run-arena.ps1` forwards none (§1.0).

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

**The weapon obstacle this section recorded is gone.** It said the villain's
`weapon` id had to be staged and "the table is unmapped". The table is mapped
(item tables §2.3, commit `df3a122`), and — unlike Families C–F — **every
combatant in this family resolves to a real row**:

| Fixture | Combatant | `min` / `max` at `strength` | Implied `[3]/[4]` | Weapon id |
| --- | --- | --- | --- | --- |
| `duel-absorbed-normal-hit` | villain | 8 / 16 at 2 | 4 / 12 | **41** (unique) |
| `duel-firstblood-normal-kill` | villain | 8 / 20 at 2 | 4 / 16 | **2**, 21 or 61 |
| both | hero | 18 / 26 at 7 | 4 / 12 | **41** (unique) |

Prefer id **2** over 21 or 61 for the second villain: all three share the same
`[3]/[4]`, none of the three is a projected field, but 61 is ranged and carries
`[5] = 100`, which moves `weapon_range` by four thousand pixels for no benefit.

Those two damage fields are recomputed from `strength` and `weapon`, so they
cannot be staged directly — stage the id: `-StageVillain "…,weapon:41"`.
`weapon` is not in the default watch list, so it never has to survive the
staged-dump cross-check; `min_damage` and `max_damage` do, and they are the
check that matters. **inferred** — staging `weapon` has never been run (§12).
Everything else in both blocks (attack, defence, strength, hp, stamina,
armourclass, armourclass_max, helmet, shield) is directly stageable.

The hero side is the `strength 7`, `min 18 / max 26` build with
`greaves 4 + boot 4` (`armourclass_max 20`) — the same `weapon41`, and a shop
armour purchase. The armour gate is `itemlevel <= hero.herolevel` with
`itemlevel` a step function, so item numbers 2–4 are the ceiling at herolevel
4–5 (item tables §0.4); `greaves 4` and `boot 4` sit exactly at it.

Reaching `fight_mode == "duel"` needs the duel button visible, i.e.
`herolevel < tournament_level_required`: **a level-4 gladiator cannot duel.**
Use `-ArenaTarget level:<n>` on a *lower*-level snapshot, or accept that this
family needs a second gladiator. That is the real cost, not the opponent.

**Verdict: reachable, and the only thing still in the way is the second
gladiator.** The two weapon ids are no longer unmapped, and both fixtures'
combatants are producible — which is worth stating plainly, because this is the
one uncaptured family outside A, B and the champion where that is true. Both are
direction 5 and 8, i.e. the normal band, so both run on `run-arena.ps1` with no
extra watch fields; they just cannot run on the level-4 snapshot.

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
| `spell-first-blood-duel` | stages `hero.taunted1 = true`, `villain.burning = true` — the boolean-staging blocker of §6: `parseStageList` refuses the pair, so the flag is silently left unset and the run diverges rather than being refused |
| `spell-lethal-slain` | stages `hero.poison = true`, `villain.taunted2 = true` — same, plus `attackerSide: villain` |
| `spell-raw-fractional-damage` | stages `villain.armourclass 90.5`. `Number("90.5")` parses, so the *write* works — but the fixture is flagged `synthetic-fractional-armour` and no mapped route produces a fractional `armourclass` in play. Staging it is now the only known route, which makes this fixture **newly reachable in principle** if the ingress is ever armed |

**Verdict: 8 of 8 blocked on the wrapper, not on staging.** The smallest fix is
an event emission on the `magic_damage_character` hook plus an arming site;
both are wrapper edits and neither is this document's to make.

---

## 11. Scoreboard

| Group | Count | Verdict |
| --- | ---: | --- |
| A `candidate-armoured-*` | 5 | **reachable now**, commands in §3, all five on `run-arena.ps1` |
| B `candidate-tournament-*` | 3 | **reachable now**, commands in §4 |
| I `candidate-champion-*` | 5 | **2 reachable now** on `run-arena.ps1` (§2A); the other 3 need `-Autopilot`, so `launch-capture.ps1` and a hand snapshot |
| C legacy armour | 6 | **blocked on a fixture re-derivation** — the hero is not producible (§5.1). Not on a weapon sweep; there is nothing to sweep for |
| D tournament-only | 5 | same hero, same block (§5.1); `lethal-result` additionally blocked on boolean staging; `taunt-charisma-floor` additionally open |
| E ranged / bash | 3 | same block on a *different* formula (§7.1), plus a secondary weapon and an unproven `swap_weapons` autopilot |
| F grievous | 1 | same block plus a second strength-derived expected value (§8); `psyche_up` chain unproven |
| G duel | 2 | **reachable** — both weapon ids resolve (§9); needs a second, lower-level gladiator |
| H spell | 8 | **blocked in the wrapper** — no `magic-damage` event, no arming site |

**10 reachable with the tooling exactly as it stands** (A 5, B 3, champion 2).
**2 more behind a second gladiator** (G). **3 behind an `-Autopilot`
passthrough on `run-arena.ps1`, or a hand-snapshotted `launch-capture.ps1` run**
(champion). **8 behind a wrapper change** (H). **15 behind a fixture
re-derivation** (C, D, E, F).

Fixtures that **cannot** be staged as written, and what each needs instead:

| Fixture | Needs |
| --- | --- |
| the 15 of Families C, D, E, F | a re-derivation: they assert `min_damage`/`max_damage` no weapon row can produce at the staged `strength` (§5.1, §7.1, §8). Not a staging problem and not this document's to fix |
| `candidate-lethal-result`, `candidate-spell-first-blood-duel`, `candidate-spell-lethal-slain` | `-Stage*` to pass `true`/`false` through unconverted. `burning:1` is settled and does **not** work: it dumps the number 1 and the record is refused for a non-boolean status flag (§6) |
| all 8 `candidate-spell-*` | a `magic-damage` event and an arming site on the spell ingress |
| `candidate-taunt-charisma-floor` | proof that direction 20 arms at all (`taunt_effect` is drawn pre-arm) |
| `candidate-grievous-knockback` | proof that `getphase("psyche_up")` works below `herolevel 7` |
| `candidate-bash-inherited-critical` | either a secondary weapon, or proof that `shove` produces direction 23 |
| the 3 non-normal-band `candidate-champion-*` | an `-Autopilot` passthrough on `run-arena.ps1`, or a hand-snapshotted `launch-capture.ps1` run |

---

## 12. Unverified — do not treat as established

Everything in this section is stated because it is load-bearing and unproven,
not because it is likely.

1. **~~The `level4-vitality-tournament-gate` hitpoint figure.~~ Settled.** The
   handoff's "220" was a level-up-log reading taken before the vitality points
   were spent; `battlevalues` re-derives `hitpointsmax` to 300 at battle
   construction. `vitality 13` and `hitpointsmax 300` are consistent and both
   correct. §2.
2. **The clamp race inside the 20-tick staging window.** Whether
   `battlevalues(side)` runs before the final `check_stats(side)` after the last
   staging tick. Failure mode is an ingest refusal, not a silent match. §3.
3. **`-Autopilot` on the arena route.** No session has driven `-Navigate arena`
   from an autopilot with `-ArenaPolicy ''`. Needed by every non-`normal_attack`
   direction, and it forces `launch-capture.ps1` because `run-arena.ps1`
   forwards no step list. Unmeasured second-order question: `arenaResetAutopilot`
   rewinds the step index per bout but a list that runs out mid-bout leaves the
   hero idle, which is why the commands here use `*20` repeats. §1.0, §2A, §5,
   §6, §7, §8.
4. **`-StageHero weapon:<n>` / `-StageVillain weapon:<n>`.** Never run. The
   field is read by `battlevalues` at `+0x31be`, so it should work; the sprite
   and `weapon_range` side effects are unexamined. It is now the *only*
   unverified step in the weapon chain — the table itself is decoded. §5, §9.
5. **~~`burning:1` → `true` normalisation.~~ Settled, negatively.**
   `normalizeFieldValue` maps only `undefined` → `false` for the six status
   flags; a staged `1` is dumped as the number `1`, and the observation schema
   requires `finalState.<side>.burning` to be a boolean, so the record is
   refused. `burning:1` is not a workaround. §6.
6. **The trigger of the attacker armour-restore block at overlay `+0x8e2c`.**
   Identified as existing and as operating on `game_attacker`; not traced to a
   caller. §0.5.
7. **Why the staged champion bout still lost — and §0.2's explanation is
   contradicted.** The `min_damage` recomputation is byte-verified. The "the hit
   *chance* was never staged" guess is not, and the retained operator logs
   argue against it: the two staged champion sessions applied
   `hero.attack=60` and `hero.attack=100` respectively (`arena-staged-1`,
   `arena-staged-2`), both alongside the villain's `defence 3`, and both still
   ended `ABORT:battle-lost`. So the chance *was* staged. Treat §0.2's last
   paragraph as an open question rather than a working theory. It no longer
   blocks anything: **the champion capture does not require beating the
   champion** — the wrapper arms on the first `checkattackroll` of that bout and
   closes the trace on its return, so only ranks 3 and 2 have to be won (§2A).
8. **`shield_defence` under `using_bow`.** `battlevalues` `+0x35e2` scores it 0,
   the chance boost reads the raw `shield`; `candidate-snipe-shield-boost`
   stages both and no session has run one. §7.
9. **Whether direction 20 arms.** §6.
10. **Whether `remove_armour` zeroes the raw piece field** as well as
    subtracting its defence. The fixtures assert it (`/villain/helmet 1 → 0`);
    the write was not located in this pass. It affects only whether a second
    removal roll can re-destroy a piece.
11. **The champion staging string has never been run.** §2A's `-StageHero` is
    twenty-two fields derived from the DNA decode, not from a session; the two
    staged champion sessions in the archive used a different, shorter string.
    Its failure mode is a `capture-refused-unstaged` or `stage-refused` line
    rather than a bad trace, so it fails visibly — but it is inferred. §2A.
12. ~~**`-WatchFields` on `run-arena.ps1` has never been exercised.**~~
    **REFUTED BY THE ARCHIVE, 2026-09-02.** Both sentences were false. Five
    rufflelogs — three under `session-champ-n1`, two under `arena-champ-2` —
    carry `{"t":"dbg","at":"watch-extended","added":11}`, which is exactly the
    eleven names `run-arena.ps1:66` passes, and their `-aN` observation ids are
    minted only by `run-arena.ps1:312/315`. Re-derive with
    `grep -oh '{"t":"dbg","at":"watch-extended"[^}]*}' /mnt/c/ss2-capture/captures/*/*.rufflelog`.

    The hedge attached to it — "if an extra mutation line appears, treat it as a
    finding" — is a risk already retired by those five live runs, not an open
    one. **The static reading it rested on was right, and that is the point: it
    had already been confirmed at runtime and nobody had looked.**
    §2A.
