# Swords & Sandals mod-scene survey: precedents, boundaries, and failure modes

**Status:** second research deliverable; answers section C of the
[endless-progression brief](endless-progression-brief.md). It records design
requirements for sections D/E but does not propose the progression system and
does not authorize implementation.

**Research date:** 2026-08-30.

## Evidence discipline and research boundary

This survey keeps existence, visible behaviour, implementation, reception,
and design inference separate:

- **[V] Repository-verified:** evidence in the fingerprinted build's
  [battle map](../integration/ss2-battle-map.md) or another repository
  contract. The battle map's own `runtime-verified`, `live-observed`,
  `static/byte-mapped`, and `candidate` qualifiers still apply; **[V] does not
  promote a candidate to a golden**.
- **[O] Official external:** a Classic Collection developer/publisher
  announcement or store description. Official inclusion establishes that a
  mod was distributed, not that its balance was verified.
- **[P] Primary mod source:** a mod author describing intent or responding to
  feedback. This can establish intended design, but not measured behaviour in
  this repository's fingerprinted build.
- **[M] Public distribution metadata:** public package/root names and dates.
  It can establish that a path exists, not what code inside it does.
- **[C] Community external:** a substantial discussion, guide, video
  description, review, or fan wiki. It is a requirements lead, not
  representative polling and not vanilla measurement.
- **[D] Derived:** arithmetic or a direct logical consequence of cited inputs;
  checkable, but not a new runtime observation.
- **[A] Analysis/design inference:** a recommendation or architectural
  classification derived from the sources.
- **[U] Unverified:** no adequate public evidence was found.

The research did **not** launch Ruffle, run `tools/runtime-capture`, touch the
Swords & Sandals installation, inspect bundled mod readmes, open mod SWFs,
decompile code, or copy mod source/assets. Public depot metadata was used only
for names and paths. This is intentionally a public-record survey.

One further limit is fundamental: the Classic Collection launches fan mods as
complete alternate SWFs from fixed paths. A changed boss visible to a player
could have come from a data table, a timeline edit, or rewritten ActionScript.
Unless an author documents the method, this survey calls the visible result
**content/data-shaped** rather than claiming it was “data-only.” [V/A]

---

## Executive recommendation

The mod scene is useful as a requirements document, but not as a progression
system to copy.

1. **Four SS2 mod routes are fixed in the mapped Collection launcher:**
   Champion Rush, Extended, Neomatons, and `ss2_olis_mod`. Accessible official
   announcements name Emperor's Requiem by Oliver Joyce; mapping that title to
   `ss2_olis_mod` is a strong inference, not an explicit official statement.
   [V/O/A]
2. **Champion Rush has the clearest public SS2 change summary; Extended has
   the richest late-game trail.** Champion Rush's shipped summary panel
   documents champion-only fights and coordinated economy/unlock acceleration.
   Community sources describe Extended's later gates, altered opponents,
   enraged Antares, Malevolence, and Emperor equipment. These are precedents
   for deliberate pacing and authored milestones—not evidence that either
   implementation was cheap or balanced. [C/A]
3. **Requiem and Neomatons expose useful surfaces but remain only partly
   documented.** Requiem supports an alternate campaign plus player-reported
   symmetric point acceleration; Neomatons visibly stages a themed late-game
   roster using a skip/test character. None of the names or footage proves
   procedural generation, endless persistence, formula changes, or a legal
   progression path. [O/P/C/U]
4. **The best Collection-wide precedent is SS4's reworked per-player save and
   reward loop.** The developer called saving all four human players one of
   the most requested features, then added individual progress, shopping,
   level-ups, and placement rewards. That is direct support for per-combatant
   inventory and progression in co-op. [O/A]
5. **The clearest failure case is SS3 Forever's numerical escalation.** Its
   author created an ambitious hard postgame and actively rebalanced it, but
   players reported one-shots, million-point armour, mandatory build checks,
   RNG walls, and fights lasting hundreds of turns. Adopt authored rivals and
   an explicit hard track; reject raw inflation and build deletion. [P/C/A]
6. **Public evidence cannot answer which shipped mod edits were internally
   data-only.** This repository can answer what is cheap *here*: opponent
   records and campaign sequencing are content-shaped; action semantics and AI
   belong behind a new rule set; per-player inventory and rivals require
   canonical state plus a namespaced save; team UI and settlement require
   adapter/presentation work; Collection-menu exposure needs a launcher
   change. [V/A]
7. **Do not lean on the hidden shield/ranged interaction as a free bonus.** If
   a promoted golden eventually confirms it, a classic-parity path should
   preserve it. The endless designed rules should remove the accidental
   attacker-shield term and may reintroduce the fantasy only as a visible,
   costed “stabilizer” sidegrade. That change belongs in a separate rule set.
   [V/A]

The requirement carried into sections D/E is therefore: use the scene's
*patterns*—authored rivals, personal persistence, bounded streaks, optional
challenge, trophies, and compatible variants—while explicitly countering the
degeneracies the scene exposes. [A]

---

## 1. What can be established about the current catalog

### 1.1 The four SS2 launcher routes

The fingerprinted Collection shell contains these fixed paths. It does not
show automatic discovery of arbitrary mod folders. [V]

| Launcher stem [V] | Public identity | What is actually established | What remains unknown |
| --- | --- | --- | --- |
| `ss2_champion_rush/swords_sandals2_download` | **SS2 Champion Rush**, Tofi, named in the July 2024 official mod batch [O] | Its shipped summary panel, visible in public footage, says champion-only fights, more compensating money, lower armour requirements, abilities each level, and cheaper enchanting; a complete run ends at Antares. [C] | Exact values, opponent/combat changes, save/death rules, dominant strategy, and representative reception are [U]. |
| `ss2_extended/swords_sandals2_download` | **SS2 Extended**, Xorgius, named in July 2024 [O] | It exists and has the richest community-visible SS2 changes: later gates, altered champions/loadouts, Emperor equipment, and additional late encounters are reported. [C] | Exact implementation, complete changelog, drop/economy rules, and representative reception are [U]. |
| `ss2_neomatons/swords_sandals2_download` | **SS2 Neomatons**, Haxxamods, named in June 2026 [O] | Creator footage stages coloured Neomaton-themed opponents at late levels. The Collection developer said the five 2026 additions were untested by him and he could not vouch for quality/balance. [O/P/C] | The showcase uses a visible skip/test character; legal progression, economy, complete structure, combat changes, and meaningful reception are [U]. |
| `ss2_olis_mod/swords_sandals2_olis_mod` | Probably **SS2 Emperor's Requiem**, Oliver Joyce, named in April 2025 [O/A] | Both the fixed route and named mod exist; a public walkthrough describes an alternate-history campaign and comments report symmetric accelerated skill points. [V/O/C] | The route-to-title mapping is not explicit. Exact scaling, roster, armour/formula/AI changes, implementation, and current balance are [U]. |

The fixed registry matters operationally. Dropping another folder into
`swf/mods` is not expected to create a menu entry; a future distributable needs
an independently authored launcher entry/patch or an explicitly approved
staging route. This is launcher integration, not progression design. [V]

### 1.2 Officially named Collection fan mods

Accessible first-party text explicitly names at least sixteen additions. That
is a lower bound, not an exact current total: the April 2025 announcement says
“a few new mods” but names only one in accessible text, and public depot
metadata exposes additional roots whose public titles/features are not
established here. [O/M]

| Year | Officially named mod | Title association in the announcement | Publicly attributable mechanics |
| --- | --- | --- | --- |
| 2024 | SS1 Who Wants To Be A Gladiator — Oliver Joyce | S&S I | [U]. An isolated build report is not a changelog. |
| 2024 | SS2 Champion Rush — Tofi | S&S II | Public footage of the shipped summary documents champion-only fights plus coordinated economy/unlock acceleration; exact values and implementation [U]. [C] |
| 2024 | SS2 Extended — Xorgius | S&S II | Community-visible extension described below; exact implementation [U]. |
| 2024 | SS3 After Starbound — Rexar | S&S III | [U]. |
| 2024 | SS3 Antares' March — Spoon | S&S III | [U]. |
| 2024 | SS3 Emperor's Reign — Spoon | S&S III | [U]. |
| 2024 | SS3 Forever — Neeram | S&S III | Hard postgame intent and balance history documented by its author/community. [P/C] |
| 2024 | SS3 Tributum Ultratus — Spoon | S&S III | [U]. |
| 2024 | SS3 Ortus Haxxapodiorum — Xorgius | S&S III | [U]. |
| 2024 | SS4 Fixus Edition — Rexar | S&S IV | [U]. “Fixus” does not establish which bugs or rules changed. |
| 2025 | Emperor's Requiem — Oliver Joyce | Base title not explicit in accessible announcement; probably S&S II through the fixed `ss2_olis_mod` route [V/O/A] | Alternate-history campaign premise reported by a public walkthrough; mechanics [U]. [C] |
| 2026 | SS3 Legends — Neraam | S&S III | [U]. |
| 2026 | Swords & Sandals Endless Tavern Adventures — Haxxamods | Not explicitly assigned to a base title in the accessible announcement | [U]. “Endless” and “Tavern” do not prove SS4 ancestry, procedural generation, persistence, or multiplayer. |
| 2026 | SS2 Neomatons — Haxxamods | S&S II | Creator showcase supports a themed late-game opponent remix; legal progression and systems [U]. [P/C] |
| 2026 | SS1 Chaotic Extended | S&S I | [U]. |
| 2026 | Crusader Eternium Extended — Haxxamods | Crusader | [U]. |

The 2024 announcement says that *some* mods in that batch add champions, XP
boosts, or skills, but it does not attribute those changes to individual mods.
This survey therefore does not assign any of those features by guess. [O]

The June 2026 developer disclaimer is equally important: curation proves
availability and community authorship, not quality assurance. The same update
initially caused integration trouble for some SS3 mods and needed a follow-up
fix; the new batch is also absent on macOS because the developer could not
produce the Mac update. These are distribution/integration cautions, not
judgments about any individual design. [O]

### 1.3 Secondary-reported entries without verified official inclusion

A community SS3 catalog additionally names **Forever Fair Edition**, **Abyss
Dungeons**, and **Hardcore Mode**. Accessible first-party release text does not
verify that all three are current Collection menu entries, so they are not
silently added to the official table above. [C/U]

| Secondary-reported variant | What can safely be said | What cannot be said |
| --- | --- | --- |
| SS3 Forever Fair Edition | The Forever author confirms a friendlier variant and explains that it uses a different save filename, preventing character transfer. [P] | Current official inclusion and its full mechanical delta are [U]. |
| SS3 Abyss Dungeons | A fan catalog names it; public depot metadata contains an Abyss-named root. [C/M] | Exact title-to-root mapping, current menu inclusion, mechanics, author, and balance are [U]. |
| SS3 Hardcore Mode | A fan catalog names it. [C] | Current menu inclusion, mechanics, author, and balance are [U]. The title alone proves no rule. |

These entries matter because “what exists publicly” is broader than “what an
accessible official announcement names.” They do not change the transfer
recommendations without documented mechanics. [A]

---

## 2. SS2 case studies

### 2.1 Champion Rush: a documented compressed campaign, not an endless one

The official 2024 announcement and fixed launcher path establish the mod's
identity and distribution. More usefully, a public complete-run video shows
the Collection's own mod-summary panel stating that the player fights only
arena champions, receives substantially more money to compensate, faces lower
armour level requirements, earns abilities every level, and enchants much more
cheaply. The run ends at Emperor Antares. [O/V/C]

That is strong evidence for a **compressed champion-only campaign with an
accelerated economy and unlock schedule**. It is not evidence for procedural
bosses, post-Antares generation, or endless progression. Exact multipliers,
requirements, opponent changes, death/save behaviour, and combat-formula
changes remain [U].

**Visible accomplishment and transferable hypothesis:** the campaign removes
connective fights and retunes acquisition so the player can reach champion
decisions quickly. No outcome evidence establishes that this pacing is
balanced or more satisfying. A 28-episode public playlist and a separate
complete run show that at least two
uploaders publicly covered the route; they do not establish broader interest,
completion rates, balance quality, or reception. [C]

**Recommendation:** mine the *declared pacing package*: if encounters are
compressed, the economy and unlock schedule must be retuned with them. Use a
champion-only route as a bounded challenge/catch-up variant, not as the core
endless loop. [A]

- **Parity/seam:** sequencing existing champions can preserve combat-rule
  parity while changing campaign parity; new boss actions or rewards with new
  semantics require the designed rule set and campaign state. [V/A]
- **Invited degeneracy:** cheap enchants, lower gear gates, and high gold may
  collapse acquisition into “buy the best available item immediately,” while
  a dense ladder may reward one counter-build against every champion. This is
  a design risk inferred from the documented settings, not reported dominance.
  [A]
- **Counter/test:** normalize rewards per expected risk/time, preserve at least
  two meaningful purchases at each shop visit, preview opponent doctrines, and
  measure whether the same loadout/action policy dominates the whole ladder.
  [A]

### 2.2 Extended: the strongest SS2 precedent, with a major evidence caveat

Public videos and community documentation report the following visible
changes:

- additional arena champions, armour sets, and weapons; [C]
- Emperor armour becomes usable at a late level; [C]
- a later tournament faces an enraged Emperor Antares; [C]
- a still later encounter faces Malevolence; [C]
- opponent statistics, spells/loadouts, equipment/enchantments, and shield
  sprites differ from the ordinary campaign in described cases. [C]

Those reports are consistent with a content extension built from authored
milestone opponents, new gates, revised loadouts, and trophy equipment. They
do **not** reveal whether any change was a data record, timeline script, or
engine rewrite, and they do not establish a complete progression curve. [A/U]

**Visible accomplishment and transferable hypothesis:** the mod gives the
finite Antares ladder a continuation, makes a known rival return in a
transformed state, introduces a new capstone, and makes boss equipment
aspirational. A public full-game video and surviving wiki documentation show
that the route was publicly documented; they do not establish balance,
retention, build diversity, or satisfaction. [C/A]

**What is not established:** no public source found supplies completion rates,
build diversity, turn counts, a complete economy, or a reliable balance
postmortem. A small video/comment sample alternately describes the final boss
as impossible, fun, and painful/grindy; it shows mixed individual reactions,
not a rate. One isolated report of effectively unlimited-range behaviour is a
test lead only. [C/U]

One detailed comment proposes banking one or two Molten Death casts until a
weapon-magic proc, then chaining them, and claims a dramatic improvement in
Malevolence win probability. That is a valuable sequence-degeneracy hypothesis
but remains one unverified player report. [C]

**Recommendation:** adopt the *authored-rival milestone* pattern, not the
unknown numbers. A rival should return with a new doctrine and readable
counterplay, not merely a larger health/armour multiplier. A trophy should be
a bounded sidegrade or build key, not permanent best-in-slot inflation. [A]

- **Parity/seam:** opponent records, existing loadout fields, encounter order,
  and existing-effect trophies can preserve classic combat rules while
  changing campaign content. Any new action, affix semantics, AI decision, or
  formula belongs to a separate designed rule set. [V/A]
- **Invited degeneracy:** repeated bosses can become stat checks, force a
  single resistance/build, reward proc-banking into a spell chain, or pay a
  unique item that invalidates all later drops. [C/A]
- **Counter/test:** give every milestone a doctrine budget with at least two
  viable counter-families; cap trophy power; provide recovery/respec; test
  turns-to-resolution and build-frontier diversity before and after each
  milestone. [A]

### 2.3 Emperor's Requiem: campaign authorship is the usable clue

The April 2025 official update names Oliver Joyce's **Emperor's Requiem**. A
public walkthrough describes an alternate timeline in which Antares won the
Crusades, continues the games, and the player attempts to escape. The video
comments also allege ten skill points per level and, in one reply, equivalent
opponent point gains. Those comments are not an authoritative specification.
If accurate, they describe accelerated symmetric stat allocation; they do not
establish formula or engine changes. [O/C]

The mapped launcher stem `ss2_olis_mod` plausibly corresponds to Oliver Joyce,
but accessible official text does not explicitly make that mapping. It remains
an inference. [V/A]

At least one viewer calls it the hardest SS2 mod and says they like the
difficulty; other individual comments criticize repetitive jumping, balance,
or visual treatment. The strongest single balance reply says accelerated
strength/magicka overwhelms unchanged armour, agility/attack unlocks the best
sword and bow early enough that gold becomes the remaining gate, regenerative
high-defence opponents stall, and AI movement can make even giant armour pools
irrelevant. This is detailed testimony from one player, not measurement. [C]

**Recommendation:** use authored campaign state and remembered antagonists to
make progression legible. A rival's story state can change the meaning of a
fight without multiplying every combat number. Reject symmetric “many more
points per level” as an endless solution: it accelerates gear gates and ratio
convergence while leaving armour, AI, and the decision vocabulary behind.
[A]

- **Parity/seam:** dialogue, opponent identity, encounter order, and existing
  combat loadouts are campaign/presentation changes and can preserve combat
  parity. Persistent rival memory requires namespaced campaign state. New
  combat responses to memory require the designed rule set. [V/A]
- **Invited degeneracy:** accelerated points can rush unlock thresholds and
turn gold into the only gate; regeneration plus retreating AI can stall; if a
remembered rival always counters the last loadout, optimal play becomes
intentional loss or disposable-gear sandbagging. [C/A]
- **Counter/test:** audit every accelerated unlock and marginal stat value;
  search adversarial policies for movement/healing cycles; remember broad,
  disclosed tendencies over several fights rather than the last item snapshot;
  cap adaptation; test alternate-loadout and deliberate-loss policies. [A]

### 2.4 Neomatons: official inclusion with an explicit quality disclaimer

The June 2026 update names **SS2 Neomatons** by Haxxamods and the mapped shell
contains its fixed route. The Collection developer states that he had not
tested the five new additions and could not vouch for their quality or
balance. [O/V]

Haxxamods' public showcase labels/thumbnail and footage advertise coloured
Neomaton-themed opponents at levels 52, 54, 57, and 60. It therefore supports
a late-game opponent/tournament remix, while the labels do not independently
verify legal enemy levels. It does **not** validate the progression path or
economy: the footage visibly uses a level-60 test character named “Tournament
18 Skip.” Three visible comments were positive at the research snapshot; the
sample is too small for reception conclusions and documents no completion,
strategy, bug, or balance evidence. [P/C]

**Recommendation:** record themed late-game opponent sets as the transferable
surface. Do not infer an all-Neomaton campaign, legal level path, procedural
system, or endless scaling from a thumbnail/title/test showcase. [A]

- **Parity/seam:** themed opponents using existing records and actions can
  preserve combat rules. New behaviour, legal progression, and reward changes
  must be classified separately when documented. [V/A]
- **Invited degeneracy:** a test/skip character can conceal an impossible or
  excessively grindy legal route; a themed roster can still repeat one
  doctrine behind recolours. [A]
- **Counter/test:** validate from a fresh legal campaign state, record time and
  purchases to every gate, and require each opponent family to create a
  distinct readable decision rather than only a new appearance. [A]

---

## 3. Transferable Collection-wide patterns

### 3.1 SS3 Forever: authored ambition succeeds; scalar escalation fails

SS3's ordinary campaign already demonstrates a long named-champion ladder.
The fan mod **Forever** provides the Collection's clearest public balance
record. Its author describes an intentionally difficult continuation and
repeatedly responds to feedback. Players praised the ambition, and the author
iterated on encounters. [O/P/C]

The same thread reports the failure mode with unusual clarity:

- million-point armour and one-shot damage; [C]
- fights lasting roughly 300–351 turns; [C]
- resistance or mana requirements an existing irreversible build could not
  satisfy; [C]
- melee invalidation, level-65/75 walls, and wins dependent on repeated RNG
  attempts. [C]

These are self-selected reports, not telemetry. They are still strong design
warnings because each describes a reproducible shape of failure. [A]

**Transfer:** authored postgame rivals, a clearly labelled hard track, active
rebalance, and an encounter-specific decision problem. [A]

**Reject:** raw health/armour/damage multiplication, hidden mandatory stats,
hard immunities, hundreds-turn attrition, and irreversible builds without a
recovery route. [A]

- **Parity/seam:** authored opponents using existing semantics can preserve
  combat parity. Formula, immunity, or ability changes require a separate rule
  set. A difficulty tag/reward provenance belongs in campaign state. [V/A]
- **Invited degeneracy:** players either copy the one accepted build, stall
  indefinitely, or reroll until a low-probability sequence wins. [C/A]
- **Counter/test:** require at least two materially different winning build
  families, cap expected and adversarial turn counts, expose counters before
  commitment, persist ordered RNG, and provide bounded respec/recovery. [A]

The author's friendlier **Forever Fair** variant is a useful second lesson:
separate difficulty identities are sound, but incompatible character save
files fracture progression. Difficulty variants should share one versioned
record while tagging rules/rewards by mode. [P/A]

### 3.2 SS4: personal persistence is a direct multiplayer precedent

The base Collection description establishes up to four local players, eight
realms, and more than forty minigames. The more relevant precedent is the
exact [August 2021 first-party rework](https://store.steampowered.com/news/app/1055430/view/2968422316509754858):
the developer called saving all four human players one of the most requested
features, then gave saved humans individual progress, post-session shopping,
level-ups, and placement-based XP; bonus gold was also reduced. [O]

This transfers more directly to 2v2/3v3 than any fan-mod feature found:

- progression and inventory belong to each combatant, not the controller or
  team aggregate; [A]
- settlement happens once after the result and allocates personal rewards;
  [V/A]
- all allies need a post-fight decision, rather than one host owning every
  upgrade. [A]

- **Parity/seam:** per-player state, shop, and rewards can preserve classic
  combat semantics, but require canonical per-combatant inventory plus a
  separate, versioned team save and UI. [V/A]
- **Invited degeneracy:** funneling every drop to one carry makes the other two
  players spectators; placement/contribution rewards can also encourage kill
  stealing or withholding support. [A]
- **Counter/test:** give every combatant a baseline personal reward, distribute
  scarce team loot by an explicit preselected rule, make support count without
  per-hit farming, and test whether concentrating all tradable value on one
  seat dominates. [A]

A detailed 2026 SS4 remake request supplies a weaker but useful late-game
requirement: early variety gives way to buffs and rare champion unlocks;
relative difficulty falls; named champions appear too rarely and do not scale;
and encounters become bigger numbers and one-shots. The requested remedy is
more maps/opponents, relevant champions, and coherent CPU party identities.
This is one thread, not consensus. [C]

**Transfer:** keep authored rivals in the endless encounter grammar and build
enemy teams around legible doctrines. **Reject:** the board/minigame bulk,
permanent-stat random events, and a universally dominant luck card; those
systems dilute a short deterministic duel rather than deepen it. [A/C]

### 3.3 Crusader: bounded survival transfers; army management does not

Crusader's official description combines turn-based army management, simple
RPG progression, and a Survival mode that faces foes sequentially. The
sequential-streak pattern transfers; army-scale command does not. [O/A]

The exact [May 2020 official patch](https://steamcommunity.com/ogg/1055430/announcements/detail/3757636398660124097)
imposed a level-50 cap because players could exhaust the finite skill list and
become stuck on the level-up screen. This is direct evidence against infinite
levels backed by a finite menu of choices. [O]

- **Parity/seam:** a sequence of ordinary battles with continue/cash-out can
  remain campaign/settlement logic and preserve combat rules. Mid-streak combat
  modifiers with new semantics require the designed rule set. [V/A]
- **Invited degeneracy:** a solved one-ability loop, safe-fight farming, or
  reload-before-loss makes the streak nominally endless without new decisions.
  A community guide reports repeated Raise Dead/Archery as one such Crusader
  solution, but that is anecdotal and title-specific. [C/A]
- **Counter/test:** bound streak length before a milestone/reset decision,
  rotate doctrines, make rewards depend on declared risk rather than raw turn
  count, and persist seed/cursor and offer identities. [A]

### 3.4 Mini Fighters: brevity is valuable; one-shot compression is not

Mini Fighters is officially a faster, smaller, mobile-derived SS2 variant.
That cadence matters: an endless loop needs many readable fights, not a small
number of attritional marathons. [O/A]

A stable [December 2019 DolphinTuna review, updated September 2024](https://steamcommunity.com/id/Skraal2099/recommended/1055430/)
reports same-level giants erasing a full health bar in one hit at level 5 and
requests fixes. One review is not measurement, but it exposes the predictable
failure when “fast” means “no response window.” [C]

- **Parity/seam:** faster menus/settlement can preserve combat parity. Changing
  damage, initiative, or turn limits requires separate rules. [V/A]
- **Invited degeneracy:** maximize initiative and first-action burst; whoever
  acts first owns the entire fight. [A]
- **Counter/test:** set a first-action win-probability ceiling, require a
  telegraphed response window for lethal setups, and bound median *and* tail
  turn counts. [A]

### 3.5 Gross Out: content replacement preserves—and inherits—the engine

Gross Out is not a fan mod, but the exact
[May 2020 announcement](https://steamcommunity.com/ogg/1055430/announcements/detail/3757636398660124097)
calls it an SS2-combat-engine game with a different cast, theme, and weapons,
and says its Collection inclusion was “much-requested.” It is the strongest
public example that new presentation and authored content need not imply new
combat rules. The request establishes demand for preservation/access to an
obscure title, not demand for any progression mechanic. [O]

A community guide reports that all-in Fartmaster, its Charisma analogue, can
trivialize the campaign. Whether or not that report generalizes, the design
lesson is sound: a reskin also inherits the engine's degenerate strategies.
Content quantity cannot substitute for ruleset-level balance. [C/A]

- **Parity/seam:** opponents, locations, names, and art are presentation/content
  surfaces; preserving action semantics preserves the engine behaviour,
  including quirks. [O/A]
- **Invited degeneracy:** an inherited all-in social/action-denial build solves
  every new opponent despite the new theme. [C/A]
- **Counter/test:** run the full build frontier against every content pack; if
  the inherited rule dominates, fix it only in a labelled designed rule set or
  introduce content-level counters that do not falsify parity. [A]

### 3.6 SS1: a compact rival ladder transfers; ring-out denial does not

The original game's seven champions provide a compact named-rival cadence.
Community discussion reports pure Charisma spam, all-Strength shoves that deny
turns through ring-outs, repeated retries, and save manipulation. These are
version-sensitive anecdotes, not fingerprinted SS2 evidence. [O/C]

- **Parity/seam:** named opponent sequencing is campaign content. Ring-out or
  action-denial semantics would be rule-set work if introduced here. [V/A]
- **Invited degeneracy:** place every point in the one stat that skips the
  opponent's decision, then reroll failures. [C/A]
- **Counter/test:** no repeatable action may create an unbounded denial loop;
  all-in builds must pay a disclosed counterable cost; persist deterministic
  outcomes so reloading is not a strategy. [A]

---

## 4. What the community actually asked for

This is not a vote count. Steam discussions, comments, guides, and reviews are
self-selected. “Community asked” below means that a source-backed request
exists; only the first row is explicitly described by the developer as one of
the most requested features. [O/C]

| Requirement lead | Evidence strength | Recommendation | Parity/seam | Degeneracy and counter |
| --- | --- | --- | --- | --- |
| Save and progress every human player independently | Strong [O]: SS4 developer statement and shipped rework | Adopt as a non-negotiable co-op requirement. | Classic combat can remain intact; canonical state, settlement, UI, and versioned team save must change. | Carry funneling / kill stealing; give personal baseline rewards and use a declared team-loot policy that does not reward last hits. |
| Keep named champions relevant and enemy parties coherent | Moderate [C]: detailed SS4 request, low sample | Adopt persistent rivals and authored milestone teams. | Content-shaped if existing actions/AI are used; rival memory needs save state; new doctrine logic may need designed rules. | Rubber-band counters or repetitive nemesis farming; cap adaptation, preview doctrine, and prevent deliberate sandbagging. |
| Offer challenge choice without erasing the baseline | Strong [O]: the exact [November 2020 Yeti patch](https://steamcommunity.com/ogg/1055430/announcements/detail/2906473723217146006) kept the fight and offered an optional 1,000-gold pre-fight potion after nerf requests | Adopt labelled challenge/assistance choices. | Campaign/content if composition or a vanilla effect changes; new modifier semantics require designed rules. | Always choose the easiest reward-efficient mode; normalize rewards to declared risk and record ruleset provenance. |
| More content and customization | Moderate [C/O]: Workshop request and developer reply that the Flash architecture prevents Workshop integration but curated mods are possible | Adopt a bounded content schema and authored extension points, not an unsafe arbitrary loader. | Content can preserve combat parity; launcher exposure is separate integration. | Content bloat with no new decisions; require every addition to introduce a doctrine, counter, or build choice. |
| Preserve/access obscure legacy content | Strong but narrow [O]: developer calls Gross Out's Collection inclusion “much-requested” | Treat accessibility and compatibility as product requirements, not evidence for a progression mechanic. | Presentation/distribution concern; combat provenance must still identify inherited SS2 semantics. | Nostalgia can excuse inherited bugs or crowd out decision-bearing content; keep parity labels and the same regression gates. |
| Balance before more numerical progression | Moderate [P/C]: Forever thread and Mini Fighters reviews | Adopt explicit build-frontier and turn-bound gates. | Tests apply to both parity observation and designed rules; actual formula fixes require a separate rule set. | Chasing one complaint can create a new dominant build; test the whole action/stat/loadout grid. |
| Aspirational boss equipment | Weak but specific [D/C]: announcement comment plus Extended documentation | Adopt bounded trophies as sidegrades/build keys. | Existing item semantics can preserve combat rules; novel affixes require designed rules, state, UI, and save. | Permanent best-in-slot / boss farming; power budgets, mutual exclusions, pity/duplicate conversion, and alternate sources. |
| Friendly and hard variants with compatible characters | Primary [P]: Forever/Fair author discussion | Adopt shared progression with mode/ruleset provenance. | Save/state concern; combat parity depends on the selected rule set. | Farm easy mode, spend rewards in hard mode; mode-tag rewards or equalize risk-adjusted yield without splitting the character. |

The useful synthesis is precise: players asked for persistence, content,
customization, usable rivals, and balance—not an infinite scalar. [A]

---

## 5. Q9 — what is cheap here, and what crosses an engine seam?

### 5.1 What the shipped mods do—and do not—tell us

The public record supports classifications of *visible surfaces*, not internal
implementation. [A]

| Publicly evidenced approach | Supportable classification | Confidence and limit |
| --- | --- | --- |
| Extended's later tournaments, revised opponents/loadouts, new equipment, and unlock gates | Opponent, item, and campaign surfaces are content/data-shaped; shield sprites are presentation-shaped. | Medium for visible behaviour [C], low for implementation [U]. No source proves unchanged or changed hit, damage, RNG, AI, or save code. |
| Emperor's Requiem's alternate-history campaign and reported symmetric point acceleration | Story/encounter sequencing is campaign-shaped; point allowance is progression-shaped. | Medium/low [C]. No technical documentation establishes how either was implemented. |
| Champion Rush's champion-only fights, increased money, lower item requirements, level-by-level abilities, and cheaper enchanting | Campaign roster, economy, unlock schedule, and item-cost surfaces. | Medium [C] because the shipped summary is visible in public footage; internal method and exact values [U]. |
| Neomatons' themed late-game opponents | Opponent/presentation/tournament surface. | Medium for the staged fights [P/C], no evidence for legal progression or internal method. |
| Gross Out's SS2 combat engine with a different cast/theme/weapons | Strong engine-reuse plus content/presentation-replacement example, although it is a Collection title rather than a fan mod. | High [O] for the product description; no claim about its source architecture. |
| SS4's reworked save for every human | Definitively system-level: the developer says the save system was completely reworked and warns of old-save loss. | High [O]. It shows that multiplayer persistence is not a content edit. |
| Every other catalog name | Existence only. | High [O] that the named mods were distributed; feature and implementation confidence [U]. |

The correct conclusion is not “the old engine can cheaply do all of this.” It
is “complete alternate SWFs can visibly do all of this, while their cost is
unknown.” Our cost model must come from this repository's contracts. [V/A]

### 5.2 This repository's actual cost/parity map

The rule set owns action vocabulary and legality, health formula, action
outcome and RNG order, and AI action choice. The resolver owns team/slot
structure, controller identity, turn order, effect application, knockout,
result, and once-only settlement. Campaign progression and persistence
semantics live in campaign state/settlement, outside action resolution; their
inventory, reward, and save interfaces remain presentation-layer work. [V]

“Preserves parity” below always names the scope. New opponents can preserve
**combat-rule parity** while intentionally changing **campaign parity**.
Nothing becomes runtime-verified merely because it resembles a mapped formula;
the provenance gate still applies. [V]

The relative layer classifications below assume the prerequisite canonical SS2
adapter fields exist. They do **not** describe the repository's current state
as content-ready; the missing equipment/resource/inventory/status/RNG/result
fields are restated immediately after the table. [V/A]

| Change | Minimum layer in this repository | Parity decision | Degeneracy invited and required counter/test |
| --- | --- | --- | --- |
| New champion using existing stats, gear fields, actions, and mapped AI/action vocabulary | Campaign/opponent content | Could preserve classic combat rules once those semantics are runtime-promoted; intentionally changes vanilla campaign content. It cannot claim parity through the current placeholder rule set. | Stat-budget inflation or one counter-build; use doctrine budgets, preview counters, and test build-frontier diversity. |
| New encounter/tournament order | Campaign state and opponent scheduler | Can preserve combat rules; changes campaign parity. | Farm the safest node or repeat a solved sequence; risk-adjust rewards and impose authored variety/cooldowns. |
| Changed XP/gold/shop multiplier | Campaign settlement/economy, not rule-set action resolution | Combat rules can remain; progression is a labelled endless-mode rule. | One activity dominates yield or gear unlocks too early; compare reward per expected turn/risk and audit every gate. |
| Existing enchantment/equipment effect with new bounded numbers | Item/opponent content if its semantics and mapped fields are unchanged | May preserve combat-rule semantics; exact classic item catalog does not remain campaign-parity. | Largest number is always correct; enforce a power budget and meaningful opportunity cost. |
| New skill, action, hit/damage payoff, proc, status, AI action, or affix semantics | New designed rule set; usually action UI/animation; canonical state if persistent | **Separate rule set required.** It is not vanilla parity. | Scripted opener, multiplicative burst, hard denial, or opaque proc fishing; deterministic action-grid/property tests and explicit counters. |
| Per-player inventory and equipment | Canonical per-combatant state, inventory/reward UI, separate versioned team save | Can preserve classic combat only when items use existing verified semantics; new affixes use designed rules. | Funnel every item to one carry; give personal rewards, declared loot policy, and a concentration-dominance test. |
| Rolled loot/rarity/affix state | Campaign generator, item schema, canonical state, UI, persistence; rule set for novel semantics | Rarity alone is progression-state; behaviour-changing affixes require designed rules. | Reload/reroll, best-in-slot rarity, combinatorial one-turn kill; persist offers/seed, use affix budgets/exclusions, duplicate recovery. |
| Persistent rivals and endless ladder | Campaign/opponent generator plus versioned save | Changing only rival records/loadouts could preserve a future verified classic rule; any change to `chooseAiAction`, action vocabulary, or legality requires a separate designed rule set. | Sandbag to manipulate counters, farm a weak rival, or runaway rubber-band; cap/declare memory and audit deliberate-loss policies. |
| New team/turn/elimination semantics | Resolver/engine, not the rule set | Engine feature; cannot be called a ruleset-only change. | Extra seats lose agency or focus-fire decides before response; per-seat action/value tests and bounded focus-fire counterplay. |
| Per-player reward settlement | Resolver callback plus campaign state/save/UI, firing only after the acknowledged team result | Can preserve combat rules; changes campaign settlement. | Duplicate payout on repeated animation/reconnect or kill stealing; retain once-only latch and avoid last-hit allocation. |
| New Collection menu entry | Launcher entry/patch or explicitly approved known slot | Deployment/integration concern, neither combat nor campaign parity. | Overwrite another mod or mutate the installation; independently authored path, staged outside installed tree, explicit deployment approval. |
| Difficulty variants sharing one character | Save schema, mode/ruleset provenance, reward policy | Each fight declares its rules; classic and designed modes remain distinguishable. | Farm low-risk mode for high-mode power; risk-normalize or tag rewards without creating incompatible saves. |

There is no honest “content-only prototype” of the full requested progression
system yet. The battle map states that canonical state still lacks complete SS2
equipment, stamina, magicka, spell/item inventory, status, RNG, and result
fields. Even with an existing-semantics item drop, resulting combats need that
adapter/state work before they can be tested for combat-rule parity; the drop
already changes campaign parity. [V]

### 5.3 Relative implementation bands for sections D/E

These are architectural bands, not time estimates. [A]

1. **Lowest relative cost once adapter state exists:** authored opponent
   records, existing-action loadouts, encounter sequencing, shop schedules,
   and existing-semantics trophy items. They change campaign content but need
   not change combat rules.
2. **Moderate:** seeded opponent/loot generation, per-combatant inventory,
   persistent rivals, personal rewards, shared stash, trading, and migration.
   These demand canonical state, UI, persistence, and robust settlement even
   when combat semantics remain classic.
3. **Higher:** behaviour-bearing affixes, new spells/actions, altered proc/
   armour/resource rules, smarter AI doctrines, or anti-stall pressure. These
   require a separate designed rule set, deterministic tests, and often new UI
   and animation.
4. **Integration track:** 2v2/3v3 layout, target selection, multiple live
   inventories, launcher exposure, and deployment. The mapped original UI is
   hard-coded for hero/villain and cannot be multiplied by naming convention.
   [V]

The cheapest meaningful slice must combine at least one item from bands 1 and
2; content alone inherits vanilla's solved strategies, while state alone has
nothing new to award. [A]

---

## 6. Q10 — exploit and degeneracy register

### 6.1 A repository evidence conflict that must remain visible

The brief says four normal-band directions are promoted goldens. The current
[roadmap](../roadmap.md) says only
`golden-prisoner-normal-kill-dir6` is runtime-verified and says golden breadth
remains limited. This survey does not resolve that conflict by inspecting or
editing forbidden measurement records. [V]

The conservative gate is:

- at least one normal-band path is golden-confirmed; [V]
- no shield, bash, armour-equality, deflection, grievous-removal, or
  enchantment quirk below is called golden-confirmed on that basis; [V]
- byte/static candidates remain candidates until promoted through the
  [golden harness](../integration/ss2-golden-harness.md). [V]

This matters twice. A classic-parity implementation must not “fix” a candidate
before measuring it, while the endless design must not cite an unpromoted bug
as a verified foundation. [A]

### 6.2 Mapped and candidate combat surfaces

| Surface and evidence status | Degeneracy invited | Required test | Counter and parity decision |
| --- | --- | --- | --- |
| For the mapped clamped physical-action path, cached hit chance uses the ratio/round/clamp formulas and the dispatcher succeeds on inclusive `d100 >= 100 - chance`; cached 50 realizes 51/100 outcomes and cached 99 realizes 100/100. This statement is not generalized to every spell/magicka path. [V/D] | Reaching the displayed cap deletes miss risk; display and realized chance differ. | Exhaustively enumerate physical-action rolls 1–100 at cached chances 1–99; assert UI communicates the realized convention. | A classic rule may claim/preserve this convention only after end-to-end runtime promotion. Endless designed rules should use exact probability semantics or display realized probability; formula/dispatcher change requires a separate rule set. |
| **Static candidate:** attacker's own shield increases bombard/snipe chance; equal contest stats plus shield 6 derives cached snipe 99, hence 100/100 under the mapped dispatcher. [V/D] | A dormant shield becomes a free ranged-accuracy item; the intuitive defensive tradeoff reverses. | Metamorphic test: changing only attacker shield must not improve ranged accuracy unless an explicit item effect declares and prices it; cover shield 5/6 boundaries. | **Fix in the endless designed rule set:** remove the accidental attacker term. Optionally offer a visible stabilizer affix with a real slot/stamina/damage cost. Preserve only in a classic path if promoted evidence requires it. |
| **Static candidate:** damage exactly equal to armour appears to zero armour and still apply the full original damage to HP; strict overflow uses only the remainder. [V] | Non-monotonic defence: equality can hurt more than one point of overflow. | Property test incoming damage `A-1`, `A`, `A+1`; designed rule HP loss should be monotonic and explicit. | Use explicit `max(0, damage - armour)` overflow in designed rules. Any correction changes combat semantics and belongs outside classic parity. |
| **Static candidates:** bash direction 23 may inherit transient `criticalhit`; secondary weapon type may compare against primary potency; helmet/greaves deflection operands are counterintuitive; direction-30's unconditional armour-removal call appears to be a no-op. [V] | Crit banking into bash; an unused primary becomes a stat stick for secondary procs; more greaves can reduce the mapped critical-deflection chance; a removal branch can fail to mutate armour. | Sequence `critical action → bash`; vary unused-primary potency while secondary stays fixed; monotonic helmet/greaves sweep; runtime-discriminate direction-30 no-op versus piece removal, and require any designed grievous effect to mutate its declared target. | Clear/consume transient critical state, read active potency, make defensive operands monotonic, and target explicit armour state—but only in the separate designed rule set unless goldens disprove the candidates. |
| All mapped physical damage invocations roll a 34% armour-removal check; surviving criticals bypass armour. This is mapped, not broadly golden. [V] | High-accuracy low-damage actions may fish armour removal per hit; crit fishing can erase the payoff of an armour build. | Across action/stat/loadout grid, measure armour removed and HP damage per turn and per stamina; flag any action that dominates both. | If dominance exists, scale removal by cost/damage, cap it per round, and budget full bypass separately from accuracy/guaranteed crit. Those are designed-rule changes. |
| Fully absorbed damage still grants breastplate stamina from full damage. Byte-mapped and live-observed, not shown promoted here. [V] | Deliberate tanking may produce a positive stamina loop. | Cycle-test maximal breastplate builds: incoming hit, response action, passive recovery; reject a cost-free indefinitely repeatable positive-resource cycle in designed mode. | Grant from HP damage only, cap once per round, or convert to visible bounded guard. Separate designed rule; do not rewrite a future verified classic rule. |
| Ordinary `duel` is first blood: first HP damage defeats, while complete armour absorption does not. Byte-mapped/runtime-observed in the battle map. [V] | If a legal loadout can combine guaranteed ranged accuracy or reliable armour bypass with first blood, the fight may collapse into one-roll crit fishing; current evidence does not establish that reachability. [A/U] | Compute first-action win probability for every legal loadout and initiative order, including a reachability search for hit-cap plus bypass combinations; no untelegraphed action should combine guaranteed hit and full bypass in designed mode. | Use a first-blood-specific critical rule, response window, or accuracy ceiling only if the designed-mode test finds a problem. Classic mode preserves only end-to-end promoted behaviour. |
| Passive HP/stamina recovery occurs each phase and rest recovery is large; the diagnosis derives a full empty-bar refill at stamina-stat 16 under the mapped formula. [V/D] | Capacity investment loses marginal value; retreat/rest/defend can create long positive-resource cycles. | Adversarial policy search for repeated equivalent states; require a bounded route to resolution. | Fractional recovery, repeat fatigue, or escalating arena pressure requires designed rules. Content-only counters may use aggressive opponents but cannot guarantee a global bound. |
| Movement reaches its hard cap at integer speed 40; ammunition stops increasing after level 45. [V/D] | Dead stat allocations and post-cap levels with no choice. | Marginal-value audit for every offered point at levels 1/25/45/50/100; no presented upgrade may silently do nothing. | Stop offering capped scalar points or convert post-cap investment into disclosed sidegrades. This is endless progression logic, not vanilla campaign parity. |
| Matched-stat hit outcomes are stationary and action selector mappings are level-invariant while damage magnitudes can continue growing; ordinary armour and boss content appear to end around community-reported gates 48/50, not build-verified gates. [V/C/D] | Endless scalar growth repeats the same solved action policy after authored content ends. | At milestone levels compare optimal policies, viable build families, and opponent doctrines; reject stretches where only magnitude changes. | Add categorical doctrines, rules-changing sidegrades, and new decision types. Existing-action opponents may preserve combat rules once verified; changed actions use designed rules. |
| Vanilla RNG is unseeded and split across `randomBetween` and direct `RandomNumber`; reload exploitation is **not** verified by allowed evidence. [V/U] | Reloading may reroll combat, shops, or offers, turning persistence into a slot machine. | Save one designed campaign snapshot, reload repeatedly, and assert identical hidden offers/outcomes from persisted seed/cursor/offer IDs. | Persist campaign seed, ordered cursor, and generated offer IDs. This is save/state work; do not call current vanilla save-scumming verified. |

### 6.3 Historical official fixes: regression requirements, not current bugs

| Historical finding | What it teaches the endless mode | Seam/counter |
| --- | --- | --- |
| The exact [July 2024 announcement](https://steamcommunity.com/games/1055430/announcements/detail/4370264726174346615) says taunting formerly granted stamina; the developer called the interaction “massively OP” and fixed it. [O] | A social/action-denial stat must not also finance its own repeated use for free. This is not evidence that the bug persists. | Regression-test that taunt adds no action-specific stamina beyond ordinary phase recovery unless a visible bounded effect explicitly pays for it. Combat-semantic changes belong to designed rules; the Collection fix remains historical context. |
| The developer acknowledged the comma-name glitch as accidental/shoddy programming in 2025, without establishing present exploitability in the fingerprinted build. [O/U] | Text/import boundaries can become progression cheats and corrupt long-lived saves. | Fuzz names/imports with commas, separators, non-numeric values, and schema extremes. Fix in input/save validation, not by inventing a combat rule. |
| The exact [November 2020 patch](https://steamcommunity.com/ogg/1055430/announcements/detail/2906473723217146006) addressed off-screen action controls after knockback, an accidental Fearful Prisoner taunt defeat, illegal enemy equipment, and weapon-switch failure. [O] | Endless generation will revisit every boundary: arena extremes, tutorial locks, equipment eligibility, and weapon state. | Keep UI reachability, equip legality for player/AI, legal-action, and weapon-transition regression tests. These are fixed-history requirements, not alleged current exploits. |

### 6.4 Community strategy reports: hypotheses to test, not dominance claims

| Report | Evidence limit | Progression risk | Counter/test and parity decision |
| --- | --- | --- | --- |
| Older guides describe pure Charisma, taunt-based action denial/stamina, extreme shop discounts, and armour-only spending. A 2023 Collection thread reports a successful pure-Charisma run; a post-nerf 2024 thread still treats Charisma as common but reports a Sandalphon wall and gives a viable archer alternative. [C] | Versions conflict; the official taunt-stamina bug was fixed. This does not prove universal current dominance. | One stat could dominate both combat control and economy, making every drop/choice subordinate to Charisma. | Deterministic full-ladder frontier: win rate, turns, gold spent, actions used, and hard walls for pure/mixed allocations. Separate price floors from repeated-taunt scaling. Formula/action fixes require designed rules; content-level counters may preserve classic combat. |
| Current players describe high-agility opponents repeatedly jumping away; an archer guide succeeds by stepping back and firing while ammunition rarely binds. [C] | Anecdotal and opponent/build-specific. | Movement can create infinite low-HP kiting or make range the safe universal policy. | Max-distance adversarial cycle search with turn bound; closing pressure, costed pursuit, or anti-repeat fatigue requires designed rules. Authored fast-closing opponents can be a parity-preserving content counter but cannot solve the system globally. |
| A community guide recommends a starter dark enchant for skipped turns and shove at close range. [C] | Old/current-build applicability is uncertain. | Cheap control plus deterministic burst can remove the opponent's turn and make rarity/loot merely a delivery vehicle for denial. | Enumerate control-chain uptime and response windows; cap/decay repeated control or add immunity windows in designed rules. Do not silently edit a classic parity path. |
| Players report retries/save-scumming in SS1 and high-variance hard mods. [C] | No allowed evidence proves current SS2 reload manipulation. | Reloadable shops, loot, or combat erase scarcity and make failure cost only time. | Persist seed/cursor/offers before reveal; idempotent settlement; test crash/reconnect/reload. Save/state concern, not a vanilla exploit claim. |
| Extended comment: bank Molten Death until a weapon-magic proc, then chain casts. [C] | Single unverified comment with a claimed probability swing. | Proc banking converts a difficult capstone into waiting for one trigger and executing a fixed script. | Sequence-search state/action histories; cap stored casts/proc conversion or make the telegraphed window interactive in designed rules. Existing classic semantics remain observational until verified. |
| Requiem player: accelerated points rush gear thresholds, unchanged armour loses to Strength/Magicka, regenerative enemies stall, and passive AI movement wastes or abuses distance. [C] | One detailed player report, not measured code or telemetry. | Symmetric inflation does not preserve balance across asymmetrical axes; gold becomes the sole gate; healing/kiting cycles dominate. | Model each axis separately, audit gates, test adversarial healing/movement cycles, and require non-scalar doctrine changes. Progression fixes may preserve combat; resource/AI fixes need designed rules. |
| SS3 Forever reports one-shots, mandatory resistances, million armour, 300+ turns, and RNG-dependent wins. [P/C] | Different title/mod, self-selected reports. | Raw endless scaling invalidates existing builds and replaces decisions with retry/grind. | First-action ceiling, maximum tail turn count, two-build-family viability, previewed counters, respec/recovery. New rules are explicitly non-parity. |

### 6.5 Decision on the shield/ranged candidate

**Do not lean into the hidden behaviour as-is.** [A]

The term is backwards to player intuition, invisible in the ordinary defensive
meaning of a shield, unpriced against ranged weapons, and capable of pushing
snipe onto the mapped 100/100 outcome boundary. Building loot around it would
turn an unpromoted candidate into a dependency and teach players to exploit a
bug-shaped operand rather than make a legible tradeoff. [V/D/A]

The two modes should diverge cleanly:

- **Classic-parity path:** observe first. If a future promoted golden confirms
  the attacker-shield term, preserve it exactly and document the realized
  probability. If evidence rejects it, do not preserve a static false
  positive. [V/A]
- **Endless designed rule set:** remove the implicit term. If the interaction
  is fun, re-author it as an explicit affix such as a ranged stabilizer:
  equipping a compatible shield trades block value, stamina, movement, or
  damage for a disclosed accuracy effect below the guaranteed-hit boundary.
  Test it against shieldless and two-handed alternatives. [A]

This is the model for every attractive vanilla quirk: parity may preserve a
measured oddity; the new mode may transform the *idea* only behind a labelled
rule seam with an explicit cost and counter. [A]

---

## 7. Requirements carried into the progression design

Every adopted pattern below states the new decision, seam, invited degeneracy,
and minimum counter. This is a gate for sections D/E, not the final mechanic
specification. [A]

| Pattern | Adopt/reject and new question | Parity/seam | Invited degeneracy | Required counter before proposal is complete |
| --- | --- | --- | --- | --- |
| Authored rival milestones (Extended, Forever, SS4 request) | **Adopt.** “Which disclosed doctrine am I preparing to counter?” | Existing-action opponent content can preserve combat rules; persistent memory needs save state; new AI/actions require designed rules. | One universal counter-build; rubber-band rival; farm weakest rival. | Doctrine budgets, at least two viable counter-families, capped/legible adaptation, risk-adjust rewards, deliberate-loss audit. |
| Champion-only compressed route (Champion Rush) | **Adopt as optional bounded route, not endless core.** “Do I trade connective rewards for fast milestones?” | Campaign/economy schedule; combat parity possible. | Accelerated gold/gear removes purchasing choices; best build repeats. | Retune all gates together, preserve competing purchases, normalize yield, full-route policy diversity test. |
| Per-combatant persistence (SS4) | **Adopt.** “What does my fighter equip/save while allies make their own choices?” | State/UI/namespaced save/settlement; combat parity possible with existing semantics. | One carry receives everything; contribution gaming; duplicate payout. | Personal baseline rewards, explicit loot policy, no last-hit ownership, concentration test, once-only settlement/reconnect tests. |
| Bounded survival streak (Crusader) | **Adopt.** “Continue for a disclosed higher-risk reward or cash out?” | Campaign scheduler/settlement; combat parity possible until modifiers alter rules. | Safe-node farming, solved loop, reload before loss. | Short milestone horizon, rotating doctrines, persisted seed/offers, risk-adjust yield, no raw-turn reward. |
| Optional assistance/hard track (Yeti response, Forever/Fair) | **Adopt.** “Which challenge contract do I accept?” | Campaign if encounter/content only; separate rules where semantics differ; shared versioned save with provenance. | Farm easy mode, spend in hard; assistance becomes mandatory tax. | Risk-normalized or mode-tagged rewards, transparent costs, shared characters without destructive migration. |
| Trophy/rarity sidegrades (Extended, boss-equipment request) | **Adopt conditionally.** “Which rule interaction do I build around and what do I give up?” | Existing semantics may preserve combat rules; behaviour-bearing affixes require designed rules/state/UI/save. | Permanent best-in-slot, boss farming, combinatorial burst, missing-drop lockout. | Power budget, exclusions, mutually exclusive identities, duplicate conversion/pity, alternate acquisition, full affix-combination tests. |
| Themed content reuse (Gross Out, Neomatons) | **Adopt.** “What opponent doctrine does this theme signal?” | Content/presentation may preserve combat rules. | Cosmetic variety hides identical fights and inherited dominant builds. | Each family must change a legible decision; run build frontier across every pack. |
| Fast duel cadence (Mini Fighters) | **Adopt the target, reject one-shot method.** “Can I read and answer the threat in a bounded fight?” | UI/settlement speed may preserve parity; damage/turn-pressure changes require designed rules. | Initiative/first hit decides all. | First-action win ceiling, response window, median and tail turn bounds. |
| Compatible difficulty variants (Forever/Fair) | **Adopt.** “Which rules/reward provenance does this fight use?” | Versioned save/mode provenance; rules selected explicitly. | Cross-mode reward laundering. | Risk-normalization/tagging and migration tests; never split characters merely by filename. |
| Raw stat inflation (Forever, Requiem report) | **Reject.** It asks no new question. | Would be a new progression mode but can leave formula semantics unchanged; that does not make it good. | One-shots, armour irrelevance, gear-gate rush, build deletion, stalls. | No proposal based on symmetric multipliers passes; categorical decisions and axis-specific budgets are required. |
| Infinite levels over finite skills (Crusader cap) | **Reject.** A level without a choice is bookkeeping. | Progression/save concern. | Exhausted menu, dead level-up, forced filler upgrades. | Stop scalar levels, add recoverable sidegrade pools, or make post-cap advancement a different decision system. |
| Board/minigame/random-event bulk (SS4) | **Reject for core duel progression.** It changes activity, not duel decisions. | Would require major presentation and campaign-system work; resolver changes only if the activity alters authoritative combat/team semantics. | Dominant luck protection; permanent random save damage; co-op downtime. | Keep optional presentation outside authoritative combat; no permanent random stat loss. |
| Army management/single-ability loops (Crusader) | **Reject.** Wrong scale for 1v1/2v2/3v3. | Major engine/UI change. | One commander or one repeatable summon solves play; allies lose agency. | Keep each seat's fighter/action ownership; no imported army layer. |
| Full solo-mod balance assumptions | **Reject.** A fair solo counter can become oppressive focus fire or a support monopoly in teams. | Team-mode UI/testing plus designed-rule balance; resolver work only if new team, turn, targeting, or elimination semantics are introduced. | One player does everything; focus target gets no turn; support becomes an appliance. | Test every mechanic in 1v1, 2v2, and 3v3 with mixed controllers, per-seat decisions, focus-fire, and disconnect/reconnect. |

### 7.1 Acceptance tests implied by the survey

Before a section D/E mechanic is called designed, its spec must identify tests
for all applicable rows below. [A]

1. **Decision novelty:** at each milestone, compare optimal policies before
   and after; reject unlocks that only multiply the same action.
2. **Build frontier:** sweep pure and mixed stat/loadout families; measure wins,
   turns, gold, actions used, and hard counters rather than relying on one
   aggregate win rate.
3. **Action dominance:** measure HP damage, armour removal, control uptime,
   resource change, movement value, and expected settlement reward per turn/
   stamina.
4. **Resolution bound:** search adversarial heal/rest/retreat/defend policies
   for repeated states and excessive tail turn counts.
5. **First-action safety:** enumerate initiative/loadout/opening combinations;
   a non-telegraphed action must not guarantee a decisive outcome.
6. **Economy/gate audit:** simulate legal progression from a fresh save; every
   unlock, shop visit, rarity, and catch-up multiplier must preserve a real
   choice.
7. **Reload/idempotence:** save, reload, reconnect, repeat the final animation,
   and crash around settlement; offers/outcomes remain deterministic and a
   battle pays exactly once.
8. **Concentration:** compare fair distribution with all transferable value
   funnelled to one seat; concentration must not dominate team progression.
9. **Agency:** in 2v2/3v3, each allied seat gets recurring consequential
   decisions; no mechanic turns a player into passive inventory or a buff bot.
10. **Provenance:** every result/save/reward identifies classic versus designed
    rules and the generator/version that produced persistent items/opponents.

---

## 8. Explicitly rejected inferences

For later authors, these statements are **not** supported by this survey:

- “Champion Rush is endless” — public footage instead supports a compressed
  champion-only campaign ending at Antares. [C]
- “Extended was data-only” — its visible surfaces are content/data-shaped; its
  internal implementation is [U].
- “Emperor's Requiem definitely is `ss2_olis_mod`” — probable [A], not
  explicitly mapped in accessible first-party text.
- “Neomatons has a validated level-60 progression path” — the creator
  showcase uses a visible skip/test character. [P/C]
- “Endless Tavern Adventures is an SS4 procedural endless mode” — base-title
  association and mechanics are [U] in accessible official text.
- “The 2024 mods each add champions, XP boosts, and skills” — the official
  statement is aggregate across the batch. [O]
- “Official Collection inclusion proves balance” — the 2026 developer says
  the opposite for that batch. [O]
- “Community comments prove the dominant SS2 build” — they define hypotheses
  for deterministic tests, not telemetry. [C/A]
- “Every byte-mapped quirk is parity” — static candidates require promoted
  runtime evidence. [V]
- “A reskin or larger roster fixes combat balance” — Gross Out and the reported
  mod strategies show inherited rules can solve new content. [O/C/A]

---

## 9. Sources

### Repository evidence

- [SS2 battle map](../integration/ss2-battle-map.md) — formulas, resources,
  armour/status candidates, UI boundary, and fixed Collection launcher paths.
- [SS2 adapter contract](../ss2-adapter-contract.md) — rule provenance,
  ordered RNG, combatant/controller separation, team result, persistence, and
  once-only settlement.
- [Team rule-set seam](../../src/team/rule-set.js) — rule-set versus resolver
  ownership.
- [Roadmap](../roadmap.md) and
  [golden harness](../integration/ss2-golden-harness.md) — current promotion
  gate and the golden-count documentation conflict recorded above.
- [Progression diagnosis](progression-diagnosis.md) — quantitative flattening,
  reference-game principles, and derived cap thresholds.

### Official announcements and public distribution mirrors

- Classic Collection
  [official store page](https://store.steampowered.com/app/1055430/Swords_and_Sandals_Classic_Collection/)
  — base-title descriptions and Collection scope.
- Classic Collection
  [official announcement archive](https://steamcommunity.com/app/1055430/allnews/)
  — release archive, 2025/2026 mod additions, and developer qualifications.
- Exact first-party announcements for the
  [August 2021 SS4 persistence/reward rework](https://store.steampowered.com/news/app/1055430/view/2968422316509754858),
  [November 2020 optional Yeti response and SS2 fixes](https://steamcommunity.com/ogg/1055430/announcements/detail/2906473723217146006),
  [May 2020 Gross Out inclusion and Crusader cap](https://steamcommunity.com/ogg/1055430/announcements/detail/3757636398660124097),
  and [July 2024 fan mods/taunt fix](https://steamcommunity.com/games/1055430/announcements/detail/4370264726174346615).
- Third-party SteamDB mirror of the July 2024
  [v1.5 fan-mod announcement](https://steamdb.info/patchnotes/15130826/)
  — dated copy of the ten named additions and aggregate feature description;
  the Steam announcement archive above is the [O] source.
- Third-party SteamDB mirror of the April 2025
  [update record](https://steamdb.info/patchnotes/18249031/)
  — dated copy of the Emperor's Requiem and non-exhaustive “few new mods”
  wording; the Steam announcement archive above is the [O] source.
- Third-party SteamDB mirror of the June 2026
  [update record](https://steamdb.info/patchnotes/23951694/)
  — dated copy of the five named additions and untested/balance disclaimer;
  the Steam announcement archive above is the [O] source.
- Public Windows
  [depot metadata](https://steamdb.info/depot/1055432/) — package/root names
  only; no payload/readme/source was accessed.
- Developer response on
  [missing Mac additions](https://steamcommunity.com/app/1055430/discussions/0/572668060972005849/)
  and response to a
  [Workshop request](https://steamcommunity.com/app/1055430/discussions/0/4523386962650749051/)
  — distribution and old-architecture constraints.

### SS2 mod-specific public sources

- Champion Rush
  [public complete run and shipped summary panel](https://www.youtube.com/watch?v=ipDJrdEgLY8&t=1s),
  plus a separate
  [playlist opening](https://www.youtube.com/watch?v=Nhwl8v8kQ6I) and
  [finale](https://www.youtube.com/watch?v=pzewdFKVG1A).
- Extended public
  [description/run](https://www.youtube.com/watch?v=snCwzNsUq98), the
  [Molten Death sequence comment](https://www.youtube.com/watch?v=snCwzNsUq98&lc=UgxV55PXjVSpRIYG4yZ4AaABAg),
  [complete run](https://www.youtube.com/watch?v=iiCjU9x6-Cg), and the
  [“impossible”](https://www.youtube.com/watch?v=V0_RYQ9tLf0),
  [“amazing and fun”](https://www.youtube.com/watch?v=OdDnNGzIkD4), and
  [victory](https://www.youtube.com/watch?v=6gVc03B3zdU) sequence.
- Extended community entries for
  [Emperor Antares](https://swordsandsandals.fandom.com/wiki/Emperor_Antares),
  [Emperor's Reign](https://swordsandsandals.fandom.com/wiki/Swords_and_Sandals_2%3A_Emperor%27s_Reign),
  and [Malevolence](https://swordsandsandals.fandom.com/wiki/Malevolence), plus
  the isolated
  [range report](https://www.reddit.com/r/swordsandsandals/comments/1o2fk1d/).
- Emperor's Requiem
  [public walkthrough and discussion](https://www.youtube.com/watch?v=E03VK3YnIXo),
  [point-allocation comment/reply](https://www.youtube.com/watch?v=E03VK3YnIXo&lc=UgwcuAZtnVZ7nzdWSXp4AaABAg),
  [difficulty-praise comment](https://www.youtube.com/watch?v=E03VK3YnIXo&lc=UgwACNJtpW3c-RNEO_p4AaABAg),
  [detailed balance/kiting report](https://www.youtube.com/watch?v=E03VK3YnIXo&lc=UgwACNJtpW3c-RNEO_p4AaABAg.AI3uLziY_aoAKZ0NCMljJj),
  and [visual criticism](https://www.youtube.com/watch?v=E03VK3YnIXo&lc=UgzwN30Es-zhECbJzGl4AaABAg).
- Neomatons creator
  [public showcase](https://www.youtube.com/watch?v=OmOE10y11xE).

### Collection-wide author/community sources

- SS3 Forever author/community
  [balance thread](https://steamcommunity.com/app/1055430/discussions/0/4518883844569487784/),
  [page 2](https://steamcommunity.com/app/1055430/discussions/0/4518883844569487784/?ctp=2),
  and [page 6](https://steamcommunity.com/app/1055430/discussions/0/4518883844569487784/?ctp=6).
- Secondary SS3
  [community catalog](https://swordsandsandals.fandom.com/wiki/Swords_and_Sandals_III%3A_Gladiae_Ultratus)
  — names Forever Fair Edition, Abyss Dungeons, and Hardcore Mode; official
  inclusion and mechanics remain unverified where stated above.
- SS4 detailed
  [late-game/remake request](https://steamcommunity.com/app/1055430/discussions/0/564785190210244441/).
- SS1
  [difficulty/build discussion](https://steamcommunity.com/app/1055430/discussions/0/4032473436331969929/).
- Current Collection
  [Charisma/build discussion](https://steamcommunity.com/app/1055430/discussions/0/598512272430651802/),
  [Charisma report](https://steamcommunity.com/app/1055430/discussions/0/3766732914513410970/),
  and [agility-enemy discussion](https://steamcommunity.com/app/1055430/discussions/0/669474588663535245/).
- Community
  [all-games guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2721118597)
  and [SS2 build guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2227686901).
- DolphinTuna's stable
  [Classic Collection review](https://steamcommunity.com/id/Skraal2099/recommended/1055430/)
  — December 2019 Mini Fighters/taunt reports, updated September 2024 with a
  warning that at least the taunt issue was fixed.

---

## 10. Open verification items

- An authoritative public changelog or author design note for each SS2 mod,
  especially Extended's exact roster/economy and Neomatons' legal campaign
  path. No bundled readme/SWF will be inspected under the assignment boundary.
- Exact Champion Rush economy/requirement/enchant multipliers and whether any
  opponent/combat formula changed.
- Whether community-reported Extended proc banking, range issue, and Requiem
  scaling/kiting apply to current distributed builds.
- Representative reception data. Public videos/comments establish examples,
  not population preference or completion rates.
- Resolution of the brief/roadmap promoted-golden count by the measurement
  owner. This document conservatively relies on the roadmap's one explicitly
  named golden and does not touch forbidden records.
- Runtime promotion/rejection of attacker-shield ranged accuracy, armour
  equality, bash transient critical inheritance, secondary potency, critical
  deflection operands, and grievous armour removal.
- Fingerprinted-build full campaign opponent/loadout/economy data and current
  dominance of Charisma, ranged kiting, control enchants, or retry policies.
- Complete adapter state for equipment, resources, spell/item inventory,
  statuses, ordered RNG, and result settlement before a parity-bearing loot
  prototype can be claimed.
- An explicit legal/distribution route for a future Collection entry. Fixed
  public paths establish the launcher boundary, not authorization to modify an
  installed title.

Until those items are verified, sections D/E should cite this document's
requirements and confidence labels, not silently upgrade unknowns into facts.
