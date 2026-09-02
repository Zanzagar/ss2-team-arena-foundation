/**
 * The `map-derived` verification tier.
 *
 * WHY THE TIER EXISTS. SS2's real arithmetic was read out of the licensed
 * build's bytecode and is partly checked against promoted goldens. With only
 * `placeholder` and `runtime-verified` it fitted neither: the first understates
 * evidence read from the build, the second is a lie about what was observed.
 * So the honest move was to write nothing, and nothing was written — 22 goldens
 * sat unused while the resolver ran invented formulas. The tier removes that
 * dilemma, and these tests exist so it cannot become a way to launder guesswork.
 *
 * WHY THIS FILE EXISTS AT ALL. Measured while adding the tier: adding a value
 * to `RuleSetVerification` and a branch to its validator leaves the whole suite
 * byte-identically green. Zero existing tests pin the enum's membership, so a
 * third tier is accepted silently everywhere — including by
 * `src/campaign/record.js`, which mirrors the enum BY HAND and would otherwise
 * have thrown at settlement, after a fight was fought.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  defineTeamRuleSet,
  describeTeamRuleSet,
  isRuntimeVerified,
  RuleSetVerification,
  TeamRuleSetError,
  EffectKind,
  createTeamBattle,
  applyAction,
  legalActions,
  currentCombatant,
  pendingResultEvent,
  acknowledgeResultAnimation,
  BATTLE_RESULT_ACK_TYPE
} from "../src/team/index.js";
import { buildCampaignRecord, RecordedRuleSetVerification } from "../src/campaign/index.js";

/** The build these rules were derived from — the SS2 SWF pinned by the fingerprint. */
const BUILD = "77CB545C2061AB41246251467A4EDF5926AB6FD1DDD95DC9527D7BA9C45BB8CA";

function mapDerivedProvenance(overrides = {}) {
  return {
    runtimeVerified: false,
    buildSha256: BUILD,
    mapSourceRefs: ["overlay:862/frame:52/DoAction@0x240c7f/checkattackroll"],
    goldenFixtureIds: ["golden-prisoner-normal-kill"],
    note: "Derived from the battle map; partial golden backing.",
    ...overrides
  };
}

/** A minimal but legal rule set at the given tier. */
function ruleSetWith(provenance, verification = RuleSetVerification.MAP_DERIVED) {
  return defineTeamRuleSet({
    id: "test-map-derived",
    verification,
    provenance,
    actionTypes: ["strike"],
    maximumHealth: (combatant) => combatant.maxHealth ?? 30,
    legalActions: (view) => view.foes.map((foe) => ({ type: "strike", targetId: foe.id })),
    resolveAction: (request, rolls) => ({
      effects: [{
        kind: EffectKind.DAMAGE,
        targetId: request.targetId,
        amount: rolls.randomBetween("strike", 5, 5)
      }],
      events: [{ type: "strike", actorId: request.actorId, targetId: request.targetId }]
    }),
    chooseAiAction: (view, actorId, options) => options[0]
  });
}

/* ------------------------------------------------------------------ */
/* The tier is accepted, and reports itself honestly                   */
/* ------------------------------------------------------------------ */

test("a map-derived rule set is legal, and never claims to be runtime-verified", () => {
  const rules = ruleSetWith(mapDerivedProvenance());
  assert.equal(rules.verification, "map-derived");
  // The load-bearing assertion: the tier is stronger than placeholder in what
  // it may cite, and strictly weaker in what it may CLAIM.
  assert.equal(isRuntimeVerified(rules), false,
    "map-derived is not runtime-verified, whatever evidence it cites");
  const described = describeTeamRuleSet(rules);
  assert.equal(described.runtimeVerified, false);
  assert.deepEqual(described.goldenFixtureIds, ["golden-prisoner-normal-kill"]);
  assert.deepEqual(described.mapSourceRefs,
    ["overlay:862/frame:52/DoAction@0x240c7f/checkattackroll"],
    "the descriptor must surface the map citation, or the tier's evidence is invisible");
});

/* ------------------------------------------------------------------ */
/* Each requirement is what stops the tier laundering guesswork        */
/* ------------------------------------------------------------------ */

test("a map-derived rule set cannot declare runtimeVerified: true", () => {
  assert.throws(
    () => ruleSetWith(mapDerivedProvenance({ runtimeVerified: true })),
    (error) => error instanceof TeamRuleSetError && /must declare runtimeVerified: false/.test(error.message)
  );
});

test("a map-derived rule set must pin the build it was derived from", () => {
  for (const bad of [undefined, "", "not-a-hash", BUILD.slice(0, 63)]) {
    assert.throws(
      () => ruleSetWith(mapDerivedProvenance({ buildSha256: bad })),
      (error) => error instanceof TeamRuleSetError && /pin the licensed build SHA-256/.test(error.message),
      `buildSha256 ${JSON.stringify(bad)} must be refused`
    );
  }
});

test("a map-derived rule set must cite at least one battle-map section", () => {
  for (const bad of [undefined, [], "not-an-array", [""], [123]]) {
    assert.throws(
      () => ruleSetWith(mapDerivedProvenance({ mapSourceRefs: bad })),
      (error) => error instanceof TeamRuleSetError && /mapSourceRefs/.test(error.message),
      `mapSourceRefs ${JSON.stringify(bad)} must be refused`
    );
  }
});

test("a map-derived rule set must cite at least one promoted golden", () => {
  // Without this, "partial golden backing" is an unenforced *may*, and an
  // unenforced may becomes an is-not — leaving the tier as a nicer word for
  // placeholder.
  for (const bad of [undefined, [], ["NOT A TOKEN"]]) {
    assert.throws(
      () => ruleSetWith(mapDerivedProvenance({ goldenFixtureIds: bad })),
      (error) => error instanceof TeamRuleSetError && /goldenFixtureIds/.test(error.message),
      `goldenFixtureIds ${JSON.stringify(bad)} must be refused`
    );
  }
});

/* ------------------------------------------------------------------ */
/* The latent defect this change also fixed                            */
/* ------------------------------------------------------------------ */

test("a placeholder rule set may not pin a build hash, matching the record layer", () => {
  // src/team/rule-set.js and src/campaign/record.js are documented as mirrors
  // and were not: record.js refused a placeholder carrying a build hash while
  // rule-set.js allowed one, so such a rule set was constructible and its
  // battles were unrecordable at settlement — after a fight had been fought.
  assert.throws(
    () => ruleSetWith(
      { runtimeVerified: false, buildSha256: BUILD, note: "placeholder pinning a hash" },
      RuleSetVerification.PLACEHOLDER
    ),
    (error) => error instanceof TeamRuleSetError && /must not pin a build SHA-256/.test(error.message)
  );
});

/* ------------------------------------------------------------------ */
/* The break that no existing test would have caught                   */
/* ------------------------------------------------------------------ */

test("a battle fought under a map-derived rule set can still be RECORDED", () => {
  // THE REGRESSION TEST FOR THIS WHOLE CHANGE. `RecordedRuleSetVerification`
  // mirrors the team enum by hand, so a tier added in one file and not the
  // other throws only at settlement — i.e. after a real fight, in the one code
  // path no unit test was covering. Measured before the fix: the full suite
  // stayed green while this path threw.
  const rules = ruleSetWith(mapDerivedProvenance());
  const battle = createTeamBattle({
    seed: 5,
    rules,
    teams: [
      { id: "red", combatants: [{ id: "r1", name: "R1", controller: "local", maxHealth: 10, health: 10 }] },
      { id: "blue", combatants: [{ id: "b1", name: "B1", controller: "local", maxHealth: 10, health: 10 }] }
    ]
  });

  for (let guard = 0; guard < 40 && battle.result === null; guard += 1) {
    const actor = currentCombatant(battle);
    if (!actor) break;
    const [option] = legalActions(battle, actor.id);
    if (!option) break;
    applyAction(battle, { actorId: actor.id, ...option });
  }
  assert.ok(battle.result, "the fight must reach a result for settlement to arm");

  const pending = pendingResultEvent(battle);
  acknowledgeResultAnimation(battle, {
    type: BATTLE_RESULT_ACK_TYPE,
    completionToken: pending.completionToken
  });

  const record = buildCampaignRecord(battle, { battleId: "camp-map-derived", recordedAt: "2026-09-01T00:00:00.000Z" });
  assert.equal(record.provenance.ruleSet.verification, RecordedRuleSetVerification.MAP_DERIVED);
  assert.equal(record.provenance.ruleSet.runtimeVerified, false);
  assert.equal(record.provenance.ruleSet.buildSha256, BUILD);
  assert.deepEqual(record.provenance.ruleSet.goldenFixtureIds, ["golden-prisoner-normal-kill"]);
});

test("the recorded tier list mirrors the team tier list, so neither can drift alone", () => {
  // The drift itself is the defect: these two enums are documented as mirrors,
  // are maintained by hand, and a value present in one and absent from the
  // other is only discovered at settlement.
  for (const value of Object.values(RuleSetVerification)) {
    assert.ok(
      Object.values(RecordedRuleSetVerification).includes(value),
      `RecordedRuleSetVerification is missing "${value}" — a battle under it would be unrecordable`
    );
  }
});
