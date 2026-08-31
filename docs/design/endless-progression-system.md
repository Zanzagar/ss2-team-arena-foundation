# Endless progression system: Arena Circuits and the Armory Ledger

**Status:** sections D/E design deliverable for the
[endless-progression brief](endless-progression-brief.md). This is a design
specification, not an implementation plan or authorization to change combat
code, measured fixtures, the launcher, or the installed game.

**Research date:** 2026-08-30.

## Evidence discipline

This document continues the repository's separation between evidence and
design:

- **[V] Repository evidence:** a fact recorded in the fingerprinted build's
  [battle map](../integration/ss2-battle-map.md), the
  [adapter contract](../ss2-adapter-contract.md), the
  [rule-set seam](../../src/team/rule-set.js), or another repository source.
  The source's own `runtime-verified`, `static/byte-mapped`, `candidate`, and
  placeholder qualifications still apply. `[V]` does not promote a candidate
  to a golden.
- **[D] Derived:** arithmetic or a direct consequence of cited inputs.
- **[A] Assumption or design proposal:** a number, cadence, rule, name, or
  architectural recommendation introduced here.
- **[U] Unverified:** needed empirical or implementation evidence is not yet
  established. For a vanilla claim this means no behaviour claim may be made;
  for a designed system it means the proposal still requires measurement or a
  chosen implementation.

The quantitative reason for this proposal, the external reference-game
research, and their full source trail are in the
[progression diagnosis](progression-diagnosis.md). The public-record research
on Champion Rush, Extended, Emperor's Requiem, Neomatons, and the wider
Classic Collection is in the
[mod-scene survey](swords-and-sandals-mod-scene-survey.md). This document does
not silently promote external descriptions or community reports into evidence
about the fingerprinted build.

All system names, levels, probabilities, budgets, capacities, and tuning gates
below are `[A]` unless expressly labelled otherwise. Exact vanilla unlock
chronology, XP requirements, opponent stat curves, shop prices, and tournament/
campaign `fight_mode` use beyond the runtime-observed ordinary-arena
`fight_mode = "duel"`/first-blood context remain `[U]`. They must be measured or
authored before the numbers become implementation constants.

No Ruffle session, runtime-capture tool, installed game file, bundled mod
source, decompiled code, or protected measurement fixture was used for this
design.

---

## Executive decision

Build a separate, clearly labelled progression mode called **Arena Circuits**.
It should not pretend that unbounded levels can support unbounded vertical
power.

1. **End ordinary vertical growth near the known content boundary.** The
   designed career has fifty finite combat/chassis tiers. Campaign level can
   continue to 100 and beyond, but raw stat and base-item budgets stop rising
   at level 50. `[A]` Community sources place the ordinary armour/champion
   boundary near levels 48–50; the repository does not verify the exact
   vanilla curve. [Diagnosis](progression-diagnosis.md#18-opponent-difficulty-the-listed-boss-schedule-ends-the-stat-curve-is-unknown)
2. **Make later power change rules under a hard active budget.** Behavioural
   affixes, Techniques, spell Forms, Signatures, and Keystones all consume the
   same four-point **Rule Load**. The library can grow; the equipped rules do
   not grow without bound.
3. **Generate opponents from authored, readable modules.** A procedural enemy
   is a tested body plus a doctrine, at most a small number of compatible
   modifiers, and a disclosed liability. Generation composes rules; it never
   invents rules.
4. **Let the team select visible difficulty.** Opponent power follows a fixed
   career/challenge budget, not a mirror of the party's current equipment.
   Optional Contracts add disclosed debts and rewards. Taking off gear never
   summons an easier opponent.
5. **Make loot personal, sparse, steerable, and behaviour-led.** Rarity
   controls rule complexity, not a larger chassis number. Every eligible
   persistent combatant gets an independent, precommitted reward outcome—an
   item offer on cache or automatic Marks otherwise; last hit, damage dealt,
   controller identity, and survival do not own progression.
6. **Treat persistence as part of the mechanic.** Opponents and rewards are
   persisted before reveal, combat and campaign RNG are separate, settlement
   is crash-safe and idempotent, and all progression lives in a versioned
   sidecar rather than vanilla save fields.
7. **Be honest about infinity.** A finite authored grammar can produce long
   replayability, not literally infinite novelty. When the lateral library is
   exhausted, further levels award records or cosmetics; they must not present
   a fake scalar choice as meaningful progression.

This is intentionally a **designed-mode** proposal. Existing measured classic
behaviour remains untouched. The current rule descriptor has only
`placeholder` and `runtime-verified`; implementation should eventually add a
third verification class such as `designed` so intentional non-parity is not mislabeled
as measured vanilla or unfinished placeholder. Until that contract exists,
an `endless-v0` rule set must remain `runtimeVerified: false`. [V/A]

## Non-negotiable invariants

These are acceptance requirements, not flavour:

- Active Rule Load never exceeds four per combatant.
- Base stat and item-chassis budgets never rise after designed career tier 50.
- Opponents never read the current player equipment snapshot to set their raw
  power.
- No procedural generator creates a new rule; it selects versioned authored
  modules from an incompatibility-tested catalog.
- Every positive champion/rival modifier has a visible liability.
- A personal item belongs to a stable `combatantId`; an explicitly unbound
  locker item belongs to the campaign. Neither ever belongs to a seat or
  current controller.
- Each mechanically incomplete `grantEligible` persistent allied combatant
  receives one personal reward outcome after its paid team win, including an ally knocked out
  before victory: either an item offer controlled by its
  `custodianMemberId` or automatic Forge Marks.
- A mechanically complete combatant uses explicit `recordEligible` slots for
  newly prepared typed `recordFact` outcomes and never receives a
  disguised mechanical item/currency grant. Completion does not rewrite the
  one already prepared frontier set: if it is `kind: reward`, its existing
  unspent outcomes are the sole bounded grandfather and may settle or be
  Concede-forfeited exactly as pinned. No key or outcome may be added, replaced,
  or rerolled. At most one personal reward-typed Overtime pot in an envelope
  precommitted before the completion marker may remain or later activate as a
  second explicit bounded reference; it may be sourced by that set or by the
  immediately closed final set. No reward-typed personal pot may be prepared
  after completion. Every
  later frontier set prepared while completion remains true is `kind: record`.
- Reward quantity or quality never depends on last hit, damage, healing,
  survival, action count, controller kind, or local clock.
- Combat RNG never generates routes, opponents, or loot.
- Loss, reload, reconnect, and Concede never reroll an active paid or Recovery
  route, opponent, or reward plan. Concede tombstones unearned paid keys and
  binds the already persisted Recovery branch; neither branch can replace or
  refresh that frontier's paid outcomes.
- Every acknowledged battle attempt produces exactly one durable attempt
  receipt. A `grantEligible` win produces exactly one durable personal grant;
  a `recordEligible` win produces exactly one typed `recordFact`;
  a `clearEligible`-only win may advance its frozen branch and frontier but
  produces zero grants. Loss and Practice produce zero grants and no clear.
- No new endless mechanic changes classic-mode semantics.

---

## 1. Vocabulary and power model

### 1.1 Career level, career tier, and challenge tier

**Career level** is the long progression counter shown to the player. It can
pass 100. It unlocks systems, library options, rivals, and Epoch records.

**Career tier** is the finite vertical budget used by base stats and item
chassis. It is `min(careerLevel, 50)` in this proposal. The exact stat budget at
each tier cannot be authored honestly until the player and champion curves are
measured or deliberately replaced. `[U/A]`

**Challenge tier** is the canonical term for the disclosed opponent/reward
tier selected for the next
Circuit. It is unlocked by clears, not calculated from equipped gear. A player
may hold or revisit a lower tier, but repeated lower-tier clears cannot be the
fastest route to higher-tier power.

Challenge tiers after career tier 50 do not create higher raw stat or chassis
budgets. They select harder authored composition, Contracts, and Charter rules
within the same vertical cap.

This separation makes a level 137 gladiator more *experienced and flexible*,
not automatically several orders of magnitude stronger than a level 100
gladiator.

### 1.2 Encounter, battle attempt, and settlement

A **Circuit encounter** (or fight) is one scheduled recipe with one personal
slot key for each eligible persistent combatant. Its prepared set kind is
authoritative: reward-kind sets use `rewardEligibilityKey` (including the one
bounded completion grandfather), while record-kind sets use
`recordEligibilityKey`. Each key survives losses and can settle its declared
outcome only once; Practice participants have no key.

A **battle attempt** is one resolver instance with a unique
`battleSequence`. Every team-elimination result plus matching animation
acknowledgement settles that attempt exactly once and writes an attempt
receipt. A settled loss grants nothing and leaves the encounter/plan ready for
another attempt. The first paid winning settlement consumes each participating
personal key by its frozen kind in one atomic transaction: reward keys commit
personal grants and record keys commit typed `recordFact` outcomes. Mixed teams
therefore do not coerce every participant into the grant channel. The settlement
then advances the Circuit. A Practice battle also gets an attempt receipt but
has no grant.

Eligibility stores one frozen paid-slot classification per combatant--
`grantEligible`, `recordEligible`, or none--plus the independent boolean
`clearEligible`:

- `grantEligible` means the selected challenge tier is that combatant's current
  frontier **and** the scheduled paid-fight slot has an unspent personal
  `rewardEligibilityKey`. Its first winning settlement consumes the key and
  grants the precommitted outcome exactly once.
- `recordEligible` is mutually exclusive with `grantEligible`: a frontier slot
  prepared as `kind: record` has one unspent `recordEligibilityKey` and exactly
  one precommitted `recordOutcome`. That outcome contains `xpDelta`--zero or
  authored post-cap XP, still capped to one career level--and one payload kind
  from `none`, `cosmetic`, `title`, or `seeded-record`. XP and one non-`none`
  payload may coexist; `xpDelta = 0` plus `payloadKind = none` is the explicit
  no-outcome. The winning settlement consumes the key and writes exactly one
  durable `recordFact` containing that outcome. It cannot mutate gold, items,
  caches, Marks, pity, targets, sources, rarity, Rule Load, or any other
  mechanical-power channel. A prepared record slot remains record if a later
  catalog migration reopens completion; the next-created and every later set
  remains reward-kind until completion is established again, so migration never
  rewrites a displayed outcome.
- `clearEligible` means the selected challenge tier is that combatant's current
  frontier and the frozen branch is authorized to advance Circuit/clear state.
  A paid branch has one paid classification plus `clearEligible` while its key
  is unspent. The precommitted post-Concede Recovery branch is `clearEligible`
  with paid classification none. Historical replay and ordinary Practice are
  neither paid nor clear eligible.

Thus grant and clear usually commit together, but they are not synonyms. A
Recovery win can advance its encounter—and its final can advance
`highestClear`—without XP, currency, item, pity, target, Contract, Trophy-source,
or other grant-channel mutation.

Concede is a campaign transition, not a battle settlement. It can forfeit only
unearned encounter keys; it can never roll back XP, currency, items, pity, or
receipts already committed by earlier wins.

Each prepared record outcome stores `{ outcomeId, xpDelta, payloadKind,
payloadDefinitionId|null, seed|null, recordValueUnits, definitionVersion,
outcomeHash }`. `outcomeId` is derived from its eligibility key and is stable
across retry. `recordValueUnits` is an authored nonnegative comparison score,
not currency: it cannot be spent, transferred, or converted into power. An
explicit no-outcome or duplicate cosmetic/title unlock has value 0; a new
cosmetic/title or an improvement to an authored seeded-record category has a
published positive integer value. Settlement folds XP into bounded career
counters, cosmetic/title payloads into
finite catalog bitsets, and seeded records into one catalog-bounded
highest-or-latest register per authored category. Only the existing
32-receipt detail window retains the full fact; actor/battle high-water marks
reject older replay. No append-only record history is created.

Recovery narrative/record outcomes and Overtime record/title pot components
reuse this exact payload/value schema with `xpDelta = 0`. Their `outcomeId` is
derived from the frozen Recovery-final key or personal pot ID, and settlement
writes a namespaced `recoveryRecordFact` or `potRecordFact` into the same bounded
catalog registers/high-water protocol. They do not consume a
`recordEligibilityKey`, create another fact for the same outcome ID, or carry a
second value scale.

### 1.3 Chassis power and rule power

Every equippable item has two independent budgets:

- **Chassis budget:** its ordinary tier-appropriate armour, damage, or existing
  spell payload. Items of the same family/profile/tier share the same total
  chassis budget regardless of rarity.
- **Rule payload:** a versioned behaviour modifier that changes sequencing,
  resource exchange, targeting, reactions, or another explicit action rule.
  Rule payload consumes Rule Load.

A Legendary is therefore not “the same sword with 40% more damage.” It is the
same tier-budgeted sword with a distinctive rule, an explicit burden, and a
large opportunity cost.

### 1.4 Rule Load

Rule Load is a per-combatant active budget shared by all behaviour-bearing
equipment and abilities:

| Career level | Rule Load capacity | Purpose |
| ---: | ---: | --- |
| 1–4 | 0 | Learn the baseline action and target grammar. |
| 5–24 | 1 | One minor rule can define an early preference. |
| 25–39 | 2 | A major rule or two compatible minors creates a sequence. |
| 40–49 | 3 | A stronger identity becomes possible without a full package. |
| 50+ | 4, permanently capped | Complete build budget; later progression adds alternatives, not capacity. |

Load costs are categorical:

- minor affix or narrow Technique/Form: 1;
- major affix, Signature Form, or two-tag Keystone: 2;
- Legendary/Trophy keystone with an explicit burden: 3;
- maximum one 3-point identity per combatant;
- maximum two points from any ordinary affix family; a singular 3-point
  identity instead occupies the separate identity group and must carry its
  authored burden;
- maximum one hard-control package and one universal survival/escape package
  per combatant.

The six mapped inventory item slots do not bypass Rule Load. An ordinary spell
with unchanged base semantics may cost zero; a new Form or behaviour trigger
costs Load. [V/A]

**Why a single budget:** separate budgets for loot, passives, spells, and
team bonuses would be independently legal but multiplicatively explosive when
combined. One visible budget makes the real opportunity cost legible.

### 1.5 Team budgets

Per-fighter limits are not enough in 2v2/3v3. The team also has:

- **Team Control 2:** a hard lost-turn effect costs 2, so only one such package
  may be active across the team; it still pays its ordinary per-combatant Rule
  Load;
- **Team Survival 1:** at most one package tagged universal
  escape/invulnerability across the team;
- **Team Burst 2:** a multiplicative-burst package costs 2, so at most one is
  active across the team;
- one jointly selected **Team Tactic** slot, unlocked at level 50, for any
  ally-wide rule; selecting it costs 1 Rule Load on every participating
  combatant, so it is not a free fifth rule;
- strongest-only stacking groups for same-family buffs and multipliers;
- no item-granted extra turns;
- no multiplicative ally-wide proc chains.

The validator rejects an illegal team loadout before the Circuit starts and
explains which categorical budget failed.

### 1.6 Already-capped vanilla axes

Designed vertical offers use marginal-value validation:

- once integer Speed reaches 40, its mapped movement result is capped; Speed is
  removed from further vertical choices rather than offered as a dead point;
- mapped ammunition capacity stops increasing after level 45, so later level
  rewards never claim to add capacity. Any later ammunition identity must be a
  visible Rule Load exchange/Technique, not a hidden capacity rank;
- any stat/item offer whose derived combat projection is unchanged is rejected
  or replaced with a non-scalar option before display.

These rules do not claim a vanilla respec or allocation schedule. They prevent
the designed career from spending levels on axes the mapped formulas have
already capped. [V/A]

---

## 2. The four-fight Arena Circuit

An Arena Circuit is the repeatable unit. Four fights are long enough to test a
locked build against more than one pressure and short enough for a local co-op
session.

1. **Scout:** one disclosed doctrine and no positive rule modifier.
2. **Foil:** a different primary doctrine chosen to ask a different question.
3. **Mixed:** two compatible known pressures, within the team complexity cap.
4. **Final:** an elite, returning rival, or procedural champion. When a
   level-gated milestone is pending, its authored boss replaces this final.

At Circuit start the team receives three persisted route offers. Each shows:

- challenge tier;
- first opponent doctrine;
- likely final reward family;
- any Contract debt;
- whether a rival can return;
- rule-set and generator provenance.

The team selects one route and each combatant selects one personal hunt family:
`weapon`, `armour`, `shield`, or `spell/technique`. The opponent recipes,
reward plan, RNG cursors, and participating `combatantId` roster are then
persisted. Active equipment, Rule Load, and roster lock for all four encounters.
A disconnect may change that combatant's controller to AI, but no bench
substitution may multiply rewards or bypass the series test.

A defeat does not regenerate anything. Doctrine, signature, liability, target
policy, and every other decision-relevant fixed mechanic are disclosed before
the first attempt; losing reveals no hidden module. Rematch exists only after
team elimination—there is no voluntary restart action. Every Rematch restores
the complete immutable attempt-start battle projection: health, armour, wards,
position, statuses, stamina, magicka, ammunition, per-battle charges, equipment
durability, combat seed, and starting combat-RNG label counters/hash. Identical commands
therefore replay identically. A changed policy can consume a different labelled
draw sequence but cannot shop for a more favourable attempt seed or pad label
counters with a restart. The loss log exposes only events already resolved, never
the raw seed, unconsumed draw tape, or alternate-branch outcomes.

Arena-Circuit carried Techniques use battle-local charges restored by Rematch.
Any equipment-durability counter in designed mode is likewise battle-local and
never mutates the campaign item. No persistent stack consumable or durability
sink is legal in a Circuit until an action-level durable commit/rollback
contract is specified and fault-tested. Concede is the only voluntary exit and
commits its forfeiture instead of restoring an attempt.

Players may concede the Circuit, but doing so writes an abandonment receipt
and forfeits only its **unearned** encounter keys and Contract completion.
Earlier committed XP, rewards, items, currencies, and pity are never rolled back.
Concede can be proposed only between attempts, with no reserved/active/decided/
`ack-prepared` battle or pending settlement. Unanimous consent from the frozen
custodian electorate atomically writes the receipt, tombstones every
participant's remaining key/full-rank outcome, forfeits Contract completion,
marks every still-inactive personal Overtime pot sourced by a forfeited final as
terminal `source-forfeited`, clears any matching
`grandfatherOvertimePotId`, and binds the prepared Recovery branch. Recovery or
restart can never restore that pot. A crash exposes either all of that mutation
or none; completion recorded after Concede ignores the terminal pot.
The campaign then binds to a seed-committed zero-debt **Recovery Circuit** at
the same challenge tier. This is also the only **fallback route**: its four
recipes, including the same queued milestone final if any, were persisted with
the paid route before reveal. It writes attempt receipts but grants no XP,
gold, cache, Marks, pity, target progress, Contract rank, or first-clear bonus.
Fights one through three are zero-grant clear-only transitions; its final may
advance `highestClear`, award only baseline narrative/source credit, and create
the next frontier set under §3.1's shared next-set-kind rule. It never consumes
or replaces a paid key.

No route ballot reappears at that tier. Conceding Recovery restarts the same
four recipes, seed, and clear-only state. The frozen `combatantId` roster stays
the same; before the first Recovery attempt its custodians may choose one new
loadout which then locks for all four fights. This makes retreat possible
without creating extra paid encounters, RNG shopping, or a route/source reroll.
Recovery restart has the same between-attempt/unanimous rule and one idempotent
restart receipt; it consumes no RNG and cannot repeat the one loadout choice.

This block structure asks a different question from a one-fight counter-pick:
**what kit can cover a short, disclosed range of problems, and where will the
team accept a weakness?**

### 2.1 Build locks and the late Pivot

Until level 70, roster and active Rule Load are locked for all four fights.
Battle-local Technique charges may reset only at a new battle attempt;
equipment, Forms, and behaviour affixes cannot be swapped between fights.

At level 70, each combatant may declare two reserve Rule Load effects. Once per
Circuit, after fight two, the team may spend one **Pivot** to swap exactly one
active effect with one reserve effect. Later exact recipes remain hidden;
players know only the route doctrine family.

The Pivot is a controlled adaptation decision, not a free respec. Full
respecification occurs only between Circuits.

### 2.2 Failure and assistance

Failure should make disclosed information easier to understand, not reveal a
better random future:

- the route, recipe, and rewards stay fixed;
- a loss preserves the encounter and full-rank plan; its replayable combat log
  highlights interactions among already disclosed modules;
- after three losses to an authored milestone boss, the team may take one
  disclosed **Training Assistance** for that boss;
- selecting assistance is one atomic encounter transition: it removes the
  boss's highest-cost positive modifier, reveals the remaining module list,
  switches each participant to the precommitted base-rank outcome attached to
  its **same** reward/record slot key, and irrevocably tombstones the full-rank
  outcomes;
- an assisted zero-debt clear receives ordinary base rewards and narrative/
  blueprint credit, but no Contract rank, challenge-debt credit, or first-clear
  bonus;
- assistance cannot be selected for procedural farming encounters.

Training Assistance is a bounded accessibility path, not an invisible dynamic
difficulty system. Removing an already authored opponent module is
campaign/recipe work when all remaining actions keep their selected rule-set
semantics; it does not grant the rule set authority over turns or settlement.

### 2.3 Shared-decision protocol

Campaign authority belongs to persistent campaign members, not the host
process, current seat controller, or number of combatants one person happens
to custodize.

- Each active `custodianMemberId` receives one ballot, even when that member
  custodizes several hot-seat combatants.
- Route/Contract selection uses a persisted ranked ballot over all available
  offers (three in full design, two in the MVP). Lowest total rank wins; ties
  choose the lower-debt offer, then the
  stable `offerId`. A member absent before voting gets the deterministic
  zero-debt-first default ballot.
- The eligible member set freezes when a proposal opens. Team Tactic
  selection, spending the one shared Pivot, choosing Training Assistance, and
  Conceding a paid/Recovery Circuit, risking an Overtime pot, and restarting
  Recovery require unanimous consent from that frozen set.
  Timeout, absence, or disconnect records a deterministic “no”; it never
  shrinks the electorate or spends the shared choice.
- Controller reassignment during battle does not create a ballot or change a
  saved ballot.
- Every ballot, timeout default, and resolution is persisted before the next
  battle or shared mutation.

Test 1v1/2v2/3v3, two-member ties, three-member majorities, hot-seat custody,
disconnect, reconnect, and controller handoff. Reject the protocol if the host
can override another member or one silent client can spend a shared resource.

### 2.4 Optional bounded variants

Two mod-scene patterns remain optional variants rather than changing the
four-fight core:

- **Champion Gauntlet:** four disclosed champion recipes replace
  Scout/Foil/Mixed/Final after level 50. Fixed rewards are calibrated offline
  against reward per resolved action but never depend on the live action
  count. Entering—before fight one—atomically starts a three-ordinary-Circuit
  cooldown, whether the route is cleared, lost, or conceded. The cooldown
  record freezes `gauntletRunId`, entry receipt, sorted participating
  `combatantId` and frontier-set IDs, entry challenge tier, and
  `remainingOrdinaryFinalCredits = 3`. It has no unique vertical reward. A
  personal paid final slot qualifies only when the paid branch's unspent
  frontier key is consumed as either a reward-key grant fact or a record-key
  `recordFact`; an explicit record no-outcome still qualifies. The counter
  decrements once per distinct ordinary Circuit **full-rank, non-Assistance**
  final receipt only when every combatant in the exact frozen roster has such a
  qualifying slot at the entry challenge tier or higher. Reward/record mixtures
  qualify; the entry frontier-set IDs are audit provenance, not an impossible
  requirement that later sets retain those IDs. At most three credited receipt
  hashes are stored. The qualifying final's settlement atomically writes its
  attempt/personal facts, unseen credit hash, and one saturating decrement;
  replay sees the hash and cannot decrement twice. Benching one, changing the
  roster, playing a lower tier,
  Practice, Assistance, Concede, Recovery, Gauntlet, or Overtime does not cool
  it down. A Gauntlet
  route is not offered while the counter is positive, and a Gauntlet final
  never opens Overtime. Existing-only recipes can preserve combat
  semantics; champion modifiers use designed rules. Reject it if repeating the
  Gauntlet is the fastest acquisition policy or one build solves all four.
- **Overtime:** after an ordinary full-roster paid final consumes one unspent
  reward or record key for every frozen participant, the team may cash out each
  separately displayed personal bonus-pot outcome or unanimously risk the pots against one
  of at most two additional seed-committed fights. A loss destroys only that
  bonus pot, never already committed Circuit rewards. A pot is precommitted
  with the Circuit plan and typed by its source key: a reward-key participant
  receives personal gold plus an optional record/title payload, while a
  record-key participant receives zero gold and a record/title payload only.
  Mixed teams therefore get mixed pot types, and an all-complete team may play
  record-only Overtime. Every record component uses §1.2's stable
  `potRecordOutcome`/`recordValueUnits` schema. Gold is never pooled or
  redirected; Practice or
  Recovery participation prevents Overtime from opening. A pot never contains
  XP, an item, cache, Forge Mark, pity change, target/source progress, or clear
  credit. If completion is recorded before a grandfathered reward final, its
  already precommitted envelope may still activate when that final settles. If
  a final's later claim records completion after activation, the same personal
  pot remains. Either path stores that one byte-identical pot ID in that
  combatant's completion marker; no reward-typed pot may be prepared for it
  after completion.
  Overtime has its own
  state machine:
  `prepared -> source-forfeited` when Concede tombstones its source final, or
  `prepared -> available` atomically with that final's paid settlement; then
  `available -> cashed-out`, or `available -> risk-1` followed by
  `lost-1/forfeited` or `won-1`; `won-1 -> cashed-out-1` or `risk-2`, and
  `risk-2 -> lost-2/forfeited` or `won-2/paid-out`. Cash-out and `paid-out` each
  atomically grant the displayed pot once. Every edge writes an idempotent
  receipt; reconnect resumes the recorded state, and failure to reach unanimous
  risk consent from the frozen full custodian electorate takes the cash-out
  edge. The source-final settlement atomically activates all typed pots.
  Overtime neither advances ordinary
  cache pity nor creates ordinary
  reward-eligibility keys and is excluded from the four-fight cache-rate
  calculation. The
  scheduler/reward decision can preserve combat semantics; any Overtime Law
  that changes actions uses designed rules. Reject it if reload preserves a
  lost pot, safe cash-out always dominates, or risk always dominates.

Both variants are post-MVP extensions. They must not enter a build until their
state fixtures and normalization simulations pass.

---

## 3. Progression timeline: level 1 to 100 and beyond

The exact number of fights per level is `[U]`. The table specifies *unlock
order and player questions*, not a claim about vanilla pacing.

| Career level | New system or cadence | Question introduced |
| --- | --- | --- |
| 1–4 | Curated first Circuit; baseline actions, targeting, per-seat control, Standard chassis, and personal post-fight reward outcomes. | “Which action and target answer the visible threat?” |
| 5–9 | Rule Load 1; Tempered loot; first three-choice Mastery offer. | “Which one baseline action do I bend, and what opportunity cost do I accept?” |
| 10–19 | Six-slot carried-item tray becomes progression-bearing; first procedural champion; first mutually exclusive Forms near 15. | “Do I add burst, control, mobility, or resource coverage?” |
| 20–24 | One optional Contract debt; first persistent rival; first authored boss; first exact-category Mastery anchor. | “Do I specialize against a known rival, cover the route, or take a harder disclosed contract?” |
| 25–29 | Rule Load 2; Inscribed loot. | “Do two minors form a sequence, or does one major rule define me?” |
| 30–39 | Signature action and deterministic Forge/Enchant services. | “How do I create and spend a sequence instead of repeating one move?” |
| 40–49 | Rule Load 3; elites may combine two doctrines; two compatible Contract debts; second boss. | “Can this locked kit survive a series rather than one ideal matchup?” |
| 50–59 | Vertical stat/chassis cap; Rule Load 4 cap; Legendary loot; Team Tactic; full three-route Circuit generation and tracked acquisition. | “Which challenge ecosystem and lateral build family do I pursue now that numbers stop?” |
| 60–69 | One two-tag Keystone; third boss has one disclosed threshold transition. | “Is hybrid compatibility worth two of my four Rule Load?” |
| 70–79 | Two-effect sideboard and one Pivot per Circuit; up to three active rivals. | “When is my single adaptation worth spending?” |
| 80–89 | Rival-led coalition encounters; fourth boss tests target priority and independent seat agency. | “Do we disrupt the leader, the escort, or the shared engine first?” |
| 90–99 | Up to three compatible Contract debts; capstone route previewed one full Circuit early; no new active capacity. | “Which explicit weakness will I carry into the final exam?” |
| 100 | Authored capstone; first Epoch Charter; permanent confirmation that raw and Rule Load growth have ended. | “Can this team answer the complete grammar without a level-stat escape hatch?” |
| 101+ | Twenty-five-level Epochs; a lateral Mastery choice at least every three levels and an Epoch boss/Charter every 25. | “Do I discover a new family, deepen an alternate Form, or prune future offers?” |

### 3.1 Career and clear transitions

Exact XP amounts remain `[U/A]`, but the state transitions are normative:

- A combatant's **frontier challenge tier** is exactly `highestClear + 1`.
  Challenge entry is unlocked by the previous clear, not by career level or
  gear score. Career level gates systems, item rarities, milestone queues, and
  the finite `min(careerLevel, 50)` vertical budget, but it never blocks entry
  to the next cleared-unlocked challenge tier. Thus a zero-XP Recovery clear
  cannot strand a combatant with no eligible source of future XP. The highest
  cleared tier and every lower tier are Practice for that combatant.
- Fresh campaign creation and opt-in import atomically initialize exactly one
  personal `frontierRewardSet` for `highestClear + 1`; a fresh combatant with
  `highestClear = 0` therefore begins with a non-null tier-1 set. It has a stable
  `frontierRewardSetId` and four derived slot keys. A mechanically incomplete
  set marks them `kind: reward`; a set prepared after completion marks them
  `kind: record`. A prepared set never changes kind in place.
- Every final-clear branch creates its successor with
  `nextSetKind = mechanicalCompleteAtReceipt == null ? "reward" : "record"`.
  Evaluate that expression exactly once after all same-transaction completion
  mutations, then atomically commit the final-clear receipt, closed old set,
  new set ID, kind, four keys, and prepared outcomes. A completion receipt
  identifies the current set as `grandfatherRewardSetId` only if that set remains
  open and reward-kind after the transition. If an automatic final Trophy/source
  award completes the catalog in the same transaction that closes its source
  set, the successor is record-kind and `grandfatherRewardSetId` is null. If
  migration clears completion while a record set is pinned, that set finishes
  as record and the next-created and every later set remains reward-kind until
  completion is established again.
- Rematch, Assistance, and the precommitted Recovery branch reference that same
  set/slot ledger. Assistance substitutes one outcome under the same unspent
  key. Recovery can prove that the paid slot is consumed or forfeited but never
  consumes, reopens, or replaces it. A consumed or Concede-forfeited key cannot
  grant XP or rewards again.
- A `grantEligible` win grants each participating combatant fixed authored XP
  for its **personal reward-budget tier** and its precommitted personal outcome.
  Before the vertical cap that tier is
  `min(selectedChallengeTier, careerTier)`; afterward it remains 50. Chassis,
  gold scale, rarity, and effect catalog use that personal tier/career unlock,
  even if clear-only Recovery advanced the challenge frontier farther. One grant
  may advance at most one career level. Thus clear-only advancement restores a
  future XP source but cannot be used with a carry to jump reward budgets.
  Performance, survival, and controller type do not modify it. Defeat,
  `clearEligible`-only Recovery, and Practice grant zero XP.
- A `recordEligible` win commits one precommitted `recordFact` containing its
  `xpDelta` and zero or one non-`none` payload, but none of the mechanical-power
  channels listed in §1.2.
- XP and level changes commit only in a `grantEligible` or `recordEligible`
  transaction. New
  Rule Load or systems become usable only when the next Circuit is assembled,
  never midway through a locked Circuit.
- Winning a `clearEligible` frontier final advances that combatant's
  `highestClear` exactly once whether its branch is `grantEligible`,
  `recordEligible`, or clear-only.
  Closing the old set and creating the next tier's four-key set occur in the
  same atomic transaction as the final-clear receipt; a duplicate cannot create
  a second set, and every branch invokes the shared next-set-kind rule above.
  A paid final combines this clear with its grant. A Recovery
  final records `clearOnly: true`, grants nothing, and may add only the fixed
  baseline narrative/source credit declared in its prepared plan. A completed
  historical encounter replay has neither clear eligibility nor a new key.
- Crossing career levels 20, 40, 60, 80, or 100 queues the corresponding
  milestone boss for the next eligible Circuit final. The level gate is
  authoritative; “roughly every fifth Circuit” is a pacing target to test
  after the XP curve is authored, not a second schedule.
- If mixed combatants queue different bosses, the next final uses the oldest
  pending gate (lowest required level, then stable boss ID). The clear grants
  milestone credit only to participating combatants that reached that gate;
  other pending gates remain queued.
- Queuing a milestone also freezes its personal `requiredChallengeTier` at no
  lower than that combatant's then-frontier tier. A boss can replace a final
  only when the selected tier satisfies every credited participant's frozen
  requirement; career-level unlocks can never inject a boss into an arbitrarily
  low historical tier.
- Contract/debt first-clear credit is keyed by combatant, challenge tier, and a
  canonical debt-set ID rather than by unique procedural recipe. New random
  seeds therefore do not manufacture infinite “first clears.”

The clear ledger stores these keys with monotonic/bounded summaries so it
cannot grow once per procedural fight forever.

### 3.2 Mastery offers

At least every three levels, present three seed-committed choices. A larger
system milestone may replace that level's Mastery screen, but no gap may exceed
three levels:

1. one compatible with a currently equipped semantic tag;
2. one coverage/counter option;
3. one off-axis option.

The offer can unlock a Technique, Form, blueprint family, or later a pruning
choice. It never increases Rule Load after level 50. Every tenth level includes
an exact-category anchor beginning at level 20, so weak randomness cannot
indefinitely deny a build family. There is no free refresh.

The content cadence must satisfy two design gates:

- no more than two consecutive level-ups may be scalar-only;
- at least 90% of Mastery screens must contain two non-dominated choices, or a
  deterministic fallback must replace the dominated option.

If the authored library cannot meet those gates, merge/remove the empty level
labels or stop issuing mechanical levels. Do not fill the gap with
`+1% damage`.

### 3.3 Epochs after level 100

Each 25-level Epoch uses one team **Charter**: a bounded family of Arena Laws,
opponent modules, reward themes, and records. The authoritative cadence is one
assignment per Epoch, never one per Circuit. Clearing the level-100 capstone
atomically sets the combatant's personal Epoch index to 1 and unlocks the four
initial authored mechanical Charter IDs—`epoch-pressure`, `epoch-position`,
`epoch-resources`, and `epoch-formation`—alongside `standard`. The first such
transition in a campaign also initializes the team rotation deck as a
seed-committed permutation of those four IDs. Later Charters require explicit
versioned personal source receipts; no implicit random unlock exists.

When the first valid personal source receipt for a later `charterId` commits,
the same idempotent transaction inserts that ID at the team deck tail if absent;
simultaneous insertions sort by `(definitionVersion, charterId)`. Insertion does
not enter the recent window or assign an Epoch, and the card remains filtered
until every participant has a personal/participation unlock. A definition
migration maps renamed IDs in unlocks, deck, recent window, and live assignments
atomically. A removed ID is deleted from future candidates only at the clean
migration boundary below; an already active old-version assignment first
settles under its pinned definition, then receives a `retired-charter->standard`
receipt rather than deadlocking route construction.

For personal Epoch index `e >= 1`, crossing career level
`epochEndLevel(e) = 100 + 25e` queues authored `epochBoss(e)` exactly once and
freezes its `requiredChallengeTier` at no lower than the then-current frontier.
The level crossing sets `boundaryState = "boss-queued"`; it does not increment
the index. The first `clearEligible` settlement of that queued boss writes one
boundary receipt and advances `epoch.index` to `e + 1` exactly once. Its frozen
paid-slot classification determines `choiceDisposition`:

- `grantEligible` commits the prepared mechanical boundary choice as
  `choice-resolved`;
- `recordEligible` commits its one prepared `recordFact`, sets
  `boundaryChoiceKind: none`, and writes `choice-not-applicable`, with no new
  mechanic or currency;
- clear-only Recovery from a reward-kind slot writes `choice-forfeited`;
- clear-only Recovery from a record-kind slot writes `choice-not-applicable`.

Every disposition may reattune already owned effects, then create/project the
next team assignment. A pinned record slot whose completion marker was later
reopened still uses `choice-not-applicable`; any newly potential mechanic remains
unknown and enters deterministic coverage later. Any forfeited reward choice ID
also remains source-cleared and enters a later deterministic coverage offer, so
the accessibility branch cannot make an identity permanently missable.
The receipt-backed state order is `boss-queued -> boss-cleared ->
choice-resolved|choice-forfeited|choice-not-applicable -> reattuned ->
assignment-projected`. Key the single boundary receipt by
`(bossClearReceiptId, combatantId, frontierSetId, slotKey, definitionVersion)`
and keep its disposition in the bounded boundary state/high-water; do not append
an Epoch-history collection. Duplicate boss/result receipts cannot increment
twice or open two assignments.

For Circuit construction, `circuitEpochIndex` is the minimum personal Epoch
index among its persistent participants; any pre-cap participant makes it 0.
Index 0 always uses Standard. For a positive index, the immutable
`team.charterAssignments[index]` is authoritative. If absent, the boundary
ballot selects once from the participants' personal unlock intersection and the
rotation candidates below, or selects Standard if the intersection is empty.
Every Circuit in that team Epoch band uses the same assignment. The saved
`team.activeCharterId` is only the current locked-Circuit projection of
`charterAssignments[circuitEpochIndex]`, never a second mutable source of truth.
A higher member playing down therefore uses the lower shared assignment but
earns no higher-Epoch credit.

If a combatant enters a still-live assigned team Epoch without its assigned
future-source Charter, the boundary transition adds a participation-only unlock
for that assignment before route construction; it grants no item, source clear,
currency, Mastery option, or completion credit. The initial four-charter scope
cannot hit this path because all four unlock together at capstone.

Assignment history is bounded. A campaign has at most three persistent allied
combatants, and `team.charterAssignments` retains only an index currently used
by one of them, its one queued next boundary, or an active plan/snapshot. Thus it
holds at most `persistentCombatantCount + 1` entries (four). Once no such
reference exists, an atomic compaction preserves the already-updated deck,
three-entry recent window, `highestCompactedEpochIndex`, and saturating per-
Charter clear/record counters (`min(old + 1, 2^32 - 1)`), then deletes the
assignment. If a lagging
combatant later reaches a compacted index, that band derives
`standard-catchup` without a new ballot or deck/window mutation and without
Charter-specific source/rank credit; it remains one Charter for that combatant's
whole band. This trades replay of an ancient Law for a hard save bound rather
than retaining one row per endless level. A Charter never increases active Rule
Load or base budgets.

Each personal `charterClearLedger` is likewise keyed only by the finite current
Charter catalog ID and stores highest cleared Epoch plus a saturating count; it
never stores one key per Epoch. Exceptional recent boundary receipts remain
inside the shared 32-detail window and their u64 high-water makes older replay
rejectable.

At each Epoch boundary, the combatant attunes at most twelve known Rule effects
into an **Epoch Library**. Four Rule Load is equipped from those twelve for a
Circuit. One newly discovered/deepened effect may replace one attuned effect at
each Mastery point; wholesale reattunement waits for the next Epoch.
Owning a hundred counters therefore does not make all of them available after
one route preview.

Every post-100 Mastery point offers one of:

- **Discover:** add a new authored Technique, Form, affix, or doctrine counter
  to that combatant's campaign Mastery library;
- **Deepen:** unlock a mutually exclusive alternative for an already known
  identity;
- **Prune:** remove one unwanted offer family from that campaign's future
  pool, within a minimum-diversity floor.

Prune is reversible at the next Epoch boundary, may suppress at most 25% of
currently eligible families, and can never reduce the pool below six families
or remove the mandatory coverage/off-axis offer positions.

**Retire** is a separate irreversible opt-out, not a fourth random Mastery
choice. At an Epoch boundary, a custodian may retire at most one authored
mechanic only if its source is already cleared and three distinct persisted
Mastery-offer receipts show that exact ID was offered and declined. Each decline
atomically updates a catalog-bounded
`retirementEvidenceByOptionId[id].distinctDeclines = min(old + 1, 3)` plus its
last offer ordinal/definition version, so eligibility survives compaction of
detailed receipts. Baseline
actions, current equipment, Charters, mandatory coverage families, and an ID
referenced by a plan/snapshot cannot retire. The member-sequenced transaction
records definition version, option ID, the capped evidence-summary hash, and Epoch
index in `retiredMechanicalOptionIds`; it grants no XP, currency, replacement,
source credit, or reroll and cannot be undone by respec/Prune. This lets a player
truthfully finish a repeatedly rejected option without using retirement to skip
an uncleared source or accelerate power.

Every 25 levels ends in an authored Epoch boss built from that Epoch's assigned
Charter grammar. The team stores a deterministic **Charter rotation deck** plus
the last three **Epoch assignments**. When an unassigned Epoch opens, take up to
three cards in deck order that are in every participant's unlock set and absent
from `recentEpochSelectionIds`. The shared-decision protocol resolves the ranked
choice. A selected mechanical card moves to the deck tail; the selected ID is
appended once to the recent window and the oldest fourth ID is discarded.
Standard may repeat and is appended once for that Epoch, but it does not move
the mechanical deck or count as a mechanical repeat. Its authored baseline boss
may still grant personal frontier boundary credit. Thus a mechanical Charter
cannot repeat within four Epoch assignments, while Standard fallbacks age a
temporarily ineligible common card back into candidacy. Ordinary Circuits do not
touch the deck or recent window.

Mixed-level play never moves a lower combatant across a boundary and never lets
a higher combatant earn frontier Epoch credit while playing down. Personal
Epoch boss/choice/reattunement transitions occur only in an eligible Circuit at
that combatant's frozen `requiredChallengeTier`; otherwise that combatant is
Practice for progression. A higher member may keep playing the shared lower
Charter, or assemble an independently eligible roster for its queued boundary.

Epoch-boundary order is fixed: settle the prior boss, resolve, forfeit, or mark
not applicable each combatant's boundary choice under the frozen slot-kind rule
above, reattune personal Epoch Libraries, create the next
team Epoch assignment if absent, project its Charter into the locked Circuit,
then generate its route and one-Circuit-early boss preview. Each operation has a
receipt. No wholesale reattunement is legal after that preview, and no later
Circuit in the same band reruns the assignment ballot.

The initial content target is four mechanical Epochs (levels 101–200), not a
claim of endless novelty. When all authored mechanical options are resolved,
the combatant records `mechanicalCompleteAtReceipt`: future personal reward
plans stop gold, caches, Marks, pity, and target progress and instead award
one `recordEligible` `recordFact` whose `xpDelta` may coexist with zero or one
cosmetic/title/seeded-record payload; both zero XP and `payloadKind: none` form
the explicit no-outcome. Existing currency remains
spendable on known identities but no new mechanical currency is issued. One
completed player does not suppress another eligible player's rewards. That is
a truthful completion state, not a design failure.

If completion is recorded while the current frontier set is reward-kind, its
ID becomes the completion receipt's sole grandfather. At most that set's four
already prepared keys may still settle their byte-identical outcomes; no second
reward set can be prepared while completion remains true. This bounded
frontier grandfather and, when enabled, at most one personal reward-typed
Overtime pot precommitted before the marker are the only cases in which a
post-marker settlement can contain a mechanical grant. The pot may be
precommitted for a later final of that current set or already active from the
immediately closed prior final; it remains byte-identical and bounded to the
displayed at-most-two fights.

The persisted marker is null or `{ receiptId, definitionVersion,
grandfatherRewardSetId|null, grandfatherOvertimePotId|null }`, not an
append-only collection. Closing the frontier grandfather and settling the
Overtime pot independently clear their own references; Concede's atomic
`source-forfeited` transition also clears a matching inactive pot reference. The completion
receipt marker remains. A catalog-reopen migration clears the whole marker.

Completion evaluates every potentially unlockable authored mechanic in the
current `definitions.version`, including options behind sources the combatant
has not yet cleared, with Prune temporarily ignored. Pruning or avoiding a
source cannot manufacture completion: if any potentially legal mechanic remains
unknown, a deterministic coverage/source direction bypasses Prune. Completion
occurs only after every catalog ID is owned/deepened or appears in the bounded
`retiredMechanicalOptionIds` bitset under a separate irreversible receipt;
reversible Prune never counts as retirement. If a definition migration adds a
potential mechanic, it atomically clears `mechanicalCompleteAtReceipt`, writes a
`catalog-reopened` migration receipt, and resumes mechanical reward generation
only for newly prepared frontier plans. It never rewrites an already prepared
reward or record outcome and clears any completed grandfather reference.

Post-100 balance sweeps compare Epoch Libraries of 6, 12, and the full owned
catalog. At equal active Rule Load, the full catalog may not improve win rate
over the twelve-attuned library by more than 5 percentage points on the same
preview set, and no twelve-effect package may be within 5% of best in more than
70% of Charter×doctrine cells.

---

## 4. Abilities, spells, and build identity

### 4.1 Forms replace ranks

Do not add Fireball II, Fireball III, and a strictly better Fireball IV. A
spell or Technique can instead unlock mutually exclusive **Forms** with the
same total effect budget:

An early **narrow Form** changes one axis and costs 1 Rule Load, so the level-15
unlock is usable under the early capacity. A later **Signature Form** combines
a setup and payoff or two axes, costs 2, and remains subject to the Signature
and family exclusions.

| Form family | Starting budget rule `[A]` | Tactical identity |
| --- | --- | --- |
| Immediate | 100% of the authored single-target direct budget; no rider. | Reliable payoff now. |
| Status | About 70% immediate budget plus one bounded, visible status. | Lower tempo for future leverage. |
| Exchange | Gives up direct budget for a resource or position exchange. | Convert one constraint into another. |
| Multi-target | At most 125% of single-target total, divided across legal targets. | Breadth without multiplying full value per enemy. |

Examples, all designed-mode only:

- Fireball chooses immediate breach or lower immediate damage plus a bounded
  burn; neither is a rank upgrade.
- Bash chooses armour pressure or defensive tempo at reduced direct payoff.
- A ranged stabilizer trades shield armour, stamina, or ammunition for visible
  accuracy capped below a guaranteed-hit boundary.
- A restorative spell chooses immediate healing or a smaller self-and-ally
  ward; it cannot become an ally-only mandatory healer button.

Every Form records trigger, target scope, expiry, stacking group, Rule Load,
burden, and rule-set/definition version.

### 4.2 Techniques

A **Technique** is a carried item ID that adds or transforms one action. The
mapped game already has six item-ID inventory positions for spells, making
that the natural presentation foundation; complete canonical item/resource
state is not implemented yet. [V]

Technique families should be small and legible:

- `sequence`: changes the immediate next action after a disclosed predecessor;
- `resource_exchange`: spends stamina, ammunition, magicka, armour, or another
  finite resource for a tactical effect;
- `defensive_reaction`: once-per-battle response to armour break, status, or a
  health threshold;
- `movement_targeting`: changes charge, shove, jump, range, or target rules
  with a cost;
- `active_technique`: an explicit carried action;
- `team_tactic`: the one jointly chosen team rule, never a random individual
  aura drop.

### 4.3 Signature action

At level 30, a combatant may spend 2 Rule Load to designate one equipped base
action or carried ability as a **Signature**. It is not another button.

The Signature becomes ready after that combatant uses three distinct eligible
semantic tags since the previous activation. Repeating a tag does not charge
it. Rest, no-op movement, and zero-impact actions do not count. Activation
consumes the three markers; readiness is visible to both teams.

This creates a short personal sequence while preventing a one-button cooldown
rotation. The Signature cannot simultaneously have guaranteed accuracy, full
armour bypass, and hard control.

### 4.4 Keystone

At level 60, one 2-Load **Keystone** may give an action at most two semantic
tags, such as `heavy + ranged` or `magic + control`. It can bridge two parts of
a build but cannot satisfy every trigger, grant an extra turn, or recurse into
itself.

### 4.5 Illustrative affixes

These examples show the intended shape; their numbers are tuning hypotheses,
not approved constants:

Every armed sequence marker stores `sourceCombatantId`, source item/effect ID,
and arming event sequence. “Immediately next” means that source combatant's
next resolved scheduled action. Ally and enemy actions between those scheduled
turns neither consume nor expire it. The marker is consumed by its declared
follow-up; it expires before effects resolve if the source declares/resolves any
other action, is defeated, loses the source item at a legal later boundary, or
the weapon source becomes inactive through a legal swap, or the attempt/battle
ends. Rematch restores the attempt-start marker state, never
a marker learned during the failed attempt.

- **Measured Quiver** (1 Load): after Bombard misses, the immediately next
  Snipe gains 10 exact displayed percentage points, capped at 95, but costs one extra
  ammunition. Any other action expires the setup.
- **Second Wind Guard** (1): once per battle, armour break makes the next Rest
  restore a bounded extra resource amount. It grants no extra turn.
- **Critical Relay Grip** (2): when its source scores a critical direct attack,
  it arms Relay for that source's immediately next scheduled action. At Bash
  declaration the player may consume Relay and prepay exactly twice the
  ordinary computed Bash stamina cost; insufficient stamina makes Relay Bash
  illegal but does not make ordinary Bash illegal. Relay Bash uses ordinary
  Bash displayed hit chance and `ceil(min_damage / 2)`. On hit, wards absorb
  first and the remainder goes to health while armour absorbs none. It cannot
  critical, apply Bash control, arm Relay, or trigger another effect. Miss or
  resolution spends the marker and stamina. Any other source action expires it.
- **Stabilizer Shield** (2): grants 10 exact displayed ranged percentage points, capped
  at 95, while reducing that shield's armour contribution by 25%.

The candidate hidden attacker-shield/ranged term must not be sold as a loot
bonus. If a future golden confirms it, classic mode preserves it. Designed
mode should remove the counterintuitive hidden term globally, then offer the visible
costed stabilizer as a sidegrade. [V/A]

`endless-v0` uses **exact displayed integer probability** for every designed
accuracy value: draw an integer `d100` in 1–100 and succeed iff
`d100 <= displayedChance`. Thus displayed 1/50/95/99 means exactly
1/50/95/99 successful draws, and “10 percentage points, capped at 95” cannot
hide the mapped inclusive-dispatcher's extra successful boundary. This is an
intentional designed-rule-set semantic; it neither describes nor changes the
classic path. Exhaustively enumerate all 100 draws at each boundary and require
the action UI/log to show the realized probability.

Forbidden behaviour payloads:

- a raw damage, armour, or accuracy percentage as the item's sole identity;
- extra turns;
- uncapped lost-turn/freeze chains;
- multiplicative team auras;
- on-kill cascades;
- invisible proc timing;
- proc-to-proc triggering or recursive proc cycles;
- an undisclosed first-action decisive package.

---

## 5. Opponent progression

### 5.1 Deterministic authored-module recipe

Every generated opponent or team stores a recipe equivalent to:

```text
generatorId
generatorVersion
definitionVersion
seed/cursor
careerTier
challengeTier
teamSize
baseTemplateIds
primaryDoctrine
secondaryDoctrine?
signatureModifier?
liability
contractDebts[]
rivalId?
rivalMemoryVersion?
ruleSetId
ruleContractVersion
ruleDesignVersion
```

The recipe is persisted before preview. Raw stats come from a normative
career/challenge budget. They never come from a player's current items, active
Rule Load, loss count, or controller identity.

`generatorId`/`generatorVersion` and `definitionVersion` mirror the enclosing
sidecar envelope. `ruleSetId` references `ruleSet.id`; its contract/design
versions separate seam-contract compatibility from authored balance changes.

### 5.2 Doctrine vocabulary

Use a small public vocabulary:

- **Aggressor:** power, charge, and armour pressure;
- **Tempo fighter:** quick/normal attacks and resource pressure;
- **Marksman:** bombard, snipe, ammunition, and weapon switching;
- **Provocateur:** taunt and bounded control;
- **Arcanist:** spell and buff inventory;
- **Attritor:** armour, recovery, and delayed pressure;
- **Skirmisher:** movement, shove, and range management.

Changing only opponent records, existing equipment, and encounter order could
be compatible with a future verified classic rule set. Giving a doctrine new
action priorities, target policy, or rule modifiers changes `chooseAiAction`
or action semantics and belongs to the designed rule set. [V/A]

### 5.3 Complexity budget and exclusions

| Encounter | Recipe/positive-module budget | Required readability |
| --- | --- | --- |
| Normal | One doctrine; no positive rule modifier. | Doctrine card. |
| Elite | One doctrine plus one modifier. | Modifier and liability. |
| Champion/rival | Base identity plus one doctrine and one fixed signature modifier. | Doctrine, signature, and liability. |
| 1v1 boss | One doctrine plus at most two positive modifiers. | Full preview one Circuit early. |
| Team boss | Team doctrines plus at most `teamSize + 1` positive modifiers, capped at four. | Leader/escort roles and any shared Law. |

A doctrine counts toward recipe readability/combination testing but not the
positive **rule-modifier** cap; it selects an authored baseline AI policy.

Generation rejects:

- guaranteed-hit plus armour-bypass packages;
- regeneration plus repeated invulnerability;
- two hard-control modules;
- two stall modules;
- a counter package aimed at more than one broad player tag;
- more than one hard-control specialist or one sustain specialist per team;
- the same exact recipe within ten fights;
- the same primary doctrine in consecutive ordinary fights.

Every elite, champion, rival, and boss modifier has a visible liability.
Procedural generation chooses from an exhaustively combination-tested catalog;
it does not synthesize script or rules.

### 5.4 Procedural champions

The fourth fight of an ordinary Circuit is:

```text
base template + doctrine + one signature + one liability + reward theme
```

The champion's name and visual presentation are cosmetic. Its signature and
liability are mechanical and disclosed. A champion must admit at least two
materially different winning build families in the doctrine matrix.

### 5.5 Persistent rivals

- The first rival appears around level 20.
- At most three rivals are active and eight retired summaries are retained.
- A rival cannot return more often than once every two Circuits.
- It keeps one base identity and one signature.
- It remembers broad tags from the team's locked builds in the last three
  **player victories over that rival**, not losses, exact items, last actions,
  current controllers, or unequipped gear.
- A tag becomes remembered only when it appeared in at least two of those three
  victorious locked builds. One spoof win cannot steer the counter.
- On return it may replace one secondary module with one disclosed counter. It
  never accumulates counters.
- The counter preserves or introduces a visible liability.
- Rival raw power follows the authored challenge schedule within 15% of its
  declared budget; it does not mirror player wins or items.
- Losses do not strengthen rewards, weaken the rival, or teach it a more
  favourable state.
- Repeated rewards are normalized; deliberate sandbagging cannot improve
  expected progression.

Adversarial tests include both deliberate losses and winning with spoofed tag
packages. Reject memory if either policy improves later expected win rate or
progression versus playing the best available build honestly.

In team play, the rival is the recurring enemy leader and remembers team-level
tag distribution. Escorts rotate so one human is not permanently singled out.

### 5.6 Authored milestone bosses

Milestone finals occur near levels 20, 40, 60, 80, and 100, then every 25
post-100 levels:

- level 20: one signature/liability, testing Contract and rival literacy;
- level 40: two readable doctrines, testing locked-series coverage;
- level 60: one disclosed threshold transition, testing Keystone identity;
- level 80: rival-led coalition, testing target priority and seat agency;
- level 100: selected Arena Laws plus the cumulative action grammar;
- Epoch boss: one Charter's bounded grammar, not another order of magnitude of
  health.

Team variants preserve equal seat counts: boss in 1v1, leader plus foil in
2v2, leader plus two distinct escorts in 3v3. Leaders receive signatures, not
extra actions. There are no replacement spawns or alternate settlement paths.

### 5.7 What makes fight n+1 different

Novelty comes from the intersection of five bounded axes:

1. route and reward-family choice;
2. doctrine and team composition;
3. one or two authored modifiers with liabilities;
4. limited rival memory;
5. optional Contract debts and Epoch Charter.

It does **not** come from multiplying health, rolling an unreadable affix soup,
or instantly countering the exact item most recently equipped.

---

## 6. Contracts, Arena Laws, and anti-stall pressure

### 6.1 Player-selected difficulty

Contracts add visible **debts**:

- level 20: at most one debt;
- level 40: at most two compatible debts;
- level 90: at most three;
- at most one from each of `scarcity`, `control`, `tempo`, and
  `opponent-signature` families.

Examples include replacing a normal fight with an elite, locking the Pivot,
starting Arena Pressure earlier, adding a telegraphed Focus doctrine, or
restricting one carried-item category. Content-only debts may preserve combat
semantics. A debt that changes accuracy, recovery, action legality, control,
or stacking requires the designed rule set.

Rewards use an authored interaction table, not a naively additive Heat number:
two individually mild debts can be multiplicative together. The standard
zero-debt route always remains available.

First Contract/debt clears carry most rank advancement. Each personal frontier
reward set can consume its four keys once through four `grantEligible` wins;
Recovery/restart at the same tier never mints another set. Replaying a completed historical encounter is a separate
Practice action, not a fifth Circuit fight: it grants no XP, gold, cache, Forge
Marks, pity, target-ledger progress, or blueprint credit.

For a given combatant, only its **lowest uncleared frontier challenge tier** is
progression-eligible. Its highest cleared tier and every lower tier are
Practice, even when a newer ally remains independently eligible there. A
combatant cannot hold or abandon a tier, issue fresh paid keys there, and
stockpile before advancing. Obsolete items salvage for reduced gold rather than Marks.
Historical tiers cannot unlock or fully activate a higher-tier chassis. This
keeps old fights available without making them the fastest high-tier Forge.

### 6.2 Arena Pressure

Designed full-elimination battles need a visible termination mechanism. After
the sixth initiative cycle, Arena Pressure gains one stack at each cycle
boundary. A cycle is the scheduler's stable-order wrap, so the clock is
team-size-normalized and stack 8 arrives by cycle 14. `[A]`

- each stack reduces healing, Rest, and passive recovery by 12.5 percentage
  points;
- at stack 8, recovery is zero;
- when stack 8 begins, canonical state snapshots each living combatant's
  current health-plus-armour-plus-ward `pressureDurability`, freezes each team's
  `pressureTargetIds` to its living opposing persistent battle seats, and
  records at most one immutable `approachDebt` for it. One approach action
  consumes the entire debt and ends in legal direct-damage range;
- at stack 8, only that debt-consuming approach action or a direct-damage
  action is legal. Every such action must target a living opposing
  `pressureTargetId`; allies, self, corpses, objects, existing summons, and
  non-seat entities are illegal targets and cannot intercept, redirect, share,
  or absorb its floor. Existing summons/objects become untargetable and
  unscheduled without death/proc/reward events, and no new displacement, wards,
  armour, healing, summons, revive, team switch, or durability-increasing status
  is legal. At no earlier stack may a summon create a scheduled actor or seat,
  so the cycle/action bound always counts only the frozen `n` combatant seats;
- the designed rule set always supplies **Pressure Advance** while an actor has
  approach debt and **Pressure Strike** otherwise. They are resource-free,
  target a living enemy, ignore disarm/silence/cooldown locks, replace the
  actor's ordinary action rather than adding a turn, cannot trigger any effect,
  and are legal even when every normal damage action is unavailable. Advance
  consumes the whole debt; Strike deals exactly the floor below;
- every stack-8 direct-damage action resolves, after hit/deflection/mitigation,
  for at least the greatest of 1, its minimum selector damage, and
  `ceil(target.pressureDurability / 5)`. A miss is converted to that floor; a
  natural low hit is raised to it. It cannot crit and drains wards, then armour,
  then health; reactions cannot divert that mandatory reduction. If an Advance
  target dies first, the actor retargets another living `pressureTargetId`
  without gaining another debt; no living opposing target settles the battle;
- Pressure and its next threshold are visible to both teams.

This late floor does not alter opening probabilities and does not decide a
fight by an arbitrary score. Define each target's
`hitsRemaining = ceil(remainingDurability / ceil(pressureDurability / 5))`.
After stack 8, the sum of all opposing `hitsRemaining` values plus remaining
approach debts is strictly decreasing on every scheduled action. Five
direct-damage actions exhaust any one target's Pressure-entry snapshot. For `n` seats per
team, cycle 14 has used at most `28n` actor-actions, all living fighters add at
most `2n` approach actions, and after at most `10n - 1` further direct-damage
actions the pigeonhole principle gives one team at least `5n` attacks. Dead and
non-snapshot targets are illegal, so `5n` such attacks exhaust all `n` opposing
snapshots.
The resulting authored cap is `40n - 1`: 39 actions in 1v1, 79 in 2v2, and 119 in 3v3. The
exact cycle, floor, and durability projection must still pass exhaustive state
tests before implementation.

The resolver/canonical battle state owns cycle-wrap increments and scheduled-
turn expiry such as Control Fatigue. The selected rule set reads that state to
define legal actions, recovery scaling, and action outcomes; it does not own or
advance the scheduler clock. [V/A]

No reward improves with turn count, so there is no economic bonus for waiting
for the floor.

---

## 7. Armory Ledger: loot, rarity, and acquisition

### 7.1 What can drop

The active equipment surface follows mapped SS2 references:

- primary and secondary weapon;
- breastplate, helmet, shinguard, greaves, shoulderguard, gauntlet, boot, and
  shield;
- six carried inventory/spell item positions. [V]

Persistent item records reference authored chassis and affix definitions by
ID. Static catalogs live in source; saves store instances, not copied
definitions.

### 7.2 Rarity semantics

| Rarity | Chassis power | Behaviour payload | Rule Load |
| --- | --- | --- | ---: |
| Standard | Current-tier Light/Balanced/Heavy authored profile. | None. | 0 |
| Tempered | Same chassis budget. | One compatible minor rule. | 1 |
| Inscribed | Same chassis budget. | One major or two compatible minors. | 2 |
| Legendary | Same chassis budget. | One identity keystone plus an explicit burden. | 3; max one 3-point identity |
| Trophy | Fixed source blueprint, not a stronger fifth rarity. | Authored keystone plus burden. | 3; shares Legendary limit |

Rarity changes *how many rules must be evaluated and how defining the item is*.
It does not change the base tier budget. A Standard may be the correct choice
when its zero Load leaves room for a Signature or two other effects.

### 7.3 Reward cadence and rates

For each `grantEligible` encounter win, independently for each participating
persistent allied combatant with an unspent key, commit one personal reward
outcome. A successful cache creates a two-candidate item offer; a no-cache
ordinary outcome grants its Marks automatically and creates no item offer.

| Source | Personal gold | Cache | Other |
| --- | ---: | ---: | --- |
| Eligible frontier-Circuit ordinary fight | `0.20 × C_t` | 40% | If no cache, 2 Forge Marks. |
| Circuit final | `0.35 × C_t` | 100% | 1 additional Mark. |
| First-clear milestone boss/rival | `0.50 × C_t` replacing final gold | 100% | Shared blueprint unlock plus personal clear credit. |
| Historical/under-frontier Practice | 0 | None | Records only; no progression channels advance. |
| Defeat | 0 | None | No gold loss; prepared plan remains for rematch. |

`C_t` is the authored median price of a Standard chassis at that combatant's
personal reward-budget tier `t` from §3.1, never an ahead-of-career challenge
tier. The designed Armory's chassis prices, Forge prices, gold
awards, and Marks ignore Charisma. Otherwise Charisma can become the universal
acquisition stat. A future classic-parity economy may separately preserve a
verified vanilla discount. `[A/U]`

`C_t` and stored gold are nonnegative integers. Each table fraction is applied
per combatant in that encounter's `grantEligible` transaction using integer
`roundHalfUp(numerator × C_t / 100)`; a Contract multiplier, if any, is then
applied once to that personal encounter amount with the same rational/integer
rule. Gold is never accumulated in a hidden fractional Circuit balance.

Once all random rarities are unlocked, a cache rolls rarity once:

| Cache | Standard | Tempered | Inscribed | Legendary |
| --- | ---: | ---: | ---: | ---: |
| Ordinary | 50% | 32% | 15% | 3% |
| Circuit final | 0% | 55% | 35% | 10% |

Before a rarity's level unlock, its weight recursively cascades to the highest
unlocked lower rarity; it never lands on another locked tier. Resulting
ordinary/final distributions are Standard 100%/100% at levels 1–4,
Standard–Tempered 50/50 and 0/100 at 5–24, and
Standard–Tempered–Inscribed 50/32/18 and 0/55/45 at 25–49. The rarity is rolled
once per cache, not once per candidate. Each cache then shows two same-rarity
candidates:

- candidate A is from the combatant's Circuit-locked hunt family;
- candidate B is guaranteed to come from a different family;
- choose one or salvage the offer for one item's rarity value.

At 40% across three ordinary fights plus one guaranteed final cache, a
four-win Circuit yields about 2.2 caches per combatant. With the listed rates,
natural Legendary cadence without pity is roughly one per 29 wins. With the
eight-miss rule below and reset on every Legendary, an independent-roll
simulation produces roughly one per 14 wins, about 59% from pity. Because only
the Circuit-final cache is guaranteed, the deterministic worst case is the
ninth final, or 36 wins, if no ordinary cache appears. These figures make the
eight-miss rule an intentionally strong access guarantee, not a cosmetic
jackpot; tune it upward if acquisition testing shows Legendary identities
crowd out lower-load builds. `[D/A]`

A first-clear Trophy is a deterministic blueprint unlock outside this random
table.

### 7.4 Duplicate control and pity

- Remember each combatant's last twelve item fingerprints. An exact duplicate
  rerolls once. If the reroll is also duplicate, show it with guaranteed
  salvage rather than hiding the outcome.
- Legendary generation prefers unseen source-eligible identities before
  repeats.
- Each eligible cache without a Legendary increments `legendaryMisses`. At
  eight, the next Circuit-final cache is forced Legendary. Any natural or
  forced Legendary resets the counter in the `grantEligible` transaction,
  whether the resulting offer is kept or salvaged. Only `grantEligible` cache grants mutate
  it.
- After clearing the relevant source/challenge tier, a combatant may track one
  known blueprint/affix. Its ledger advances only on matching-family caches
  whose rolled rarity can legally host that identity. Six eligible caches
  without it force candidate A of the next eligible Circuit-final cache to
  contain it; this guarantee never raises or bypasses the rolled rarity.
- Up to three target ledgers can be retained; only the selected hunt advances.
  Switching pauses the others. Starting a fourth requires abandoning one with
  an explicit warning and gives no exploitable compensation.
- Rarity pity resolves before target pity, which resolves before ordinary
  duplicate suppression. A forced target candidate A is exempt from the
  duplicate reroll. Persisting that earned offer consumes/resets its target
  ledger even if the custodian chooses B or Salvage; declining cannot preserve
  the guarantee.

The exact fallback bounds randomness without turning reward screens into free
reroll loops.

### 7.5 Forge, enchant, and retirement

Use one personal nontradeable salvage currency: **Forge Marks**.

| Operation | Starting cost `[A]` |
| --- | ---: |
| Salvage Standard / Tempered / Inscribed / Legendary or Trophy | grants 1 / 2 / 4 / 8 Marks |
| Replace one existing minor on Tempered/Inscribed | 6 Marks |
| Forge an exact discovered Tempered identity | 16 Marks |
| Forge an exact discovered Inscribed identity | 28 Marks |
| Forge a cleared Legendary/Trophy blueprint | 48 Marks |

Forge results are deterministic. There is no blind enchant reroll.

At the published cache rates, a baseline all-salvage policy earns about 10.3
Marks per ordinary four-win Circuit before pity/milestone effects: 4.6 from
base/no-cache awards and about 5.7 from salvaging one value per offer. The
modelled Legendary pity raises that to roughly 11.1, so a 48-Mark identity
takes about 4.3 all-salvage Circuits after discovery, still longer than the
roughly 3.5-Circuit Legendary cadence. `[D/A]` Reject or raise any Forge
recipe that makes deterministic same-rarity copies the faster **general item
throughput** after discovery. Under the same stationary pity model, direct
offers per Circuit are about 0.84 Tempered, 0.47 Inscribed, and 0.291 Legendary;
16/28/48-Mark recipes yield at most about 0.69/0.40/0.231 all-salvage copies per
Circuit. Forge intentionally makes a known identity targetable; it must not
outproduce the entire corresponding random rarity. `[D/A]`

- An effect must first be discovered or its source cleared.
- Standard items have no behaviour tuning position. Tempered items may replace
  their one minor; an Inscribed item built from two minors may replace one.
  The operation never adds a payload, changes rarity, or exceeds that rarity's
  Rule Load. Major-only Inscribed and Legendary/Trophy items have no tuning
  position.
- Replacing a tuning effect refunds half the prior Forge-Mark enchant cost.
- All changes occur between Circuits and must pass Rule Load/team validation.
- Tier provenance and chassis ceiling are distinct immutable facts.
  `originChallengeTier` records where the item was earned and drives provenance
  and salvage. `chassisCeilingTier` limits usable chassis: for a
  Standard/Tempered/Inscribed item it equals the personal reward-budget tier at
  creation; for an evolvable Legendary/Trophy it is the blueprint's authored
  ceiling, never above 50. `requiredClearTier` remains the claim gate. None of
  these fields changes on transfer.
- Every item's effective owned projection is
  `min(chassisCeilingTier, ownerHighestClear, ownerCareerTier, 50)`. This lets an
  authored Legendary/Trophy evolve only to its declared ceiling while ordinary
  items never promote. Clear-only carry cannot evolve it ahead of career.
- Retiring it preserves its blueprint and grants normal salvage; no permanent
  additive legacy stats survive.

Gold buys current-tier Standard chassis and ordinary services. Gold, Marks,
pity, personal clear credit, and exact-target ledgers cannot be traded.

---

## 8. Per-combatant inventory, custody, and co-op exchange

### 8.1 Identity model

Four identities must remain separate:

- `combatantId`: owns personal equipment, items, currencies, pity, and reward
  offers;
- `seatId`: the stable battle slot occupied by that combatant;
- controller identity: the current actor-input source mapped to `seatId` by
  the controller registry;
- `custodianMemberId`: the persistent campaign member authorized to make
  post-battle Keep/Salvage/Equip/Trade decisions for that combatant;

`locker-unbound` is an item ownership state, not a fifth identity: the item
is in campaign custody and has no combatant owner until an atomic claim.
`bound-award-escrow` is likewise not a controller: it is a fully instantiated,
personally owned automatic Trophy/source award waiting outside vault capacity for
its custodian to claim.

Controller reassignment never changes ownership or custody. A hot-seat member
may legitimately custodize multiple combatants. A temporary AI or host cannot
claim a disconnected member's offer; it remains pending.

The full design globally caps a campaign at three persistent allied
`combatantId` records and three persistent `memberId` authorities, matching the
3v3 scope. Custodian reassignment may move authority among those records, and an
ephemeral AI fill adds neither; adding a fourth persistent record is rejected.
Permanent roster replacement/deletion is outside this design until it has an
explicit inventory/cooldown/Epoch migration, so the size bound never assumes an
unbounded bench hidden behind per-combatant caps.

### 8.2 Capacity and active loadout

Full-design starting limits:

- mapped active equipment and six carried item positions;
- 24 reserve item instances in each combatant's personal vault;
- 48 unbound item instances in the team locker;
- blueprints as ledger entries rather than physical inventory.

These are usability/storage targets, not vanilla capacities. If a vault is
full, a new offer remains in `pendingRewards`; it is never silently deleted.
At most four item offers and one automatic bound award may remain escrowed per
combatant. `bound-award-escrow` belongs to that combatant but occupies neither
the vault nor team locker; it cannot be equipped, traded, forged, or salvaged
until an atomic claim moves it to a free personal slot. A custodian may
pre-authorize deterministic post-fight offer salvage, but **Circuit readiness
requires zero pending item offers, zero pending bound awards, four reserved
offer records, and one reserved bound-award record** before the roster freezes.
The reward plan permits at most one automatic bound award per combatant in a
Circuit. One locked four-fight Circuit can then create at most four offers plus
that award without blocking settlement. If its
custodian is absent at the next boundary, the combatant is benched without
changing custody, its bounded escrows remain unchanged, and an ephemeral AI
fill may occupy the seat without rewards. This lets the team continue without
confiscating an absent member's items and closes overflow without blocking a
grant. Bulk salvage requires one explicit or pre-authorized
confirmation.

Salvaging a two-candidate offer grants exactly one item's listed salvage value,
not both candidates' value.

### 8.3 Reward ownership

- Every mechanically incomplete `grantEligible` persistent combatant on the
  winning team gets a personal reward outcome and independent cache roll. A
  `recordEligible` combatant gets only its pinned `recordFact`, including the
  prepared `xpDelta` and zero or one non-`none` payload.
- A knocked-out winner still gets that outcome. A no-cache result commits
  automatic Marks; only a successful cache creates a pending item offer.
- A stable campaign AI combatant owns progression normally under its assigned
  custodian.
- A truly ephemeral `aiFillSource` receives no persistent reward outcome; its missing
  share disappears rather than being redirected to a carry.
- No other controller can choose a player's candidate.
- A disconnect leaves the offer pending.

First-clear Trophy blueprints unlock for the team, but each combatant needs
personal clear credit and personal Marks to forge a copy. This shares discovery
without giving one physical legendary to whichever player opened the screen
first.

### 8.4 Locker and direct exchange

Use this item-state machine:

1. `offered`: a successful-cache pending choice belongs to one combatant and
   is not yet an item instance;
2. `bound-award-escrow`: an automatic bound Trophy/source item is already a
   stable personal item instance but waits outside inventory capacity; only its
   custodian may claim it when a personal slot is free;
3. `combatant-unbound`: Keep creates a personal item that its custodian may
   equip or voluntarily deposit;
4. `locker-unbound`: deposit/direct Locker selection transfers custody to the
   campaign and clears `ownerCombatantId` in the same atomic transaction;
5. `combatant-bound`: an eligible claim followed by equip, upgrade, or
   enchant binds permanently to its combatant. During a locked Circuit, Equip
   writes only `nextCircuitLoadout`; it cannot alter the active frozen hash;
6. `retired` or `salvaged`: an immutable receipt records the explicit sink.

A deterministic Forge output is bound on creation. Any item produced by
personal Legendary pity, exact-target pity, or personal Trophy forging is
bound when claimed and cannot go directly to the locker. A naturally rolled
unbound item of **any** rarity can be claimed/equipped only when the recipient
meets its immutable `requiredClearTier`, the rarity's personal career-level
  unlock, and every affix source gate. Its battle projection always recomputes
  effective chassis as `min(chassisCeilingTier, recipientHighestClear,
  recipientCareerTier, 50)`; `originChallengeTier` and the authored ceiling are
  never promoted by transfer. A locker
deposit or direct transfer irreversibly clears that item's
`markSalvageEligible` flag. It may be claimed by an eligible combatant for use
or returned to its depositor, but no present or future owner can salvage it
into personal Marks. These rules prevent personal bad-luck protection and
low-tier behaviour items from becoming a currency funnel.

There is no external market, auction house, gold transfer, Mark transfer, or
cross-campaign item import.

On transfer:

- item ID, affixes, rolls, origin, mode tag, definition version, bind history,
  reroll count, and provenance are preserved;
- effective chassis tier is `min(chassisCeilingTier,
  recipientHighestClear, recipientCareerTier, 50)` without mutating the
  origin or ceiling, and a rarity/effect remains unusable until the recipient's
  personal career/source unlocks permit it;
- the recipient still pays the item's Rule Load;
- personal pity and clear credit do not move;
- transfer is an atomic transaction accepted by both custodians.

For an item that never entered exchange, Mark salvage eligibility/value is
calculated from immutable `originChallengeTier` and
`markSalvageEligible`, not a mutable current tier. It is **obsolete** when
`originChallengeTier` is below the current owner's `highestClear` (not merely
below its next uncleared frontier), and then yields reduced gold, never Marks.
An item from the just-cleared tier therefore retains normal value through its
post-Circuit decision. Exchange-cleared eligibility never
returns, even if the item returns to its depositor or moves to a lower-tier
ally; a round trip cannot restore old salvage value.

Useful gifts are allowed. Anti-funnelling comes from independent personal
rewards, nontradeable progression currencies, recipient clear gates,
per-combatant Rule Load, team stacking/control caps, and no contribution bonus—not an
arbitrary trade tax.

### 8.5 Mixed-progression parties

Progression gates are personal even though route selection is shared:

- a team's highest selectable challenge tier is the minimum next-unlocked tier
  among participating persistent combatants;
- each combatant's effective chassis/stat tier is
  `min(selectedChallengeTier, careerTier, 50)` for that Circuit without
  mutating owned items or allowing `highestClear` to raise career power;
- effective Rule Load is the lower of that combatant's personal capacity and
  the selected challenge tier's unlock capacity;
- a combatant at the selected frontier receives normal XP/rewards only with an
  unspent paid-slot key; either its paid final or precommitted clear-only
  Recovery final may grant personal frontier clear credit exactly once;
- a veteran playing below its frontier receives Practice rewards (none) while
  the catching-up ally remains independently eligible;
- challenge tier cannot exceed any combatant's next-clear gate. Career level
  never blocks the next cleared-unlocked tier: before the vertical cap each
  combatant simply brings its lower personal career/stat budget; post-cap all
  challenge tiers keep tier-50 vertical stats and use the applicable shared
  Charter assignment;
- only participating stable roster combatants receive reward outcomes; bench “mules”
  and ephemeral fills receive nothing;
- milestone/blueprint credit records each eligible combatant separately.

This permits a veteran to help a newer ally while suppressing raw stats,
currency farming, and transferable guarantee output. Test every roster-level
permutation and reject the rule if a low-clear ally can receive frontier items
  without earning its gate or a veteran can advance by farming the ally's
  challenge tier.

---

## 9. Co-op agency rules

These constraints apply from level 1:

- every fighter has a complete solo-capable baseline kit;
- an ally-target ability must also target self or set up the caster's own next
  turn; no offered build is a mandatory pure healer appliance;
- Signature charge and progression currencies are personal;
- multi-target effects divide a fixed budget rather than deal full value to
  each target;
- same-family buffs use strongest-only stacking;
- after one hard lost-turn effect, the target gets Control Fatigue through its
  next two scheduled turns; further hard control downgrades to a declared soft
  effect;
- Standard AI cannot attack the same healthy target more than twice in a row
  while another legal target exists;
- a Focus doctrine may break that pattern only after telegraphing its target
  one enemy action in advance;
- enemy teams have equal seat counts and ordinary initiative;
- leader identity never grants extra actions;
- each persistent combatant's custodian controls that combatant's reward;
- each living battle seat should have at least two consequential non-dominated
  actions in most sampled states.

The target-policy and Control Fatigue rules are designed semantics. They must
not be applied to classic mode.

---

## 10. Persistence, determinism, and exactly-once settlement

### 10.1 Separate sidecar

Progression lives in a new `ss2-team-progression` sidecar. It never overwrites
vanilla fields. A conceptual v1 record is:

```json
{
  "schema": "ss2-team-progression",
  "version": 1,
  "campaignId": "...",
  "ruleSet": {
    "id": "endless-v0",
    "contractVersion": 2,
    "verification": "placeholder",
    "provenance": {
      "runtimeVerified": false,
      "designIntent": "designed",
      "note": "Intentional Arena Circuit rules; not measured SS2 behaviour."
    },
    "designVersion": 1
  },
  "generator": { "id": "arena-circuit", "version": 1 },
  "definitions": { "version": 1 },
  "rng": {
    "route": { "seed": "...", "cursor": 0 },
    "mastery": { "seed": "...", "cursor": 0 },
    "opponent": { "seed": "...", "cursor": 0 },
    "reward": { "seed": "...", "cursor": 0 }
  },
  "members": {},
  "roster": {
    "combatantId": {
      "custodianMemberId": "...",
      "sourceSaveFingerprint": "read-only-import-reference",
      "careerLevel": 1,
      "xp": 0,
      "mechanicalCompleteAtReceipt": null,
      "highestClear": 0,
      "frontierRewardSet": {
        "id": "...",
        "challengeTier": 1,
        "sequence": 1,
        "slots": [
          { "fightIndex": 1, "key": "...", "kind": "reward", "state": "unspent" },
          { "fightIndex": 2, "key": "...", "kind": "reward", "state": "unspent" },
          { "fightIndex": 3, "key": "...", "kind": "reward", "state": "unspent" },
          { "fightIndex": 4, "key": "...", "kind": "reward", "state": "unspent" }
        ]
      },
      "pendingMilestoneBosses": [],
      "gold": 0,
      "forgeMarks": 0,
      "pity": {},
      "masteryLibrary": [],
      "charterUnlockIds": ["standard"],
      "charterClearLedger": {},
      "epoch": {
        "index": 0,
        "boundaryState": "none",
        "requiredChallengeTier": null,
        "attunedRuleIds": [],
        "prunedFamilyIds": [],
        "retirementEvidenceByOptionId": {},
        "retiredMechanicalOptionIds": [],
        "reversiblePruneSnapshot": null
      },
      "ruleLoadout": [],
      "equipment": {},
      "battleItemIds": [],
      "vaultItemIds": [],
      "pendingRewardIds": [],
      "pendingBoundAwardIds": []
    }
  },
  "items": {},
  "team": {
    "activeCharterId": null,
    "charterAssignments": {},
    "charterRotation": {
      "deckIds": [],
      "recentEpochSelectionIds": []
    },
    "charterCompaction": {
      "highestCompactedEpochIndex": 0,
      "saturatingClearCountsById": {}
    },
    "gauntletCooldown": null,
    "blueprintIds": [],
    "lockerItemIds": [],
    "contract": {},
    "circuit": {},
    "clearLedger": {},
    "trophySourceLedger": {
      "concord": { "distinctPaidFinalSettlements": 0, "unlockedAtReceiptId": null }
    },
    "rivals": []
  },
  "routeOffers": {},
  "opponentRecipes": {},
  "circuitPlanEnvelope": {},
  "pendingRewards": {},
  "transactionJournal": {
    "nextBattleSequence": 1,
    "lastAppliedBattleSequence": 0,
    "nextMutationSequenceByActor": {},
    "lastAppliedMutationSequenceByActor": {},
    "pendingAttemptSettlement": null,
    "recentReceipts": []
  }
}
```

The sidecar schema may begin at v1, but its rule descriptor targets a required
**rule-set contract v2**. Before `endless-v0` can start a battle or persist a
campaign, v2 must add a required nonnegative integer `designVersion` to the
descriptor validator; return it from `describeTeamRuleSet`; project it into
`team-battle.rules`; and include it in battle-start hashes, results, recipes,
reward outcomes, items, and receipts. Lobby/adapter validation rejects a peer,
save, result, or claim whose ID/contract/design triple differs. Existing v1
classic descriptors migrate explicitly to `designVersion: 0`; no runtime path
silently invents a missing value. The current contract/projection does not yet
do this, so this is a blocking seam change, not a field the sidecar may pretend
is already authoritative. [V/A]

The example deliberately retains the currently legal `placeholder`
verification with `runtimeVerified: false` and an explicit designed-intent note.
If the recommended `designed` verification class is added later, bump the
contract/schema and migrate that enum separately; do not write a value today's
validator rejects. Generator and definition versions remain separate migration
identities from `ruleSet.designVersion`.

Each item stores stable item/campaign/owner IDs, chassis family/profile/tier,
rarity, affix IDs, Rule Load/tags/stacking groups, bind state, source encounter,
rule-set/generator provenance, definition version, immutable
`requiredClearTier`, immutable `originChallengeTier`, immutable
`chassisCeilingTier`, and an entity version. It also stores the irreversible
`markSalvageEligible` exchange flag.

The active `team-battle` state stays separate. Its current projection carries
combatant state, initiative/turn state, combat RNG, result, and settlement
state, while controller assignments remain in the separate controller
projection. [V] Once canonical equipment exists, this design additionally
requires battle start to freeze loadout item IDs and definition hashes so a
mid-Circuit inventory write cannot change an active fight. [A]

### 10.2 Deterministic streams

At minimum, persist independent deterministic streams for:

- route offers;
- Mastery offers, independently keyed by
  `(combatantId, careerLevel, masteryChoiceOrdinal)`;
- opponent recipes;
- loot/reward plans;
- combat resolution.

Presentation order, controller identity, wall clock, and reload count never
seed any of them. Preparing the paid+Recovery plan advances the route stream
once before reveal. After that commit, Concede and every Recovery restart
advance **no** RNG stream. Only a final-clear receipt may request the next route
offer draw, keyed idempotently by the canonical hash of sorted newly eligible
personal `frontierRewardSetId` values; replay returns the same offers/cursor.
None can shift a future level's Mastery choices.
Changing a reward animation cannot perturb a combat roll. A Rematch restores
its encounter's same combat seed and attempt-start labelled-cursor state rather
than consuming a new attempt seed.

`endless-v0` may not use one action-agnostic global tape that a harmless action
can advance to change a later hit. Each combat draw is addressed by a stable
semantic tuple such as `(battleSeed, sourceCombatantId, targetCombatantId,
actionOrEffectId, rollKind, occurrenceOrdinalForThatLabel)`. The canonical RNG
projection persists the per-label occurrence counters/hash. An unused roll is
never drawn; presentation, no-op, controller, logging, and a different semantic
label cannot advance another label's occurrence. Attempt count and prior losses
are not inputs. This is deterministic domain separation, not a secrecy claim:
the design must remain sound even if a local player can inspect its seed.

### 10.3 Attempt settlement, grants, and clear-only transitions

The existing in-memory settlement latch prevents duplicate callbacks during a
live resolver instance, but it cannot guarantee durable rewards if the process
crashes after the latch and before the campaign write. [V/D]

Use this flow:

1. Before the encounter's first attempt, persist its opponent recipe,
   participating personal reward/record slot-key values, complete corresponding
   outcomes, and one encounter combat seed/label-cursor state inside the active
   `circuitPlanEnvelope`. Assistance stores only the base recipe hash, removed
   modifier ID, definition version, derived assisted hash, and alternate outcome
   IDs under the **same** personal keys; a pure versioned function derives the
   recipe. Selecting it atomically tombstones every full-rank sibling and stale
   acknowledgement. Recovery has a distinct `clearOnly` branch identity under
   the same closed slot ledger, while optional Overtime pots use a distinct
   namespace after the ordinary plan commits.
2. Starting an attempt atomically reserves a unique `battleSequence` and
   freezes the encounter, branch/recipe and definition hashes, roster, loadout,
   selected combat seed/label counters, completion identity, scheduler, every
   combatant's health/armour/ward/position/resource/status state, per-battle
   charges, and durability in a compact immutable `attemptStartSnapshot`.
   Ordinary Rematch can be created only from those bytes. Assistance gets one
   new derived-branch start snapshot; Recovery's one allowed loadout gets one
   new Recovery start snapshot. Neither can mutate the paid snapshot.
   Individual knockouts do not settle.
   After each resolved actor-action, the active `team-battle` store atomically
   checkpoints the same `battleSequence`, stable command operation ID,
   canonical combat/scheduler state, label counters, event high-water, and
   bounded log append. Retrying a command returns its recorded event or resolves
   it once; it never draws twice.
3. Team elimination arms the result. Before passing the matching animation
   acknowledgement into the existing resolver gate, the adapter atomically
   writes `pendingAttemptSettlement.state = "ack-prepared"` **and the full
   immutable compact `preAckSnapshot` bytes into the sidecar transaction
   journal**. The blob contains campaign/encounter/battle IDs and versions,
   branch/recipe and loadout hashes, frozen result, completion token,
   acknowledgement evidence, canonical combatants/resources/statuses,
   scheduler/cycle/Pressure state, and combat seed/label counters. Its content
   hash verifies the embedded bytes but never replaces them or points only to a
   mutable `team-battle` projection. Only after that atomic write may the
   resolver latch and invoke its callback. [V/A] At most one pre-ack blob exists
   per active battle and it remains immutable until settlement commits.
4. In the callback, the campaign handler derives one `state = "settled"` intent
   keyed by
   `campaignId + encounterInstanceId + battleSequence + completionToken` and
   atomically commits the result plus the applicable per-combatant transitions:
   - **ordinary paid/Recovery/Practice loss:** write a zero-grant attempt receipt, advance the
     encounter's attempt count, and preserve its recipe, reward plan, fixed
     start snapshot, and unconsumed eligibility keys for Rematch;
   - **`grantEligible` win:** verify and consume each unspent participating key,
     add its precommitted XP/currency, persist its personal reward outcome,
     update pity/target state, and write its grant fact. If this is the frontier
     final, the same transaction advances `highestClear`, closes the old reward
     set, and invokes §3.1's shared next-set-kind rule to initialize exactly one
     next-frontier set;
   - **`recordEligible` win:** verify/consume its unspent `kind: record` key,
     commit exactly one prepared `recordFact` containing `xpDelta` and zero or
     one non-`none` payload, and write no mechanical grant. Its final also
     advances `highestClear`, closes the pinned record-kind set, and invokes the
     shared next-set-kind rule in the same transaction; it never hard-codes the
     successor as record;
   - **`clearEligible`-only Recovery win:** consume no key and grant nothing.
     Fights one through three advance only the frozen Recovery branch. Its final
     advances `highestClear` exactly once, records `clearOnly: true`, closes the
     forfeited set, invokes the shared rule to initialize exactly one
     next-frontier set, and applies only
     precommitted baseline narrative/source credit—not Contract/debt, Trophy,
     item, XP, gold, Marks, cache, pity, or target credit;
   - **Practice win:** write zero grant and zero clear, changing only its
     historical attempt/record state;
   - **ordinary-final variant hooks:** after all frozen personal key facts and
     the successor transition are derived, evaluate the full-roster paid-final
     predicate once inside this same settled intent. If it qualifies an active
     Gauntlet cooldown, atomically insert the unseen final-receipt hash and apply
     one saturating decrement. If it is an Overtime-eligible non-Gauntlet final,
     atomically activate every precommitted typed pot under its one envelope ID.
     One ordinary final may perform both hooks; the later Overtime fights never
     decrement cooldown. A duplicate hash/envelope activation is rejected
     without partial team or personal mutation;
   - **`overtimeRisk` result:** verify the frozen `risk-1` or `risk-2` state and
     commit its attempt receipt plus every personal pot edge atomically. Loss
     sinks all frozen pots into terminal `lost-k/forfeited` and offers no
     Rematch. A risk-1 win moves all to `won-1`, from which unanimous risk-2 or
     deterministic cash-out is later sequenced. A risk-2 win moves directly to
     `won-2/paid-out` and grants each precommitted gold/record pot exactly once.
     It consumes no ordinary key and mutates no XP/cache/Marks/pity/target/
     source/clear state. A crash can expose neither a pot edge without its
     attempt receipt nor a terminal loss with a live pot.
   One winning team may contain different personal classifications; all are
   evaluated against the frozen tier/set IDs and commit in one transaction.
5. The same transaction writes one attempt receipt, advances
   `lastAppliedBattleSequence`, and clears both
   `pendingAttemptSettlement` and its embedded pre-ack bytes. A duplicate,
   stale, consumed-key, reordered, mismatched, or second next-frontier intent is
   rejected without mutation. The attempt-start snapshot remains only while the
   encounter can still Rematch and is garbage-collected after branch completion.
6. On load, a matching `ack-prepared` record with no receipt rehydrates a fresh
   resolver from the embedded bytes after validating their hash, schema/version,
   battle identity, result, and completion token, then replays the recorded
   acknowledgement through the normal gate; it never applies a grant directly.
   This also repairs a callback write failure after the old live instance has
   latched. If an implementation exposes a separately durable `settled` intent,
   it may retry only that exact intent. Never infer settlement or a grant from
   `decided`, an animation-pending result without `ack-prepared`, or a prepared
   encounter. A crash after commit sees the receipt/checkpoint and does nothing;
   if the active battle projection is stale but the campaign commit survived,
   that same receipt still suppresses a second grant. Missing/corrupt embedded
   bytes enter a durable repair/error state and never infer settlement or a
   grant. Save backup/migration copies the journal bytes with the sidecar and
   cannot compact state referenced by `ack-prepared`.
   Earlier crash states also resume, never restart: `reserved` with no action
   reuses the attempt-start bytes and same `battleSequence`; `active` rehydrates
   the exact last durable action checkpoint; `decided` without `ack-prepared`
   rehydrates that decided checkpoint and re-presents the same pending
   acknowledgement. None allocates a new sequence, restores an earlier action,
   writes an attempt receipt, or exposes Rematch. Only a settled-loss receipt
   authorizes constructing a Rematch from the attempt-start snapshot.
7. A reward claim, equip, locker transfer, trade, Forge, salvage, or other sink
   is a separate idempotent mutation. Each carries a stable operation ID, an
   actor-scoped monotonic sequence, and expected entity version. The journal
   advances the relevant high-water mark and writes the changed entity plus
   receipt atomically. A full vault or disconnected custodian cannot lose a
   pending offer.

“Actor” in that journal is a tagged durable authority, never a seat, controller,
or bare combatant: `member:<custodianMemberId>` signs personal choices and
`system:campaign` signs automatic settlement, migration, timeout, and generator
mutations. A member operation must use exactly `lastApplied + 1`; retry reuses
the same sequence, operation ID, and payload hash. A gap, old sequence, or same
ID/sequence with different payload is rejected. The campaign allocator reserves
its next system sequence in the same transaction as the mutation. One custodian
controlling several combatants still has one member namespace; expected entity
versions prevent cross-combatant confusion.

A two-party trade is three idempotent records: the proposer consumes its member
sequence for a versioned offer hash, the recipient consumes its own member
sequence for that exact acceptance hash, and one `system:campaign` transaction
verifies both live consents/entity versions before moving the item and closing
both intents. Cancellation is another sequenced consent and cannot race a
successful finalization. Controller/AI handoff can submit battle commands but
can never allocate either custodian's campaign-mutation sequence.

The completion token alone is not a durable battle identity because two
different encounters can have the same teams and result. Old, duplicate,
reordered, or mismatched acknowledgements must be rejected.

Keep high-water checkpoints plus the last 32 detailed receipts across attempt
settlement, grants, claims, transfers, Forge/salvage sinks, and migrations.
Stable entity versions and actor-scoped mutation high-water marks make a replay
outside that window rejectable without an unbounded operation-ID set. Do not
append the full battle event history to the campaign forever.

### 10.4 Migration

- No sidecar means opt-in import into v1 with new stable IDs and a read-only
  source fingerprint.
- Import never back-writes to vanilla.
- A campaign migrates only at a **clean boundary**: no reserved/active/decided/
  `ack-prepared` attempt, active Circuit/Recovery/Overtime envelope, pending
  trade, item offer, or bound award. Until then, the loader activates the exact
  pinned old rule/generator/definition implementation needed to continue,
  settle, and claim; a cross-version lobby remains rejected. If those old bytes
  are unavailable, migration/start is refused with the save untouched—never
  reset or reinterpreted.
- An implementation may instead transform a pending offer/award only through an
  explicit idempotent migration receipt that preserves its candidates/value,
  ownership, bind/source gates, and operation identity under a reviewed mapping.
  Active plans, attempt-start snapshots, pre-ack snapshots, and results are
  never transformed: they settle under their pinned version first. Removed/
  renamed Charter and item IDs likewise use explicit mappings/quarantine at the
  clean boundary.
- Each later migration is a pure `vN -> vN+1` function and idempotent:
  `migrate(migrate(save)) == migrate(save)`.
- Write a recoverable backup before migration.
- Unknown affix/rule IDs are quarantined, not deleted.
- `retiredMechanicalOptionIds` migrates as a bounded bitset over the versioned
  authored catalog; its irreversible high-water state does not depend on the
  32 detailed-receipt window. Adding a potentially unlockable ID clears any
  prior completion marker and emits the `catalog-reopened` receipt described
  above.
- A balance migration either maps an item to the current fixed budget or
  retires it for full Marks and emits a migration receipt.
- All peers must agree on rules, generator, and item-definition versions before
  battle start.

### 10.5 Size estimate

These are uncompressed JSON design estimates, not measured saves:

Growth bounds are part of the schema: at most three persistent members and
three persistent combatants, at most four live Charter assignments plus one
compacted high-water/counter summary, and only current/next route offers. Use
fixed-width unsigned 64-bit canonical integers for level/Epoch/challenge,
sequence, and high-water counters (smaller declared fields may use u32); never
an arbitrary-precision decimal that grows in bytes. Overflow rejects the next
mutation with a diagnostic rather than wrapping. That finite bound is far beyond
practical play and is consistent with this document's rejection of literal
infinite novelty.
use phase-exclusive opponent storage: a paid Circuit holds four core plus four
precommitted Recovery recipes (eight); Assistance adds only one versioned
module-removal delta/outcome pointer, not a ninth recipe; after Concede the paid
recipes compact to hashes/receipts and at most four Recovery recipes remain;
after an ordinary final receipt commits, core/Recovery recipes compact before
at most two Overtime recipes are generated. Thus no phase holds more than eight
full live recipes; a conservative serializer fixture must nevertheless exercise
all deltas, hashes, and pots together. Exactly one active
`circuitPlanEnvelope` contains the frozen roster's personal outcomes; it is not
one plan per combatant. Keep at most four unresolved item offers plus one bound
award per combatant (twelve offers plus three awards in 3v3), three active
plus eight retired rival summaries (eleven records), and 32 recent mixed
transaction receipts. Contract clears use a highest-cleared challenge tier per
finite canonical **debt-set ID**, plus the last 32 exceptional keys, rather
than collapsing combinations into a debt family or storing one procedural
fight record forever. Static catalogs and the finite Mastery library are IDs or
bitsets, not copied definitions.

| Record | Assumption | Approximate size |
| --- | ---: | ---: |
| Three combatants | About 1 KB each excluding item instances | 3 KB |
| Full personal vaults | 24 × 3 × about 250 B/item | 18 KB |
| Team locker | 48 × about 250 B/item | 12 KB |
| Active equipment/carried items | 16 × 3 × about 250 B/item | 12 KB |
| Eleven rival records | About 500 B each | 5.5 KB |
| Route/opponent recipes and full Circuit-plan envelope | All bounded branches | 8–14 KB |
| Pending item offers | 12 × about 500–650 B/two-candidate offer | 6–8 KB |
| Pending bound-award escrow | At most 3 × about 250 B/item plus IDs | About 1 KB |
| Currencies, pity, clear ledgers, provenance | — | 2–4 KB |
| Epoch attunement/prune/retirement and team Charter assignments/deck | Bounded IDs/bitsets | 1–2 KB |
| Recent mixed receipts/high-water checkpoints | 32 detailed receipts | 4–8 KB |
| Active six-combatant battle base | Without an unbounded log | 5–10 KB |
| Immutable Rematch attempt-start snapshot | At most one active branch | 5–10 KB |
| Embedded immutable pre-ack snapshot | At most one while `ack-prepared` | 5–10 KB |
| Bounded 120-action event history | Roughly two 150 B events/action | 36 KB |

The listed worst-live-state subtotal is approximately **124–154 KB** before
JSON key/allocator overhead. Budget **150–200 KB** for the full campaign plus
active battle, then
replace estimates with measured serializer fixtures. The smaller two-combatant
MVP target remains below 100 KB at its 80-action cap and smaller item/catalog
bounds **while `ack-prepared` and both immutable snapshots are live**; that is a
measured acceptance gate, not a consequence asserted from the full-design
estimate.
Storage volume is less risky than migration, ownership, idempotence, and
unbounded event history.

---

## 11. Normative mechanic/seam/degeneracy ledger

Every proposed mechanic is listed here. “Classic-compatible” means it *could*
run over a future verified classic combat rule set when it uses only verified
existing semantics; it does not mean the campaign itself is vanilla.

| Mechanic | Parity / implementation seam | Invited degenerate strategy | Required counter and rejection test |
| --- | --- | --- | --- |
| Finite career tier and level-50 vertical cap | Campaign/stat authoring; designed progression, no classic change. | Hoard until the cap, then one solved build forever. | Later rewards add bounded rule alternatives and doctrine counters; reject if one loadout is best/within 5% in over 70% of doctrine×tier cells. |
| Already-capped Speed/ammunition axes | Designed allocation/reward authoring and UI; it does not change mapped classic formulas. | Offer dead Speed after 40 or fictional ammunition capacity after level 45, creating fake progression. | Marginal-projection validator removes unchanged choices; audit Speed 39/40/41 and career levels 44/45/46/100 and reject any displayed vertical choice with a byte-identical combat projection. |
| Frontier paid/clear eligibility | Campaign challenge/reward state; no classic combat change. | Hold a tier, farm fresh keys/Marks/pity, or clear-only/carry far ahead then claim high-tier rewards. | Initialize one four-key set; separate grant from clear; closed slots never reopen; only paid grants mutate reward channels/Trophy source; cap each personal reward budget to career tier; either frozen final creates at most one next set. Reject hold/farm/skip/carry policies. |
| Four-fight Circuit and build lock | Campaign state/UI; classic-compatible only for existing actions. | Find one universal kit or Concede until a better fallback appears. | Scout/foil/mixed/final grammar, fixed eligibility keys, and the same precommitted Recovery recipes/source credit after every Concede; reject if removing the lock leaves the same policy or repeated Concede changes route/source odds. |
| Loss log/Training Assistance | Campaign reward/recipe state/UI; selected boss modules may use designed semantics. | Scout a fixed RNG tape, pad labels, preserve two sibling keys, or deliberately fail into an easier farm. | Full attempt-start restore, semantic-label RNG, resolved-events-only log, no voluntary restart, and atomic same-key Assistance delta after three boss losses; include all scouting actions and reject if an intentional-loss/padding policy improves progression per total resolved action. |
| Shared-decision protocol | Campaign member/ballot state/UI; no combat-rule change. | Host chooses everything, hot-seat fighters multiply votes, or one controller destroys allied keys with Concede. | One vote per custodian, ranked route ballot, unanimous frozen electorate for spend/risk/Concede/Recovery restart, timeout=no, and atomic forfeiture; test ties/disconnect/handoff/crash. |
| Champion Gauntlet/Overtime variants | Campaign schedule/reward; modifiers/Laws use their selected rule set. | Cool a high-tier run with allies/Assistance, strand a completed roster behind a grant-only cooldown, redirect completed-player gold, or reload to protect a lost pot. | Freeze entry tier/roster and decrement only on three same-roster, same-or-higher-tier full-rank non-Assistance paid final receipts that consume every reward/record key; no Gauntlet Overtime; typed reward-key gold/record versus record-key record-only pots and atomic risk receipts; reject dominant rotation/risk/cash-out. |
| Route offers | Campaign generator/save/UI. | Reload until the best route appears. | Persist all offers before display; 100 reloads must be byte-identical. |
| Rule Load | Loadout validator plus designed effects. | Spend all Load on one multiplicative package. | Family caps, one 3-point identity, shared team constraints, exhaustive combination graph; reject strict action/build dominance. |
| Team Control/Survival/Burst/Tactic budgets | Designed rules plus validator/state/UI. | Three legal kits recreate permanent control, invulnerability, multiplicative burst, or an aura appliance. | Team caps 2/1/2, tactic costs 1 Load on every fighter, strongest-only groups, Control Fatigue; reject two consecutive lost turns, uncapped survival/burst, or a solo-nonfunctional kit. |
| Mastery offers | Campaign state/UI. | Reroll, steer them by consuming route offers, or follow one acquisition script every career. | Independent stream keyed by combatant/level/ordinal, compatible/coverage/off-axis trio, exact anchors, diversity floor; reject route/Concede perturbation or fewer than two non-dominated choices on over 10% of screens. |
| Forms | Designed rules; may need new effect/resource state. | One Form wins damage, control, and efficiency simultaneously. | Equal total budgets and dominance matrix; reject a Form that is no worse on every relevant axis. |
| Techniques | Designed rules; six-slot item/state/UI expansion. | Six passives create unreadable proc soup. | Carried slot plus Rule Load, explicit timing/tags, trigger depth zero; reject any recursive or invisible proc. |
| MVP Approach Kit | Designed active Technique/action and canonical charge state. | Free repeated approach erases stamina/range decisions, evades the shared budget, or enables kiting. | One Rule Load and carried slot, one battle-local charge, consumes the scheduled action, moves only one step toward a living enemy, no damage/tag/proc, illegal at Pressure 8; reject any recharge, retreat, budget exception, or action-economy loop. |
| Signature action | Designed status/rule state/UI. | Three cheap filler actions into the same burst script. | Distinct consequential tags, visible readiness, marker consumption, no accuracy+bypass+control package; flag if one opener produces most activations. |
| Keystone | Designed rules/loadout validator. | One universal trigger satisfies every payoff. | Two tags maximum, costs 2 Load, exclusions, no extra turns; enumerate every Keystone/affix combination. |
| Measured Quiver/Critical Relay/Second Wind/Stabilizer | Designed affix rules; exact displayed probability and any shield/ranged correction are separate-rule-set semantics. | Intentionally miss to arm Quiver, bank/share Relay across actors, Rest-stall, or let Stabilizer dominate accuracy. | Persist source actor/item/event; only that actor's next scheduled action consumes/expires; Relay Bash uses ordinary accuracy, half-min selector, ward-then-health armour bypass, no crit/control/proc; enforce costs/95 cap and reject miss loops, stored markers, sustain, or dominance. |
| Blooded Reserve Pommel | Designed resource/effect state. | Turn safely disposable health into universally cheap Charge, pay through ward/armour by mistake, or trigger repeatedly. | Exact active-weapon check, once-per-battle atomic health-to-stamina exchange, cannot reduce health below 1 or proc as damage, no illegal-declaration mutation; sweep health/stamina remainders and reject universal inclusion. |
| Guarded Overdraw | Designed equipment/resource/accuracy state. | Spend nonexistent/depleted shield armour, gain accuracy before paying, or dump a shield after extracting its benefit. | Once per battle, atomic pre-action ammunition plus rounded current-shield payment, exact displayed cap, locked loadout; fault-inject payment and reject negative armour or strict ranged dominance. |
| Breakwater Ward | Designed damage-ingress/reaction state. | Re-cross the armour boundary for repeated caps or intentionally stay stamina-empty until a better crossing. | First crossing consumes the once-per-battle marker even when payment fails; paid trigger caps one event and discarded excess cannot proc. Enumerate stamina/repair/ward/crossing sequences and reject survival cycles. |
| Pursuit Step | Designed movement/resource state. | Make Charge the universal answer or create free infinite pursuit/kiting. | Enemy-created-range trigger keyed to the equipped source actor, that actor's immediate-next-Charge expiry, rounded surcharge, no extra action, Pressure fallback; search retreat/Charge cycles and reject strict movement dominance. |
| Sideboard/Pivot | Campaign/loadout state/UI. | Perfect counter-respec before every fight. | Two reserves, one swap per Circuit after fight two, route-level not exact preview; reject if adaptation has no opportunity cost. |
| Contracts/Arena Laws | Content-only debts may be classic-compatible; semantic debts use designed rules. | Farm the easiest debt/reward pair or stack multiplicative debts. | Interaction-priced rewards, family exclusions, first-clear emphasis, standard route always available; lower mode must not be fastest hard-mode power. |
| Arena Pressure | Resolver/canonical state owns cycle lifecycle; designed rules own recovery, legality, and outcomes. | Stall until the floor, attack summons/objects, redirect mandatory damage, or exhaust every ordinary attack. | Stack-8 living-seat target set, non-seat removal without procs, monotone hits/debt measure, universal Advance/Strike and nondivertible one-fifth floor, 40/80/120 caps, no turn-count reward; graph-search every target/death/resource/status state. |
| Doctrine opponents | Existing-record doctrines may be classic-compatible; new AI/target policy is designed. | One counter build trivializes every recipe. | Small rotating vocabulary and composition matrix; at least three full-design build families should lead at least 15% of cells each. |
| Procedural champions | Campaign generator plus designed modifier catalog. | Affix soup, hidden immunity, or stat-check. | One signature/one liability, fixed module budget, exclusions, two viable families, preview; reject unreadable or no-counter recipes. |
| Persistent rivals | Campaign state; designed AI only if memory changes policy. | Sandbag, win once in a fake kit, or create runaway exact mirroring. | A remembered tag must appear in two of the last three victories, with one replaceable broad counter and fixed ±15% budget; adversarial loss and tag-spoof victory policies must not improve later win rate or progression. |
| Milestone bosses | Authored content; phases/signatures/AI are designed. | Mandatory resistance, hundreds-turn attrition, or hidden extra turns. | Early preview, equal seats, no extra turns/spawns, at least two build families, bounded assistance and action-count gates. |
| Personal reward/record outcomes | Campaign generator/state/UI and durable settlement. | Last-hit funnel, host theft, completion disguises filler power, disconnect loss, reload reroll, or completion rewriting a displayed set. | One precommitted item-or-Marks outcome per grant-eligible combatant; one typed record fact per record key; at most one pinned reward-set grandfather; custodian escrow and knockout/handoff/disconnect/crash/reload tests. |
| Rarity as behaviour complexity | Designed rules for affixes; campaign loot/state/UI. | Legendary always best; item power becomes scalar again. | Same chassis budget, Rule Load cost, burden, one 3-point identity; reject if rarity alone orders all choices. |
| Hunt/off-axis candidates | Campaign offer state/UI. | Target the published best-in-slot kit every run. | Four-fight lock, one targeted and one off-axis candidate, active-target limit, build-frontier simulation. |
| Duplicate suppression and pity | Campaign state/generator. | Loss/reload advances pity, or ledger churn mints value. | Eligible-win cache grants only, persisted plan, bounded ledgers, no abandonment compensation; deterministic bad-luck-tail tests. |
| Forge/Enchant | Campaign state/UI; novel effects use designed rules. | Deterministic crafting makes drops irrelevant or creates perfect counter swaps. | Discovery/source gates, 6–48 Mark costs, between-Circuit lock, Rule Load; direct same-rarity general throughput must exceed 16/28/48-Mark exact-copy throughput under stationary pity. |
| Legendary evolution/retirement | Campaign item state/migration. | Permanent trophy becomes BIS and deletes future loot. | Immutable authored chassis ceiling, owner clear/career/global projection caps, one identity limit, burden, lateral Forms, retirement to blueprint/Marks; reject permanent additive legacy stats. |
| Charisma-independent Armory economy | Designed campaign economy, not classic parity. | Pure Charisma becomes the universal combat-acquisition build. | Fixed tier prices and Forge costs; test acquisition rate across stats. |
| Per-combatant inventory/custody | Canonical campaign state/save/UI. | Controller steals gear, a fourth persistent bench makes state unbounded, Trophy overflows, or absence deadlocks everyone. | Global three-member/combatant cap; separate identities; zero-pending readiness reserves four offers plus one bound award; one automatic award/Circuit and rewardless AI fill; handoff/disconnect conservation tests. |
| Item binding and locker/trade | Campaign state/UI and atomic persistence. | Funnel guarantees to one carry, clear-only launders career caps, or a consent retry duplicates on disconnect. | Explicit item states; recipient clear+career+rarity/source gates and `min(chassisCeiling, clear, career, 50)` projection while origin remains provenance; two member-sequenced consents plus system finalize; `A→B→A` conservation/concentration caps. |
| Mixed-progression party | Campaign gating/normalization state; no new combat formula if authored as loadout inputs. | Veteran power-levels a mule or farms a low ally's easy challenge tier. | Team challenge tier uses the minimum next unlock, veteran stats/Load clamp down, rewards stay personal/frontier-only, and bench gets none; enumerate every roster-level mix. |
| Shared Trophy blueprint/Concord prototype | Campaign final-receipt ledger/state/UI; embedded effects use designed rules. | Personal grant facts overcount the source, Chain preserves Relay through arbitrary fillers, an automatic copy overflows, or the 3-Load Trophy is worse than its components. | Increment once per unique paid final-attempt receipt; team discovery plus personal bound-award escrow; exact Relay/Pursuit bases with Chain permitted only across an immediately next Pursuit Charge into immediately next Bash; no extra action/proc/re-arm; frees the carried slot for the 1-Load Approach Kit while the pair fills the four-Load cap. Compare against separate components and reject stored-marker or dominated packages. |
| Co-op target/control safeguards | Designed AI/control rules. | Focus one seat before it acts, fixed buff opener, support appliance. | Telegraphed Focus, fatigue, strongest-only groups, self-capable kits; at least 95% of Standard seed fights give every starting seat one resolved action. |
| Epoch/Charter progression | Campaign content/state/UI; semantic Laws designed. | Per-Circuit ballots reroll Laws, later cards never enter, history grows forever, or retire/Prune fakes completion. | Formula-queued bosses and receipt-backed index; deterministic card insertion/mapping; max-four live assignments plus Standard catch-up compaction; three-decline retirement; full-potential completion/reopen tests. |
| Sidecar save and versioned provenance | New persistence layer plus rule-contract v2; classic fields untouched. | Upgrade strands a live result/offer, balance reinterpretation, or corrupt migration. | Validate/hash version triples; settle/claim under pinned old implementation; migrate only clean or transform escrow by explicit receipt; idempotent mappings/quarantine and cross-version lobby rejection. |
| Isolated deterministic RNG streams | Campaign generator, selected rule set, canonical combat state, and persistence. | Noncombat calls perturb combat, filler actions pad a tape, or repeated Recovery pads future routes. | Independent streams, semantic-label counters, zero draws after plan preparation on Concede/restart, and one set-keyed next-route advance; perturb/replay all inputs. |
| Circuit plan, attempt receipts, and grant/clear transitions | Persistence plus existing settlement callback. | Process kill restarts an attempt, latch loses payout, Overtime loss preserves pot, or duplicate creates a set. | Durable per-action checkpoints and exact-state load; embedded pre-ack bytes; atomic paid/record/clear/Practice/Overtime classification, key/set/pot/receipt mutation, and fault tests at every boundary. |

---

## 12. Adversarial tuning gates

All thresholds are initial `[A]` gates. They are meant to reject bad designs,
not claim current balance.

### 12.1 Combat and build frontier

- Sweep pure and mixed builds across career levels 1/10/25/39/40/41/44/45/
  46/50/100, their corresponding capped career tiers, every doctrine,
  1v1/2v2/3v3, and persisted seeds.
- At every timeline milestone, compare the optimal policy and action
  distribution immediately before and after the unlock. Reject an unlock whose
  only material effect is multiplying the same policy; record wins, actor
  actions, gold spent/earned, action usage, and hard-counter cells for each
  build family rather than only aggregate win rate.
- Full design: at least three build families are best in at least 15% of
  doctrine×tier cells each.
- No build is best or within 5% of best in more than 70% of cells.
- No action is at least as effective on damage, armour pressure, control,
  resource exchange, target reach, and setup cost while costing no more than
  another action.
- Action comparisons include health damage, armour/ward removal, control uptime,
  stamina/magicka/ammunition exchange, movement/target value, and expected
  `grantEligible` reward per required resource. Reward itself never scales with
  live action count.
- No untelegraphed equal-tier opener guarantees a knockout before the victim's
  first scheduled action.
- Pre-first-action defeat stays below 5% of Standard persisted-seed cases.
- At Speed 39/40/41 and career levels 44/45/46/100, every displayed stat or
  item-growth choice must change its serialized combat projection. Speed above
  the mapped cap and post-45 ammunition-capacity ranks must be absent, not
  silently convertible after selection.

### 12.2 Resolution and control

- 1v1 target: median 6–12 resolved actor-actions, 95th percentile at most 20;
- 2v2: median 12–24, 95th at most 36;
- 3v3: median 18–36, 95th at most 54;
- adversarial hard tails: 1v1 99th percentile/hard cap at most 40 actor-actions,
  2v2 at most 80, and 3v3 at most 120;
- no reachable heal/rest/movement/control cycle with nonnegative resources and
  no mandatory progress;
- from every reachable living state at Pressure stack 8, exactly one of
  Pressure Advance or Pressure Strike is legal regardless of exhausted
  resources, disarm, silence, cooldown, or ordinary action vocabulary; exhaustive
  search must prove the monotone measure decreases on the selected action.
  Include existing summons/objects, redirection/sharing/reaction attempts,
  target death before Advance, revive/team-switch attempts, and adversarial
  target selection; every legal target is a living opposing snapshotted seat and
  the exact authored maxima remain 39/79/119 actions;
- one `(source item, action, target)` may trigger at most once;
- proc trigger depth is always zero: an effect caused by a proc cannot trigger
  another proc;
- a target cannot lose two consecutive scheduled actions to hard control.

### 12.3 Co-op agency

- In at least 80% of sampled decision states, each living seat has two
  consequential non-dominated legal actions.
- No offered build is nonfunctional in 1v1.
- Concentrating all transferable items on one fighter must satisfy **both**
  limits versus balanced allocation: team win-rate advantage at most 5
  percentage points and median reward-per-action advantage at most 5%. Reject
  the policy if either limit is exceeded.
- Every progression-eligible persistent combatant receives and owns exactly one
  personal reward outcome per `grantEligible` win. Automatic Marks require no choice;
  its custodian alone resolves a successful-cache item offer.
- Propose Concede after 0/1/2/3 wins and Recovery restart with unanimous yes,
  one no, timeout, disconnect, controller handoff, and a crash at every write.
  Only unanimous frozen-custodian consent applies the all-or-nothing
  forfeiture/bind/restart receipt; no controller or partial write destroys an
  ally's key.

### 12.4 Determinism, conservation, and saves

- One hundred reloads before/after route reveal, reward reveal, battle,
  each durable action checkpoint, `decided`, `ack-prepared`, attempt settlement,
  Concede/Recovery restart, and claim produce identical IDs, recipes,
  candidates, cursors, events, and grants. After plan preparation, every
  Concede/Recovery restart leaves every RNG cursor byte-identical; the next
  frontier advances the route cursor once under its set ID.
- Every persisted battle/result, opponent recipe, personal reward outcome,
  item, transaction receipt, and migration result identifies campaign,
  `ruleSet` ID/contract/design version, generator ID/version where applicable,
  and definition version; a cross-version lobby or claim is rejected rather
  than silently reinterpreted.
- Starting from one byte-identical attempt-start snapshot, combat seed, and command
  sequence, perturb route, Mastery, opponent, reward, presentation order,
  controller handoff, and wall-clock inputs independently. Combat events,
  outcome, and combat RNG label counters must remain byte-identical; each noncombat
  perturbation may advance only its declared stream. Concede/Recovery cannot
  alter a level-keyed Mastery offer, and Rematch restores every canonical
  resource/status/durability/charge byte plus the same combat seed/counters
  rather than selecting another.
- Compare continuing after a bad opening, intentional elimination, filler/action
  reordering, and one or more learned Rematches against the best honest policy.
  Count scouting attempts' actions in the denominator. Unrelated semantic labels
  may not shift another label's roll opportunity; reject if loss/padding changes
  the opportunity set or improves expected progression per total resolved
  actor-action beyond the 5% policy tolerance. Strategic learning may change
  commands, but no attempt count or prior result enters RNG.
- Attempting to substitute a bench `combatantId`, active item hash, or Rule Load
  after Circuit lock is rejected without mutation. AI controller handoff for a
  locked combatant remains legal and changes none of those hashes.
- Across reward, equip, unequip, locker, trade, forge, salvage, disconnect,
  and reload: `before + created - explicitSinks == after`.
- For an eligible unbound item, `A -> B -> A` preserves item ID, origin,
  affixes, rolls, caps, bind history, reroll count, mode, and provenance; a
  bound-item transfer is rejected without mutation.
- Fault injection before/after attempt reservation, command receipt/action
  checkpoint, elimination, durable `ack-prepared`, resolver
  latch/callback, fresh-resolver acknowledgement replay, settled intent,
  attempt receipt, personal eligible-key consumption, campaign commit, claim, and reload
  yields exactly one attempt receipt for every acknowledged attempt. Loss and
  Practice yield zero grants and zero clear; the first `grantEligible` win
  yields exactly one grant; `recordEligible` yields one typed `recordFact`; a
  `clearEligible`-only win yields zero grant and its final creates exactly
  one next-frontier set; no path yields two of any. An Overtime result atomically
  writes its attempt receipt and either sinks or advances every pot, with loss
  offering no Rematch. A
  merely decided battle without `ack-prepared` never grants or clears.
- At every pre-ack fault point, assert the full embedded snapshot is either
  absent with no prepared acknowledgement or present, hash-valid, immutable,
  and sufficient to rehydrate without mutable battle state. Missing/corrupt
  bytes enter repair/error and never grant. Backup/migration preserves the blob;
  the receipt transaction clears it exactly once.
- Replay claims, transfers, and sinks both inside and beyond the 32-receipt
  detail window. Exercise `member:<id>` and `system:campaign` namespaces, one
  custodian over multiple combatants, payload-changing retry, gaps, and a
  propose/accept/cancel/finalize trade race. Actor high-water marks, consent
  hashes, and entity versions must reject the old/conflicting mutation without
  growing an unbounded deduplication set.
- Leave one custodian disconnected indefinitely with four pending offers. The
  offers and ownership remain unchanged while the combatant is benched and the
  other members can start and settle further Circuits using a rewardless AI
  fill.
- Readiness with even one pending offer or bound award is rejected without
  mutation; readiness from zero reserves four offer records plus one bound-award
  record. Four cache outcomes and one automatic Trophy fill exactly those five
  without blocking a grant, vault overflow, disconnect, or reload.
- Round-trip a mixed level-110/125 party through save/reload at every Epoch
  boundary state. Personal Charter unlock/clear, attuned library, reversible
  Prune, retired-option bitset, required tier, team Epoch assignments,
  deck/recent-Epoch window, and derived active Charter must remain byte-identical;
  playing down advances neither personal Epoch and an ordinary same-band Circuit
  never reruns the Charter ballot.
- Unlock two later Charters simultaneously and require one sorted, idempotent
  tail insertion each; migrate one rename and one removal at a clean boundary.
  Run three persistent combatants thousands of Epochs apart: at most four live
  assignments remain, old bands compact once unreferenced, and a lagging member
  receives derived Standard catch-up without deck/window mutation.
- Attempt migration with an active/decided/prepared battle, Circuit/Overtime
  envelope, old-version offer, bound award, and trade. It must continue under
  the pinned old implementation or remain untouched; only a clean boundary or
  explicit receipt-backed escrow transform may change versions.
- Exercise paid+Recovery recipes, Assistance delta, pending escrows, Overtime
  phase, attempt-start snapshot, and live `ack-prepared`; assert no phase exceeds
  eight full recipes and all compaction waits for the receipt it depends on.
- MVP campaign plus active battle remains below 100 KB at its action cap while
  both immutable snapshots and live `ack-prepared` are present.

### 12.5 Fresh-save progression and economy

- Simulate a fresh campaign from level 1 through 200 using only resources and
  unlocks earned by the simulated combatants. Every required purchase, source
  clear, Rule Load gate, item claim, and milestone transition must be reachable
  without developer grants, circular prerequisites, or an assumed legacy save.
  Fresh creation begins with one non-null tier-1 reward set; capstone unlocks the
  four initial Charters/deck. Crossing 125/150/175/200 queues exactly boss
  `e = (level - 100) / 25`; its one boundary-clear receipt advances the personal
  index once and each band creates no more than one live assignment.
- Every route ballot contains the zero-debt Standard route; Contracts compete
  with it rather than replacing it. A player who spends on each newly taught
  system must retain at least one legal current-tier chassis/loadout path.
- Compare acquisition and clear cadence across pure and mixed stat allocations.
  Designed gold prices and Forge-Mark income must be independent of Charisma;
  no allocation may become the universal fastest combat-and-acquisition policy.
- Sweep keep, all-salvage, target-hunt, exact-Forge, transfer-concentration, and
  delayed-spend policies at each unlock boundary. Reject a policy that bypasses
  a source/clear gate, makes 16/28/48-Mark deterministic copies faster than
  same-rarity general drop throughput, or improves higher-tier progression by
  farming a cleared tier. Explicitly simulate refusing the next frontier clear:
  no new paid key, XP, cache, Mark, pity, or boss progress may be created.
- Simulate three paid wins, Concede, and arbitrarily many restarts of the same
  precommitted Recovery branch. The three consumed slots and one forfeited slot
  remain closed; no route/source ballot or recipe/seed changes. Recovery fights
  one through three advance only clear-only branch state; its final may advance
  `highestClear` and baseline narrative/source credit but cannot mint a fifth
  payout, Trophy count, or debt credit. That final atomically creates exactly
  one next-tier four-key set, whose paid wins restore an XP source regardless of
  current career level.
- For every debt set and loss policy, compare honest final attempts with Concede
  after 0/1/2/3 paid wins followed by the entire Recovery branch through the
  same next-frontier-ready state. Count **all** paid, failed, and Recovery
  actor-actions. Each Concede policy must be no better for any participant or
  for the team on XP, gold, cache, Marks, pity/target, Trophy/source, mechanical
  grant, non-`none` record count, or authored `recordValueUnits` per total action;
  one player's mechanical gain cannot compensate another's lost record value.
  Include Recovery narrative/record value and safe Overtime cash-out value when
  those variants are enabled. The three-win policy must not become the
  acquisition or record optimum.
  Recovery may improve accessibility/clear probability, but only by accepting
  its four extra zero-grant fights, zero debt credit, and lost final outcome.
- Carry a low-career combatant through repeated clear-only frontiers, then win
  its next paid fight. Its XP (at most one level), chassis, gold scale, rarity,
  and effect pool remain capped to its personal career reward-budget tier; no
  skipped challenge tier, veteran teammate, or baseline source credit raises
  those grant budgets. Transfer a veteran item and evolve a Trophy: claim,
  active projection, and evolution all remain
  `min(chassisCeilingTier, highestClear, careerTier, 50)`; the immutable origin
  still drives provenance/salvage, ordinary-item ceilings equal creation budget,
  and locked rarity/effects remain unusable.
- At an Epoch boundary, attempt retirement with zero/one/two/three declined-offer
  receipts, an uncleared source, baseline/current/planned ID, wrong definition,
  duplicate retry, and a valid fourth case. Only one source-cleared ID with
  the capped three-distinct-decline evidence enters the irreversible bitset,
  with no compensation;
  retirement/Prune cannot create a power or acquisition advantage.
- Enter a high-tier Champion Gauntlet, then complete three lower-tier ally
  finals, Practice finals, and mismatched-roster finals: cooldown remains three.
  Three distinct full-rank non-Assistance ordinary paid final receipts by the
  frozen roster at the same or higher challenge tier, including mixed
  reward/record keys and all-record explicit no-outcomes, produce exactly
  `3 -> 2 -> 1 -> 0`; receipt replay,
  Assistance, Practice, lower-tier/partial-roster finals, Recovery, Concede,
  Gauntlet, and Overtime never decrement it. Fault injection around personal
  facts, final receipt/hash insertion, and the counter exposes either the whole
  qualifying settlement/decrement or none of it.
- Enumerate every Overtime cash/risk/loss/win/reload edge. Each eligible final
  reward-key member gets zero or one gold/record pot grant and each record-key
  member gets zero or one zero-gold record pot; test mixed and all-record teams,
  and reject pooling or redirection. No path creates XP, an item, offer, Mark,
  pity/target/source mutation, ordinary key, or fifth offer. Fault
  injection cannot separate its attempt receipt from the all-pot sink/advance,
  and an Overtime loss never exposes Rematch.
- Complete the authored catalog and verify the next prepared set uses
  `kind: record`: each win writes one `recordFact` with the exact prepared
  `xpDelta` and payload and no mechanical grant. Claim the last catalog mechanic
  after fights 1, 2, 3, and 4 and immediately after a final has created its
  successor: the sole current reward-set grandfather remains byte-identical,
  and the first set created after it closes and every later set remains
  record-kind while completion holds. Add a new
  potential mechanic by migration and require one `catalog-reopened` receipt;
  its pinned record set remains byte-identical, then the next-created and every
  later set remains reward-kind until completion is established again.
- With Overtime enabled, record completion once during fights 1--3 and once on
  a post-final claim. The first case may later activate only its already
  precommitted grandfather pot; the second retains the already active
  prior-set pot while naming the current successor as its frontier
  grandfather. Both references settle/clear independently and no third reward
  source appears. From the first case, Concede before the final and fault-inject
  each mutation boundary: remaining keys, the inactive pot, matching completion
  reference, and Recovery binding become tombstoned/cleared/bound all together
  or not at all; replay and Recovery cannot restore or activate the pot.
  Separately, let an automatic Trophy/source award complete the
  catalog in the final settlement itself: evaluate completion before successor
  kind, create a record-kind successor, leave `grandfatherRewardSetId = null`,
  and retain only a precommitted personal Overtime pot reference if that variant was
  eligible.
- Let a prepared record outcome's XP cross an Epoch boundary, clear the queued
  boss through its record slot, and replay every receipt. Exactly one
  `recordFact`, `choice-not-applicable`, index increment, reattunement, and next
  assignment occur, with no mechanic/currency. Repeat after catalog reopening:
  the pinned record boss still grants no boundary choice, while the next set is
  reward-kind and deterministic coverage retains every newly potential ID.
- Clear an Epoch boss through Recovery: its prepared boundary choice is
  forfeited with zero grant, remains unknown in the full potential catalog, and
  appears in a later deterministic coverage offer; it is neither lost forever
  nor silently counted as retired/completed.

### 12.6 Inherited boundary and history regressions

These tests preserve evidence discipline: classic candidates/goldens are never
edited, while `endless-v0` asserts its authored behavior explicitly.

The following are normative **designed** `endless-v0` oracles `[A]`, not claims
that candidate classic observations are promoted:

- Unless a spell definition explicitly says it bypasses armour, incoming
  positive damage drains ward, then armour, then health. Damage equal to
  remaining armour sets armour to zero and deals zero health damage; overflow
  alone reaches health. Any breastplate resource event uses the declared armour
  amount absorbed after that subtraction and cannot prevent elimination, which
  is tested only after the ordered damage/resource events finish.
- `critical` is event-local. It clears at the end of its direct attack and an
  ordinary following Bash neither inherits nor consumes it. Only the persisted
  Critical Relay marker can authorize Relay Bash, and Relay Bash consumes that
  marker under §4.5.
- Only the currently active weapon contributes damage selectors, enchantment,
  action legality, or potency. The inactive weapon contributes none. A legal
  swap atomically changes active ID/resource state for the next action and never
  changes an action already resolving.

- Enumerate `d100` 1–100 at displayed chances 1/50/95/99; designed outcomes
  must equal the display exactly. Sweep attacker shield 5/6: it cannot improve
  designed ranged accuracy unless the visible Stabilizer/Overdraw effect is
  equipped and paid. Do not infer the classic answer beyond promoted evidence.
- At armour `A-1/A/A+1`, test physical and spell absorption, exact equality,
  overflow, breastplate resource ordering, and elimination. Separately test
  `critical action -> Bash` consumption, active-versus-inactive weapon potency,
  a full monotonic helmet/greaves deflection sweep over every legal authored
  value (not only boundary points), and that every designed grievous/removal
  effect mutates its declared armour target. Relay Bash must use ordinary Bash
  accuracy, half-min rounding, ward-then-health armour bypass, and no
  critical/control/proc at every remainder boundary.
- Taunt adds no action-specific stamina unless a visible designed effect says so.
  Exercise the historical taunt/legal-action accidental-defeat path: declaring,
  resolving, missing, or resisting Taunt cannot set a battle result unless
  ordinary elimination already occurred.
  At maximum distance, action controls remain reachable; player and generated-AI
  equipment passes the same legality validator; every weapon-swap transition
  preserves active weapon/resource state.
- Fuzz imported display names and metadata with empty, long, Unicode, delimiter,
  and duplicate strings. Names never become stable IDs, RNG seeds, ownership
  keys, or effect selectors, and malformed legacy import is quarantined rather
  than mutating combat state.
- Fuzz every numeric schema field with a number encoded as string, `null`,
  missing, extra, fractional where integer is required, NaN/Infinity-like token,
  negative underflow, maximum accepted value, maximum-plus-one, and oversized
  exponent/integer. Validation must reject or quarantine before RNG, indexing,
  allocation, arithmetic, or combat mutation; it never coerces a nonnumeric
  representation into authoritative state.

---

## 13. Integration reality and sorted cost

### Cross-layer matrix

| System | Rule set | Resolver lifecycle | Canonical/campaign state | Persistence | Presentation | Total dependency |
| --- | --- | --- | --- | --- | --- | --- |
| Circuit/routes/content-only Contracts | No combat change. | None. | Circuit, ballots, locks. | Seeds/offers/keys. | Route/consent flow. | Medium; large UI/save surface. |
| Existing-action opponent records | None if eventual verified semantics/AI are unchanged. | None. | Recipe/loadout. | Generator version/recipe. | Doctrine preview. | Lowest combat-seam cost. |
| Forms/Techniques/Signatures/affixes | Owns legality and outcomes. | Existing ordered effects where sufficient. | Resources, counters, item links. | Library/loadout/provenance. | Tray/timing/log. | Large; blocked by canonical state. |
| Pressure and Control Fatigue | Owns resulting legality/recovery/outcomes. | Owns cycle increments and scheduled-turn expiry. | Pressure/fatigue counters. | Active-battle continuation. | Clock/threshold tells. | Large; resolver-state lifecycle plus rules. |
| Loot/offers/pity/Forge | Behaviour effects only. | None. | Items, currencies, plans. | Atomic sidecar. | Reward/Armory. | Large; not rule-set-only. |
| Personal inventory/custody/locker | Reads frozen equipped effects. | None. | Ownership/custody state machine. | Atomic transfers/migration. | Per-member Armory/consent. | Large. |
| Rivals | Only if memory changes AI policy. | None. | Bounded rival recipe/memory. | Versioned summaries. | Disclosed memory/liability. | Medium-to-large. |
| Battle/settlement durability | None. | Keep gate; add per-action checkpoint, exact-state load, and pre-ack rehydration. | Attempt-start/pre-ack snapshots, command/events, result/receipts/keys/pots. | Atomic active-battle store plus campaign journal and pinned-version recovery. | Resume/pending/error states. | Very large and prerequisite. |
| Rule/generator provenance | Contract-v2 descriptor with validated `designVersion`. | Project/hash ID+contract+design triple. | Separate generator/definition IDs. | Every persistent product and migration. | Always visible. | Small code, blocking and cross-cutting. |
| Launcher entry | None. | None. | None. | None. | Fixed launcher registry. | Separate integration. |

There is no honest “rule-set-only playable build” today: the inexpensive
content/rule seams still depend on missing campaign persistence, canonical
equipment/resources, or presentation. The critical path is:

1. approve and implement rule-contract v2 (`designVersion` validation,
   projection, and hashing), the sidecar schema, stable IDs, labelled RNG
   streams, and settlement-repair snapshots;
2. add the minimum canonical item/resource/status state and deterministic
   serializer;
3. implement the eight-effect `endless-v0` rule slice and loadout validator;
4. implement headless Circuit/opponent/reward generation and adversarial tests;
5. add the two-member route/Armory/reward UI;
6. expand content, then add rivals, locker/trade, and full 3v3 presentation;
7. consider launcher exposure only after the headless/UI slice is accepted.

### 13.1 Cheapest: campaign/content over existing semantics

Conditionally compatible with a future verified classic combat rule set:

- Circuit schedule and route offers;
- deterministic opponent records/loadouts using only existing actions;
- challenge-tier bookkeeping;
- authored milestone ordering;
- rival identity, return schedule, and cosmetic history;
- content-only Contract debts;
- loadout lock and sideboard bookkeeping;
- personal reward generation using only verified existing item semantics.

These still need campaign state/save/UI. “Classic-compatible combat” is not
the same as vanilla campaign parity, and “cheapest” here means lowest
combat-seam cost rather than a small total UI/persistence project.

### 13.2 Moderate: new designed rule set behind the seam

The rule set owns action vocabulary, legality, action outcome/RNG order,
maximum health, and AI policy. [V]

- Forms, Techniques, Signatures, Keystones, and behaviour affixes;
- explicit doctrine action/target policy;
- Control Fatigue and stacking groups;
- Arena Pressure legality/outcomes and semantic Arena Laws;
- the visible stabilizer and any correction of candidate shield/ranged,
  armour-equality, critical, resource, or recovery behaviour;
- proc trigger/exclusion logic.

These mechanics must never alter classic rules. They require an explicitly
non-runtime-verified `endless-v0` rule descriptor until the proposed `designed`
verification class is implemented.

### 13.3 Large/blocking: canonical combat state and effect protocol

The current canonical state does not yet model complete SS2 equipment,
inventory, stamina, ammunition, magicka, spells, timed statuses, or the complete
SS2-specific RNG call surface/mutation ordering. It **does** already carry the
authoritative generic RNG state/cursor. The current outcome protocol exposes
damage, heal, and boolean status effects, not every numeric resource or
equipment mutation needed here. [V]

Likely expansions include:

- complete mapped equipment and six carried item references;
- numeric resources and charges;
- timed/counted statuses, Signature markers, Control Fatigue, and Pressure;
- resolver-owned cycle-wrap Pressure increments and scheduled-turn status
  expiry;
- stable item-instance links and frozen loadout hashes;
- durable per-action canonical checkpoints and idempotent command operation IDs
  so process restart resumes rather than rewinds an attempt;
- explicit effect kinds only where ordered resource/equipment mutation cannot
  be represented safely as existing status.

The resolver should continue to own turn/team/seat structure, ordered effect
application, elimination, result, and settlement. Avoid extra boss turns,
spawned seats, or alternate result paths.

### 13.4 Large: persistence and migration

- `ss2-team-progression` sidecar and schema migrations;
- route/Mastery/opponent/reward RNG streams;
- personal frontier reward sets, milestone queues, Epoch
  attunement/prune/retirement, and team Charter assignments/rotation deck;
- item ownership, custody, offer/bound-award escrows, locker, blueprints, and pity;
- active Circuit plan envelope, immutable Rematch/pre-ack snapshots, and durable
  mixed transaction journal;
- clean-boundary migration plus pinned old-version continuation for active
  battles and pending escrows;
- bounded rivals and receipt/event compaction;
- version/provenance agreement across peers.

This is not optional infrastructure: without it, reload can become the optimal
loot strategy and a crash can duplicate or erase progression.

### 13.5 Large: presentation and co-op interaction

- route, doctrine, liability, Contract, and provenance previews;
- six-slot tray, Rule Load, team budget, Signature, and Pressure displays;
- per-combatant Armory/reward screens and custodian authorization;
- compare/equip/salvage, later locker/consent trade;
- sideboard/Pivot flow;
- multi-target and Focus tells;
- explicit migration/quarantine diagnostics.

### 13.6 Separate fixed integration: launcher exposure

A Collection menu entry requires a launcher change at a known fixed route.
[V] That work is separate from the progression system and is not part of this
design deliverable. No launcher or installed-game file should be touched while
prototyping the headless system. [A]

---

## 14. Minimum viable slice

A 1v1 scalar ladder does not demonstrate meaningful endless progression. The
smallest credible slice is a deterministic **2v2, four-fight Contract loop**
that can generate another Circuit indefinitely from a small authored catalog.

Build:

1. one clearly labelled, non-runtime-verified `endless-v0` rule set;
2. four previewed doctrines assembled into deterministic Scout/Foil/Mixed/Final
   recipes with stepped, capped stat budgets;
3. two persisted route/Contract choices before each Circuit: Standard is always
   one choice, and the other deterministically alternates between two one-debt
   fixtures. **Elite Foil** adds a content-only elite plus liability, applies a
   rational `120/100` multiplier once to each combatant's base gold in each
   `grantEligible` transaction, using the §7.3 integer round-half-up rule, and grants one
   extra Mark on the final. **Tight Clock** starts Pressure two cycles earlier,
   applies `115/100` gold the same way, and grants one extra final Mark. No
   fractional Mark or floating-point multiplier is stored, and the MVP never
   combines debts;
4. two human combatants with stable personal inventories, eight reserve slots
   each, and independent custody/reward decisions;
5. three item families: melee weapon, shield, and spell/Technique item. The
   mapped six carried positions are a hard active-slot cap: every active
   spell/Technique item occupies one even at 0 Load. The comparator is the
   authored **Approach Kit**: a 1-Load carried baseline Technique with one
   battle-local charge. Using it consumes the source combatant's scheduled
   action to move exactly one legal approach step toward a selected living
   enemy at zero stamina; it deals no damage, charges no Signature, triggers no
   effect, cannot move away, and is illegal at Pressure stack 8. It is known at
   MVP campaign creation rather than rolled as a ninth loot effect, and it pays
   Rule Load because it adds an authored action;
6. Standard, Tempered, and Inscribed random loot plus one deterministic Trophy
   source on the **third distinct `grantEligible` frontier-final settlement**
   after MVP campaign creation. The team counter increments exactly once for a
   unique `(campaignId, encounterInstanceId, finalAttemptReceiptId,
   sortedPaidFrontierRewardSetIdsHash)` whose receipt contains at least one personal paid
   final-grant fact—never once per combatant. Replay or another personal fact in
   that receipt cannot increment it, so Concede/Recovery cannot lose or advance
   the source. It unlocks the fixed **Concord Trophy** blueprint
   and creates each eligible combatant's one bound prototype directly in its
   reserved `bound-award-escrow`; later copies use the full Forge rule. Concord
   packages the exact Critical Relay and Pursuit Step base definitions into one
   melee-weapon slot for their combined 3 Load, rather than adding a ninth random
   affix. Its Trophy-only **Concord Chain** interaction supplies the reason to
   accept its burden: if armed Relay would expire on the source's immediately
   next action and that action is a legal Charge which consumes the source's
   armed Pursuit marker, Pursuit is consumed but Relay expiry is suspended
   through that Charge. Hit or miss, Relay is then legal only for the source's
   immediately following Bash; any other resolved action expires it. An illegal
   declaration mutates neither marker. Chain grants no extra action, draw, proc,
   critical, control, or re-arm.
   Separately,
   Relay occupies the melee-weapon slot and Pursuit occupies one of six carried
   spell/Technique slots; Concord frees that carried slot for the defined
   1-Load Approach Kit. Concord plus the Kit therefore uses the full four-Load
   budget; slot compression never authorizes another reward effect or a fifth
   Load point. A non-full tray receives no fictional value for that empty slot;
   the core comparator below credits Chain, and a separate six-slot-full fixture
   may measure compression. Its burden adds `ceil(25% × C)` to the final computed stamina
   cost `C` of every Bash and Charge after Relay/Pursuit surcharges. Chain plus
   slot compression are the benefits; persistent extra resource pressure is the
   disclosed cost.
   The MVP rarity cap cascades
   Legendary weight to Inscribed and defers random Legendary drops;
7. eight authored nonstacking effects: two sequence, two resource exchange,
   two defensive reaction, and two movement/targeting; no hard control, extra
   turn, team aura, or random status in the MVP;
8. ordinary 40% and fourth-fight guaranteed caches, two same-rarity candidates,
   one hunt target and one off-axis option;
9. Forge Marks, salvage, and one deterministic operation that replaces a minor
   on a Tempered or two-minor Inscribed item without changing rarity or Load;
10. sidecar v1, separate route/Mastery/opponent/reward/combat RNG, one prepared
    Circuit envelope, idempotent attempt receipts, `grantEligible` grants, and
    claims;
11. minimal doctrine/Contract preview, two personal Armory screens, reward
    choice, affix explanation, and provenance display;
12. headless 1v1/2v2/3v3 property tests, with 2v2 as the playable MVP and
    controller handoff/AI-finish coverage.

The MVP's eight-effect catalog is concrete enough to specify the headless
contract; all numbers remain tuning hypotheses `[A]`:

| Family | Effect and deterministic rule | Allowed source / occupied slot | Load / burden |
| --- | --- | --- | --- |
| Sequence | **Measured Quiver:** after Bombard misses, only the source combatant's immediately next Snipe gains 10 exact displayed percentage points, capped at 95. | Spell/Technique item; one of six carried slots. | 1; that Snipe costs one extra ammunition; any other source action expires it. |
| Sequence | **Critical Relay Grip:** a critical direct attack arms Relay for the source combatant's immediately next action. A declared Relay Bash consumes the marker, uses ordinary Bash hit chance and `ceil(min_damage / 2)`, drains ward then health while bypassing armour, and cannot critical, control, re-arm, or proc. | Melee weapon; primary or secondary weapon slot. | 2; prepay exactly twice ordinary computed Bash stamina; miss spends both marker and payment; any other source action expires it. |
| Resource exchange | **Blooded Reserve Pommel:** once per battle before Charge, the source may pay `ceil(10% × battle-start health)` current health to reduce that Charge's final computed stamina cost by `max(1, floor(50% × ordinary base Charge stamina cost))`, capped at the final cost. The health spend is a direct resource payment, not damage: it bypasses ward/armour, cannot proc, and is illegal if it would leave health below 1. Activation atomically verifies the exact active weapon, unused marker, health, and post-discount stamina before changing state; a legal activation consumes the marker whether Charge hits or misses. | Melee weapon; active primary or secondary weapon slot. | 1; once per battle, with no mutation on an illegal declaration. |
| Resource exchange | **Guarded Overdraw:** once per battle, before Bombard or Snipe, the player may gain 10 exact displayed percentage points, capped at 95. | Shield; shield equipment slot. | 1; prepay one extra ammunition and `ceil(20% × battle-start shield contribution)` current shield armour. If either is unavailable, activation is illegal. |
| Defensive reaction | **Second Wind Guard:** once per battle, armour break arms the source combatant's immediately next Rest to restore extra stamina equal to `max(1, floor(10% × battle-start stamina))`. | Shield; shield equipment slot. | 1; any other source action expires it. |
| Defensive reaction | **Breakwater Ward:** its once-per-battle marker is consumed at the first direct hit crossing from positive armour into health. If payment succeeds, cap that event's health damage at `ceil(10% × battle-start health)`. | Shield; shield equipment slot. | 2; attempt to consume `ceil(20% × battle-start stamina)` at the crossing. Insufficient stamina logs a failed trigger with no cap and no retry; discarded excess cannot proc. |
| Movement/targeting | **Stabilizer Shield:** ranged attacks gain 10 exact displayed percentage points, capped at 95. | Shield; shield equipment slot. | 2; its battle-start shield contribution becomes `floor(75% × ordinary contribution)`. |
| Movement/targeting | **Pursuit Step:** after an enemy action increases range, only the source combatant's immediately next Charge may ignore one required approach step. | Spell/Technique item; one of six carried slots. | 1; add `ceil(50% × base Charge stamina cost)` and any other source action expires it. |

Every armed sequence state persists its `sourceCombatantId`, source item/effect
ID, and arming event sequence under §4.5's source-turn rule. Each effect has its
own strongest-only stacking group, cannot trigger another effect, and is logged
on arm/expire/consume/failure. All percentage arithmetic is
integer and each row declares rounding and payment timing. The rule contract may
retune a number only by changing `ruleSet.designVersion`; replacing a mechanic
requires a new definition ID and rerunning every acceptance gate.
Weapon-hosted effects are enabled only while that exact weapon ID is active;
swap expires any marker whose source becomes inactive and never lets the
inactive weapon contribute potency.

The MVP random-offer matrix is total: Standard needs no effect; Tempered melee
uses Blooded Reserve, Tempered shield uses a Load-1 shield minor, and Tempered
spell/Technique uses a Load-1 carried minor. Inscribed melee can use Relay,
while shield and carried families have a Load-2 identity or two compatible
minors. Generation exhaustively validates every unlocked
`rarity × huntFamily` cell before route display; absence is a catalog build
error, never a runtime reroll or silent family substitution.

The first acceptance fixture is a twelve-fight, three-Circuit seeded run, but
the same generator must be able to produce a fourth Circuit without a finite
campaign-table endpoint. A headless soak must generate, complete, and durably
process at least 100 Circuits without catalog deadlock, ID collision, state growth past its declared
bounds, or a finite-table endpoint.

The MVP is intentionally a **post-cap demonstration**, not the full level-1
onboarding. Its fixture pins `careerLevel: 50`, career/chassis tier 50, and
Rule Load 4 from the first fight, so Inscribed items and the Trophy are usable.
All twenty simulated challenge tiers keep the same raw chassis/stat budget;
only doctrine, Contract, reward, and equipped behaviour may change.

MVP acceptance:

- the preferred equipped effect package changes at least four times in a
  20-challenge-tier seeded simulation, and each change improves counterfactual
  win rate by at least 5 percentage points over retaining the prior package;
- at least two build families are best in 25% of doctrine×tier cells each, and
  no package is best or within 5% of best in more than 70% of cells;
- ablating behaviour affixes and Contracts changes the optimal opening
  three-action policy in at least 25% of doctrine×tier cells;
- pre-first-action defeat remains below 5%, no opener guarantees a knockout,
  and no resource/control/movement cycle is reachable;
- 2v2 median duration is 12–24 actor-actions, 95th percentile at most 36, and
  Arena Pressure enforces the 80-action hard cap;
- in at least 80% of sampled states, each living seat has two consequential
  non-dominated legal actions;
- personal reward outcomes and opponents are identical across reload;
- item/currency conservation holds;
- rational gold/resource calculations are identical on every peer at all
  remainder boundaries; no floating-point value enters authoritative state;
- Concede/clear-only Recovery before the third paid frontier-final settlement neither
  grants nor loses the Concord source. Full vaults place both prototypes in
  reserved personal bound-award escrow. The team counter moves at most once per
  unique final-attempt receipt, regardless of personal grant-fact count.
  Concord plus the 1-Load Approach Kit uses exactly four Load. Against separate
  Relay/Pursuit/Approach at the same Load, Concord Chain must improve win rate by
  at least 5 percentage points in at least one tested doctrine×tier cell, while
  the persistent stamina burden makes the separate package lead by at least 5
  points in another; neither may dominate. Exhaustively test legal/illegal,
  paid/unpaid, hit/miss, intervening-action, swap, and replay paths so Chain can
  preserve Relay only across its one Pursuit Charge into the immediately next
  Bash;
- all eight effects generate only on their mapped source family/slot; sequence
  state remains attached to its source combatant across intervening enemy/ally
  turns, and exhaustive Relay/Breakwater/Blooded Reserve
  remainder/insufficient-resource/failure cases match the table exactly.
  Blooded Reserve changes the legal projection of the Tempered-melee cell while
  its exact active weapon is selected and cannot reduce health below 1;
- every unlocked Standard/Tempered/Inscribed × melee/shield/spell-Technique hunt
  cell produces candidate A from the frozen catalog without retry, rarity
  downgrade, or off-family substitution;
- both players receive and independently resolve personal rewards;
- controller reassignment changes neither ownership nor progression;
- crash-injected acknowledged losses and Practice battles write one attempt
  receipt and zero grant/clear; a paid win writes one attempt receipt and one
  grant; a clear-only final writes one receipt, zero grant, and one next-frontier
  transition. Concede cannot remove an earlier grant;
- rule ID, contract v2, and design version are validated/projected/hashed on
  every battle/result/product, and a mismatch prevents start or claim;
- save remains below 100 KB at the action cap with live `ack-prepared`, embedded
  pre-ack bytes, and the Rematch start snapshot;
- after all eight authored effects and the Trophy are known, the next
  would-be mechanical reward state resolves to an explicit completion/record choice,
  never a filler scalar upgrade.

Defer from the MVP:

- direct trade and team locker;
- random Legendary loot and Legendary pity;
- generalized crafting or multiple currencies;
- persistent rivals;
- procedural skills or rules;
- network transport;
- seasons, dailies, leaderboards, or auction house;
- full 3v3 presentation;
- launcher installation and original-game assets.

These exclusions preserve the core proof: a short co-op loop in which route,
opponent grammar, and behaviour loot change decisions while active numerical
power remains bounded.

---

## 15. Explicit assumptions, unresolved questions, and implementation gate

### Assumptions introduced here

- `[A]` Fifty vertical career tiers are enough to cover the intended ordinary
  arc; the exact mapping must be retuned after XP/stat/equipment curves exist.
- `[A]` Four fights are the right local co-op Circuit length.
- `[A]` Four Rule Load, the listed item costs, and the one-identity limit are
  sufficient to produce at least three viable build families.
- `[A]` The cache probabilities, `C_t` fractions, Forge costs, and pity counts
  produce healthy acquisition cadence.
- `[A]` The proposed action-count, first-action, diversity, and concentration
  thresholds are useful rejection gates.
- `[A]` Twenty-four personal reserve items and forty-eight locker items are
  usable full-design limits.
- `[A]` Arena Pressure after cycle 6 with eight stacks is late enough to preserve
  ordinary tactics and early enough to prevent stalls.
- `[A]` Per-semantic-label combat draws plus full attempt-start restoration make
  intentional-loss scouting an acceptable learning cost rather than the best
  progression-per-action policy; the adversarial gate may reject this premise.

### Unverified before implementation

- `[U]` exact vanilla XP, stat-point, shop-price, item-unlock, and champion
  curves;
- `[U]` which additional candidate combat paths will be promoted to goldens;
- `[U]` complete canonical behaviour for stamina, magicka, ammunition, spells,
  consumables, statuses, and equipment side effects;
- `[U]` tournament/campaign `fight_mode` use beyond the runtime-observed
  ordinary-arena `fight_mode = "duel"`/first-blood context;
- `[U]` whether the mapped shield/ranged interaction is confirmed in a future
  promoted golden;
- `[U]` acceptable local UI density for simultaneous 2v2/3v3 Armories;
- `[U]` actual serialized save sizes and atomic-storage mechanism;
- `[U]` balance of every proposed module and numeric threshold.

### Gate before code

Do not implement the full system directly from this document. First approve or
revise these six decisions:

1. vertical power ends at career tier 50;
2. active Rule Load caps at four;
3. one Circuit contains four fights;
4. rarity changes behaviour complexity, not chassis budget;
5. every mechanically incomplete `grantEligible` persistent combatant receives
   a personal precommitted reward outcome, while newly prepared completed slots
   are typed records and only one already prepared reward set may be
   grandfathered;
6. the first playable proof is 2v2 and uses a separate designed rule set.

After those decisions, land rule-contract v2 and its `designVersion`
validation/projection/hash tests first. Then write the `endless-v0` descriptor,
sidecar/snapshot schemas, and transition fixtures as reviewable specifications.
No `endless-v0` battle or save is valid under the current contract-v1
projection. Build the headless deterministic MVP only after those gates, before
any launcher or original-game presentation work.

## Repository references

- [Research brief](endless-progression-brief.md)
- [Progression diagnosis and reference-game sources](progression-diagnosis.md)
- [Swords & Sandals mod-scene survey](swords-and-sandals-mod-scene-survey.md)
- [SS2 battle map](../integration/ss2-battle-map.md)
- [SS2 adapter contract](../ss2-adapter-contract.md)
- [Roadmap](../roadmap.md)
- [Rule-set seam](../../src/team/rule-set.js)
