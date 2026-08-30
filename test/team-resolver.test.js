import test from "node:test";
import assert from "node:assert/strict";

import * as engine from "../src/engine.js";
import {
  acknowledgeResultAnimation,
  advanceAiTurns,
  applyAction,
  BATTLE_RESULT_ACK_TYPE,
  BATTLE_RESULT_PENDING_TYPE,
  BattleError,
  campaignSettlement,
  combatantById,
  combatStateHash,
  ControllerKind,
  controllerOf,
  createTeamBattle,
  currentCombatant,
  defineTeamRuleSet,
  describeTeamRuleSet,
  EffectKind,
  isCampaignSettled,
  legalActions,
  placeholderTeamRules,
  reassignController,
  replayTeamBattle,
  RngSequenceError,
  RuleSetVerification,
  SettlementError,
  TeamRuleSetError,
  rngJournal,
  toControllerState,
  toTeamWireState
} from "../src/team/index.js";
import * as resolver from "../src/team/resolver.js";

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

/**
 * A one-shot brute: 50 max health, 60 melee damage, 95% hit chance. Combined
 * with an explicit RNG tape this makes every knockout in these tests exact.
 */
const brute = (id, agility, overrides = {}) => ({
  id,
  name: id,
  controller: overrides.controller ?? "local",
  stats: {
    strength: 10,
    agility,
    attack: 40,
    defense: 0,
    vitality: 0,
    stamina: 5,
    magicka: 0,
    ...overrides.stats
  },
  loadout: {
    meleeDamage: 40,
    rangedDamage: 10,
    canUseRanged: false,
    canUseSpell: false,
    canHeal: false,
    ...overrides.loadout
  }
});

/** Ordered tape of `hit-roll` draws. 0 always hits, 0.99 always misses. */
const hitTape = (count, value = 0) =>
  Array.from({ length: count }, () => ({ label: "hit-roll", source: "unit", min: 0, max: 1, value }));

const melee = (actorId, targetId) => ({ actorId, type: "melee", targetId });

const ackFor = (battle) => ({
  type: BATTLE_RESULT_ACK_TYPE,
  completionToken: battle.settlement.pendingResultEvent().completionToken
});

const eventTypes = (battle) => battle.events.map((event) => event.type);

/* ------------------------------------------------------------------ */
/* One resolver for every team size                                    */
/* ------------------------------------------------------------------ */

test("the engine facade and the team seam are literally the same resolver", () => {
  assert.equal(engine.applyAction, resolver.applyAction);
  assert.equal(engine.legalActions, resolver.legalActions);
  assert.equal(engine.chooseAiAction, resolver.chooseAiAction);
  assert.equal(engine.advanceAiTurns, resolver.advanceAiTurns);
  assert.equal(engine.currentCombatant, resolver.currentCombatant);
});

test("1v1, 2v2 and 3v3 run through the same resolver and replay deterministically", () => {
  const sizes = [1, 2, 3];
  const usedRuleSets = new Set();
  for (const size of sizes) {
    const blueprint = {
      seed: 20260830 + size,
      teams: [
        {
          id: "red",
          combatants: Array.from({ length: size }, (unused, index) =>
            brute(`r${index + 1}`, 60 - index * 5, { controller: "ai" }))
        },
        {
          id: "blue",
          combatants: Array.from({ length: size }, (unused, index) =>
            brute(`b${index + 1}`, 30 - index * 5, { controller: "ai" }))
        }
      ]
    };
    const live = createTeamBattle(blueprint);
    const actions = advanceAiTurns(live, 500);
    assert.ok(live.result, `a ${size}v${size} battle must reach a result`);
    assert.ok(actions.length > 0);
    usedRuleSets.add(live.rules.id);

    const rebuilt = replayTeamBattle(blueprint, actions);
    assert.deepEqual(toTeamWireState(rebuilt), toTeamWireState(live));
    assert.equal(combatStateHash(rebuilt), combatStateHash(live));
    // Same inputs and same ordered channel => same consumed roll count.
    assert.equal(rebuilt.rngCursor, live.rngCursor);
    assert.equal(rebuilt.rngState, live.rngState);
  }
  assert.deepEqual([...usedRuleSets], [placeholderTeamRules.id]);
});

test("the resolver itself draws nothing; every roll is a labelled rule-set request", () => {
  const battle = createTeamBattle({
    seed: 11,
    teams: [
      { id: "red", combatants: [brute("r1", 40, { controller: "ai" }), brute("r2", 30, { controller: "ai" })] },
      { id: "blue", combatants: [brute("b1", 20, { controller: "ai" }), brute("b2", 10, { controller: "ai" })] }
    ]
  });
  advanceAiTurns(battle, 500);
  const journal = rngJournal(battle);
  const attacks = battle.events.filter((event) => event.type === "melee").length;
  assert.equal(journal.length, attacks);
  assert.equal(battle.rngCursor, journal.length);
  journal.forEach((entry, index) => {
    assert.equal(entry.sequence, index + 1);
    assert.equal(entry.label, "hit-roll");
    assert.equal(entry.source, "unit");
    assert.equal(entry.context.actionType, "melee");
  });
});

/* ------------------------------------------------------------------ */
/* Team elimination                                                    */
/* ------------------------------------------------------------------ */

test("a team is eliminated only when every one of its slots is down", () => {
  const battle = createTeamBattle({
    rngTape: hitTape(3),
    teams: [
      { id: "red", combatants: [brute("r1", 40), brute("r2", 30), brute("r3", 20)] },
      { id: "blue", combatants: [brute("b1", 15), brute("b2", 10), brute("b3", 5)] }
    ]
  });

  applyAction(battle, melee("r1", "b1"));
  assert.equal(combatantById(battle, "b1").alive, false);
  assert.equal(battle.result, null, "one knockout must not end a 3v3");
  assert.equal(battle.settlement.isArmed, false);

  applyAction(battle, melee("r2", "b2"));
  assert.equal(battle.result, null, "two of three down is still not elimination");
  assert.equal(battle.settlement.isArmed, false);

  applyAction(battle, melee("r3", "b3"));
  assert.deepEqual(battle.result, { winnerTeamId: "red", reason: "elimination" });
  assert.equal(battle.settlement.isArmed, true);
  assert.deepEqual(
    battle.events.filter((event) => event.type === "team-eliminated").map((event) => event.teamId),
    ["blue"]
  );
});

test("an individual knockout emits combatant-defeated and never settles the campaign", () => {
  let settlements = 0;
  const battle = createTeamBattle({
    rngTape: hitTape(1),
    onCampaignSettled: () => {
      settlements += 1;
    },
    teams: [
      { id: "red", combatants: [brute("r1", 40), brute("r2", 30)] },
      { id: "blue", combatants: [brute("b1", 20), brute("b2", 10)] }
    ]
  });

  applyAction(battle, melee("r1", "b1"));

  const defeated = battle.events.filter((event) => event.type === "defeated");
  assert.equal(defeated.length, 1);
  assert.deepEqual(
    { actorId: defeated[0].actorId, targetId: defeated[0].targetId },
    { actorId: "r1", targetId: "b1" }
  );
  assert.equal(eventTypes(battle).includes("team-eliminated"), false);
  assert.equal(eventTypes(battle).includes(BATTLE_RESULT_PENDING_TYPE), false);
  assert.equal(battle.result, null);
  assert.equal(settlements, 0);
  assert.equal(isCampaignSettled(battle), false);
  assert.equal(campaignSettlement(battle), null);
});

/* ------------------------------------------------------------------ */
/* Settlement: two gates, fires once                                   */
/* ------------------------------------------------------------------ */

function eliminatedTwoOnTwo() {
  const settled = [];
  const battle = createTeamBattle({
    rngTape: hitTape(2),
    onCampaignSettled: (record) => settled.push(record),
    teams: [
      { id: "red", combatants: [brute("r1", 40), brute("r2", 30)] },
      { id: "blue", combatants: [brute("b1", 20), brute("b2", 10)] }
    ]
  });
  applyAction(battle, melee("r1", "b1"));
  applyAction(battle, melee("r2", "b2"));
  return { battle, settled };
}

test("settlement fires exactly once, and only after elimination and acknowledgement", () => {
  const { battle, settled } = eliminatedTwoOnTwo();

  // Gate 1 passed: the team is eliminated and a pending result is armed.
  assert.deepEqual(battle.result, { winnerTeamId: "red", reason: "elimination" });
  const pending = battle.events.at(-1);
  assert.equal(pending.type, BATTLE_RESULT_PENDING_TYPE);
  assert.equal(pending.status, "pending-animation");
  assert.equal(pending.completionToken, "team-arena:red:blue:elimination");
  // Gate 2 not passed yet: nothing has settled.
  assert.equal(settled.length, 0);
  assert.equal(isCampaignSettled(battle), false);

  assert.equal(acknowledgeResultAnimation(battle, ackFor(battle)), true);
  assert.equal(settled.length, 1);
  assert.equal(isCampaignSettled(battle), true);
  assert.deepEqual(settled[0], {
    winnerTeamId: "red",
    loserTeamIds: ["blue"],
    reason: "elimination",
    completionToken: "team-arena:red:blue:elimination",
    acknowledgedToken: "team-arena:red:blue:elimination"
  });
});

test("a repeated acknowledgement cannot settle the campaign twice", () => {
  const { battle, settled } = eliminatedTwoOnTwo();
  assert.equal(acknowledgeResultAnimation(battle, ackFor(battle)), true);
  for (let repeat = 0; repeat < 5; repeat += 1) {
    assert.equal(acknowledgeResultAnimation(battle, ackFor(battle)), false);
  }
  assert.equal(settled.length, 1);
});

test("an acknowledgement before team elimination is refused", () => {
  const battle = createTeamBattle({
    rngTape: hitTape(1),
    teams: [
      { id: "red", combatants: [brute("r1", 40), brute("r2", 30)] },
      { id: "blue", combatants: [brute("b1", 20), brute("b2", 10)] }
    ]
  });
  const premature = { type: BATTLE_RESULT_ACK_TYPE, completionToken: "team-arena:red:blue:elimination" };
  assert.throws(() => acknowledgeResultAnimation(battle, premature), SettlementError);

  // One knockout is still not elimination, so the gate stays shut.
  applyAction(battle, melee("r1", "b1"));
  assert.throws(() => acknowledgeResultAnimation(battle, premature), SettlementError);
  assert.equal(isCampaignSettled(battle), false);
});

test("an acknowledgement with the wrong token or shape is refused", () => {
  const { battle, settled } = eliminatedTwoOnTwo();
  assert.throws(
    () => acknowledgeResultAnimation(battle, { type: BATTLE_RESULT_ACK_TYPE, completionToken: "team-arena:blue:red:elimination" }),
    SettlementError
  );
  assert.throws(() => acknowledgeResultAnimation(battle, { type: "something-else", completionToken: "x" }), SettlementError);
  assert.throws(() => acknowledgeResultAnimation(battle, null), SettlementError);
  assert.equal(settled.length, 0);
  assert.equal(isCampaignSettled(battle), false);
});

test("a throwing campaign callback still latches; the campaign is never paid twice", () => {
  let calls = 0;
  const battle = createTeamBattle({
    rngTape: hitTape(2),
    onCampaignSettled: () => {
      calls += 1;
      throw new Error("campaign save failed");
    },
    teams: [
      { id: "red", combatants: [brute("r1", 40), brute("r2", 30)] },
      { id: "blue", combatants: [brute("b1", 20), brute("b2", 10)] }
    ]
  });
  applyAction(battle, melee("r1", "b1"));
  applyAction(battle, melee("r2", "b2"));

  assert.throws(() => acknowledgeResultAnimation(battle, ackFor(battle)), /campaign save failed/);
  assert.equal(calls, 1);
  assert.equal(isCampaignSettled(battle), true);
  assert.equal(acknowledgeResultAnimation(battle, ackFor(battle)), false);
  assert.equal(calls, 1);
});

test("a settled battle cannot be re-armed with a different result", () => {
  const { battle } = eliminatedTwoOnTwo();
  acknowledgeResultAnimation(battle, ackFor(battle));
  assert.throws(
    () => battle.settlement.arm({ winnerTeamId: "blue", loserTeamIds: ["red"], reason: "elimination" }),
    SettlementError
  );
});

/* ------------------------------------------------------------------ */
/* AI fill                                                             */
/* ------------------------------------------------------------------ */

test("AI fill occupies empty slots through the ordinary combatant path", () => {
  const battle = createTeamBattle({
    seed: 3,
    teams: [
      { id: "red", slots: 3, combatants: [brute("r1", 40), brute("r2", 30)] },
      { id: "blue", slots: 3, combatants: [brute("b1", 20, { controller: "ai" }), null, { fill: "ai" }] }
    ]
  });

  assert.equal(battle.teams[0].combatants.length, 3);
  assert.equal(battle.teams[1].combatants.length, 3);
  assert.deepEqual(battle.teams[0].slots.map((slot) => slot.aiFilled), [false, false, true]);
  assert.deepEqual(battle.teams[1].slots.map((slot) => slot.aiFilled), [false, true, true]);

  const supplied = battle.teams[0].combatants[0];
  const filled = battle.teams[0].combatants[2];
  // Identical shape: an AI-filled fighter is not a special kind of combatant.
  assert.deepEqual(Object.keys(supplied).sort(), Object.keys(filled).sort());
  assert.equal(controllerOf(battle, filled.id).kind, ControllerKind.AI);
  assert.equal(controllerOf(battle, supplied.id).kind, ControllerKind.LOCAL);
  assert.ok(battle.initiative.includes(filled.id));
  assert.ok(legalActions(battle, filled.id).length > 0);

  // It takes its own turn through the same resolver, not a side loop.
  applyAction(battle, melee("r1", "b1"));
  applyAction(battle, melee("r2", "blue-fill-2"));
  const taken = advanceAiTurns(battle, 500);
  assert.ok(
    taken.some((action) => action.actorId === filled.id),
    "the AI-filled slot acts through advanceAiTurns like any other AI seat"
  );
});

test("AI fill is pure: it never consumes the ordered RNG channel", () => {
  const withFill = createTeamBattle({
    seed: 9,
    teams: [
      { id: "red", slots: 3, combatants: [brute("r1", 40)] },
      { id: "blue", slots: 3, combatants: [brute("b1", 20)] }
    ]
  });
  const withoutFill = createTeamBattle({
    seed: 9,
    teams: [
      { id: "red", combatants: [brute("r1", 40)] },
      { id: "blue", combatants: [brute("b1", 20)] }
    ]
  });
  assert.equal(withFill.rngCursor, 0);
  assert.equal(withoutFill.rngCursor, 0);
  assert.equal(withFill.rngState, withoutFill.rngState);

  // The fill is deterministic, so two identical blueprints agree exactly.
  const twin = createTeamBattle({
    seed: 9,
    teams: [
      { id: "red", slots: 3, combatants: [brute("r1", 40)] },
      { id: "blue", slots: 3, combatants: [brute("b1", 20)] }
    ]
  });
  assert.equal(combatStateHash(twin), combatStateHash(withFill));
});

/* ------------------------------------------------------------------ */
/* Controller identity vs combatant identity                           */
/* ------------------------------------------------------------------ */

test("one team can mix local, hot-seat, remote and AI controllers", () => {
  const battle = createTeamBattle({
    seed: 5,
    teams: [
      {
        id: "red",
        slots: 3,
        combatants: [
          brute("r1", 40, { controller: "local" }),
          brute("r2", 30, { controller: "hot-seat:pad-2" }),
          null
        ]
      },
      { id: "blue", combatants: [brute("b1", 20, { controller: "peer-7f" })] }
    ]
  });
  assert.deepEqual(
    battle.teams[0].combatants.map((combatant) => controllerOf(battle, combatant.id).kind),
    [ControllerKind.LOCAL, ControllerKind.HOT_SEAT, ControllerKind.AI]
  );
  assert.equal(controllerOf(battle, "b1").kind, ControllerKind.REMOTE);
  assert.equal(controllerOf(battle, "b1").id, "peer-7f");
});

test("controller identity can be reassigned without touching combatant state or the combat hash", () => {
  const battle = createTeamBattle({
    rngTape: hitTape(4),
    teams: [
      { id: "red", combatants: [brute("r1", 40, { controller: "peer-7f" }), brute("r2", 30)] },
      { id: "blue", combatants: [brute("b1", 20), brute("b2", 10)] }
    ]
  });
  applyAction(battle, melee("r1", "b1"));

  const combatBefore = toTeamWireState(battle);
  const hashBefore = combatStateHash(battle);
  const seatId = combatantById(battle, "r1").seatId;

  reassignController(battle, seatId, { kind: ControllerKind.LOCAL, id: "local", label: "Player One" });

  assert.deepEqual(toTeamWireState(battle), combatBefore);
  assert.equal(combatStateHash(battle), hashBefore);
  assert.equal(controllerOf(battle, "r1").kind, ControllerKind.LOCAL);
  assert.equal(controllerOf(battle, "r1").label, "Player One");
  // Only the seat -> controller projection moved.
  assert.notDeepEqual(
    toControllerState(battle).find((entry) => entry.seatId === seatId),
    { seatId, kind: ControllerKind.REMOTE, id: "peer-7f", label: "peer-7f" }
  );
});

test("the AI loop follows the seat, not the combatant", () => {
  const battle = createTeamBattle({
    seed: 4,
    teams: [
      { id: "red", combatants: [brute("r1", 40, { controller: "local" })] },
      { id: "blue", combatants: [brute("b1", 20, { controller: "ai" })] }
    ]
  });
  assert.equal(currentCombatant(battle).id, "r1");
  assert.deepEqual(advanceAiTurns(battle), [], "a local seat must stop the AI loop");

  reassignController(battle, combatantById(battle, "r1").seatId, ControllerKind.AI);
  const taken = advanceAiTurns(battle, 500);
  assert.ok(taken.length > 0, "the same combatant is now AI-driven with no combatant change");
  assert.equal(taken[0].actorId, "r1");
});

test("the legacy engine hash still binds the controller string; the combat hash does not", () => {
  const blueprint = {
    seed: 8,
    teams: [
      { id: "red", combatants: [brute("r1", 40, { controller: "peer-7f" })] },
      { id: "blue", combatants: [brute("b1", 20, { controller: "ai" })] }
    ]
  };
  const battle = engine.createBattle(blueprint);
  const legacyBefore = engine.stateHash(battle);
  const combatBefore = combatStateHash(battle);

  reassignController(battle, combatantById(battle, "r1").seatId, "local");

  assert.equal(combatStateHash(battle), combatBefore);
  assert.notEqual(engine.stateHash(battle), legacyBefore);
  assert.equal(engine.toWireState(battle).teams[0].combatants[0].controller, "local");
});

/* ------------------------------------------------------------------ */
/* The rule-set seam                                                   */
/* ------------------------------------------------------------------ */

test("the placeholder rule set is labelled a placeholder, in code", () => {
  const descriptor = describeTeamRuleSet(placeholderTeamRules);
  assert.equal(descriptor.verification, RuleSetVerification.PLACEHOLDER);
  assert.equal(descriptor.runtimeVerified, false);
  assert.deepEqual(descriptor.goldenFixtureIds, []);
  assert.equal(descriptor.buildSha256, null);
  assert.match(descriptor.note, /not measured against the licensed SS2 build/i);

  const battle = createTeamBattle({
    teams: [{ id: "red", combatants: [brute("r1", 40)] }, { id: "blue", combatants: [brute("b1", 20)] }]
  });
  assert.equal(toTeamWireState(battle).rules.runtimeVerified, false);
  assert.equal(toTeamWireState(battle).rules.verification, RuleSetVerification.PLACEHOLDER);
});

test("a rule set cannot claim runtime verification without golden provenance", () => {
  const base = {
    id: "pretend-verified",
    actionTypes: ["strike"],
    maximumHealth: () => 10,
    legalActions: () => [],
    resolveAction: () => ({ effects: [], events: [] }),
    chooseAiAction: () => null
  };
  assert.throws(
    () => defineTeamRuleSet({
      ...base,
      verification: RuleSetVerification.RUNTIME_VERIFIED,
      provenance: { runtimeVerified: true, note: "trust me" }
    }),
    TeamRuleSetError
  );
  assert.throws(
    () => defineTeamRuleSet({
      ...base,
      verification: RuleSetVerification.RUNTIME_VERIFIED,
      provenance: { runtimeVerified: false, note: "n", buildSha256: "a".repeat(64), goldenFixtureIds: ["g"] }
    }),
    TeamRuleSetError
  );
  assert.throws(
    () => defineTeamRuleSet({
      ...base,
      verification: RuleSetVerification.PLACEHOLDER,
      provenance: { runtimeVerified: false, note: "n", goldenFixtureIds: ["golden-prisoner-normal-kill-dir6"] }
    }),
    TeamRuleSetError,
    "a placeholder must not cite goldens"
  );

  const accepted = defineTeamRuleSet({
    ...base,
    verification: RuleSetVerification.RUNTIME_VERIFIED,
    provenance: {
      kind: "licensed-observation",
      runtimeVerified: true,
      note: "Backed by promoted goldens.",
      buildSha256: "77CB545C2061AB41246251467A4EDF5926AB6FD1DDD95DC9527D7BA9C45BB8CA",
      goldenFixtureIds: ["golden-prisoner-normal-kill-dir6"]
    }
  });
  assert.equal(describeTeamRuleSet(accepted).runtimeVerified, true);
});

test("an alternate rule set with its own vocabulary drives the same resolver unchanged", () => {
  // Stands in for a promoted SS2 rule set: different action names, different
  // roll labels, different maths. No resolver, roster, controller,
  // elimination, or settlement code changes to accept it.
  const alternate = defineTeamRuleSet({
    id: "test-alternate-vocabulary",
    verification: RuleSetVerification.PLACEHOLDER,
    provenance: { kind: "test-double", runtimeVerified: false, note: "Test double. Not SS2 behaviour." },
    actionTypes: ["cleave"],
    maximumHealth: () => 30,
    legalActions: (view) => view.foes.map((foe) => ({ type: "cleave", targetId: foe.id })),
    resolveAction: (request, rolls) => {
      const swing = rolls.randomBetween("cleave-swing", 1, 6);
      return {
        effects: [{ kind: EffectKind.DAMAGE, targetId: request.targetId, amount: swing * 5 }],
        events: [{ type: "cleave", actorId: request.actorId, targetId: request.targetId, swing }]
      };
    },
    chooseAiAction: (view, actorId, options) => options[0]
  });

  const blueprint = {
    seed: 77,
    rules: alternate,
    teams: [
      { id: "red", slots: 3, combatants: [brute("r1", 40, { controller: "ai" })] },
      { id: "blue", slots: 3, combatants: [brute("b1", 20, { controller: "ai" })] }
    ]
  };
  const live = createTeamBattle(blueprint);
  const actions = advanceAiTurns(live, 500);
  assert.ok(live.result);
  assert.equal(live.rules.id, "test-alternate-vocabulary");
  assert.equal(eventTypes(live).includes("cleave"), true);
  assert.equal(eventTypes(live).includes(BATTLE_RESULT_PENDING_TYPE), true);
  assert.equal(combatantById(live, "r1").maxHealth, 30);
  assert.equal(rngJournal(live).every((entry) => entry.label === "cleave-swing"), true);

  const rebuilt = replayTeamBattle(blueprint, actions);
  assert.equal(combatStateHash(rebuilt), combatStateHash(live));

  // A 3v3 of the same rule set settles once, behind the same two gates.
  let settlements = 0;
  const bigger = createTeamBattle({
    ...blueprint,
    seed: 78,
    onCampaignSettled: () => {
      settlements += 1;
    }
  });
  advanceAiTurns(bigger, 500);
  assert.equal(settlements, 0);
  assert.equal(acknowledgeResultAnimation(bigger, ackFor(bigger)), true);
  assert.equal(acknowledgeResultAnimation(bigger, ackFor(bigger)), false);
  assert.equal(settlements, 1);
});

test("the resolver rejects malformed rule-set output", () => {
  const makeRules = (resolveAction) => defineTeamRuleSet({
    id: "test-malformed",
    verification: RuleSetVerification.PLACEHOLDER,
    provenance: { kind: "test-double", runtimeVerified: false, note: "Test double." },
    actionTypes: ["poke"],
    maximumHealth: () => 20,
    legalActions: (view) => view.foes.map((foe) => ({ type: "poke", targetId: foe.id })),
    resolveAction,
    chooseAiAction: (view, actorId, options) => options[0]
  });
  const start = (resolveAction) => createTeamBattle({
    rules: makeRules(resolveAction),
    teams: [{ id: "red", combatants: [brute("r1", 40)] }, { id: "blue", combatants: [brute("b1", 20)] }]
  });

  assert.throws(
    () => applyAction(start(() => ({ effects: [{ kind: "damage", targetId: "nobody", amount: 1 }], events: [] })),
      { actorId: "r1", type: "poke", targetId: "b1" }),
    BattleError
  );
  assert.throws(
    () => applyAction(start(() => ({ effects: [], events: [{ type: "poke", sequence: 1 }] })),
      { actorId: "r1", type: "poke", targetId: "b1" }),
    TeamRuleSetError
  );
  assert.throws(
    () => applyAction(start(() => ({ effects: [{ kind: "damage", targetId: "b1", amount: -3 }], events: [] })),
      { actorId: "r1", type: "poke", targetId: "b1" }),
    TeamRuleSetError
  );
  assert.throws(
    () => applyAction(start(() => null), { actorId: "r1", type: "poke", targetId: "b1" }),
    TeamRuleSetError
  );
});

test("createTeamBattle refuses anything that is not a rule set", () => {
  const teams = [{ id: "red", combatants: [brute("r1", 40)] }, { id: "blue", combatants: [brute("b1", 20)] }];
  assert.throws(() => createTeamBattle({ teams, rules: {} }), TeamRuleSetError);
  assert.throws(() => createTeamBattle({ teams, rules: engine.classicStyleRules }), TeamRuleSetError);
  // The engine facade wraps the historical bare formula object for callers.
  assert.equal(engine.createBattle({ teams, rules: engine.classicStyleRules }).rules.id, placeholderTeamRules.id);
});

/* ------------------------------------------------------------------ */
/* The ordered RNG channel                                             */
/* ------------------------------------------------------------------ */

test("a tape-backed channel enforces label, source and bound order", () => {
  const teams = [
    { id: "red", combatants: [brute("r1", 40)] },
    { id: "blue", combatants: [brute("b1", 20)] }
  ];
  const wrongLabel = createTeamBattle({
    teams,
    rngTape: [{ label: "not-the-hit-roll", source: "unit", min: 0, max: 1, value: 0 }]
  });
  assert.throws(() => applyAction(wrongLabel, melee("r1", "b1")), RngSequenceError);

  const wrongSource = createTeamBattle({
    teams,
    rngTape: [{ label: "hit-roll", source: "randomBetween", min: 0, max: 1, value: 0 }]
  });
  assert.throws(() => applyAction(wrongSource, melee("r1", "b1")), RngSequenceError);

  const exhausted = createTeamBattle({ teams, rngTape: [] });
  assert.throws(() => applyAction(exhausted, melee("r1", "b1")), /No RNG sample remains/);
});

test("a miss recorded on the tape reproduces exactly", () => {
  const teams = [
    { id: "red", combatants: [brute("r1", 40)] },
    { id: "blue", combatants: [brute("b1", 20)] }
  ];
  const battle = createTeamBattle({ teams, rngTape: [...hitTape(1, 0.99), ...hitTape(1, 0)] });
  applyAction(battle, melee("r1", "b1"));
  assert.equal(battle.events[0].hit, false);
  assert.equal(combatantById(battle, "b1").health, 50);
  applyAction(battle, melee("b1", "r1"));
  assert.equal(battle.events[1].hit, true);
  assert.equal(battle.result.winnerTeamId, "blue");
});

/* ------------------------------------------------------------------ */
/* Legacy projection guard                                             */
/* ------------------------------------------------------------------ */

test("the legacy engine wire projection keeps its exact historical shape", () => {
  const battle = engine.createBattle({
    seed: 1,
    teams: [
      { id: "red", combatants: [brute("r1", 40, { controller: "client-red" })] },
      { id: "blue", combatants: [brute("b1", 20, { controller: "ai" })] }
    ]
  });
  const wire = engine.toWireState(battle);
  assert.deepEqual(Object.keys(wire), [
    "version", "seed", "rngState", "teams", "initiative", "turnCursor", "turnNumber", "result", "events"
  ]);
  assert.deepEqual(Object.keys(wire.teams[0]), ["id", "name", "combatants"]);
  assert.deepEqual(Object.keys(wire.teams[0].combatants[0]), [
    "id", "name", "teamId", "controller", "stats", "loadout", "maxHealth", "health", "alive", "status"
  ]);
  assert.equal(wire.teams[0].combatants[0].controller, "client-red");
  assert.equal(typeof engine.stateHash(battle), "string");
  assert.equal(engine.stateHash(battle).length, 8);
});
