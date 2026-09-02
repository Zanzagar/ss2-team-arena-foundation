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
seam and no verified rule set exists yet. Item 5 is implemented asset-free in
`src/campaign/` — see [campaign persistence](campaign-persistence.md) — with
one shortfall worth stating plainly: the record carries the roster, seats,
per-combatant survival, health, statuses, the initiative order, the seed and
the RNG cursor, but **not the event log**. Only the event sequence at which
each combatant was defeated survives (`src/campaign/from-battle.js`). Item 5's
second sentence — existing SS2 saves must remain readable — is met structurally
rather than carefully: `src/campaign/` contains no read path, no write path and
no field mapping for the vanilla save at all, so there is no function there to
call that could damage one. Item 2 is Stage 5 and is not started.

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
| `src/team/resources.js` | the open, clamped, projected per-combatant numeric bag |
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
a frozen clone: a rule set can read the battle but cannot reach into it. Each
combatant view is `{ id, name, teamId, seatId, slotIndex, aiFilled, stats,
loadout, resources, maxHealth, health, alive, status }` — every field of which
also appears in `combatantProjection`, and therefore inside `combatStateHash`.

`ActionOutcome` is `{ effects, events }`:

- `effects` are declarative and applied in order by the resolver:
  `{ kind: "damage" | "heal", targetId, amount }` with a non-negative finite
  amount; `{ kind: "status", targetId, status, active }`; or
  `{ kind: "resource", targetId, resource, to }`, an **absolute** write to one
  already-declared entry of the target's resource bag. The resolver clamps
  health to `[0, maxHealth]`, clamps a resource to its declared `[min, max]`,
  and recomputes `alive` — from `health` alone. A resource reaching zero means
  nothing to the resolver, deliberately: making a pool lethal is a combat rule.
- `events` are ordered semantic records with a `type`. The resolver stamps
  `sequence` and `turn`; a rule set that supplies either is rejected.

The action vocabulary is owned by the rule set precisely because the licensed
build's vocabulary (power, normal, quick, bash, taunt, bombard, snipe,
grievous) differs from the placeholder's (melee, ranged, spell, rest).

## Canonical resources

`src/team/resources.js` is the resolver's one open numeric bag, and it is what
lets a rule set read a per-combatant number the resolver does not itself
define — `armourclass`, `staminaleft`, `ammo_left`, `charisma`, an armour
piece's rating. Four constraints keep it from becoming an untyped grab-bag, and
each is enforced in code rather than asked for:

1. **numbers only** — a resource is a finite scalar; flags are `status`;
2. **declared at construction** — `normaliseResourceBag` fixes the *names* when
   the roster builds the combatant, and `writeResource` refuses a name nobody
   declared rather than creating one mid-battle;
3. **sorted** — the hash is `JSON.stringify` of the projection and JSON key
   order is insertion order, so two peers building the same bag from
   differently-ordered literals must not hash differently;
4. **written only through effects** — the rule set returns
   `{ kind: "resource", targetId, resource, to }` and the resolver performs and
   clamps the write.

`min` defaults to `0` and `max` to `null` (unbounded); both must be finite or
`null`. Bounds are a structural rail, not a game rule — a maximum that itself
moves during a battle is modelled as its own resource, exactly as vanilla
models `armourclass_max`, `staminamax` and `maximum_ammo` alongside the pools
they bound.

`health` is deliberately **not** a resource. It is the one number the resolver
interprets, it already has effects and clamping of its own, and two ways to
write it would be two ways to disagree about it. Its name is one of the twelve
in `RESERVED_RESOURCE_NAMES`, alongside every other combatant field the
resolver owns.

The resolver learns no SS2 noun from any of this. It learns one concept —
"clamped numeric pool" — and every name is supplied by the blueprint, the same
way the *values* of `stats` already are. That is the argument for a generic
`resource` effect over a bespoke `armour` one: a bespoke kind would put an SS2
noun inside the resolver and would need a sibling for stamina, another for
ammunition, and another for whatever a future rule set invents. An armour-first
damage split is therefore two ordered effects and no new concept: write the
pool down, then apply the overflow as damage.

The soundness property this exists to restore, and which
`test/team-resolver.test.js` pins: **everything a rule set can see, the
projection carries, and therefore the hash covers.** A value read through a
side channel is a value the hash cannot see, and two peers who disagree about
it would hash identically right up to the moment they diverge — which is the
one thing the hash exists to prevent.

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
- The resolver surfaces what it just applied. `lastResolvedAction(battle)`
  returns a frozen deep copy of `{ action, actorId, turn, firstEventSequence,
  effects, events, knockouts }` for the most recent action, and
  `applyActionWithOutcome(battle, action)` returns it in one call. It is
  *recorded, not projected*: `toTeamWireState` does not carry it and
  `combatStateHash` does not cover it, because the state those effects produced
  is already in the projection and hashing the derivation too would make a rule
  set's internal bookkeeping look like a desync. An integration that needs the
  declared effect order — the adapter does, to order its vanilla writes — can
  read it straight off the battle, and `battle-host.js` does: it injects the
  caller's rule set **undecorated** and takes the effect list from
  `lastResolvedAction(battle)`. The pass-through recorder that predated this
  (`createEffectRecordingRuleSet`) is deleted, so every write is attributed
  with no opt-in and `host.battle.rules` is the object the caller passed —
  which is also what `describeTeamRuleSet` and the wire state report on.

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
rule set must not use it. That last rule is a **convention the seam does not
enforce**: `observableRollSources()` names the two observable sources but
nothing calls it, and neither `assertTeamRuleSet` nor the channel refuses a
`unit` draw from a rule set claiming `runtime-verified`. The first verified
rule set should come with a test that closes this, or the gate should learn to
reject a `unit` draw at the channel.

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
  "completionToken": "team-arena:<winner>:<losers+>:<reason>:<battle discriminator>",
  "winnerTeamId": "red",
  "loserTeamIds": ["blue"],
  "reason": "elimination"
}
```

The presentation layer plays the final animation and then returns

```json
{ "type": "battle-result-animation-complete", "completionToken": "<same token>" }
```

to `acknowledgeResultAnimation(battle, ack)`.

### The token names one battle, not one result

The token is `<outcome prefix>:<battle discriminator>`, built by
`completionTokenFor` in `src/team/settlement.js`.

- `outcomeTokenPrefix({ winnerTeamId, loserTeamIds, reason })` is the outcome
  half — `team-arena:<winner>:<losers+>:<reason>`, with `none` standing in for a
  draw's null winner and sorted, `+`-joined loser ids. This is what the whole
  token used to be.
- The battle half is `combatStateHash(battle)`: eight lowercase hex digits,
  pinned by `BATTLE_DISCRIMINATOR_PATTERN` so a counter, a timestamp or a random
  string cannot be smuggled in as one.

`checkResult` in `src/team/resolver.js` reads that hash at one specific moment —
**after** `battle.result` is set and every `team-eliminated` event is on the
battle, and **before** `settlement.arm()`. Late enough that the discriminator
covers the whole terminal state (seed, RNG cursor, rosters, healths, statuses,
initiative, turn number and the entire ordered event log); early enough that the
hash cannot see the token it is about to go into, because
`toTeamWireState` carries `settlement.toJSON()` and that is still the unarmed
constant at that line.

`arm()` **requires** the discriminator (`assertBattleDiscriminator`) rather than
defaulting it. A default would silently restore the defect for whichever caller
forgot it, and the caller that forgets is exactly the one settling the wrong
bout.

The purity survives the change; what it is pure *in* does not. The token is a
pure function of the outcome **of one particular battle**: both halves are
derived, never counted and never drawn, so a replayed battle still produces the
same token and a host and client can still compare acknowledgements without
extra state. What they can no longer do is find the *wrong bout's*
acknowledgement acceptable. The old defect — a campaign of consecutive bouts
between the same two teams handing every bout the same token, so bout 1's
acknowledgement satisfied bout 2's second gate and settled it with bout 1's
winner — is **closed**.

One residual is deliberate rather than a defect: two bouts with an identical
blueprint *and* an identical action stream still share a token. They are the
same battle by every observable the projection carries.

Two readers of the token, each reading a different half:

- `battleDiscriminatorOf(token)` returns the battle half, read from the last
  colon rather than by splitting, because a team id may contain a colon and a
  discriminator never can;
- `completionTokenMatchesOutcome(token, outcome)` checks the outcome half and
  asserts only that *some* well-shaped discriminator follows. It deliberately
  does not say which battle: a reader holding a finished record cannot recompute
  an arm-time state hash.

This mirrors the 1v1 result bridge in `src/golden/ss2-attack-candidate.js`.

## The settlement guarantee

Campaign settlement — rewards, roster and save writes — fires **exactly once**,
and only when both gates have passed:

1. an entire team is eliminated (the resolver arms the settlement), and
2. a matching `battle-result-animation-complete` acknowledgement arrives.

`arm(outcome)` takes `{ winnerTeamId, loserTeamIds, reason, battleDiscriminator }`
and **requires all four**; an outcome with no discriminator throws
`SettlementError` rather than defaulting to a result-only token. The
discriminator is folded into the token and kept nowhere else, so the settlement
record's public shape is unchanged — `src/campaign/from-battle.js`, the adapter
bridge and the pending event all still see the same five fields.

`acknowledgeResultAnimation` returns `true` on the acknowledgement that
actually settles and `false` for every repeat of the same token. An
acknowledgement before elimination, with a mismatched token, or with the wrong
shape throws `SettlementError`. The latch is set *before* the campaign callback
runs, so a throwing callback cannot leave the settlement re-fireable — the
caller sees the throw and the campaign is not paid twice. Re-arming a settled
battle throws, and re-arming an armed battle with a *different* token throws
too.

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
| the adapter cannot invent a combat value | **`WriteSource`, `ALLOWED_WRITE_FIELDS` and `assertWriteProvenance`** — see [write provenance](#write-provenance-the-mechanism-not-the-convention) below. |
| presentation cannot mutate the battle | the only combat input `presentation.js` accepts is a plain `toTeamWireState(battle)` projection. A live battle is refused by shape (`assertCombatProjection`), so there is nothing there to mutate. Output is inert JSON command records — no callbacks, no clip handles. |
| the adapter cannot end a battle | `acknowledgement.js` can only observe the resolver's terminal `battle-result-pending`. It cannot arm settlement, choose a winner, or acknowledge a battle the resolver has not decided. |
| clip handles cannot enter deterministic state | `ClipRegistry` keeps handles in a private field, is never attached to a battle, and its `toJSON()` **throws**, so serialising anything that reaches one fails loudly instead of embedding it. |

### Write provenance: the mechanism, not the convention

The first row of that table used to describe a *property of the code*: every
write in `vanillaWritesForResolvedAction` happened to read the post-action
projection rather than compute a value. Nothing checked it. An adversarial audit
applied **five** separate combat-deciding edits to `state-bridge.js` — including
a `staminaleft` write computed as `before - ceil(amount * 1.5)`, exactly the
shape this document forbade in prose — and the whole suite stayed green, because
no test drove a heal, a rest, a ranged attack, a spell, a `STATUS` effect or a
`RESOURCE` effect through the host at all. All five are caught now, and they are
caught by a mechanism rather than by a bigger comment.

Three named things in `src/adapter/state-bridge.js` carry it:

| Name | What it is |
| --- | --- |
| `WriteSource` | a closed set of exactly four values — `canonical-health`, `canonical-status`, `declared-resource`, `clip-facing`. Every write must name one. `fieldWrite` refuses a write that names none, because "a write with no declared source is a write with no evidence that the resolver produced its value." |
| `ALLOWED_WRITE_FIELDS` | which vanilla fields each source may target, **fixed here and independent of any scenario**: `hitpoints` for canonical health, the six status flags for canonical status, `CANONICAL_RESOURCE_SOURCES` for a declared resource (plus the timed `spell_*` pools, via `isResourceBackedVanillaField`), `gladiator_dir` for the clip facing. A parallel table pins each source to one of the two write targets, so a combat-object source cannot aim at a clip or the reverse. |
| `assertWriteProvenance(writes, after)` | the check. For each write the source names exactly one place in the post-action projection, and `write.to` must be `===` what is there: `projection.health`, `projection.status.includes(field)`, or `projection.resources[field].value`. Not "close to", not "derivable from" — identical. |

That is what a prose rule could never give. `to: before - effect.amount` reads
plausibly and passes review; a value computed anywhere in the module has no
canonical location to be identical to, so it fails by construction. And the
check walks the produced list rather than trusting how it was built, so a write
pushed straight onto the array without going through `fieldWrite` is caught too.
`vanillaWritesForResolvedAction` runs it as its own final step before returning.

`clip-facing` is the one source with no canonical counterpart — the facing is
presentation, not combat state — so it is checked against the closed
`FACING_VALUES` vocabulary instead.

A declared resource may never name a field another source already owns
(`RESOURCE_RESERVED_FIELDS`: `hitpoints`, `hitpointsmax`, the six status flags,
and `gladiator_dir`). Without that, the resource branch could forge a health or
status write with a number canonical health never produced.

The effect list still supplies only the *ordering* and the *reason*. The adapter
can misattribute a reason; it structurally cannot produce a combat value the
resolver did not already decide and clamp — which for a resource means `after`'s
value and never `effect.to`, so a `to` the resolver clamped lands on the clamped
number rather than on the number the rule set asked for.

**The read side has the same discipline**, and it needed it: a write-shape
argument covers nothing that enters canonical state in the first place.
`toCanonicalCombatantSource` **throws** for a vanilla record missing a base
stat rather than defaulting it — reading an absent `defence` as 0 is the adapter
picking a combat input, and the choice would be invisible afterwards because
canonical state carries no record that a number was made up. For the same
reason it emits only the `loadout` keys a named vanilla field answers; see
[the loadout bridge](#the-loadout-bridge-is-a-placeholder-twice-over).

## Module layout

| Module | Owns |
| --- | --- |
| `src/adapter/vanilla-fields.js` | the vanilla field catalogue, per-group battle-map citations, the undefined-until-set and clip-resident classifications, and `MAP_SILENCE` |
| `src/adapter/state-bridge.js` | vanilla state <-> canonical state, and resolved effects -> vanilla field writes |
| `src/adapter/slot-layout.js` | sides, slots, clip instances and depths, arena geometry, panel bindings, and the four vanilla binding globals |
| `src/adapter/clip-registry.js` | `clipByCombatantId`, structurally outside deterministic state |
| `src/adapter/presentation.js` | resolved events -> ordered presentation commands, and the animation binding tables |
| `src/adapter/acknowledgement.js` | the animation surface -> once-only campaign settlement |
| `src/adapter/battle-host.js` | the reference host loop that drives both seams together |
| `src/adapter/index.js` | barrel; re-exports the seven modules above |

`battle-host.js` is not a fifth responsibility — it is the two seams driven
as one thing, which is what a real mod would be: read vanilla combat objects,
build a team battle, submit one action, mirror the resolved action back into
vanilla field writes and presentation commands, acknowledge the result
animation. Its ordered pipeline is exported as `HOST_PIPELINE` and is
**identical for 1v1, 2v2 and 3v3**: one resolver call and one adapter
conversion per action whatever the team size, with only the number of
combatants the conversion covers changing. It decides no combat; its own
arithmetic is array indices.

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
| `maxHealth` | `hitpointsmax` | Live resources; `battlevalues` | The adapter reads it. Deriving it (`herolevel * 10 + vitality * 20`) is a formula, so `compareMaximumHealth` only *reports* disagreement with the rule set and never corrects either side. See [maximum health](#maximum-health-reported-refused-never-quietly-rewritten) — that sentence was false when it was written and is true now. |
| `stats.strength` | `strength` | Base stats | |
| `stats.agility` | `speed` | Base stats | Name reconciliation only; no value is transformed. |
| `stats.attack` | `attack` | Base stats | |
| `stats.defense` | `defence` | Base stats | Spelling reconciliation only. |
| `stats.vitality` | `vitality` | Base stats | |
| `stats.stamina` | `stamina` | Base stats | |
| `stats.magicka` | `magicka` | Base stats | |
| `status[]` | `burning`, `frozen`, `poison`, `life_stolen`, `taunted1`, `taunted2` | Combatant state objects (runtime-observed 2026-08-30) | Canonical status tokens are the vanilla flag names **verbatim**; there is deliberately no translation table. |
| `name` | `character_name` | Identity/progression | |
| `loadout.*` | `min_damage`, `secondary_min_damage`, `using_bow`, `maximum_ammo` | Derived combat | **Placeholder-vocabulary bridge only, and only the keys a named vanilla field answers.** The conversion no longer reads `inventory1..6` and no longer emits `canUseSpell`/`canHeal` at all. See [the loadout bridge](#the-loadout-bridge-is-a-placeholder-twice-over). |
| `resources.charisma` | `charisma` | Base stats | There is no canonical *stat* named charisma and there should not be. It is a declared **resource** instead — projected, hashed, and writable by an absolute `resource` effect. |
| `resources.armourclass`, `resources.armourclass_max` | `armourclass`, `armourclass_max` | Live resources; Hit and damage path | Emitted as declared resources, and still deliberately **not** folded into `health`: the armour-first split is a formula (`damagecharacter` subtracts from `armourclass` first and carries only overflow into `hitpoints`), so it stays rule-set work. The adapter carries the pool; a rule set moves it. |
| the other seventeen `resources.*` | `ammo_left`, `maximum_ammo`, `staminaleft`, `staminamax`, the eight `*_defence` piece ratings, and the five enchantment fields | Live resources; Armour; Primary weapon; Secondary weapon; Derived combat | `toCanonicalCombatantSource` emits a **twenty-entry** resource bag in total. See [the resource bag](#the-resource-bag-the-adapter-emits). |
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

### Maximum health: reported, refused, never quietly rewritten

The table above says `compareMaximumHealth` "only *reports* disagreement with
the rule set and never corrects either side." **That sentence was false when it
was first written.** `toVanillaCombatant` wrote `hitpointsmax` from canonical
`maxHealth` on every sync, so `battle-host.js` construction silently pushed a
*placeholder* formula's answer over a licensed gladiator's own maximum health,
and `compareMaximumHealth` reported a disagreement the code had already erased.
It is true now, and three separate changes make it true:

1. **`toVanillaCombatant` no longer writes `hitpointsmax` by default.** It is
   behind an explicit `{ maxHealth: true }` option; the same gate now covers the
   seven base stats behind `{ stats: true }`.
2. **The host refuses rather than corrects.** For a *supplied* gladiator, if
   `record.fields.hitpointsmax` disagrees with `combatant.maxHealth`,
   `battle-host.js` throws `BattleHostError` naming both numbers and
   `diagnostics.maximumHealthReports`. A supplied gladiator's `hitpointsmax` is
   licensed evidence; `battlevalues` is a vanilla formula, so writing a rule
   set's answer over it is rule-set work leaking into the adapter.
3. **It opts in for exactly one case.** An AI-filled slot passes
   `{ maxHealth: true, stats: true }`, because there is no licensed record to
   overwrite — `src/team/roster.js` invented the fighter from `team.aiFill`, and
   the mirror's job is to describe *that* fighter rather than the gladiator the
   caller's template was copied from. Every rewrite is reported as
   `diagnostics.aiFillMirrorRewrites`, and what is left over — the template's
   weapon fields, which have no single-number canonical counterpart — as
   `diagnostics.aiFillLoadoutGaps` rather than guessed at.

`mirrorDifferences` compares `hitpointsmax` in both cases, so the disagreement
cannot go unseen in either direction.

### The resource bag the adapter emits

`CANONICAL_RESOURCE_SOURCES` in `src/adapter/state-bridge.js` is the list, and
it has **twenty** entries in four groups. The names are the vanilla field names
**verbatim**, exactly as the status tokens are — an invented resource
vocabulary is one more table that can be mapped wrongly.

| Group | Names |
| --- | --- |
| Live resources | `ammo_left`, `armourclass`, `armourclass_max`, `maximum_ammo`, `staminaleft`, `staminamax` |
| Base stats | `charisma` |
| Armour (per-piece ratings) | `boot_defence`, `breastplate_defence`, `gauntlet_defence`, `greaves_defence`, `helmet_defence`, `shield_defence`, `shinguard_defence`, `shoulderguard_defence` |
| Enchantments | `weapon_enchantment_damage`, `weapon_enchantment_potency`, `weapon_enchantment_type`, `secondary_weapon_enchantment_potency`, `secondary_weapon_enchantment_type` |

Every name is one `VANILLA_FIELD_GROUPS` already carries a citation for, and a
test asserts that, so the list cannot drift away from the catalogue.

**Every converted combatant declares the identical set**, whichever side of the
vanilla binding it lands on. That is not tidiness. The hero/villain surface is
a binding rebound per action, not a roster, so any combatant can be
`game_attacker` on one action and `game_defender` on the next — and the
resolver refuses a write to a resource that combatant did not declare. A set
declared on one side only would make a rule set's armour write succeed or throw
depending on whose turn it was.

Absent fields are materialised to `0`, the same normalisation the six
undefined-until-set status flags get, and `toCanonicalCombatantSource` reports
which ones as `defaultedResources` — so "never written" stays distinguishable
from "explicitly zero". Symmetrically, `toVanillaCombatant` writes a resource
back only where it actually *differs*: writing all twenty unconditionally would
**create** a field on a combat object that never carried one, which is
inventing vanilla state rather than mirroring it.

#### Three judgement calls, recorded so they can be overruled

1. **The three maxima are resources of their own.** `armourclass_max`,
   `staminamax` and `maximum_ammo` are declared alongside the pools they bound
   rather than folded into those pools' `max`. This follows
   `src/team/resources.js` in as many words: a maximum that itself moves during
   a battle is its own resource. `remove_armour` moves `armourclass_max`
   mid-battle, so a frozen bound would be wrong within one action of a
   destroyed piece.
2. **Armour PIECE IDS are excluded.** The eight per-piece *ratings* are
   resources; the piece identities are equipment identity, not a numeric pool,
   and stay in the vanilla record. A future `remove_armour` rule set — which
   has to know *which* piece was destroyed, not only that armour fell — will
   need this list to grow, and that growth is the point at which the exclusion
   should be re-argued rather than assumed.
3. **Every resource declares `min: null, max: null`.** A bound is a rail the
   *blueprint* asserts, and the adapter has no evidence for one. Declaring
   `min: 0` on `armourclass` would be the adapter asserting what happens when
   damage exceeds armour — which is exactly the armour-first split the map
   records as a formula, and therefore rule-set work. Declaring no bound also
   guarantees the value round-trips untouched, since `normaliseResourceBag`
   clamps on the way in and a clamp here would be the adapter quietly
   rewriting a vanilla field. Note that this is a deliberate *departure* from
   the resolver's own default, which is `min: 0`.

#### One resolver limitation the host reports rather than papers over

`src/team/roster.js` builds an AI-filled slot from `team.aiFill` — **one
template per team, not one per slot**. A supplied gladiator gets its bag from
its own combat object; a filled slot has to get one from the caller's template,
and there is only one place to put it. So when two slots on one team are filled
from templates that disagree about their canonical resources, there is nowhere
to put the second bag.

`battle-host.js` reports that as `diagnostics.aiFillResourceGaps` — one entry
per affected team, naming the team and the reason — and declares **no**
resources on those filled slots rather than guessing which template wins. A
guess would put an invented number inside `combatStateHash`, which is the one
thing the hash exists to prevent. The consequence is concrete and worth
knowing: a rule set's write to a resource on such a slot will be refused by the
resolver. The remedies are to supply real gladiators, matching templates, or an
explicit `aiFill.resources`. Closing it properly needs a per-slot fill source
from the roster, which is `src/team/` work, not adapter work.

### The loadout bridge is a placeholder, twice over

`loadout` in `src/team/roster.js` is placeholder-shaped
(`meleeDamage` / `rangedDamage` / `canUseRanged` / `canUseSpell` / `canHeal`)
because the placeholder rule set's vocabulary is placeholder. Vanilla has a
min/max damage pair, two weapon slots, ammunition, and six numbered inventory
items. `placeholderLoadoutFrom` is an ASSUMPTION serving the placeholder
vocabulary only; a runtime-verified rule set will read the vanilla record and
this function becomes dead. Nothing else in the adapter depends on it.

**The conversion no longer uses it.** `placeholderLoadoutFrom` answered all five
keys unconditionally, so the adapter's answer always beat
`roster.normaliseCombatant`'s own default — including where the two disagreed in
opposite directions. `canUseSpell` / `canHeal` default to `stats.magicka > 0` in
the roster, so a gladiator with 20 magicka and an empty inventory came out
unable to cast, and one with 0 magicka holding a scroll came out able to. That
is the adapter deciding combat on the *read* side, which the write-shape
argument never covered.

`toCanonicalCombatantSource` now calls `vanillaBackedLoadout`, which emits a key
only where a named vanilla field carries the answer and stays silent otherwise:

| key | vanilla evidence | absent ⇒ |
| --- | --- | --- |
| `meleeDamage` | `min_damage` | omitted; the roster's default stands |
| `rangedDamage` | `secondary_min_damage` **only** — the old fallback to `min_damage` silently equated ranged with melee for every gladiator without a second weapon | omitted |
| `canUseRanged` | `using_bow` or `maximum_ammo` | omitted |
| `canUseSpell` | none: the inventory id sets were the adapter's own decision labels, not a vanilla field | **always** omitted |
| `canHeal` | none, likewise | **always** omitted |

So `inventory1..6` is no longer read by the conversion at all, and the two spell
keys are never emitted. The omissions are reported as `omittedLoadoutKeys` on
the returned source. A caller that genuinely wants the whole placeholder bridge
passes it explicitly as `options.loadout`. `LOADOUT_SOURCE_FIELDS` still lists
the six inventory slots because it names the vanilla fields the loadout *could*
be read from for reporting; `loadoutMirrorDifferences` compares only
`min_damage`, `secondary_min_damage` and `using_bow`/`maximum_ammo`.

The `min_damage`-as-melee-base reading is still an assumption of the placeholder
vocabulary. What changed is that an assumption the vanilla record cannot support
is no longer stated at all.

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
  team size. Never six clones — the same four globals however many fighters are
  on the field.

**Four globals is not "always four *bound* globals".** A self-targeted action —
the placeholder vocabulary's `rest` is one, and it is legal — has no defender,
so `bindingPlanFor` names none: `attacker` and `game_attacker` are bound,
`defender` and `game_defender` are `null`, and the plan carries
`selfTargeted: true` plus an `unmapped` string saying why. The whole binding
argument rests on the mapped functions taking these four as *distinct*
parameters (`damagecharacter(defender, attacker, game_defender, game_attacker,
...)`, `attack_chances(game_attacker, game_defender)`); binding one unit to both
sides is not a pair, it is one unit passed twice, and a mapped function that
reads and writes both parameters would be aliasing it. A host must leave the
previous binding alone rather than point it at the actor.

Around that, the layout:

| Concern | Slot 0 of each side | Slots 1-2 |
| --- | --- | --- |
| clip instance | `hero` / `villain` — the vanilla names | `hero_ally_2`, `hero_ally_3`, `villain_ally_2`, `villain_ally_3` |
| depth | 301 / 300, shadows 298 / 299 — the vanilla depths | reserved band from 320, two depths per ally; asserted clear of every depth the map records (298-301, 25005, 40000, 40001) |
| position | `(-250, 200)` / `(250, 200)` — the vanilla placement, hero facing right, villain facing left | stepped outward by 130 and up-stage by 18 per slot, clamped to `nextphase`'s own `[-2100, 2100]` |
| panel | under `arena.combat_panel`: the three map-named instances per side (`<side>_armour`, `<side>_potion`, `<side>_stamina_potion`, six in total). The health and stamina widgets are addressed by **role** with `instanceName: null`, because the map's UI table names no instance for them and a guessed name is worse than none | authored per-slot widgets, `mapNamed: false` throughout |
| campaign record | `_root.game.hero` / `_root.game.villain` | none — allies never multiply `_root.game.*` |

So 1v1 is byte-for-byte the vanilla arrangement and remains the parity gate,
and every combatant id maps to a distinct clip instance, depth, screen
position, and state path (tested for 1v1, 2v2, 3v3, and 1v3).

**Where combat state lives.** Every combatant, slot 0 included, is served from
the adapter's mirror under `_root.arena.team_arena.state.<side>_<n>`
(`ADAPTER_STATE_ROOT`, an authored scratch root, not a vanilla path), and
`game_attacker` / `game_defender` bind there. The intent is that the vanilla
campaign objects are read once when the battle is built and written back only
at settlement, which is what the roadmap's "campaign saves ... do not overwrite
vanilla save fields while the adapter is experimental" constraint requires.
**Only the first half of that is implemented.** A placement carries
`vanillaCampaignObjectPath` (`_root.game.<side>` for slot 0, `null` for every
ally, because the map warns against multiplying those objects), but nothing in
`src/adapter/` reads or writes it: `battle-host.js` takes the vanilla combat
objects from its caller and never names `_root.game.*`, and there is no
settlement write-back path anywhere in the tree. So no vanilla save field is
written mid-battle — which is the property that matters — but the write-back
that would eventually pay a campaign out is a declared path and nothing more.
The mapped call sites
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
   are emitted **only** for the terminal `battle-result-pending` event — and
   for a draw they are not emitted at all: the command is an `unmapped` record
   naming the missing transition, and carrying `acknowledgedBy` so the record
   itself says what stands in for it (see [result
   acknowledgement](#result-acknowledgement)).
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

Three things make it more than a pass-through, and all three are concerns
vanilla's own `death()` has no answer for:

1. **The final animation is the last one, not the first.** A losing team can
   have three fighters and three death animations. The bridge waits for every
   eliminated fighter on the losing side to report before acknowledging, so the
   campaign is never paid over the top of an animation still playing. A death
   on the *winning* side is accepted and ignored — it played earlier. A death
   reported for a fighter who is **still standing in resolved state is refused**:
   the reason a winning-side death is accepted is that it played earlier, which
   is a claim about someone the resolver knocked down. Membership used to be the
   only thing `reportDeathAnimation` checked, so any live combatant's id counted
   as a death.
2. **The animation surface must agree with resolved state.** The arena label
   the surface reached is checked against the label the resolved winner
   implies. `combat_won` reported for a battle the resolver decided the other
   way is a desync and is refused, not settled.
3. **A draw is acknowledged by the death animations alone.** The resolver
   produces draws and settles them on its own two gates — `battleStanding`
   reports `reason: "draw"` with `winnerTeamId: null` when both teams go down
   on the same action, `checkResult` arms the settlement, and
   `acknowledgeResultAnimation` accepts the matching token. Vanilla has no draw
   transition to report back: `resultLabelsFor(layout, null)` returns
   `{ overlayLabel: null, arenaLabel: null, unmapped: "vanilla has no draw
   transition: death() dispatches only combatwon or combatlost",
   acknowledgedBy: "the completed death animations; the last one settles the
   campaign" }`. So the bridge does not wait for one. In a draw there is no
   winning side, **every** fighter is awaited, and the last death animation to
   report settles the campaign through the resolver's own gate.

Refusals and repeats: reporting anything before elimination throws; an unknown
combatant id throws; a death for a living combatant throws; a mismatched
completion token throws; a repeat is answered with `counted: false` and
`duplicate: true`, and once the bridge has settled every further report returns
`settled: false` with `alreadySettled: true`. The bridge latches *before*
submitting, mirroring `CampaignSettlement`, so a throwing campaign callback
cannot leave it able to fire again.

`expectsArenaLabel` is what a caller draining the animation surface should
read; it is false exactly for a draw, and `unmappedArenaTransition` says why. A
null `expectedArenaLabel` is a draw, not an error.

### `host.acknowledgeResultAnimations()` supplies nothing

This is the batch form of `bridge.reportDeathAnimation` /
`bridge.reportArenaLabel` and it grants no extra authority. **Everything is the
caller's to supply, and nothing is defaulted:**

| parameter | required | what it is |
| --- | --- | --- |
| `deaths` | **always** | the combatant ids whose death animation the surface reported |
| `completionToken` | **always** | the token the `arena-goto` / `overlay-goto` command carried (a draw's `unmapped` command carries it too) |
| `arenaLabel` | for every non-draw | the label the arena timeline actually reached |

It used to fabricate a death report for every awaiting fighter and then hand the
bridge `arenaLabel ?? this.#bridge.expectedArenaLabel` — the label the bridge
itself was waiting for. **Both documented settlement gates were therefore
satisfied by the adapter talking to itself**: a lethal action followed by a bare
`acknowledgeResultAnimations()` settled the campaign with zero input from any
animation surface, and the desync check in point 2 above had nothing independent
to compare against. A convenience that supplies the evidence it is meant to be
checking is not a convenience.

**The token is verified before the deaths, for every result** — not only for a
draw. In a draw the last death is what settles, so a token checked afterwards
would be checked too late; checking it first for every result costs nothing and
removes the special case. Reading the token back off the bridge is exactly what
is refused, because it would compare the bridge with itself.

**A draw stops after the deaths.** Vanilla dispatches no draw transition, so the
completed death animations are the entire acknowledgement. Passing an
`arenaLabel` for one is still reported to the bridge, and still refused.

Reporting an arena label for a draw is still **refused**. That is not the old
gap surviving in a new place: a surface that reached `combat_won` for a battle
the resolver called a draw disagrees with resolved state, which is a desync
like any other. The two alternatives were both worse — inventing an arena label
would make the adapter decide an outcome vanilla never dispatches, and refusing
to settle would leave a decided battle that can never pay its campaign.

## Verified, static, assumed

| Claim | Status |
| --- | --- |
| the undefined-until-set status flags and clip-resident facing | **runtime-observed** 2026-08-30 (battle map, "Combatant state objects") |
| the 22 promoted goldens in `test/fixtures/ss2-1v1-golden/` | **runtime-verified** — and they verify the ordered rolls, the mutation order, and the result transition, not any adapter mapping. No golden observes anything the adapter does. |
| field names, groups, clip names, depths, positions, panel instances, overlay/arena result labels, the four binding globals | **static map only** for the fingerprinted build |
| every clip *label* the adapter dispatches | **static map at best**; the ranged `hurtN` adjustment and the death-variant label names are `assumed` |
| the loadout bridge, the spell/heal inventory id sets | **assumption**, placeholder vocabulary only — and no longer on the conversion path. `toCanonicalCombatantSource` emits only the vanilla-backed keys; the inventory id sets survive in `placeholderLoadoutFrom`, which nothing calls unless a caller passes it as `options.loadout`. |
| multi-slot geometry, ally clip names, ally depths, ally panel widgets | **authored mod surface**; vanilla has no second ally, so no capture can settle it |

`MAP_SILENCE` in `src/adapter/vanilla-fields.js` is the machine-readable
version of this: seven entries, each naming the subject, the silence, what the
adapter does instead, and the capture that would settle it. A test asserts
every entry is complete and uniquely identified.

## Canonical-shape gaps this exposes

This section used to list five limits of `src/team/`. Four of them closed in
`src/team/`, and the fifth — that the adapter used none of it — closed in
`src/adapter/`. What follows separates what was fixed from what genuinely
remains, because conflating them is how a document keeps apologising for a gap
that was closed two commits ago.

### Closed

| Was | What closed it |
| --- | --- |
| **No SS2 field bag on a canonical combatant** — armour, stamina, ammunition, charisma and the chance cache could not enter the combat state hash | `src/team/resources.js`. A combatant declares a named, bounded numeric bag at construction; `combatantView` exposes it and `combatantProjection` carries it, so it is inside `combatStateHash`. Names are the blueprint's, not the resolver's. |
| **No `charisma` canonical stat**, which the whole taunt path reads | the same module. `charisma` is a resource, not a stat — which is the right shape for it: `DEFAULT_STATS` is the placeholder vocabulary's seven, and a verified rule set has no reason to grow it. |
| **`normaliseCombatant` drops `source.status`**, so a gladiator entering already burning could not express it | `normaliseStatus` in `src/team/roster.js`, which carries `source.status` through in declaration order, deduplicated, and refuses a malformed list. The adapter's `initialStatusEffects` is now redundant for this purpose: `toCanonicalCombatantSource` already emits `status`, and the roster now honours it. `battle-host.js` has since caught up: the diagnostic is `diagnostics.startingStatusEffects`, and both the old name (`unappliedInitialStatusEffects`) and the comment that justified it ("`normaliseCombatant` hard-codes `status: []`") are gone. It describes a starting state that is **already applied**; a caller who trusted the old name and applied the list would have set a status the fighter already had. A test asserts the old key is absent from `host.diagnostics`. |
| **No armour effect kind** — a verified rule set could not express "this hit consumed 22 points of armour and spilled 3 into hitpoints" | `EffectKind.RESOURCE`. An armour-first split is two ordered effects — write the pool down absolutely, then apply the overflow as damage — and the resolver applies exactly that, in exactly that order, without knowing what "armour" is. |
| **The adapter used none of it** — `toCanonicalCombatantSource` emitted no bag and `vanillaWritesForResolvedAction` had no `RESOURCE` branch, so armour, stamina, ammunition, charisma and the eight piece ratings lived only in the vanilla mirror, outside the hash | `adeb05e`, both halves together, because the resolver refuses a write to an undeclared resource by design. `toCanonicalCombatantSource` emits the twenty-entry bag on **both** sides of the vanilla binding, and `vanillaWritesForResolvedAction` gained the `RESOURCE` branch, so a write reaches `armourclass` — with the value taken from the post-action projection, never from `effect.to`. See [the resource bag](#the-resource-bag-the-adapter-emits). |

### Still open

1. **AI-filled slots get one resource bag per team, not per slot.**
   `src/team/roster.js` carries a single `aiFill` template per team, so two
   filled slots on one team whose templates disagree cannot both get a bag.
   `battle-host.js` reports `diagnostics.aiFillResourceGaps` and declares none
   rather than guessing a number into the state hash. This is the one gap the
   resource work left, and closing it is `src/team/` work: a per-slot fill
   source from the roster.
2. **Resources are numbers, so not everything vanilla carries has a home.**
   `normaliseResourceBag` accepts finite scalars only. Numeric pools fit;
   equipment identity does not — the **armour piece ids**, the six numbered
   inventory slots read as *ids* rather than pools, and the placeholder
   `loadout` shape all stay in the vanilla record. That is a deliberate line —
   anything needing structure is the rule set's own static configuration and is
   not per-combatant battle state — but it has two live consequences: the
   loadout bridge stays an assumption until a verified rule set reads the
   vanilla record directly, and a future `remove_armour` rule set, which has to
   know *which* piece was destroyed and not merely that armour fell, will need
   `CANONICAL_RESOURCE_SOURCES` to grow.
3. **Facing is read but not carried.** `gladiator_dir` affects the knockback
   sign and the debris direction in the 1v1 candidate. It is a string
   (`"right"` / `"left"`), so the numeric resource bag is not its home either.
   It lives in the adapter's clip record, and a rule set that read it would be
   reading something outside the state hash.
4. **A campaign record cannot carry a resource bag named after vanilla
   fields.** `src/campaign/vanilla-boundary.js` screens every key in a record
   against the vanilla field catalogue and refuses the record if any matches —
   which is the correct boundary, and which also means `armourclass` and
   `staminaleft` cannot appear as keys in a persisted outcome. Today this is
   moot (`from-battle.js` projects no `resources` block at all), but it is the
   constraint any future attempt will hit.
5. **There is no per-action animation acknowledgement.** This is the one gap in
   the acknowledgement story, and it is a hazard rather than a shape problem.

   Every presentation command carries the resolver `sequence` it came from,
   which orders the commands *relative to each other*. Nothing orders them
   relative to **time**. `bind-globals` and `clip-goto` carry a sequence and no
   completion token; `createPresentationBinder`'s cursor advances on drain
   rather than on anything the surface reports; and the only acknowledgement
   anywhere in the adapter is the terminal one in `acknowledgement.js`, which
   fires once per battle.

   So a host that submits action N+1 while action N's timeline is still running
   rebinds `_global.attacker` / `_global.defender` / `game_attacker` /
   `game_defender` underneath it — and vanilla's mapped functions read those
   globals rather than parameters captured at dispatch. Nothing sequences the
   rebind against the running timeline, and nothing here mitigates it.

   **This is documented, not designed.** What a seam that closed it would have
   to offer, stated so nobody has to guess: (1) a per-action token on one
   resolved action's commands — the resolver sequence is already unique per
   action and would serve, but it has to be *carried* on `bind-globals` and
   `clip-goto` and *echoed back*, not merely stamped; (2) a reporting call the
   surface makes when that action's timeline reaches its terminal frame, naming
   the token and shaped like `reportDeathAnimation` — accepted once, duplicates
   answered rather than thrown, an unknown token refused; (3) a gate the host
   consults before submitting the next action, so "the resolver is ready" and
   "the surface is ready" stay two questions with two answers; and (4) a policy
   for a surface that never reports, since a timeout is a host decision rather
   than a presentation one. None of it is implemented, and inventing a mechanism
   without a capture of the vanilla timeline's own completion signal would put a
   guess at the centre of the action loop.

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

The state conversion, slot layout, event binding, acknowledgement bridge, and
the reference host loop that drives them together are implemented asset-free in
`src/adapter/` and specified in [The SS2 adapter](#the-ss2-adapter-srcadapter)
above. The separate campaign save record is implemented asset-free in
`src/campaign/` and specified in
[campaign persistence](campaign-persistence.md).

What is still missing before a playable mod:

- **the runtime-verified rule set** — the seam and its gate exist and nothing
  measured has been dropped into them yet. `classicStyleRules` is the only rule
  set anywhere under `src/`, and it is a declared placeholder; the others in the
  repository exist only inside `test/`, to exercise the seam;
- **campaign roster and reward integration** — the record layer stores an
  outcome, but nothing reads a record back into a roster or pays a reward;
- **the launcher route** into the Collection's mods folder.

None of these may be substituted for by the adapter.

## Can a six-slot arena be rendered without touching an asset? YES (measured 2026-09-02)

Stages 5 and 6 of the roadmap both say the rendered arena is "not started", and
nobody had established whether it was even *reachable* asset-free. It is.
Verified wave, 6 questions / 24 verifiers / 30 of 30 returned.

**The fighters cost nothing.** `hero_battle` is character **1241**, exported by
`ExportAssets` (file offset `0x3b2688`). The build has **0 `SymbolClass`, 0
`DoABC`**, and the clip has no `DoInitAction` and no `registerClass` — so there
is no class binding and no per-symbol instance cap. **Vanilla already attaches
it four times concurrently** in `_root.arena.gladiators` (root frame 221, block
base `0x671ad3`): `villain`@300, `hero`@301, `villain_shadow`@299,
`hero_shadow`@298 — plus a fifth at depth 100000 from `initsystem`. Each
instance brings all 101 frame labels with it: every attack and defence
direction, `Death1`-`23`, `Hurt1`-`20`, `rest`, `taunt`, `frozen`/`burning`/
`poisoned`, `Cast1/2`.

**The depth space is free.** `gladiators` is a `createEmptyMovieClip`, so its
depths are script-owned; occupied are only 6, 200, 201, 298-301, 40000. **The
`320…344` band `slot-layout.js` already reserves is empty.** `duplicateMovieClip`
appears **0 times** in the whole build and no `Enumerate2` iterates
`gladiators`' children, so adding siblings breaks no iteration.

**Skinning is already parameterised.** `skincharacter`, `initcharacter`,
`updatecharacter`, `colorhero`, `battlevalues`, `remove_armour`,
`damagecharacter`, `magic_damage_character`, `attack_chances` and `check_stats`
contain **zero** `hero`/`villain` literals. Armour attaches into
`<avatar>.<bodypart>` at per-clip depths, and damage icons at 25000/25005
*inside the target clip*, so N combatants never collide.

**Space is not the constraint.** The stage is 640×420 but the playfield runs to
±2160 with active x clamped to ±2100, and `combatCamera`/`combatscale`
(`sprite:2249` frame 1) pan and zoom about `midwaypoint`. Six fighters fit
inside the existing background.

### What is genuinely hard-coded to two — and it is CODE, not art

Census over the battle route: 46 sites, **145 clip references, 500 state
references**. Four matter, and each is replaced by our own code rather than by
an asset:

| site | offset | what breaks at >2 |
| --- | --- | --- |
| `death(whichcharacter, how_died)` | `0x240c85` `+0x1e99` | routes on CLIP IDENTITY (`=== gladiators.villain` → `combatwon`, `=== .hero` → `combatlost`). **An ally dying matches neither and transitions nothing.** |
| `cast_spell_icon` | `+0x2251` | two identity branches with literal `_x` 60 / 580; an ally casting falls through both and writes to `undefined` |
| `getfightdistance()` | `0x6e4221` `+0x2a9` | reads `gladiators.hero._x` / `.villain._x` by literal name to derive `midwaypoint` and `fightdistance` — which the controller selector then uses |
| the villain AI | `0x23f83b` `+0x2c9` | unparameterised; assumes one opponent |

**So stages 5 and 6 need no new or altered game asset.** What they need is our
own code for those four seams — which is what `src/adapter/` exists to be. The
only place an authored asset is plausibly wanted is the combat panel, and new
UI is unblocked and shippable.

*(Curiosity worth keeping: frame 221 attaches linkage `overlay_villain`@40001
and **that linkage does not exist in the build**, so the call yields nothing.)*
