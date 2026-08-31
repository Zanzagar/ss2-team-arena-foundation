# SS2 first integration checkpoint

Status: read-only static map, first recorded 2026-08-29, last revised
2026-08-31. This is interoperability research for the locally licensed Steam
build identified in
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
   linkage at depth 40001 — both as children of `_root.arena.gladiators`
   with instance names `overlay` and `overlay_villain` (byte-verified
   2026-08-30 at block `+0x04cf`/`+0x04f6`: `_root.arena.gladiators
   .attachMovie("overlay", "overlay", 40000)`), so the live controller path
   is `_root.arena.gladiators.overlay`.
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

## Controller frames and the hero action vocabulary

Byte-verified 2026-08-30 on sprite 862. The four hero controllers are not
interchangeable: which labels a gladiator can reach depends entirely on which
controller frame is in scope, and that choice is made once per turn.

### Selection and spans

`initialise` never rests. Its frame-4 action `DoAction@0x238bbf` is the
controller selector and is the only site that gotoAndPlays a controller label:

```text
if (_root.game.hero.using_bow != true) {              // +0x00b9..+0x00c7
  fightdistance < hero.weapon_range                   // +0x00f6
    ? this.gotoAndPlay("closerange_warrior")          // +0x00fd
    : this.gotoAndPlay("longrange_warrior");          // +0x0116
} else {
  fightdistance < 100 + hero.physical_size            // +0x015f
    ? this.gotoAndPlay("closerange_archer")           // +0x0166
    : this.gotoAndPlay("longrange_archer");           // +0x017f
}
```

`_root.arena.fightdistance` and `_root.game.hero.using_bow` are therefore the
only two inputs that gate the archer controllers. Because `physical_size =
80 + round(strength / 1.5)`, the archer close-range threshold resolves to
`180 + round(strength / 1.5)`, while the warrior threshold is the hero's own
`weapon_range`.

Each label plays through a span and holds on its last frame:

| Label | Frame | Span | How the span holds |
| --- | --- | --- | --- |
| `initialise` | 1 | 1–4 | never holds; frame 4 dispatches |
| `longrange_warrior` | 5 | 5–12 | `Stop`, frame 12 `DoAction@0x23a0fd` |
| `closerange_warrior` | 13 | 13–19 | `Stop`, frame 19 `DoAction@0x23b152` |
| `longrange_archer` | 20 | 20–27 | `Stop`, frame 27 `DoAction@0x23c4dc` |
| `closerange_archer` | 28 | 28–37 | `Stop`, frame 37 `DoAction@0x23d687` |
| `heroactions` | 52 | 52–61 | frame 61 `DoAction@0x24a1a4` runs `gotoAndPlay(_currentframe - 1)` at `+0x0014`, so it oscillates 60↔61 |
| `combatwon` | 62 | 62–73 | `Stop`, frame 73 `DoAction@0x24a8b0` |
| `combatlost` | 74 | 74–84 | `Stop`, frame 84 `DoAction@0x24aefe` |

An autopilot that reads `_currentframe` must expect the resting frame, not the
label frame. `heroactions` is the one span that never stops; it idles on a
two-frame loop while `attacker.onEnterFrame` runs the phase machine.

A further `Stop` sits at frame 51 (`DoAction@0x23d773`), immediately before
`heroactions`. No label was verified between 28 and 52, so frames 38–51 are
not reachable from any mapped path. This map previously left open whether a
ninth label might hide in that gap, because the project inspector did not then
decode `FrameLabel` (tag 43).

**Closed 2026-08-30, and reproduced with the project's own tool.** The
inspector now has a `--labels` mode with a `--timeline <regex>` filter, so the
decode no longer depends on the throwaway out-of-repo reader the
[arena route](ss2-arena-route.md) §Method note first used. Re-run here against
the same installed SWF and fingerprint:

```powershell
node tools/inspect-swf.mjs "$ss2Install\swf\swords_sandals2_download.swf" `
  --labels --timeline 'sprite:862'
```

It reports `8 across 1 of 24 timelines` for `sprite:862[overlay]`, 84 frames
declared, at frames **1, 5, 13, 20, 28, 52, 62 and 74** — the same eight
already verified here from the action stream, in the same order. There is no
ninth label, and frames 38–51 carry none: `closerange_archer` owns the whole
28–51 range outright. The caveat is closed, and the "cannot be excluded from
the action stream alone" wording no longer applies to anything in this map.

One convention difference matters when comparing the two tables. `--labels`
prints the **label-ownership** span (frames a label owns until the next label
begins), while the Span column above is the **play** span, which ends at the
`Stop` the playhead actually rests on. They differ only for
`closerange_archer`: owned 28–51, rests at 37. The frame-51 `Stop` sits inside
the owned range and no mapped path reaches it.

### Buttons wired per controller frame

Every controller frame opens by recomputing the hero's chance cache with
`attack_chances(_root.game.hero, _root.game.villain)` — frame 5 `+0x0908`,
frame 13 `+0x072f`, frame 20 `+0x08d2`, frame 28 `+0x08fb` — then branches once
on `_root.arena.gladiators.hero.gladiator_dir == "right"` (frame 5 `+0x093a`,
frame 13 `+0x0761`, frame 20 `+0x0904`, frame 28 `+0x092d`). Both facings wire
the same eight `optionA`–`optionH` slots with `onRelease` handlers whose whole
body is a single `getphase("<label>")` call. The label set is facing-invariant
apart from the charge/ranged handedness; only the slot assignment rotates.

| Controller | Facing | Handler range | `optionA`…`optionH` labels |
| --- | --- | --- | --- |
| `longrange_warrior` | right | `+0x0c97`–`+0x0dec` | `jumpleft`, `walkleft`, `taunt`/`rest`, `jumpright`, `walkright`, `chargeright`, `wincrowd`, `psyche_up` |
| `longrange_warrior` | left | `+0x1134`–`+0x12a0` | `jumpleft`, `walkleft`, `chargeleft`, `jumpright`, `walkright`, `taunt`/`rest`, `psyche_up`, `wincrowd` |
| `closerange_warrior` | right | `+0x0a90`–`+0x0b8b` | `jumpleft`, `walkleft`, `shove`, `power_attack`, `normal_attack`, `quick_attack`, `wincrowd`, `psyche_up` |
| `closerange_warrior` | left | `+0x0ebc`–`+0x0fb7` | `power_attack`, `normal_attack`, `quick_attack`, `jumpright`, `walkright`, `shove`, `psyche_up`, `wincrowd` |
| `longrange_archer` | right | `+0x0ca2`–`+0x0df7` | `jumpleft`, `walkleft`, `taunt`/`rest`, `bombardright`, `walkright`, `sniperight`, `wincrowd`, `psyche_up` |
| `longrange_archer` | left | `+0x1197`–`+0x12ec` | `bombardleft`, `walkleft`, `snipeleft`, `jumpright`, `walkright`, `taunt`/`rest`, `psyche_up`, `wincrowd` |
| `closerange_archer` | right | `+0x0c19`–`+0x0d14` | `jumpleft`, `walkleft`, `shove`, `jumpright`, `bash_attack`, `taunt`, `wincrowd`, `psyche_up` |
| `closerange_archer` | left | `+0x1002`–`+0x10fd` | `jumpleft`, `bash_attack`, `taunt`, `jumpright`, `walkright`, `shove`, `psyche_up`, `wincrowd` |

Consequences a capture campaign has to respect:

- `power_attack`, `normal_attack` and `quick_attack` are wired **only** by
  `closerange_warrior`; `shove` only by the two close-range controllers.
- `bombardleft/right` and `snipeleft/right` are wired **only** by
  `longrange_archer`; `bash_attack` **only** by `closerange_archer`. All four
  therefore require `using_bow == true` to be offered at all.
- `rest` is never wired by either close-range controller, and `taunt` is never
  wired by `closerange_warrior`.
- On frames 5 and 20 the taunt and rest buttons share one slot, selected by
  `staminaleft / staminamax * 100 >= 50` — frame 5 `+0x0c0a`/`+0x0c3d` facing
  right and `+0x10a2`/`+0x10d5` facing left, frame 20 `+0x0c15`/`+0x0c48` and
  `+0x110a`/`+0x113d`. Below 50% stamina the taunt button does not exist; at or
  above it the rest button does not. `closerange_archer` has no stamina test at
  all and always wires `taunt`.
- `wincrowd` is hidden below `herolevel` 3 on every controller. `psyche_up` is
  hidden below `herolevel` 7 on the warrior controllers (frame 5 `+0x0999`,
  frame 13 `+0x07c0`) but below `herolevel` 3 on the archer controllers, where
  a single test hides both slots (frame 20 `+0x092e`/`+0x0e23`, frame 28
  `+0x0957`/`+0x0d40`).

### The ammunition-visibility defect

On `longrange_archer` the ranged slots are frame-selected when
`_root.game.hero.ammo_left > 0` (`+0x099f`, mirrored `+0x0e66`). The zero-ammo
branch instead assigns `visible` — not `_visible` — on both slots
(`+0x09eb`/`+0x09f9` facing right, `+0x0eb2`/`+0x0ec0` facing left). `visible`
is not a MovieClip property, so the buttons are **not** hidden, and their
`onRelease` handlers are wired unconditionally further down the same branch.
Nothing in the ranged phase re-checks ammunition either: the ranged branch of
`attacker.onEnterFrame` decrements `game_attacker.ammo_left` by one at
`+0x6bf5`–`+0x6c13` with no guard, so a zero-ammo shot drives the counter
negative. In ordinary play the auto-swap below fires first; a capture harness
that drives `getphase` directly can reach the defect.

### Weapon mode and `swap_weapons`

No controller frame wires `swap_weapons`. The only manual route is the battle
inventory overlay: `swap_inventory.onRelease` in sprite 862 frame 1
`DoAction@0x2378cc`, defined at `+0x1015`, whose body calls
`getphase("swap_weapons")` at `+0x1067`. That button is correctly hidden with
`_visible = false` when the hero has no secondary weapon (`+0x0e77`–`+0x0e96`),
and its icon frame is selected by `using_bow` at `+0x0eb5`.

The `swap_weapons` phase itself is a plain toggle in overlay frame 52
`DoAction@0x240c7f` (`+0x4d23`): `using_bow != true` sets
`game_attacker.equipped_weapon = 2` and `using_bow = true` (`+0x4dbd`,
`+0x4dce`); otherwise it sets `equipped_weapon = 1` and `using_bow = false`
(`+0x4eba`, `+0x4ecb`). It sets `staminacost = 1` (`+0x4d35`) and never checks
that the secondary weapon is a bow. Since root frame 221 forces
`equipped_weapon = 1` and `using_bow = false` at battle construction, a hero
always starts on a warrior controller and must spend one turn on
`swap_weapons` before either archer controller can be selected.

### Turn gating, forced phases, and per-turn re-entry

`getphase(whatsdoing)` runs its body only when `turnphase == 1`
(`+0x0355`–`+0x0365`); the whole body, including the jump to `heroactions`, is
skipped otherwise. On success it sets `turnphase = 2` (`+0x0372`) and
`inv_struck = false` (`+0x03a0`). `turnphase` is written back to `1` at exactly
one site in the build: overlay frame 1 timeline `+0x0a8f`. Therefore **at most
one `getphase` call takes effect per pass through frame 1**, and every later
call in that turn is a silent no-op.

Frame 1's timeline then runs a fixed chain of forced phases, all after the
`turnphase = 1` reset, in this order:

| Order | Condition | Forced call | Offsets |
| --- | --- | --- | --- |
| 1 | `ammo_left <= 0` and `using_bow == true` | `getphase("swap_weapons")` | `+0x0cce`–`+0x0d0e` |
| 2 | `staminaleft <= 0` | `getphase("rest")` | `+0x0d2e`–`+0x0d48` |
| 3 | `taunted1 == true` or `taunted2 == true` | facing right → `getphase("runleft")`, facing left → `getphase("runright")` | `+0x0d68`–`+0x0e35` |
| 4 | `frozen == true` | `getphase("frozen")` | clear `+0x0e79`, call `+0x0e81` |
| 5 | `burning == true` | `getphase("burning")` | read `+0x0ea1`, clear `+0x0ec5`, call `+0x0ecd` |
| 6 | `poison == true` | `getphase("poisoned")` | clear `+0x0f11`, call `+0x0f19` |
| 7 | `life_stolen == true` | `getphase("life_stolen")` | read `+0x0f39`, clear `+0x0f5d`, call `+0x0f65` |

These are sequential statements, not an if/else chain, and each one clears its
own flag *before* calling `getphase`. Combined with the `turnphase` gate this
means a lower-priority condition can have its flag consumed by a call that does
nothing — for example a forced rest at zero stamina clears and discards a
pending `burning` phase in the same pass. Note also that the field is `poison`
while the phase label is `poisoned`.

The taunted-run rule is mirrored, not shared. The hero runs **against** its
facing (`gladiator_dir == "right"` → `runleft` at `+0x0dc2`/`+0x0de3`), whereas
`villainChooseAction` in frame 52 `DoAction@0x23f835` runs the villain **with**
its facing (`right` → `villaindecisionA = "runright"` at `+0x1224`/`+0x1246`,
`left` → `runleft` at `+0x1268`/`+0x128a`). The hero path clears only
`taunted1` in both branches (`+0x0ddb`, `+0x0e2d`) even though the entry
condition also tests `taunted2`; `villainChooseAction` clears each flag in its
own block (`+0x123e`, `+0x1282`, `+0x12e6`, `+0x132a`). `taunted1` is set true
at exactly one site in the build — the taunt phase at `+0x6ad9`, on
`game_defender` — and `taunted2` is **never** assigned `true` anywhere, so the
hero-side `taunted2` term and its missing clear are latent in this build.

Re-entry is per turn, not per action. `nextphase` (overlay frame 52
`DoAction@0x240c7f`, anonymous function at `+0x3193`) advances
`battle_action` while it is below 3 (`+0x3613`–`+0x3637`), and when it reaches
3 it calls `changeCombatants`, nulls `battle_action`, deletes both fighters'
`onEnterFrame` handlers and calls `this.gotoAndPlay("initialise")`
(`+0x3648`–`+0x3692`). So the selector, the `turnphase` reset and the forced
chain all re-run once per completed turn. `nextphase` also resets
`game_attacker.psyche_up = 1` whenever `phase_decision != "psyche_up"`
(`+0x35c7`–`+0x35ea`), and `damagecharacter` resets the defender's counter the
same way at `+0x1be4`.

### `getphase` does not validate its argument (byte-verified 2026-08-30)

The function is seven statements long and has been decoded in full. Its entire
body, in order:

```text
if (turnphase != 1) return;                    // +0x0355..+0x0365
decisionA = whatsdoing;                        // +0x036a  (the parameter, register:2)
turnphase = 2;                                 // +0x0372
this.battle_action = 1;                        // +0x037d
inventory_overlay.removeMovieClip();           // +0x038a..+0x039f
inv_struck = false;                            // +0x03a0
this.gotoAndPlay("heroactions");               // +0x03a8, +0x03b7 Play
```

There is **no label table, no membership test, and no read of `_currentframe`
or of any controller-frame state**. `whatsdoing` is stored verbatim. Downstream,
`phase_decision` is assigned at exactly five sites, all inside the
`attacker.onEnterFrame` machine and all selected by `battle_action`, not by
frame: `decisionA` at `+0x3a9b` (`battle_action == 1`), `villaindecisionA` at
`+0x3ac0`, `decisionB` at `+0x3ae5`, `villaindecisionB` at `+0x3b0a`, and `null`
at `+0x3b18`. All 75 `phase_decision` references in the build live in overlay
frame 52 `DoAction@0x240c7f`, and the dispatch from `+0x3b1f` onward is a flat
chain of string comparisons. The only two `_currentframe` reads anywhere in
that block are on other objects entirely — `damage_icon.damage_splat`
(`+0x18ad`) and `bullet` (`+0x9185`).

**This settles a disagreement with
[the runtime-capture workflow](ss2-runtime-capture.md) §Hero action
vocabulary**, which states that "`getphase(whatsdoing)` accepts only the labels
defined by the controller frame currently in scope". At the byte level that is
not a property of `getphase`; the table there is an accurate record of which
labels each controller frame **wires to buttons** (§Buttons wired per
controller frame above), which is a different claim. Nothing in the decode
implements "accepts only": there is no rejection path, no failure return, and
no state the function could consult to build one.

Two structural points make the same case without appealing to the decode alone.
The frame-1 row of that table is not a button set — those eight labels are the
forced phases frame 1 issues to *itself* (the table above), and seven of them
(`swap_weapons`, `runleft`, `runright`, `frozen`, `burning`, `poisoned`,
`life_stolen`) are wired by no controller frame anywhere, `rest` being the lone
exception. And frames 1–4 carry no `Stop`, so the playhead never rests on
`initialise`: by the time a label its forced call issued is dispatched at frame
52, the frame that "owned" it is long gone and nothing re-checks. The scope the
table describes is real for *what the player can press*, and has no
representation inside the dispatch path.

The consequence for the capture wrapper is that its availability gate
(`ss2-capture-wrapper.as`, `CONTROLLERS` / `stepAutopilot`, which refuses a step
the resting controller does not offer) is **stricter than the build requires**.
That is the safe direction and the gate should stay — an unattended run that
issues an unreachable label burns its one effective `getphase` for the turn and
stalls with no trace — but the restriction is the wrapper's, not the game's, and
neither this map nor the bytes should be cited as evidence for it.

What is *not* settled is whether such a cross-controller call completes
end-to-end at runtime. Nothing above has been observed live, because every
capture so far issued only labels its resting controller offered. **The
experiment that would settle it** is one bout that calls
`getphase("power_attack")` while the overlay rests on frame 12
(`longrange_warrior`, which wires no melee attack) and shows a `checkattackroll`
draw plus a `defender-hurt` or `defender-blocked` event in the trace — a
melee attack takes no distance or range test (§Where `attack_direction` is
assigned), so nothing else should stand in the way. A single such capture would
confirm it; a stall with no roll would refute it and mean some gate exists that
this decode missed.

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

Runtime-observed 2026-08-30 (second capture, a charge collision): charge
impacts are dispatched through `checkattackroll` with `attack_direction`
still **undefined** — the applied damage equals the attacker's `min_damage`,
a −20..20 critical sample is drawn, and the standard deflection/removal/
damage path follows. The same capture observed the first-blood duel defeat
end-to-end (hp 30 of 40 in `duel` mode → `death` → `combatwon`), the
post-death knockback and enchantment rolls in the mapped order, the
overflow mutation order with `armourclass` left negative until the clamp,
and the byte-decoded death status-clear order, all live. A future schema
revision may model direction-undefined charge attacks as fixtures.

Runtime-observed 2026-08-30: the persistent combat objects leave the status
flags (`burning`, `frozen`, `poison`, `life_stolen`, `taunted1`, `taunted2`)
**undefined** until something sets them, and do not carry `gladiator_dir` at
action time — the facing lives on the fighter clips. The capture wrapper
normalizes undefined status flags to `false` and reads the facing from the
clip. Live captures also confirmed the `battlevalues` armour sums three
times over (boot 4 + greaves 4 → 20; helmet 2 + shield 2 → 44; breastplate 1
+ gauntlet 1 → 21), the full physical roll order of a normal attack, the
`attack_chances` normal formula (attack 3 vs defence 1 → chance 60, and a hit
against the derived `rollneeded` 40), the deflection threshold with helmet 2
(97), the armour-first damage path, and the unconditional breastplate-stamina
write.

**What a capture can and cannot confirm.** Every claim above rests on the
observed channels: the ordered mutation trace, the semantic events, the result
event, the state dumps, `attack_direction`, `fight_mode`, and the *number* of
draws in the armed window. A capture never observes a roll's bounds or value —
the wrapper's tap sits on `Math.random`, which takes no arguments, so each
`roll` line is echoed from the injected tape, which was generated from the
fixture under test (runtime-capture §What a match actually establishes). So
where a runtime note in this map names a roll value, that value was *supplied*
to the build; what the run measured is the outcome the build reached with it.
Only the draw count constrains the roll stream itself.

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

`battlevalues(whichcharacter)` is `DefineFunction2` at `+0x3062` of root frame
35 `DoAction@0x3fa9dc`. Register bindings, read off the operands: `register:1`
is `_root`, `register:2` is `_global`, `register:3` is the `whichcharacter`
argument. Every offset below was re-read from the bytes on 2026-08-30 rather
than carried over.

### `battlevalues`: the unconditional derivations

These run on **every** call, in battle or out of it:

```text
physical_size        = 80 + round(strength / 1.5)                     // +0x30f1
breastplate_defence  = round(breastplate * _global.breastplate_dval)  // +0x3480
helmet_defence       = helmet > 25 ? round(herolevel * 0.5 * 10)      // +0x34eb
                                   : round(helmet * 10)               // +0x34bf
  (…the other six pieces likewise, +0x351f onward)
min_damage           = round(strength * 2) + weapon_min_damage        // +0x3356
max_damage           = round(strength * 2) + weapon_max_damage        // +0x3386
secondary_min_damage = round(strength * 1) + secondary_weapon_min_damage  // +0x33b6
secondary_max_damage = round(strength * 1) + secondary_weapon_max_damage  // +0x33e6
if (using_bow) { min_damage = secondary_min_damage;                   // +0x3416
                 max_damage = secondary_max_damage; }
hitpointsmax         = herolevel * 10 + vitality * 20                 // +0x378e
staminamax           = 100 + stamina * 10                             // +0x37b6
movement_speed       = clamp(round(speed * 1.5), 4, 60)               // +0x37d2
_root.game.hero.experiencelast   = round((L-1)*(L-1)*((L-1)/5)*300)   // +0x3845
_root.game.hero.experienceneeded = round(L*L*(L/5)*300)               // +0x38d3
if (_root.game.hero.experienceneeded < 125) … = 125                   // +0x398c
```

The `using_bow` override at `+0x3416` was not previously recorded here, and the
map's earlier formula list implied the two pairs were independent. They are not:
it is a plain `if (using_bow)` (`GetMember`, `Not`, `If` past the block), so in
bow mode `min_damage`/`max_damage` are **overwritten by the secondary pair** —
carrying the `round(strength * 1)` scaling, not `round(strength * 2)`. Every
damage row in the `attack_direction` dispatcher (below) reads
`min_damage`/`max_damage`, so all of them silently follow the weapon mode.
Because `swap_weapons` writes only `using_bow` and `equipped_weapon`
(§Weapon mode and `swap_weapons`) and derives nothing itself, the damage pair
does not move at the instant of the swap: it moves at the next `battlevalues`,
which `nextphase` runs for both combatants at every phase transition.

**Hazard: the two experience writes are on `_root.game.hero` unconditionally.**
`L` above is `_root.game.hero.herolevel`, not `whichcharacter.herolevel`, and
both `SetMember` targets are `_root.game.hero` — `register:1`, never
`register:3`. They are not inside any branch. So **calling `battlevalues` for a
villain rewrites the hero's progression fields**, and `nextphase` calls it for
both combatants at every phase transition (`+0x35f1` attacker, `+0x3605`
defender). In vanilla this is invisible because the values are pure functions of
`herolevel` and so are idempotent; it becomes a real hazard for anything that
stages `experienceneeded`/`experiencelast`, or that calls `battlevalues` on a
scratch object and expects the hero untouched. The floor at `+0x398c` also
explains a correction the project made from observation: at `herolevel` 1 the
formula gives `round(1 * 1 * 0.2 * 300) = 60`, and the floor immediately
replaces it with **125** — which is the value the arena route measured live,
and 60 is what an audit reading the formula without the floor would report.

### `battlevalues`: the block skipped during a battle

`+0x3a90` reads `_global.battle_started`; if it is `true` the `If` at `+0x3aa0`
jumps 360 bytes to `+0x3c0d`, skipping this whole block:

```text
hitpoints       = round(hitpointsmax)                                 // +0x3aa5
armourclass_max = breastplate_defence + helmet_defence + shinguard_defence
                + greaves_defence + shoulderguard_defence
                + gauntlet_defence + boot_defence + shield_defence    // +0x3ac3
armourclass     = armourclass_max                                     // +0x3b0f
if (!(staminaleft > 0)) staminaleft = staminamax                      // +0x3b1c
if (!(ammo_left  > 0) || ammo_left == undefined)
                        ammo_left  = maximum_ammo                     // +0x3b45
character_xp    = secondary_min_damage + secondary_max_damage * 10
                + min_damage + max_damage * 20
                + weapon_enchantment_damage * 10
                + secondary_weapon_enchantment_damage * 10
                + herolevel^2 + armourclass * 10 + 150                // +0x3b82..+0x3c0c
```

Three consequences follow directly, and they are the reason staged fields
behave differently from one another:

- **`armourclass_max` is summed only outside a battle.** The eight per-piece
  `*_defence` fields are recomputed unconditionally at `+0x3480` onward, but
  nothing re-sums them into `armourclass_max` while `battle_started` is true,
  and `armourclass` is not reset either. Once a battle starts the only writer of
  `armourclass_max` in the whole build is `remove_armour`, which subtracts a
  destroyed piece's defence from it (`+0x0352`, `+0x048d`, `+0x064d`, `+0x072f`,
  `+0x087e`, `+0x0a1a`, `+0x0b69`, `+0x0cb8`) and zero-clamps it at `+0x0d94`;
  `armourclass` additionally takes the two damage ingresses' subtractions and
  `check_stats`'s clamps. This is the byte-level reason staged armour survives a
  bout where staged `hitpoints` does not — but see the sharper form below,
  because *which* armour field is staged decides the answer.
- **`hitpointsmax` is recomputed unconditionally** (`+0x378e`), while the full
  heal that would raise `hitpoints` to match is inside the skip. Combined with
  `check_stats` clamping `hitpoints` down to `hitpointsmax` (next section),
  a staged `hitpoints` above maximum cannot survive one phase transition, and a
  staged `hitpointsmax` cannot survive one `battlevalues` call.
- **`character_xp` is not recomputed during a battle.** It is the win reward's
  input (§Battle result and reward callbacks), and it is frozen at the value
  computed the last time `battlevalues` ran with `battle_started` false — i.e.
  at generation, when `armourclass` still equalled `armourclass_max`. The reward
  therefore reflects the loser's *undamaged* armour, whatever the bout did to it.

### `check_stats` is a pure clamp

`check_stats(whichcharacter)` is `DefineFunction2` at `+0x10e4` of overlay frame
52 `DoAction@0x240c7f`, and its body (`+0x110a`–`+0x11ff`) is three clamped
pairs and nothing else:

| Field | Upper clamp | Lower clamp |
| --- | --- | --- |
| `staminaleft` | to `staminamax` `+0x1122` | to `0` `+0x114b` |
| `hitpoints` | to `hitpointsmax` `+0x1174` | to `0` `+0x119d` |
| `armourclass` | to `armourclass_max` `+0x11c6` | to `0` `+0x11ef` |

No other member is written, nothing is derived, and there is no RNG. The lower
clamps are `if (!(x > 0)) x = 0`, so they also convert `undefined` and `NaN` to
zero.

It has exactly **11 call sites** (12 references including the definition):
`magic_damage_character` `+0x14e0`, `damagecharacter` `+0x193c`, six inside
`nextphase` (`+0x334d`, `+0x33b1`, `+0x346a`, `+0x3523`, `+0x3535`, `+0x35bb`),
and three in the `attacker.onEnterFrame` machine (`+0x525c`, `+0x5d6d`,
`+0x68d3`). Both damage ingresses call it **one instruction before the defeat
gate** — `+0x1948 CallFunction`, `+0x1949 Pop`, `+0x194a` first opcode of the
gate — so the gate always tests clamped values.

**The sharp form of "staged armour survives".** `check_stats` clamps
`armourclass` to `armourclass_max`, and in battle `armourclass_max` is whatever
it was when the fight began. So:

| Staged field | Survives a phase transition? |
| --- | --- |
| `helmet`, `greaves`, … (piece ids) | yes — never written by `battlevalues` |
| `<piece>_defence` | **no** — recomputed from the piece id at `+0x3480` onward |
| `armourclass_max` | yes — its only writers in battle are `remove_armour` |
| `armourclass` | yes, but clamped to the current `armourclass_max` |
| `hitpoints`, `hitpointsmax`, `min_damage`, `max_damage`, `staminamax`, `physical_size`, `movement_speed` | no — recomputed unconditionally |

This is a static reading of the writers, not a runtime measurement. The two
rows that matter for the `candidate-armoured-*` family are the second and
third: staging a `<piece>_defence` name alone is overwritten before the first
roll, and staging piece ids alone changes the deflection threshold and
`remove_armour`'s piece selection without moving `armourclass_max`. Confirming
which of those a capture actually produces needs a bout, not a decode.

Back in `battlevalues`: the armour piece multipliers are written to `_global` at
the top of that function (`+0x3089`–`+0x30f0`) as `<piece>_dval` —
breastplate 16, helmet 10,
shinguard 6, greaves 3, shoulderguard 8, gauntlet 5, boot 2, and shield 12.
Helmet normally contributes `round(helmet * helmet_dval)`, but a helmet value
above 25 instead contributes `round(herolevel * 0.5 * helmet_dval)`
(`+0x34a7`–`+0x351e`). Shield defence is zero while `using_bow`; otherwise it
contributes `round(shield * 12)`. Thus `armourclass_max` does not always include
the shield. These are verified static calculations, but they are not yet a
complete save-schema map.

Maximum ammunition is tiered by character level: 5 below level 9, 10 for levels
9–22, 15 for 23–27, 20 for 28–34, 25 for 35–44, and 30 at level 45 or above
(the chain runs `+0x3634`–`+0x378d`, with the assignments at `+0x364b`,
`+0x368e`, `+0x36d1`, `+0x3714`, `+0x3757` and `+0x3781`; the level-45 arm
re-tests `herolevel >= 35` redundantly at `+0x3769`, which changes nothing).
The tier assignment is unconditional, but the `ammo_left` refill that consumes
it is inside the `battle_started` skip above.

## RNG surface

Combat is not seeded in vanilla. Identical `randomBetween(a, b)` functions are
defined three times—overlay frame 52 blocks `0x23f835` and `0x240c7f`, and root
frame 35 block `0x40198e`—and are inclusive:

```text
floor(Math.random() * (b - a + 1)) + a
```

The battle code also uses AVM1's direct `RandomNumber` opcode. Some direct uses
are cosmetic (`destroy_armour` consumes three direction-dependent debris rolls
after a piece is selected, and crowd movement consumes others), while some
choose `attack_direction` and therefore affect combat. Exact deterministic parity
cannot be achieved by replacing only `randomBetween`; both sources must be
routed through one ordered roll stream, with cosmetic rolls either represented
in that stream or removed from authoritative simulation.

The overlay's complete `RandomNumber` inventory is small enough to enumerate
(byte-verified 2026-08-30; nine opcode sites on sprite 862):

| Site | Use | Draws per invocation |
| --- | --- | --- |
| `destroy_armour` `+0x0dfb`, `+0x0e28` | `xspeed`, `-30 + RandomNumber(20)` facing right or `10 + RandomNumber(30)` facing left | exactly one of the two |
| `destroy_armour` `+0x0e5b`, `+0x0e6f` | `dy = -40 + RandomNumber(20)`, `rotationspeed = -5 + RandomNumber(5)` | both, unconditionally |
| `attacker.onEnterFrame` `+0x5091` | `attacker.wincrowd_move = 1 + RandomNumber(6)`, only while the member is `undefined` (`+0x5071`) | at most one per battle |
| `attacker.onEnterFrame` `+0x7815`, `+0x7845`, `+0x7875` | `attack_direction = 1 + RandomNumber(9)` on the `cast_weaken_armour` path | three |
| frame 74 `DoAction@0x24a8ba` `+0x0149`, `+0x039b` | `combatlost` presentation, outside the turn loop | — |

So `destroy_armour` consumes exactly three rolls per call, of which only the
first is facing-selected — and if `gladiator_dir` matches neither `"right"` nor
`"left"`, that first roll is instead `randomBetween(-30, 60)` at `+0x0e30`,
which *would* consume a tape slot. Only the `cast_weaken_armour` trio is
authoritative; the rest is presentation, but the fallback above shows the
cosmetic path can still perturb tape position.

Two `randomBetween` draws on the taunt path also precede `checkattackroll` and
must be budgeted before its own `diceroll`: `diceroll = randomBetween(1, 100)`
at `+0x6921`, which succeeds when `diceroll < game_attacker.taunt_percentage`
(`+0x694b` — note the polarity is the direct comparison, not the dispatcher's
`100 - chance` form), and then `taunt_effect = randomBetween(1, 2)` at
`+0x6952`. Only `taunt_effect == 1` sets `attack_direction = 20` and calls
`checkattackroll`; `taunt_effect == 2` runs a charisma-scaled knockback or sets
`game_defender.taunted1 = true` (`+0x6ad9`) and never reaches the dispatcher.
The taunt phase also carries a 60-tick watchdog (`taunttimer`, `+0x67e4`) that
calls `nextphase` and abandons the phase if the animation never reports back.

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
snipe chance. This is counterintuitive; treat it as a statically mapped build
behavior or possible vanilla bug and confirm it with golden runs before
encoding measured rules.

### Where `attack_direction` is assigned (byte-verified 2026-08-30)

The dispatcher table below records what each direction band *means*; this
records where the value comes from. Across the whole build `attack_direction`
is assigned at seventeen sites — fifteen to the overlay timeline variable, and
two to a same-named member on the fighter clip — all inside overlay frame 52
`DoAction@0x240c7f`, and all inside the one anonymous function assigned to
`attacker.onEnterFrame` at `+0x36ae` (the `phase_decision` state machine).
Everything else that mentions the name is a read, or the shadowing parameter of
`remove_armour(whichcharacter, whichavatar, attack_direction)` and
`damagecharacter(..., attack_direction)`.

| Phase branch | Site | Expression | RNG kind |
| --- | --- | --- | --- |
| `power_attack` (`+0x601d`) | `+0x608a` | `randomBetween(9, 12)` | `randomBetween` |
| `normal_attack` (`+0x6191`) | `+0x61f1` | `randomBetween(5, 8)` | `randomBetween` |
| `quick_attack` (`+0x62f8`) | `+0x635c` | `randomBetween(1, 4)` | `randomBetween` |
| `bash_attack` (`+0x6463`) | `+0x64c3` | `23` | none |
| `psyche_up` (`+0x652d`), facing right | `+0x669e` | `30` | none |
| `psyche_up`, facing left | `+0x6717` | `30` | none |
| `taunt` (`+0x679c`) | `+0x6981` | `20` | none |
| `bombardright`/`bombardleft` | `+0x6c67` | `21` | none |
| `sniperight`/`snipeleft` | `+0x6c8c` | `22` | none |
| `cast_weaken_armour` (`+0x7782`) ×3 | `+0x7815`, `+0x7845`, `+0x7875` | `1 + RandomNumber(9)` | `RandomNumber` opcode |
| `cast_whirlwind` (`+0x78e0`), facing right | `+0x79d0` | `30` | none |
| `cast_whirlwind`, facing left | `+0x7a49` | `30` | none |
| `cast_ghost_strike` (`+0x7dbd`) | `+0x7ebb` | `randomBetween(9, 12)` | `randomBetween` |

Only the four `randomBetween` draws — power, normal, quick and ghost strike —
are interceptable and recordable by the capture wrapper. The three
`cast_weaken_armour` draws use the AVM1 `RandomNumber` opcode directly and can
be neither observed nor injected by a wrapper that only replaces
`randomBetween`; the remaining eight sites are fixed constants and need no
sample at all. This is the boundary that decides what a capture campaign can
ever control on the direction input.

The two charge sites are the exception that explains an earlier runtime
observation. `chargeright` (`+0x41f5`) at `+0x4398` and `chargeleft`
(`+0x4461`) at `+0x4604` both execute
`attacker.attack_direction = 9` as a **`SetMember` on the fighter clip**, then
call `checkattackroll()` at `+0x43a3`/`+0x460f`. `checkattackroll` reads the
overlay timeline variable with `GetVariable` (`+0x2c68`, `+0x2c80`, `+0x2cd7`,
…) and never reads the clip member, so the charge write is invisible to it.
That is why the 2026-08-30 charge capture saw `attack_direction` **undefined**
inside `checkattackroll`: not a missing assignment, but an assignment to the
wrong object. Reconstructions must not "fix" this by treating a charge as
direction 9.

Note also that `power_attack`, `normal_attack` and `quick_attack` draw their
direction and call `checkattackroll()` with **no distance or range test**
(`power_attack` runs straight from `+0x607c` to the call at `+0x6146`). Only
`psyche_up` and `cast_whirlwind` gate on range, comparing `attacker._x` against
`defender._x -/+ round(game_attacker.weapon_range + 50)` by facing
(`+0x6658`–`+0x6699` and `+0x66d1`–`+0x6712`). Out of range those two decide
nothing at all — no roll, no damage, no death — while a melee attack issued
from any distance still resolves. The phase machine itself never consults the
controller frame, so a driver that calls `getphase` directly can reach a label
the current controller does not wire — byte-verified in
§`getphase` does not validate its argument, which also records why the capture
wrapper nonetheless refuses to do it and what would settle the question live.

Direction 30 has exactly two producers in the table above: the `psyche_up`
counter and `cast_whirlwind`. Only the first is a player action with a
`getphase` label — `cast_*` labels are consumed by the phase machine and have
no callable entry point (§Spell and vanilla AI surface) — so `psyche_up` is the
only route a capture can drive, and every controller wires it (above:
`herolevel >= 7` on the warrior frames, `>= 3` on the archer frames).

The `psyche_up` counter's full lifecycle is: the phase plays
`psyche_up`, `psyche_up2` or
`psyche_up3` for counter values 1, 2 and >= 3 (`+0x658a`, `+0x65b9`, `+0x65ef`);
at 3 it fires the range-gated grievous and then writes
`game_attacker.psyche_up = 1` at `+0x6738`; when the animation reports back
(`attacker.struck == true`) it adds one at `+0x6761`. Statically the counter
therefore lands on 2, not 1, after a discharge, which would let the next
`psyche_up` press discharge again. Recorded as a static candidate — the two
writes are in different ticks of the same phase, so a runtime capture of two
consecutive `psyche_up` presses would settle it. Every non-`psyche_up`
decision resets the counter through `nextphase` (`+0x35e0`), and taking damage
resets the defender's through `damagecharacter` (`+0x1be4`).

**Runtime-resolved 2026-08-31 — the three melee bands, and what a live 1–12
spread does *not* mean.** Twenty-two `run-arena.ps1` rounds
(`captures/session-adc1` … `session-adc22`) produced twenty-one armed actions,
each carrying a direction. The split below is derived from which combatant the
first `damagecharacter` write landed on — the defender takes the damage — and
not from the traces' own `attackerSide`, which is an operator-declared launcher
string that reads `hero` on all twenty:

| Who actually swung | n | `attack_direction` values observed |
| --- | ---: | --- |
| hero | 11 | 8, 8, 7, 8, 7, 6, 8, 8, 6, 7, 7 |
| villain | 9 | 4, 10, 11, **20**, 3, 2, **5**, **20**, 10 |

The twenty-first armed round, `session-adc21`, also drew 20 but has no
`damagecharacter` write at all, so it is not attributed above. The
twenty-second, `session-adc15`, aborted on a special-event screen and never
armed.

Every hero swing on that route is a `normal_attack` — the capture wrapper's
arena autopilot issues that verb and no other attack, its only other steps
being `walkright` and `walkleft` — and **all eleven landed inside
`randomBetween(5, 8)`, none outside**. That confirms the `+0x61f1` row of the
table above from a source with no freedom to be fitted to it: the range was
read off the opcode and written down here before this route existed, and
nothing in a run can select the direction.

It also retires a reading the archive's 1–12 spread previously invited. **The
out-of-band values are not a wider hero range; they are the villain's
attacks**, drawn by the same three sites in the same phase machine, which
serves whoever is swinging. A direction therefore never identifies the
combatant on its own — `session-adc18` is a villain swing at direction 5,
inside the hero's own band.

**Runtime-resolved 2026-08-31 — direction 5 is attainable, and eleven hero
swings without one are not evidence otherwise.** This is the most
operationally load-bearing number in the table: 26 of the 60 committed 1v1
candidates stage direction 5. `randomBetween` is inclusive at *both* bounds,
byte-verified at the definition rather than inferred from behaviour. The
overlay's copy at `sprite:862/frame:52/DoAction@0x23f835` `+0x026a` is

```text
DefineFunction2 randomBetween(a, b)
  +0x0288  Push register:1                       // a  — the addend
  +0x028e  Math.random()
  +0x029f  Push register:2, register:1; Subtract // b - a
  +0x02a7  Push 1; Add2                          // b - a + 1
  +0x02b0  Multiply
  +0x02b1  Math.floor(...)
  +0x02c2  Add2                                  // a + floor(...)
  +0x02c3  Return
```

`register:1` is the low bound and the addend, `register:2` the high bound, and
`Math.random()` is bounded above by 1, so the floor spans `0 … b - a` and the
result spans `a … b` inclusive. The call at `+0x61f1` pushes `numArgs 2,
arg1 5, arg2 8`, so **`P(direction 5) = 0.25` exactly**. The build agrees with
itself: the instruction right after each band's draw tests that band's *low*
bound first — `== 5` → `Attack5` at `+0x6209`, `== 9` → `Attack9` at `+0x60a2`,
`== 1` → `Attack1` at `+0x6374` — so any reading that excluded the low bound
would leave the first animation branch of every band unreachable.

Eleven consecutive hero swings without a 5 is a `0.75^11 = 4.2%` event, which
is unremarkable; and the archive settles it directly. **Eighteen committed
observation records carry `scenario.attackDirection` 5**
(`test/observations/ss2-1v1/`), and sixteen of them put their first mutation on
`/villain/…` — the defender took the damage, so the hero swung. The other two
are misses with an empty mutation trace and carry no evidence either way;
`scenario.attackerSide` is an operator-declared string and settles nothing
here. Those eighteen are genuine live draws even though the runs were
tape-injected, because the direction is assigned *before* the branch's own
`checkattackroll()` call in every band — `+0x6208` before `+0x62ad` for normal,
`+0x608a` before `+0x6146` for power, `+0x635c` before `+0x6418` for quick —
and `checkattackroll` is where the capture window opens. No tape slot can reach
the direction. It is recorded, never dictated.

### Direction 20 is the taunt path (byte-verified; runtime-resolved 2026-08-31)

Direction 20 has exactly one producer in the assignment table above, and the
arena rounds now put a live trace behind it. It is not a special, a spell, a
bow or a critical path.

*The producer.* Inside the `taunt` branch (`+0x679c`) the phase rolls
`diceroll = randomBetween(1, 100)` at `+0x6921` and succeeds when
`diceroll < game_attacker.taunt_percentage` (`+0x694b`), then draws
`taunt_effect = randomBetween(1, 2)` at `+0x6952`. **Only `taunt_effect == 1`
reaches `+0x6981`**, which sets `attack_direction = 20` and calls
`checkattackroll` at `+0x698c`; `taunt_effect == 2` takes the charisma-scaled
knockback / `taunted1` arm and never reaches the dispatcher. Both draws precede
`checkattackroll`, so neither can be observed or injected inside the capture
window — but note that both are `randomBetween`, **not** the `RandomNumber`
opcode, and a successful taunt does **not** skip `checkattackroll`. Its
`+0x698c` call is one of the build's thirteen `checkattackroll` calls (fourteen
references in all: the `DefineFunction2` at `+0x2c2b` plus thirteen calls), and
three arena rounds armed on it. Any capture-side note that describes taunts as
opcode-driven and therefore uncapturable is contradicted by both the bytes and
the traces; that note lives outside this document and is flagged here rather
than corrected.

*Who can issue it.* `taunt` is a `getphase` label three of the four hero
controllers wire — every one but `closerange_warrior`, and on the two long-range
frames only while `staminaleft / staminamax * 100 >= 50` (§Buttons wired per
controller frame) — and `villainChooseAction` writes it from two arms
(byte-verified in that function's own block,
`sprite:862/frame:52/DoAction@0x23f835`):

- in the in-position attack chain, `choices` in `80 … 89` picks `shove` when the
  villain's `equipped_weapon == 1` and `taunt` otherwise (`+0x0746` selecting
  between `+0x074b` and `+0x0758`);
- in **both** out-of-position movement chains — the arm taken while the
  opponent is still closing the distance — `choices` in `85 … 95` picks `taunt`
  when the villain's `staminaleft / staminamax * 100 >= 40` and `rest` below
  that (`+0x0b0f`–`+0x0b74` for one facing, `+0x0e0f`–`+0x0e63` for the other).
  This arm carries **no weapon test**, so a melee villain reaches `taunt` here.

`choices` is itself a `randomBetween(1, 100)` drawn before the phase is
dispatched, so **which arm fired in any given round is not recorded and is not
established here.** The out-of-position arm is the one consistent with the
observed rounds — the hero was still walking in — but that is an inference, not
a measurement, and must not be promoted.

Note the two gates differ: the villain's out-of-position arm needs 40% stamina,
the hero's long-range button 50%. Because the hero can issue `taunt` at all,
direction 20 discriminates the combatant no better than direction 5 does. On
the arena route it happens to be villain-only, but only because the capture
wrapper's arena autopilot never issues the verb — a property of the capture
vehicle, not of the build.

*The live trace.* Three armed rounds recorded direction 20: `session-adc7`,
`session-adc20` and `session-adc21`. In adc7 and adc20 the hero's last
`phase_action` was `walkright`, never an attack verb, and the villain took the
turn; both dispatched `{"t":"event","type":"defender-hurt","method":"taunt"}`
and both wrote `/hero/hitpoints 300 → 297`. Villain `charisma` 1 against hero
`charisma` 1 gives `round(1 * 4) - 1 = 3`, exactly the damage observed. adc21
additionally emitted the forced `criticalhit` sentinel **21** as a raw value.
Between them the three cells of the dispatcher table's direction-20 row —
charisma damage, sentinel 21, `taunt_percentage` — are each corroborated live.

*What the arm draws, which is what a taunt fixture needs.* The dispatcher arm
is short enough to read out in full (`DoAction@0x240c7f`, inside
`checkattackroll`):

```text
+0x2dcc  if (attack_direction == 20) {
+0x2de1    criticalhit = 21;                                   // constant, no draw
+0x2dec    damage = Math.round(game_attacker.charisma * 4)
                      - game_defender.charisma;
+0x2e22    if (damage < 1)
+0x2e37      damage = randomBetween(1, 3);                     // CONDITIONAL draw
+0x2e4f    rollneeded = 100 - game_attacker.taunt_percentage;
         }
```

So the taunt band's arm draws **nothing** when the charisma term lands at 1 or
above and **exactly one** `randomBetween(1, 3)` when it does not — unlike the
5–8 band, whose arm always draws two, and the 1–4 and 9–12 bands, whose arms
draw one. The armed windows measured that: each dispatched direction-20 round
consumed **four** samples against the normal band's seven, and every one of the
three missing draws is separately byte-accounted (§Attack roll dispatcher, the
runtime draw ledger) — the damage draw was skipped because the charisma term
was 3, the critical draw does not exist on this arm, and the knockback block
excludes direction 20 outright. The deflection draw survives because
`deflect_critical = randomBetween(1, 100)` at `+0x3030` sits on the hit branch
unconditionally, ahead of any test of `criticalhit`; and `remove_armour` is
called on this path yet draws nothing, because direction 20 matches none of its
three piece groups.

That is the first runtime evidence bearing on `candidate-taunt-charisma-floor`,
which models the *other* case — hero `charisma` 5 against villain `charisma`
30, so `20 - 30 < 1` and the floor draw fires — with a five-sample tape ordered
hit, taunt-floor damage, deflection, armour-removal, enchantment potency.
Remove the second of those and what is left is exactly the four-sample order
the live rounds consumed.

*Reading those traces.* Every `roll` line in the direction-20 rounds is
labelled `normal-damage-roll [21..23]` and `normal-critical-roll [1..20]`.
**Those are the fixture's tape entries, not the game's arguments**
(§What a capture can and cannot confirm) — the direction-20 arm asked for
neither. Only the *count*, four against the normal band's seven, is an
observation, and the slot-to-call-site mapping in that ledger is read off
emission order, not off any recorded call site.

*Still unresolved.* `session-adc21` carries direction 20, the sentinel 21 and
four served samples, but no `defender_hurt` or `defender_blocked` event, no
`damagecharacter` call and no `remove_armour` call; its four state writes land
on `/villain/…` and are recorded as `"hook":"unattributed"`. It is the one
round of the twenty-one whose draw count is not reconstructed by the ledger
above, and it is not counted as a taunt confirmation here.

Two further things this section does **not** settle. The `taunt_effect == 2`
arm — the charisma-scaled knockback and the `taunted1` write — has no live
trace at all, because it never reaches `checkattackroll` and so never arms.
And the charisma-floor case is still unobserved: every round here had the
attacker's `round(charisma * 4) - defender.charisma` land at 3, so the
`randomBetween(1, 3)` at `+0x2e37` has never actually been drawn in a capture.

### Spell-path reuse of `attack_direction` (byte-verified 2026-08-30)

`cast_weaken_armour` is the only cast path that reuses `attack_direction` as an
armour-piece selector. Its body repeats the pair

```text
attack_direction = 1 + RandomNumber(9);           // +0x7815 / +0x7845 / +0x7875
remove_armour(game_defender, defender, attack_direction);
                                                  // +0x7839 / +0x7869 / +0x7899
```

three times in a row, immediately after `attacker.gotoAndPlay("Cast1")` at
`+0x7800`. Argument binding is verified against the `remove_armour`
`DefineFunction2` header in overlay frame 52 `DoAction@0x23d7fe` `+0x0265`, and
matches the physical-path call in `damagecharacter` (`+0x176a`, `+0x1791`,
pushing `register:3`, `register:5`, `register:6`).

Three boundaries must not be blurred:

- This value is **not** a physical attack direction. It is drawn on a cast
  path, it never reaches `checkattackroll`, and it feeds only the piece-group
  selection inside `remove_armour`. Its `1..9` range also means directions
  10–12, and the group memberships they carry, are unreachable from this path.
- It is a `RandomNumber` opcode draw, so unlike the physical bands it cannot be
  recorded or injected. A `cast_weaken_armour` fixture can only be an
  observation of the outcome, never a controlled sample.
- `magic_damage_character` remains, as byte-verified in its own section below,
  entirely free of any armour-removal call. `remove_armour` has exactly five
  call sites in the build — two in `damagecharacter` and these three — so no
  spell *damage* ingress removes armour; only this one spell *effect* path
  does.
  `cast_whirlwind` and `cast_ghost_strike` write `attack_direction` for the
  physical dispatcher instead and call `checkattackroll` — at `+0x79db` and
  `+0x7a54` for whirlwind (after the same `weapon_range + 50` range gate as
  `psyche_up`, `+0x79a8`/`+0x79c9`) and at `+0x7f77` for ghost strike, which
  first plays `Attack9`–`Attack12` from its drawn band. Neither calls
  `remove_armour`.

The direction-to-piece mapping inside `remove_armour` is fully determined and
applies to both call families (overlay frame 52 `DoAction@0x23d7fe`):

| Directions | Selector | Pieces in selector order |
| --- | --- | --- |
| 1, 5, 8, 9 (`+0x02ac`–`+0x02e2`) | `armour_to_remove = randomBetween(1, 2)` (`+0x02f3`) | helmet (`+0x0320`), shoulderguard (`+0x050a`) |
| 2, 4, 6, 10, 12 (`+0x0595`–`+0x05dd`) | `randomBetween(1, 3)` (`+0x05ee`) | breastplate (`+0x0694`), gauntlet (`+0x07ac`), greaves (`+0x08fb`) |
| 3, 7, 11 (`+0x0986`–`+0x09aa`) | `randomBetween(1, 3)` (`+0x09bb`) | shinguard (`+0x0a97`), boot (`+0x0be6`), shield (`+0x0d35`) |

Every `remove_armour` call therefore consumes exactly one interceptable
`randomBetween` sample, and it is drawn *before* the per-piece
`piece != 0` test (`+0x0328` for helmet, and the matching tests in the other
groups), so the sample is consumed even when the selected piece is not
equipped and nothing is destroyed. A `cast_weaken_armour` cast consumes three
of them.

Directions outside 1–12 fall through all three group tests and
consume nothing; the unmatched path reaches only the trailing
`armourclass` / `armourclass_max` zero-clamp (`+0x0d4d`–`+0x0da4`). That is the
byte-level reason the direction-30 grievous's unconditional `remove_armour`
call cannot destroy equipment, as the earlier section suspected.

**Runtime-resolved 2026-08-30.** The draw-before-the-equipped-test ordering
above, and the physical path's `> 66` removal gate, are now measured — by the
one probe pair whose arms are separated by the **draw count alone**. The pair
`golden-probe-armour-removal-gate-{below,above}` stages a direction-5 hit
against the unarmoured tutorial prisoner and moves only the injected removal
roll, 66 against 67. Events, mutation trace and final state are identical; the
67 arm draws one extra `randomBetween(1, 2)` in the mapped position. So 66 does
not clear the gate and 67 does, and the group selection is drawn even against a
defender who wears nothing in the selected group. Because that defender wears
no armour, the extra draw is the *only* trace the call leaves — which is
exactly why the pair is evidence where a repeated kill capture would not be.

### Attack roll dispatcher

`checkattackroll` is an anonymous function assigned in overlay frame 52. It
calls `attack_chances`, rolls `diceroll = randomBetween(1, 100)`, derives damage
and a critical sample from `attack_direction`, then computes
`rollneeded = 100 - chance`. A hit runs when `diceroll >= rollneeded`; the miss
branch runs only when `diceroll < rollneeded`.

**Runtime-resolved 2026-08-30.** That comparison used to be recorded here as
only *consistent with* the control flow. Three promoted probe pairs settle it.
Each pair stages one fight (attacker attack 1 against defender defence 0, so
`ratio = 10/9`) twice and moves the injected `diceroll` by one, and the arms
separate in an observed channel — `defender-blocked` against `defender-hurt`:

| Band | Direction | `chance` | Miss at | Hit at | Goldens |
| --- | --- | --- | --- | --- | --- |
| quick | 1 | 73 | 26 | 27 | `golden-probe-quick-rollneeded-{miss,hit}` |
| normal | 5 | 56 | 43 | 44 | `golden-probe-normal-rollneeded-{miss,hit}` |
| power | 9 | 37 | 62 | 63 | `golden-probe-power-rollneeded-{miss,hit}` |

The three smallest hitting rolls are exactly `100 - chance`, which is the
inclusive reading. A strict `diceroll > rollneeded` would require chances
74 / 57 / 38, and none of the factors in the table above yields any of them at
this ratio — so the three pairs together decide the comparison's *polarity*,
not merely three thresholds. The miss arms are also evidence for the ordering
in the sentence above — a miss still consumes its band's damage and critical
draws and nothing after them — but only to the strength of the draw count,
which catches a run that drew *fewer* samples than the fixture models more
readily than one that drew more (runtime-capture §Reading divergent traces).
Note what these pairs do **not** establish: the injected dicerolls themselves
are echoed back from the tape, never measured. What the capture measured is
which side of the bracket each arm landed on.

| `attack_direction` | Damage | Critical sample | Chance field |
| --- | --- | --- | --- |
| 1–4 | `min_damage` | `randomBetween(-20, 20)` | `quick_percentage` |
| 5–8 | `randomBetween(min_damage, max_damage)` | `randomBetween(1, 20)` | `normal_percentage` |
| 9–12 | `max_damage` | `randomBetween(5, 20)` | `power_percentage` |
| 20 | `round(attacker.charisma * 4) - defender.charisma`, floored to a random 1–3 | forced sentinel 21 | `taunt_percentage` |
| 21 | `randomBetween(min_damage, max_damage)` | `randomBetween(-20, 20)` | `bombard_percentage` |
| 22 | `min_damage` | 0 | `snipe_percentage` |
| 23 | `ceil(min_damage / 2)` | unchanged; inherits the prior transient value | `bash_percentage` |
| 30 | `ceil(max_damage * 1.5)` with a level-based fallback | forced 20 | `normal_percentage` |

The direction-20 row is the one row of this table now corroborated by a live
trace on all three of its cells, and its damage draw turns out to be
conditional rather than unconditional — see §Direction 20 is the taunt path,
which also reads the arm out opcode by opcode and settles its tape length.

On a hit, direction 30 dispatches `defender_hurt("grievous")`, direction 20
dispatches `defender_hurt("taunt")`, a surviving critical sample of 20
dispatches `defender_hurt("critical")`, and all other hits dispatch
`defender_hurt("normal")`. A separate helmet/greaves roll can deflect a
critical. Its threshold simplifies to
`(100 - 1.5 * game_defender.helmet) + game_defender.greaves`; an inclusive
1–100 roll at or above that threshold clears the critical, except that direction
30 remains grievous. A miss calls `defender_blocked()`.

**Runtime-resolved 2026-08-30 — the comparison, not the formula.** The
inclusive "at or above" reading is now measured. The pair
`golden-probe-deflection-threshold-{critical,cleared}` stages one fight against
a defender wearing neither helmet nor greaves, so the threshold is
`100 - 0 + 0` — the largest
value the roll can take — and move only the deflection roll, 99 against 100.
The arms are identical in mutations, final state and draw count; the single
channel that moves is the dispatched method, `critical` against `normal`. A
strictly-above reading would have predicted `critical` on both. This settles
the boundary and nothing else: the operand mix in the threshold formula is
still unobserved, and `candidate-deflection-threshold-discriminator`, whose
injected roll 85 sits between the rival readings 83 < 85 < 87 against helmet 10
and greaves 2, is still the fixture that would settle it.

`defender_hurt` selects an animation label (`hurtN`, adjusted for ranged
directions, or `knockback`), calls
`damagecharacter(defender, attacker, game_defender, game_attacker,
damage_method, attack_direction)`, then plays the defender animation. The
animation label is `"hurt" + attack_direction` (`+0x2086`), rewritten to
`"hurt" + (attack_direction - 20)` for directions 21–23 (`+0x2093`–`+0x20d6`)
and replaced by `knockback` when the direction is 30 (`+0x20dd`–`+0x20ec`).

**Knockback dispatch gate (byte-verified 2026-08-30).** Knockback is not
dispatched on every hit, and the map previously documented only the force.
Inside `damagecharacter`, with `register:6 = attack_direction`, the whole
knockback block is guarded by a short-circuit chain at `+0x1a72`–`+0x1aa5`:
`attack_direction >= 5` (`+0x1a7c`) **and** `attack_direction <= 12`
(`+0x1a90`), **or** `attack_direction == 30` (`+0x1aa3`). Any other direction
jumps to `+0x1be4` and the block is skipped entirely. Directions 1–4 (quick),
20 (taunt), 21 (bombard), 22 (snipe) and 23 (bash) therefore never enter it.

Inside the gate the first statement is
`randosmash = randomBetween(1, 4)` (`+0x1aaa`). The force is applied when
`randosmash > 3` (`+0x1ac8`–`+0x1ad2`), and otherwise only when
`attack_direction == 30` (`+0x1ad8`–`+0x1ae4`); direction 30 always applies it.
Both rules match the isolated resolver's `knockback` block. Two consequences
for tape alignment: the `randomBetween(1, 4)` sample exists only on the 5–12
and 30 paths, so a quick-band fixture's tape is genuinely one sample shorter
than a power-band or normal-band fixture's; and the sample is still **drawn**
on direction 30 even though its value cannot change the outcome, so it must
still occupy a tape slot there.

**Runtime-resolved 2026-08-31 — the whole physical draw ledger, reconstructed
with no free parameter.** Draw count is one of the very few things a capture
observes directly rather than echoes (§What a capture can and cannot confirm),
and the twenty-two arena rounds of 2026-08-31 supply an unusually clean sample:
**every one of them ran the same seven-entry normal-band tape**
(`candidate-armoured-deflection-threshold-cleared`) while the game drew the
direction itself, so the direction varied and the input did not. Twenty rounds
reached a dispatch, and their `roll` counts are a perfect function of the band:

| Band | Directions seen | Rounds | `roll` lines | `remove_armour` called |
| --- | --- | ---: | ---: | --- |
| quick | 2, 3, 4 | 3 | **6** | 3 of 3 |
| normal | 5, 6, 7, 8 | 12 | **7** | 0 of 12 |
| power | 10, 11 | 3 | **7** | 3 of 3 |
| taunt | 20 | 2 | **4** | 2 of 2 |

Each count is reproduced exactly by the opcodes, with the served fraction
`(value - min + 0.5) / (max - min + 1)` re-scaled into whatever range the game
actually asked for:

| # | Draw | quick | normal | power | taunt |
| --- | --- | :---: | :---: | :---: | :---: |
| 1 | `diceroll = randomBetween(1, 100)` | ✔ | ✔ | ✔ | ✔ |
| 2 | band damage draw | — (`min_damage`) | ✔ `(min, max)` | — (`max_damage`) | — (charisma) |
| 3 | band critical draw | ✔ `(-20, 20)` | ✔ `(1, 20)` | ✔ `(5, 20)` | — (const 21) |
| 4 | `deflect_critical` (`+0x3030`, hit branch, unconditional) | ✔ | ✔ | ✔ | ✔ |
| 5 | armour-removal chance in `damagecharacter` | ✔ → **93** | ✔ → **12** | ✔ → **93** | ✔ → **98** |
| 6 | `remove_armour` group selector | ✔ (93 > 66) | — (12 ≤ 66) | ✔ (93 > 66) | — (dir 20 maps to no group) |
| 7 | `randosmash = randomBetween(1, 4)` (`+0x1aaa`) | — (gate) | ✔ | ✔ | — (gate) |
| 8 | enchantment potency | ✔ | ✔ | ✔ | ✔ |
| | **total** | **6** | **7** | **7** | **4** |

Three static claims are settled by that arithmetic, each because changing it
alone would move a count that was measured:

- **The knockback gate is confirmed live.** If `randosmash` were drawn for
  directions 1–4 the quick rounds would read 7, and for direction 20 the taunt
  rounds would read 5. They read 6 and 4.
- **The `> 66` removal gate is confirmed at both ends, in the same tape.**
  Because the band's draw count shifts the tape position, the armour-removal
  chance lands on a different fixture entry per band — 93 for quick and power,
  12 for normal, 98 for taunt — and `called:remove-armour` appears in exactly
  the rounds where that value exceeds 66, in all twenty.
- **"Directions outside 1–12 consume nothing in `remove_armour`" is confirmed**
  — at direction 20 rather than the direction-30 case the map flagged as
  needing runtime confirmation. The taunt rounds call `remove_armour` (98 > 66)
  and still draw no group selector, which is the only reason their total is 4
  and not 5.

What this does *not* establish is which served slot belongs to which call site:
the `label`, `min` and `max` on every one of those lines are the fixture's tape
entries, so the row assignment above is read off emission order and off the
re-scaled value, never off a recorded call site.

`session-adc21` is excluded from the table. It drew direction 20 and consumed
four samples but dispatched no `defender_hurt` / `defender_blocked` event and
called neither `damagecharacter` nor `remove_armour`; see §Direction 20 is the
taunt path.

Physical knockback force is signed
`damage + game_attacker.strength * 6` and forced to a minimum magnitude of
20 — where `damage` is the timeline-aliased register read AFTER the
armour-overflow rewrite (byte-verified 2026-08-30: the force reads
`this.damage` at `+0x1afd`/`+0x1b60`, the same storage rewritten to the
overflow remainder at `+0x1848`), so an armour-overflowing hit knocks back
with the overflow remainder, not the selected damage.
A defender facing left receives the positive force; other mapped facing values
receive the negative force.
A magnitude above 80 selects the knockback animation, but the unbounded force is
still passed to `knockback`; 80 is not a force clamp.

`damagecharacter`:

- rounds damage upward;
- uses different damage-splat/crowd cues for critical, taunt, and grievous;
- makes every physical damage invocation roll an inclusive 1–100 armour-removal
  chance and call `remove_armour` when the roll is greater than 66; grievous
  also calls it once unconditionally. The removal function only maps directions
  1–12 into piece groups, so the direction-30 grievous calls appear to be
  no-ops for equipment in this build and require runtime confirmation;
- subtracts normal/grievous damage from `armourclass` first, carrying only
  overflow into `hitpoints`; critical damage bypasses that armour-class branch
  even though its separate removal roll can still destroy a piece;
- runs the breastplate stamina block as an unconditional join on every
  invocation (byte-verified 2026-08-30: the absorbed-armour skip branch
  `+0x189c If` jumps directly to the stamina block at `+0x18f3`), granting
  `ceil(game_defender.breastplate * damage / 100)` stamina where `damage` is
  the current register — the full rounded-up damage when armour fully
  absorbed the hit or on non-armour paths, and the overflow remainder after
  an overflow rewrite; helper semantics: `get_percentage(a, b) = (a / b) *
  100` and `add_percentage(a, b) = ceil(a * b / 100)`;
- when `damage_method` is `taunt`, sets crowd action 3 and then overwrites
  the method register to `normal`, so taunt damage takes the normal
  armour-first path (and the crowd value is immediately overwritten to 2 in
  the armour block);
- can set `burning`, `frozen`, `poison`, or `life_stolen` from weapon
  enchantment types 2–5 after a potency roll. When the secondary weapon is
  active, the type comes from its secondary field but the comparison still
  reads the primary weapon potency field in this build;
- ends with the byte-verified defeat gate described below.

### Defeat gate and death dispatch (byte-verified 2026-08-30)

Both damage ingresses end with the same gate, decoded opcode-by-opcode from
`damagecharacter` (`+0x194a..+0x1a71`) and `magic_damage_character`
(`+0x14ee..+0x157c`) in overlay block `DoAction@0x240c7f`.

**Independently re-decoded 2026-08-30.** This gate had been read by one agent
only, and it is load-bearing for the three `candidate-tournament-*` fixtures, so
it was decoded a second time from scratch. The condition reproduces exactly.
`damagecharacter`, with `register:2 = _global` and `register:3 = game_defender`:

```text
+0x194a  hitpoints                       ; push
+0x1952  0                               ; push
+0x195e  Greater      -> hitpoints > 0
+0x195f  Not          -> hitpoints <= 0                        [A]
+0x1960  Duplicate
+0x1961  If  -> +0x198f                  ; short-circuit ||, A stays on the stack
+0x1966  Pop
+0x1967  hitpoints
+0x196f  hitpointsmax
+0x1977  Less2        -> hitpoints < hitpointsmax              [B]
+0x1978  Duplicate
+0x1979  Not
+0x197a  If  -> +0x198f                  ; short-circuit &&, false stays
+0x197f  Pop
+0x1980  _global.fight_mode
+0x1988  "tournament"
+0x198d  Equals2
+0x198e  Not          -> fight_mode != "tournament"            [C]
+0x198f  Not                             ; merge: value = A || (B && C)
+0x1990  If {delta 221} -> +0x1a72       ; skip the block when !value
```

- The defeat block is entered iff `hitpoints <= 0` **or** (`hitpoints <
  hitpointsmax` **and** `_global.fight_mode != "tournament"`). The second
  term is a first-blood-style condition the earlier map wording did not
  record: statically, any post-`check_stats` damage below maximum enters the
  block in every non-tournament mode. The `+0x1990` jump target `+0x1a72` is
  the first opcode of the knockback gate, so the defeat block is exactly
  `+0x1995`–`+0x1a71`.
- The dispatch offsets reproduce too: `phasecomplete` at `+0x1995`, the duel
  test at `+0x199f` branching to `death(clip, "yield")` at `+0x1a62`, then
  `<= 12` → `slain` `+0x19c6`, `== 20` → `taunt` `+0x19ec`, `21..23` → `arrow`
  `+0x1a27`, `== 30` → `grievous` `+0x1a4d`, and the fall-through `Jump` at
  `+0x1a5d` for every other direction — which reaches `+0x1a72` with
  `phasecomplete` set and no `death` call, as recorded below.
- `magic_damage_character` matches statement for statement with no direction
  chain: condition `+0x14ee`–`+0x1534`, `phasecomplete` `+0x1539`, duel test
  `+0x1543`, `slain` `+0x1558`, `yield` `+0x156d`.
- On entry, `_global.phasecomplete = true` is set first, unconditionally,
  before any `death` call.
- `fight_mode == "duel"` always calls `death(defenderClip, "yield")`,
  including genuine kills; duel kills never route to `slain`.
- Otherwise `damagecharacter` dispatches by `attack_direction`:
  `<= 12` → `slain`, `== 20` → `taunt`, `21–23` → `arrow`, `== 30` →
  `grievous`; directions 13–19, 24–29, and 31+ set `phasecomplete` without
  any `death` call (statically unreachable from the mapped dispatcher).
  `magic_damage_character` has no direction chain and always uses `slain`
  outside duels.
- `death(whichcharacter, how_died)` itself contains no hitpoint or
  `fight_mode` reads (verified: its only branches are the two clip
  comparisons).
- **Runtime-resolved 2026-08-30** (first live captures): ordinary arena
  duels run with `_global.fight_mode = "duel"`, so the non-tournament
  `hitpoints < hitpointsmax` term is simply the **first-blood duel rule** —
  the fight ends via `death(clip, "yield")` on the first hitpoint damage,
  and a fully armour-absorbed hit does not trigger it (observed directly:
  44 armour absorbed a 23-damage hit with no defeat). The candidate
  resolver now models the full verified gate via the optional
  `scenario.fightMode` field (absent means tournament, the earlier implicit
  assumption): first-blood defeats carry `reason: "first-blood"`, duels die
  by `howDied: "yield"`, and other modes dispatch the death string by
  direction. A third live capture (a first-blood duel kill) matched the
  modeled gate formally. The live `fight_mode` of tournament/campaign
  battles is still to be observed (every capture records it for free).

### Spell ingress `magic_damage_character` (byte-verified 2026-08-30)

`magic_damage_character(defender, attacker, game_defender, game_attacker,
damage_method, bonus_frame, damage)` — DefineFunction2 at `+0x1313..+0x157c`
of the same block; register bindings byte-verified from the header param
table (`r1=_global` via PreloadGlobal, `r2=game_defender`, `r3=damage`,
`r4=defender` clip, `r5=damage_method`, `r6=bonus_frame`; `attacker` and
`game_attacker` are not register-bound). Verified order:

1. Attaches `bonus_icon` at depth 25005, offset ±100 by the defender's
   facing, splat frame from `bonus_frame`, displayed bonus
   `Math.ceil(damage)`, `check_flipping`, crowd action 2, then
   `defenderClip.gotoAndPlay(damage_method)` — i.e. for this ingress the
   `damage_method` argument is the defender's animation label and
   `bonus_frame` selects the splat.
2. Armour-first algorithm identical to the physical path, including the
   exact-armour-equality quirk (equality skips the overflow rewrite, so the
   full original damage also reaches hitpoints) and the strict-overflow
   rewrite `damage -= originalArmour` with `armourclass_temp` zeroed only on
   strict overflow; `armourclass` is left negative until `check_stats`
   clamps it.
3. The hitpoints subtraction is gated on post-decrement `armourclass <= 0`;
   the **applied** damage is the raw `damage` argument (possibly
   overflow-rewritten) — unlike the physical path there is **no**
   `Math.ceil` before the armour/hitpoint math; the ceil at step 1 is
   display-only.
4. `game_defender.psyche_up = 1` unconditionally at the join.
5. The same unconditional breastplate stamina join as the physical path.
6. `check_stats(game_defender)`, then the shared defeat gate above.

The function contains **no** RNG call, no `RandomNumber` opcode, and no
armour-removal call — its complete call inventory is the UI attach/goto
calls, `Math.ceil`, `check_flipping`, `get_percentage`, `add_percentage`,
`check_stats`, and the two `death` sites. Spell damage rolls therefore all
happen in the callers (the mapped `randomBetween` ranges), and a future
spell-ingress candidate needs no removal or knockback samples.

Two transient/boundary behaviors need explicit runtime fixtures. Direction 23
does not assign `criticalhit`, so bash can inherit the previous action's value.
When incoming normal/grievous damage exactly equals remaining armour, bytecode
sets armour to zero but does not rewrite the local damage register to overflow;
the subsequent non-positive-armour branch therefore appears to apply the full
original damage to hitpoints. Both are recorded as static candidates, not
promoted vanilla rules.

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
`swap_weapons`, and `psyche_up`. The two arms that write `taunt` — and so the
only routes by which a villain reaches `attack_direction` 20 — are byte-read in
§Direction 20 is the taunt path.

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
result boundary. It clears the status flags on both vanilla objects in the
byte-verified order frozen, burning, poison, life_stolen — the hero's group
first, then the villain's — followed by taunted1 (hero, villain) and
taunted2 (hero, villain), assigns the death sequence, then compares the
defeated clip with `arena.gladiators.villain` or `.hero`:

- defeated villain -> `this.gotoAndPlay("combatwon")` on the overlay controller;
- defeated hero -> `this.gotoAndPlay("combatlost")` on the overlay controller.

It then removes the attacker/defender `onEnterFrame` handlers and deletes
`nextphase`. Overlay frames 62 and 74 bridge those labels to
`_root.arena.gotoAndPlay("combat_won")` and `"combat_lost"`, respectively.
There is no generic team-result callback.

The root `arena` instance is sprite 2249. Its result timeline includes:

- exactly seven labels, confirmed with `--labels --timeline 'sprite:2249'` on
  334 declared frames: `initbattle` frame 1 (span 1–70), `combat` 71 (71–80),
  `combat_won` 81 (81–93), `combat_wonitem` 94 (94–188), `combat_delay` 189
  (189–221), `combat_exp` 222 (222–249), and `combat_lost` 250 (250–334);
- frame 88: attaches export 777, `fight_win_stuff`, and settles the win —
  gold, battle counters, and the branch below;
- frames 94–188 (`combat_wonitem`): the **tournament**-victory screen, not the
  ordinary one; frame 182 attaches the `won_tournament` linkage at depth
  100005 and the span stops at 188;
- frames 189–221 (`combat_delay`): animation only; frame 222 removes
  `won_tournament` and reveals `fight_win_stuff`; frame 231 awards experience
  and detects a level-up; frame 249 stops on the reward panel;
- frame 315: increments fights and losses, restores the hero, clears
  `battle_started`, sends tournament losses to game-over, or otherwise deducts
  `ceil(herolevel^2 * 50)` gold (clamped at zero) and displays
  `fight_over_lost` (character 2247);
- button 775 release handles final win, level-up, tournament, foyer/daybreak,
  and town-square transitions; button 778 is tournament-win progression;
- the non-tournament loss panel embeds button 2244, whose release returns the
  root timeline to the town square.

**Correction: the reward is not `ceil(herolevel^2 * 50)`.** An earlier revision
of this map recorded that figure as the fight reward. It is the **loss
deduction** — `goldlost = ceil(herolevel * herolevel * 50)`, clamped at zero,
computed on the loss frame 315 (`+0x041d`–`+0x046a`). The win reward is a
different formula on a different frame, and this map did not record it at all:

```text
_root.game.hero.goldpieces += round(_root.game.villain.character_xp
                    * (100 + _global.crowd_interest) / 100);  // 2249/frame:88 +0x078c..+0x07ff
if (_root.game.hero.herolevel == 1)                           // test +0x0867..+0x0889
    _root.game.hero.goldpieces = 2500;                        // flat SetMember +0x08ae
```

`character_xp` is a `battlevalues` derivation on the *defeated opponent*, not a
stored field, and `crowd_interest` is derived from `herolevel` at
`sprite:2224/frame:1` `+0x0f48` with a `RandomNumber(899)` opcode draw. Four
consequences worth stating.

The reward is a function of the **defeated** combatant's damage, enchantments,
armour and level, not of the winner's — though generated opponents are built at
the hero's own level, so in ordinary play the two track each other.

Because `crowd_interest` comes from the opcode rather than `randomBetween`,
**the win gold is neither recordable nor injectable** by a capture wrapper.

The level-1 override is a flat set, not an addition, and it is a set of the
**whole purse**: `+0x08ae` pushes the literal 2500 straight onto
`_root.game.hero.goldpieces`, discarding both the prior balance and the reward
the `+=` at `+0x079e` just added. `+0x0894` — a nearby offset easy to mistake
for the money write — sets only the `fight_win_stuff.goldwon` display string
("a gift from the emperor…"); the same field is given the computed-reward text
at `+0x0806`–`+0x0866` on the ordinary arm.

And `villain.character_xp` is read **frozen**. Its only writer is
`battlevalues` at `+0x3b82`, which sits inside that function's
`battle_started == true` skip (§Combatant state objects), so it still holds the
value derived when the opponent was generated — computed while
`armourclass == armourclass_max`. A fight that strips the loser's armour to
nothing pays the same gold as one that does not.

**Correction: an ordinary win skips frames 94–188.** This map previously
described frames 94/189/222/231 as a single run of "win item/reward/transition
processing". Frame 88 branches instead:

```text
if (_global.tournament_in_progress == true) {                 // +0x0925
    hero.tournament_ranking -= 1;                             // +0x094f
    if (hero.tournament_ranking == 1)                         // +0x0973..+0x0995
        gotoAndPlay("combatwonitem");                         // +0x099a  (inert, below)
    else gotoAndPlay("combat_delay");                          // +0x09b1
} else gotoAndPlay("combat_delay");                            // +0x09c7
```

So with `tournament_in_progress` true and the post-win `tournament_ranking`
reaching 1 it heads for the tournament screen, and in every other case —
including every non-tournament win — it goes straight to `combat_delay` at 189.
The label written on the tournament arm is `combatwonitem`, while the label
defined on sprite 2249 is `combat_wonitem`, so that `gotoAndPlay` matches
nothing and is inert; the playhead simply runs on from 88 into 94, which is
where it was going. A reconstruction must not "fix" that into a real jump.

All three of the above were first decoded in [the leveled-gladiator arena
route](ss2-arena-route.md) §4 and §7. They have since been **re-read here from
the same installed SWF and fingerprint** — the win `+=` and its operands, the
level-1 flat set, the `goldlost` deduction and its zero clamp
(`+0x047d`–`+0x04ec`), the frame-88 branch above, and the sprite-2249 label
spans — and every offset reproduced.

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

## Golden-harness checkpoint

The asset-free [1v1 golden harness](ss2-golden-harness.md) now supplies the
fingerprint-keyed candidate schema, strict ordered `randomBetween` and
`RandomNumber` tape, isolated physical-attack reconstruction, and one-shot
result bridge. It does not change `classicStyleRules`, and its static candidates
do not yet count as vanilla parity.

**Twenty-two goldens are promoted** as of 2026-08-30, all from the one staged
tutorial fight: twelve kills covering all twelve melee directions
(`golden-prisoner-quick-kill-dir1..4`, `golden-prisoner-normal-kill*` at 5–8,
`golden-prisoner-power-kill-dir9..12` — all three bands now complete; an earlier
revision of this section said eighteen and "the quick band has no kill golden
yet", which the quick-band campaign has since overtaken) and ten
`golden-probe-*` in five pairs. The probes are
the reason four claims in this map moved from static reading to measurement:
the dispatcher's `>=` hit comparison and each melee band's `rollneeded`
(§Attack roll dispatcher), the inclusive critical-deflection boundary (same
section), and the `> 66` removal gate with its draw-before-the-equipped-test
ordering (§Spell-path reuse of `attack_direction`). Each pair moves one
injected value and is predicted to separate in a channel the capture genuinely
observes; the staging behind them is in
[the capture staging guide](ss2-capture-staging.md).

## Next checkpoint

The controlled capture, verification, and promotion pipeline for these steps
is specified in [the runtime-capture workflow](ss2-runtime-capture.md).

1. Observe the boundary, miss, armour overflow/equality, status, critical, and
   result candidates in controlled licensed 1v1 runs.
2. Finish unresolved spell/status duration and action-to-animation ordering.
3. Promote exact repeated observations to runtime goldens and correct any
   divergent candidates.
4. Add canonical SS2 equipment/status state and an event/UI adapter while
   preserving the generic 1–3 combatant engine.
5. Render two static ally slots using a `clipByCombatantId` registry, then move
   through 2v2 AI to 2v2 and 3v3 cooperative campaign support as tracked in the
   [roadmap](../roadmap.md).

## Reproduce the read-only inventory

With Node available and `$ss2Install` pointing to the Collection directory:

```powershell
$ss2Install = 'C:\Program Files (x86)\Steam\steamapps\common\Swords and Sandals Classic Collection'
node tools/inspect-swf.mjs "$ss2Install\swf\swords_sandals2_download.swf"
node tools/inspect-swf.mjs "$ss2Install\swf\swords_sandals2_download.swf" --function '^attack_chances$' --max-actions 900
node tools/inspect-swf.mjs "$ss2Install\swf\swords_sandals2_download.swf" --references 'fight_over_win|fight_over_lost|combatwon|combatlost'
```

The inspector also supports `--function-names`, `--references`, `--around`, and
`--labels [regex]` with an optional `--timeline <regex>`. The label tables in
this map are reproduced with:

```powershell
node tools/inspect-swf.mjs "$ss2Install\swf\swords_sandals2_download.swf" --labels --timeline 'sprite:862'
node tools/inspect-swf.mjs "$ss2Install\swf\swords_sandals2_download.swf" --labels --timeline 'sprite:2249'
```

These commands print analysis only; do not redirect decompiled game
code or assets into the repository.
