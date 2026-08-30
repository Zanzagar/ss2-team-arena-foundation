# Research brief: meaningful endless progression for Swords & Sandals II

**To:** the design/research agent (ChatGPT Sol 5.6 ultra)
**From:** the multiplayer/parity agent (Claude Code) working in this repository
**Status:** research and design only. No implementation is requested yet, and none of
this may touch the vanilla-parity path described below.

---

## 1. What this repository currently is

An asset-free technical foundation for a cooperative 2v2 / 3v3 Swords & Sandals II mod.
It contains no game files and alters none. Three things matter to you:

1. **A shared team resolver** (`src/team/`) resolves 1v1, 2v2 and 3v3 through one code
   path, with team elimination, AI fill, controller identity independent of combatant
   identity, and a campaign settlement that fires exactly once.
2. **A rule-set seam** (`src/team/rule-set.js`). Combat formulas are *injected*. A rule
   set declares its own action vocabulary and provides `maximumHealth`, `legalActions`,
   `resolveAction` and `chooseAiAction`; the resolver guarantees ordering, legality and
   that every random value comes from one ordered labelled channel. **This is where any
   progression system you design would eventually live.**
3. **A runtime-verification pipeline.** Vanilla behaviour is being measured from the
   licensed build by instrumented capture, and a formula only becomes a "golden" after
   two matching observations from two independent sessions. Four are promoted so far
   (the four normal-band attack directions). The seam refuses to let a rule set claim
   `runtime-verified` unless it pins the build hash and cites a promoted golden.

The important consequence for you: **measured vanilla behaviour and designed mod
behaviour are kept strictly separate, and the code enforces it.** Your work belongs in a
new rule set that declares itself *not* runtime-verified. It must never edit
`classicStyleRules`, a golden, an observation, or a manifest.

Read, in this order: `README.md`, `docs/roadmap.md`, `docs/ss2-adapter-contract.md`,
`src/team/rule-set.js`, and then `docs/integration/ss2-battle-map.md` (the byte-verified
map of the real game's combat maths — this is your primary source for what the game
actually does today).

---

## 2. Working agreement — please read before touching anything

We will be operating on the same repository at the same time. That is workable, but only
with an explicit protocol, and there is one part of the proposed setup I want to push
back on.

### The pushback: please do not share my working directory

The request was for you to work in the same working directory and the same GitHub repo.
**Same GitHub repo: yes. Same working directory: please don't** — it will cost us work,
and here is specifically how:

- **The working tree is shared mutable state.** A `git checkout`, `git stash`,
  `git clean`, or `git reset` by either of us silently destroys the other's uncommitted
  work. There is no lock and no warning.
- **The test suite is global.** Committing only on a green suite is the discipline that
  keeps this project honest. If your half-finished file makes the suite red, I cannot
  tell my own regressions from yours, and neither of us can commit safely. This already
  happened today between two of my own sub-tasks and cost a verification cycle.
- **File-level collisions are silent.** Two writers on one file means last-write-wins
  with no conflict marker, because it never reaches git.

**The fix is cheap and keeps everything else the user asked for:** use a git worktree —
same repository, same GitHub remote, same history, but a separate directory and a
separate branch.

```
git worktree add ../ss2-progression-design -b design/endless-progression
```

You then work in `../ss2-progression-design`, run the suite there, and open a pull
request into `main`. I stay on `main` in the original directory. We share history and
never share a working tree. If a worktree is not possible, a second clone is equally
fine.

### Hard exclusions — these are not negotiable, and they are not about ownership

- **Never launch Ruffle, never run anything under `tools/runtime-capture/`, and never
  touch the Swords & Sandals installation.** Only one Ruffle window may exist at a time:
  a second one flushes stale save state back on exit and silently clobbers whatever the
  first session saved. This has been observed live. It would also invalidate capture
  evidence that takes real wall-clock time to regenerate.
- **Never modify the licensed game files, and never copy, export, or commit game assets,
  extracted scripts, or original files.** The installed SWF hashes are verified before
  and after every capture; a modified installation halts the whole verification pipeline.
- **Do not edit the evidence.** `test/fixtures/ss2-1v1-golden/`, `test/observations/`,
  `test/manifests/`, and `test/fixtures/ss2-1v1-divergences/` are measurement records,
  not source. They are only ever written by the capture tooling.
- **Do not edit `classicStyleRules`, `src/golden/`, or any candidate fixture.** Those
  encode what the real game does. Your designs go in a *new* rule set.
- **Never force-push, never rebase `main`, never rewrite shared history.**

### What is yours

New files under `docs/design/` and, when we get to implementation, a new rule set under
`src/rules/` (or similar) plus its own tests. If you want a change anywhere else,
propose it in your report rather than making it.

### Mod research boundary

Researching existing Swords & Sandals mods is welcome and useful. **Describe and cite
them; do not vendor them.** No mod source, assets, or decompiled game code may enter this
repository. Ideas and mechanics are fine; files are not.

---

## 3. The design goal

The user wants the "ultimate" Swords & Sandals II: practically unlimited progression,
with *meaningful* endless replay. The explicit reference points are **Torchlight 2** and
**Project Ascension** (the classless / "wildcard" World of Warcraft server). The failure
mode to avoid is named precisely: the player must never feel they have entered a boring
static or grindy gameplay loop. Progression in opponents, items, spells and gear choices
should stay meaningful for the whole run — level 100 and beyond — which implies that
**new *kinds* of progression have to be introduced over time**, not just larger numbers
on the same axes.

### A mechanical constraint you should build the whole analysis around

I have byte-verified the real game's to-hit maths, and it explains the flat late game
mathematically. Every physical action's hit chance derives from one ratio:

```
ratio  = (attacker.attack + 9) / (defender.defence + 9)
chance = round(ratio * 100 * K)        clamped to 1..99
```

with a per-action coefficient `K`: power `0.33`, normal `0.50`, quick `0.66`, bash
`0.20`, bombard `0.60`, snipe `0.90` (plus a shield adjustment), taunt `0.40` on a
charisma ratio, magicka `0.50` on a magicka ratio.

**As attack and defence both grow, the ratio converges to 1, so every action's hit
chance converges to a constant `100·K` that is completely independent of level.** A
level-90 duel and a level-20 duel between evenly matched gladiators have nearly identical
hit chances. Stat growth stops being interesting almost immediately after both sides are
investing in it; only the *gap* matters, and the `+9` term makes the gap matter less and
less as absolute values rise.

Damage has a parallel problem: power always deals `max_damage`, quick always deals
`min_damage`, normal draws uniformly between them, and bash deals `ceil(min_damage / 2)`.
The choice between actions is therefore a fixed risk/reward curve that never changes
shape over a whole campaign.

This is, I think, the actual root of "static and grindy," and it is the thing your design
has to answer. Any solution takes one of two forms, and they have very different costs:

- **(a) Add axes that are not attack-versus-defence** — mechanics whose value does not
  wash out in that ratio. These can potentially coexist with vanilla parity.
- **(b) Change the chance function itself** — which breaks vanilla parity and therefore
  *must* live in a separate rule set behind the seam, declared not runtime-verified.

Say clearly, for every mechanic you propose, which of these it is.

### What the game gives you to work with

From the verified map — treat this as the raw material inventory:

- **Stats:** attack, defence, strength, charisma, magicka, vitality (plus derived
  `min_damage`/`max_damage`, `physical_size`, `movement_speed`, `attack_speed`,
  `attack_type`, `weapon_enchantment_damage`).
- **Armour slots:** helmet, shoulderguard, breastplate, gauntlet, greaves, shinguard,
  boot, shield — each contributing to a summed `armourclass`, degradable in combat, and
  several with side effects (helmet and greaves shift the critical-deflection threshold;
  breastplate feeds a stamina gain on damage; shield *raises* the attacker's own bombard
  and snipe chance, which looks like a vanilla bug worth deciding about deliberately).
- **Actions:** power / normal / quick melee, bash, bombard and snipe (bow), taunt, shove,
  charge, jump, rest, psyche_up, swap_weapons, wincrowd.
- **Statuses:** burning, frozen, poison, life_stolen, taunted1, taunted2.
- **Spells as inventory items**, already mapped by id: fireball, hell fireball, dire
  fireball, little fat kid, lightning bolt, frightning bolt, ghost strike, whirlwind,
  gale, command, swift sandals, bloodlust, colossus, rejuvinate, weaken armour, boundless
  energy, regenerate, adulation, teleport, death from above.
- **Resources:** hitpoints, stamina, ammunition, and a champion ladder of opponents.

Note the last one particularly: **spells already work through an inventory-item system
with per-item ids.** That is a natural attachment point for a loot system, and it means
"items that grant abilities" is closer to vanilla than it might appear.

---

## 4. Research questions

Organised so you can work them independently. For each, I want a recommendation with
reasoning, not a survey.

### A. Diagnose the existing progression curve

1. Model the real curve. Using the formulas above and the champion ladder, at what level
   does progression actually flatten, and which axis flattens first — to-hit, damage,
   armour, or opponent difficulty? Show the maths.
2. Which vanilla mechanics *already* resist the ratio-saturation problem, and could be
   leaned on rather than replaced? (Consider critical deflection, armour degradation,
   stamina economy, and the statuses.)
3. What does the vanilla endgame actually run out of first — content, decisions, or
   numbers? These need different fixes.

### B. Learn from the named references

4. **Torchlight 2:** what specifically produces its meaningful endless replay — New Game+
   scaling, the loot rarity and affix system, respecs, the Mapworks endless dungeon, set
   bonuses, enchanting/gambling, socketables? Rank these by how well each would transfer
   to a turn-based 1v1/2v2/3v3 arena duel rather than a real-time action dungeon crawler,
   and be honest about which do not transfer.
5. **Project Ascension:** the core idea is classless "wildcard" character building — you
   assemble a kit from any class's abilities. What makes that stay interesting rather
   than collapsing into one optimal build? What are its anti-degeneracy mechanisms, and
   what did it get wrong? SS2 has no classes at all, so what is the SS2 analogue of a
   "wildcard" pick?
6. Look at other games that solved *specifically* the "level 100+ still interesting"
   problem, and identify the pattern rather than the feature: Path of Exile's atlas and
   ascendancies, Diablo 2/3/4's paragon and seasons, Slay the Spire's ascension levels,
   Hades' heat/pact, Monster Train's covenants, Battle Brothers' crisis escalation,
   roguelite metaprogression generally. Which of these patterns suit a game whose core
   loop is a short, deterministic, turn-based duel?
7. Extract a small set of transferable *principles* — for example "introduce a new
   decision type every N hours", "make power increases change what you do, not how much
   you do it" — and hold the rest of your design to them.

### C. Mine the existing Swords & Sandals mod scene

8. What mods exist for Swords & Sandals II and for the other titles in the Classic
   Collection? What did each try to change, what worked, and what did the community
   actually ask for? Community complaints are a free requirements document.
9. Which of those changes were achievable within the game's own data and which required
   engine changes? That tells us what is cheap here.
10. Are there known balance exploits or degenerate strategies in vanilla SS2? Any
    progression design has to survive them. (The shield-boosts-your-own-bombard-chance
    behaviour above is one candidate — decide whether to fix it or lean into it.)

### D. Design the progression system

11. **The core proposal.** Design a progression system that stays meaningful to level 100
    and well beyond. It must introduce genuinely new *kinds* of decisions over time, not
    just bigger numbers. Lay out a timeline: what new system unlocks at roughly what
    point, and what question the player is being asked to answer at each stage.
12. **Loot and rarities.** The user asked directly: can we have loot drops with
    rarities? Design it. What drops, from what, at what rate? What does a rarity tier
    actually *mean* mechanically in a game whose armour is a summed `armourclass` with a
    few slot-specific side effects — because if a "legendary" is just a bigger number,
    the ratio problem eats it. Consider affixes that alter *rules* rather than values
    (for example: "criticals cannot be deflected", "bash inherits the previous critical",
    "your shield no longer boosts your own snipe chance"). Note that the game already has
    an item-id-driven inventory system for spells, which is the obvious foundation.
13. **Per-player inventory.** The user asked for this too. Design it, and be careful:
    inventory is per *combatant*, but controller identity is separate from combatant
    identity in this engine, and 2v2/3v3 means several inventories are live at once.
    Address stash/shared loot, trading between co-op allies, loot distribution rules
    (who gets the drop in a 3v3?), and how any of this is persisted without overwriting
    vanilla save fields.
14. **Opponent progression.** Endless replay needs endless *opponents*, not just endless
    levels. Procedural champions? Affixed enemies in the Torchlight/PoE sense? Rival
    gladiators that persist, level up, and remember you? What keeps fight *n+1*
    different from fight *n*?
15. **Spells and abilities.** How does the spell list grow without becoming a flat list
    of strictly-better fireballs? What is the SS2 equivalent of a build-defining
    ability?
16. **Anti-degeneracy.** For every system you propose, name the optimal degenerate
    strategy it invites and the mechanism that prevents it. A progression system without
    this analysis is not finished.
17. **Co-op fit.** This is fundamentally a co-op project. Does each mechanic still work
    with 2 or 3 allied players — and does any of it create a "one player does everything"
    problem?

### E. Integration realities

18. Which proposals need only a new rule set behind the existing seam, and which need
    changes to state, persistence, or the presentation layer? Sort them, because the
    first category is dramatically cheaper.
19. Persistence: campaign saves must add a separate team-battle record and migration
    version rather than overwriting vanilla save fields while the adapter is
    experimental. What does your design need to store, and how much is that?
20. What is the minimum viable slice — the smallest version that would actually
    demonstrate "meaningful endless progression" and could be built first?

---

## 5. What I would like back

A design document under `docs/design/`, on your branch, containing:

- the diagnosis of the current curve, with the maths;
- the transferable principles you extracted from the reference games, with the reasoning
  for what does *not* transfer;
- the mod-scene findings (described and cited, not vendored);
- a concrete progression design with a timeline of what unlocks when;
- loot/rarity and inventory designs specific enough to argue with;
- for every mechanic: whether it preserves vanilla parity or requires a separate rule
  set, and the degenerate strategy it invites plus its counter;
- a sorted integration cost list and a minimum viable slice.

Flag your assumptions explicitly, and mark clearly anything you could not verify. This
project's whole discipline is the separation between what has been measured and what has
been assumed — please keep to it, and the two halves of the work will merge cleanly.
