# SS2 leveled-gladiator arena route

Status: **executed map**, recorded 2026-08-30 as a static read and revised
2026-08-30 against the real build after the route had been run end to end many
times. Companion to [the battle map](ss2-battle-map.md); same licensed build,
same [fingerprint](ss2-build-fingerprint.json), same inspection boundary. It
contains no game code, artwork, audio, exported scripts, or game binaries —
only frame labels, symbol names, character ids, instruction offsets and derived
numbers.

The byte-level content below was read from the installed
`swf/swords_sandals2_download.swf` in place; nothing was patched, copied or
exported. The runtime content comes from the arena capture sessions in
`captures/arena-*` (gitignored raw logs), which **did** launch the game and
**did** write the save — that is what the route is for, and §8 is the procedure
that makes it safe.

### How to read a claim in this document

| Marking | Means |
| --- | --- |
| **byte-verified** | read from the SWF action stream at the cited offset |
| **observed** | read off a live run's own log line in `captures/arena-*` |
| **inferred** | follows from byte-verified facts but no run has exercised it |
| **unverified** | neither; §10 lists every one of these and what would settle it |

A first revision of this document was written before anything had been run.
Six of its claims were wrong and two hazards were missing entirely; each
correction is marked **Corrected** in place rather than silently rewritten, so
a reader who remembers the old text can see what changed and why.

## Why this document exists

Every capture that produced one of the 22 promoted goldens reaches its fight the
same way: the wrapper loads a saved gladiator, jumps to `daybreak`, and the game
routes a **level-1** hero into the dungeon prologue and the tutorial prisoner.
The [staging analysis](ss2-capture-staging.md) found 13 of 17 remaining
candidate fixtures unreachable from that pair — they need armour on a combatant,
a `tournament` fight mode, or a non-lethal outcome.

This document maps the other route: a **leveled gladiator in the ordinary
arena**, which skips the dungeon branch entirely. That route now exists as
`-Navigate arena` (§9), has been run against the real build many times, and has
carried a gladiator from level 1 to level 5 and through a tournament ladder to
the rank-1 champion (§12).

## Method note — FrameLabel decode

When this map was first written the project inspector did not decode
`FrameLabel` (tag 43); the battle map recorded that as an open question for
sprite 862, and tag 43 was decoded here with a throwaway out-of-repo reader
that printed label→frame numbers only (no action bytes, no assets).

**That is no longer necessary.** `tools/inspect-swf.mjs` now has a `--labels`
mode (with `--timeline <regex>`), so every label table below is reproducible
with the project's own read-only tool:

```powershell
node tools/inspect-swf.mjs $swf --labels --timeline '^root$'
node tools/inspect-swf.mjs $swf --labels --timeline '862'
```

The `--labels` output for the root timeline matches the label→frame column of
the table below exactly. Note that `--labels` prints the **label span** (the
frames a label owns until the next label), while the table's third column is
the frame the playhead actually **rests** on — usually the label span's `Stop`,
which is earlier. `foyer` is the clearest case: label span 203–213, rests at
208. Two results settle open items:

- **Sprite 862 has exactly eight labels**, at frames 1, 5, 13, 20, 28, 52, 62
  and 74 — the same eight the battle map already verified from the action
  stream. There is **no ninth label** in the 38–51 gap: `closerange_archer` owns
  frames 28–51 outright. The battle map's "cannot be excluded from the action
  stream alone" caveat can be closed, and the battle map has since closed it.
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
  every two ticks while `_root.day_night` advances one frame per tick.

  **Corrected — the parity is GUARANTEED on a clean entry, not incidental.**
  The first revision left this "unverified". It is now byte-verified from the
  root tag stream: `day_night` is **character 1772 at depth 408**, with a
  `PlaceObject2` at root frame **96** and a `RemoveObject2` at root frame
  **150**. So on a clean entry the clip is instantiated as the playhead shows
  96, its frame 1 displays at root 96, and at root 113 it is on clip frame
  `113 - 96 + 1 = 18` — even. The 112↔113 oscillation then advances it **two
  per test**, so only even clip frames are ever sampled, and 80 is even. The
  clip is reached on the 32nd test of frame 113.

  This also explains the one way to break it, which is not hypothetical:
  **re-entering `daybreak` from inside the stall.** A `gotoAndPlay("daybreak")`
  issued while the playhead is at 112/113 never passes frame 150, so the
  `RemoveObject2` never runs, the same character survives at the same depth,
  and its playhead is *not* reset — but the root walks 96→113 again, adding 17
  frames and flipping the clip to odd parity. Frame 80 is then never sampled,
  `day_night` runs on to its `Stop` at 107, and the screen hangs forever. The
  game's own re-entries are safe because every one of them (button 775's
  `tournament_complete` arm, button 2283's `herolevel == 2` arm) arrives from
  beyond frame 150 and therefore gets a fresh clip.

  The rule this produces for any navigator: **time-limit the daybreak wait,
  log `day_night._currentframe` on timeout, and never re-issue
  `gotoAndPlay("daybreak")` to "retry" it.** That is GATE D in
  `stepArenaNavigator` (§9).
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
| 11 | **`+0x07d4`–`+0x0845`** | **`special_event_chance = 1 + RandomNumber(100)`; jump to `special_event` when it is `<= 2`** |

Steps 9 and 11 are the two hazards described in §8. Note their order: the save
flush happens **first**, so by the time step 11 can end the run the write has
already occurred.

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

### `time_of_day` — Corrected

The first revision of this document said `time_of_day` "is written at only four
sites in the build … so **nothing advances the clock per fight**", and
concluded that a navigator which sets `time_of_day = 24` can loop duels
indefinitely. **That is wrong, and it is the single most consequential error the
first revision made.** It missed the writer that matters.

`day_night_cycle` (root frame 35 `DoAction@0x3ffdcf`, `DefineFunction2` body at
`+0x0b87`) **increments `time_of_day` every time it runs**:

```text
if (_global.battle_started != true) {                   // +0x0b87..+0x0b97
  if (_global.cloudframe == null|undefined) cloudframe = 1;   // +0x0b9c..+0x0bcf
  if (_global.time_of_day < 200                         // +0x0bd0..+0x0be3
      && _global.special_event_happening != true) {     // +0x0be9..+0x0bf9
    _global.time_of_day++;                              // +0x0bfe..+0x0c0b
  }
  townsquare.gotoAndStop(time_of_day);                  // +0x0c0c
  sky.gotoAndStop(time_of_day);                         // +0x0c28
  village_bg.gotoAndStop(time_of_day);                  // +0x0c44
  ... moon, clouds, rain ...
}
```

It runs from **two** independent sources:

1. **A wall-clock interval.** `initwarrior` installs
   `setInterval(day_night_cycle, 1500)` at root frame 35 `+0x0a9d`–`+0x0ab3`,
   once, behind a `timerinit == null` guard at `+0x0a76`. So the clock advances
   **every 1.5 seconds of real time** on every screen except the battle — the
   `battle_started != true` gate at `+0x0b87` is what pauses it during a fight.
   Frame count, frame rate and screen make no difference; only wall time does.
2. **Six direct calls, one per screen entry.** `day_night_cycle()` is invoked at
   root frames **96** (`+0x0000`), **150** (`+0x041c`), **160** (`+0x3108`),
   **179** (`+0x0000`), **187** (`+0x0000`) and **203** (`+0x0000`). Every
   `daybreak`, town-square, special-event, weapon-shop, magic-shop and foyer
   entry therefore adds an increment **on top of** the interval.

The four sites the first revision found are the ones that *reset* the clock, not
the ones that move it: button 1669 `+0x0104` (`= 24`), button 2283 `+0x023a`
(`= 24`), button 775 `+0x0613` (`1 + RandomNumber(23)`) and button 1827
`+0x011f` (same). A fifth it also missed is the initialisation:
`initwarrior` sets `time_of_day = 25` at root frame 35 `+0x0a50`, which is why a
freshly launched session reads 25 or 26 at the slot screen before any button has
run.

Consequences a navigator must absorb:

- **A run has a real time budget, denominated in wall-clock seconds.** At the
  1.5 s interval alone, 200 is reached about 4½ minutes after the last reset.
  Screen entries make it sooner.
- **Setting `time_of_day = 24` once is not enough.** It must be re-asserted at
  each rest, which is what button 1669 and button 2283 both do and what GATE A
  in §9 replicates.
- **Observed**, from `captures/arena-tourn-2/arena-tourn-2-obs-a1.rufflelog`:
  `tod` reads 26 at `hero-loaded`, 25 at `routed-townsquare`, is written back to
  24 by the navigator at `townsquare` — and then climbs **25 → 27 → 28 → 29 →
  30** across three tournament bouts with no reset at all, because the
  tournament loop never returns to town square (§3). The clock does **not** run
  during the bout itself — arena frame 88 clears `_global.battle_started` at
  `+0x0413`, so the interval resumes for the reward animation, which is where
  the +2 between `battle-ready` and `reward` comes from; the +1 into each
  `ladder-ready` is the foyer's own `day_night_cycle()` call.
- **Observed, and it measures the interval.** Two runs stalled on a screen and
  hit the navigator's own ceiling of 150: one at root frame 186 (the weapon
  shop) after 188 226 ms, one at root frame 208 (the foyer) after 215 414 ms.
  From the reset value 24 to 150 is 126 increments, so the first gives
  **1494 ms per increment** — the `setInterval(…, 1500)` at `+0x0a9d`,
  measured. Two further `ABORT:time-of-day-ceiling` lines in the same capture
  set are not ceiling hits at all: they fired at 430 ms and 415 ms with
  `tod` reading `NaN`, and are the AVM1 comparison defect recorded in the
  wrapper's own `isNum` note, not a clock event.

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

The `game_mode` disjunction in the gate does no work in this build: it reads
`"full"` at runtime (§3), so the second arm is always satisfied and the whole
condition reduces to `herolevel >= tournament_level_required`.

**Observed**: four `ABORT:duel-button-hidden` lines across `captures/arena-*`,
every one reading `"level":4,"required":4` — a level-4 gladiator asked for a
duel, and the navigator refused because the game had already hidden the button,
exactly as the gate predicts.

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
| 6 | `+0x03cb`–`+0x03f9` | **gate opens**: `fight_mode == "duel" && _global.fightstarted != true`. Both `If`s target `+0x046a`, so steps 7–8 are the whole gated body |
| 7 | `+0x0440` | *(gated)* `randomise_gladiator(game.villain, gladiators.villain, game.hero.herolevel)` |
| 8 | `+0x045e` | *(gated)* `constructvillainDNA(game.villain)` |
| — | `+0x046a` | **gate closes**; everything below runs in every mode |
| 9 | `+0x0482`–`+0x04ba` | if `hero.tournament_ranking == 2`, `unleash_hell(hero.current_tournament)` |
| 10 | `+0x04cd`–`+0x04fc` | if `hero.herolevel == 1`, `unleash_hell(0)` |
| 11 | `+0x0503`–`+0x0538` | `skincharacter(game.villain, gladiators.villain)` |

Three byte-level facts matter:

- **`_global.fightstarted` is read at `+0x03eb` and assigned nowhere in the
  build.** The whole-build reference count for the name is one. So the step-6
  gate reduces to `fight_mode == "duel"`, and duel opponents are always
  regenerated on entry.
- Step 10 is **not** gated on `fight_mode`. Any level-1 hero entering
  `arena_intro` gets the prisoner, whichever mode is set. Steps 9 and 10 are the
  only `unleash_hell` sites outside the prologue and the tournament ladder.
- **Corrected — step 9 is NOT followed by `constructvillainDNA`.** The first
  revision's step ordering implied it was, because 8 is printed above 9. It is
  not: the `constructvillainDNA` at `+0x045e` sits *inside* the duel gate. The
  short-circuit `&&` at `+0x03df` jumps to `+0x03f8` and the second `If` at
  `+0x03f9` jumps to `+0x046a` — past `+0x0469`, the `Pop` after
  `constructvillainDNA`. In a tournament, steps 7 and 8 are both skipped, so
  **the only statement that touches the villain after `unleash_hell` is the
  `skincharacter(game.villain, gladiators.villain)` at `+0x0527`.**

  That is not a defect, and the reason is worth following through, because it
  is what makes the rank-1 bout reproducible at all.

  `constructvillainDNA` is a **serialiser**, not a builder: root frame 35
  `DoAction@0x40bf76` `+0x268c`, it concatenates the character object's fields
  into a `charDNA` string (`features`, `hairstyle`, the eight armour pieces, and
  so on, from `+0x26ea` onward). It turns an object into DNA. Nothing in it
  derives a combat value.

  The builder in the other direction is `skincharacter`, and it is the statement
  at `+0x0527`. `skincharacter(whichcharacter, whichavatar)` calls
  **`initcharacter(whichcharacter, whichavatar, whichcharacter.charDNA)`** at
  `+0x1aa1`–`+0x1ab8`, then `updatecharacter`, `colorhero`, and
  **`battlevalues`** at `+0x1ad9`. That is what turns a DNA string into a
  combatant.

  So the tournament path is: `unleash_hell(current_tournament)` builds a
  **brand-new** `Object` on `_root.game.champion` (`+0x18e4`–`+0x18f5`), writes
  the hard-coded `charDNA` literal and the name/quote strings into it, and ends
  — unconditionally, at `+0x2216`–`+0x222e`, past every `which_boss` branch —
  with `_root.game.villain = _root.game.champion`. At that moment the villain
  has a DNA string and nothing else. The `skincharacter` at `+0x0527` then
  parses it and derives every combat field. **No `constructvillainDNA` runs
  anywhere on this path, and none is needed.**

  **Observed**: `root.game.villain.hitpointsmax` and `.armourclass` read 110 and
  86 at root frame 220 in every one of the twelve champion bouts — which is only
  possible if `skincharacter` derived them from the literal.

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

**Observed, and it is as stark as the bytes say.** 54 `versus` lines across
`captures/arena-*` name 43 distinct opponents. Twelve of the 54 are the
champion, and **every one of the other 42 is unique — not a single generated
opponent repeated**, in name, `hitpointsmax` or `armourclass`. The only
reproducible opponent in the whole capture set is the one with no RNG behind it
(§12).

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

### `game_mode` reads `"full"`, and every demo cap below is dead — Corrected

The first revision reasoned about this build as the demo, on the strength of
`_root.fizMode` looking unset, and carried the demo caps into several sections.
**It is the full build at runtime.**

- `_global.game_mode` is written at exactly two sites, both in
  `root/frame:10/DoAction@0x3c46b8`: `"full"` at `+0x0102` and `"demo"` at
  `+0x0115`, selected by `_root.fizMode == "fizzle"` at `+0x00e4`–`+0x00f7`.
- **`_root.fizMode` is set to `"fizzle"` by the build itself**, at
  `root/frame:1/DoAction@0x5b66c` `+0x0026` — long before frame 10 reads it. So
  the `"full"` arm is the one that runs.
- **Observed**: 32 log lines across `captures/arena-*` report
  `"gameMode":"full"`, read out of the game at the reward screen. Not one
  reports `"demo"`.

What that makes dead, in this build:

- **`is_that_virtuous()` is never called.** `constructDNA` invokes it at
  `root/frame:35/DoAction@0x40bf76` `+0x1b92`, but only behind
  `fizMode != "fizzle"` at `+0x1b7d`–`+0x1b8d`. Its caps — `herolevel` 12, all
  eight stats 50, every armour piece 8, `maximum_ammo` 10,
  `inventory_maxslots` 2 — **do not apply**. A level-5 gladiator with vitality
  17 has been run past every one of them.
- The `game_mode == "demo"` arms of the foyer `browse` gate (`+0x024d`), button
  775 (`+0x047d`) and the shop level refusals (`sprite:1909` `+0x0b56`,
  `sprite:2023` `+0x0b87`) are unreachable, so the tournament ladder is **not**
  capped at 3, the level ladder is capped at 50 rather than 12, and shop items
  above `itemlevel` 12/16 are not "demo locked".
- Arena frame 231's level-up gate (§4) reads `_root.fizMode` directly rather
  than `game_mode`, and takes its `fizMode == "fizzle"` arm for the same
  reason: `herolevel < 50 && current_tournament <= 18`.

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
`_root.game.villain` is bound before the fight and root frame 214 never
*generates* a replacement (its `randomise_gladiator` is behind the
`fight_mode == "duel"` gate). For ranks 2..N frame 214 leaves the binding alone
entirely; for rank 1 it rebuilds the same hard-coded opponent from the same
literal (§2), which is a rebind but not a redraw.
Rank 1 is the tournament boss from `unleash_hell(tournament_number)`; ranks
2..N are ordinary generated gladiators at the hero's level. The hero starts at
`tournament_ranking = tournament_max_gladiators` (foyer frame 1 `+0x0311`) and
loses one rank per win (arena frame 88 `+0x094f`).

**The `i == 1` arm's `constructvillainDNA` is destructive, and harmlessly so.**
`constructvillainDNA` **serialises** an object into a `charDNA` string and
writes it back (`+0x26ba` … `SetMember` at `+0x29a9`), so calling it at
`+0x0320` on a champion that `unleash_hell` has just built — an object holding
a hard-coded DNA literal and four name/quote strings and *no* stat fields —
overwrites that literal with a serialisation of fields that do not exist. It
does not matter: the champion is rebuilt from the literal by frame 214's own
`unleash_hell` call before the bout, and never fought from the foyer's copy.
That is a load-bearing detail for reproducibility, not trivia — §2 traces the
full path.

Two capture-relevant consequences:

- **The tournament field is inspectable before the first bout — but only
  partly, and not at rank 1.** The ladder names are on screen and the objects
  are live at `_root.game.villain2` … `_root.game.villainN`. Two live
  qualifications the byte reading did not predict, both from the `ladder` dumps
  in `captures/arena-tourn-2`:
  - **`_root.game.villain1` is an empty `Object`.** Foyer frame 22 creates it at
    `+0x02b1`, but the `i == 1` arm then builds the champion into
    `_root.game.champion` (`+0x02fc`, `+0x0320`) and never writes it back. Every
    field of rank 1 reads `undefined` in every run — 9 of 9 checked. The
    champion is readable, just not under that name.
  - **Derived combat fields are `undefined` until that villain has been
    fought.** `hitpointsmax`, `armourclass`, `min_damage` and `max_damage` all
    read `undefined` at the first foyer frame 36 and materialise only after the
    object has been through `skincharacter` → `battlevalues` as the active
    villain. What *is* readable up front is the stored side —
    `attack`, `defence`, and the per-piece armour tiers — which is enough to
    reject a field but not to model a fight.

  Identity is otherwise stable across bouts, as the byte reading predicted:
  ranks 2 and 3 report identical `attack`/`defence`/`helmet` in all three dumps
  of a run. The objects are not immutable, though — in one run rank 3's stored
  `greaves` read 1 before its bout and 0 after it, so being fought can change
  them.
- The tournament fight button is character 2071 (sprite 2095 frame 22 depth
  169); its whole body at `+0x0000` is `_root.gotoAndPlay("arena_intro")`.
- **Corrected — a tournament loss does NOT end the character.** The first
  revision said it did. `sprite:2249/frame:315/DoAction@0x6e700c` `+0x03a2`
  does branch on `tournament_in_progress == true` into the game-over path
  instead of the ordinary loss panel, and that much is byte-verified — but
  losing the *screen* is not losing the *slot*. `save_character` has exactly
  three call sites in the whole build (root frame 150 `+0x0585`, button 1565
  `+0x02d6`, button 2042 `+0x020f`), and **none of them is reachable from a
  bout, from the ladder, from the win chain or from the loss path.** The slot
  still holds whatever the last town-square entry flushed. **Observed**: 22
  `ABORT:battle-lost` lines across `captures/arena-*`, including eight losses
  to the rank-1 champion, and the gladiator survived every one — it lost gold
  and counters that were never flushed, and nothing else.
- **The tournament loop never returns to town square, so the whole ladder
  shares ONE `time_of_day` budget with no reset anchor.** Every exit from a
  won tournament bout goes to `foyer`, never to `townsquare`: button 775's
  `tournament_in_progress` arm at `+0x05cf` and button 2283's
  `tournament_in_progress` arm at `+0x029a` both jump there. Since
  `time_of_day` is only ever reset by a button (§2) and the two buttons on this
  loop take the *foyer* arm rather than the resetting one, the clock runs
  monotonically from the ladder's first bout to its last while
  `day_night_cycle` fires on every foyer entry (root frame 203 `+0x0000`) and
  every 1.5 s besides. **Observed**: `tod` 25 → 30 across three bouts in
  `arena-tourn-2-obs-a1`, with no reset in between. A ladder must therefore be
  entered with the clock freshly reset and be budgeted whole; there is no
  mid-ladder anchor to re-assert it from.

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
`round((L-1)^2 * ((L-1)/5) * 300)` and `round(L^2 * (L/5) * 300)`.

**Corrected — the floor at `+0x39a0` is a flat 125, and level 1 needs 125, not
60.** The first revision decoded the multiply/round chain but left the floor
"partly decoded" and quoted the raw formula's ~60 for level 1. The bytes are
unambiguous:

```text
if (game.hero.experienceneeded < 125)     // +0x399a..+0x39aa
  game.hero.experienceneeded = 125;       // +0x39af..+0x39c7
```

`Less2` against the literal 125, negated, skipping the assignment — so any
computed value below 125 is raised to exactly 125. Level 1's raw
`round(1 * 1 * (1/5) * 300)` is 60, which is below the floor. **Observed**: a
level-1 hero at the reward screen logged `"experience":125,
"experienceneeded":125`; a level-2 hero logged `480` (the raw formula's value,
above the floor, so unchanged); a level-4 hero logged `3840`.

The resulting bands: level 1 spans 0→**125**, level 2 spans 60→480, level 4
spans 1620→3840. One duel win against a generated opponent at the hero's own
level is worth several hundred `character_xp`. **A level-2 capture gladiator
will usually level up on its first or second duel win** — the level-up screen is
not an edge case on this route, it is the common case.

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

Three things about the arm order that matter on the tournament ladder:

- **The level-up arm outranks the tournament arm.** A win that levels the hero
  goes to `levelup` (`+0x059e`) whether or not a tournament is in progress, and
  the ladder is only resumed afterwards by *button 2283's* own
  `tournament_in_progress` arm. **Observed** at every mid-ladder level-up.
- **The tournament arm goes to `foyer`, never `townsquare`** (`+0x05cf`). With
  button 2283's matching arm (`+0x029a`), that is the whole reason the ladder
  shares one `time_of_day` budget — see §3.
- The `game_mode` disjunction at `+0x047d`/`+0x04bf` reduces to
  `herolevel < 50` in this build (§3).

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
if (statpoints > 0) {          // BARE NAME - see below     // +0x0156..+0x016a
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
if (_root.game.hero.statpoints > 0) {         // +0x003a..+0x0060
  _root.clicksound.start();                   // +0x0065..+0x0080
  _root.game.hero.strength++;                 // +0x0081..+0x00ae
  _root.game.hero.statpoints--;               // +0x00af..+0x00e4
}
```

### The two `statpoints` are not the same variable — Corrected

The first revision rendered button 2283's gate as
`if (_root.game.hero.statpoints > 0)`. **It is not.** The two gates are written
differently, and the difference decides whether an unattended run can leave the
level-up screen at all.

| Site | Bytes | Resolves to |
| --- | --- | --- |
| the eight stat buttons, e.g. **1596** `+0x004c` | `Push "statpoints"; GetMember` — the member of the `_root.game.hero` object already on the stack from `+0x003a` | `_root.game.hero.statpoints`, the **real** counter |
| the continue button **2283** `+0x0156` | `Push "statpoints"; GetVariable` — a bare name with nothing on the stack | `_root.statpoints`, a **display mirror** |

The mirror is maintained by an `enterFrame` clip action on the level-up stat
panel: `root/frame:227/instance:357/clip-action:0`, which copies
`_root.statpoints = _root.game.hero.statpoints` at `+0x0081`–`+0x009b` and does
the same for all eight stat names below that. Character **2265** is placed at
depth **357** by a `PlaceObject2` at root frame **227** and removed by a
`RemoveObject2` at root frame **235**, so the mirror is refreshed every frame
across the whole level-up span and nowhere else.

**Why it matters, and it was confirmed live on the first arena run.** The
mirror is a frame behind. Spending the fourth point drives
`game.hero.statpoints` to 0, but `_root.statpoints` still reads the previous
value until the next `enterFrame`. A navigator that spends four points and
presses 2283 in the same execution slot reads the stale mirror, takes the
refusal arm, and gets nowhere. The observed pair, from
`captures/arena-dry-4/arena-dry-4-obs.rufflelog`:

```text
"step":"levelup-point","spent":4,"vitality":5,"statpointsHero":0,"statpointsRoot":1
"step":"levelup-mirror-wait","statpointsRoot":0,"statpointsRootRaw":"0","ticks":1
```

`statpointsHero` 0 while `statpointsRoot` still reads 1 — exactly one point of
lag — and the mirror clears on the very next tick. **All 13 level-ups recorded
across `captures/arena-*` show the identical pair**, with zero variation in
either value or in the one-tick wait. This is GATE C in §9.

**One overstatement to retract with it.** An earlier audit concluded that
pressing 2283 early "parks the run forever". It does not: the refusal arm sets
`inspirato_text` and jumps to the end of the body (`Jump` at `+0x0177`), so it
is idempotent and retryable. The gate is still right — pressing into it wastes
frames and muddies the log — but the consequence is a retry, not a hang.

**And one dead call.** Button 2283's `tournament_in_progress` arm calls
`_root.backup_character(...)` at `+0x0276`. **No such function exists in this
build**: a whole-build function-name search for `/backup/` returns exactly one
definition, `backup_char(whichcharacter)`. The call is a no-op and nothing may
depend on it. What actually preserves the four spent points is the
`backup_char` at `+0x017c`, which runs `constructDNA` and serialises them into
`charDNA` before any later `save_character` rebuilds the hero from it.

**What an unattended run should do.** Spend all four points into the *same*
stat, every time, and record which one in the observation. `vitality` is the
recommended default: it changes only `hitpointsmax` (`herolevel * 10 +
vitality * 20`, battle map §Combatant state objects) and so leaves
`attack`, `defence`, `charisma`, `magicka`, `strength`, `speed` and `stamina` —
every input to `attack_chances`, the damage roll, the deflection threshold and
the controller selector — untouched. A run that spreads points, or picks a
different stat per session, makes two sessions of the same "family" no longer
comparable.

**Observed, and it corroborates the battle map's formula while exposing a
trap.** The four `levelup-confirm` lines in `captures/arena-*` are:

| `herolevel` | `vitality` after the spend | `hitpointsmax` reported |
| ---: | ---: | ---: |
| 2 | 5 | 40 |
| 3 | 9 | 130 |
| 4 | 13 | 220 |
| 5 | 17 | 310 |

None of these matches `herolevel * 10 + vitality * 20` against the vitality on
the same line — but every one matches it exactly against the vitality *before*
the four points were spent (level 3 with vitality 5: `30 + 100 = 130`; level 5
with vitality 13: `50 + 260 = 310`). **`hitpointsmax` on the level-up screen is
one spend-cycle stale**, because button 775 calls `battlevalues` at `+0x0564`
*before* jumping to `levelup`, and nothing recomputes it until the next
`battlevalues` call. Read it there and you will be four vitality points behind.
The battle map's formula is right; the screen is late.

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

The `item<n>` handlers in that first column are genuinely callable — but **not
from the shop's entry or `browse` page**, where they do not exist yet. See
*What running the shop established* at the end of this section.

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

The two `game_mode == "demo"` refusals in the Gates column (`itemlevel > 12`
for armour at `sprite:1909` `+0x0b3d`, `> 16` for weapons at `+0x08ee`) are
**dead in this build**: `game_mode` reads `"full"` (§3).

### What running the shop established

Three things the byte reading did not predict, all from live runs:

- **The `item<n>` handlers do not exist on the shop's entry or `browse`
  pages.** Probed at shop frames 38 and 47, the clip carried `weaponbuttons`,
  `buyweapon`, `getweaponinfo` and a set of `instanceNNN` slots, and **no
  `item<n>` property at all**. The per-item `onRelease` bindings are wired by
  the **category page**, so a navigator has to send the shop to one first. A run
  that waited on `item60.onRelease` instead entered the weapon shop, reached its
  `Stop` at root frame 186, and sat there until the GATE A ceiling 188 s later.
- **The attribute gate really does refuse a vitality-only gladiator
  everything.** Observed: twenty-five successive refusals walking item ids from
  40 down to 14, because a vitality-only build has base `strength` and `speed`
  and `attribute_required` is the hero's governing attribute for the band. This
  is why §9's staging applies hero attributes at the town square, *before* the
  shop, and not only at battle start.
- **The refusal is legible from outside.** `buyweapon` answers by which page it
  plays — `getitem` (147 weapons / 184 armour) means the hero qualifies,
  `angry` (27) means it does not. Reading the answer is more robust than
  reimplementing the gate, and it is what the navigator does.

One hard-won caution about writing gold: `check_for_nan` will silently "repair"
a NaN `goldpieces` to `herolevel * 1000`. An early version of the shop confirm
read `itemcost` and `itemnumber` straight off the shop clip on the strength of a
doc summary; live, both came back `undefined`, `goldpieces -= undefined` gave
NaN, and a staged 5 000 000 became exactly 4 000. The line is still in the
captures:

```text
"step":"shop-bought","kind":"weapon","item":39,"cost":null,"weapon":20,"goldLeft":4000
```

`"cost":null` is the unreadable operand; `"goldLeft":4000` is
`herolevel * 1000` for a level-4 hero, i.e. the repair. The plain guard
`goldpieces < itemcost` did not stop it, because **every** comparison with NaN
is false in AVM1 — see §9. Numbers read out of the game go through an `isNum`
check first, always.

## 7. Loss chain (for completeness)

`sprite:2249/frame:315/DoAction@0x6e700c`: `battlesfought++` (`+0x02d1`),
`battleslost++` (`+0x0307`), then a branch on `_global.tournament_in_progress`
(`+0x03a2`). Tournament losses take the game-over path; other losses show the
`fight_over_lost` panel, set the yield text, and compute
`goldlost = ceil(herolevel * herolevel * 50)` (`+0x041d`–`+0x046a`), clamped at
zero. The panel's button (character 2244, in sprite 2247) returns the root to
`townsquare`.

## 8. The two frame-150 hazards — read this before scheduling a session

Root frame 150 is where this route's risk lives. It does two dangerous things
on every single town-square entry, in this order: it **flushes the save**, and
then it **rolls a die that can end the run**.

### 8a. The save-write hazard

**Root frame 150 calls `save_character(_global.current_character)` at
`+0x0585`, on every entry to the town square.**
`save_character(char_no)` (`root/frame:10/DoAction@0x3c4087`, `DefineFunction2`
at `+0x01d2`) re-skins and re-derives the hero, splits `heroDNA` into
`characterDNA`, writes it into `so_local["character" + char_no]`, then calls
`SharedObject.getLocal("ss2_data")` and **`.flush()`** (`+0x027e`–`+0x02b8`).

The whole-build call list for `save_character` is: root frame 150 `+0x0585`,
button 1565 (new-character confirm) `+0x02d6`, and button 2042 `+0x020f`.

The prisoner route never touches root frame 150 — `daybreak` sends a level-1
hero straight to `dungeon`. **Every leveled-gladiator route does**, on the way
in via frame 113's `herolevel > 1` arm: there is no path from `daybreak` to
`foyer` that does not pass through `townsquare`. It is touched again after every
**duel** win with no level-up (button 775's default arm at `+0x0706`) and after
every **level-up** outside a tournament (button 2283's default arm at `+0x02b3`).
It is **not** touched again during a tournament ladder — both of those buttons
take their `foyer` arm instead — so a ladder flushes once on the way in and then
runs to its end unflushed (§3).

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
  **Now implemented**: `tools/runtime-capture/save-state.ps1` snapshots and
  restores the licensed `ss2_data.sol`, and `run-arena.ps1` refuses to start
  without a fresh `-Snapshot` name, takes the snapshot itself before anything is
  launched, and hashes the save before and after. The session protocol document
  still does not mention any of this — see §11 item 5.
- **Concurrency is refused on this route.** `run-campaign.ps1 -Concurrency > 1`
  gives each session its own SharedObject store, which *forks* the save. That is
  right for the capture campaign and wrong here, because the arena route has to
  **accumulate** state across bouts.
- Jumping `_root.gotoAndPlay("foyer")` directly from the slot screen would skip
  `townsquare` and the save. **Do not do this without evidence.** It also skips
  `day_night_cycle`, the `townhero` attach, `constructDNA`, `skincharacter` and
  the `charsheet` attach, and this project has already learned once what
  skipping construction frames costs. The evidence that would settle it is a
  session that takes that shortcut and completes a full fight without the
  character-validation screen — and that experiment should be run against a
  throwaway slot, not a capture gladiator.

### 8b. The 2 % special-event draw — a hazard the first revision missed entirely

The first revision described the special event as a `time_of_day >= 200`
consequence of root frame 158, and left it there. **That is only the second of
its two triggers, and it is by far the rarer one.** The dominant trigger is an
unconditional die roll at the end of root frame 150 itself, at
`+0x07d4`–`+0x0845`:

```text
special_event_chance = 1 + RandomNumber(100);          // +0x07d4..+0x07e5
if (special_event_chance <= 2                          // +0x07e6..+0x07f8
    && _global.special_event_happening != true         // +0x07fe..+0x0813
    && _global.special_for_day != true) {              // +0x0819..+0x082d
  _root.gotoAndPlay("special_event");                  // +0x0832..+0x0845
}
```

Everything about this is hostile to an unattended run:

- **It is a flat 2 % on EVERY town-square entry**, wholly independent of
  `time_of_day`, of the hero, of the day counter and of anything a navigator
  can set. `1 + RandomNumber(100)` is `<= 2` for exactly two of a hundred
  outcomes.
- **It cannot be intercepted.** The draw uses the AVM1 `RandomNumber` **opcode**
  (`+0x07e3`), not `randomBetween`, so the capture wrapper's tape injection —
  which shadows `Math` and the `randomBetween` helper — cannot see it, record
  it or replace it. No instrumentation available to this project can.
- **It cannot be pre-armed away.** The one suppressor a navigator could set,
  `special_for_day`, is written `true` at exactly one site in the build: root
  frame **160** `+0x313a` — *inside* the special event it would be suppressing.
  Its three `false` writers are the frame-10 initialisation (`+0x0643`), button
  775's `tournament_complete` arm (`+0x0689`) and button 1827 (`+0x0195`).
  There is no way to arrive at frame 150 with it already set without having
  already had the event. `special_event_happening` is the same shape.
- **The jump happens AFTER `save_character`** at `+0x0585`, so by the time a
  run can detect it the flush has already occurred. That is why aborting on it
  is safe rather than merely early: nothing is left half-written.

The arithmetic a schedule has to budget: a level 1 → 4 run makes **three to six
town-square entries**, so **6–12 % of otherwise healthy runs end this way**.
That is a budgeted failure rate, not a defect. The right handling is the one
`run-arena.ps1` implements: treat the special-event screens (root frames
160–169) as a hard abort, and relaunch from the snapshot. `run-arena.ps1`
classifies `special-event-screen` alongside `battle-lost` in its `$RECOVERABLE`
set and retries under `-Attempts N`, deliberately *without* restoring the
snapshot, because the save already holds every completed bout.

**Status: byte-verified, not yet observed.** No `ABORT:special-event-screen`
line appears in the retained `captures/arena-*` logs — with 12–15 recorded runs
at roughly 2 % per entry that is unremarkable, but it means the abort path
itself has been exercised only by the `battle-lost` sibling that shares it.

## 9. The navigator: `-Navigate arena` (`stepArenaNavigator`)

**This section used to propose a navigator. It now describes one that exists.**
`stepArenaNavigator` lives in
[`ss2-capture-wrapper.as`](../../tools/runtime-capture/ss2-capture-wrapper.as)
and is driven by
[`run-arena.ps1`](../../tools/runtime-capture/run-arena.ps1). The proposal's
shape survived — a state check that says it is safe to proceed, then the game's
own call that advances it — but it was rebuilt as a **loop** rather than a
linear walk, and it grew four hard gates the proposal did not have.

### It is a state machine over the screen, not a step list

`stepNavigator` (the prisoner route) is a one-shot linear walk to a single
staged fight. This route goes town square → foyer → fight → reward → (level up)
→ town square and back again, so re-entering a screen is the ordinary case
rather than an exception. `stepArenaNavigator` is therefore a state machine
whose state is the screen the game is resting on:

`boot` → `slots` → `load` → `confirm` → `daybreak` → (`prologue` |) `town` →
(`shop-open` → `shop-answer` → `shop-leave` →) `foyer` → (`ladder` →) `intro` →
`fight` → `in-battle` → `reward` → (`levelup` →) back to `town` or `foyer`.

### The four gates, and why each exists

Every one of these came from an adversarial audit of the first revision of this
document, and each is enforced in code rather than left to procedure. **None
may be relaxed without new evidence.**

| Gate | What it enforces | The section it comes from |
| --- | --- | --- |
| **A** | `time_of_day` is re-asserted to 24 at every town-square rest (the write buttons 1669 and 2283 both make), logged on both sides, and the run aborts well below the game's own 200 — default ceiling 150, plus a wall-clock session limit for a stall that never advances the clock | §2 — the clock advances on a 1.5 s interval *and* on six screen entries |
| **B** | root frames 160–169 are a **hard abort**, never advanced through | §8b — the 2 % draw, plus the `time_of_day >= 200` branch |
| **C** | button 2283 is pressed only once `_root.statpoints` — the **display mirror** — has read zero on a *later* frame, twice in a row | §5 — the mirror lags the real counter by one point |
| **D** | the `daybreak` wait is time-limited, logs `day_night._currentframe` on timeout, and **never re-issues `gotoAndPlay("daybreak")`** | §1 — re-entering the span mid-way keeps the old clip and flips its parity to a permanent hang |

Two supporting rules the gates rest on:

- **Terminal screens.** Any root frame `>= 235` (gameover, bugs,
  `gameover_demo`, `enter_highscore`) is an abort; nothing on this route is
  above 234.
- **`isNum` before every numeric test.** AVM1 has one comparison opcode: `>` is
  `<` with the operands swapped, and `>=` / `<=` are it negated — so **both
  negated forms return TRUE for NaN**, and every value read out of the game is
  `undefined` until the frame that initialises it. This bit twice in one run:
  `tod >= ceiling` aborted the first live arena run at 430 ms with
  `time_of_day` undefined, and the guard written to fix it,
  `n > 0 || n <= 0`, did it again (`NaN <= 0` is `!(0 < NaN)`, which is true).
  The only safe shape is un-negated `<`, twice: `(n < 1) || (0 < n)`.

### A caveat that shapes every phase below

The prisoner navigator advances by two different mechanisms:

- `root.get_char1.onRelease()` at `navStep 2` — a **script-assigned** handler
  (wired at root frame 84 `DoAction@0x419cbc` `+0x0548`), genuinely callable.
- `_global.fightselected = false; root.gotoAndPlay("arena")` at `navStep 5` — a
  faithful **replication of a `DefineButton2` body** (character 2128), because
  tag-defined button actions are not reachable from ActionScript.

Every control on the town-square / foyer / reward / level-up path is a
`DefineButton2`. So the leveled navigator is mostly of the second kind: it
executes each button's body verbatim, in order, with nothing added or omitted,
and lets the game run its own frames in between. Each phase below names the
button it replicates so the two can be diffed. Where a body draws a random
number, the navigator draws one too (AS2 `random(n)` compiles to the same
`RandomNumber` opcode) rather than substituting a constant.

Both halves of "nothing added or omitted" have already been violated once and
corrected: an early revision **dropped** button 1669's `clicksound2.start()`,
and another **added** a `clicksound2.start()` to button 1800, whose entire body
is one `gotoAndPlay("foyer")` call and no sound. Neither would have changed
an outcome; both would have made the replication a claim the bytes do not
support. The shop item handlers, by contrast, are the *first* kind — genuinely
script-assigned — and are called rather than replicated; only the `getitem`
confirm (character 1952 / 1907) is a `DefineButton2` and has to be replicated.

### The phases as built

Each row is a phase of `stepArenaNavigator`. "Log" names the `step` field of
the `{"t":"dbg","at":"arena"}` line the phase emits, which is how a run is read
back from `captures/arena-*`.

| Phase | State check | Action (and the button/site it replicates) | Log |
| --- | --- | --- | --- |
| `boot` | `root.so_local != undefined` (proves frame 10's SharedObject read ran) | `root.gotoAndPlay("new_or_continue")` | `title` |
| `slots` | `root._currentframe >= 52` | `root.gotoAndPlay("load_saved_gladiators")` | `new_or_continue` |
| `load` | `typeof root.get_char1.onRelease == "function"` and `so_local.max_gladiators >= 1` | `root.get_char1.onRelease()` — a **real** script-assigned handler | `slot-list` |
| `confirm` | `root.game.hero` has ≥ 6 own properties, **and `isNum(herolevel)`**, **and `herolevel >= 1`** | button 1669 verbatim, including the `clicksound2.start()` an earlier revision dropped, then `gotoAndPlay("daybreak")` | `hero-loaded` |
| `daybreak` | root reaches 150–159 (town) or 114–149 (prologue) | none — the game routes itself. **GATE D** bounds the wait | `routed-townsquare` / `routed-dungeon-prologue` |
| `prologue` | root reaches 214–220 | none — the level-1 arm. The prologue skins the hero, builds the prisoner via `unleash_hell(0)` and sets `fight_mode` itself; nothing may hurry it | — |
| `town` | root 150–159 | **GATE A**: re-assert `time_of_day = 24`, logging `todBefore`/`todAfter`. Then optional gold staging, hero staging and shop trips; then button 1800 verbatim (one `gotoAndPlay("foyer")` call, **no sound**) | `townsquare` |
| `shop-open` | the shop clip exists | scan `item<n>` downward for the highest id with a real `onRelease`, sending the shop to category pages until one wires them; call the handler | `shop-page`, `shop-no-handlers` |
| `shop-answer` | the shop clip settled | read **which page the game played**: `getitem` (147 weapons / 184 armour) means it qualifies, `angry` means it does not. On qualify, replicate the `getitem` confirm (character 1952 / 1907); on refusal, step the id down | `shop-bought` |
| `foyer` | root 208, and either `tournament_in_progress == true` (→ `ladder` at once) or `foyer._currentframe == 21` (browse settled) | button 2066 verbatim (duel) or button 2069 verbatim (tournament). The duel arm draws its own `1 + random(max_arena)` | `foyer-browse` |
| `ladder` | `foyer._currentframe == 36` and `root.game.villain` bound | dump every rank's stats and armour, then button 2071: `gotoAndPlay("arena_intro")` | `ladder`, `ladder-ready` |
| `intro` | root 220 | log the villain, then button 2128: `_global.fightselected = false; gotoAndPlay("arena")` | `versus` |
| `fight` | `_global.battle_started == true` | reset the fight policy for a fresh bout, hand to `stepAutopilot` | `battle-ready` |
| `in-battle` | `arena._currentframe >= 250` aborts (loss); otherwise wait for `fight_win_stuff.button_yes._visible` | none | `ABORT:battle-lost` |
| `reward` | `button_yes._visible == true` — a genuine wait on the two-second tween, not a frame number | button 775, **exactly one arm**, chosen the way the button chooses it | `reward` |
| `levelup` | root 234 | spend the four points **one per tick**, then **GATE C**, then button 2283's non-refusal arm | `levelup-point`, `levelup-mirror-wait`, `levelup-confirm` |

Where the built navigator departs from the proposal, and why:

- **`herolevel >= 1`, not `> 1`.** The proposal aborted a level-1 hero. The
  built navigator lets it route into the dungeon prologue (`prologue` phase)
  and self-advance, because the game's own prisoner fight is the cheapest
  level 1 → 2 step available — it is how a fresh gladiator gets onto this route
  at all. What it refuses is a herolevel that is not a number, which is the
  case frame 113 has no arm for (§1).
- **`foyer` has two entry conditions, not one.** Waiting for
  `foyer._currentframe == 21` alone parked every between-bout return for the
  full session limit. A tournament already in progress never shows `browse`:
  foyer frame 1 `+0x035d` jumps straight to `tournament`. Observed as a live
  stall of 215 s ending in a GATE A ceiling abort before it was fixed.
- **Stat points are spent one per tick.** Four presses in one execution slot is
  further from four button presses than four presses in four slots, and GATE C
  needs a later frame anyway.
- **Shop items are chosen by trial, not by modelling the gate.** `buyweapon`
  refuses an item the hero does not qualify for by playing the `angry` page
  instead of `getitem`, so the wrapper offers an id and reads which page the
  shop went to. That is the game answering the question. It also had to scan
  for wired handlers rather than assuming an id exists: a live run entered the
  weapon shop, reached its `Stop` at root 186, and sat until the GATE A ceiling
  because item 60 had no `onRelease` — the per-item bindings are wired by the
  **category page**, not by `browse`.

### The fight policy

The prisoner route's fixed step list cannot serve a duel: the opponent is
generated at the hero's own level, fights back, and the bout runs many turns.
The arena route's policy (`arenaPolicy`, default `aggressive` when no explicit
step list is given) is deliberately the smallest thing that can win one —
close the distance, then attack — and it issues nothing the controller in scope
does not offer, so it can only ever press buttons the player could press. It is
forced off for every route other than `navigate=arena`, rather than merely left
unset, because a stray policy on a prisoner run would replace that route's
explicit step list and all 22 promoted goldens depend on the step list being
exactly what was asked for.

`rest` and `taunt` share one controller slot, chosen by whether stamina is at
least half, and the wrapper cannot see which is wired — so neither is ever
issued.

### The capture gate: which bout may be recorded at all

This is the part with no counterpart in the proposal, and it exists because the
arena route fights **many** bouts per process while only one of them can ever be
evidence.

`arenaCapture` is **`never` by default**. A levelling run is staging, not
observation, and a trace emitted from a duel would be an observation of an
opponent nobody chose and nobody can reproduce (§2). `always` records every
bout. `champion` arms only for the tournament rank-1 bout — and then only if
the hero entering it is reproducible:

- `tournament_ranking <= 2` and `tournament_in_progress == true` (which is
  exactly when foyer frame 22 has bound `game.villain` to the champion);
- `staminaleft == staminamax`;
- `herolevel == -ArenaStagedLevel`, when that is given.

Any field it cannot read counts as unstaged. **Observed doing its job**: in
`captures/arena-champ-1/obs-champ-1-a1.rufflelog` the gate refused 382 times
across one champion bout, and the two reasons it gave are exactly the two §12
predicts — `"staminaleft":106,"staminamax":110` (carried in from the previous
bout) and `"herolevel":4,"stagedLevel":5` (the mid-ladder level-up did not land
that run). A silent non-match became a visible refusal, which is the whole
point.

Winning the champion bout is **not** required. The wrapper arms on the first
`checkattackroll` and closes the trace on that call's return, so the evidence is
one action, and `run-arena.ps1` treats a closed trace as success.

### Staging (`-StageHero`, `-StageVillain`, `-StageGold`)

`stepStaging` writes `field:value` pairs once `battle_started` is true — past
the frame-214 full heal, past frame 221's forced `equipped_weapon = 1`, past
`initbattle` — and repeats for 20 frames because the game re-derives values
during battle construction. It stops before the action arms, so **no staged
write can ever appear in the mutation trace**. Every field is reported on the
trace's `end` line, read back from the game rather than echoed.

Two placements are deliberate:

- **Gold is staged at the town square and nowhere else**, because that is where
  the shops are reachable from and where `save_character` persists it, and
  because no combat site reads `goldpieces` — it is the least invasive
  intervention available.
- **Hero attributes are staged at the town square as well as at battle start**,
  because the shop gate reads them and the shop runs before any battle. A
  vitality-only gladiator has base strength and speed, so every worthwhile
  weapon is refused — observed live as twenty-five successive refusals from
  item 40 down to 14.

The distinction that makes staging honest is in §12: an **attribute** is a
genuine `battlevalues` input, but `min_damage` is one of its **outputs**.

### Still uncertain

- **`gamephase = 1` on a leveled hero.** That is exactly what button 1669
  writes, so replicating it is faithful, but it means a leveled hero arrives at
  town square with the tutorial state machine at phase 1 and picks up the
  phase-1 and phase-2 tooltips (root frame 150 `+0x0484`, root frame 214
  `+0x025a`). Many runs have now reached root frame 220 and fought without
  incident, so the practical risk is settled; what has never been checked is
  whether the tooltip overlays alter anything measurable.
- **Replication versus a real press.** If a future harness gains real input
  injection, prefer pressing `_root.foyer.duel_button` for real. The evidence
  that would settle whether replication is adequate is still a side-by-side:
  one manual session and one navigated session against the same save, compared
  on `_global` state at root frame 220.
- **Spending stat points remains the least faithful step on the route** — the
  button body is two statements with no call, so there is no game function to
  invoke. One point per tick is the closest available approximation.

### What this route does and does not unlock

| Staging blocker | Status on the leveled route |
| --- | --- |
| `fight_mode == "tournament"` | **Unblocked, and now exercised.** Level-4 gladiator, `current_tournament == 1`, foyer `browse` → tournament button. Field of four, arena 2. Reached in 12 of 15 launches (§12) |
| Armour on the villain | **Unblocked.** `randomise_gladiator` gives duel and tournament opponents armour and enchanted weapons at the hero's level; the matched-suit path at `+0x31e5` sets all eight pieces to `round(herolevel/2)`. Observed: ladder opponents with `helmet` 4 and `greaves` 2 |
| Choosing *which* opponent | **Still blocked for duels** — 42 generated opponents observed, 42 distinct. **Partly relieved in tournaments**: the field is pre-generated and partly inspectable at foyer frame 36 before the first bout, but rank 1 is not under `villain1` and the derived combat fields are `undefined` until a villain has been fought (§3) |
| A *reproducible* opponent | **Unblocked, once, at rank 1.** "John the Butcher" from `unleash_hell`'s hard-coded DNA — identical across twelve launches, and the only reproducible opponent in the build (§12) |
| Bow / archer controllers | **Unblocked by a shop trip** — ranged items 61–80, gated on Agility, not level. But the attribute gate is real: a vitality-only gladiator is refused everything, so the shop trip needs attribute staging first (§6) |
| Non-lethal finish | Unchanged; the defeat gate is the battle map's, not this route's. Tournament mode is what makes a hitpoint hit survivable |
| Hero armour / enchantments | Unchanged: outfit the saved gladiator beforehand, now with a real gold income (`round(villain.character_xp * (100 + crowd_interest)/100)` per win) |

## 10. Everything not verified, with the evidence that would settle it

### Closed since the first revision

| Claim | Now | Settled by |
| --- | --- | --- |
| Frame 113's `day_night._currentframe == 80` equality is always sampled | **byte-verified, and guaranteed rather than incidental** | `day_night` is character 1772 at depth 408, `PlaceObject2` at root frame 96 and `RemoveObject2` at root frame 150, so a clean entry puts the clip on frame 18 (even) at root 113 and the 112↔113 oscillation advances it two per test. §1 |
| `experienceneeded = round(L^2 * (L/5) * 300)`, floor "not fully decoded" | **fully decoded; the floor is a flat 125** | `+0x399a`–`+0x39c7`, plus observed `experienceneeded` of 125 / 480 / 3840 at levels 1 / 2 / 4. §4 |
| A leveled hero loaded with `gamephase = 1` is unaffected by the tutorial tooltips | **observed not to obstruct** — many runs have reached root 220 and fought | still unmeasured as to whether the overlays change anything; see below |
| Tournament opponents at ranks 2..N are never regenerated between bouts | **observed** — the ladder dump at foyer frame 36 reports the same field before every bout of a run | `arenaLogLadder`'s `ladder` lines in `captures/arena-tourn-2` |
| Whether `game_mode` is `"demo"` or `"full"` | **`"full"`** | `_root.fizMode = "fizzle"` at root frame 1 `+0x0026`; observed 32 times. §3 |

### Still open

| Claim | Status | What would settle it |
| --- | --- | --- |
| The tutorial tooltips a `gamephase = 1` leveled hero picks up change nothing measurable | **unverified** — they have never obstructed a run, which is not the same thing | a `_global` and hero-field diff between a run staged `gamephase = 1` and one staged `gamephase = 5` at root frame 220 |
| Replicating a `DefineButton2` body is behaviourally identical to pressing it | **inferred** — now from many hundreds of replicated presses across `captures/arena-*` rather than one, but still never compared against a real press | a manual-vs-navigated `_global` diff at root frame 220 |
| A non-ranged secondary weapon still produces sane `bombard`/`snipe` | **unverified** — `swap_weapons` never checks the type | one round with a cheap non-ranged secondary and `swap_weapons,bombardright` |
| The `combatwonitem` / `combat_wonitem` label mismatch is inert | **inferred** — the failed `gotoAndPlay` leaves the playhead at 88, which advances into 94 anyway | a tournament-final win capture logging `_root.arena._currentframe` across frames 88–95. No run has won a tournament yet |
| The 2 % special-event draw ends runs at the predicted rate | **byte-verified but never observed firing** — no `ABORT:special-event-screen` line exists in the retained captures | enough runs to see it; the abort path itself is shared with `battle-lost`, which has fired 22 times |
| Why staged combat stats did not change a fight outcome | **explained but not proved** — §12 gives the `battlevalues` recompute as the mechanism | a targeted probe that reads `min_damage` back *during* the bout rather than at battle construction |
| The magic shop / church `buyitem` routes | **not mapped** | out of scope here; needed only for the spell-ingress fixture group |

## 11. Changes this track asked for elsewhere

This list was written as "changes this track would have made, but other tracks
own these files". Four of the six have since been made by their owners, and are
struck here rather than deleted so the ask and the answer stay together.

### Done

1. ~~**[`ss2-battle-map.md`](ss2-battle-map.md), §Controller frames** — close the
   "a ninth label in that gap cannot be excluded" caveat for sprite 862.~~
   **Done.** The battle map now records "**Settled**: … the sprite carries
   exactly eight labels, at frames 1, 5, 13, 20, 28, 52, 62 and 74 … There is no
   ninth."
2. ~~**[`ss2-battle-map.md`](ss2-battle-map.md), §Battle result and reward
   callbacks** — say that `ceil(herolevel^2 * 50)` is the **loss** deduction,
   and record the win reward.~~ **Done.** The battle map now carries an explicit
   "**Correction: the reward is not `ceil(herolevel^2 * 50)`**" block with the
   win formula at `sprite:2249/frame:88` `+0x078c`.
3. ~~**[`ss2-capture-staging.md`](ss2-capture-staging.md), Group F** — retract
   "no `getphase` label maps to direction 30"; `psyche_up` assigns it.~~
   **Done.** Group F now opens with "**Correction.** This group used to read 'no
   player action is known to produce direction 30'. That was wrong".
4. ~~**[`ss2-capture-staging.md`](ss2-capture-staging.md), Villain-side
   staging** — "the opponent is drawn by the game" understates it.~~ **Done.**
   That section now says the phrase "understates it" and distinguishes the
   generated duel opponent from the pre-generated tournament field.
6. ~~**[`tools/inspect-swf.mjs`](../../tools/inspect-swf.mjs)** — add a
   `--labels` mode that decodes tag 43 per timeline.~~ **Done**, with a
   `--timeline <regex>` filter. See the method note; this document's label
   tables are now reproducible with the project's own tool.

### Still outstanding

5. **[`ss2-runtime-capture.md`](ss2-runtime-capture.md) / the session
   protocol.** Still needs a SharedObject step. The *tooling* has caught up —
   `tools/runtime-capture/save-state.ps1` snapshots and restores the licensed
   `ss2_data.sol`, and `run-arena.ps1` refuses to start without a fresh snapshot
   name, takes the snapshot itself, and hashes the save before and after — but
   the protocol document still describes no backup/restore around a
   save-mutating session. A reader following `ss2-runtime-capture.md` alone
   would not know to take one.

### New, from running the route

7. **[`ss2-battle-map.md`](ss2-battle-map.md), §Controller frames.** Its
   sprite-862 paragraph still ends "the project's own tooling still cannot
   reproduce it; a `--labels` mode on `tools/inspect-swf.mjs` would." That mode
   now exists (item 6), so the sentence is stale.
8. **[`ss2-capture-wrapper.as`](../../tools/runtime-capture/ss2-capture-wrapper.as),
   the shopping comment.** It states the derivation as
   `min_damage = strength + weapons[hero.weapon].weapon_min_damage`. The bytes at
   `+0x3356` are `round(strength * 2) + weapon_min_damage` — the factor of 2 is
   missing. The comment's *conclusion* is right and is the reason the shop path
   exists at all; only the formula is misquoted.
   [`ss2-capture-staging.md`](ss2-capture-staging.md) already records the
   correct `round(strength * 2) + weapon_min/max`.

## 12. What running the route established

Everything in this section came from executing the route against the real
build, not from reading it. Evidence is the gitignored raw logs under
`captures/arena-*`; each claim names the run it came from.

### The route works, and this is what it costs

| Leg | Means | Result |
| --- | --- | --- |
| level 1 → 2 | the game's own dungeon prologue and tutorial prisoner | works, ~7 s |
| level 2 → 4 | duels from foyer `browse` | works |
| tournament ladder, rank 4 → rank 2 | tournament 1, field of four, arena 2 | **five of six attempts** in `captures/arena-tourn-2` (a1–a5 reached the rank-1 bout; a6 lost the rank-2 bout) |
| rank 2 → rank 1 (the champion) | — | **0 for 12** — every champion bout in the retained captures was lost |

Across the retained captures, **12 runs reached the champion bout out of 15
tournament launches**, and every one of the 12 ended in `ABORT:battle-lost`.
Six of those were unstaged vitality-only gladiators; the other six had been
staged (below), including one at `strength 100 / min_damage 300 / max_damage
400 / hitpoints 999`, and lost anyway.

That is not a blocker for the fixture that bout exists to produce: **winning is
not required.** The wrapper arms on the first `checkattackroll` and closes the
trace on that call's return, so the evidence is one action, and `run-arena.ps1`
treats a closed trace as success.

### The rank-1 champion IS reproducible

**"John the Butcher", `hitpointsmax` 110, `armourclass` 86 — identical across
twelve independent launches**, read off `_root.game.villain` at root frame 220.
Twelve `versus` lines, twelve identical triples, zero variation.

That is what `unleash_hell` promises in bytes and now delivers in fact: the
function builds `_root.game.champion` from a **hard-coded `charDNA` string
literal** (`+0x1904` for `which_boss == 1`), binds `_root.game.villain` to it at
`+0x2216`, and contains **zero RNG of any kind** — no `randomBetween`, no
`RandomNumber` opcode. `skincharacter` at root frame 214 `+0x0527` then derives
every combat field from that literal (§2). The champion is the one reproducible
armoured opponent in this build, which is why the capture gate (§9) arms for
that bout and no other.

The per-`which_boss` decode of those literals — twenty branches, and what the
rank-1 DNA string means field by field — belongs to
[`ss2-champion-dna.md`](ss2-champion-dna.md) rather than here.

### The hero entering that bout is NOT

This was observed rather than inferred, and it is the reason the capture gate
has to refuse rather than assume.

- **The hero's level at the champion bout is decided by RNG.** In **10 of the
  12** runs that reached it, the hero had levelled 4 → 5 first; in 2 it had not.
  The cause is that experience per bout is a *generated* opponent's
  `character_xp` (arena frame 231 `+0x024e`), and that opponent came from
  `randomise_gladiator`. **The level-up lands after the rank-2 bout**, not the
  rank-3 one: the `reward` line that reads `"nextleveltext":"YOU HAVE LEVELLED
  UP!"` is the one that also reads `"ranking":2`, i.e. after the second win. The
  first win's reward line reads `"63 % TO NEXT LEVEL"` at `"ranking":3`.
- **`staminaleft` carries across bouts.** `battlevalues` resets it **only when
  it is already `<= 0`** — `+0x3b1c`–`+0x3b44` reads
  `if (!(staminaleft > 0)) staminaleft = staminamax`. Arena `initbattle` resets
  the villain's only, `restore_char` does not carry it, and root frame 214
  resets `hitpoints` alone. Observed: the capture gate refused a champion bout
  reporting `"staminaleft":106,"staminamax":110`.

Both are projected fields, so two sessions differing in either cannot match and
can never clear the two-session promotion gate. Hence `-ArenaStagedLevel` and
the stamina check in §9's capture gate.

### A tournament loss is not terminal for the save slot

Byte-verified and observed; see §3 for the argument. `save_character` has three
call sites and none is reachable from a bout, the ladder, the win chain or the
loss path. **22 `ABORT:battle-lost` lines across the captures, twelve of them to
the champion, and the gladiator survived every one** — it lost gold and battle
counters that were never flushed. This is what makes `-Attempts N` sound:
`run-arena.ps1` relaunches after a loss deliberately *without* restoring the
snapshot, because the save already holds every completed bout.

### Why staging eleven combat fields changed nothing

The single most useful negative result of the session. The `staged` line in
`captures/arena-staged-2` records exactly eleven fields applied:

```text
"at":"staged","applied":"hero.herolevel=5,hero.strength=100,hero.attack=100,
hero.defence=100,hero.speed=60,hero.min_damage=300,hero.max_damage=400,
hero.hitpoints=999,hero.hitpointsmax=999,hero.staminaleft=100,hero.staminamax=100"
```

**All eleven read back correctly** at battle construction — the wrapper reports
every staged field on the trace's `end` line read back from the game rather than
echoed. The bout was still lost to a 110-hitpoint, 86-armour opponent, in about
the same wall clock as an unstaged run, three times out of three.

The mechanism is in `battlevalues`, which **derives** the damage fields rather
than storing them:

```text
weapon_min_damage = _root["weapon" + char.weapon][3];       // +0x31be
weapon_max_damage = _root["weapon" + char.weapon][4];       // +0x31da
min_damage  = round(strength * 2) + weapon_min_damage;      // +0x3356..+0x3385
max_damage  = round(strength * 2) + weapon_max_damage;      // +0x3386..+0x33b5
secondary_min_damage = round(strength * 1) + secondary_weapon_min_damage;  // +0x33b6
secondary_max_damage = round(strength * 1) + secondary_weapon_max_damage;  // +0x33e6
```

So **staging `min_damage` writes the output of a formula the game recomputes**,
and it is recomputed often: `battlevalues` is called from `skincharacter`
(`+0x1ad9`), from `save_character` (`+0x0231`), from button 775 (`+0x0581`),
from five `charsheet` frames — and, decisively, from **four sites inside the
combat overlay itself**, `sprite:862/frame:52` `+0x35f1`, `+0x3605`, `+0x4ea1`
and `+0x4fab`. A value staged at battle construction does not survive the
fight.

The rule this produces, and the reason the arena navigator grew a shop:

> **Stage inputs, never outputs.** `strength`, `speed`, `vitality` and
> `hero.weapon` are genuine `battlevalues` inputs. `min_damage`, `max_damage`,
> `hitpointsmax`, `armourclass` and `character_xp` are its outputs, and staging
> them is writing on water.

Buying a weapon changes an input. `hero.weapon` is persistent, survives every
`battlevalues` call, every save and every relaunch — and the only field the
wrapper then has to write is **gold**, which no site in `attack_chances`, the
damage roll, the deflection threshold or the controller selector reads. That is
the least invasive intervention available.

**Caveat, and it is why §10 still lists this as open**: the *mechanism* above is
byte-verified, but nothing has yet measured a staged `min_damage` being
overwritten mid-bout. The targeted probe that would close it is in §10.

## Reproduce the read-only inventory

With Node available and `$ss2Install` pointing to the Collection directory:

```powershell
$ss2Install = 'C:\Program Files (x86)\Steam\steamapps\common\Swords and Sandals Classic Collection'
$swf = "$ss2Install\swf\swords_sandals2_download.swf"
node tools/inspect-swf.mjs $swf --labels --timeline '^root$'
node tools/inspect-swf.mjs $swf --references 'dungeon' --around 90
node tools/inspect-swf.mjs $swf --references 'fight_mode'
node tools/inspect-swf.mjs $swf --references '"tournament[0-9]+"'
node tools/inspect-swf.mjs $swf --function '^randomise_gladiator$' --max-actions 3000
node tools/inspect-swf.mjs $swf --references 'save_character'
```

For the corrections in this revision specifically:

```powershell
node tools/inspect-swf.mjs $swf --references 'day_night_cycle'          # §2 - six call sites
node tools/inspect-swf.mjs $swf --function '^day_night_cycle$'          # §2 - the increment
node tools/inspect-swf.mjs $swf --references 'setInterval' --around 12  # §2 - the 1500 ms timer
node tools/inspect-swf.mjs $swf --references 'statpoints' --around 8    # §5 - GetVariable vs GetMember
node tools/inspect-swf.mjs $swf --references 'special_event_chance' --around 30   # §8b
node tools/inspect-swf.mjs $swf --references 'special_for_day'          # §8b - four writers
node tools/inspect-swf.mjs $swf --references 'game_mode'                # §3 - two writers
node tools/inspect-swf.mjs $swf --references 'fizMode'                  # §3 - set at root frame 1
node tools/inspect-swf.mjs $swf --function '^battlevalues$' --max-actions 12000   # §4, §12
node tools/inspect-swf.mjs $swf --function '^unleash_hell$' --max-actions 60      # §12
node tools/inspect-swf.mjs $swf --function-names 'backup'               # §5 - backup_character does not exist
```

Two facts in §1 and §5 come from the root **tag** stream rather than the action
stream — `day_night` is character 1772 at depth 408 (`PlaceObject2` at frame 96,
`RemoveObject2` at frame 150), and the level-up stat panel is character 2265 at
depth 357 (placed at frame 227, removed at frame 235). `--labels` shows the
frame numbers those sit between; the placements themselves were read with a
throwaway out-of-repo tag walker that prints frame, depth and character id only.
A `--placements` mode on `tools/inspect-swf.mjs` would make them reproducible
with the project's own tool, the way `--labels` now does for labels.

These commands print analysis only. Do not redirect decompiled game code or
assets into the repository.
