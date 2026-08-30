# SS2 adapter contract

This project is deliberately separated from the original game. It contains no
SS2 code, artwork, audio, or distributed SWF. A licensed installation is needed
before the adapter work can begin.

## What the adapter must do

1. Extract an SS2 gladiator and AI opponent into the engine's combatant shape.
   Preserve equipment and stats; do not import a guessed damage formula.
2. Start the team arena as a *new* battle mode, without changing the vanilla
   1v1 path until the mode is stable.
3. Replace the prototype rules by **injecting a second rule set** at the seam
   described below, built from formulas measured in the licensed build. Use
   golden tests: the same single attack in vanilla and team mode must have the
   same hit/damage outcome with the same random roll.
4. Bind each engine event to an SS2 animation and UI update. Positions must be
   calculated from a six-slot arena layout, not hard-coded left/right globals.
5. Persist roster, health, statuses, initiative cursor, seed, and event log in
   a separate team-battle save record. Existing SS2 saves must remain readable.

Items 1 and 4 are implemented asset-free in `src/adapter/` and specified in
[The SS2 adapter](#the-ss2-adapter-srcadapter) below. Item 3 is the rule-set
seam, item 2 is Stage 5, and item 5 is not started.

## What to locate in the SWF

- the battle scene entry point and its completion callback;
- the two combatant data objects and all references that assume `player` or
  `enemy` rather than a combatant id;
- RNG calls, damage/hit/spell logic, status handling, rewards, and save code;
- movie clips for fighter pose/weapon overlays and health UI;
- the launcher/menu code that selects a SWF from the Collection's mods folder.

---

# The team-resolver seam

`src/team/` is the shared resolver that serves 1v1, 2v2 and 3v3. There is one
combat implementation; 1v1 is a parity gate, not a second path. `src/engine.js`
is a thin compatibility façade over it.

| Module | Owns |
| --- | --- |
| `src/team/rule-set.js` | the injection contract, and the gate on claiming runtime verification |
| `src/team/placeholder-rules.js` | the only formulas in the tree — all placeholder |
| `src/team/rng.js` | the ordered authoritative RNG channel (seeded or tape-backed) |
| `src/team/roster.js` | teams, slots, combatant identity, AI fill |
| `src/team/controllers.js` | seat → controller identity, independent of combatants |
| `src/team/elimination.js` | knockouts, combatant-defeated, team-eliminated |
| `src/team/settlement.js` | once-only campaign settlement behind two gates |
| `src/team/resolver.js` | turn order, legality, effect application, event sequencing |

The boundary is asset-free and dependency-free: ESM, Node builtins only, no
game data of any kind.

## What a rule set must provide

A rule set is a plain object validated by `assertTeamRuleSet` and normally
built with `defineTeamRuleSet`.

| Member | Type | Meaning |
| --- | --- | --- |
| `id` | lowercase token | stable identifier, recorded in the wire state |
| `contractVersion` | `1` | must equal `TEAM_RULE_SET_CONTRACT_VERSION` |
| `verification` | `"placeholder"` \| `"runtime-verified"` | see the provenance gate below |
| `provenance` | object | `note` always; goldens and a build hash when verified |
| `actionTypes` | lowercase tokens | the rule set's action vocabulary |
| `maximumHealth(combatant)` | `number` | derived maximum health at normalisation |
| `legalActions(view, actorId)` | `ActionOption[]` | every action the actor may submit |
| `resolveAction(request, rolls)` | `ActionOutcome` | the outcome of exactly one action |
| `chooseAiAction(view, actorId, options)` | `ActionOption` | the AI policy for this vocabulary |

`ActionOption` is `{ type, targetId, spellKind? }` — the same shape a network
client submits, plus `actorId`.

`view` is `{ turnNumber, actor, allies, foes }`. `request` is that view plus
`{ actorId, teamId, type, targetId, spellKind, target }`. Everything in both is
a frozen clone: a rule set can read the battle but cannot reach into it.

`ActionOutcome` is `{ effects, events }`:

- `effects` are declarative and applied in order by the resolver:
  `{ kind: "damage" | "heal", targetId, amount }` with a non-negative finite
  amount, or `{ kind: "status", targetId, status, active }`. The resolver does
  the clamping to `[0, maxHealth]` and recomputes `alive`.
- `events` are ordered semantic records with a `type`. The resolver stamps
  `sequence` and `turn`; a rule set that supplies either is rejected.

The action vocabulary is owned by the rule set precisely because the licensed
build's vocabulary (power, normal, quick, bash, taunt, bombard, snipe,
grievous) differs from the placeholder's (melee, ranged, spell, rest).

## What the resolver guarantees

- `resolveAction` is called at most once per action, only for an action that
  `legalActions` listed, and only for the combatant whose turn it is.
- Every random value reaches the rule set through one ordered, labelled
  channel, in the order the rule set requests it. **The resolver draws
  nothing itself**, so the roll stream is exactly the rule set's roll stream
  and can be compared one-to-one with a capture.
- Effects are applied in order and clamped; events are appended in order.
- Knockouts, team elimination, the battle result, and campaign settlement are
  computed by the resolver afterwards, never by the rule set.
- Determinism: same blueprint + same ordered action stream ⇒ identical
  `combatStateHash`, for every team size.

## The verified/placeholder gate

`defineTeamRuleSet` refuses `verification: "runtime-verified"` unless the
provenance pins the licensed build's SHA-256 *and* cites at least one promoted
golden fixture id. A placeholder must declare `runtimeVerified: false` and must
not cite goldens. `describeTeamRuleSet(rules)` returns the one-line summary
(`id`, `verification`, `runtimeVerified`, `goldenFixtureIds`, `buildSha256`,
`note`), and `toTeamWireState(battle).rules` carries it into every state
projection, save record, and diagnostic. A reader can therefore always tell
measured behaviour from invented behaviour.

**Everything shipped today is placeholder.** `classicStyleRules` and the
`melee/ranged/spell/rest` vocabulary are invented approximations authored for
this repository, are not measured against the licensed build, and must never be
presented as SS2 parity. Promotion replaces them by *adding* a rule set, not by
editing one.

## Ordered authoritative RNG channel

`createOrderedRngChannel` has two deterministic modes.

- **Seeded** — a self-contained generator, used for local play. Same seed plus
  same ordered requests gives the same values.
- **Tape** — a finite ordered list of `{ label, source, min, max, value }`
  samples with strict label, source, and bound checking. This shape is
  deliberately identical to the 1v1 golden harness tape in
  `src/golden/ordered-rolls.js`, so a promoted golden's captured rolls can
  drive the team resolver without translation.

Sources are `randomBetween` (inclusive) and `randomNumber(n)` (recorded as
`0..n-1`) — the two the licensed AVM1 build actually exposes — plus `unit`,
which is **placeholder-only** and has no AVM1 counterpart. A runtime-verified
rule set must not use it.

`state` and `cursor` (the number of draws consumed) are both authoritative: a
host and a client that agree on both have consumed the same ordered stream.
`rngJournal(battle)` is the ordered diagnostic record of every draw with its
label, bounds, value, and the turn/actor/action context; it is a diagnostic
side channel and is never part of a state hash.

## Controller identity and combatant identity

Three separate things:

- a **combatant** is a fighter — `id`, stats, loadout, health;
- a **seat** is the slot a combatant occupies — `"<teamId>:slot-<n>"`;
- a **controller** is whoever is driving that seat right now —
  `{ kind: "local" | "hot-seat" | "remote" | "ai", id, label }`.

`ControllerRegistry` maps seat → controller and nothing else. One team can mix
all four kinds. `reassignController(battle, seatId, controller)` hands a seat
over mid-battle without touching combat state, and `advanceAiTurns` follows the
*seat*, so handing a seat to the AI (a disconnect) or to a remote peer (a
reconnect) needs no combat code at all.

Two projections follow from that split:

| Projection | Contents | Use |
| --- | --- | --- |
| `toTeamWireState` / `combatStateHash` | combat state only, **no controller identity** | host-authoritative desync check |
| `toControllerState` | seat → controller | lobby, UI, transport |
| `toWireState` / `stateHash` (`src/engine.js`) | historical projection, *includes* the legacy `controller` string | pre-seam compatibility |

The combat hash excludes controller identity on purpose: a host and a client
that disagree about who is driving a seat must still agree on combat state, and
a reassignment must not look like a desync. The legacy engine hash keeps its
old behaviour and does change on reassignment.

The combat projection *does* include the settlement latch (armed / settled),
because a reconnecting or resuming client must agree with the host about
whether the campaign has already been paid. It excludes the RNG journal, which
is diagnostic only.

## AI fill

A team declares `slots: 1..3`. Any slot left empty — omitted, `null`, or
`{ fill: "ai" }` — is filled by `aiFillSource` and normalised through the same
`normaliseCombatant` as a supplied fighter, with its seat assigned to the AI
controller. An AI-filled fighter has the same shape, the same initiative
treatment, the same legal actions, and the same action protocol as any other.
The fill is pure: it consumes no RNG, so team size never perturbs a replay.

## Event and acknowledgement protocol

Ordered `battle.events`, each stamped `{ sequence, turn, ... }`:

| Event | When |
| --- | --- |
| rule-set action events | one or more per resolved action |
| `defeated` | a combatant went from standing to down — the combatant-defeated event |
| `team-eliminated` | every slot on a team is down |
| `battle-result-pending` | the battle is decided; carries `completionToken` |

An individual knockout emits `defeated` and **nothing else**: it does not end a
multi-slot battle and it never settles the campaign.

When a whole team goes down the resolver sets `battle.result`, emits
`team-eliminated` for each eliminated team, arms the settlement, and emits
`battle-result-pending`:

```json
{
  "type": "battle-result-pending",
  "status": "pending-animation",
  "completionToken": "team-arena:<winner>:<losers+>:<reason>",
  "winnerTeamId": "red",
  "loserTeamIds": ["blue"],
  "reason": "elimination"
}
```

The presentation layer plays the final animation and then returns

```json
{ "type": "battle-result-animation-complete", "completionToken": "<same token>" }
```

to `acknowledgeResultAnimation(battle, ack)`. The token is a pure function of
the outcome, so a replayed battle produces the same token and a host and client
can compare acknowledgements without extra state. This mirrors the 1v1 result
bridge in `src/golden/ss2-attack-candidate.js`.

## The settlement guarantee

Campaign settlement — rewards, roster and save writes — fires **exactly once**,
and only when both gates have passed:

1. an entire team is eliminated (the resolver arms the settlement), and
2. a matching `battle-result-animation-complete` acknowledgement arrives.

`acknowledgeResultAnimation` returns `true` on the acknowledgement that
actually settles and `false` for every repeat of the same token. An
acknowledgement before elimination, with a mismatched token, or with the wrong
shape throws `SettlementError`. The latch is set *before* the campaign callback
runs, so a throwing callback cannot leave the settlement re-fireable — the
caller sees the throw and the campaign is not paid twice. Re-arming a settled
battle throws.

The latch is a private field with no public setter and no reset. Settling twice
requires constructing a second `CampaignSettlement`, so the way to break this
guarantee is to build a new settlement (or a new battle) per acknowledgement,
or to call the campaign callback from anywhere other than
`CampaignSettlement.acknowledge`. Neither should ever be added.

---

# The SS2 adapter (`src/adapter/`)

Roadmap Stage 4. The adapter is the seam between the shared team resolver and
the vanilla presentation surface. Everything here is asset-free: vanilla
symbols are referenced by name and the licensed build's static map is cited by
section, nothing more.

## The boundary, in one rule

**The adapter converts state, dispatches presentation, and produces
acknowledgements. It does not decide combat.** There is no formula, no roll, no
threshold, and no damage arithmetic anywhere under `src/adapter/`. If a change
here starts computing an outcome, it belongs in a rule set.

That is enforced by module shape, not by convention:

| Guarantee | How it is structural |
| --- | --- |
| the adapter cannot invent a combat value | every vanilla field write is an **absolute assignment mirroring resolved canonical state**. `vanillaWritesForResolvedAction` reads the resolver's post-action projection; the effect list supplies only ordering and a reason. `to:` is never `before - effect.amount`. |
| presentation cannot mutate the battle | the only combat input `presentation.js` accepts is a plain `toTeamWireState(battle)` projection. A live battle is refused by shape (`assertCombatProjection`), so there is nothing there to mutate. Output is inert JSON command records — no callbacks, no clip handles. |
| the adapter cannot end a battle | `acknowledgement.js` can only observe the resolver's terminal `battle-result-pending`. It cannot arm settlement, choose a winner, or acknowledge a battle the resolver has not decided. |
| clip handles cannot enter deterministic state | `ClipRegistry` keeps handles in a private field, is never attached to a battle, and its `toJSON()` **throws**, so serialising anything that reaches one fails loudly instead of embedding it. |

## Module layout

| Module | Owns |
| --- | --- |
| `src/adapter/vanilla-fields.js` | the vanilla field catalogue, per-group battle-map citations, the undefined-until-set and clip-resident classifications, and `MAP_SILENCE` |
| `src/adapter/state-bridge.js` | vanilla state <-> canonical state, and resolved effects -> vanilla field writes |
| `src/adapter/slot-layout.js` | sides, slots, clip instances and depths, arena geometry, panel bindings, and the four vanilla binding globals |
| `src/adapter/clip-registry.js` | `clipByCombatantId`, structurally outside deterministic state |
| `src/adapter/presentation.js` | resolved events -> ordered presentation commands, and the animation binding tables |
| `src/adapter/acknowledgement.js` | the animation surface -> once-only campaign settlement |

The split follows the four things the adapter is responsible for. The
catalogue is separate from the bridge because it is *evidence* — a table of
names and citations — and mixing it with conversion logic is how citations rot.
The clip registry is separate from the layout because the layout is derived
from combat state (a host and a client compute the same one) while a handle
never is.

## State mapping

Canonical shape is `src/team/roster.js`'s `normaliseCombatant`. Citations are
sections of [the battle map](integration/ss2-battle-map.md).

| Canonical | Vanilla | Citation | Note |
| --- | --- | --- | --- |
| `health` | `hitpoints` | Live resources | |
| `maxHealth` | `hitpointsmax` | Live resources; `battlevalues` | The adapter reads it. Deriving it (`herolevel * 10 + vitality * 20`) is a formula, so `compareMaximumHealth` only *reports* disagreement with the rule set and never corrects either side. |
| `stats.strength` | `strength` | Base stats | |
| `stats.agility` | `speed` | Base stats | Name reconciliation only; no value is transformed. |
| `stats.attack` | `attack` | Base stats | |
| `stats.defense` | `defence` | Base stats | Spelling reconciliation only. |
| `stats.vitality` | `vitality` | Base stats | |
| `stats.stamina` | `stamina` | Base stats | |
| `stats.magicka` | `magicka` | Base stats | |
| `status[]` | `burning`, `frozen`, `poison`, `life_stolen`, `taunted1`, `taunted2` | Combatant state objects (runtime-observed 2026-08-30) | Canonical status tokens are the vanilla flag names **verbatim**; there is deliberately no translation table. |
| `name` | `character_name` | Identity/progression | |
| `loadout.*` | `min_damage`, `secondary_min_damage`, `using_bow`, `maximum_ammo`, `inventory1..6` | Derived combat; Spell and vanilla AI surface | **Placeholder-vocabulary bridge only.** See below. |
| — | `charisma` | Base stats | No canonical slot. Carried in the vanilla record. |
| — | `armourclass`, `armourclass_max` | Live resources; Hit and damage path | Deliberately **not** folded into `health`: the armour-first split is a formula (`damagecharacter` subtracts from `armourclass` first and carries only overflow into `hitpoints`). |
| — | everything else | Observed data fields | Passed through unchanged. |

Three fields get special treatment, each because the map says so.

**Undefined until set.** The persistent combat objects leave `burning`,
`frozen`, `poison`, `life_stolen`, `taunted1`, and `taunted2` **undefined**
until something sets them (runtime-observed 2026-08-30). Reading one on a
freshly constructed battle yields `undefined`, not `false`.
`normaliseVanillaCombatant` materialises all six to `false` — the same
normalisation the capture wrapper performs — and records which ones were absent
in `materialisedFlags`, so "never written" stays distinguishable from
"explicitly false". The first write to an absent flag therefore reports
`from: undefined` and `materialises: true`: it *creates* the field. An absent
flag and an explicitly-`false` flag produce identical canonical state, which is
a tested round-trip property.

**Clip-resident facing.** `gladiator_dir` does not live on the persistent
object at action time; the facing lives on the fighter clip. It is lifted out
of the combat object into a separate clip record, and `facingWrite` is the only
write the adapter ever aims at `_root.arena.gladiators.<instance>`. A facing
found on a combat object is accepted as a staging artefact (the 1v1 fixtures
fold the clip's facing into the scenario) and reported as `facingSource:
"combat-object"`. The clip wins when both are present.

**Totality.** Every own key of the source object survives the round trip,
including the timed `spell_*` fields the map declines to name and any key a
future build adds. Only the two rules above move anything.

### The loadout bridge is a placeholder, twice over

`loadout` in `src/team/roster.js` is placeholder-shaped
(`meleeDamage` / `rangedDamage` / `canUseRanged` / `canUseSpell` / `canHeal`)
because the placeholder rule set's vocabulary is placeholder. Vanilla has a
min/max damage pair, two weapon slots, ammunition, and six numbered inventory
items. `placeholderLoadoutFrom` is an ASSUMPTION serving the placeholder
vocabulary only; a runtime-verified rule set will read the vanilla record and
this function becomes dead. Nothing else in the adapter depends on it.

## The two-sided problem: a 3v3 on a two-sided surface

The vanilla surface has three two-sided things: two fighter clips (`hero` at
depth 301, `villain` at depth 300, with shadows at 298/299), two persistent
combat objects (`_root.game.hero` / `_root.game.villain`), and a `combat_panel`
whose named instances are all `hero_*` / `villain_*`.

The resolution is **not** to clone hero and villain per slot. The map warns
against exactly that, and it would break the original callbacks, which compare
a clip against `arena.gladiators.villain` or `.hero` by identity. The
resolution is that **the vanilla two-sided surface is a binding, not a
roster**:

- the combat controller "repeatedly binds the current pair into four globals" —
  `attacker` / `defender` (clips) and `game_attacker` / `game_defender` (state
  objects) — and the mapped combat functions take those as parameters
  (`attack_chances(game_attacker, game_defender)`,
  `damagecharacter(defender, attacker, game_defender, game_attacker, ...)`,
  `check_stats(game_defender)`);
- a 3v3 has six combatants but still exactly **one ordered (attacker, defender)
  pair per resolved action**. `bindingPlanFor` produces that pair from resolved
  state, so the original callbacks always target the right unit, whatever the
  team size. Four globals, always; never six clones.

Around that, the layout:

| Concern | Slot 0 of each side | Slots 1-2 |
| --- | --- | --- |
| clip instance | `hero` / `villain` — the vanilla names | `hero_ally_2`, `hero_ally_3`, `villain_ally_2`, `villain_ally_3` |
| depth | 301 / 300, shadows 298 / 299 — the vanilla depths | reserved band from 320, two depths per ally; asserted clear of every depth the map records (298-301, 25005, 40000, 40001) |
| position | `(-250, 200)` / `(250, 200)` — the vanilla placement, hero facing right, villain facing left | stepped outward by 130 and up-stage by 18 per slot, clamped to `nextphase`'s own `[-2100, 2100]` |
| panel | the six mapped `combat_panel` instances | authored per-slot widgets |
| campaign record | `_root.game.hero` / `_root.game.villain` | none — allies never multiply `_root.game.*` |

So 1v1 is byte-for-byte the vanilla arrangement and remains the parity gate,
and every combatant id maps to a distinct clip instance, depth, screen
position, and state path (tested for 1v1, 2v2, 3v3, and 1v3).

**Where combat state lives.** Every combatant, slot 0 included, is served from
the adapter's mirror under `_root.arena.team_arena.state.<side>_<n>`, and
`game_attacker` / `game_defender` bind there. The vanilla campaign objects are
read once when the battle is built and written back only at settlement, which
is what the roadmap's "campaign saves ... do not overwrite vanilla save fields
while the adapter is experimental" constraint requires. The mapped call sites
that read `_root.game.*` *directly* rather than through the globals are
construction (root frame 221 calls `skincharacter` with `_root.game.hero` and
`_root.game.villain`) and the reward path (arena frame 315 restores the hero) —
both outside the per-action loop, which is what makes this split safe.

**Which team is the hero side** is a parameter (`heroTeamId`, defaulting to the
first team). It is derived from the combat projection, so a host and a client
that agree on combat state compute the same layout.

## Event binding

`presentResolvedEvents(toTeamWireState(battle), { layout, bindings })` returns
ordered, JSON-safe presentation commands stamped with the resolver event
`sequence` they came from: `attach-clip`, `place-clip`, `bind-globals`,
`clip-goto`, `panel-refresh`, `overlay-goto`, `arena-goto`, and `unmapped`.
`createPresentationBinder` wraps it in a cursor so a host drains only new
commands after each action. The cursor holds a sequence number and nothing else.

Two rules matter more than the command vocabulary:

1. **An individual knockout plays a death animation and nothing else.** No
   overlay label, no arena label, no reward UI. Vanilla's `death()` jumps
   straight to `combatwon` / `combatlost` on the first knockout, which is
   exactly what a multi-slot battle must not do. The overlay and arena labels
   are emitted **only** for the terminal `battle-result-pending` event.
2. **Animation labels are injected, not owned.** The label vocabulary follows
   the rule set's action vocabulary, so `bindings` is a parameter.
   `PLACEHOLDER_ANIMATION_BINDINGS` serves the placeholder vocabulary;
   `SS2_STATIC_MAP_BINDINGS` serves the licensed build's vocabulary and is
   derived from the static map only.

Every emitted `clip-goto` carries a `labelProvenance` of `map-named`,
`assumed`, or `placeholder`. **None of them is ever `runtime-verified`**: the
promoted goldens verify the roll order, the mutation order, and the result
transition — no capture has ever observed a clip label.

## Result acknowledgement

The resolver arms settlement and emits `battle-result-pending` with a
completion token; `src/team/settlement.js` fires the campaign exactly once when
a matching `battle-result-animation-complete` returns.
`createResultAcknowledgementBridge` is what *produces* that acknowledgement
from the animation surface, and it is the only state machine in the adapter.

Two things make it more than a pass-through, and both are multi-slot concerns:

1. **The final animation is the last one, not the first.** A losing team can
   have three fighters and three death animations. The bridge waits for every
   eliminated fighter on the losing side to report before acknowledging, so the
   campaign is never paid over the top of an animation still playing. A death
   on the *winning* side is accepted and ignored — it played earlier.
2. **The animation surface must agree with resolved state.** The arena label
   the surface reached is checked against the label the resolved winner
   implies. `combat_won` reported for a battle the resolver decided the other
   way is a desync and is refused, not settled.

Refusals and repeats: reporting anything before elimination throws; an unknown
combatant id throws; a mismatched completion token throws; a repeated arena
label or death report returns `settled: false` with `alreadySettled: true`. The
bridge latches *before* submitting, mirroring `CampaignSettlement`, so a
throwing campaign callback cannot leave it able to fire again. A draw has no
vanilla transition (`death()` dispatches only `combatwon` or `combatlost`), so
it is reported as unmapped rather than guessed.

## Verified, static, assumed

| Claim | Status |
| --- | --- |
| the undefined-until-set status flags and clip-resident facing | **runtime-observed** 2026-08-30 (battle map, "Combatant state objects") |
| the promoted goldens in `test/fixtures/ss2-1v1-golden/` | **runtime-verified** — and they verify the ordered rolls, the mutation order, and the result transition, not any adapter mapping |
| field names, groups, clip names, depths, positions, panel instances, overlay/arena result labels, the four binding globals | **static map only** for the fingerprinted build |
| every clip *label* the adapter dispatches | **static map at best**; the ranged `hurtN` adjustment and the death-variant label names are `assumed` |
| the loadout bridge, the spell/heal inventory id sets | **assumption**, placeholder vocabulary only |
| multi-slot geometry, ally clip names, ally depths, ally panel widgets | **authored mod surface**; vanilla has no second ally, so no capture can settle it |

`MAP_SILENCE` in `src/adapter/vanilla-fields.js` is the machine-readable
version of this: seven entries, each naming the subject, the silence, what the
adapter does instead, and the capture that would settle it. A test asserts
every entry is complete and uniquely identified.

## Canonical-shape gaps this exposes

These are limits of `src/team/`, not of the adapter, and the adapter does not
work around them by inventing state:

1. **No SS2 field bag on a canonical combatant.** `normaliseCombatant` builds a
   fixed shape and `combatantProjection` projects a fixed key list, so armour,
   stamina, ammunition, equipment, charisma, the chance cache, and the
   inventory cannot enter the combat state hash. The adapter therefore keeps
   them in its mirror, and only `hitpoints`, `hitpointsmax`, and the six status
   flags are hash-covered today. This is the same gap the battle map's
   "Foundation gaps" section records.
2. **No `charisma` canonical stat**, which the whole taunt path reads.
3. **`normaliseCombatant` drops `source.status`**, so a gladiator who enters a
   battle already burning cannot express that through the roster.
   `initialStatusEffects` returns the declarative effects a future roster would
   need; applying them is resolver work.
4. **No armour effect kind.** `EffectKind` is `damage | heal | status`, so a
   verified rule set cannot express "this hit consumed 22 points of armour and
   spilled 3 into hitpoints" as effects. It would have to fold the split into a
   single `damage` amount and let the armour bookkeeping live outside
   deterministic state — which is exactly what should not happen.
5. **Facing is read but not carried.** `gladiator_dir` affects the knockback
   sign and the debris direction in the 1v1 candidate. It lives in the
   adapter's mirror, so a rule set that reads it would be reading something
   outside the state hash.

## Networking boundary

The engine exposes a JSON-safe state and action protocol. A future host should
be authoritative: clients submit `{ actorId, type, targetId, spellKind? }`, the
host validates and applies it, then broadcasts the event and the hash. Clients
never decide combat outcomes. Use `combatStateHash` for the authoritative
comparison — it is controller-independent, so seat reassignment, hot-seat
handover, and reconnects do not read as desyncs.

## First integration checkpoint

With a supplied licensed SS2 build, complete a 1v1 adapter first and compare it
with vanilla combat. Then render two static allies, progress to 2v2 with the
second ally controlled by AI, then enable 2v2 campaign co-op, 3v3 campaign
co-op, and remote clients. These stages share one verified resolver; 1v1 is a
parity gate, not the final scope.

The licensed build's read-only static map is now recorded in
[the SS2 battle map](integration/ss2-battle-map.md). Its formulas are evidence
for the 1v1 golden harness; they must not be injected as a runtime-verified
rule set until the observed roll and mutation order is verified end to end.

The isolated [golden harness](integration/ss2-golden-harness.md) now enforces
the build identity, candidate-versus-observed provenance, and exact named roll
order. The longer delivery sequence is tracked in [the roadmap](roadmap.md).

The state conversion, slot layout, event binding, and acknowledgement bridge
that checkpoint needs are implemented asset-free in `src/adapter/` and
specified in [The SS2 adapter](#the-ss2-adapter-srcadapter) above. What is
still missing before a playable mod is the runtime-verified rule set, the
campaign roster/save/reward integration, and the launcher route — none of which
the adapter may substitute for.
