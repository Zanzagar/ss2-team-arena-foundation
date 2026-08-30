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
