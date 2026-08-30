# SS2 leveled-gladiator arena route

Status: read-only static map, recorded 2026-08-30. Companion to
[the battle map](ss2-battle-map.md); same licensed build, same
[fingerprint](ss2-build-fingerprint.json), same inspection boundary. It contains
no game code, artwork, audio, exported scripts, or game binaries — only frame
labels, symbol names, character ids and instruction offsets.

Everything below was read from the installed
`swf/swords_sandals2_download.swf` in place. Nothing was launched, patched,
copied or exported; no save was touched.

## Why this document exists

Every capture so far reaches its fight the same way: the wrapper loads a saved
gladiator, jumps to `daybreak`, and the game routes a **level-1** hero into the
dungeon prologue and the tutorial prisoner. The
[staging analysis](ss2-capture-staging.md) found 13 of 17 remaining candidate
fixtures unreachable from that pair — they need armour on a combatant, a
`tournament` fight mode, or a non-lethal outcome.

This document maps the other route: a **leveled gladiator in the ordinary
arena**, which skips the dungeon branch entirely.

## Method note — FrameLabel decode

The project inspector does not decode `FrameLabel` (tag 43); the battle map
records that as an open question for sprite 862. For this map, tag 43 was
decoded with a throwaway out-of-repo reader that prints label→frame numbers
only (no action bytes, no assets). Two results settle open items:

- **Sprite 862 has exactly eight labels**, at frames 1, 5, 13, 20, 28, 52, 62
  and 74 — the same eight the battle map already verified from the action
  stream. There is **no ninth label** in the 38–51 gap. The battle map's
  "cannot be excluded from the action stream alone" caveat can be closed.
- The root timeline's 26 labels are listed below. `daybreak` is frame **96**,
  not 113; frame 113 is the last frame of the `daybreak` span and holds the
  routing decision.

### Root timeline labels (character 0)

| Label | Frame | Span ends | How the span rests |
| --- | --- | --- | --- |
| `splash` | 10 | 34 | frame 34 `GotoFrame2` self-loop |
| `new_or_continue` | 35 | 53 | frame 53 `GotoFrame2` self-loop (settles 52↔53) |
| `credits` | 54 | 59 | frame 54 `Stop` |
| `help` | 60 | 64 | frame 64 `GotoFrame2` self-loop |
| `createchar` | 65 | 72 | frame 72 `GotoFrame2` self-loop |
| `createboss` | 73 | 78 | frame 78 `GotoFrame2` self-loop |
| `showfig` | 79 | 83 | frame 83 `GotoFrame2` self-loop |
| `load_saved_gladiators` | 84 | 88 | frame 88 `GotoFrame2` self-loop |
| `delete_gladiator` | 89 | 95 | frame 95 `GotoFrame2` self-loop |
| **`daybreak`** | **96** | **113** | frame 113 conditional self-loop — see §1 |
| `dungeon` | 114 | 149 | frame 149 `Stop` |
| **`townsquare`** | **150** | **159** | frame 159 `GotoFrame2` self-loop (settles 158↔159) |
| `special_event` | 160 | 164 | frame 164 `Stop` |
| `special_event_result` | 165 | 169 | frame 169 `Stop` |
| `armoury` | 170 | 178 | frame 178 `Stop` |
| `weaponshop` | 179 | 186 | frame 186 `Stop` |
| `magicshop` | 187 | 194 | frame 194 `Stop` |
| `church` | 195 | 201 | frame 201 `Stop` |
| **`foyer`** | **203** | **208** | frame 208 `Stop` |
| `arena_intro` | 214 | 220 | frame 220 `Stop` |
| `arena` | 221 | 226 | frame 226 `Stop` |
| **`levelup`** | **227** | **234** | frame 234 `Stop` |
| `gameover` | 235 | 241 | frame 235 `Stop` |
| `bugs` | 242 | — | frame 242 `Stop` |
| `gameover_demo` | 252 | — | frame 252 `Stop` |
| `enter_highscore` | 263 | — | — |

### Other label sets used below

| Symbol | Labels |
| --- | --- |
| `foyer` (character 2095, instance `_root.foyer`) | `enter` 1, `browse` 11, `tournament` 22; `Stop` at 21 and 36 |
| `arena` (character 2249, instance `_root.arena`) | `initbattle` 1, `combat` 71, `combat_won` 81, `combat_wonitem` 94, `combat_delay` 189, `combat_exp` 222, `combat_lost` 250; `Stop` at 71, 188, 249, 334 |
| armoury shop (character 1909, instance `_root.armoursmith`) | `enter` 1, `browse` 26, `angry` 27, `buy` 37, per-piece pages 48–177, `getitem` 184 |
| weapon shop (character 1961, instance `_root.weaponsmith`) | `enter` 1, `browse` 26, `angry` 27, `buy` 37, `bashing1..3` 48/56/64, `hacking1..3` 72/80/88, `slashing1..3` 96/106/116, `ranged1..3` 124/131/139, `getitem` 147 |
| dungeon prologue (character 1788, instance `_root.dungeon_intro`) | `beginfight` 75 |
| day/night clip (character 1772, instance `_root.day_night`) | no labels; plays 1→107 and `Stop`s at 107 (`sprite:1772/frame:107/DoAction@0x4405f6` `+0x0070`) |

## 1. The `daybreak` routing decision

Root frame 113, `DoAction@0x4406d8`, is the whole decision. Two independent
`if` statements, not an if/else:

```text
if (_root.game.hero.herolevel > 1) {                 // +0x0069..+0x0079
  if (_root.day_night._currentframe == 80)           // +0x0084..+0x009a
    _root.gotoAndPlay("townsquare");                 // +0x009f
  else
    gotoAndPlay(_currentframe - 1);                  // +0x00b8..+0x00cc
}
if (_root.game.hero.herolevel == 1) {                // +0x00e2..+0x00f2
  if (_root.day_night._currentframe == 80)           // +0x00fd..+0x0113
    _root.gotoAndPlay("dungeon");                    // +0x0118
  else
    gotoAndPlay(_currentframe - 1);                  // +0x0131..+0x0145
}
                                                     // +0x0149 End
```

Consequences:

- **`herolevel > 1` → root `townsquare` (frame 150). `herolevel == 1` → root
  `dungeon` (frame 114).** The dungeon arm is the only path to
  `_root.dungeon_intro` (character 1788), whose `beginfight` frame 78 is the
  single site in the build that sets `fight_mode = "misc"`. A leveled hero
  therefore never sees the prologue, never runs `unleash_hell` from sprite 1788,
  and never enters `misc` mode.
- Neither arm fires for `herolevel` 0, `undefined`, or a non-numeric value.
  Frame 113 has no `Stop`, so the playhead would advance into the dungeon span
  and run the prologue anyway. A navigator must be certain `herolevel` is a
  number before jumping to `daybreak`.
- Both arms gate on the sunrise clip reaching **exactly** frame 80. The self-
  loop is `gotoAndPlay(_currentframe - 1)`, so the root re-tests frame 113 once
  every two ticks while `_root.day_night` advances one frame per tick. The
  existing prisoner navigator clears this wait reliably, so in practice the
  phase lands on the even sample that includes 80 — but the equality is exact
  and `day_night` stops at 107 and never returns, so a phase slip would hang
  the screen forever. **Unverified**: whether the parity is guaranteed or
  incidental. A run that stalls at root frame 113 with `day_night._currentframe
  == 107` would settle it; the navigator should time-limit this step and say so
  in the log rather than waiting silently.
- The daybreak span costs ~80 ticks ≈ 2.7 s at 30 fps. That is the entire cost
  of the leveled route's approach, against the dungeon prologue's ~84 % of
  current capture runtime.

## 2. The post-`daybreak` screen for a leveled hero

### Town square (root frame 150)

Root frame 150 `DoAction@0x5a6490` on entry:

| Step | Offset | Effect |
| --- | --- | --- |
| 1 | `+0x041c` | `day_night_cycle()` |
| 2 | `+0x0454` | `delete_tooltips()` |
| 3 | `+0x0470` | `_global.battle_started = false` |
| 4 | `+0x0484`–`+0x04c6` | if `gamephase == 1`, set it to 2 and show the first tutorial tooltip |
| 5 | `+0x04cd`–`+0x0504` | if `gamephase == 5`, show the post-first-fight tooltip |
| 6 | `+0x0505` | attach `townhero` linkage as `hero` at depth 300 inside `_root.townsquare` |
| 7 | `+0x0528` | `constructDNA()` |
| 8 | `+0x053e` | `skincharacter(_root.game.hero, this.townhero)` |
| 9 | **`+0x0585`** | **`save_character(_global.current_character)`** |
| 10 | `+0x0605` | attach `charsheet` at depth 99888 |

Step 9 is the hazard described in §8.

The five building buttons live inside the town clip (character 1809, instance
`_root.townsquare`, placed at root frame 150 depth 59), all at sprite 1809
frame 1. Each is a `DefineButton2` whose entire body is a single call at
`+0x0000`:

| Button | Depth | Body |
| --- | --- | --- |
| 1792 | 353 | `_root.gotoAndPlay("armoury")` |
| 1796 | 355 | `_root.gotoAndPlay("weaponshop")` |
| **1800** | **357** | **`_root.gotoAndPlay("foyer")`** |
| 1804 | 359 | `_root.gotoAndPlay("magicshop")` |
| 1808 | 361 | `_root.gotoAndPlay("church")` |

Root frame 158 `DoAction@0x5abc80` runs the day/night music and one branch that
matters: at `+0x0289`–`+0x02bd`, if `_global.time_of_day >= 200` it sets
`_global.special_event = 1` and jumps the root to `special_event` (frame 160).
`time_of_day` is written at only four sites in the build — button 1669
`+0x0104` (=24), button 2283 `+0x023a` (=24), button 775 `+0x0613`
(`1 + RandomNumber(23)`), and button 1827 `+0x011f` (same) — so **nothing
advances the clock per fight.** A navigator that establishes `time_of_day = 24`
the way button 1669 does can loop duels indefinitely without ever tripping the
special-event branch or needing another `daybreak`.

### The arena foyer (root frame 203, `_root.foyer`)

Foyer frame 1 (`enter`), `DoAction@0x62e212`:

```text
delete_tooltips();                                   // +0x01e7
if (_global.gamephase < 5) tooltips(...);            // +0x01fd..+0x023a
shopkeeper.gotoAndPlay("normal");                    // +0x023b
tournament_number         = Number(_root.game.hero.current_tournament);   // +0x024f
tournament_level_required = _root["tournament"+n][0];                     // +0x026b
tournament_max_gladiators = _root["tournament"+n][1];                     // +0x028b
tournament_arena          = _root["tournament"+n][2];                     // +0x02a7
tournament_name           = _root["tournament"+n][3];                     // +0x02c3
tournament_desc           = _root["tournament"+n][4];                     // +0x02df
tournament_arena_name     = _root.arena_names[tournament_arena];          // +0x02fb
if (_global.tournament_in_progress != true)
  _root.game.hero.tournament_ranking = tournament_max_gladiators;         // +0x0311..+0x0344
if (_global.tournament_in_progress == true) gotoAndPlay("tournament");    // +0x035d
else                                        gotoAndPlay("browse");        // +0x0371
```

These are **foyer-scoped** timeline variables, readable from outside as
`_root.foyer.tournament_level_required` and so on. That makes them the cleanest
available state checks: the game itself computes which mode the hero qualifies
for.

The `tournamentN` tables are built in root frame 35 `DoAction@0x3fa9dc`
(`+0x511c`–`+0x53c8`, twenty entries). Index 0 is the required level, 1 the
field size, 2 the arena id:

| `current_tournament` | Level required | Field size | Arena id |
| --- | --- | --- | --- |
| 1 | 4 | 4 | 2 |
| 2 | 7 | 5 | 2 |
| 3 | 9 | 6 | 2 |
| 4 | 12 | 7 | 3 |
| 5 | 15 | 8 | 3 |
| 6 | 18 | 9 | 3 |
| 7 | 21 | 10 | 1 |
| 8 | 24 | 11 | 3 |
| 9 | 27 | 12 | 4 |
| 10 | 30 | 13 | 4 |
| 11 | 33 | 14 | 4 |
| 12 | 36 | 15 | 5 |
| 13 | 39 | 16 | 1 |
| 14 | 42 | 17 | 5 |
| 15 | 44 | 18 | 5 |
| 16 | 46 | 19 | 5 |
| 17 | 48 | 20 | 6 |
| 18–20 | 50 | 20 | 6 |

`arena_names` is built at `+0x50f9` of the same block; index 1 is the dungeon
venue and 6 the top venue, which is why the prologue sets `current_arena = 1`.

Foyer frame 11 (`browse`), `DoAction@0x62e634`, is the mode-selection screen and
holds the single most important gate in this document:

```text
if (_global.tournament_in_progress == true) {                 // +0x01da
  duel_icon._visible = duel_button._visible = false;          // +0x01fe..+0x021d
}
if (_root.game.hero.herolevel >= tournament_level_required    // +0x023f..+0x0248
    && ( (game_mode == "demo" && tournament_number <= 3)      // +0x024d..+0x0278
         || game_mode == "full" )) {                          // +0x027e..+0x0291
  duel_icon._visible = duel_button._visible = false;          // +0x02d0..+0x02ef
}
tournaments_icons.gotoAndStop(tournament_number);             // +0x02f0
gp_text.text = _root.game.hero.goldpieces;                    // +0x0308
```

The `browse` span plays 11→21 and rests on frame 21 (`Stop` at
`sprite:2095/frame:21/DoAction@0x62ea7f`).

**The duel and tournament options are mutually exclusive.** The duel button
(character 2066, instance name `duel_button`, sprite 2095 frame 11 depth 186)
is hidden exactly when `herolevel >= tournament_level_required`; the tournament
button (character 2069, same frame, depth 190) refuses with a bubble-text
message unless `herolevel >= tournament_level_required`. With
`current_tournament == 1` that means:

- **`herolevel` 2–3 → duels only.**
- **`herolevel` 4+ (until tournament 1 is won) → tournament only.**

Winning a tournament raises `current_tournament` (button 778, §5), which raises
the threshold and re-opens duels up to the next one.

### The duel button (character 2066)

Whole body, `root/button:2066/condition:2`:

```text
_global.fight_mode = "duel";                       // +0x007f
if      (herolevel < 15) max_arena = 2;            // +0x009f..+0x00b8
else if (herolevel < 27) max_arena = 3;            // +0x00b9..+0x0114
else if (herolevel < 36) max_arena = 4;            // +0x0115..+0x0170
else if (herolevel < 48) max_arena = 5;            // +0x0171..+0x01cc
else                     max_arena = 6;            // +0x01cd..+0x01ff
_global.current_arena = 1 + RandomNumber(max_arena);   // +0x0206..+0x0215
_root.clicksound2.start();                         // +0x0216..+0x0230
_root.gotoAndPlay("arena_intro");                  // +0x0232..+0x0245
```

`max_arena` is a foyer-scoped variable. `current_arena` selects the **venue**
(crowd graphic at root frame 214 `+0x023c`), not the opponent, and is drawn with
the AVM1 `RandomNumber` opcode — not `randomBetween` — so it is neither
recordable nor injectable by the capture wrapper.

### Opponent generation for a duel — root `arena_intro` (frame 214)

Root frame 214 `DoAction@0x62f594` is where the villain is built:

| Step | Offset | Effect |
| --- | --- | --- |
| 1 | `+0x023c` | `_root.crowd.gotoAndStop(_global.current_arena + 1)` |
| 2 | `+0x025a`–`+0x02a8` | if `gamephase == 2`, set 3 and show the first-opponent tooltip |
| 3 | **`+0x02a9`–`+0x02d5`** | **`hero.hitpoints = hero.hitpointsmax`** — every arena entry is a full heal |
| 4 | `+0x02d6`–`+0x038e` | build `_root.arena_intro.gladiators`, attach both portraits, apply masks |
| 5 | `+0x038f`–`+0x03ca` | `skincharacter(game.hero, gladiators.hero)` |
| 6 | `+0x03cb`–`+0x03f9` | gate: `fight_mode == "duel" && _global.fightstarted != true` |
| 7 | `+0x0440` | `randomise_gladiator(game.villain, gladiators.villain, game.hero.herolevel)` |
| 8 | `+0x045e` | `constructvillainDNA(game.villain)` |
| 9 | `+0x0482`–`+0x04ba` | if `hero.tournament_ranking == 2`, `unleash_hell(hero.current_tournament)` |
| 10 | `+0x04cd`–`+0x04fc` | if `hero.herolevel == 1`, `unleash_hell(0)` |
| 11 | `+0x0503`–`+0x0538` | `skincharacter(game.villain, gladiators.villain)` |

Two byte-level facts matter:

- **`_global.fightstarted` is read at `+0x03eb` and assigned nowhere in the
  build.** The whole-build reference count for the name is one. So the step-6
  gate reduces to `fight_mode == "duel"`, and duel opponents are always
  regenerated on entry.
- Step 10 is **not** gated on `fight_mode`. Any level-1 hero entering
  `arena_intro` gets the prisoner, whichever mode is set. Steps 9 and 10 are the
  only `unleash_hell` sites outside the prologue and the tournament ladder.

So **the duel opponent is generated, not drawn from a roster.**
`randomise_gladiator(whichcharacter, whichavatar, herolevel)`
(root frame 35 `DoAction@0x40198e`, `DefineFunction2` at `+0x23c3`) procedurally
builds a gladiator at the hero's own level:

- appearance from four `RandomNumber` opcode draws (`+0x241a`, `+0x242e`,
  `+0x2442`, `+0x2456`);
- `statpoints = ceil(herolevel * 5) - 8` for a non-hero target (`+0x24a6`;
  the hero branch at `+0x24d5` uses `game.hero.herolevel * 3 + 6`);
- all eight stats seeded to 1 (`+0x24fe`–`+0x2565`), then a distribution loop
  driven by `addtostat = 1 + RandomNumber(120)` (`+0x2590`) and
  `points_to_take = 1 + RandomNumber(ceil(statpoints / 3))` (`+0x25bc`);
- weapons, ammunition and enchantments from a long mixed run of `randomBetween`
  calls (`+0x27ed`, `+0x2a09`…`+0x3174`) and further `RandomNumber` opcodes
  (`+0x2d3c`, `+0x2d78`, `+0x2dfa`, `+0x2e33`, `+0x2e6f`, `+0x2ea8`, `+0x2ee4`,
  `+0x314c`, `+0x31cc`);
- armour per piece, plus a matched-suit path: `randomsuit = game.hero.herolevel
  + RandomNumber(250)` (`+0x31cc`) and, when `randomsuit >= 250`, all eight
  pieces set to `round(herolevel / 2)` in one statement (`+0x31e5`–`+0x327b`).

**Answer to "is the opponent controllable": no, and not even partially.** The
generator mixes `randomBetween` (interceptable by the wrapper) with the
`RandomNumber` opcode (not interceptable) in the same pass, and the opcode
draws include the stat distribution itself. A capture cannot choose or
reproduce a duel opponent. It can only observe one — which is exactly the
"author the fixture from the observation" route the staging guide already
documents for the two duel candidates.

What the leveled route *does* buy on the villain side is that duel opponents
**can carry armour and enchanted weapons**, which the all-zero tutorial prisoner
never can. That is the binding constraint on staging-group C.

### Entering the fight

The arena_intro panel is character 2136, instance
`_root.arena_intro.beforefight_panel`, inside the `arena_intro` clip
(character 2224, instance `_root.arena_intro`, root frame 214 depth 73). Its
confirm button is character 2128, instance name `button_yes`:

```text
_global.fightselected = false;                     // +0x004b
_root.clicksound2.start();                         // +0x0053
_root.gotoAndPlay("arena");                        // +0x006f
```

This is the body the existing `stepNavigator` already replicates at `navStep 5`.
`_global.fightselected` is, like `fightstarted`, **never assigned `true`
anywhere** — it is written `false` only here and read three times in sprite 2224
frame 1 (`+0x0ee3`, `+0x14d2`, `+0x1557`), so those blocks always run. The first
of them derives `_global.crowdlevel` and `_global.crowd_interest` from
`herolevel` with a `RandomNumber(899)` draw at `+0x0f48`; `crowd_interest` is
the multiplier on the win gold (§5).

## 3. Which `fight_mode` values are reachable, and from where

`_global.fight_mode` is written at exactly **four** sites in the whole build.

| Value | Site | Reached by |
| --- | --- | --- |
| `null` | `root/frame:10/DoAction@0x3c3895` `+0x0628` | one-time initialisation |
| `misc` | `sprite:1788/frame:78/DoAction@0x5a6357` `+0x0060` | the dungeon prologue only, i.e. **only a `herolevel == 1` hero via `daybreak` → `dungeon`** |
| `duel` | `root/button:2066/condition:2` `+0x007f` | foyer `browse`, requires the duel button visible: `herolevel < tournament_level_required` and `tournament_in_progress != true` |
| `tournament` | `root/button:2069/condition:2` `+0x01be` | foyer `browse`, requires `herolevel >= tournament_level_required` and (full game, or `tournament_number <= 3` in demo) |

Nothing clears `fight_mode` between fights. Once set it persists until the next
selection, so a tournament run keeps `tournament` for every bout in the ladder,
and a `misc` value from a prologue session survives until the first duel or
tournament selection.

This is the answer the staging guide has been waiting on. **`tournament` is
reachable, cheaply, at low level**: `current_tournament` starts at 1 for a fresh
gladiator (`initcharacter` reads it from `characterDNA[30]`,
`root/frame:35/DoAction@0x40bf76` `+0x08a8`), so a **level-4** gladiator with
`current_tournament == 1` qualifies for a four-fighter tournament in arena 2.
That single staging unlocks every fixture whose only blocker is
`fight_mode == "tournament"` — the non-lethal-outcome group and the
"pre-damaged defender" group.

Note also what it costs: at level 4 the duel button is hidden, so **the same
gladiator cannot serve both modes.** A duel campaign wants a level-2 or level-3
gladiator; a tournament campaign wants a level-4 one. Because a level-2 hero
levels up after roughly one or two duel wins (§5), those are close to the same
gladiator one fight apart.

### The tournament ladder (foyer frame 22)

`sprite:2095/frame:22/DoAction@0x62eab5` runs once, when
`tournament_in_progress != true`, and pre-generates the whole field:

```text
for (i = 0; i <= 20; i++) {                                        // +0x025f..+0x0521
  if (i <= tournament_max_gladiators) {
    if (_global.tournament_in_progress != true) {                  // +0x0298
      _root.game["villain" + i] = new Object();                    // +0x02b1..+0x02d5
      if (i == 1) {                                                // +0x02d6
        _root.unleash_hell(tournament_number);                     // +0x02fc
        _root.constructvillainDNA(_root.game.champion);            // +0x0320
      } else {
        _root.randomise_gladiator(_root.game["villain"+i],
                                  _root.arena_intro.gladiators.villain,
                                  _root.game.hero.herolevel);      // +0x03c2
        _root.constructvillainDNA(_root.game["villain"+i]);        // +0x03ea
      }
    }
    ... ladder display, "(you)" at i == hero.tournament_ranking ...
  }
}
_global.tournament_in_progress = true;                             // +0x052c
_global.current_arena = tournament_arena;                          // +0x053a
if (hero.tournament_ranking <= 2)                                  // +0x0565
  _root.game.villain = _root.game.champion;                        // +0x05af
else
  _root.game.villain = _root.game["villain" + (hero.tournament_ranking - 1)];  // +0x0576
```

The `tournament` span plays 22→36 and rests on frame 36
(`Stop` at `sprite:2095/frame:36/DoAction@0x62f547`).

So in tournament mode **the opponent is fixed by ranking**, not redrawn:
`_root.game.villain` is bound before the fight and root frame 214 leaves it
alone (its `randomise_gladiator` is behind the `fight_mode == "duel"` gate).
Rank 1 is the tournament boss from `unleash_hell(tournament_number)`; ranks
2..N are ordinary generated gladiators at the hero's level. The hero starts at
`tournament_ranking = tournament_max_gladiators` (foyer frame 1 `+0x0311`) and
loses one rank per win (arena frame 88 `+0x094f`).

Two capture-relevant consequences:

- **The tournament field is inspectable before the first bout.** The ladder
  names are on screen and the objects are live at `_root.game.villain1` …
  `_root.game.villainN`. An unattended session can read the whole field's stats
  and armour at foyer frame 36 and decide whether to proceed — the closest
  thing to opponent selection this build offers.
- The tournament fight button is character 2071 (sprite 2095 frame 22 depth
  169); its whole body at `+0x0000` is `_root.gotoAndPlay("arena_intro")`.
- **A tournament loss ends the character.** `sprite:2249/frame:315/DoAction@0x6e700c`
  `+0x03a2` branches on `tournament_in_progress == true` into the game-over
  path instead of the ordinary loss panel. An unattended tournament campaign
  must treat a loss as terminal for that save slot.

## 4. Reward chain after a win

The chain is entirely on `_root.arena` (character 2249) plus one button.

| # | Where | What advances it |
| --- | --- | --- |
| 1 | overlay 862 `death()` → `combatwon` frame 62 | bridges to `_root.arena.gotoAndPlay("combat_won")` (battle map §Battle result) |
| 2 | arena frame 88 `DoAction@0x6e5688` | win settlement, below |
| 3 | arena frames 94–188 (`combat_wonitem`) | tournament-victory screen only; frame 182 `DoAction@0x6e623b` `+0x0042` attaches the `won_tournament` linkage at depth 100005; `Stop` at frame 188 |
| 4 | arena frames 189–221 (`combat_delay`) | animation only |
| 5 | arena frame 222 `DoAction@0x6e6347` | `_root.arena.won_tournament.removeMovieClip()` `+0x007e`; **`fight_win_stuff._visible = true`** `+0x00a0`; victory sound by level |
| 6 | arena frame 231 `DoAction@0x6e651e` | experience award and level-up detection, below |
| 7 | arena frame 249 | `Stop` — the reward panel holds here |
| 8 | button 775 (`_root.arena.fight_win_stuff.button_yes`) | routes onward, below |

### Frame 88 — win settlement

```text
_root.arena.combat_panel.removeMovieClip();                  // +0x03bf
_root.crowd_noise.stop(); delete_tooltips();                 // +0x03e1, +0x03fd
_global.battle_started = false;                              // +0x0413
if (_global.gamephase == 4) { gamephase = 5; tooltips(...); }// +0x0421..+0x046f
this.attachMovie("fight_win_stuff","fight_win_stuff",100000,{_x:-193,_y:164}); // +0x0470..+0x04a1
fight_win_stuff._visible = false;                            // +0x04a2
fight_win_stuff.button_yes._visible = false;                 // +0x04b0
fight_win_stuff.exp_bar._xscale = 0;                         // +0x04c4
if (_global.fight_mode == "duel") fighttext = <yield text>;  // +0x0517..+0x0571
else                              fighttext = <defeat text>; // +0x0577..+0x05b0
nextleveltext_exp = round((experience - experiencelast)
                    / (experienceneeded - experiencelast) * 100);   // +0x0662..+0x06e1
hero.goldpieces += round(villain.character_xp
                    * (100 + _global.crowd_interest) / 100);        // +0x078c..+0x07ff
if (hero.herolevel == 1) hero.goldpieces = 2500;             // +0x0867..+0x08b8
hero.battlesfought += 1;                                     // +0x08b9
hero.battleswon   += 1;                                      // +0x08ef
if (_global.tournament_in_progress == true) {                // +0x0925
  hero.tournament_ranking -= 1;                              // +0x093d
  if (hero.tournament_ranking == 1) gotoAndPlay("combatwonitem"); // +0x099a
  else                              gotoAndPlay("combat_delay");  // +0x09b1
} else                              gotoAndPlay("combat_delay");  // +0x09c7
```

Two notes:

- The win gold is `round(villain.character_xp * (100 + crowd_interest) / 100)`,
  where `character_xp` is derived in `battlevalues`
  (`root/frame:35/DoAction@0x3fa9dc` `+0x3b82`–`+0x3c0c`) as
  `secondary_min_damage + secondary_max_damage*10 + min_damage +
  max_damage*20 + weapon_enchantment_damage*10 +
  secondary_weapon_enchantment_damage*10 + herolevel^2 + armourclass*10 + 150`.
  The `ceil(herolevel^2 * 50)` figure the battle map records is the **loss**
  deduction (`sprite:2249/frame:315` `+0x041d`), not the win reward.
- The label written at `+0x099a` is `combatwonitem`; the actual label on sprite
  2249 is `combat_wonitem`. The `gotoAndPlay` therefore matches nothing and is a
  no-op, and the playhead simply runs on from 88 into 94, which happens to be
  the intended destination. Recorded as a static observation; behaviourally
  inert in this build, but a reconstruction must not "fix" it into a real jump.

### Frame 231 — experience and the level-up flag

```text
_root.restore_char(game.hero);                     // +0x0206
_root.backup_char(game.hero);                      // +0x022a
hero.experience     += villain.character_xp;       // +0x024e..+0x0293
hero.score          += villain.character_xp;       // +0x0294..+0x02d9
hero.gladiatorscore += Number(hero.experience);    // +0x02da..+0x0320
_root.constructDNA();                              // +0x0321
nextleveltext_exp = round((experience - experiencelast)
                    / (experienceneeded - experiencelast) * 100);   // +0x0337..+0x03b6
if ( (herolevel < 50 && current_tournament <= 18 && _root.fizMode == "fizzle")
     || (herolevel < 12 && current_tournament <= 3 && _root.fizMode != "fizzle") ) {
                                                   // +0x03b7..+0x048a
  if (experience > experienceneeded) experience = experienceneeded;  // +0x04af..+0x0512
  exp_percent = round((experience - experiencelast)
                / (experienceneeded - experiencelast) * 150);        // +0x056e..+0x05ed
  if (exp_percent > 150) exp_percent = 150;                          // +0x05ee..+0x060d
  slideExpbar = new mx.transitions.Tween(fight_win_stuff.exp_bar, "_xscale",
                  Strong.easeOut, original_exp, exp_percent, 2, true);  // +0x064e..+0x06a6
  slideExpbar.onMotionFinished = function () {                       // +0x06ad
    if (exp_bar._xscale > 150) exp_bar._xscale = 150;                // +0x06ba..+0x06f1
    fight_win_stuff.button_yes._visible = true;                      // +0x06f2
    if (exp_percent >= 150)
      fight_win_stuff.nextleveltext = "YOU HAVE LEVELLED UP!";       // +0x0706..+0x0729
  };
} else { ... level/tournament cap handling from +0x0730 ... }
```

**The reward button only exists after the two-second exp-bar tween finishes.**
`fight_win_stuff.button_yes._visible == true` is therefore the navigator's
readiness check for step 8, and it is a genuine wait, not a frame number.

`fight_win_stuff.nextleveltext` carries the level-up decision to button 775 as a
**string comparison**. `experiencelast` and `experienceneeded` are derived in
`battlevalues` (`+0x3853` and `+0x38e1`) as
`round((L-1)^2 * ((L-1)/5) * 300)` and `round(L^2 * (L/5) * 300)`, with a
floor near 125 applied at `+0x39a0`. Level 2 therefore spans 60→480 experience,
and one duel win against a level-2 generated opponent is worth several hundred
`character_xp`. **A level-2 capture gladiator will usually level up on its first
or second duel win** — the level-up screen is not an edge case on this route, it
is the common case.

### Button 775 — the reward button

`root/button:775/condition:2`, on instance `_root.arena.fight_win_stuff.button_yes`:

```text
_root.clicksound2.start();                                          // +0x02ee
if (hero.current_tournament >= 19 && hero.tournament_ranking <= 2) {// +0x030a..+0x0357
  ... final-victory game-over screen, this._visible = false ...     // +0x035c..+0x0464
} else if (nextleveltext == "YOU HAVE LEVELLED UP!"                 // +0x0469
           && ( (game_mode == "demo" && herolevel < 12)             // +0x047d..+0x04b9
                || (game_mode == "full" && herolevel < 50) )) {     // +0x04bf..+0x04fb
  hero.experience = hero.experienceneeded + 1;                      // +0x0500..+0x0535
  hero.herolevel++;                                                 // +0x0536..+0x0563
  _root.battlevalues(hero);                                         // +0x0564..+0x0587
  _root.constructDNA();                                             // +0x0588
  _root.gotoAndPlay("levelup");                                     // +0x059e
} else if (_global.tournament_in_progress == true) {                // +0x05b7..+0x05ca
  _root.gotoAndPlay("foyer");                                       // +0x05cf
} else if (_global.tournament_complete == true) {                   // +0x05e8..+0x05fb
  _global.tournament_complete = null;                               // +0x0600
  _global.time_of_day = 1 + RandomNumber(23);                       // +0x0613
  _global.day++;                                                    // +0x0625
  chance_of_rain = 1 + RandomNumber(100);                           // +0x063b
  _global.rain_chance = chance_of_rain > 80;                        // +0x064d..+0x0682
  _global.special_for_day = false;                                  // +0x0683
  hero.days_in_arena = _global.day;                                 // +0x0691
  _global.cloudframe = 1 + RandomNumber(16);                        // +0x06b2
  _global.special_event = 0;                                        // +0x06ca
  _global.special_event_happening = false;                          // +0x06df
  _root.gotoAndPlay("daybreak");                                    // +0x06ed
} else {
  _root.gotoAndPlay("townsquare");                                  // +0x0706
}
```

The important line for a capture loop: **an ordinary duel win with no level-up
returns to `townsquare` directly.** No new day, no `daybreak`, no dungeon test.
That is the loop a multi-fight session runs in.

### Tournament victory — button 778

`root/button:778/condition:0`, on `_root.arena.won_tournament.button_yes`:

```text
_root.clicksound2.start();                                          // +0x00c9
_root.AS3connection.send("AS2to3","doAchievement","SS2_BOSS_"+current_tournament); // +0x00e5..+0x011b
if (hero.current_tournament < 19) hero.current_tournament++;        // +0x011c..+0x0170
_root.constructDNA();                                               // +0x0171
_global.tournament_complete   = true;                               // +0x0187
_global.tournament_in_progress = false;                             // +0x0195
_root.arena.gotoAndPlay("combat_exp");                              // +0x01a3
```

Note the outbound `AS3connection.send` to the Collection shell. It is a fire-
and-forget achievement notification; a capture session should expect it and not
treat it as an error.

## 5. The level-up screen — the decision an unattended run must answer

Root frame 227 (`levelup`) has two action blocks. The first,
`DoAction@0x6e776b`:

```text
_root.delete_tooltips();                                   // +0x00c0
fighttext = <"risen to level N" text>;                     // +0x00d6
hero = _root.attachMovie("hero","hero",300);               // +0x00fa
_root.constructDNA();                                      // +0x0117
_root.skincharacter(_root.game.hero, this.hero);           // +0x012d
... scale/position/portrait ...
_root.game.hero.statpoints = 4;                            // +0x01b4
```

The second, `DoAction@0x6e7945`, plays the level-up song and unlocks the
"special" abilities at levels 3, 6, 7, 9, 15 … (`+0x1080` onward, one
`specials_gained_mov.specials.gotoAndStop(n)` per threshold).

**Yes — there is a decision, and it is a hard block.** The continue button is
character 2283, placed at root frame 227 depth 409:

```text
_root.specials_gained_mov.removeMovieClip(); removeSprite;  // +0x012d..+0x0155
if (_root.game.hero.statpoints > 0) {                       // +0x0156..+0x016a
  inspirato_text = <"distribute all your skillpoints" refusal>;  // +0x016f
} else {
  _root.backup_char(_root.game.hero);                       // +0x017c..+0x019f
  _root.clicksound2.start();                                // +0x01a0
  _root.hero.removeMovieClip();                             // +0x01bc
  _root.restore_char(_root.game.hero);                      // +0x01d8..+0x01fb
  if (hero.herolevel == 2) {                                // +0x01fc..+0x021e
    _global.day = 1; _global.time_of_day = 24;              // +0x0223, +0x0234
    _root.gotoAndPlay("daybreak");                          // +0x0245
  } else if (_global.tournament_in_progress == true) {      // +0x025e..+0x0271
    _root.backup_character(_root.game.hero);                // +0x0276
    _root.gotoAndPlay("foyer");                             // +0x029a
  } else {
    _root.gotoAndPlay("townsquare");                        // +0x02b3
  }
}
```

The four points are spent by the eight `+`-buttons on the level-up stat panel
(character 2265; it reuses the character-creation buttons 1596, 1600, 1602,
1608 alongside 2252–2254). Each has the same two-statement body — button 1596
(strength) in full:

```text
if (_root.game.hero.statpoints > 0) {         // +0x004c..+0x0060
  _root.clicksound.start();                   // +0x0065
  _root.game.hero.strength++;                 // +0x0093..+0x00ae
  _root.game.hero.statpoints--;               // +0x00af..+0x00e4
}
```

**What an unattended run should do.** Spend all four points into the *same*
stat, every time, and record which one in the observation. `vitality` is the
recommended default: it changes only `hitpointsmax` (`herolevel * 10 +
vitality * 20`, battle map §Combatant state objects) and so leaves
`attack`, `defence`, `charisma`, `magicka`, `strength`, `speed` and `stamina` —
every input to `attack_chances`, the damage roll, the deflection threshold and
the controller selector — untouched. A run that spreads points, or picks a
different stat per session, makes two sessions of the same "family" no longer
comparable.

Note that `herolevel` itself moves regardless, and `herolevel` feeds
`hitpointsmax`, the `wincrowd`/`psyche_up` button visibility thresholds,
`maximum_ammo`, the duel `max_arena` ladder, the shop level gate and — through
`tournament_level_required` — whether the duel button exists at all. **A capture
gladiator's level is a staged input, and every win perturbs it.** The cheapest
discipline is one fight per session against a saved slot that is restored
between sessions.

## 6. Equipment

| Want | Screen | Callable entry point | Gates |
| --- | --- | --- | --- |
| Armour piece | root `armoury` (170), `_root.armoursmith` (character 1909) | `_root.armoursmith["item"+i].onRelease()` for i in 1..60 (wired by `armourbuttons()`, `sprite:1909/frame:1/DoAction@0x5f1fa9` `+0x0786`), which calls `buyarmour(item, armourpiece, itemlevel)` (`+0x0ba9`; `DefineFunction2` at `+0x11ba`) | `item.itemlevel <= _root.game.hero.herolevel` (`+0x0b77`); `item.itemlevel > 12` refused outside the full game (`+0x0b3d`); then gold |
| Weapon or bow | root `weaponshop` (179), `_root.weaponsmith` (character 1961) | `_root.weaponsmith["item"+i].onRelease()` for i in 1..80 (wired by `weaponbuttons()`, `sprite:1961/frame:1/DoAction@0x6110ce` `+0x0571`), which calls `buyweapon(item)` (`+0x0941`; `DefineFunction2` at `+0x0bf6`) | `item.itemlevel <= item.attribute_required` (`+0x0929`); `item.itemlevel > 16` refused outside the full game (`+0x08ee`); then gold |
| Spell/item | root `magicshop` (187) / `church` (195) | `buyitem(whichitem)` on `_root.magicshop` / `_root.church` | not mapped here |

Weapon slots are banded, and the governing attribute differs per band
(assignments inside `weaponbuttons()`):

| Item ids | Category | `attribute_required` | Displayed as |
| --- | --- | --- | --- |
| 1–20 | slashing | `speed` (`+0x05e7`) | Agility |
| 21–40 | hacking | `strength` (`+0x068b`) | Strength |
| 41–60 | bashing | `strength` (`+0x0724`) | Strength |
| **61–80** | **ranged** | **`speed` (`+0x07bd`)** | Agility |

`buyweapon` is only the quote step: it computes `itemcost`, a trade-in discount
(`+0x0fb2`) and a charisma discount (`itemcost * charisma / 200`, `+0x0fd5`),
clamps the cost to a minimum of 1 (`+0x1036`), and plays the `getitem` page.
The commit is character 1952, the `getitem` confirm button at sprite 1961
frame 147 depth 25:

```text
if (hero.goldpieces < itemcost) { <refusal text> }         // +0x015d..+0x018e
else {
  if (itemcost != 0) _root.coins.start();                  // +0x0193
  if (itemtype != "ranged") {                              // +0x01c9
    hero.weapon = itemnumber;                              // +0x01ee
    hero.weapon_enchantment_potency = 1;                   // +0x0209
    hero.weapon_enchantment_type    = 1;                   // +0x0226
  } else {
    hero.secondary_weapon = itemnumber;                    // +0x025a
    hero.secondary_weapon_enchantment_potency = 1;         // +0x0275
    hero.secondary_weapon_enchantment_type    = 1;         // +0x0292
  }
  hero.goldpieces -= itemcost;                             // +0x02af
  _root.constructDNA();                                    // +0x02d1
  itempurchased = "yes";                                   // +0x02e7
  gotoAndPlay("browse");                                   // +0x02ef
}
```

The armour equivalent is character 1907, at sprite 1909 frame 184 (`getitem`).

### What "acquiring a bow" actually requires

Buying any item in the 61–80 band writes `hero.secondary_weapon`. Nothing else
in this build writes it for the hero (whole-build reference check: the only
other writers are `randomise_gladiator` for villains and the magic shop's
`enchant_weapon`).

But note what the battle map already establishes, and what it means here:

- Root frame 221 forces `equipped_weapon = 1` and `using_bow = false` at battle
  construction, so a gladiator **always** starts on a warrior controller.
- The only manual route to `using_bow` is the battle inventory overlay's
  `swap_inventory.onRelease` → `getphase("swap_weapons")`, and that button is
  hidden when the hero has no secondary weapon.
- The `swap_weapons` phase itself **never checks that the secondary weapon is a
  bow** — it just sets `equipped_weapon = 2` and `using_bow = true`.

So the archer controllers require *a secondary weapon*, not specifically a bow.
Buying a ranged item is still the right staging, because `bombard`/`snipe`
damage comes from `secondary_min_damage`/`secondary_max_damage` and the ranged
phase decrements `ammo_left` — but the gate on reaching `longrange_archer` at
all is weaker than the staging guide assumes. **Unverified**: whether a
non-ranged secondary weapon yields sane `bombard`/`snipe` behaviour. One
unattended round with a non-ranged secondary and `swap_weapons,bombardright`
would settle it, and it is cheap because slashing/hacking items are far cheaper
than bows.

For the leveled route specifically: a level-2 or level-3 gladiator can buy armour
only up to `itemlevel` 2 or 3, but has 2500 starting gold (the level-1 win bonus
at arena frame 88 `+0x0894`) and can buy any weapon whose `itemlevel` is within
its Agility/Strength. Weapon bands are attribute-gated, **not** level-gated —
that is the one place the leveled route is cheaper than it looks.

## 7. Loss chain (for completeness)

`sprite:2249/frame:315/DoAction@0x6e700c`: `battlesfought++` (`+0x02d1`),
`battleslost++` (`+0x0307`), then a branch on `_global.tournament_in_progress`
(`+0x03a2`). Tournament losses take the game-over path; other losses show the
`fight_over_lost` panel, set the yield text, and compute
`goldlost = ceil(herolevel * herolevel * 50)` (`+0x041d`–`+0x046a`), clamped at
zero. The panel's button (character 2244, in sprite 2247) returns the root to
`townsquare`.

## 8. The save-write hazard — read this before scheduling a session

**Root frame 150 calls `save_character(_global.current_character)` at
`+0x0585`, on every entry to the town square.**
`save_character(char_no)` (`root/frame:10/DoAction@0x3c4087`, `DefineFunction2`
at `+0x01d2`) re-skins and re-derives the hero, splits `heroDNA` into
`characterDNA`, writes it into `so_local["character" + char_no]`, then calls
`SharedObject.getLocal("ss2_data")` and **`.flush()`** (`+0x027e`–`+0x02b8`).

The whole-build call list for `save_character` is: root frame 150 `+0x0585`,
button 1565 (new-character confirm) `+0x02d6`, and button 2042 `+0x020f`.

The prisoner route never touches root frame 150 — `daybreak` sends a level-1
hero straight to `dungeon`. **Every leveled-gladiator route does**, both on the
way in (frame 113's `herolevel > 1` arm) and on the way back after each win
(button 775's default arm). There is no path from `daybreak` to `foyer` that
does not pass through `townsquare`.

Consequences the capture protocol must absorb:

- A leveled-route session **is not save-neutral**. Gold, experience, level,
  equipment and battle counters are persisted to `ss2_data` at least twice per
  fight loop.
- The runtime-capture protocol's install-hash attestation covers the SWF, not
  the SharedObject, so this will not surface as a verification failure. It has
  to be handled by procedure.
- Recommended: a **dedicated capture slot**, and a copy of `ss2_data.sol` taken
  before the session and restored after, so a campaign of N sessions starts each
  one from an identical gladiator. Without that, session 2 of a family is
  staged differently from session 1 — which is exactly the class of divergence
  the fixture pipeline already had to chase once with stamina drift.
- Jumping `_root.gotoAndPlay("foyer")` directly from the slot screen would skip
  `townsquare` and the save. **Do not do this without evidence.** It also skips
  `day_night_cycle`, the `townhero` attach, `constructDNA`, `skincharacter` and
  the `charsheet` attach, and this project has already learned once what
  skipping construction frames costs. The evidence that would settle it is a
  session that takes that shortcut and completes a full fight without the
  character-validation screen — and that experiment should be run against a
  throwaway slot, not a capture gladiator.

## 9. Proposed navigator: `-Navigate duel` / `-Navigate tournament`

A sibling of `stepNavigator` in
[`ss2-capture-wrapper.as`](../../tools/runtime-capture/ss2-capture-wrapper.as),
in the same style: a state check that says it is safe to proceed, then the
game's own call that advances it.

### A caveat that shapes every step below

The existing navigator advances by two different mechanisms:

- `root.get_char1.onRelease()` at `navStep 2` — a **script-assigned** handler
  (wired at root frame 84 `DoAction@0x419cbc` `+0x0548`), genuinely callable.
- `_global.fightselected = false; root.gotoAndPlay("arena")` at `navStep 5` — a
  faithful **replication of a `DefineButton2` body** (character 2128), because
  tag-defined button actions are not reachable from ActionScript.

Every control on the town-square / foyer / reward / level-up path is a
`DefineButton2`. So the leveled navigator is mostly of the second kind: it must
execute each button's body verbatim, in order, with nothing added or omitted,
and let the game run its own frames in between. Each step below names the
button it is replicating so the two can be diffed. Where a body draws a random
number, the navigator must draw one too (AS2 `random(n)` compiles to the same
`RandomNumber` opcode) rather than substituting a constant.

### Steps

| # | State check | Action (and the button/site it replicates) |
| --- | --- | --- |
| 0 | `root.so_local != undefined` | `root.gotoAndPlay("new_or_continue")` — unchanged from the prisoner navigator |
| 1 | `root._currentframe >= 52` | `root.gotoAndPlay("load_saved_gladiators")` — unchanged |
| 2 | `typeof root.get_char1.onRelease == "function"` and `root.so_local.max_gladiators >= 1` | `root.get_char1.onRelease()` — unchanged (real handler) |
| 3 | `_root.game.hero` has ≥ 6 own properties **and** `Number(root.game.hero.herolevel) > 1` | replicate button 1669: `_global.current_character = root.char_to_load; root.delete_tooltips(); _global.gamephase = 1; root.hero.removeMovieClip(); _global.time_of_day = 24; root.game.hero.score = 0` |
| 4 | — | `root.gotoAndPlay("daybreak")` (button 1669 `+0x0130`). Abort loudly if the herolevel check in step 3 failed: a level-1 hero here silently becomes a prisoner capture |
| 5 | `root._currentframe == 150..159` (settles 158↔159); assert it is **not** 114–149 | none — the game routed itself. Log `herolevel`, `current_tournament`, `goldpieces` |
| 6 | town square settled | replicate button 1800: `root.gotoAndPlay("foyer")` |
| 7 | `root._currentframe == 208` **and** `root.foyer._currentframe == 21` | read `root.foyer.tournament_level_required` and `root.foyer.duel_button._visible`. This is the branch point |
| 8a (duel) | `root.foyer.duel_button._visible == true` | replicate button 2066: set `_global.fight_mode = "duel"`; compute `max_arena` from the herolevel ladder; `_global.current_arena = 1 + random(max_arena)`; `root.gotoAndPlay("arena_intro")` |
| 8b (tournament) | `root.game.hero.herolevel >= root.foyer.tournament_level_required` | replicate button 2069: `_global.fight_mode = "tournament"; root.foyer.gotoAndPlay("tournament"); root.foyer.play()` |
| 9b (tournament only) | `root.foyer._currentframe == 36` and `root.game.villain` bound | optionally dump the whole ladder (`root.game.villain1..N`) before proceeding; then replicate button 2071: `root.gotoAndPlay("arena_intro")` |
| 10 | `root._currentframe == 220` | log `herolevel`, `_global.fight_mode`, `_global.current_arena`, villain name/stats — the same diagnostic the prisoner navigator emits at `navStep 5` |
| 11 | — | replicate button 2128: `_global.fightselected = false; root.gotoAndPlay("arena")` |
| 12 | `_global.battle_started == true` | hand over to `stepAutopilot` — identical to the existing `navStep 6` |

Optional continuation, only for a multi-fight session:

| # | State check | Action |
| --- | --- | --- |
| 13 | `root.arena.fight_win_stuff.button_yes._visible == true` | replicate button 775. Compute its branch from `root.arena.fight_win_stuff.nextleveltext`, `_global.tournament_in_progress` and `_global.tournament_complete`, and take exactly one arm |
| 14 | `root._currentframe == 234` (only if step 13 took the `levelup` arm) | spend all four points: while `root.game.hero.statpoints > 0`, replicate one stat button's body (`root.game.hero.vitality++; root.game.hero.statpoints--`), then replicate button 2283 |
| 15 | back at townsquare (158/159) or foyer (208) | loop to step 6 |

Steps flagged as uncertain:

- **Step 3's `gamephase = 1`.** That is exactly what button 1669 writes, so it
  is faithful, but it means a leveled hero arrives at town square with the
  tutorial state machine at phase 1 and picks up the phase-1 and phase-2
  tooltips (root frame 150 `+0x0484`, root frame 214 `+0x025a`). The tooltips
  are overlays and every screen entry calls `delete_tooltips()`, so an
  ActionScript-driven navigator should be unaffected — but this has never been
  observed for a leveled hero. A single `-Navigate duel` dry run that reaches
  root frame 220 settles it.
- **Steps 8a/8b as replications rather than presses.** If a future harness gains
  real input injection, prefer pressing `_root.foyer.duel_button` for real. The
  evidence that would settle whether replication is adequate is a side-by-side:
  one manual duel session and one navigated session against the same save,
  compared on `_global` state at root frame 220.
- **Step 14.** Spending stat points has no game function to call — the button
  body is two statements with no call. This is the least faithful step in the
  route. The alternative is to avoid it entirely: keep sessions to one fight and
  restore the save between them, so the level-up screen is never reached.
- **Step 13's branch selection.** Button 775 chooses by string equality on
  `nextleveltext`. A navigator that reads the same property and reproduces the
  same branch is faithful, but the string is written inside a Tween callback, so
  reading it before `button_yes._visible` is true would race. The state check in
  step 13 is what prevents that.

### What this route does and does not unlock

| Staging blocker | Status on the leveled route |
| --- | --- |
| `fight_mode == "tournament"` | **Unblocked.** Level-4 gladiator, `current_tournament == 1`, foyer `browse` → tournament button. Field of four, arena 2 |
| Armour on the villain | **Unblocked.** `randomise_gladiator` gives duel and tournament opponents armour and enchanted weapons at the hero's level; the matched-suit path at `+0x31e5` sets all eight pieces to `round(herolevel/2)` |
| Choosing *which* opponent | **Still blocked for duels** (procedural generation mixing `RandomNumber` opcodes). **Partly relieved in tournaments**: the field is pre-generated and inspectable at foyer frame 36 before the first bout |
| Bow / archer controllers | **Unblocked by a shop trip** — ranged items 61–80, gated on Agility, not level |
| Non-lethal finish | Unchanged; the defeat gate is the battle map's, not this route's. Tournament mode is what makes a hitpoint hit survivable |
| Hero armour / enchantments | Unchanged: outfit the saved gladiator beforehand, now with a real gold income (`round(villain.character_xp * (100 + crowd_interest)/100)` per win) |

## 10. Everything not verified, with the evidence that would settle it

| Claim | Status | What would settle it |
| --- | --- | --- |
| Frame 113's `day_night._currentframe == 80` equality is always sampled | **unverified** — the root re-tests every second tick while `day_night` advances every tick, and `day_night` stops at 107 | a session that stalls at root frame 113; the navigator should log `day_night._currentframe` on timeout |
| A leveled hero loaded with `gamephase = 1` is unaffected by the tutorial tooltips | **unverified** | one `-Navigate duel` dry run to root frame 220 |
| Replicating a `DefineButton2` body is behaviourally identical to pressing it | **inferred** from the existing navigator's `navStep 5`, which has worked in every session | a manual-vs-navigated `_global` diff at root frame 220 |
| A non-ranged secondary weapon still produces sane `bombard`/`snipe` | **unverified** — `swap_weapons` never checks the type | one round with a cheap non-ranged secondary and `swap_weapons,bombardright` |
| `experienceneeded = round(L^2 * (L/5) * 300)` | **partially decoded** — the multiply/round chain at `+0x38e1`–`+0x3945` was read, the near-125 floor at `+0x39a0` was not fully decoded | a capture that records `experienceneeded` at two known levels |
| The `combatwonitem` / `combat_wonitem` label mismatch is inert | **inferred** — the failed `gotoAndPlay` leaves the playhead at 88, which advances into 94 anyway | a tournament-final win capture logging `_root.arena._currentframe` across frames 88–95 |
| Tournament opponents at ranks 2..N are never regenerated between bouts | **inferred** from the `tournament_in_progress != true` guard at foyer frame 22 `+0x0298` | two consecutive tournament bouts logging `game.villain2..N` identity |
| The magic shop / church `buyitem` routes | **not mapped** | out of scope here; needed only for the spell-ingress fixture group |

## 11. Changes this track would have made elsewhere (not made — other tracks own these files)

1. **[`ss2-battle-map.md`](ss2-battle-map.md), §Controller frames — "Unverified: …
   a ninth label in that gap cannot be excluded".** It can now. Decoding tag 43
   for sprite 862 gives exactly eight labels at frames 1, 5, 13, 20, 28, 52, 62,
   74. Frames 38–51 carry no label and are unreachable. The caveat should be
   closed and the decode method noted.
2. **[`ss2-battle-map.md`](ss2-battle-map.md), §Battle result and reward
   callbacks.** It attributes `ceil(herolevel^2 * 50)` gold to frame 315 without
   saying it is the **loss** deduction, and does not record the win reward at
   all. The win formula is `hero.goldpieces += round(villain.character_xp *
   (100 + _global.crowd_interest) / 100)` at `sprite:2249/frame:88` `+0x078c`,
   with a flat 2500 override for `herolevel == 1` at `+0x0894`. It also
   describes frames 94/189/222/231 as "win item/reward/transition processing";
   frames 94–188 are specifically the **tournament**-victory screen and are
   skipped entirely by ordinary wins.
3. **[`ss2-capture-staging.md`](ss2-capture-staging.md), Group F
   (`candidate-grievous-knockback`).** It states "no `getphase` label in the
   whole controller vocabulary maps to direction 30". The battle map's own
   `attack_direction` table contradicts this: `psyche_up` assigns 30 at
   overlay frame 52 `+0x669e` (facing right) and `+0x6717` (facing left), on the
   third consecutive press, range-gated. `psyche_up` is wired on the warrior
   controllers at `herolevel >= 7` and on the archer controllers at
   `herolevel >= 3` — which is precisely a leveled-gladiator unlock, so Group F
   should move out of "no player action is known" and into the leveled route.
4. **[`ss2-capture-staging.md`](ss2-capture-staging.md), Villain-side staging.**
   "The opponent is drawn by the game" understates it: the opponent is
   *generated* by `randomise_gladiator` at the hero's level, mixing
   `randomBetween` with `RandomNumber` opcodes, so it can never be reproduced
   even with a fully injected tape. Tournament fields, by contrast, are
   pre-generated once and inspectable before the first bout.
5. **[`ss2-runtime-capture.md`](ss2-runtime-capture.md) / the session protocol.**
   Needs a SharedObject step: back up and restore `ss2_data` around any session
   that uses the leveled route, because root frame 150 flushes the save on every
   town-square entry (§8).
6. **[`tools/inspect-swf.mjs`](../../tools/inspect-swf.mjs).** Adding a
   `--labels` mode that decodes tag 43 per timeline would make this map, and the
   battle map's open sprite-862 question, reproducible with the project's own
   tool instead of a throwaway reader. It stays read-only and prints only
   structural identifiers.

## Reproduce the read-only inventory

With Node available and `$ss2Install` pointing to the Collection directory:

```powershell
$ss2Install = 'C:\Program Files (x86)\Steam\steamapps\common\Swords and Sandals Classic Collection'
$swf = "$ss2Install\swf\swords_sandals2_download.swf"
node tools/inspect-swf.mjs $swf --references 'dungeon' --around 90
node tools/inspect-swf.mjs $swf --references 'fight_mode'
node tools/inspect-swf.mjs $swf --references '"tournament[0-9]+"'
node tools/inspect-swf.mjs $swf --function '^randomise_gladiator$' --max-actions 3000
node tools/inspect-swf.mjs $swf --references 'save_character'
```

Frame labels were decoded separately; see the method note. These commands print
analysis only. Do not redirect decompiled game code or assets into the
repository.
