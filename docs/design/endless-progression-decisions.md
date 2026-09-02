# Endless progression decision record

> **Design-track quarantine:** do not use this document while authoring vanilla
> candidates, fixtures, or capture hypotheses. Designed mechanics may not select
> or shape what parity capture tries to prove.

**Status:** owner review required; no decision below is approved by the existence
of this document. **Implementation remains blocked.**

This record turns the six gates in the
[Endless progression system](endless-progression-system.md#gate-before-code)
into durable, independently reviewable decisions. It does not add a seventh
product decision, change measured vanilla behaviour, or authorize an
`endless-v0` implementation.

## How to record a decision

The detailed **Record** under each decision is authoritative; the summary table
is a derived reading aid and must be updated in the same reviewed commit. For
each ID, replace `pending` only after the owner explicitly chooses
`accepted`, `rejected`, or `revise`. Record the owner, UTC date, and exact
revision when applicable. A chat acknowledgement is not durable until it lands
in this file. Only `accepted`, or `revise` with a fully normative replacement
explicitly marked accepted, closes the readiness gate. `rejected` or an open
revision remains blocking and requires the proposal/MVP scope to be rewritten.

```text
EP-D01: accepted
EP-D02: revise — accepted replacement: <rule>
EP-D03: accepted
EP-D04: accepted
EP-D05: accepted
EP-D06: accepted
Owner: <name>
UTC date: YYYY-MM-DD
```

An acceptance approves a design constraint, not its current tuning. Numeric
balance still has to pass the gates in the system design and the future
readiness plan.

## Decision summary

| ID | Decision | Recommendation | Status |
| --- | --- | --- | --- |
| EP-D01 | End vertical chassis/stat power at career tier 50 | Accept only with a career/frontier synchronization addendum and authored budget | `pending` |
| EP-D02 | Cap active Rule Load at four per combatant | Accept provisionally, subject to build-frontier tests | `pending` |
| EP-D03 | Make one Arena Circuit four fights | Accept only as the 2v2 MVP measurement boundary; human timing may revise it | `pending` |
| EP-D04 | Let rarity change behaviour complexity, not chassis budget | Accept as a permanent identity rule | `pending` |
| EP-D05 | Use personal precommitted frontier outcomes and typed post-completion records | Accept only with atomic settlement, ordered plan folding, and maintenance entitlement | `pending` |
| EP-D06 | Make the first playable proof deterministic 2v2 under a separate designed rule set | Accept only after selecting the public deterministic RNG model and separating headless/playable gates | `pending` |

The recommendations are coupled. D01 prevents an infinite scalar gear ladder;
D04 prevents rarity from reopening it. D02 prices the behavioural breadth that
replaces scalar growth. D03 determines lock duration and reward cadence. D05
makes that cadence fair and reload-safe. D06 is the smallest team format that
can test the resulting co-op choices rather than a solo scalar ladder.

### Required model/architecture dispositions

These do not expand the six product decisions. They record how open blockers
are resolved. Accepting an EP-D decision does **not** accept its corresponding
EP-A repair. Each EP-A record needs its own owner/date-stamped disposition.

| ID | Blocker | Recommended disposition | Status / owner / UTC date |
| --- | --- | --- | --- |
| EP-A01 | Career/frontier pacing | Enforce `careerLevel <= highestClear + 1` and at most one total level per four-key set; remove the five-Circuit milestone target | `pending` / — / — |
| EP-A02 | Public deterministic combat RNG/retry | First select a branch-oracle-safe public coupling/forecast contract; then select exact retry state or a finite persisted post-loss seed sequence and specify Recovery/Overtime seed visibility | `pending` / — / — |
| EP-A03 | Post-completion access | Select a zero-growth maintenance/reconstruction model with explicit licence creation, slots, retirement, and conservation; no completion power spike | `pending` / — / — |

Record these separately, for example:

```text
EP-A01: accepted — synchronization invariant
EP-A02: revise — accepted replacement: <full RNG/information contract>
EP-A03: revise — accepted replacement: <maintenance contract>
Owner: <name>
UTC date: YYYY-MM-DD
```

## EP-D01 — vertical power ends at career tier 50

**Canonical decision (exact approval scope):** vertical power ends at career
tier 50.

**Dependent working interpretation, not separately approved by D01:** career level may continue indefinitely, but ordinary stat
budget and item-chassis budget use `min(careerLevel, 50)`. After tier 50,
progression changes options, combinations, opponents, and records rather than
raising the raw chassis ceiling.

**Recommendation:** accept only if EP-A01 separately selects this clean-boundary addendum:

```text
careerLevel <= highestClear + 1
one four-key frontier set awards at most one total career level
```

The mapped vanilla systems contain
hard caps and ratio/damage structures that already turn later scalar investment
into dead, constant, or volatile value. A declared vertical endpoint makes that
limit legible and leaves room for a finite, testable balance envelope. Fifty is
an assumption, not a measured vanilla breakpoint.

**Alternatives considered:**

- a rising soft cap reopens exponential or logarithmic treadmill tuning and
  makes old content either trivial or stat-gated;
- no vertical career growth removes the ordinary early-game arc;
- separate higher caps per axis are possible, but are harder to communicate and
  make item comparison opaque.

**Parity/seam:** this is Endless campaign and item-generation policy. It may use
measured classic formulas only when their entire required path is promoted; any
new action, payoff, cap correction, or status remains behind the separate
designed rule set. It never changes a classic descriptor.

**Degenerate strategy invited:** rush the most efficient vertical axis before
tier 50, then ignore lateral rewards; or find a post-cap chassis source that
silently exceeds the ceiling.

**Required counter and rejection gate:** author one normative tier-50 stat and
item budget, reject dead offered ranks, include item origin and ceiling tier in
provenance, and exhaustively validate every generator/Forge path against that
ceiling. Across the seeded build/opponent grid, at least three build families
must remain viable and no post-cap offer may be a disguised scalar upgrade.
Simulate through career level 200 and assert the synchronization invariant plus
`effectiveTier <= min(careerLevel, selectedChallengeTier, 50)` after every
transaction. Remove the current “roughly every fifth Circuit” milestone target
unless challenge advancement is explicitly redesigned.

**Approval consequence:** authoring the tier-50 budgets becomes a blocker for
the headless MVP. Changing the cap later changes progression/generator versions
and requires migration; it does not alter classic data.

**Record:** `pending` — owner/date: —

## EP-D02 — active Rule Load caps at four

**Canonical decision (exact approval scope):** active Rule Load caps at four.

**Dependent working assumptions, not separately approved by D02:** each
combatant may equip at most four points of behaviour-bearing effects. Minor
effects cost one, identities normally cost two, and a three-point Trophy
package is permitted only where its authored burden and interaction justify
it. Rule Load never rises after tier 50.

**Recommendation:** accept provisionally. Four is large enough to express a
sequence plus coverage but small enough that the proposed two- and three-point
identities force opportunity cost. It also keeps the 2v2 state surface
auditable. The number is assumed until the full combination matrix passes.

**Alternatives considered:**

- three makes a three-point identity consume the whole meaningful kit and may
  make hybrid play non-viable;
- five or more makes broad best-stuff packages and combinatorial proc chains
  more likely;
- per-rarity capacity would turn rarity into vertical power, contradicting D04.

**Parity/seam:** Rule Load is Endless loadout state. Effects that change combat
legality or outcome require `endless-v0`; inventory capacity and validation live
in canonical/progression state. Classic rule sets do not read Rule Load.

**Degenerate strategy invited:** a universally optimal four-point package,
zero-cost fillers, inactive-slot stat sticks, or trigger chains whose combined
value exceeds the sum of priced effects.

**Required counter and rejection gate:** total generation and loadout
validation over every compatible effect combination; strongest-only stacking
groups; exact active-item linkage; no effect-triggered effect; and the system
design's dominance gates. Reject any package that is best or within five
percentage points of best in more than 70% of the declared test cells. Any
exception requires an explicit owner revision of that rejection gate.

**Approval consequence:** four becomes an input to UI, item schemas, generator
validation, AI loadouts, hashes, and migrations. Retuning effect costs requires
a new design version; changing the cap requires progression-schema review.

**Record:** `pending` — owner/date: —

## EP-D03 — one Arena Circuit contains four fights

**Canonical decision (exact approval scope):** one Circuit contains four
fights.

**Dependent working assumptions, not separately approved by D03:** a Circuit
currently commits one previewed route and locked starting loadouts; the fourth
fight is the final; Rematch/Recovery and reward/clear transitions follow the
system design's separate rules.

**Recommendation:** accept only as the first 2v2 measurement boundary. Four
supplies an opener, two adaptation checks, and a final intended to preserve a
session-sized commitment, subject to the interactive timing gate. It is not
evidence that four is optimal for all formats.

**Alternatives considered:**

- three reduces fatigue but gives only one middle encounter and weakens the
  locked-kit endurance question;
- five or more supports a longer arc but magnifies disconnect, inventory-lock,
  and failed-run recovery costs;
- variable length complicates reward normalization and makes route comparison
  harder before the economy is validated.

**Parity/seam:** Circuit scheduling and content-only opponents can preserve a
future verified classic combat path while changing campaign parity. Contract
laws or effects that alter combat require the designed rule set. Settlement,
locks, and rewards live outside action resolution.

**Degenerate strategy invited:** scout/concede early, farm only the best first
fight, deliberately lose to preserve a favourable plan, or choose the shortest
reward-efficient route.

**Required counter and rejection gate:** precommit the complete route and
reward plan; advance no **noncombat** stream on Concede/Recovery restart while
combat-attempt state follows the selected EP-A02 contract; pay only
`grantEligible` outcomes; include all scouting actions in progression-per-action
metrics; and compare risk-normalized reward rates across routes. Playtest
completion time, abandonment, Pivot use, and per-seat meaningful actions before
extending the same length to 3v3.

Multiplying the present per-fight target ranges gives a 48–96 actor-action
planning envelope for four-fight 2v2 and 72–144 for 3v3; these are not
statistical Circuit medians. If R-05's skipped-turn repair is proved, the
candidate summed safety caps are 316 and 476 for resolved actor-actions and,
separately, for scheduled opportunities. Neither converts to a hard time cap
until presentation and human decision time are bounded. D03 acceptance
explicitly permits revision after end-to-end timing.

**Approval consequence:** four becomes part of plan, escrow, receipt, UI, and
soak fixtures. A later length change is a generator/progression version change,
not a silent balance tweak.

**Record:** `pending` — owner/date: —

## EP-D04 — rarity changes behaviour complexity, not chassis budget

**Canonical decision (exact approval scope):** rarity changes behaviour
complexity, not chassis budget.

**Dependent working interpretation, not separately approved by D04:** within a fixed chassis family/profile/tier, rarity changes
the number, structure, or authored identity of compatible behaviour effects. It
does not increase the item's ordinary damage, armour, health, or stat budget.

**Recommendation:** accept as a permanent identity rule. This is the strongest
guard against turning an endless sidegrade system back into a colour-coded
scalar ladder. Higher rarity can be exciting because it enables a different
decision, not because its number invalidates every lower-rarity item.

**Alternatives considered:**

- small rarity multipliers still become mandatory when optimization is the
  game, and compound across slots;
- random affix counts without budgets create lottery best-in-slot items;
- cosmetic-only rarity cannot carry the proposed build discovery by itself.

**Parity/seam:** rarity, provenance, and offers are progression state. Existing
verified item semantics could remain classic-compatible; every novel behaviour
effect requires the designed rule set. A rarity label alone never promotes or
changes vanilla evidence.

**Degenerate strategy invited:** always equip the highest colour, fish for the
one compound affix set, or use rare identities whose nominal burden does not
pay for their interaction value.

**Required counter and rejection gate:** chassis equality assertions across
rarities; compatible pools and mutual exclusions; Rule Load and slot budgets;
duplicate conversion/pity; full affix-combination tests; and observed loadout
turnover driven by matchup, not colour. Reject any higher rarity that strictly
dominates its lower-rarity chassis across the declared opponent grid. Also
apply a frequency/concentration gate by rarity identity so one Legendary cannot
lead nearly every cell and survive only by losing one showcase liability cell.

**Approval consequence:** item generation, UI comparison, AI equipment, Forge,
and migration must preserve chassis equality. Breaking this rule would require
an explicit replacement decision, not a tuning commit.

**Record:** `pending` — owner/date: —

## EP-D05 — personal precommitted outcomes and typed completion records

**Canonical decision (exact approval scope):** every mechanically incomplete
`grantEligible` persistent combatant receives a personal precommitted reward
outcome, while newly prepared completed slots are typed records and only one
already prepared reward set may be grandfathered.

**Dependent working interpretation, not separately approved by D05:** before a
paid attempt, prepare one immutable personal outcome for every persistent,
mechanically incomplete combatant who can become `grantEligible`. Settlement
grants each eligible combatant's own outcome; it never assigns loot by last hit
or a shared random roll. A completed slot receives a typed record whose optional
payload may be cosmetic/title. If completion happens after one reward set was
already prepared, at most that one immutable set may be grandfathered.

**Recommendation:** accept only together with an atomic persistence boundary,
strict predecessor-state folding for all four precommitted outcomes, and a
separately accepted EP-A03 maintenance contract.
The rule protects seat agency, prevents last-hit/shared-roll allocation
funneling, removes last-hit incentives, and makes completion finite. Stable-AI
reward streams and tradeable natural items can still funnel a carry. Without
durable prepare/acknowledge/apply repair, however, it creates duplicate- and
loss-prone value.

**Alternatives considered:**

- shared need/greed imports social pressure, disconnection edge cases, and
  carry funneling into a short local co-op game;
- last-hit or contribution allocation distorts combat choices;
- independent rolls generated after victory permit reload fishing;
- converting every post-completion slot into more mechanical power defeats the
  finite-system goal.

**Parity/seam:** reward planning and custody do not change action resolution and
can accompany a classic-compatible content route, but novel granted effects
still require the designed rule set when equipped. Persistence must store the
rule ID/contract/design triple and generator/definition provenance.

**Degenerate strategy invited:** restart for different offers, duplicate a
grant across an acknowledgement crash, complete a collection between prepare
and settlement to mint extra mechanical items, or route all useful custody to
one carry.

**Required counter and rejection gate:** precommit and hash outcomes; immutable
escrow IDs; stable owner IDs; exact `grantEligible` classification; one durable
transaction applying attempt, grant, key, pot, completion, and receipt state;
idempotent replay after every injected crash boundary; concentration-dominance
tests; and the one-set grandfather limit. No implementation starts until the
relationship among active battle, campaign record, and progression sidecar has
one specified atomic journal/recovery boundary.

Completion must not issue mechanical frontier rewards, but it also must not
strand legitimately earned build access. EP-A03 must state what event creates a
permanent identity licence, how many reconstruction slots exist, whether a
viewed-but-declined offer counts, how retirement behaves, and which host
chassis/slots are required. Any entitlement is earned progressively or
converted one-for-one from existing rights; completion cannot suddenly grant
free equipment, unlock an unknown ID, bypass a source, increase simultaneous
copies, or create transferable value. Record outcomes stay mechanically inert.

**Approval consequence:** this fixes the semantic settlement contract but not a
storage engine. The readiness specification must choose the atomic boundary and
repair protocol before schema code.

**Record:** `pending` — owner/date: —

## EP-D06 — first playable proof is deterministic 2v2 under designed rules

**Canonical decision (exact approval scope):** the first playable proof is 2v2
and uses a separate designed rule set.

**Dependent working assumptions, not separately approved by D06:** the current
proof proposal uses the non-runtime-verified `endless-v0` descriptor,
four-fight Circuits, independent human custody/reward choices, deterministic
generation, and reproducible combat. It never presents itself as vanilla
parity.

**Recommendation:** accept after the owner separately selects EP-A02's public
deterministic RNG/information contract. A 1v1 proof cannot test seat agency, focus fire,
personal rewards, shared decisions, or mixed build coverage. A first 3v3 proof
multiplies UI/state and balance cost before those questions are answered.

**Alternatives considered:**

- 1v1 is cheaper but validates only a solo progression ladder;
- 3v3 better represents the maximum target format but expands target, UI,
  action-time, and combinatorial surfaces too early;
- a classic descriptor cannot honestly host new actions, exact-probability
  semantics, Pressure, or behaviour affixes.

**Parity/seam:** always a separate designed rule set with
`runtimeVerified: false`. The currently legal verification remains
`placeholder`; today only a provenance note can reliably distinguish designed
intent. If contract v2 retains an explicit `designIntent`, it must validate,
describe, project, hash, and persist it. Contract v2 does **not** silently add a
new verification enum. A future `designed` enum needs its own contract/schema
migration.

**Degenerate strategy invited:** focus-fire deletes one seat before agency,
one carry makes every important decision, a support seat becomes an appliance,
or deterministic seeds turn into solved scripts.

**Required counter and rejection gate:** per-seat meaningful-action and value
metrics; focus-fire response fixtures; mixed-controller and reconnect tests;
loadout locks and bounded Pivot; pre-registered held-out evaluation seeds that
are not a runtime security boundary; and no secret-seed security claim.
Separate two milestones: a headless deterministic
2v2 proof may run after the state/contracts are ready, but a **playable** proof
also requires per-action animation acknowledgement so action N+1 cannot rebind
vanilla globals while action N's timeline is still running.

Independent action/target labels plus exact same-seed Rematches are rejected:
with `m` equally likely independent alternatives at hit probability `p`, a
seed-aware player finds a successful label with `1 - (1 - p)^m` probability
(50% becomes 93.75% with four labels and 99.61% with eight). The recommended
offline option must couple every counterfactual payoff axis—not only primary
hit—or expose the complete forecast for every legal action as intentional UI.
A finite loss-receipt-derived attempt-seed sequence is an orthogonal retry
choice: it changes exact Rematch semantics and prevents restoring an old seed,
but cannot replace the branch-oracle-safe coupling/forecast contract. Hidden
entropy is not an offline safety premise. EP-A02 separately defines when
Recovery/Overtime seeds become actionable, and Overtime remains deferred until
a white-box policy is non-degenerate.

**Approval consequence:** it makes the specifications eligible for separate
owner implementation authorization after every readiness gate. It does not by
itself authorize an `endless-v0` branch, launcher work, original-game
deployment, runtime capture, or changes to classic rules/evidence.

**Record:** `pending` — owner/date: —

## Contract consequences that are not a seventh product decision

If the six decisions are accepted, the current proposal still requires an
explicit rule-contract v2 specification before code:

- require a nonnegative safe-integer `designVersion` in every descriptor;
- project and hash the `(id, contractVersion, designVersion)` triple through
  battles, results, recipes, items, rewards, receipts, saves, and peers;
- migrate every classic v1 descriptor explicitly to `designVersion: 0` rather
  than defaulting a missing field at runtime;
- keep `endless-v0` legally `placeholder`, `runtimeVerified: false`, with a
  provenance note unless v2 explicitly validates/projects/persists designed
  intent, until a later enum migration is separately reviewed; and
- define the selected Endless combat RNG/information contract as a contract
  change, including its
  structural draw coordinates, counters/ordinals, counterfactual information
  policy, state projection, hashing, replay, and compatibility. It is not an
  internal implementation detail of one effect.

Those consequences are architecture gates created by the proposed design. They
do not approve the product constraints above and may still reveal that one must
be revised.

## Approval checklist

The owner should be able to answer yes to all of these before marking all six
accepted:

- The vertical endpoint is intentionally designed, not claimed as a measured
  vanilla flattening level.
- Behaviour breadth is intentionally budgeted and finite.
- Four fights is accepted as the first measurement boundary, not a universal
  session-length truth.
- Rarity will never silently become a chassis multiplier.
- Personal rewards are blocked on durable atomic prepare/apply/repair semantics.
- Headless 2v2 and playable 2v2 are understood to have different integration
  gates.
- No accepted decision authorizes classic-rule changes, candidate shaping,
  runtime capture, launcher deployment, or installed-game access.
