# Endless MVP implementation-readiness record

> **Design-track quarantine:** do not use this document while authoring vanilla
> candidates, fixtures, or capture hypotheses. Designed mechanics may not select
> or shape what parity capture tries to prove.

**Status:** specification and review plan only. **Not implementation-ready.**
The six owner decisions are pending, three P0 model contradictions and three P0
specification blockers remain open, and several cross-layer contracts do not
exist in source. Nothing here
authorizes `endless-v0`, launcher work, runtime capture, installed-game access,
or changes to classic rules/evidence.

This is a volatile index over the stable proposal in
[Endless progression system](endless-progression-system.md). It answers one
question: *what must be true before a headless or playable implementation can
honestly start?* It is not a second feature design.

## 1. Readiness verdict

| Gate | Current state | Required disposition |
| --- | --- | --- |
| Product constraints EP-D01–EP-D06 | `pending` | Owner accepts each or supplies a fully normative, explicitly accepted replacement in the [decision record](endless-progression-decisions.md); rejection/open revision remains blocking. |
| Pacing scale | **P0 contradiction** | Choose one coherent mapping among career level, frontier tier, Circuit count, vertical tier, and milestone cadence. |
| Retry/combat RNG | **P0 exploit** | Remove semantic-label/seed shopping without losing reload determinism or classic ordered-tape parity. |
| Post-completion economy | **P0 deadlock/hoard incentive** | Preserve bounded access to already known sidegrades after catalog completion. |
| Designed combat kernel | **P0 missing specification** | Author integer tier/chassis/action/opponent budgets before balance implementation. |
| Pressure termination | **P0 incomplete proof** | Close turn-denial and rounding gaps before claiming action/session bounds. |
| Authoritative integer encoding | **P0 incompatible specification** | Select safe integers, canonical strings, or a binary u64 format before persistence schema authoring. |
| Rule contract/provenance | Contract v1 only | Specify v2, `designVersion`, explicit classic migration, and RNG-model identity. |
| Canonical battle state | Numeric resources exist; structured Endless mechanics do not | Specify and hash frozen item, condition, marker, charge, cycle, and Pressure state. |
| Durable continuation | Final settled records only | Specify exact active-battle restore and one atomic progression transaction boundary. |
| Durable reward settlement | Strong in-memory latch; no crash-repair transaction | Specify `ack-prepared` recovery and one pure idempotent settlement reducer. |
| Numeric content | Tuning hypotheses only | Author tier budgets, chassis/opponents, action costs, `C_t`, and all finite catalogs. |
| Headless proof | Reusable resolver exists | Build only after every preceding headless gate passes. |
| Playable proof | No per-action animation acknowledgement | Requires an evidenced completion signal and fail-closed action gate after headless acceptance. |

There is no useful “percentage complete” here. The current design is
feature-complete at proposal level and not implementation-ready at contract
level. Those statements are compatible.

## 2. Evidence vocabulary

- **[V] Repository-verified:** current source, tests, or maintained repository
  documentation demonstrates the capability.
- **[D] Derived:** checkable arithmetic or logical consequence of stated inputs.
- **[A] Designed/assumed:** intentional product or architecture proposal.
- **[U] Unverified:** evidence or a selected mechanism is still missing.

Classic promoted evidence retains its narrower fixture scope. A mapped or
designed statement never becomes runtime-verified through this document.

## 3. P0 contradictions and specification blockers

These are not tuning details. R-01–R-03 block model-dependent work; R-04–R-06
block only their owning code slices and do not by themselves forbid unrelated
contract/provenance specification.

### R-01 — career pace, challenge pace, and milestone cadence disagree

The proposal advances frontier challenge tier exactly once per cleared Circuit
but also queues milestones every 20 career levels and targets those milestones
at roughly every fifth Circuit. Let `g` be average career levels gained per
complete progression Circuit. The pacing target implies:

```text
20 career levels / 5 Circuits = g = 4 levels per Circuit
```

At that rate, a level-1 combatant reaches career level 50 after about
`49 / 4 = 12.25` Circuits, while its frontier is only around challenge tier 13.
It reaches level 100 after about `99 / 4 = 24.75` Circuits, around challenge
tier 25–26. Yet the current reward rule changes from
`min(selectedChallengeTier, careerTier)` to 50 after the career cap. That
creates either a tier-13-to-50 reward-budget jump or a post-100 period in which
vertical chassis power has not actually reached its advertised endpoint. [D]

Conversely, reaching challenge tier 50 no later than career level 50 requires
roughly `g <= 1`. Then 20-level milestones are about 20 Circuits apart, not
five. No single fixed `g` satisfies both claims. [D]

**Small coherent repairs to decide between:**

1. **One career level per cleared Circuit:** preserve one frontier tier per
   Circuit and align vertical career/challenge tiers; revise the “every fifth
   Circuit” target and the 1–100 timeline's real-world length.
2. **Separate display career from vertical tier:** let career/records rise
   faster while vertical budget follows `min(highestClear, 50)`; rewrite every
   level-gated unlock and admit that “level 100” may precede vertical tier 50.
3. **Advance several challenge tiers per Circuit:** preserves fast career pace
   but rewrites frontier keys, opponent selection, clear credit, mixed-party
   gates, and the meaning of a four-fight Circuit. This is the largest repair.

**Provisional recommendation:** option 1, made exact by this clean-boundary
invariant, is the smallest internally consistent model:

```text
careerLevel <= highestClear + 1
one four-key frontier set awards at most one total career level
```

Fights 1–3 may accrue XP, but a level cannot activate early enough to violate
the invariant; the final may commit the set's one crossing with its clear.
Record-kind sets use the same aggregate limit. Treat the five-Circuit phrase as
a failed target, not as a reason to distort challenge or reward tiers. This
affects EP-D01 and the pacing consequence of EP-D03; it must be owner-reviewed
rather than silently patched.

**Gate:** a normative table maps each Circuit outcome to XP, career level,
career tier, frontier tier, reward-budget tier, milestone queue, and Epoch
boundary for levels/tiers 1, 20, 40, 50, 60, 80, 100, 101, 125, and 200. No
transition may increase a reward budget by more tiers than its declared clear.
At the first level-50 receipt, the next selectable frontier is at least 50;
from then on, later clear catch-up alone cannot increase a combat projection.

### R-02 — deterministic semantic labels turn Rematch into an oracle

The originally merged proposal restored the same combat seed and per-label
counters on Rematch,
while alternative action/target labels draw independently. After scouting a
seed, a player can choose whichever independent label is known to succeed. If
`m` alternatives each hit with probability `p`, the probability at least one
label succeeds is:

```text
P(best known label succeeds) = 1 - (1 - p)^m
```

At `p = 0.5`, four labels expose `93.75%` success and eight expose `99.609375%`,
not 50%. Counting scouting actions measures the exploit but does not remove it.
Unlimited same-seed Recovery restarts make the same problem repeatable. A
seed-aware local player can also accept Overtime only when inspection predicts
a favourable branch if its future combat seed exists before the irreversible
choice. [D/A]

Classic ordered RNG cannot be replaced: its global labelled tape is a parity
contract. Endless therefore needs a separate, versioned RNG model. But the
originally proposed per-action-label model is not sufficient.

**Mandatory outcome/information foundation plus a separate retry choice:**

1. **Branch-oracle-safe public outcome/information contract:** either expose the
   complete legal-action payoff forecast as intentional gameplay, or derive
   coupled quantiles across every counterfactual payoff axis—not only primary
   hit, but damage, critical, status, proc, target-count, and effect domains—and
   require a white-box solver to keep zero-cost seed-aware advantage within an
   owner-approved tolerance. Local seed visibility is part of the threat model;
   “relevant forecast” without an exact UI schema is not a contract.
2. **Retry state after that foundation:** select exact attempt-state restoration
   or a persisted finite sequence in which an acknowledged defeat atomically
   commits a loss ordinal and derives the next deterministic attempt seed. The
   latter prevents restoring an old seed and bounds retry count, but it does
   **not** close the current-attempt branch oracle or make a predictable future
   sequence secret. It is a retry-policy choice, not an alternative to item 1.

Commit-reveal can hide entropy in a networked mode but cannot be the offline
MVP's safety premise. Under any selected foundation/retry combination, the
precommitted Recovery **recipe**
is distinct from its attempt seed: either derive that seed atomically from the
Concede receipt, or deliberately expose the complete Recovery forecast and test
the resulting Concede policy. Apply the same rule before Overtime risk becomes
irreversible. Overtime remains deferred until the white-box policy is
non-dominant.

This is an architecture/product correction, not a classic formula change.

**Gate:** compare honest play, UI-informed play, zero-cost direct seed
inspection, every alternative action/target/payoff domain, intentional loss,
padding, Concede, Recovery restart, and Overtime accept/decline. Report win
rate, action distribution, route/risk choice, and progression per action
separately. If forecasts are intentional, UI/log and save inspection expose
byte-identical information. Otherwise seed-aware advantage must remain within
an approved tolerance; counting scouting actions cannot detect zero-cost seed
inspection.

### R-03 — catalog completion can permanently strand known builds

Current completion means every potentially unlockable authored mechanic is
resolved, not that the combatant owns every useful copy or retains enough
currency to rebuild it. The proposal then stops all gold and Forge Marks. A
completed combatant with fewer than 16/28/48 Marks can therefore lose access to
a desired known Tempered/Inscribed/Legendary identity forever. Terminal zero
income creates a marginal near-completion hoarding incentive and can strand an
identity that was discovered but not retained; spending may still improve
present win rate, so universal dominance is not claimed. [D]

**Small coherent repairs to decide between:**

1. Progressively earned permanent personal identity licences remain usable
   after completion through a fixed number of conserved refundable
   reconstruction entitlements. Known builds can be reconfigured one at a time
   without increasing simultaneous power.
2. Full identity-specific recycling returns exactly the entitlement required
   to instantiate one other known projection, with no tradeability or copy
   growth.
3. Require sufficient owned copies/currency for completion; this merely delays
   the hoard checkpoint and can still strand the player after later spending.

**No option is selected.** EP-A03 must define the progressive event that creates
an identity licence, reconstruction-slot count, whether viewed-but-declined
offers count, retired-ID behavior, host chassis/slot requirements, and the exact
conservation equation. Completion cannot itself grant a free library power
spike.

**Gate:** use a test fixture with zero available currency—production completion
does **not** delete balances. Compare immediate completion, delayed completion,
all-salvage discovery, and keep-everything policies over explicitly earned
licences and reconstruction slots. Require equal intended reachable active
build sets without increasing simultaneous equipped copies or transferable
value; unknown/source-uncleared/retired IDs remain inaccessible according to
the selected EP-A03 rules.

### R-04 — the designed combat budget does not exist yet

The proposal does not yet define the full-elimination health curve, per-tier
stat allocation, chassis budget functions, action/resource costs, designed
critical/deflection/status rules, opponent raw-budget function, or scalar value
of a modifier/liability. A doctrine's AI-policy value also sits outside the
stated positive-module budget. [U]

Without that kernel, win-rate, build-frontier, same-chassis, action-duration,
Concord, Forms, opponent-budget, and Contract-normalization gates cannot run.
This is P0 even though it is not a contradiction: implementing effects first
would fit balance to missing foundations.

**Gate:** one versioned integer headless-balance specification covers tier
1–50 stats/chassis/health/armour/resources, every baseline action, all opponent
budget dimensions, and explicit rounding. EP-D01 and EP-D02 remain provisional
until it exists.

### R-05 — Pressure's termination proof omits skipped turns and rounding

The proposed `40n - 1` actor-action bound is otherwise plausible, but stack-8
legality is not guaranteed through frozen/stunned/lost-turn state. A skipped
scheduled turn does not reduce its monotone measure, and new ordinary attacks
may reapply denial. Recovery reductions of 12.5 percentage points also lack an
integer formula. [D/U]

**Provisional repair:** at stack 8, suspend all turn-denial state, forbid new
hard/soft denial, schedule one Pressure action for every living snapshotted
seat, apply the mandatory floor exactly once to one living target, and suppress
all proc/status/control side effects from that floor. Define recovery with one
integer rule, for example:

```text
effectiveRecovery = roundHalfUp(baseRecovery * max(0, 8 - stack) / 8)
```

**Gate:** exhaustively start with every fighter frozen, taunted, silenced,
disarmed, empty, out of range, and carrying pending reactions; prove each
scheduled opportunity becomes a forced Pressure action and strictly decreases
`sum(hitsRemaining) + remainingApproachDebts`. Track scheduled opportunities
(including ordinarily skipped turns) separately from resolved actor-actions and
bound both. Define whether a control-skip presentation consumes interactive
time. The 316/476 four-fight actor-action sums are headless safety ceilings, not
acceptable human-session targets; after the repair, the corresponding
scheduled-opportunity counters require their own equal ceilings.

### R-06 — JSON cannot carry the proposed unsigned 64-bit contract as written

Canonical unsigned 64-bit integers, rejection of numeric strings, and ordinary
JavaScript JSON numbers cannot all coexist above `2^53 - 1`. [V/D] Select one
before schema authoring: cap authoritative counters at
`Number.MAX_SAFE_INTEGER`, validate a canonical fixed-width string encoding, or
use a binary format with u64 support. This blocks the persistence fields that
claim u64, not unrelated documentation.

## 4. Current reusable baseline

| Capability | What exists [V] | What Endless still needs [A/U] |
| --- | --- | --- |
| Rule seam | `src/team/rule-set.js` validates descriptor v1, action vocabulary, legality/outcomes, verification, and provenance. | Contract v2, required `designVersion`, explicit classic v0 migration, RNG policy identity. |
| Deterministic combat | `src/team/resolver.js` runs the same headless 1v1/2v2/3v3 loop and hashes its projection. | Versioned snapshot import/export and Endless lifecycle fields. |
| RNG | `src/team/rng.js` provides one ordered labelled channel and tape replay. | Keep it unchanged for classic; specify a non-shopping Endless model and its projected counters. |
| Numeric resources | `src/team/resources.js` validates/projects generic finite-number resource bags and absolute writes; the adapter emits a fixed twenty-entry SS2 set whose numeric bounds are null. | Reuse it for missing charges where appropriate; do not create resolver fields named after SS2 globals. |
| Status/items | Combatants have a simple loadout and deduplicated string statuses. | Frozen item-instance IDs/hashes, carried items, structured markers/conditions, expiry coordinates, charges. |
| Turn/team lifecycle | Resolver owns seats, controllers, stable initiative, effects, elimination, result, and settlement arm. | Explicit cycle wrap/Pressure and timed expiry, without alternate result paths or extra boss turns. |
| Terminal acknowledgement | `CampaignSettlement` and adapter result bridge gate the callback exactly once in memory. | Durable `ack-prepared` state, restore, and atomic progression apply/repair. |
| Campaign persistence | Schema-v2 immutable settled records, namespaced storage, corruption quarantine, and a versioned 1→2 migration whose timestamp is injectable but defaults to the wall clock. | Separate active progression envelope/transaction; current backend has no multi-entity atomic commit and defaults to 64 KiB. Future migrations need explicit timestamp/receipt inputs before they may be called pure. |
| Adapter | Canonical resource/status mapping, presentation commands, terminal result acknowledgement. | Per-action completion gate; no verified vanilla timeline-complete signal exists. |
| Evidence | 22 promoted goldens, including twelve normal-band melee directions, plus mapped/candidate surfaces. | No designed claim may broaden those fixtures; candidate quirks remain quarantined from authoring. |

The important correction is that stamina, ammunition, armour, base magicka,
generic numeric resources, ordered RNG, an in-memory terminal gate, and an
immutable final-record path are not blank infrastructure. Endless needs
structured identity/lifecycle and durable coordination around them.

## 4.1 Adversarial rejection envelope

These findings do not all require product decisions, but each needs a normative
counter or an executable rejection test before its owning slice is ready.

| Priority | Finding | Quantitative/adversarial consequence | Required counter or gate |
| --- | --- | --- | --- |
| P1 | Circuit duration | Multiplying the per-fight target ranges gives planning envelopes of 48–96 actor-actions for four 2v2 fights and 72–144 for four 3v3 fights; these are not statistical Circuit medians. After R-05 is repaired, the proposed headless safety bounds are at most 79 resolved actor-actions **and** 79 scheduled opportunities per 2v2 fight, hence 316 of each per Circuit. | Keep headless safety separate from the owner-approved interactive product gate. Time complete 2v2 sessions including routes, Armory, rewards, animation, control skips, and social choice; provisionally test median <=25 minutes and P90 <=40 minutes. Do not turn an action cap into a time cap without bounding decision and presentation time, and do not extrapolate D03 to 3v3. |
| P1 | Exact Legendary target tail | Because target pity does not raise rarity, six host-eligible Legendary caches plus the next can take 63 Circuits/252 wins in the deterministic rarity tail; the stationary model implies roughly 24 Circuits to the seventh eligible Legendary cache, before earlier natural identity hits. | Declare an acceptable identity-specific tail; add a category-complete fallback or shorten the bound without making Forge the general fastest rarity source. |
| P1 | Gold can become dead | Exact ordinary non-milestone baseline income is `3*roundHalfUp(20*C_t/100) + roundHalfUp(35*C_t/100)` gold/Circuit before Contract bonuses; `0.95*C_t` is only its large-`C_t` approximation. A milestone final uses the separately authored 50% row. After tier-50 chassis/services, no renewable sink is specified. On an ordinary non-milestone Circuit, Elite Foil adds approximately `0.19*C_t` and Tight Clock `0.1425*C_t` plus one Mark before integer effects. | Define bounded useful gold sinks and calculate every per-fight integer bonus; reject any Contract whose expected marginal reward is effectively the same one Mark or whose early fights dominate Concede. |
| P1 | Precommit fold is underspecified | Pity 7→8, a later natural reset, target forcing, and duplicate history must deterministically change later outcomes in the same four-fight plan. Player claims cannot retroactively affect already immutable candidates. | Every prepared outcome carries its predecessor-state hash; specify the pure fold order and whether duplicate history observes generated, offered, claimed, or salvaged fingerprints. |
| P1 | Assistance can become a second item roll | Three intentional losses may expose an independently preferable base-rank sibling outcome. | Assistance is a value-reducing transform of the same reward identity, or is honestly treated and priced as another choice; white-box loss policy must not dominate. |
| P1 | Rule Load is not a utility bound | Capacity four admits `3+1`, `2+2`, `2+1+1`, and four-minor packages; multi-tag actions may overcharge Signatures and cheap tag actions may become filler. Team Tactic removes one point from every member and creates a veto. | Test every partition under uniform-mechanics and actual-generator weights; define consequential-tag cost/timing; prevent a Signature action charging itself; compare Team Tactic against the lost package for every seat. |
| P1 | Trophy/effect gates can pass by cherry-pick | Concord currently needs one favourable and one losing cell; that does not establish robust non-dominance. Relay/Chain prerequisites may be scripted-opponent-specific; Quiver dies near cap; Stabilizer's floor makes low shields lose 100/50/33%; Breakwater can be burned by a tiny crossing. | Publish semantic-cell distribution and robust aggregate thresholds; sweep exact integer boundaries and every trigger sequence. No single showcase cell is acceptance. |
| P1 | Veteran catch-up is punitive | A tier-50 incomplete veteran accompanying a 49-tier-gap ally forgoes about `46.6*C50` gold, 108 offers, 544 all-salvage Marks, and 196 grant/XP opportunities. | At gaps 1/10/25/49 and with same-custodian mule cases, compare current Practice-only veteran, nonmechanical mentor records, deferred mentor credit redeemable only after a later veteran-frontier victory, and split-tier authored encounters. No option may grant high-tier outcomes for low-tier wins, mint a second frontier set, or improve veteran reward/action by cycling fresh allies. The owner must select an acceptable veteran opportunity-cost ceiling. |
| P1 | Stable-AI mule and natural-item funnel | One human can custodize multiple persistent AI fighters, collect several personal streams, and funnel tradeable natural Legendaries to a carry. Per actor-action normalization hides per-human-command advantage. | Concentration gates apply per actor-action, human command, and wall-clock minute across one-human/one-fighter, one-human/three-fighter, and three-custodian cases. Review when natural items bind; permit rewardless preview so experimentation is not punished. |
| P1 | Governance can deadlock or impose debt | Ranked sums can put an absent Standard-preferring member onto a debt route. Unanimity lets an absent/malicious member freeze Concede, Recovery, Pivot, Tactic, and Overtime forever. One `memberId` is not one person without sealed authority. | Nonzero debt requires explicit unanimous acceptability; choose suspension or a receipt-backed withdrawal/branch rule; seal membership authority; test absence, timeout, handoff, Sybil, and frozen unwinnable Circuits. |
| P1 | Focus warning may not create agency | “One enemy action ahead” can still land before the targeted seat's next action, and per-enemy limits can coordinate focus. | Guarantee at least one scheduled action for the target before the threatened payoff and apply focus frequency at team scope. |
| P1 | Post-cap tier may not mean harder | After raw/module caps and finite doctrines/Charters, an unbounded tier becomes an ordinal record, not monotonically increasing difficulty. Cosmetic recipe IDs can also evade no-repeat rules. | Either promise bounded bands then rotation/records, or publish a finite monotone schedule. Compare semantic mechanics fingerprints, not display IDs. |
| P1 | Rival spoofing/free AI value | Two wins with a disposable tag can bait a rival counter, then a non-tag build exploits its liability. Doctrine policy adds value outside its modifier budget. | Adversarial two-of-three tag spoof test over the complete horizon; budget policy value; define “within 15%” as a vector norm that never raises raw chassis over the cap. |
| P1 | Mastery offer steering | One offer follows the semantic tags on the currently equipped build, so a player can equip an offer-fishing loadout immediately before a level threshold. | Compare honest locked builds with threshold-targeted tag spoofing. Either accept the sacrificed combat value as intentional steering, or key compatibility to a persisted preference/history rather than one equipped snapshot. |
| P1 | Recovery can counterfeit paid rank | A clear-only Recovery may raise bare `highestClear`, allowing accessibility progress to leak into prestige, Trophy, leaderboard, or Contract-rank meanings that imply paid difficulty. | Use typed paid-clear facts for every paid-rank consumer. Test ordinary claim/evolution gates separately if Recovery clearance is intentionally accepted there. |
| P1 | Four-Charter rotation is forced | Four cards plus “no repeat within four” leaves only the oldest legal card after the first rotation. `standard-catchup` can reward race-one-character then advance another under easier bands. | Label initial behavior deterministic rotation, shorten the window, or ship more cards. Compare simultaneous versus race/catch-up; Standard catch-up cannot grant the same boundary mechanical-choice rate without paying equivalent challenge. |
| P0 spec | JSON u64 conflict | See R-06: canonical unsigned 64-bit integers, rejection of numeric strings, and ordinary JavaScript JSON numbers cannot all coexist above `2^53-1`. | Cap authoritative counters at `Number.MAX_SAFE_INTEGER`, validate canonical fixed-width strings, or select a binary u64 format. Pick one before schema authoring. |
| P1 | Metrics are not operational | “Within 5%,” “15% of cells,” “two consequential actions,” “same budget,” and “optimal policy” lack metric, cell distribution, solver, confidence, and tie rules. | Define cells as version × team size × mechanics-distinct budget band × Charter × semantic recipe fingerprint × persisted seed; report both uniform-mechanics and actual-generator weighting. |

The reward arithmetic itself is sound: 2.2 expected caches per four-win
Circuit, natural Legendary around one per 29.4 wins, and an independent
200,000-Circuit check of the stated model yielded one Legendary per 13.79 wins
with pity, 59.29% forced. The problem is not a calculation error; it is the
unselected tail, sink, fold, and policy contract around those rates.

## 5. Exact MVP mechanic inventory

The MVP is not an “eight-effect rule set.” Its complete authored surface is:

| Surface | MVP content | Owner/seam |
| --- | --- | --- |
| Baseline combat | Selected Endless action vocabulary, exact probability convention, action/resource costs, ordinary targeting and elimination | `endless-v0` rule set; resolver retains team lifecycle |
| Global battle law | Arena Pressure, cycle counting, monotone stack-8 termination actions; decide whether Control Fatigue is omitted or fully specified | Rule legality/outcomes plus resolver lifecycle state |
| Comparator action | Known 1-Load Approach Kit with one battle-local charge | Designed rule action + carried-item/loadout state |
| Random loot effects | Measured Quiver, Critical Relay Grip, Blooded Reserve Pommel, Guarded Overdraw, Second Wind Guard, Breakwater Ward, Stabilizer Shield, Pursuit Step | Designed effects; eight total |
| Trophy package | Concord Trophy combines Relay and Pursuit plus the Trophy-only Concord Chain interaction and Bash/Charge stamina burden | Designed effect/sequence + blueprint/escrow state |
| Loadout grammar | Four Rule Load, six carried slots, family/slot mapping, strongest-only groups, exact active item linkage, no proc chains | Rule validator + canonical frozen loadout |
| Opponents | Four previewed doctrines; deterministic Scout/Foil/Mixed/Final recipes; capped stat budgets | Pure campaign generator + rule AI/actions |
| Routes | Standard plus alternating Elite Foil/Tight Clock; four fights; no combined debts | Campaign plan and disclosed UI |
| Rewards | Personal precommitted four-key outcomes, cache offers, Forge/Salvage, fixed Concord source, custody/claim | Progression reducer/transaction + UI |
| Continuation | Concede, Rematch, one Recovery branch, receipts, exact resume | Active battle/progression transaction |

Before implementation, one normative appendix must list every MVP action,
effect, state field, trigger, timing point, RNG need, resource read/write,
expiry, event, failure mode, and projection/hash location. “Eight effects” is
only the random loot row.

## 6. Required architecture specifications

### S-01 — rule contract v2 and provenance

Current change surface:

- `src/team/rule-set.js`: bump the contract; require a nonnegative safe-integer
  `designVersion`; add it to `describeTeamRuleSet`.
- `src/team/placeholder-rules.js` and every shipped descriptor: explicitly
  declare classic `designVersion: 0`; never default a missing value at runtime.
- `src/team/resolver.js`: bump battle-state version; project/hash the full rule
  identity and the chosen validated RNG model.
- `src/campaign/from-battle.js`, `record.js`, and `migrations.js`: bump the exact
  record schema and carry/migrate the identity honestly.
- All recipes, items, reward outcomes, receipts, saves, and peers: reject an
  `(id, contractVersion, designVersion)` mismatch before mutation.

Adding the projected field changes combat hashes, terminal discriminators,
completion tokens, and derived record IDs. The migration must not regenerate or
reinterpret old identifiers. Schema-1 records whose rule identity is genuinely
unknown remain unknown.

Contract v2 keeps today's legal verification enum. `endless-v0` remains
`placeholder`, `runtimeVerified: false`; a prose provenance note can record
designed intent. If v2 retains an explicit `designIntent` field, it must
validate, project, hash, persist, and migrate it. A future `designed` enum is a
separate migration.

**Pass gate:** invalid/missing design versions reject; classic explicitly uses
0; Endless uses its reviewed positive version; identity mismatches reject; pure
migrations are idempotent; classic deterministic compatibility tests pass.

### S-02 — RNG model identity and state

`OrderedRngChannel` remains the classic/tape implementation. A separate Endless
channel must have an explicit validated model identity; contract version alone
cannot select it because classic descriptors also migrate to v2.

The selected specification must define:

- structural draw coordinates and occurrence rules;
- common quantiles and every coupled secondary domain if coupling is selected,
  or the complete payoff/visibility schema and byte-equality rule across UI,
  log, and save inspection if public forecast is selected;
- projected model/seed/counters/forecast/hash and exact active-attempt restore;
- when a future attempt seed comes into existence;
- which irreversible receipt derives it;
- which inputs never influence it; and
- compatibility/rejection behavior for peers and saved battles.

Do not select semantic behavior by checking `rules.id`, accept free-form labels
as authority, or replace ordered classic tapes.

**Pass gate:** R-02 is closed; any difference in next-draw- or forecast-relevant
state hashes differently; unused/presentation/logging calls consume nothing;
classic roll order remains unchanged.

### S-03 — structured canonical mechanics

Add a versioned closed schema, separate from the existing compatibility
`status: string[]`, for:

- frozen equipped/carried item-instance IDs and definition/loadout hash;
- battle-local charges and once-per-battle markers;
- counted/timed conditions with owner, source, arming event, and deterministic
  expiry coordinate;
- explicit cycle/Pressure state; and
- only those new effect kinds that cannot be represented safely by existing
  absolute resources/status activation.

Persistent combatant IDs use one canonical ASCII grammar with explicit length
and normalization rules. Initiative and every other identifier tie-break use a
specified ordinal byte/code-unit comparator, never locale-sensitive
`localeCompare()`.

Every rule-readable field must be present in the authoritative projection and
hash. Campaign inventory writes cannot change an active fight. Cycle wrap and
expiry must behave identically across dead-seat skipping in 1v1/2v2/3v3.

The existing final campaign-record schema rejects vanilla field names and is
not an active snapshot. Design a separate canonical serializer instead of
dumping live adapter resource keys into final history records.

**Pass gate:** snapshot→restore→snapshot is byte-identical; any rule-readable
difference changes the hash; malformed/unknown fields fail closed; classic
resource/status behavior remains unchanged; ID grammar rejects aliases and
cross-locale fixtures produce the same initiative order.

### S-04 — one atomic progression/active-battle boundary

Keep immutable battle history separate. Add a progression subsystem with
logical sidecar and active-battle schemas but one durable commit unit, unless a
reviewed write-ahead protocol proves cross-store atomicity. The current
`CampaignStore` provides independent key reads/writes/removes, not a
transaction.

The durable envelope must include:

- campaign, member, item, plan, escrow, key, and version identities;
- active attempt sequence and immutable attempt-start/pre-ack snapshots;
- operation/mutation sequences and event/presentation high-water marks;
- RNG model/state, frozen rule/generator/definition identities;
- pending settlement intent and bounded recent receipts; and
- collision-resistant canonical digests, schema/entity versions, migration
  state, and explicit repair/error. Use the existing SHA-256 campaign-record
  pattern for snapshots, receipts, and durable identities; reserve the current
  eight-hex FNV-1a combat hash for non-authoritative fast desync diagnostics.

Active plans/snapshots never migrate mid-attempt. Old implementations remain
pinned until a clean boundary. Future schemas remain untouched.

**Pass gate:** crash after every durable boundary resumes the same attempt and
never allocates another sequence; invalid identity/hash enters repair without a
grant; migrations are clean-boundary, pure, idempotent, and backed up; a
100-Circuit soak stays within declared bounds; measured MVP worst-live bytes,
including both snapshots and explicit serialization/backend overhead, remain
below the configured atomic backend limit. If the current 64 KiB limit cannot
hold that envelope with margin, raising and versioning the limit is part of
S-04; a separate 100 KiB design target cannot waive the backend gate.

### S-05 — durable reward settlement coordinator

Keep the in-memory terminal gate, but wrap it in this durable sequence:

1. atomically write immutable `ack-prepared` plus embedded pre-ack bytes;
2. submit the exact terminal acknowledgement through the existing resolver;
3. run one pure reducer against the frozen plan/keys;
4. atomically commit attempt receipt, every personal classification/grant,
   key/set/clear/pot transition, sequence high-water, and pre-ack removal;
5. on load, rehydrate an orphaned `ack-prepared` state and replay the same gate.

The optional immutable `CampaignRecorder` is history, not reward authority. Its
current failure-collection behavior cannot be the transaction.

**Pass gate:** fault injection before/after reservation, action checkpoint,
elimination, pre-ack, latch, callback, commit, and cleanup yields exactly one
attempt receipt and zero/one correct grant per participant. Decided without
pre-ack grants nothing; committed reload cannot apply twice; mixed personal
mutations are all-or-nothing; conservation holds.

### S-06 — headless simulator

Add the designed rules under `src/rules/`, pure generators/reducers under a new
progression layer, and a thin simulator that calls the **same** resolver,
transaction API, and settlement coordinator. Its in-memory backend implements
the same atomic contract. A synthetic headless terminal acknowledgement must be
explicit and must never become the playable adapter default.

**Pass gate:** byte-identical 12-fight seeded fixture; at least 100 completed
Circuits with no finite endpoint, deadlock, ID collision, or unbounded state;
1v1/2v2/3v3 properties; reload/fault tests use the real continuation path; all
acceptance metrics are machine assertions.

### S-07 — playable per-action acknowledgement

The terminal result bridge is not an action gate. Playable integration needs a
resolver-owned monotonic action operation ID, token-bearing presentation
commands, and an action acknowledgement bridge. `VanillaBattleHost.submit`
must refuse action N+1 while N is awaiting completion; AI advancement pauses
after one submitted action. Restore re-presents the same operation without
re-resolving or redrawing.

Per-action and terminal tokens remain distinct. Self-target, zero-event,
unmapped/no-animation, knockout, AI continuation, and terminal actions need
explicit policies.

Most importantly, no byte-verified vanilla timeline-complete signal exists.
Mock protocol tests can proceed later, but playable binding cannot be declared
ready by inventing a callback. Under the current no-capture assignment, this
gate remains [U] and fails closed.

**Pass gate:** correct token opens once; duplicate is harmless; mismatch
refuses; N+1 cannot rebind before N; restore is exact; a separately evidenced
surface signal exists before playable integration is called verified.

## 7. Missing normative authoring inputs

The design's rates and fractions are hypotheses. Before the headless build,
version and review these exact finite inputs:

1. XP per paid fight/final and the complete pace table that closes R-01.
2. Tier-1–50 stat budgets and allocation rules, including all dead-cap axes.
3. Standard chassis catalog, slot/family budgets, prices `C_t`, and integer
   interpolation/rounding for every tier.
4. Baseline Endless action vocabulary, legality, probability convention,
   damage, stamina/ammunition/magicka costs, range, target, and AI value.
5. Four doctrine base templates, liability/module deltas, budget caps, and
   Scout/Foil/Mixed/Final assembly order.
6. Exact eight-effect/Trophy definitions, exclusions, item pools, rarity cells,
   Rule Load costs, stacking groups, and total generation matrix.
7. Pressure/expiry coordinates and whether Control Fatigue is in or out of MVP.
8. Cache/pity/target/Forge/gold/maintenance tables after R-03 is closed.
9. Stable definition, generator, rule-design, and migration version IDs.

No simulator can validate “meaningful choices” against missing chassis,
opponent, and action numbers.

## 8. Ordered delivery sequence

Steps 1–2 are specification work. No implementation slice beginning at step 3
may start until every §10 gate is reviewed and the owner then gives the separate
implementation authorization. Each authorized slice lands separately and must
leave classic tests green.

1. **Owner record:** decide EP-D01–EP-D06 and select repairs for R-01–R-03.
   R-04–R-06 specifications remain mandatory before their owning code.
2. **Normative specifications:** MVP surface appendix, pace/economy tables, RNG
   contract, canonical mechanics schema, transaction/repair protocol.
3. **Rule contract v2:** explicit classic migration and provenance/hash tests;
   no Endless battle yet.
4. **Battle snapshot/RNG state:** versioned export/import and selected Endless
   RNG model, preserving ordered classic tapes.
5. **Atomic progression envelope:** reducers, transactions, migrations,
   active-attempt restore, receipt/conservation tests.
6. **Settlement coordinator:** `ack-prepared` repair and fault matrix.
7. **Structured mechanics:** items, conditions, charges, cycles, Pressure.
8. **`endless-v0` plus generators:** exact MVP surface only.
9. **Headless simulator:** 12-fight fixture, 100-Circuit soak, adversarial search,
   1v1/2v2/3v3 properties.
10. **Playable protocol:** only after headless acceptance; mock action gate first,
    evidenced vanilla signal before binding.
11. **2v2 UI:** routes, preview, Armories, reward/custody, provenance, repair.
12. **Expansion:** content, rivals, locker/trade, then 3v3 presentation.
13. **Launcher/deployment:** separate approval after playable acceptance; never a
    hidden step in design implementation.

## 9. Review and test ownership

Future work should keep file ownership narrow:

- parity/candidate authors do not read this design while selecting hypotheses;
- rule-contract/state/persistence reviewers own cross-cutting schemas before an
  Endless feature writer consumes them;
- one simulator exercises production reducers/resolver rather than copying
  logic;
- adversarial tests are authored independently from the mechanic where
  practical; and
- no design branch writes golden, observation, manifest, divergence, candidate,
  `src/golden`, classic-rule, runtime-capture, launcher, or installed-game data.

Every future mechanic retains two required annotations: classic parity versus
separate rule-set seam, and invited degeneration plus counter/rejection test.

## 10. Exit criteria for “implementation-ready”

All of these must be true in a reviewed commit:

- EP-D01–EP-D06 are accepted or superseded by fully normative, explicitly
  accepted replacements; rejection or an open revision remains blocking.
- EP-A01–EP-A03 are accepted or superseded by separate fully normative,
  explicitly accepted owner/date-stamped replacements, and
  R-01–R-03 have one selected normative repair each, not merely options;
  R-04–R-06 have complete executable specifications.
- S-01–S-07 have closed schemas/protocols and objective test plans; S-07 may
  remain a later playable blocker while headless work proceeds.
- Every numeric input in §7 is authored, versioned, and total over the MVP.
- Headless scope and playable scope are explicitly separate.
- Classic ordered RNG, rules, fixtures, and evidence remain untouched.
- No document calls a designed rule runtime-verified or a custom campaign
  vanilla campaign parity.
- A reviewer can trace every persisted or rule-readable field to validation,
  projection, hashing, migration, and fault behavior.
- After every gate above is reviewed, the owner gives a separate explicit
  implementation authorization; design approval alone does not imply it.

Only then may an implementation PR be proposed, beginning with the
contract/schema slices rather than the full game mode.

## Repository references

- [Owner decision record](endless-progression-decisions.md)
- [Stable progression proposal](endless-progression-system.md)
- [Quantitative diagnosis and external patterns](progression-diagnosis.md)
- [Swords & Sandals mod-scene survey](swords-and-sandals-mod-scene-survey.md)
- [Rule-set seam](../../src/team/rule-set.js)
- [Team resolver](../../src/team/resolver.js)
- [Generic resources](../../src/team/resources.js)
- [Ordered RNG](../../src/team/rng.js)
- [Campaign persistence contract](../campaign-persistence.md)
- [SS2 adapter contract](../ss2-adapter-contract.md)
- [Roadmap](../roadmap.md)
